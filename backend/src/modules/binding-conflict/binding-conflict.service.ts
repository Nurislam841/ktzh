import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MdmService } from '../mdm/mdm.service';
import { ConflictCode, BindingPlanStatus } from '@prisma/client';

export interface ConflictResult {
    bindingId: string;
    code: ConflictCode;
    details: string;
}

@Injectable()
export class BindingConflictService {
    private readonly logger = new Logger(BindingConflictService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly mdm: MdmService,
    ) { }

    /**
     * Run all conflict checks on bindings for a given period.
     * Creates BindingConflict records and updates BindingPlan statuses.
     */
    async checkConflicts(periodId: string): Promise<{
        checked: number;
        conflicts: ConflictResult[];
    }> {
        const bindings = await this.prisma.bindingPlan.findMany({
            where: {
                periodId,
                status: { in: [BindingPlanStatus.DRAFT, BindingPlanStatus.VALIDATED, BindingPlanStatus.PLANNED] },
            },
            include: {
                turnaroundStation: true,
                arrivalTrain: true,
                departureTrain: true,
                shoulder: true,
                allocations: true,
            },
        });

        const allConflicts: ConflictResult[] = [];

        // 1. Negative dwell check
        for (const b of bindings) {
            if (b.departureDt <= b.arrivalDt) {
                allConflicts.push({
                    bindingId: b.id,
                    code: ConflictCode.VALIDATION_ERROR,
                    details: `Negative dwell: departure (${b.departureDt.toISOString()}) <= arrival (${b.arrivalDt.toISOString()})`,
                });
            }
        }

        // 2. Time overlap check (same locomotive assigned to overlapping intervals)
        const allocations = await this.prisma.bindingAllocation.findMany({
            where: { binding: { periodId } },
            include: { binding: true },
            orderBy: { allocatedFrom: 'asc' },
        });

        const byLoco = new Map<string, typeof allocations>();
        for (const a of allocations) {
            const arr = byLoco.get(a.locomotiveId) ?? [];
            arr.push(a);
            byLoco.set(a.locomotiveId, arr);
        }

        for (const [locoId, locoAllocs] of byLoco.entries()) {
            for (let i = 0; i < locoAllocs.length; i++) {
                for (let j = i + 1; j < locoAllocs.length; j++) {
                    const a = locoAllocs[i];
                    const b = locoAllocs[j];
                    // Overlap: a.from < b.to && b.from < a.to
                    if (a.allocatedFrom < b.allocatedTo && b.allocatedFrom < a.allocatedTo) {
                        allConflicts.push({
                            bindingId: a.bindingId,
                            code: ConflictCode.TIME_CONFLICT,
                            details: `Locomotive ${locoId} double-booked: binding ${a.bindingId} overlaps with ${b.bindingId}`,
                        });
                        allConflicts.push({
                            bindingId: b.bindingId,
                            code: ConflictCode.TIME_CONFLICT,
                            details: `Locomotive ${locoId} double-booked: binding ${b.bindingId} overlaps with ${a.bindingId}`,
                        });
                    }
                }
            }
        }

        // 3. Model admissibility check
        for (const b of bindings) {
            if (b.requiredModelId && b.shoulderId) {
                const shoulder = await this.prisma.serviceShoulder.findUnique({
                    where: { id: b.shoulderId },
                });
                if (shoulder && shoulder.modelId !== b.requiredModelId) {
                    allConflicts.push({
                        bindingId: b.id,
                        code: ConflictCode.MODEL_NOT_ALLOWED,
                        details: `Required model ${b.requiredModelId} not allowed on shoulder ${b.shoulderId} (expects ${shoulder.modelId})`,
                    });
                }
            }
        }

        // 4. Shoulder resolution check (for bindings without a shoulder)
        for (const b of bindings) {
            if (!b.shoulderId && b.requiredModelId) {
                allConflicts.push({
                    bindingId: b.id,
                    code: ConflictCode.SHOULDER_NOT_RESOLVED,
                    details: `No service shoulder assigned for binding at ${b.turnaroundStation.name}`,
                });
            }
        }

        // Deduplicate by (bindingId, code)
        const seen = new Set<string>();
        const uniqueConflicts = allConflicts.filter((c) => {
            const key = `${c.bindingId}:${c.code}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        // Persist conflicts & update binding statuses
        // First, clear old conflicts for the period
        await this.prisma.bindingConflict.deleteMany({
            where: { binding: { periodId } },
        });

        // Create new conflicts
        if (uniqueConflicts.length > 0) {
            await this.prisma.bindingConflict.createMany({
                data: uniqueConflicts.map((c) => ({
                    bindingId: c.bindingId,
                    code: c.code,
                    details: c.details,
                })),
            });
        }

        // Update statuses
        const conflictBindingIds = new Set(uniqueConflicts.map((c) => c.bindingId));
        for (const b of bindings) {
            const newStatus = conflictBindingIds.has(b.id)
                ? BindingPlanStatus.CONFLICT
                : BindingPlanStatus.PLANNED;

            if (b.status !== newStatus && b.status !== BindingPlanStatus.APPROVED) {
                await this.prisma.bindingPlan.update({
                    where: { id: b.id },
                    data: {
                        status: newStatus,
                        conflictReasonCode: conflictBindingIds.has(b.id)
                            ? uniqueConflicts.find((c) => c.bindingId === b.id)?.code
                            : null,
                        conflictReasonDetails: conflictBindingIds.has(b.id)
                            ? uniqueConflicts.find((c) => c.bindingId === b.id)?.details
                            : null,
                    },
                });
            }
        }

        return { checked: bindings.length, conflicts: uniqueConflicts };
    }

    /**
     * List conflicts with filters.
     */
    async list(filters: {
        periodId?: string;
        code?: ConflictCode;
        bindingId?: string;
    }) {
        const where: any = {};
        if (filters.bindingId) where.bindingId = filters.bindingId;
        if (filters.code) where.code = filters.code;
        if (filters.periodId) where.binding = { periodId: filters.periodId };

        return this.prisma.bindingConflict.findMany({
            where,
            include: {
                binding: {
                    include: { turnaroundStation: true, arrivalTrain: true, departureTrain: true },
                },
            },
            orderBy: { detectedAt: 'desc' },
        });
    }
}
