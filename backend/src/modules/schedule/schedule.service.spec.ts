import { NotFoundException } from '@nestjs/common';
import { ScheduleService } from './schedule.service';

describe('ScheduleService (approval flow)', () => {
    let service: ScheduleService;
    let prisma: any;

    beforeEach(() => {
        prisma = {
            scheduleVersion: {
                findUnique: jest.fn().mockResolvedValue({ id: 'version-1' }),
                update: jest.fn().mockResolvedValue({ id: 'version-1' }),
            },
            auditLog: {
                create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
            },
        };
        service = new ScheduleService(prisma);
    });

    it('sets AUTOMATIC mode as approved by system', async () => {
        await service.setApprovalMode('version-1', 'AUTOMATIC');

        expect(prisma.scheduleVersion.update).toHaveBeenCalledWith({
            where: { id: 'version-1' },
            data: {
                approvalMode: 'AUTOMATIC',
                approvalStatus: 'APPROVED',
                approvedAt: expect.any(Date),
                approvedByUserId: 'system:auto',
            },
        });
    });

    it('sets MANUAL mode as pending', async () => {
        await service.setApprovalMode('version-1', 'MANUAL');

        expect(prisma.scheduleVersion.update).toHaveBeenCalledWith({
            where: { id: 'version-1' },
            data: {
                approvalMode: 'MANUAL',
                approvalStatus: 'PENDING',
                approvedAt: null,
                approvedByUserId: null,
            },
        });
    });

    it('approves version by dispatcher user', async () => {
        await service.approveVersion('version-1', 'dispatcher.user01');

        expect(prisma.scheduleVersion.update).toHaveBeenCalledWith({
            where: { id: 'version-1' },
            data: {
                approvalStatus: 'APPROVED',
                approvedAt: expect.any(Date),
                approvedByUserId: 'dispatcher.user01',
            },
        });
    });

    it('rejects version and writes audit log', async () => {
        await service.rejectVersion('version-1', 'dispatcher.user02', 'Headway conflict');

        expect(prisma.scheduleVersion.update).toHaveBeenCalledWith({
            where: { id: 'version-1' },
            data: {
                approvalStatus: 'REJECTED',
                approvedAt: expect.any(Date),
                approvedByUserId: 'dispatcher.user02',
            },
        });
        expect(prisma.auditLog.create).toHaveBeenCalledWith({
            data: {
                action: 'SCHEDULE_REJECTED',
                entityType: 'ScheduleVersion',
                entityId: 'version-1',
                payload: {
                    rejectedByUserId: 'dispatcher.user02',
                    reason: 'Headway conflict',
                },
            },
        });
    });

    it('throws when target version does not exist', async () => {
        prisma.scheduleVersion.findUnique.mockResolvedValueOnce(null);
        await expect(service.approveVersion('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
});
