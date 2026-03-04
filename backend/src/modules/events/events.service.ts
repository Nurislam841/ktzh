import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SchedulingService } from '../scheduling/scheduling.service';
import { CreateEventDto } from './dto/create-event.dto';
import { OperationalEventType } from '@prisma/client';

@Injectable()
export class EventsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly scheduling: SchedulingService,
    ) { }

    async createEvent(dto: CreateEventDto) {
        const station = await this.prisma.station.findUnique({
            where: { id: dto.stationId },
        });
        if (!station) throw new NotFoundException(`Станция ${dto.stationId} не найдена`);

        // Persist event
        const event = await this.prisma.operationalEvent.create({
            data: {
                stationId: dto.stationId,
                type: dto.type as OperationalEventType,
                payload: dto.payload as any,
            },
        });

        // Apply resource mutations based on event type
        await this.applyEventEffect(dto);

        // Get latest version as base
        const latestVersion = await this.scheduling.getLatestVersion(dto.stationId);

        // Run rescheduler
        const reason = this.getReasonByEventType(dto.type);
        const { versionId, summary } = await this.scheduling.runRescheduler(
            dto.stationId,
            reason,
            latestVersion?.id ?? null,
        );

        // Audit log
        await this.prisma.auditLog.create({
            data: {
                action: 'CREATE_EVENT',
                entityType: 'OperationalEvent',
                entityId: event.id,
                payload: { reason, newVersionId: versionId } as any,
            },
        });

        return {
            eventClass: 'DISRUPTION_EVENT',
            eventId: event.id,
            newVersionId: versionId,
            summary,
            baseVersionId: latestVersion?.id ?? null,
        };
    }

    private getReasonByEventType(type: string) {
        const labels: Record<string, string> = {
            TRACK_CLOSURE: 'Закрытие пути',
            TRACK_BLOCKED: 'Блокировка пути',
            LOCOMOTIVE_FAILURE: 'Отказ локомотива',
            CREW_ABSENCE: 'Отсутствие бригады',
            CREW_UNAVAILABLE: 'Недоступность бригады',
            LATE_TRAIN: 'Опоздание поезда',
            TRAIN_DELAY: 'Задержка поезда',
            MAINTENANCE: 'Техобслуживание',
            MAINTENANCE_STARTED: 'Начало ремонта',
            MAINTENANCE_ENDED: 'Завершение ремонта',
            WEATHER: 'Погодные ограничения',
            CAPACITY_CONFLICT: 'Конфликт пропускной способности',
        };
        return `Событие: ${labels[type] ?? type}`;
    }

    private async applyEventEffect(dto: CreateEventDto) {
        const payload = dto.payload as Record<string, string>;

        switch (dto.type) {
            case 'LOCOMOTIVE_FAILURE':
            case 'MAINTENANCE_STARTED':
            case 'MAINTENANCE':
                if (payload.locomotiveId) {
                    await this.prisma.locomotive.update({
                        where: { id: payload.locomotiveId },
                        data: {
                            status: 'MAINTENANCE',
                            maintenanceFrom: payload.from ? new Date(payload.from) : new Date(),
                            maintenanceTo: payload.to ? new Date(payload.to) : null,
                        },
                    });
                }
                if (payload.trackId) {
                    await this.prisma.track.update({
                        where: { id: payload.trackId },
                        data: {
                            status: 'MAINTENANCE',
                            maintenanceFrom: payload.from ? new Date(payload.from) : new Date(),
                            maintenanceTo: payload.to ? new Date(payload.to) : new Date(Date.now() + 2 * 60 * 60_000),
                        },
                    });
                }
                break;

            case 'CREW_UNAVAILABLE':
            case 'CREW_ABSENCE':
                if (payload.crewId) {
                    await this.prisma.crew.update({
                        where: { id: payload.crewId },
                        data: { status: 'UNAVAILABLE' },
                    });
                }
                break;

            case 'TRAIN_DELAY':
            case 'LATE_TRAIN':
                if (payload.trainRunId && payload.delayMinutes) {
                    const delayMinutes = parseInt(String(payload.delayMinutes), 10);
                    await this.prisma.trainRun.update({
                        where: { id: payload.trainRunId },
                        data: {
                            currentDelayMinutes: { increment: Number.isNaN(delayMinutes) ? 0 : delayMinutes },
                            status: 'DELAYED',
                        },
                    });
                }
                break;

            case 'TRACK_BLOCKED':
            case 'TRACK_CLOSURE':
            case 'WEATHER':
                if (payload.trackId) {
                    await this.prisma.track.update({
                        where: { id: payload.trackId },
                        data: {
                            status: 'MAINTENANCE',
                            maintenanceFrom: payload.from ? new Date(payload.from) : new Date(),
                            maintenanceTo: payload.to ? new Date(payload.to) : new Date(Date.now() + 2 * 60 * 60_000),
                        },
                    });
                }
                break;

            case 'MAINTENANCE_ENDED':
                if (payload.locomotiveId) {
                    await this.prisma.locomotive.update({
                        where: { id: payload.locomotiveId },
                        data: { status: 'AVAILABLE', availableFrom: new Date() },
                    });
                }
                if (payload.trackId) {
                    await this.prisma.track.update({
                        where: { id: payload.trackId },
                        data: {
                            status: 'FREE',
                            maintenanceFrom: null,
                            maintenanceTo: null,
                        },
                    });
                }
                break;

            case 'CAPACITY_CONFLICT':
                // No direct resource mutation. Conflict is resolved via rescheduling.
                break;
        }
    }

    async listEvents(stationId: string, page = 1, limit = 20) {
        const skip = (page - 1) * limit;
        const [events, total] = await Promise.all([
            this.prisma.operationalEvent.findMany({
                where: { stationId },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            this.prisma.operationalEvent.count({ where: { stationId } }),
        ]);
        return { events, total, page, limit };
    }
}
