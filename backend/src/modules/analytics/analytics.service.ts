import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

type NotificationLevel = 'info' | 'warning' | 'critical';

@Injectable()
export class AnalyticsService {
    constructor(private readonly prisma: PrismaService) { }

    async getNodeOverview(stationId: string, versionId?: string) {
        // Get target version
        let targetVersionId = versionId;
        if (!targetVersionId) {
            const latest = await this.prisma.scheduleVersion.findFirst({
                where: { stationId },
                orderBy: { createdAt: 'desc' },
                select: { id: true },
            });
            targetVersionId = latest?.id;
        }

        if (!targetVersionId) {
            return {
                stationId,
                versionId: null,
                totalTrains: 0,
                avgDelayMinutes: 0,
                conflictsCountByType: {},
                trackOccupancyRate: 0,
                locomotiveUtilization: 0,
                crewUtilization: 0,
                avgIdleTimeMinutes: 0,
                totalIdleLocos: 0,
            };
        }

        const allocations = await this.prisma.allocation.findMany({
            where: { scheduleVersionId: targetVersionId },
            include: {
                trainRun: { include: { train: { select: { priority: true } } } },
            },
        });

        const [trackCount, locoCount, crewCount, availableLocomotives] = await Promise.all([
            this.prisma.track.count({ where: { stationId } }),
            this.prisma.locomotive.count({ where: { locationStationId: stationId } }),
            this.prisma.crew.count({ where: { depot: { locomotives: { some: { locationStationId: stationId } } } } }),
            this.prisma.locomotive.findMany({ 
                where: { locationStationId: stationId, status: 'AVAILABLE' },
                select: { availableFrom: true }
            })
        ]);

        const totalTrains = allocations.length;

        // Avg delay
        const totalDelayMs = allocations.reduce((acc, a) => {
            const delta = a.plannedDeparture.getTime() - a.trainRun.scheduledDeparture.getTime();
            return acc + Math.max(0, delta);
        }, 0);
        const avgDelayMinutes = totalTrains > 0 ? Math.round(totalDelayMs / totalTrains / 60_000) : 0;

        // Conflicts count by type
        const conflictsCountByType: Record<string, number> = {
            track: 0,
            locomotive: 0,
            crew: 0,
            headway: 0,
        };

        for (const alloc of allocations) {
            const flags = alloc.conflictFlags as Record<string, boolean>;
            if (flags) {
                for (const [key, val] of Object.entries(flags)) {
                    if (val) conflictsCountByType[key] = (conflictsCountByType[key] ?? 0) + 1;
                }
            }
        }

        // Track occupancy rate
        const occupiedTracks = new Set(allocations.map((a) => a.assignedTrackId).filter(Boolean)).size;
        const trackOccupancyRate = trackCount > 0 ? Math.round((occupiedTracks / trackCount) * 100) : 0;

        // Locomotive utilization
        const usedLocos = new Set(allocations.map((a) => a.assignedLocomotiveId).filter(Boolean)).size;
        const locomotiveUtilization = locoCount > 0 ? Math.round((usedLocos / locoCount) * 100) : 0;

        // Crew utilization
        const usedCrews = new Set(allocations.map((a) => a.assignedCrewId).filter(Boolean)).size;
        const crewUtilization = crewCount > 0 ? Math.round((usedCrews / crewCount) * 100) : 0;

        // Idle metrics
        const now = new Date();
        let totalIdleMinutes = 0;
        let totalIdleLocos = 0;
        for (const loco of availableLocomotives) {
            const idleMins = Math.floor((now.getTime() - loco.availableFrom.getTime()) / 60000);
            if (idleMins > 0) {
                totalIdleMinutes += idleMins;
                totalIdleLocos++;
            }
        }
        const avgIdleTimeMinutes = totalIdleLocos > 0 ? Math.round(totalIdleMinutes / totalIdleLocos) : 0;

        return {
            stationId,
            versionId: targetVersionId,
            totalTrains,
            avgDelayMinutes,
            conflictsCountByType,
            trackOccupancyRate,
            locomotiveUtilization,
            crewUtilization,
            avgIdleTimeMinutes,
            totalIdleLocos
        };
    }

