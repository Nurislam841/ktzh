import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AnalyticsService {
    constructor(private readonly prisma: PrismaService) { }

    async getNodeOverview(stationId: string, versionId?: string) {
        // Get target version
        let targetVersionId = versionId;
        if (!targetVersionId) {
            const latest = await this.prisma.scheduleVersion.findFirst({
                where: { stationId },
                orderBy: { createdAt: 'desc' },
                select: { id: true },
            });
            targetVersionId = latest?.id;
        }

        if (!targetVersionId) {
            return {
                stationId,
                versionId: null,
                totalTrains: 0,
                avgDelayMinutes: 0,
                conflictsCountByType: {},
                trackOccupancyRate: 0,
                locomotiveUtilization: 0,
                crewUtilization: 0,
            };
        }

        const allocations = await this.prisma.allocation.findMany({
            where: { scheduleVersionId: targetVersionId },
            include: {
                trainRun: { include: { train: { select: { priority: true } } } },
            },
        });

        const [trackCount, locoCount, crewCount] = await Promise.all([
            this.prisma.track.count({ where: { stationId } }),
            this.prisma.locomotive.count({ where: { locationStationId: stationId } }),
            this.prisma.crew.count({ where: { depot: { locomotives: { some: { locationStationId: stationId } } } } }),
        ]);

        const totalTrains = allocations.length;

        // Avg delay
        const totalDelayMs = allocations.reduce((acc, a) => {
            const delta = a.plannedDeparture.getTime() - a.trainRun.scheduledDeparture.getTime();
            return acc + Math.max(0, delta);
        }, 0);
        const avgDelayMinutes = totalTrains > 0 ? Math.round(totalDelayMs / totalTrains / 60_000) : 0;

        // Conflicts count by type
        const conflictsCountByType: Record<string, number> = {
            track: 0,
            locomotive: 0,
            crew: 0,
            headway: 0,
        };

        for (const alloc of allocations) {
            const flags = alloc.conflictFlags as Record<string, boolean>;
            if (flags) {
                for (const [key, val] of Object.entries(flags)) {
                    if (val) conflictsCountByType[key] = (conflictsCountByType[key] ?? 0) + 1;
                }
            }
        }

        // Track occupancy rate
        const occupiedTracks = new Set(allocations.map((a) => a.assignedTrackId).filter(Boolean)).size;
        const trackOccupancyRate = trackCount > 0 ? Math.round((occupiedTracks / trackCount) * 100) : 0;

        // Locomotive utilization
        const usedLocos = new Set(allocations.map((a) => a.assignedLocomotiveId).filter(Boolean)).size;
        const locomotiveUtilization = locoCount > 0 ? Math.round((usedLocos / locoCount) * 100) : 0;

        // Crew utilization
        const usedCrews = new Set(allocations.map((a) => a.assignedCrewId).filter(Boolean)).size;
        const crewUtilization = crewCount > 0 ? Math.round((usedCrews / crewCount) * 100) : 0;

        return {
            stationId,
            versionId: targetVersionId,
            totalTrains,
            avgDelayMinutes,
            conflictsCountByType,
            trackOccupancyRate,
            locomotiveUtilization,
            crewUtilization,
        };
    }
}
