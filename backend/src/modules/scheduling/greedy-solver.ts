import { Injectable } from '@nestjs/common';
import {
    ISolver,
    SolverInput,
    SolverOutput,
    AllocationDraft,
    ConflictFlags,
    TrainRunWithTrain,
} from './solver.interface';
import { Allocation, Crew, Locomotive, Track } from '@prisma/client';

const PRIORITY_WEIGHTS: Record<string, number> = {
    PASSENGER: 3,
    FREIGHT: 2,
    OTHER: 1,
};

const HEADWAY_MINUTES = 5;
const TRACK_OCCUPANCY_BEFORE = 10; // minutes before departure
const TRACK_OCCUPANCY_AFTER = 20; // minutes after departure
const MAX_SHIFT_MINUTES = 180; // max reschedule shift
const SHIFT_STEP_MINUTES = 5; // each retry step

const CONFLICT_LABELS: Record<string, string> = {
    track: 'путь',
    locomotive: 'локомотив',
    crew: 'бригада',
    headway: 'интервал',
};

@Injectable()
export class GreedySolver implements ISolver {
    async solve(input: SolverInput): Promise<SolverOutput> {
        const { trainRuns, tracks, locomotives, crews, stationId } = input;

        // Sort by priority (higher weight first), then by scheduledDeparture
        const sorted = [...trainRuns].sort((a, b) => {
            const wA = PRIORITY_WEIGHTS[a.train.priority] ?? 1;
            const wB = PRIORITY_WEIGHTS[b.train.priority] ?? 1;
            if (wB !== wA) return wB - wA;
            return a.scheduledDeparture.getTime() - b.scheduledDeparture.getTime();
        });

        const allocations: AllocationDraft[] = [];
        const locomotiveAvailability = this.buildResourceAvailabilityMap(
            locomotives,
            input.baseAllocations,
            'assignedLocomotiveId',
        );
        const crewAvailability = this.buildResourceAvailabilityMap(
            crews,
            input.baseAllocations,
            'assignedCrewId',
        );

        // Track occupancy map: trackId -> list of [occupyStart, occupyEnd] windows
        const trackOccupancy: Map<string, Array<[Date, Date]>> = new Map();
        for (const track of tracks) {
            trackOccupancy.set(track.id, []);
        }
        this.registerBaseTrackOccupancy(trackOccupancy, input.baseAllocations);

        const changes: string[] = [];

        for (const run of sorted) {
            const originalDeparture = new Date(run.scheduledDeparture);
            const originalArrival = new Date(run.scheduledArrival);
            const durationMs =
                originalArrival.getTime() - originalDeparture.getTime();

            let plannedDeparture = new Date(originalDeparture);
            // Add existing delay
            plannedDeparture = new Date(
                plannedDeparture.getTime() + run.currentDelayMinutes * 60_000,
            );
            let plannedArrival = new Date(plannedDeparture.getTime() + durationMs);

            const conflicts: ConflictFlags = {
                track: false,
                locomotive: false,
                crew: false,
                headway: false,
            };

            let notes = '';
            let shiftApplied = 0;

            // ─────── Try to assign with shifting ───────
            let resolved = false;
            for (let shift = 0; shift <= MAX_SHIFT_MINUTES; shift += SHIFT_STEP_MINUTES) {
                const tryDep = new Date(plannedDeparture.getTime() + shift * 60_000);
                const tryArr = new Date(tryDep.getTime() + durationMs);

                const track = this.findAvailableTrack(
                    tracks,
                    trackOccupancy,
                    tryDep,
                    tryArr,
                );
                const loco = this.findAvailableLocomotive(
                    input.locomotives,
                    locomotiveAvailability,
                    stationId,
                    tryDep,
                );
                const crew = this.findAvailableCrew(
                    input.crews,
                    crewAvailability,
                    tryDep,
                );

                if (track && loco && crew) {
                    plannedDeparture = tryDep;
                    plannedArrival = tryArr;
                    shiftApplied = shift;

                    // Register track occupancy
                    const occStart = new Date(
                        tryDep.getTime() - TRACK_OCCUPANCY_BEFORE * 60_000,
                    );
                    const occEnd = new Date(
                        tryDep.getTime() + TRACK_OCCUPANCY_AFTER * 60_000,
                    );
                    trackOccupancy.get(track.id)!.push([occStart, occEnd]);

                    locomotiveAvailability.set(loco.id, new Date(tryArr));
                    crewAvailability.set(crew.id, new Date(tryArr));

                    if (shiftApplied > 0 || run.currentDelayMinutes > 0) {
                        const reason =
                            run.currentDelayMinutes > 0
                                ? `задержка+${run.currentDelayMinutes}мин`
                                : `сдвиг+${shiftApplied}мин`;
                        changes.push(
                            `Поезд ${run.train.number}: отправление сдвинуто (${reason}) -> ${plannedDeparture.toISOString()}`,
                        );
                    }

                    notes = [
                        track ? `Путь: ${track.name}` : '',
                        loco ? `Локомотив: ${loco.series}${loco.number}` : '',
                        crew ? `Бригада: ${crew.id.slice(0, 8)}` : '',
                        shiftApplied > 0 ? `Сдвиг +${shiftApplied}мин` : '',
                    ]
                        .filter(Boolean)
                        .join(' | ');

                    allocations.push({
                        trainRunId: run.id,
                        plannedDeparture,
                        plannedArrival,
                        slotStatus:
                            shiftApplied === 0 && run.currentDelayMinutes === 0
                                ? 'IMMEDIATE'
                                : shiftApplied > 0
                                    ? 'WAITING_QUEUE'
                                    : 'ASSIGNED',
                        assignedTrackId: track.id,
                        assignedLocomotiveId: loco.id,
                        assignedCrewId: crew.id,
                        conflictFlags: { track: false, locomotive: false, crew: false, headway: false },
                        notes,
                    });
                    resolved = true;
                    break;
                }
            }

            if (!resolved) {
                // Partial assignment attempt for reporting
                const depFallback = new Date(
                    plannedDeparture.getTime() + MAX_SHIFT_MINUTES * 60_000,
                );
                const arrFallback = new Date(depFallback.getTime() + durationMs);

                const track = this.findAvailableTrack(
                    tracks,
                    trackOccupancy,
                    depFallback,
                    arrFallback,
                );
                const loco = this.findAvailableLocomotive(
                    input.locomotives,
                    locomotiveAvailability,
                    stationId,
                    depFallback,
                );
                const crew = this.findAvailableCrew(
                    input.crews,
                    crewAvailability,
                    depFallback,
                );

                if (!track) conflicts.track = true;
                if (!loco) conflicts.locomotive = true;
                if (!crew) conflicts.crew = true;

                notes = `НЕ РЕШЕНО после максимального сдвига ${MAX_SHIFT_MINUTES}мин. Конфликты: ${Object.entries(conflicts)
                        .filter(([, v]) => v)
                        .map(([k]) => CONFLICT_LABELS[k] ?? k)
                        .join(', ') || 'нет'
                    }`;

                changes.push(
                    `Поезд ${run.train.number}: нерешенный конфликт (${notes})`,
                );

                allocations.push({
                    trainRunId: run.id,
                    plannedDeparture: depFallback,
                    plannedArrival: arrFallback,
                    slotStatus: 'WAITING_QUEUE',
                    assignedTrackId: track?.id ?? null,
                    assignedLocomotiveId: loco?.id ?? null,
                    assignedCrewId: crew?.id ?? null,
                    conflictFlags: conflicts,
                    notes,
                });
            }
        }

        // Compute total weighted delay
        const totalWeightedDelayMinutes = allocations.reduce((acc, alloc) => {
            const run = sorted.find((r) => r.id === alloc.trainRunId)!;
            if (!run) return acc;
            const weight = PRIORITY_WEIGHTS[run.train.priority] ?? 1;
            const delayMs =
                alloc.plannedDeparture.getTime() -
                run.scheduledDeparture.getTime();
            const delayMin = Math.max(0, delayMs / 60_000);
            return acc + weight * delayMin;
        }, 0);

        // Top 5 changes summary
        const summary = changes.slice(0, 5);
        if (changes.length > 5) {
            summary.push(`...и еще ${changes.length - 5} изменений`);
        }

        return { allocations, summary, totalWeightedDelayMinutes };
    }

