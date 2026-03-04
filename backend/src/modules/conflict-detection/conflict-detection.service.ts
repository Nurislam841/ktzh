import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const HEADWAY_MINUTES = 5;
const TRACK_OCCUPANCY_BEFORE = 10;
const TRACK_OCCUPANCY_AFTER = 20;

type ConflictRecord = {
    type: 'track_conflict' | 'headway_violation' | 'crew_violation' | 'loco_double_booking';
    trainRunIds: string[];
    details: Record<string, unknown>;
};

@Injectable()
export class ConflictDetectionService {
    constructor(private readonly prisma: PrismaService) { }

    async detect(versionId?: string, stationId?: string) {
        const targetVersionId = await this.resolveVersionId(versionId, stationId);
        if (!targetVersionId) {
            return {
                versionId: null,
                summary: {
                    total: 0,
                    byType: {
                        track_conflict: 0,
                        headway_violation: 0,
                        crew_violation: 0,
                        loco_double_booking: 0,
                    },
                },
                conflicts: [],
            };
        }

        const allocations = await this.prisma.allocation.findMany({
            where: { scheduleVersionId: targetVersionId },
            include: {
                trainRun: {
                    select: {
                        id: true,
                        train: { select: { number: true } },
                    },
                },
                assignedTrack: { select: { id: true, name: true } },
                assignedLocomotive: { select: { id: true, series: true, number: true, availableFrom: true } },
                assignedCrew: { select: { id: true, availableFrom: true, requiredNoticeMinutes: true } },
            },
            orderBy: { plannedDeparture: 'asc' },
        });

        const conflicts: ConflictRecord[] = [];
        conflicts.push(...this.detectTrackAndHeadwayConflicts(allocations));
        conflicts.push(...this.detectLocoDoubleBookings(allocations));
        conflicts.push(...this.detectCrewViolations(allocations));

        const summary = {
            total: conflicts.length,
            byType: {
                track_conflict: conflicts.filter((c) => c.type === 'track_conflict').length,
                headway_violation: conflicts.filter((c) => c.type === 'headway_violation').length,
                crew_violation: conflicts.filter((c) => c.type === 'crew_violation').length,
                loco_double_booking: conflicts.filter((c) => c.type === 'loco_double_booking').length,
            },
        };

        return {
            versionId: targetVersionId,
            summary,
            conflicts,
        };
    }

    private detectTrackAndHeadwayConflicts(allocations: any[]): ConflictRecord[] {
        const byTrack = new Map<string, any[]>();
        for (const alloc of allocations) {
            if (!alloc.assignedTrackId) continue;
            const list = byTrack.get(alloc.assignedTrackId) ?? [];
            list.push(alloc);
            byTrack.set(alloc.assignedTrackId, list);
        }

        const conflicts: ConflictRecord[] = [];
        for (const [, trackAllocations] of byTrack) {
            const sorted = [...trackAllocations].sort(
                (a, b) => a.plannedDeparture.getTime() - b.plannedDeparture.getTime(),
            );

            for (let i = 1; i < sorted.length; i++) {
                const prev = sorted[i - 1];
                const curr = sorted[i];
                const prevOccStart = new Date(prev.plannedDeparture.getTime() - TRACK_OCCUPANCY_BEFORE * 60_000);
                const prevOccEnd = new Date(prev.plannedDeparture.getTime() + TRACK_OCCUPANCY_AFTER * 60_000);
                const currOccStart = new Date(curr.plannedDeparture.getTime() - TRACK_OCCUPANCY_BEFORE * 60_000);
                const currOccEnd = new Date(curr.plannedDeparture.getTime() + TRACK_OCCUPANCY_AFTER * 60_000);

                if (this.overlaps(prevOccStart, prevOccEnd, currOccStart, currOccEnd)) {
                    conflicts.push({
                        type: 'track_conflict',
                        trainRunIds: [prev.trainRunId, curr.trainRunId],
                        details: {
                            trackId: curr.assignedTrackId,
                            trackName: curr.assignedTrack?.name ?? null,
                            previousDeparture: prev.plannedDeparture,
                            currentDeparture: curr.plannedDeparture,
                        },
                    });
                }

                const headway = Math.abs(curr.plannedDeparture.getTime() - prev.plannedDeparture.getTime()) / 60_000;
                if (headway < HEADWAY_MINUTES) {
                    conflicts.push({
                        type: 'headway_violation',
                        trainRunIds: [prev.trainRunId, curr.trainRunId],
                        details: {
                            trackId: curr.assignedTrackId,
                            trackName: curr.assignedTrack?.name ?? null,
                            headwayMinutes: Math.round(headway * 100) / 100,
                            requiredHeadwayMinutes: HEADWAY_MINUTES,
                        },
                    });
                }
            }
        }

        return conflicts;
    }

