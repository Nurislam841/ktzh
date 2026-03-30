import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BindingPlanStatus, Prisma, TrainPriority } from '@prisma/client';
import * as path from 'node:path';
import { parseParkWorkbook } from '../gitural/gitural-locomotive-table';
import { GituralService } from '../gitural/gitural.service';
import { buildBindingIntelligence } from './binding-intelligence';

export interface BindingPlanDto {
    periodId: string;
    turnaroundStationId: string;
    arrivalTrainId?: string;
    arrivalTrainNumber?: string;
    arrivalDt: string;
    departureTrainId?: string;
    departureTrainNumber?: string;
    departureDt: string;
    shoulderId?: string;
    requiredModelId?: string;
    sourceFileId?: string;
    locomotiveNumber?: string;
    locomotiveSeries?: string;
    locomotiveDepot?: string;
    tractionType?: string;
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
    private readonly parkPath = path.resolve(process.cwd(), 'data', 'Парк КТЖ-ПЛ на 01.01.2026г.xlsx');
    private parkPromise: Promise<ReturnType<typeof parseParkWorkbook>> | null = null;

    constructor(
        private readonly prisma: PrismaService,
        private readonly gitural: GituralService,
    ) { }

    async upsert(dto: BindingPlanDto) {
        const arrivalDt = new Date(dto.arrivalDt);
        const departureDt = new Date(dto.departureDt);

        if (Number.isNaN(arrivalDt.getTime()) || Number.isNaN(departureDt.getTime())) {
            throw new BadRequestException('arrivalDt и departureDt должны быть корректными датами');
        }

        if (departureDt <= arrivalDt) {
            throw new BadRequestException('Время отправления должно быть позже времени прибытия');
        }

        if (dto.locomotiveNumber && !/^\d{4}$/.test(dto.locomotiveNumber)) {
            throw new BadRequestException('Номер локомотива должен состоять ровно из 4 цифр');
        }

        const [arrivalTrainId, departureTrainId] = await Promise.all([
            this.resolveTrainId(dto.arrivalTrainId, dto.arrivalTrainNumber),
            this.resolveTrainId(dto.departureTrainId, dto.departureTrainNumber),
        ]);

        const dwellMinutes = Math.round((departureDt.getTime() - arrivalDt.getTime()) / 60000);
        const resolvedModelId = dto.requiredModelId ?? await this.resolveModelId(dto.locomotiveSeries);

        const data: Prisma.BindingPlanUncheckedCreateInput = {
            periodId: dto.periodId,
            turnaroundStationId: dto.turnaroundStationId,
            arrivalTrainId,
            arrivalDt,
            departureTrainId,
            departureDt,
            dwellMinutes,
            shoulderId: dto.shoulderId ?? null,
            requiredModelId: resolvedModelId ?? null,
            sourceFileId: dto.sourceFileId ?? null,
            status: BindingPlanStatus.DRAFT,
        };

        const binding = await this.prisma.bindingPlan.upsert({
            where: {
                periodId_turnaroundStationId_arrivalTrainId_departureTrainId_arrivalDt: {
                    periodId: dto.periodId,
                    turnaroundStationId: dto.turnaroundStationId,
                    arrivalTrainId,
                    departureTrainId,
                    arrivalDt,
                },
            },
            create: data,
            update: {
                departureDt,
                dwellMinutes,
                shoulderId: dto.shoulderId ?? null,
                requiredModelId: resolvedModelId ?? null,
                sourceFileId: dto.sourceFileId ?? null,
            },
        });

        if (dto.locomotiveNumber) {
            const locomotiveId = await this.resolveOrCreateLocomotive({
                turnaroundStationId: dto.turnaroundStationId,
                number: dto.locomotiveNumber,
                series: dto.locomotiveSeries,
                depotName: dto.locomotiveDepot,
                availableFrom: arrivalDt,
            });

            const existingAllocation = await this.prisma.bindingAllocation.findFirst({
                where: { bindingId: binding.id },
                orderBy: { createdAt: 'asc' },
            });

            if (existingAllocation) {
                await this.prisma.bindingAllocation.update({
                    where: { id: existingAllocation.id },
                    data: {
                        locomotiveId,
                        allocatedFrom: arrivalDt,
                        allocatedTo: departureDt,
                        status: 'ACTIVE',
                    },
                });
            } else {
                await this.prisma.bindingAllocation.create({
                    data: {
                        bindingId: binding.id,
                        locomotiveId,
                        allocatedFrom: arrivalDt,
                        allocatedTo: departureDt,
                        status: 'ACTIVE',
                    },
                });
            }
        }

        return this.findById(binding.id);
    }

    async upsertMany(items: BindingPlanDto[]) {
        const results = [];
        for (const dto of items) {
            results.push(await this.upsert(dto));
        }
        return results;
    }

