import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class MdmService {
    private readonly logger = new Logger(MdmService.name);

    constructor(private readonly prisma: PrismaService) { }

    // ── LocomotiveModel ──────────────────────────────────

    async findAllModels() {
        return this.prisma.locomotiveModel.findMany({ orderBy: { series: 'asc' } });
    }

    async findModelBySeries(series: string) {
        return this.prisma.locomotiveModel.findUnique({ where: { series } });
    }

    async upsertModel(data: Prisma.LocomotiveModelCreateInput) {
        return this.prisma.locomotiveModel.upsert({
            where: { series: data.series },
            create: data,
            update: {
                sectionsCount: data.sectionsCount,
                tractionType: data.tractionType,
                description: data.description,
            },
        });
    }

    // ── ServiceShoulder ──────────────────────────────────

    async findAllShoulders(filters?: { depotId?: string; modelId?: string }) {
        const where: Prisma.ServiceShoulderWhereInput = {};
        if (filters?.depotId) where.depotId = filters.depotId;
        if (filters?.modelId) where.modelId = filters.modelId;

        return this.prisma.serviceShoulder.findMany({
            where,
            include: { depot: true, fromStation: true, toStation: true, model: true },
            orderBy: { createdAt: 'desc' },
        });
    }

    async createShoulder(data: Prisma.ServiceShoulderUncheckedCreateInput) {
        return this.prisma.serviceShoulder.create({ data });
    }

    /**
     * Resolve a shoulder given from/to station and model series.
     * Returns null if no matching shoulder exists.
     */
    async resolveShoulder(fromStationId: string, toStationId: string, modelId: string) {
        return this.prisma.serviceShoulder.findFirst({
            where: { fromStationId, toStationId, modelId },
        });
    }

    /**
     * Check if a given locomotive model series is allowed on a shoulder
     * identified by from/to station.
     */
    async isModelAllowed(fromStationId: string, toStationId: string, modelId: string): Promise<boolean> {
        const shoulder = await this.resolveShoulder(fromStationId, toStationId, modelId);
        return shoulder !== null;
    }

    // ── MaintenanceRule ──────────────────────────────────

    async findRulesByModel(modelId: string) {
        return this.prisma.maintenanceRule.findMany({ where: { modelId } });
    }

    async createRule(data: Prisma.MaintenanceRuleUncheckedCreateInput) {
        return this.prisma.maintenanceRule.create({ data });
    }

    // ── Station resolution ────────────────────────────────

    async resolveStationByCode(code: string) {
        return this.prisma.station.findUnique({ where: { code } });
    }

    async resolveTrainByNumber(number: string) {
        return this.prisma.train.findUnique({ where: { number } });
    }
}