    private detectLocoDoubleBookings(allocations: any[]): ConflictRecord[] {
        const byLoco = new Map<string, any[]>();
        for (const alloc of allocations) {
            if (!alloc.assignedLocomotiveId) continue;
            const list = byLoco.get(alloc.assignedLocomotiveId) ?? [];
            list.push(alloc);
            byLoco.set(alloc.assignedLocomotiveId, list);
        }

        const conflicts: ConflictRecord[] = [];
        for (const [, locoAllocations] of byLoco) {
            const sorted = [...locoAllocations].sort(
                (a, b) => a.plannedDeparture.getTime() - b.plannedDeparture.getTime(),
            );

            for (let i = 1; i < sorted.length; i++) {
                const prev = sorted[i - 1];
                const curr = sorted[i];
                if (this.overlaps(prev.plannedDeparture, prev.plannedArrival, curr.plannedDeparture, curr.plannedArrival)) {
                    conflicts.push({
                        type: 'loco_double_booking',
                        trainRunIds: [prev.trainRunId, curr.trainRunId],
                        details: {
                            locomotiveId: curr.assignedLocomotiveId,
                            locomotive: curr.assignedLocomotive
                                ? `${curr.assignedLocomotive.series}${curr.assignedLocomotive.number}`
                                : null,
                        },
                    });
                }
            }
        }

        return conflicts;
    }

    private detectCrewViolations(allocations: any[]): ConflictRecord[] {
        const conflicts: ConflictRecord[] = [];
        for (const alloc of allocations) {
            if (!alloc.assignedCrewId || !alloc.assignedCrew) {
                conflicts.push({
                    type: 'crew_violation',
                    trainRunIds: [alloc.trainRunId],
                    details: {
                        reason: 'crew_not_assigned',
                        trainNumber: alloc.trainRun?.train?.number ?? null,
                    },
                });
                continue;
            }

            const requiredNoticeMinutes = alloc.assignedCrew.requiredNoticeMinutes ?? 120;
            const crewMustArriveBy = new Date(alloc.plannedDeparture.getTime() - requiredNoticeMinutes * 60_000);
            if (new Date(alloc.assignedCrew.availableFrom) > crewMustArriveBy) {
                conflicts.push({
                    type: 'crew_violation',
                    trainRunIds: [alloc.trainRunId],
                    details: {
                        reason: 'crew_notice_violation',
                        crewId: alloc.assignedCrewId,
                        crewAvailableFrom: alloc.assignedCrew.availableFrom,
                        requiredBy: crewMustArriveBy,
                    },
                });
            }
        }
        return conflicts;
    }

    private async resolveVersionId(versionId?: string, stationId?: string) {
        if (versionId) return versionId;
        if (!stationId) return null;
        const latest = await this.prisma.scheduleVersion.findFirst({
            where: { stationId },
            orderBy: { createdAt: 'desc' },
            select: { id: true },
        });
        return latest?.id ?? null;
    }

    private overlaps(s1: Date, e1: Date, s2: Date, e2: Date) {
        return s1 < e2 && e1 > s2;
    }
}
