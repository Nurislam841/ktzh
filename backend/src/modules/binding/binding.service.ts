import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BindingPlanStatus, Prisma } from '@prisma/client';

export interface BindingPlanDto {
    periodId: string;
    turnaroundStationId: string;
    arrivalTrainId: string;
    arrivalDt: string; // ISO 8601 / RFC 3339
    departureTrainId: string;
    departureDt: string;
    shoulderId?: string;
    requiredModelId?: string;
    sourceFileId?: string;
}

const VALID_TRANSITIONS: Record<string, BindingPlanStatus[]> = {
    DRAFT: [BindingPlanStatus.VALIDATED, BindingPlanStatus.REJECTED],
    VALIDATED: [BindingPlanStatus.PLANNED, BindingPlanStatus.CONFLICT, BindingPlanStatus.REJECTED],
    PLANNED: [BindingPlanStatus.APPROVED, BindingPlanStatus.CONFLICT, BindingPlanStatus.REJECTED],
    CONFLICT: [BindingPlanStatus.PLANNED, BindingPlanStatus.REJECTED],
    REJECTED: [BindingPlanStatus.DRAFT],
    APPROVED: [],
};

@Injectable()
export class BindingService {
    private readonly logger = new Logger(BindingService.name);

    constructor(private readonly prisma: PrismaService) { }

    /**
     * UPSERT a binding plan.
     * Natural key: (periodId, turnaroundStationId, arrivalTrainId, departureTrainId, arrivalDt)
     */
    async upsert(dto: BindingPlanDto) {
        const arrivalDt = new Date(dto.arrivalDt);
        const departureDt = new Date(dto.departureDt);
        const dwellMinutes = Math.round((departureDt.getTime() - arrivalDt.getTime()) / 60000);

        const data: Prisma.BindingPlanUncheckedCreateInput = {
            periodId: dto.periodId,
            turnaroundStationId: dto.turnaroundStationId,
            arrivalTrainId: dto.arrivalTrainId,
            arrivalDt,
            departureTrainId: dto.departureTrainId,
            departureDt,
            dwellMinutes,
            shoulderId: dto.shoulderId ?? null,
            requiredModelId: dto.requiredModelId ?? null,
            sourceFileId: dto.sourceFileId ?? null,
            status: BindingPlanStatus.DRAFT,
        };

        return this.prisma.bindingPlan.upsert({
            where: {
                periodId_turnaroundStationId_arrivalTrainId_departureTrainId_arrivalDt: {
                    periodId: dto.periodId,
                    turnaroundStationId: dto.turnaroundStationId,
                    arrivalTrainId: dto.arrivalTrainId,
                    departureTrainId: dto.departureTrainId,
                    arrivalDt,
                },
            },
            create: data,
            update: {
                departureDt,
                dwellMinutes,
                shoulderId: dto.shoulderId ?? null,
                requiredModelId: dto.requiredModelId ?? null,
                sourceFileId: dto.sourceFileId ?? null,
            },
        });
    }

    /**
     * Batch upsert multiple binding plans.
     */
    async upsertMany(items: BindingPlanDto[]) {
        const results = [];
        for (const dto of items) {
            results.push(await this.upsert(dto));
        }
        return results;
    }

    /**
     * Transition binding plan status.
     */
    async transition(bindingId: string, newStatus: BindingPlanStatus, reason?: string) {
        const binding = await this.prisma.bindingPlan.findUnique({ where: { id: bindingId } });
        if (!binding) throw new NotFoundException(`Binding ${bindingId} not found`);

        const allowed = VALID_TRANSITIONS[binding.status] ?? [];
        if (!allowed.includes(newStatus)) {
            throw new BadRequestException(
                `Cannot transition from ${binding.status} to ${newStatus}`,
            );
        }

        return this.prisma.bindingPlan.update({
            where: { id: bindingId },
            data: {
                status: newStatus,
                conflictReasonCode: newStatus === BindingPlanStatus.CONFLICT ? reason : null,
                conflictReasonDetails: newStatus === BindingPlanStatus.CONFLICT ? reason : null,
            },
        });
    }

    /**
     * List bindings with filters.
     */
    async list(filters: {
        periodId?: string;
        stationId?: string;
        status?: BindingPlanStatus;
        skip?: number;
        take?: number;
    }) {
        const where: Prisma.BindingPlanWhereInput = {};
        if (filters.periodId) where.periodId = filters.periodId;
        if (filters.stationId) where.turnaroundStationId = filters.stationId;
        if (filters.status) where.status = filters.status;

        const [items, total] = await Promise.all([
            this.prisma.bindingPlan.findMany({
                where,
                include: {
                    turnaroundStation: true,
                    arrivalTrain: true,
                    departureTrain: true,
                    shoulder: { include: { model: true } },
                    conflicts: true,
                },
                orderBy: { arrivalDt: 'asc' },
                skip: filters.skip ?? 0,
                take: filters.take ?? 100,
            }),
            this.prisma.bindingPlan.count({ where }),
        ]);

        return { items, total };
    }

    /**
     * Get a single binding plan with all relations.
     */
    async findById(bindingId: string) {
        const binding = await this.prisma.bindingPlan.findUnique({
            where: { id: bindingId },
            include: {
                turnaroundStation: true,
                arrivalTrain: true,
                departureTrain: true,
                shoulder: { include: { depot: true, fromStation: true, toStation: true, model: true } },
                requiredModel: true,
                sourceFile: true,
                allocations: { include: { locomotive: true } },
                conflicts: true,
            },
        });
        if (!binding) throw new NotFoundException(`Binding ${bindingId} not found`);
        return binding;
    }
}
