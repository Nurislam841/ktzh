import { ConflictDetectionService } from './conflict-detection.service';

const dt = (iso: string) => new Date(iso);

describe('ConflictDetectionService', () => {
    let service: ConflictDetectionService;
    let prisma: any;

    beforeEach(() => {
        prisma = {
            scheduleVersion: {
                findFirst: jest.fn().mockResolvedValue({ id: 'version-1' }),
            },
            allocation: {
                findMany: jest.fn().mockResolvedValue([]),
            },
        };
        service = new ConflictDetectionService(prisma);
    });

    it('returns empty summary when neither versionId nor stationId is provided', async () => {
        const res = await service.detect(undefined, undefined);
        expect(res.versionId).toBeNull();
        expect(res.summary.total).toBe(0);
        expect(prisma.allocation.findMany).not.toHaveBeenCalled();
    });

    it('detects track, headway, loco and crew conflicts', async () => {
        prisma.allocation.findMany.mockResolvedValueOnce([
            {
                id: 'a1',
                trainRunId: 'run-1',
                plannedDeparture: dt('2026-03-04T10:00:00.000Z'),
                plannedArrival: dt('2026-03-04T11:00:00.000Z'),
                assignedTrackId: 'track-1',
                assignedTrack: { id: 'track-1', name: 'Track 1' },
                assignedLocomotiveId: 'loco-1',
                assignedLocomotive: { id: 'loco-1', series: 'VL80', number: '101', availableFrom: dt('2026-03-04T06:00:00.000Z') },
                assignedCrewId: 'crew-1',
                assignedCrew: { id: 'crew-1', availableFrom: dt('2026-03-04T06:00:00.000Z'), requiredNoticeMinutes: 120 },
                trainRun: { id: 'run-1', train: { number: '700' } },
            },
            {
                id: 'a2',
                trainRunId: 'run-2',
                plannedDeparture: dt('2026-03-04T10:03:00.000Z'),
                plannedArrival: dt('2026-03-04T11:10:00.000Z'),
                assignedTrackId: 'track-1',
                assignedTrack: { id: 'track-1', name: 'Track 1' },
                assignedLocomotiveId: 'loco-1',
                assignedLocomotive: { id: 'loco-1', series: 'VL80', number: '101', availableFrom: dt('2026-03-04T06:00:00.000Z') },
                assignedCrewId: null,
                assignedCrew: null,
                trainRun: { id: 'run-2', train: { number: '701' } },
            },
        ]);

        const res = await service.detect('version-1', undefined);
        expect(res.versionId).toBe('version-1');
        expect(res.summary.byType.track_conflict).toBe(1);
        expect(res.summary.byType.headway_violation).toBe(1);
        expect(res.summary.byType.loco_double_booking).toBe(1);
        expect(res.summary.byType.crew_violation).toBe(1);

        const types = res.conflicts.map((c: any) => c.type);
        expect(types).toContain('track_conflict');
        expect(types).toContain('headway_violation');
        expect(types).toContain('loco_double_booking');
        expect(types).toContain('crew_violation');
    });
});
