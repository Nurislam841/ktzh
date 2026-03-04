import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { GreedySolver } from './greedy-solver';
import { AllocationDraft, SolverInput, SolverOutput } from './solver.interface';
import { Prisma, TrainRunStatus } from '@prisma/client';

@Injectable()
export class SchedulingService {
    private readonly reschedulableStatuses: TrainRunStatus[] = [
        'PLANNED',
        'READY',
        'WAITING_SLOT',
        'LOCO_ASSIGNED',
        'CREW_CONFIRMED',
        'DELAYED',
        'ACTIVE',
    ];

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
                    status: { in: this.reschedulableStatuses },
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
        const trainRunById = new Map(trainRuns.map((run) => [run.id, run]));

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
                slotStatus: a.slotStatus,
                assignedTrackId: a.assignedTrackId,
                assignedLocomotiveId: a.assignedLocomotiveId,
                assignedCrewId: a.assignedCrewId,
                conflictFlags: a.conflictFlags as unknown as Prisma.InputJsonValue,
                notes: a.notes,
            }));

            await tx.allocation.createMany({ data: allocationData });
            await Promise.all(
                output.allocations.map((allocation) => {
                    const run = trainRunById.get(allocation.trainRunId);
                    if (!run) return Promise.resolve();
                    const newDelayMinutes = Math.max(
                        0,
                        Math.round(
                            (allocation.plannedDeparture.getTime() - run.scheduledDeparture.getTime()) /
                            60_000,
                        ),
                    );
                    return tx.trainRun.update({
                        where: { id: allocation.trainRunId },
                        data: {
                            status: this.deriveTrainRunStatus(allocation),
                            currentDelayMinutes: newDelayMinutes,
                        },
                    });
                }),
            );

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

    private deriveTrainRunStatus(allocation: AllocationDraft): TrainRunStatus {
        const hasConflict = Object.values(allocation.conflictFlags ?? {}).some(Boolean);
        if (hasConflict) return 'DELAYED';
        if (!allocation.assignedTrackId) return 'WAITING_SLOT';
        if (allocation.assignedLocomotiveId && allocation.assignedCrewId) return 'CREW_CONFIRMED';
        if (allocation.assignedLocomotiveId) return 'LOCO_ASSIGNED';
        return 'READY';
    }
}
