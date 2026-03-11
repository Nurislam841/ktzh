import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class BindingAnalyticsService {
    private readonly logger = new Logger(BindingAnalyticsService.name);

    constructor(private readonly prisma: PrismaService) { }

    /**
     * Calculate KPI for a given period and scope.
     */
    async calculateKpi(periodId: string, scopeType: string = 'global', scopeId?: string) {
        const where: any = { periodId };
        if (scopeType === 'station' && scopeId) where.turnaroundStationId = scopeId;

        const bindings = await this.prisma.bindingPlan.findMany({
            where,
            include: { conflicts: true, allocations: true },
        });

        if (bindings.length === 0) {
            return { periodId, scopeType, scopeId, kpi: null, message: 'No bindings found' };
        }

        // Dwell metrics
        const dwells = bindings.map((b) => b.dwellMinutes).filter((d) => d >= 0);
        const avgDwell = dwells.length > 0 ? dwells.reduce((a, b) => a + b, 0) / dwells.length : 0;
        const maxDwell = dwells.length > 0 ? Math.max(...dwells) : 0;

        // Conflict counts
        const conflictsCnt = bindings.filter((b) => b.status === 'CONFLICT').length;

        // Utilization (simple: ratio of allocated time to total available time in period)
        const allocations = bindings.flatMap((b) => b.allocations);
        const totalAllocatedMs = allocations.reduce(
            (sum, a) => sum + (a.allocatedTo.getTime() - a.allocatedFrom.getTime()),
            0,
        );
        // For idle ratio: total interval from first arrival to last departure
        const arrivals = bindings.map((b) => b.arrivalDt.getTime());
        const departures = bindings.map((b) => b.departureDt.getTime());
        const totalSpanMs = Math.max(...departures) - Math.min(...arrivals);
        const utilization = totalSpanMs > 0 ? totalAllocatedMs / totalSpanMs : 0;
        const idleRatio = 1 - utilization;

        // Persist KPI snapshot (upsert by periodId + scopeType + scopeId)
        const snapshot = await this.prisma.kpiSnapshot.create({
            data: {
                periodId,
                scopeType,
                scopeId: scopeId ?? null,
                avgDwell: Math.round(avgDwell * 100) / 100,
                maxDwell,
                conflictsCnt,
                utilization: Math.round(utilization * 10000) / 10000,
                idleRatio: Math.round(idleRatio * 10000) / 10000,
            },
        });

        return snapshot;
    }

    /**
     * Get KPI snapshots for a period.
     */
    async getKpi(periodId: string, scopeType?: string) {
        const where: any = { periodId };
        if (scopeType) where.scopeType = scopeType;

        return this.prisma.kpiSnapshot.findMany({
            where,
            orderBy: { calculatedAt: 'desc' },
        });
    }

    /**
     * Aggregate conflict counts by code for a period.
     */
    async conflictSummary(periodId: string) {
        const conflicts = await this.prisma.bindingConflict.findMany({
            where: { binding: { periodId } },
        });

        const byCode: Record<string, number> = {};
        for (const c of conflicts) {
            byCode[c.code] = (byCode[c.code] ?? 0) + 1;
        }

        return { periodId, total: conflicts.length, byCode };
    }
}