    // ─────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────

    private findAvailableTrack(
        tracks: Track[],
        occupancy: Map<string, Array<[Date, Date]>>,
        dep: Date,
        arr: Date,
    ): Track | null {
        const occStart = new Date(dep.getTime() - TRACK_OCCUPANCY_BEFORE * 60_000);
        const occEnd = new Date(dep.getTime() + TRACK_OCCUPANCY_AFTER * 60_000);

        for (const track of tracks) {
            if (track.status === 'MAINTENANCE') {
                // Check if this window overlaps with maintenance window
                if (
                    track.maintenanceFrom &&
                    track.maintenanceTo &&
                    this.overlaps(dep, arr, track.maintenanceFrom, track.maintenanceTo)
                ) {
                    continue;
                }
            }

            const windows = occupancy.get(track.id) ?? [];
            const hasConflict = windows.some(([wStart, wEnd]) =>
                this.overlaps(occStart, occEnd, wStart, wEnd),
            );

            // Check headway: last departure on this track
            const hasHeadwayViolation = windows.some(([wStart]) => {
                const existingDep = new Date(
                    wStart.getTime() + TRACK_OCCUPANCY_BEFORE * 60_000,
                );
                const diff = Math.abs(dep.getTime() - existingDep.getTime()) / 60_000;
                return diff < HEADWAY_MINUTES;
            });

            if (!hasConflict && !hasHeadwayViolation) return track;
        }
        return null;
    }

