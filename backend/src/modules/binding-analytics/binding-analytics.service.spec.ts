import { BindingAnalyticsService } from './binding-analytics.service';

describe('BindingAnalyticsService', () => {
    let service: BindingAnalyticsService;
    let prisma: any;

    beforeEach(() => {
        prisma = {
            bindingPlan: {
                findMany: jest.fn().mockResolvedValue([]),
            },
            kpiSnapshot: {
                create: jest.fn().mockImplementation((args: any) => Promise.resolve({ id: 'kpi-1', ...args.data })),
            },
            bindingConflict: {
                findMany: jest.fn().mockResolvedValue([]),
            },
        };
        service = new BindingAnalyticsService(prisma);
    });

    it('returns null KPI when no bindings exist', async () => {
        const result = await service.calculateKpi('2026-03') as any;
        expect(result.kpi).toBeNull();
    });

    it('calculates correct average and max dwell', async () => {
        prisma.bindingPlan.findMany.mockResolvedValueOnce([
            {
                id: 'b1', dwellMinutes: 30, status: 'PLANNED',
                arrivalDt: new Date('2026-03-10T10:00:00Z'),
                departureDt: new Date('2026-03-10T10:30:00Z'),
                conflicts: [], allocations: [],
            },
            {
                id: 'b2', dwellMinutes: 60, status: 'PLANNED',
                arrivalDt: new Date('2026-03-10T11:00:00Z'),
                departureDt: new Date('2026-03-10T12:00:00Z'),
                conflicts: [], allocations: [],
            },
            {
                id: 'b3', dwellMinutes: 90, status: 'PLANNED',
                arrivalDt: new Date('2026-03-10T13:00:00Z'),
                departureDt: new Date('2026-03-10T14:30:00Z'),
                conflicts: [], allocations: [],
            },
        ]);

        const result = await service.calculateKpi('2026-03') as any;
        expect(result.avgDwell).toBe(60); // (30+60+90)/3
        expect(result.maxDwell).toBe(90);
    });

    it('counts conflicts correctly', async () => {
        prisma.bindingPlan.findMany.mockResolvedValueOnce([
            {
                id: 'b1', dwellMinutes: 30, status: 'CONFLICT',
                arrivalDt: new Date('2026-03-10T10:00:00Z'),
                departureDt: new Date('2026-03-10T10:30:00Z'),
                conflicts: [{ code: 'TIME_CONFLICT' }], allocations: [],
            },
            {
                id: 'b2', dwellMinutes: 60, status: 'CONFLICT',
                arrivalDt: new Date('2026-03-10T11:00:00Z'),
                departureDt: new Date('2026-03-10T12:00:00Z'),
                conflicts: [{ code: 'MODEL_NOT_ALLOWED' }], allocations: [],
            },
            {
                id: 'b3', dwellMinutes: 90, status: 'PLANNED',
                arrivalDt: new Date('2026-03-10T13:00:00Z'),
                departureDt: new Date('2026-03-10T14:30:00Z'),
                conflicts: [], allocations: [],
            },
        ]);

        const result = await service.calculateKpi('2026-03') as any;
        expect(result.conflictsCnt).toBe(2);
    });

    it('calculates utilization from allocations', async () => {
        prisma.bindingPlan.findMany.mockResolvedValueOnce([
            {
                id: 'b1', dwellMinutes: 120, status: 'PLANNED',
                arrivalDt: new Date('2026-03-10T10:00:00Z'),
                departureDt: new Date('2026-03-10T12:00:00Z'),
                conflicts: [],
                allocations: [
                    {
                        allocatedFrom: new Date('2026-03-10T10:00:00Z'),
                        allocatedTo: new Date('2026-03-10T12:00:00Z'),
                    },
                ],
            },
        ]);

        const result = await service.calculateKpi('2026-03') as any;
        // Single binding spanning 2h with an allocation covering the full span: utilization = 1.0
        expect(result.utilization).toBe(1);
        expect(result.idleRatio).toBe(0);
    });

    it('aggregates conflict summary by code', async () => {
        prisma.bindingConflict.findMany.mockResolvedValueOnce([
            { code: 'TIME_CONFLICT' },
            { code: 'TIME_CONFLICT' },
            { code: 'MODEL_NOT_ALLOWED' },
            { code: 'SHOULDER_NOT_RESOLVED' },
        ]);

        const result = await service.conflictSummary('2026-03');
        expect(result.total).toBe(4);
        expect(result.byCode.TIME_CONFLICT).toBe(2);
        expect(result.byCode.MODEL_NOT_ALLOWED).toBe(1);
        expect(result.byCode.SHOULDER_NOT_RESOLVED).toBe(1);
    });
});

