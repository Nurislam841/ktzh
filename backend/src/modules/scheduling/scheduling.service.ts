import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { GreedySolver } from './greedy-solver';
import { SolverInput, SolverOutput } from './solver.interface';
import { Prisma } from '@prisma/client';

@Injectable()
export class SchedulingService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly solver: GreedySolver,
    ) { }

    async runRescheduler(
        stationId: string,
        reason: string,
        baseVersionId: string | null,
    ): Promise<{ versionId: string; summary: string[] }> {
        const now = new Date();
        const planningTo = new Date(now.getTime() + 6 * 60 * 60_000);

        // Load all resources
        const [tracks, locomotives, crews, trainRuns] = await Promise.all([
            this.prisma.track.findMany({ where: { stationId } }),
            this.prisma.locomotive.findMany({ where: { locationStationId: stationId } }),
            this.prisma.crew.findMany({ where: { depot: { locomotives: { some: { locationStationId: stationId } } } } }),
            this.prisma.trainRun.findMany({
                where: {
                    originStationId: stationId,
                    scheduledDeparture: { gte: now, lte: planningTo },
                    status: { in: ['PLANNED', 'ACTIVE'] },
                },
                include: { train: { select: { id: true, number: true, priority: true } } },
                orderBy: { scheduledDeparture: 'asc' },
            }),
        ]);

        // Load base allocations if available
        let baseAllocations: any[] = [];
        if (baseVersionId) {
            baseAllocations = await this.prisma.allocation.findMany({
                where: { scheduleVersionId: baseVersionId },
            });
        }

        const input: SolverInput = {
            stationId,
            planningFrom: now,
            planningTo,
            trainRuns: trainRuns as any,
            tracks,
            locomotives,
            crews,
            baseAllocations,
        };

        const output: SolverOutput = await this.solver.solve(input);

        // Create new ScheduleVersion + Allocations in a transaction
        const newVersion = await this.prisma.$transaction(async (tx) => {
            const version = await tx.scheduleVersion.create({
                data: {
                    stationId,
                    reason,
                    baseVersionId,
                    createdByUserId: null,
                },
            });

            const allocationData: Prisma.AllocationCreateManyInput[] = output.allocations.map((a) => ({
                scheduleVersionId: version.id,
                trainRunId: a.trainRunId,
                plannedDeparture: a.plannedDeparture,
                plannedArrival: a.plannedArrival,
                assignedTrackId: a.assignedTrackId,
                assignedLocomotiveId: a.assignedLocomotiveId,
                assignedCrewId: a.assignedCrewId,
                conflictFlags: a.conflictFlags as unknown as Prisma.InputJsonValue,
                notes: a.notes,
            }));

            await tx.allocation.createMany({ data: allocationData });

            return version;
        });

        // Audit log
        await this.prisma.auditLog.create({
            data: {
                action: 'RESCHEDULE',
                entityType: 'ScheduleVersion',
                entityId: newVersion.id,
                payload: { reason, summary: output.summary } as any,
            },
        });

        return { versionId: newVersion.id, summary: output.summary };
    }

    async getLatestVersion(stationId: string) {
        return this.prisma.scheduleVersion.findFirst({
            where: { stationId },
            orderBy: { createdAt: 'desc' },
        });
    }
}