    private findAvailableLocomotive(
        locos: Array<Pick<Locomotive, 'id' | 'series' | 'number' | 'status' | 'availableFrom' | 'locationStationId'>>,
        availability: Map<string, Date>,
        stationId: string,
        dep: Date,
    ) {
        const requiredBy = new Date(dep.getTime() - 60 * 60_000); // dep - 1h
        return (
            locos.find(
                (l) =>
                    l.status === 'AVAILABLE' &&
                    l.locationStationId === stationId &&
                    this.getResourceAvailableFrom(availability, l.id, l.availableFrom) <= requiredBy,
            ) ?? null
        );
    }

    private findAvailableCrew(
        crews: Array<Pick<Crew, 'id' | 'status' | 'availableFrom' | 'requiredNoticeMinutes'>>,
        availability: Map<string, Date>,
        dep: Date,
    ) {
        return (
            crews.find((c) => {
                if (c.status !== 'AVAILABLE') return false;
                const requiredBy = new Date(
                    dep.getTime() - (c.requiredNoticeMinutes ?? 120) * 60_000,
                );
                return this.getResourceAvailableFrom(availability, c.id, c.availableFrom) <= requiredBy;
            }) ?? null
        );
    }

    private buildResourceAvailabilityMap<
        T extends { id: string; availableFrom: Date },
        K extends 'assignedLocomotiveId' | 'assignedCrewId',
    >(
        resources: T[],
        baseAllocations: Array<Pick<Allocation, K | 'plannedArrival'>>,
        field: K,
    ) {
        const availability = new Map<string, Date>();

        for (const resource of resources) {
            availability.set(resource.id, new Date(resource.availableFrom));
        }

        for (const allocation of baseAllocations) {
            const resourceId = allocation[field];
            if (!resourceId) continue;
            const current = availability.get(resourceId);
            const arrival = new Date(allocation.plannedArrival);
            if (!current || arrival > current) {
                availability.set(resourceId, arrival);
            }
        }

        return availability;
    }

    private registerBaseTrackOccupancy(
        occupancy: Map<string, Array<[Date, Date]>>,
        baseAllocations: Array<Pick<Allocation, 'assignedTrackId' | 'plannedDeparture'>>,
    ) {
        for (const allocation of baseAllocations) {
            if (!allocation.assignedTrackId) continue;
            const occStart = new Date(
                new Date(allocation.plannedDeparture).getTime() - TRACK_OCCUPANCY_BEFORE * 60_000,
            );
            const occEnd = new Date(
                new Date(allocation.plannedDeparture).getTime() + TRACK_OCCUPANCY_AFTER * 60_000,
            );
            const windows = occupancy.get(allocation.assignedTrackId) ?? [];
            windows.push([occStart, occEnd]);
            occupancy.set(allocation.assignedTrackId, windows);
        }
    }

    private getResourceAvailableFrom(
        availability: Map<string, Date>,
        resourceId: string,
        fallback: Date,
    ) {
        return availability.get(resourceId) ?? new Date(fallback);
    }

    private overlaps(s1: Date, e1: Date, s2: Date | string, e2: Date | string): boolean {
        const s2d = new Date(s2);
        const e2d = new Date(e2);
        return s1 < e2d && e1 > s2d;
    }
}
