import { BindingConflictService } from './binding-conflict.service';
import { ConflictCode, BindingPlanStatus } from '@prisma/client';

const dt = (iso: string) => new Date(iso);

describe('BindingConflictService', () => {
    let service: BindingConflictService;
    let prisma: any;
    let mdm: any;

    beforeEach(() => {
        prisma = {
            bindingPlan: {
                findMany: jest.fn().mockResolvedValue([]),
                update: jest.fn().mockResolvedValue({}),
            },
            bindingAllocation: {
                findMany: jest.fn().mockResolvedValue([]),
            },
            bindingConflict: {
                deleteMany: jest.fn().mockResolvedValue({}),
                createMany: jest.fn().mockResolvedValue({}),
            },
            serviceShoulder: {
                findUnique: jest.fn().mockResolvedValue(null),
            },
        };
        mdm = {};
        service = new BindingConflictService(prisma, mdm);
    });

    it('returns no conflicts when no bindings exist', async () => {
        const result = await service.checkConflicts('2026-03');
        expect(result.checked).toBe(0);
        expect(result.conflicts).toHaveLength(0);
    });

    it('detects negative dwell (departure <= arrival)', async () => {
        prisma.bindingPlan.findMany.mockResolvedValueOnce([
            {
                id: 'b1',
                periodId: '2026-03',
                arrivalDt: dt('2026-03-10T12:00:00Z'),
                departureDt: dt('2026-03-10T11:00:00Z'), // before arrival!
                status: BindingPlanStatus.DRAFT,
                turnaroundStation: { name: 'Station A' },
                requiredModelId: null,
                shoulderId: null,
                allocations: [],
            },
        ]);

        const result = await service.checkConflicts('2026-03');
        expect(result.conflicts).toHaveLength(1);
        expect(result.conflicts[0].code).toBe(ConflictCode.VALIDATION_ERROR);
        expect(result.conflicts[0].details).toContain('Negative dwell');
    });

    it('detects no conflict when departure is after arrival', async () => {
        prisma.bindingPlan.findMany.mockResolvedValueOnce([
            {
                id: 'b1',
                periodId: '2026-03',
                arrivalDt: dt('2026-03-10T10:00:00Z'),
                departureDt: dt('2026-03-10T12:00:00Z'),
                status: BindingPlanStatus.DRAFT,
                turnaroundStation: { name: 'Station A' },
                requiredModelId: null,
                shoulderId: null,
                allocations: [],
            },
        ]);

        const result = await service.checkConflicts('2026-03');
        expect(result.conflicts).toHaveLength(0);
    });

    it('detects TIME_CONFLICT when locomotive is double-booked', async () => {
        prisma.bindingPlan.findMany.mockResolvedValueOnce([
            {
                id: 'b1', periodId: '2026-03',
                arrivalDt: dt('2026-03-10T10:00:00Z'),
                departureDt: dt('2026-03-10T12:00:00Z'),
                status: BindingPlanStatus.PLANNED,
                turnaroundStation: { name: 'Station A' },
                requiredModelId: null, shoulderId: null, allocations: [],
            },
            {
                id: 'b2', periodId: '2026-03',
                arrivalDt: dt('2026-03-10T11:00:00Z'),
                departureDt: dt('2026-03-10T13:00:00Z'),
                status: BindingPlanStatus.PLANNED,
                turnaroundStation: { name: 'Station B' },
                requiredModelId: null, shoulderId: null, allocations: [],
            },
        ]);

        // Two allocations for the same locomotive with overlapping intervals
        prisma.bindingAllocation.findMany.mockResolvedValueOnce([
            {
                id: 'a1', bindingId: 'b1', locomotiveId: 'loco-1',
                allocatedFrom: dt('2026-03-10T10:00:00Z'),
                allocatedTo: dt('2026-03-10T12:00:00Z'),
                binding: { periodId: '2026-03' },
            },
            {
                id: 'a2', bindingId: 'b2', locomotiveId: 'loco-1',
                allocatedFrom: dt('2026-03-10T11:00:00Z'),
                allocatedTo: dt('2026-03-10T13:00:00Z'),
                binding: { periodId: '2026-03' },
            },
        ]);

        const result = await service.checkConflicts('2026-03');
        const timeConflicts = result.conflicts.filter((c) => c.code === ConflictCode.TIME_CONFLICT);
        expect(timeConflicts.length).toBe(2); // one for each binding
        expect(timeConflicts[0].details).toContain('loco-1');
    });

    it('does not detect TIME_CONFLICT when allocations do not overlap', async () => {
        prisma.bindingPlan.findMany.mockResolvedValueOnce([
            {
                id: 'b1', periodId: '2026-03',
                arrivalDt: dt('2026-03-10T10:00:00Z'),
                departureDt: dt('2026-03-10T12:00:00Z'),
                status: BindingPlanStatus.PLANNED,
                turnaroundStation: { name: 'Station A' },
                requiredModelId: null, shoulderId: null, allocations: [],
            },
        ]);

        prisma.bindingAllocation.findMany.mockResolvedValueOnce([
            {
                id: 'a1', bindingId: 'b1', locomotiveId: 'loco-1',
                allocatedFrom: dt('2026-03-10T10:00:00Z'),
                allocatedTo: dt('2026-03-10T12:00:00Z'),
                binding: { periodId: '2026-03' },
            },
            {
                id: 'a2', bindingId: 'b1', locomotiveId: 'loco-1',
                allocatedFrom: dt('2026-03-10T13:00:00Z'), // after previous ends
                allocatedTo: dt('2026-03-10T15:00:00Z'),
                binding: { periodId: '2026-03' },
            },
        ]);

        const result = await service.checkConflicts('2026-03');
        const timeConflicts = result.conflicts.filter((c) => c.code === ConflictCode.TIME_CONFLICT);
        expect(timeConflicts).toHaveLength(0);
    });

    it('detects MODEL_NOT_ALLOWED when shoulder model differs', async () => {
        prisma.bindingPlan.findMany.mockResolvedValueOnce([
            {
                id: 'b1', periodId: '2026-03',
                arrivalDt: dt('2026-03-10T10:00:00Z'),
                departureDt: dt('2026-03-10T12:00:00Z'),
                status: BindingPlanStatus.VALIDATED,
                turnaroundStation: { name: 'Station A' },
                requiredModelId: 'model-vl80',
                shoulderId: 'shoulder-1',
                allocations: [],
            },
        ]);

        prisma.serviceShoulder.findUnique.mockResolvedValueOnce({
            id: 'shoulder-1',
            modelId: 'model-te33a', // different from required model-vl80
        });

        const result = await service.checkConflicts('2026-03');
        const modelConflicts = result.conflicts.filter((c) => c.code === ConflictCode.MODEL_NOT_ALLOWED);
        expect(modelConflicts).toHaveLength(1);
        expect(modelConflicts[0].details).toContain('model-vl80');
    });

    it('detects SHOULDER_NOT_RESOLVED when binding has model but no shoulder', async () => {
        prisma.bindingPlan.findMany.mockResolvedValueOnce([
            {
                id: 'b1', periodId: '2026-03',
                arrivalDt: dt('2026-03-10T10:00:00Z'),
                departureDt: dt('2026-03-10T12:00:00Z'),
                status: BindingPlanStatus.DRAFT,
                turnaroundStation: { name: 'Station A' },
                requiredModelId: 'model-vl80',
                shoulderId: null, // no shoulder assigned!
                allocations: [],
            },
        ]);

        const result = await service.checkConflicts('2026-03');
        const shoulderConflicts = result.conflicts.filter((c) => c.code === ConflictCode.SHOULDER_NOT_RESOLVED);
        expect(shoulderConflicts).toHaveLength(1);
    });
});
