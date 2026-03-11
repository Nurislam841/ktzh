import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LocomotiveStatus, TrainRunStatus } from '@prisma/client';

export interface AssignmentResult {
    locomotiveId: string;
    trainRunId: string;
    dwellTimeMinutes: number;
}

@Injectable()
export class OptimizerService {
    private readonly logger = new Logger(OptimizerService.name);

    constructor(private prisma: PrismaService) { }

    /**
     * Solves the Locomotive Assignment Problem (LAP) heuristically for a given station.
     * Objective: Minimize total dwell time (departure - available time).
     */
    async solveAssignment(stationId: string): Promise<AssignmentResult[]> {
        this.logger.log(`Running LAP Optimizer for station ${stationId}`);

        // Fetch available locomotives at this station
        const locomotives = await this.prisma.locomotive.findMany({
            where: {
                status: LocomotiveStatus.AVAILABLE,
                locationStationId: stationId
            },
            // Assume we use availableFrom as the time it became available.
            orderBy: { availableFrom: 'asc' }
        });

        // Fetch pending train runs departing from this station
        const pendingRuns = await this.prisma.trainRun.findMany({
            where: {
                originStationId: stationId,
                status: TrainRunStatus.PLANNED,
            },
            orderBy: { scheduledDeparture: 'asc' }
        });

        const assignments: AssignmentResult[] = [];
        const usedLocos = new Set<string>();

        for (const run of pendingRuns) {
            if (!run.scheduledDeparture) continue;

            // Find the locomotive that has been waiting the longest and is compatible
            // In this heuristic, we pick the first available loco that satisfies timing constraints.
            const runDepartureTime = run.scheduledDeparture.getTime();

            let bestLoco = null;
            let minDwellTime = Infinity;

            for (const loco of locomotives) {
                if (usedLocos.has(loco.id)) continue;

                const locoAvailableTime = loco.availableFrom.getTime();

                // Loco must be available before the train departs (allowing e.g. 1 hour coupling buffer)
                const couplingBufferMs = 60 * 60 * 1000;
                if (locoAvailableTime + couplingBufferMs <= runDepartureTime) {
                    const dwellTimeMins = (runDepartureTime - locoAvailableTime) / (1000 * 60);

                    // Standard heuristic: pick the locomotive that has waited the longest,
                    // Since array is sorted by updatedAt ASC, the first valid one is the one waiting longest.
                    // This minimizes max dwell time. Alternatively, we could minimize total dwell time.
                    bestLoco = loco;
                    minDwellTime = dwellTimeMins;
                    break; // remove break if we want best match instead of greedy longest-waiting
                }
            }

            if (bestLoco) {
                usedLocos.add(bestLoco.id);
                assignments.push({
                    locomotiveId: bestLoco.id,
                    trainRunId: run.id,
                    dwellTimeMinutes: minDwellTime
                });

                // Optionally, we could automatically assign it in the DB here:
                // await this.prisma.locomotive.update({ ... status: ASSIGNED });
                // await this.prisma.trainRun.update({ ... locoId: bestLoco.id });
            }
        }

        this.logger.log(`Optimizer assigned ${assignments.length} locomotives.`);
        return assignments;
    }
}