    async transition(bindingId: string, newStatus: BindingPlanStatus, reason?: string) {
        const binding = await this.prisma.bindingPlan.findUnique({ where: { id: bindingId } });
        if (!binding) throw new NotFoundException(`Binding ${bindingId} not found`);

        const allowed = VALID_TRANSITIONS[binding.status] ?? [];
        if (!allowed.includes(newStatus)) {
            throw new BadRequestException(`Cannot transition from ${binding.status} to ${newStatus}`);
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
                    allocations: {
                        include: {
                            locomotive: {
                                include: {
                                    depot: true,
                                    locationStation: true,
                                },
                            },
                        },
                    },
                },
                orderBy: { arrivalDt: 'asc' },
                skip: filters.skip ?? 0,
                take: filters.take ?? 100,
            }),
            this.prisma.bindingPlan.count({ where }),
        ]);

        return { items, total };
    }

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
                allocations: {
                    include: {
                        locomotive: {
                            include: {
                                depot: true,
                                locationStation: true,
                            },
                        },
                    },
                },
                conflicts: true,
            },
        });
        if (!binding) throw new NotFoundException(`Binding ${bindingId} not found`);
        return binding;
    }

    async getOperationalIntelligence(day?: number) {
        const baseTimeline: any = await this.gitural.getTimeline();
        const selectedDay = typeof day === 'number'
            ? day
            : Array.isArray(baseTimeline?.days) && baseTimeline.days.length
                ? Math.max(...baseTimeline.days)
                : null;
        const timeline: any = selectedDay === null
            ? baseTimeline
            : await this.gitural.getTimeline(undefined, undefined, selectedDay);

        const [parkLocomotives, models] = await Promise.all([
            this.getParkLocomotives(),
            this.prisma.locomotiveModel.findMany({
                select: { series: true, tractionType: true },
            }),
        ]);

        const intelligence = buildBindingIntelligence({
            rows: timeline?.locomotiveTable ?? [],
            trains: timeline?.trains ?? [],
            parkLocomotives,
            selectedDay,
            models,
        });

        return {
            ...intelligence,
            days: baseTimeline?.days ?? timeline?.days ?? [],
        };
    }

    private async getParkLocomotives() {
        if (!this.parkPromise) {
            this.parkPromise = Promise.resolve(parseParkWorkbook(this.parkPath, this.loadXlsx()));
        }
        return this.parkPromise;
    }

    private loadXlsx() {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        return require('xlsx');
    }

    private async resolveTrainId(trainId: string | undefined, trainNumber: string | undefined) {
        if (trainId) return trainId;

        const normalizedNumber = String(trainNumber ?? '').trim();
        if (!normalizedNumber) {
            throw new BadRequestException('Нужно передать поезд по id или номеру');
        }

        const existing = await this.prisma.train.findUnique({ where: { number: normalizedNumber } });
        if (existing) return existing.id;

        const created = await this.prisma.train.create({
            data: {
                number: normalizedNumber,
                priority: TrainPriority.OTHER,
            },
        });

        return created.id;
    }

    private async resolveModelId(series?: string) {
        const normalizedSeries = String(series ?? '').trim();
        if (!normalizedSeries) return null;
        const model = await this.prisma.locomotiveModel.findUnique({
            where: { series: normalizedSeries },
            select: { id: true },
        });
        return model?.id ?? null;
    }

    private async resolveOrCreateLocomotive(args: {
        turnaroundStationId: string;
        number: string;
        series?: string;
        depotName?: string;
        availableFrom: Date;
    }) {
        const normalizedNumber = args.number.trim();
        const normalizedSeries = String(args.series ?? '').trim();

        const existing = await this.prisma.locomotive.findFirst({
            where: normalizedSeries
                ? { number: normalizedNumber, series: normalizedSeries }
                : { number: normalizedNumber },
            orderBy: { availableFrom: 'desc' },
        });

        if (existing) {
            await this.prisma.locomotive.update({
                where: { id: existing.id },
                data: {
                    locationStationId: args.turnaroundStationId,
                    availableFrom: args.availableFrom,
                    status: 'AVAILABLE',
                },
            });
            return existing.id;
        }

        const depotName = String(args.depotName ?? 'ТЛ-11').trim() || 'ТЛ-11';
        let depot = await this.prisma.depot.findFirst({ where: { name: depotName } });
        if (!depot) {
            depot = await this.prisma.depot.create({ data: { name: depotName } });
        }

        const locomotive = await this.prisma.locomotive.create({
            data: {
                series: normalizedSeries || 'UNKNOWN',
                number: normalizedNumber,
                depotId: depot.id,
                locationStationId: args.turnaroundStationId,
                status: 'AVAILABLE',
                availableFrom: args.availableFrom,
            },
        });

        return locomotive.id;
    }
}
