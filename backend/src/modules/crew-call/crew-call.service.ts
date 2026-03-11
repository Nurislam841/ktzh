import { Injectable, NotFoundException } from '@nestjs/common';
import { CrewCallStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CrewCallService {
    constructor(private readonly prisma: PrismaService) { }

    async generateForStation(stationId: string, hours = 6) {
        const now = new Date();
        const toDate = new Date(now.getTime() + hours * 60 * 60_000);

        const latestVersion = await this.prisma.scheduleVersion.findFirst({
            where: { stationId },
            orderBy: { createdAt: 'desc' },
            select: { id: true, createdAt: true },
        });

        if (!latestVersion) {
            return {
                stationId,
                versionId: null,
                generated: 0,
                items: [],
            };
        }

        const allocations = await this.prisma.allocation.findMany({
            where: {
                scheduleVersionId: latestVersion.id,
                plannedDeparture: { gte: now, lte: toDate },
            },
            include: {
                trainRun: {
                    include: {
                        train: { select: { number: true, priority: true } },
                    },
                },
                assignedCrew: {
                    select: {
                        id: true,
                        status: true,
                        availableFrom: true,
                        requiredNoticeMinutes: true,
                    },
                },
            },
            orderBy: { plannedDeparture: 'asc' },
        });

        const items = [];

        for (const allocation of allocations) {
            if (!this.shouldGenerateCrewCall(allocation.trainRun)) {
                continue;
            }
            const noticeMinutes = allocation.assignedCrew?.requiredNoticeMinutes ?? 120;
            const mustReportAt = new Date(allocation.plannedDeparture.getTime() - noticeMinutes * 60_000);
            const acceptedLocomotiveAt = new Date(allocation.plannedDeparture.getTime() - 60 * 60_000);
            const status = this.resolveStatus(allocation.assignedCrew?.availableFrom ?? null, mustReportAt, now);

            const crewCall = await this.prisma.crewCall.upsert({
                where: {
                    trainRunId_generatedFromVersionId: {
                        trainRunId: allocation.trainRunId,
                        generatedFromVersionId: latestVersion.id,
                    },
                },
                create: {
                    trainRunId: allocation.trainRunId,
                    crewId: allocation.assignedCrewId,
                    generatedFromVersionId: latestVersion.id,
                    mustReportAt,
                    acceptedLocomotiveAt,
                    status,
                    notes: this.buildNotes(status, allocation.assignedCrew?.availableFrom ?? null, mustReportAt),
                },
                update: {
                    crewId: allocation.assignedCrewId,
                    mustReportAt,
                    acceptedLocomotiveAt,
                    status,
                    notes: this.buildNotes(status, allocation.assignedCrew?.availableFrom ?? null, mustReportAt),
                },
                include: {
                    crew: {
                        select: {
                            id: true,
                            status: true,
                            availableFrom: true,
                            requiredNoticeMinutes: true,
                        },
                    },
                    trainRun: {
                        include: {
                            train: { select: { number: true, priority: true } },
                        },
                    },
                },
            });

            items.push(this.toDto(crewCall));
        }

        return {
            stationId,
            versionId: latestVersion.id,
            versionCreatedAt: latestVersion.createdAt,
            generated: items.length,
            items,
        };
    }

    async list(stationId: string, hours = 6) {
        const now = new Date();
        const toDate = new Date(now.getTime() + hours * 60 * 60_000);

        const items = await this.prisma.crewCall.findMany({
            where: {
                trainRun: { originStationId: stationId },
                mustReportAt: { lte: toDate },
                acceptedLocomotiveAt: { gte: new Date(now.getTime() - 2 * 60 * 60_000) },
            },
            include: {
                crew: {
                    select: {
                        id: true,
                        status: true,
                        availableFrom: true,
                        requiredNoticeMinutes: true,
                    },
                },
                trainRun: {
                    include: {
                        train: { select: { number: true, priority: true } },
                    },
                },
                generatedFromVersion: {
                    select: { id: true, createdAt: true },
                },
            },
            orderBy: [{ mustReportAt: 'asc' }, { createdAt: 'asc' }],
        });

        if (items.length === 0) {
            return this.generateForStation(stationId, hours);
        }

        return {
            stationId,
            generatedAt: now.toISOString(),
            items: items.map((item) => this.toDto(item)),
        };
    }

    async updateStatus(id: string, status: CrewCallStatus, notes?: string) {
        const existing = await this.prisma.crewCall.findUnique({
            where: { id },
            select: { id: true },
        });

        if (!existing) {
            throw new NotFoundException(`CrewCall ${id} not found`);
        }

        const updated = await this.prisma.crewCall.update({
            where: { id },
            data: {
                status,
                notes: notes ?? undefined,
            },
            include: {
                crew: {
                    select: {
                        id: true,
                        status: true,
                        availableFrom: true,
                        requiredNoticeMinutes: true,
                    },
                },
                trainRun: {
                    include: {
                        train: { select: { number: true, priority: true } },
                    },
                },
                generatedFromVersion: {
                    select: { id: true, createdAt: true },
                },
            },
        });

        await this.prisma.auditLog.create({
            data: {
                action: 'CREW_CALL_STATUS_UPDATED',
                entityType: 'CrewCall',
                entityId: updated.id,
                payload: {
                    status,
                    notes: notes ?? null,
                } as any,
            },
        });

        return this.toDto(updated);
    }

    private resolveStatus(crewAvailableFrom: Date | null, mustReportAt: Date, now: Date) {
        if (!crewAvailableFrom) {
            return now >= mustReportAt ? CrewCallStatus.MISSED : CrewCallStatus.PLANNED;
        }
        if (crewAvailableFrom.getTime() <= mustReportAt.getTime()) {
            return CrewCallStatus.CONFIRMED;
        }
        if (now >= mustReportAt) {
            return CrewCallStatus.MISSED;
        }
        return CrewCallStatus.PLANNED;
    }

    private shouldGenerateCrewCall(trainRun: {
        operationScenario?: 'FORMATION' | 'TRANSIT';
        requiresCrewChange?: boolean;
    }) {
        if (trainRun.operationScenario === 'FORMATION') return true;
        return trainRun.requiresCrewChange !== false;
    }

    private buildNotes(status: CrewCallStatus, crewAvailableFrom: Date | null, mustReportAt: Date) {
        if (!crewAvailableFrom) {
            return 'Бригада еще не назначена. Требуется подтверждение депо.';
        }
        if (status === CrewCallStatus.MISSED) {
            return 'Бригада не подтверждена к нормативу T-2 часа.';
        }
        if (crewAvailableFrom.getTime() > mustReportAt.getTime()) {
            return 'Бригада доступна позже норматива, требуется пересчет или замена.';
        }
        return 'Вызов бригады подтвержден по нормативу.';
    }

    private toDto(item: any) {
        return {
            id: item.id,
            status: item.status,
            notes: item.notes,
            mustReportAt: item.mustReportAt,
            acceptedLocomotiveAt: item.acceptedLocomotiveAt,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
            crew: item.crew
                ? {
                    id: item.crew.id,
                    status: item.crew.status,
                    availableFrom: item.crew.availableFrom,
                    requiredNoticeMinutes: item.crew.requiredNoticeMinutes,
                }
                : null,
            trainRun: item.trainRun
                ? {
                    id: item.trainRun.id,
                    number: item.trainRun.train.number,
                    priority: item.trainRun.train.priority,
                    scheduledDeparture: item.trainRun.scheduledDeparture,
                    operationScenario: item.trainRun.operationScenario,
                    requiresCrewChange: item.trainRun.requiresCrewChange,
                    requiresLocoChange: item.trainRun.requiresLocoChange,
                }
                : null,
            version: item.generatedFromVersion
                ? {
                    id: item.generatedFromVersion.id,
                    createdAt: item.generatedFromVersion.createdAt,
                }
                : null,
        };
    }
}
