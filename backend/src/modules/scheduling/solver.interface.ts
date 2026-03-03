import { Allocation, Crew, Locomotive, ScheduleVersion, Track, TrainRun } from '@prisma/client';

export interface SolverInput {
    stationId: string;
    planningFrom: Date;
    planningTo: Date;
    trainRuns: TrainRunWithTrain[];
    tracks: Track[];
    locomotives: Locomotive[];
    crews: Crew[];
    baseAllocations: Allocation[];
}

export interface SolverOutput {
    allocations: AllocationDraft[];
    summary: string[];
    totalWeightedDelayMinutes: number;
}

export interface AllocationDraft {
    trainRunId: string;
    plannedDeparture: Date;
    plannedArrival: Date;
    assignedTrackId: string | null;
    assignedLocomotiveId: string | null;
    assignedCrewId: string | null;
    conflictFlags: ConflictFlags;
    notes: string;
}

export interface ConflictFlags {
    track: boolean;
    locomotive: boolean;
    crew: boolean;
    headway: boolean;
}

export interface TrainRunWithTrain extends TrainRun {
    train: { id: string; number: string; priority: string };
}

export interface ISolver {
    solve(input: SolverInput): Promise<SolverOutput>;
}
