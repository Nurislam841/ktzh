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
        if (!station) throw new NotFoundException(`Station ${dto.stationId} not found`);

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
        const reason = `Event: ${dto.type}`;
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
            eventId: event.id,
            newVersionId: versionId,
            summary,
            baseVersionId: latestVersion?.id ?? null,
        };
    }

    private async applyEventEffect(dto: CreateEventDto) {
        const payload = dto.payload as Record<string, string>;

        switch (dto.type) {
            case 'LOCOMOTIVE_FAILURE':
                if (payload.locomotiveId) {
                    await this.prisma.locomotive.update({
                        where: { id: payload.locomotiveId },
                        data: { status: 'FAILED' },
                    });
                }
                break;

            case 'CREW_UNAVAILABLE':
                if (payload.crewId) {
                    await this.prisma.crew.update({
                        where: { id: payload.crewId },
                        data: { status: 'UNAVAILABLE' },
                    });
                }
                break;

            case 'TRAIN_DELAY':
                if (payload.trainRunId && payload.delayMinutes) {
                    await this.prisma.trainRun.update({
                        where: { id: payload.trainRunId },
                        data: {
                            currentDelayMinutes: { increment: parseInt(String(payload.delayMinutes)) },
                        },
                    });
                }
                break;

            case 'TRACK_BLOCKED':
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

            case 'MAINTENANCE_STARTED':
                if (payload.locomotiveId) {
                    await this.prisma.locomotive.update({
                        where: { id: payload.locomotiveId },
                        data: { status: 'MAINTENANCE' },
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