    async getAssistantInsights(stationId: string) {
        const overview = await this.getNodeOverview(stationId);
        const latestVersion = overview.versionId
            ? await this.prisma.scheduleVersion.findUnique({
                where: { id: overview.versionId },
                select: { id: true, reason: true, createdAt: true },
            })
            : null;

        const [pendingApprovals, recentEvents] = await Promise.all([
            this.prisma.scheduleVersion.count({
                where: { stationId, approvalStatus: 'PENDING' },
            }),
            this.prisma.operationalEvent.findMany({
                where: { stationId },
                orderBy: { createdAt: 'desc' },
                take: 3,
                select: { id: true, type: true, createdAt: true },
            }),
        ]);

        const totalConflicts = Object.values(overview.conflictsCountByType ?? {}).reduce(
            (acc, n) => acc + Number(n || 0),
            0,
        );

        const recommendations: string[] = [];
        if (pendingApprovals > 0) {
            recommendations.push(`Есть ${pendingApprovals} версий в ожидании согласования диспетчера.`);
        }
        if (totalConflicts > 0) {
            recommendations.push(`Приоритет №1: устранить конфликты (${totalConflicts} шт.).`);
        } else {
            recommendations.push('Критичных конфликтов нет, можно запускать дополнительные события для стресс-теста.');
        }
        if (overview.avgDelayMinutes > 15) {
            recommendations.push(`Средняя задержка ${overview.avgDelayMinutes} мин. Рекомендуется пересчитать слоты отправления.`);
        }
        if (overview.crewUtilization >= 85) {
            recommendations.push(`Загрузка бригад высокая (${overview.crewUtilization}%). Желательно подготовить резервную бригаду.`);
        }
        if (overview.locomotiveUtilization >= 90) {
            recommendations.push(`Загрузка локомотивов ${overview.locomotiveUtilization}%. Увеличивается риск дефицита тяги.`);
        }
        if (overview.trackOccupancyRate >= 80) {
            recommendations.push(`Занятость путей ${overview.trackOccupancyRate}%. Контролируйте headway и операции на пути.`);
        }
        if (recommendations.length < 4) {
            recommendations.push('Текущий график стабилен. Проверьте очередь ожидания и подтверждения бригад перед следующей отправкой.');
        }

        return {
            stationId,
            generatedAt: new Date().toISOString(),
            latestVersion: latestVersion
                ? {
                    id: latestVersion.id,
                    reason: latestVersion.reason,
                    createdAt: latestVersion.createdAt,
                }
                : null,
            overview,
            recentEvents: recentEvents.map((e) => ({
                id: e.id,
                type: e.type,
                label: this.eventTypeLabel(e.type),
                createdAt: e.createdAt,
            })),
            recommendations: recommendations.slice(0, 6),
        };
    }

    async getNotifications(stationId: string) {
        const overview = await this.getNodeOverview(stationId);
        const latestVersionId = overview.versionId;

        const [pendingApprovals, recentEvents] = await Promise.all([
            this.prisma.scheduleVersion.count({
                where: { stationId, approvalStatus: 'PENDING' },
            }),
            this.prisma.operationalEvent.findMany({
                where: { stationId },
                orderBy: { createdAt: 'desc' },
                take: 8,
                select: { id: true, type: true, createdAt: true },
            }),
        ]);

        const totalConflicts = Object.values(overview.conflictsCountByType ?? {}).reduce(
            (acc, n) => acc + Number(n || 0),
            0,
        );

        const items: Array<{
            id: string;
            level: NotificationLevel;
            title: string;
            message: string;
            createdAt: string;
            source: string;
        }> = [];

        if (pendingApprovals > 0) {
            items.push({
                id: `pending-${stationId}`,
                level: 'warning',
                title: 'Ожидают согласования',
                message: `В очереди ${pendingApprovals} версий расписания.`,
                createdAt: new Date().toISOString(),
                source: 'schedule',
            });
        }

        if (totalConflicts > 0) {
            items.push({
                id: `conflicts-${latestVersionId ?? stationId}`,
                level: totalConflicts >= 5 ? 'critical' : 'warning',
                title: 'Обнаружены конфликты',
                message: `В текущей версии найдено ${totalConflicts} конфликтов.`,
                createdAt: new Date().toISOString(),
                source: 'conflict-detection',
            });
        } else if (latestVersionId) {
            items.push({
                id: `conflicts-ok-${latestVersionId}`,
                level: 'info',
                title: 'Конфликтов нет',
                message: 'Последняя версия расписания прошла проверку конфликтов.',
                createdAt: new Date().toISOString(),
                source: 'conflict-detection',
            });
        }

        for (const event of recentEvents) {
            items.push({
                id: event.id,
                level: this.eventLevel(event.type),
                title: this.eventTypeLabel(event.type),
                message: `Зарегистрировано событие: ${this.eventTypeLabel(event.type)}.`,
                createdAt: event.createdAt.toISOString(),
                source: 'events',
            });
        }

        items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        return {
            stationId,
            generatedAt: new Date().toISOString(),
            unreadCount: items.length,
            items: items.slice(0, 12),
        };
    }

    private eventTypeLabel(type: string) {
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
        return labels[type] ?? type;
    }

    private eventLevel(type: string): NotificationLevel {
        if (type === 'LOCOMOTIVE_FAILURE' || type === 'TRACK_CLOSURE' || type === 'TRACK_BLOCKED') return 'critical';
        if (type === 'CREW_ABSENCE' || type === 'CREW_UNAVAILABLE' || type === 'LATE_TRAIN' || type === 'TRAIN_DELAY') return 'warning';
        return 'info';
    }
}
