import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ScheduleService {
    constructor(private readonly prisma: PrismaService) { }

    async listVersions(
        stationId: string,
        page = 1,
        limit = 20,
        filters?: {
            approvalMode?: 'AUTOMATIC' | 'MANUAL';
            approvalStatus?: 'PENDING' | 'APPROVED' | 'REJECTED';
        },
    ) {
        const skip = (page - 1) * limit;
        const where: Prisma.ScheduleVersionWhereInput = { stationId };
        if (filters?.approvalMode) where.approvalMode = filters.approvalMode;
        if (filters?.approvalStatus) where.approvalStatus = filters.approvalStatus;

        const [versions, total] = await Promise.all([
            this.prisma.scheduleVersion.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
                select: {
                    id: true,
                    createdAt: true,
                    reason: true,
                    baseVersionId: true,
                    createdByUserId: true,
                    approvalMode: true,
                    approvalStatus: true,
                    approvedAt: true,
                    approvedByUserId: true,
                    _count: { select: { allocations: true } },
                },
            }),
            this.prisma.scheduleVersion.count({ where }),
        ]);
        return { versions, total, page, limit };
    }

    async getVersion(id: string) {
        const version = await this.prisma.scheduleVersion.findUnique({
            where: { id },
            include: {
                allocations: {
                    include: {
                        trainRun: { include: { train: true } },
                        assignedTrack: { select: { id: true, name: true } },
                        assignedLocomotive: { select: { id: true, series: true, number: true } },
                        assignedCrew: { select: { id: true, status: true } },
                    },
                    orderBy: { plannedDeparture: 'asc' },
                },
            },
        });
        if (!version) throw new NotFoundException(`Версия ${id} не найдена`);
        return version;
    }

    async setApprovalMode(id: string, mode: 'AUTOMATIC' | 'MANUAL') {
        await this.ensureVersionExists(id);
        if (mode === 'AUTOMATIC') {
            return this.prisma.scheduleVersion.update({
                where: { id },
                data: {
                    approvalMode: mode,
                    approvalStatus: 'APPROVED',
                    approvedAt: new Date(),
                    approvedByUserId: 'system:auto',
                },
            });
        }

        return this.prisma.scheduleVersion.update({
            where: { id },
            data: {
                approvalMode: mode,
                approvalStatus: 'PENDING',
                approvedAt: null,
                approvedByUserId: null,
            },
        });
    }

    async approveVersion(id: string, approvedByUserId = 'dispatcher') {
        await this.ensureVersionExists(id);
        return this.prisma.scheduleVersion.update({
            where: { id },
            data: {
                approvalStatus: 'APPROVED',
                approvedAt: new Date(),
                approvedByUserId,
            },
        });
    }

    async rejectVersion(id: string, rejectedByUserId = 'dispatcher', reason?: string) {
        await this.ensureVersionExists(id);
        const rejected = await this.prisma.scheduleVersion.update({
            where: { id },
            data: {
                approvalStatus: 'REJECTED',
                approvedAt: new Date(),
                approvedByUserId: rejectedByUserId,
            },
        });

        await this.prisma.auditLog.create({
            data: {
                action: 'SCHEDULE_REJECTED',
                entityType: 'ScheduleVersion',
                entityId: id,
                payload: {
                    rejectedByUserId,
                    reason: reason ?? null,
                } as any,
            },
        });

        return rejected;
    }

    async compareVersions(fromVersionId: string, toVersionId: string) {
        const [fromV, toV] = await Promise.all([
            this.getVersion(fromVersionId),
            this.getVersion(toVersionId),
        ]);

        const fromMap = new Map(fromV.allocations.map((a) => [a.trainRunId, a]));
        const toMap = new Map(toV.allocations.map((a) => [a.trainRunId, a]));

        const changes: any[] = [];
        let totalDepartureDeltaMs = 0;
        let newConflicts = 0;
        let resolvedConflicts = 0;

        for (const [trainRunId, toAlloc] of toMap) {
            const fromAlloc = fromMap.get(trainRunId);
            const change: any = {
                trainRunId,
                trainNumber: toAlloc.trainRun.train.number,
                priority: toAlloc.trainRun.train.priority,
            };

            if (!fromAlloc) {
                change.type = 'ADDED';
                change.to = this.summarizeAlloc(toAlloc);
                changes.push(change);
                continue;
            }

            const depDeltaMs = toAlloc.plannedDeparture.getTime() - fromAlloc.plannedDeparture.getTime();
            totalDepartureDeltaMs += depDeltaMs;

            const fromFlags = fromAlloc.conflictFlags as any;
            const toFlags = toAlloc.conflictFlags as any;
            const fromHasConflict = Object.values(fromFlags ?? {}).some(Boolean);
            const toHasConflict = Object.values(toFlags ?? {}).some(Boolean);

            if (toHasConflict && !fromHasConflict) newConflicts++;
            if (!toHasConflict && fromHasConflict) resolvedConflicts++;

            const isDiff =
                depDeltaMs !== 0 ||
                fromAlloc.assignedTrackId !== toAlloc.assignedTrackId ||
                fromAlloc.assignedLocomotiveId !== toAlloc.assignedLocomotiveId ||
                fromAlloc.assignedCrewId !== toAlloc.assignedCrewId ||
                JSON.stringify(fromFlags) !== JSON.stringify(toFlags);

            if (isDiff) {
                change.type = 'CHANGED';
                change.from = this.summarizeAlloc(fromAlloc);
                change.to = this.summarizeAlloc(toAlloc);
                change.departureDeltaMinutes = Math.round(depDeltaMs / 60_000);
                changes.push(change);
            }
        }

        for (const [trainRunId, fromAlloc] of fromMap) {
            if (!toMap.has(trainRunId)) {
                changes.push({
                    trainRunId,
                    trainNumber: fromAlloc.trainRun.train.number,
                    type: 'REMOVED',
                    from: this.summarizeAlloc(fromAlloc),
                });
            }
        }

        return {
            fromVersionId,
            toVersionId,
            fromReason: fromV.reason,
            toReason: toV.reason,
            summary: {
                totalChanged: changes.filter((c) => c.type === 'CHANGED').length,
                totalAdded: changes.filter((c) => c.type === 'ADDED').length,
                totalRemoved: changes.filter((c) => c.type === 'REMOVED').length,
                totalDepartureDelayDeltaMinutes: Math.round(totalDepartureDeltaMs / 60_000),
                newConflicts,
                resolvedConflicts,
            },
            changes,
        };
    }

    private summarizeAlloc(a: any) {
        return {
            plannedDeparture: a.plannedDeparture,
            plannedArrival: a.plannedArrival,
            slotStatus: a.slotStatus,
            track: a.assignedTrack?.name ?? null,
            locomotive: a.assignedLocomotive
                ? `${a.assignedLocomotive.series}${a.assignedLocomotive.number}`
                : null,
            crewId: a.assignedCrew?.id ?? null,
            conflictFlags: a.conflictFlags,
            notes: a.notes,
        };
    }

    private async ensureVersionExists(id: string) {
        const version = await this.prisma.scheduleVersion.findUnique({
            where: { id },
            select: { id: true },
        });
        if (!version) throw new NotFoundException(`Версия ${id} не найдена`);
    }
}
