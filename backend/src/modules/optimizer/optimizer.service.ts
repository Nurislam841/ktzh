import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LocomotiveStatus, TrainRunStatus, TrainPriority } from '@prisma/client';

export interface AssignmentResult {
    locomotiveId: string;
    locomotiveSeries?: string;
    trainRunId: string;
    trainNumber?: string;
    dwellTimeMinutes: number;
    savedHours?: number; 
    recommendationType: 'ASSIGN' | 'RESERVE_MOVE';
    recommendationMessage: string;
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

        // Fetch pending train runs departing from this station with train details
        const pendingRuns = await this.prisma.trainRun.findMany({
            where: {
                originStationId: stationId,
                status: TrainRunStatus.PLANNED,
            },
            include: { train: true },
            orderBy: { scheduledDeparture: 'asc' }
        });

        const assignments: AssignmentResult[] = [];
        const usedLocos = new Set<string>();

        // Average wait time threshold for domino effect (20 hours)
        const DOMINO_WAIT_THRESHOLD_MS = 20 * 60 * 60 * 1000;
        // Average wait time to compare against for "saved hours" metrics (12 hours)
        const AVG_WAIT_MS = 12 * 60 * 60 * 1000;

        for (const run of pendingRuns) {
            if (!run.scheduledDeparture) continue;

            const runDepartureTime = run.scheduledDeparture.getTime();
            const trainWeightApprox = run.train?.priority === TrainPriority.FREIGHT ? 6000 : 1000;

            let bestLoco = null;
            let minDwellTimeMsg = Infinity;

            for (const loco of locomotives) {
                if (usedLocos.has(loco.id)) continue;

                // 1. Hard Filtering
                // Geography: Already filtered by `locationStationId`.
                
                // Hardware: Passenger locos (like ТЭП70, KZ4A) should not haul heavy freight.
                const isPassengerLoco = ['ТЭП70', 'KZ4A', 'ЭП20'].includes(loco.series.toUpperCase());
                if (trainWeightApprox > 5000 && isPassengerLoco) {
                    continue; // Engine too weak / wrong type
                }
                
                const isFreightLoco = ['ВЛ80', 'KZ8A', '2ТЭ10M', 'ТЭ33А'].includes(loco.series.toUpperCase());
                if (run.train?.priority === TrainPriority.PASSENGER && isFreightLoco) {
                    continue; // Freight engine on passenger run
                }

                // Maintenance Time: Loco must sit for mandatory maintenance (e.g. 2 hours)
                const mandatoryMaintenanceMs = 2 * 60 * 60 * 1000;
                const locoReadyTime = loco.availableFrom.getTime() + mandatoryMaintenanceMs;

                // 2. Minimum Delta Search
                const deltaMs = runDepartureTime - locoReadyTime;

                // Delta must be > 0 (Locomotive is ready before train departs)
                if (deltaMs > 0 && deltaMs < minDwellTimeMsg) {
                    bestLoco = loco;
                    minDwellTimeMsg = deltaMs;
                }
            }

            if (bestLoco) {
                usedLocos.add(bestLoco.id);
                
                const dwellMins = minDwellTimeMsg / (1000 * 60);
                const savedHrs = Math.max(0, (AVG_WAIT_MS - minDwellTimeMsg) / (1000 * 60 * 60));

                assignments.push({
                    locomotiveId: bestLoco.id,
                    locomotiveSeries: bestLoco.series,
                    trainRunId: run.id,
                    trainNumber: run.train?.number || 'Unknown',
                    dwellTimeMinutes: dwellMins,
                    savedHours: parseFloat(savedHrs.toFixed(1)),
                    recommendationType: 'ASSIGN',
                    recommendationMessage: `Система предлагает привязать локомотив ${bestLoco.series} №${bestLoco.number} к поезду №${run.train?.number || 'Неизвестно'}. Простой составит ${Math.round(dwellMins/60)}ч ${Math.round(dwellMins%60)}мин вместо средних 12 часов.`
                });
            }
        }

        // 3. Domino Effect
        // If there are locomotives left that have been waiting > 20 hours and no trains are pending 
        // that they can be assigned to, suggest sending them light to another station.
        for (const loco of locomotives) {
            if (usedLocos.has(loco.id)) continue;
            
            const now = Date.now();
            const locoReadyTime = loco.availableFrom.getTime() + (2 * 60 * 60 * 1000);
            
            if (now - locoReadyTime > DOMINO_WAIT_THRESHOLD_MS) {
                 assignments.push({
                    locomotiveId: loco.id,
                    locomotiveSeries: loco.series,
                    trainRunId: 'RESERVE',
                    dwellTimeMinutes: Math.round((now - locoReadyTime) / (1000 * 60)),
                    recommendationType: 'RESERVE_MOVE',
                    recommendationMessage: `Локомотив ${loco.series} №${loco.number} простаивает более 20 часов. Математически выгоднее завершить простой и отправить его резервом на соседнюю станцию.`
                });
                usedLocos.add(loco.id);
            }
        }

        this.logger.log(`Optimizer assigned ${assignments.length} locomotives.`);
        return assignments;
    }

    async approveAssignment(data: { locomotiveId: string, trainRunId: string, recommendationType: string }) {
        this.logger.log(`Approving assignment: Loco=${data.locomotiveId}, TrainRun=${data.trainRunId}, Type=${data.recommendationType}`);
        
        if (data.recommendationType === 'RESERVE_MOVE') {
             await this.prisma.locomotive.update({
                 where: { id: data.locomotiveId },
                 data: { 
                     status: LocomotiveStatus.IN_TRANSIT,
                     locationStationId: null 
                 }
             });
             return { success: true, message: 'Локомотив отправлен резервом.' };
        }

        // ASSIGN
        await this.prisma.$transaction([
            this.prisma.locomotive.update({
                where: { id: data.locomotiveId },
                data: { status: LocomotiveStatus.ASSIGNED }
            }),
            this.prisma.trainRun.update({
                where: { id: data.trainRunId },
                data: { status: TrainRunStatus.LOCO_ASSIGNED }
            })
        ]);
        
        return { success: true, message: 'Локомотив успешно привязан к поезду.' };
    }
}
