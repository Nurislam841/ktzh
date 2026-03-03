import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class NodeService {
    constructor(private readonly prisma: PrismaService) { }

    async getOverview(stationId: string, from?: string, to?: string) {
        const now = new Date();
        const fromDate = from ? new Date(from) : now;
        const toDate = to ? new Date(to) : new Date(now.getTime() + 6 * 60 * 60_000);

        // Get latest version for this station
        const latestVersion = await this.prisma.scheduleVersion.findFirst({
            where: { stationId },
            orderBy: { createdAt: 'desc' },
        });

        if (!latestVersion) {
            return { stationId, versionId: null, trainRuns: [], tracks: [] };
        }

        const [allocations, trainRuns, tracks] = await Promise.all([
            this.prisma.allocation.findMany({
                where: {
                    scheduleVersionId: latestVersion.id,
                    plannedDeparture: { gte: fromDate, lte: toDate },
                },
                include: {
                    trainRun: {
                        include: {
                            train: true,
                            originStation: { select: { id: true, name: true, code: true } },
                            destinationStation: { select: { id: true, name: true, code: true } },
                        },
                    },
                    assignedTrack: true,
                    assignedLocomotive: true,
                    assignedCrew: true,
                },
                orderBy: { plannedDeparture: 'asc' },
            }),
            this.prisma.trainRun.findMany({
                where: {
                    originStationId: stationId,
                    scheduledDeparture: { gte: fromDate, lte: toDate },
                },
                select: { id: true },
            }),
            this.prisma.track.findMany({
                where: { stationId },
            }),
        ]);

        const enriched = allocations.map((a) => ({
            allocationId: a.id,
            trainRun: {
                id: a.trainRun.id,
                number: a.trainRun.train.number,
                priority: a.trainRun.train.priority,
                scheduledDeparture: a.trainRun.scheduledDeparture,
                scheduledArrival: a.trainRun.scheduledArrival,
                currentDelayMinutes: a.trainRun.currentDelayMinutes,
                status: a.trainRun.status,
                origin: a.trainRun.originStation,
                destination: a.trainRun.destinationStation,
            },
            plannedDeparture: a.plannedDeparture,
            plannedArrival: a.plannedArrival,
            track: a.assignedTrack ? { id: a.assignedTrack.id, name: a.assignedTrack.name } : null,
            locomotive: a.assignedLocomotive
                ? {
                    id: a.assignedLocomotive.id,
                    label: `${a.assignedLocomotive.series}${a.assignedLocomotive.number}`,
                }
                : null,
            crew: a.assignedCrew ? { id: a.assignedCrew.id } : null,
            conflictFlags: a.conflictFlags,
            notes: a.notes,
        }));

        return {
            stationId,
            versionId: latestVersion.id,
            versionCreatedAt: latestVersion.createdAt,
            trainRuns: enriched,
            tracks: tracks.map((t) => ({
                id: t.id,
                name: t.name,
                status: t.status,
            })),
        };
    }
}
