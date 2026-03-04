import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class NodeService {
    constructor(private readonly prisma: PrismaService) { }

    async listStations() {
        const stations = await this.prisma.station.findMany({
            select: {
                id: true,
                name: true,
                code: true,
                _count: {
                    select: {
                        scheduleVersions: true,
                        trainRunsOrigin: true,
                        locomotives: true,
                        tracks: true,
                    },
                },
            },
            orderBy: { name: 'asc' },
        });

        return {
            stations: stations.map((s) => ({
                id: s.id,
                name: s.name,
                code: s.code,
                versions: s._count.scheduleVersions,
                trainRuns: s._count.trainRunsOrigin,
                locomotives: s._count.locomotives,
                tracks: s._count.tracks,
                active: s._count.scheduleVersions > 0 || s._count.trainRunsOrigin > 0,
            })),
        };
    }

    async getOverview(stationId: string, from?: string, to?: string, hours?: string) {
        const now = new Date();
        const fromDate = from ? new Date(from) : now;
        const hoursWindow = Number.isFinite(Number(hours)) && Number(hours) > 0 ? Number(hours) : 6;
        const toDate = to ? new Date(to) : new Date(fromDate.getTime() + hoursWindow * 60 * 60_000);

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
            slotStatus: a.slotStatus,
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

    async getResources(stationId: string) {
        const [tracks, locomotives, crews] = await Promise.all([
            this.prisma.track.findMany({
                where: { stationId },
                orderBy: { name: 'asc' },
                select: {
                    id: true,
                    name: true,
                    status: true,
                    maintenanceFrom: true,
                    maintenanceTo: true,
                },
            }),
            this.prisma.locomotive.findMany({
                where: { locationStationId: stationId },
                orderBy: [{ status: 'asc' }, { availableFrom: 'asc' }],
                select: {
                    id: true,
                    series: true,
                    number: true,
                    status: true,
                    availableFrom: true,
                    maintenanceFrom: true,
                    maintenanceTo: true,
                },
            }),
            this.prisma.crew.findMany({
                where: {
                    depot: {
                        locomotives: {
                            some: { locationStationId: stationId },
                        },
                    },
                },
                orderBy: [{ status: 'asc' }, { availableFrom: 'asc' }],
                select: {
                    id: true,
                    status: true,
                    availableFrom: true,
                    requiredNoticeMinutes: true,
                },
            }),
        ]);

        return {
            stationId,
            summary: {
                tracks: tracks.length,
                locomotives: locomotives.length,
                crews: crews.length,
                availableTracks: tracks.filter((t) => t.status === 'FREE').length,
                availableLocomotives: locomotives.filter((l) => l.status === 'AVAILABLE').length,
                availableCrews: crews.filter((c) => c.status === 'AVAILABLE').length,
            },
            tracks,
            locomotives: locomotives.map((l) => ({
                ...l,
                label: `${l.series}${l.number}`,
            })),
            crews,
        };
    }
}
