import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class NodeService {
    constructor(private readonly prisma: PrismaService) { }

    async listStations() {
        const stations = await this.prisma.station.findMany({
            select: {
                id: true,
                name: true,
                code: true,
                _count: {
                    select: {
                        scheduleVersions: true,
                        trainRunsOrigin: true,
                        locomotives: true,
                        tracks: true,
                    },
                },
            },
            orderBy: { name: 'asc' },
        });

        return {
            stations: stations.map((s) => ({
                id: s.id,
                name: s.name,
                code: s.code,
                versions: s._count.scheduleVersions,
                trainRuns: s._count.trainRunsOrigin,
                locomotives: s._count.locomotives,
                tracks: s._count.tracks,
                active: s._count.scheduleVersions > 0 || s._count.trainRunsOrigin > 0,
            })),
        };
    }

    async getOverview(stationId: string, from?: string, to?: string, hours?: string) {
        const now = new Date();
        const fromDate = from ? new Date(from) : now;
        const hoursWindow = Number.isFinite(Number(hours)) && Number(hours) > 0 ? Number(hours) : 6;
        const toDate = to ? new Date(to) : new Date(fromDate.getTime() + hoursWindow * 60 * 60_000);

        // Get latest version for this station
        const latestVersion = await this.prisma.scheduleVersion.findFirst({
            where: { stationId },
            orderBy: { createdAt: 'desc' },
        });

        if (!latestVersion) {
            return { stationId, versionId: null, trainRuns: [], tracks: [] };
        }

    // ──────────────────────────────────────────────────────────────
    // INTERNAL ALGORITHMS
        const [allocations, trainRuns, tracks] = await Promise.all([
            this.prisma.allocation.findMany({
                where: {
                    scheduleVersionId: latestVersion.id,
                    plannedDeparture: { gte: fromDate, lte: toDate },
                },
                include: {
                    trainRun: {
                        include: {
                            train: true,
                            originStation: { select: { id: true, name: true, code: true } },
                            destinationStation: { select: { id: true, name: true, code: true } },
                        },
                    },
                    assignedTrack: true,
                    assignedLocomotive: true,
                    assignedCrew: true,
                },
                orderBy: { plannedDeparture: 'asc' },
            }),
            this.prisma.trainRun.findMany({
                where: {
                    originStationId: stationId,
                    scheduledDeparture: { gte: fromDate, lte: toDate },
                },
                select: { id: true },
            }),
            this.prisma.track.findMany({
                where: { stationId },
            }),
        ]);

        const enriched = allocations.map((a) => ({
            allocationId: a.id,
            trainRun: {
                id: a.trainRun.id,
                number: a.trainRun.train.number,
                priority: a.trainRun.train.priority,
                scheduledDeparture: a.trainRun.scheduledDeparture,
                scheduledArrival: a.trainRun.scheduledArrival,
                currentDelayMinutes: a.trainRun.currentDelayMinutes,
                status: a.trainRun.status,
                operationScenario: a.trainRun.operationScenario,
                requiresCrewChange: a.trainRun.requiresCrewChange,
                requiresLocoChange: a.trainRun.requiresLocoChange,
                origin: a.trainRun.originStation,
                destination: a.trainRun.destinationStation,
            },
            plannedDeparture: a.plannedDeparture,
            plannedArrival: a.plannedArrival,
            slotStatus: a.slotStatus,
            track: a.assignedTrack ? { id: a.assignedTrack.id, name: a.assignedTrack.name } : null,
            locomotive: a.assignedLocomotive
                ? {
                    id: a.assignedLocomotive.id,
                    label: `${a.assignedLocomotive.series}${a.assignedLocomotive.number}`,
                }
                : null,
            crew: a.assignedCrew ? { id: a.assignedCrew.id } : null,
            conflictFlags: a.conflictFlags,
            notes: a.notes,
        }));

        return {
            stationId,
            versionId: latestVersion.id,
            versionCreatedAt: latestVersion.createdAt,
            trainRuns: enriched,
            tracks: tracks.map((t) => ({
                id: t.id,
                name: t.name,
                status: t.status,
            })),
        };
    }

    async getSnapshot(stationId: string, at?: string) {
        const snapshotAt = at ? new Date(at) : new Date();
        if (Number.isNaN(snapshotAt.getTime())) {
            throw new BadRequestException('Параметр at должен быть корректной датой/временем');
        }

        const windowStart = new Date(snapshotAt.getTime() - 12 * 60 * 60_000);
        const windowEnd = new Date(snapshotAt.getTime() + 12 * 60 * 60_000);

        const [station, versionAtTime] = await Promise.all([
            this.prisma.station.findUnique({
                where: { id: stationId },
                select: { id: true, name: true, code: true },
            }),
            this.prisma.scheduleVersion.findFirst({
                where: {
                    stationId,
                    createdAt: { lte: snapshotAt },
                },
                orderBy: { createdAt: 'desc' },
                select: { id: true, createdAt: true },
            }),
        ]);

        const latestVersion = versionAtTime ?? await this.prisma.scheduleVersion.findFirst({
            where: { stationId },
            orderBy: { createdAt: 'desc' },
            select: { id: true, createdAt: true },
        });

        if (!latestVersion) {
            return {
                stationId,
                stationName: station?.name ?? null,
                stationCode: station?.code ?? null,
                snapshotAt: snapshotAt.toISOString(),
                versionId: null,
                versionCreatedAt: null,
                summary: {
                    activeRoutes: 0,
                    upcomingRoutes: 0,
                    occupiedTracks: 0,
                    freeTracks: 0,
                    activeLocomotives: 0,
                    idleLocomotives: 0,
                    maintenanceLocomotives: 0,
                    activeCrews: 0,
                    idleCrews: 0,
                    activeBindings: 0,
                    recentEvents: 0,
                    stationsInvolved: [],
                },
                activeAllocations: [],
                upcomingAllocations: [],
                tracks: [],
                locomotives: [],
                crews: [],
                bindings: [],
                recentEvents: [],
            };
        }

        const [allocations, tracks, stationLocomotives, activeBindings, recentEvents] = await Promise.all([
            this.prisma.allocation.findMany({
                where: {
                    scheduleVersionId: latestVersion.id,
                    plannedDeparture: { gte: windowStart },
                    plannedArrival: { lte: windowEnd },
                },
                include: {
                    trainRun: {
                        include: {
                            train: true,
                            originStation: { select: { id: true, name: true, code: true } },
                            destinationStation: { select: { id: true, name: true, code: true } },
                        },
                    },
                    assignedTrack: { select: { id: true, name: true } },
                    assignedLocomotive: {
                        include: {
                            depot: { select: { id: true, name: true } },
                            locationStation: { select: { id: true, name: true } },
                        },
                    },
                    assignedCrew: { select: { id: true, status: true, availableFrom: true, requiredNoticeMinutes: true, depotId: true } },
                },
                orderBy: { plannedDeparture: 'asc' },
            }),
            this.prisma.track.findMany({
                where: { stationId },
                orderBy: { name: 'asc' },
                select: {
                    id: true,
                    name: true,
                    status: true,
                    maintenanceFrom: true,
                    maintenanceTo: true,
                },
            }),
            this.prisma.locomotive.findMany({
                where: { locationStationId: stationId },
                include: {
                    depot: { select: { id: true, name: true } },
                    locationStation: { select: { id: true, name: true } },
                },
                orderBy: [{ status: 'asc' }, { availableFrom: 'asc' }],
            }),
            this.prisma.bindingPlan.findMany({
                where: {
                    turnaroundStationId: stationId,
                    arrivalDt: { lte: snapshotAt },
                    departureDt: { gte: snapshotAt },
                },
                include: {
                    arrivalTrain: { select: { id: true, number: true } },
                    departureTrain: { select: { id: true, number: true } },
                    allocations: {
                        include: {
                            locomotive: {
                                include: {
                                    depot: { select: { id: true, name: true } },
                                    locationStation: { select: { id: true, name: true } },
                                },
                            },
                        },
                    },
                },
                orderBy: { arrivalDt: 'asc' },
            }),
            this.prisma.operationalEvent.findMany({
                where: {
                    stationId,
                    createdAt: { lte: snapshotAt },
                },
                orderBy: { createdAt: 'desc' },
                take: 20,
            }),
        ]);

        const activeAllocations = allocations.filter((allocation) =>
            allocation.plannedArrival.getTime() <= snapshotAt.getTime()
            && allocation.plannedDeparture.getTime() >= snapshotAt.getTime(),
        );

        const upcomingAllocations = allocations
            .filter((allocation) => allocation.plannedDeparture.getTime() > snapshotAt.getTime())
            .slice(0, 12);

        const activeTrackMap = new Map(
            activeAllocations
                .filter((allocation) => allocation.assignedTrack)
                .map((allocation) => [allocation.assignedTrack!.id, allocation]),
        );
        const activeLocoMap = new Map(
            activeAllocations
                .filter((allocation) => allocation.assignedLocomotive)
                .map((allocation) => [allocation.assignedLocomotive!.id, allocation]),
        );
        const activeCrewMap = new Map(
            activeAllocations
                .filter((allocation) => allocation.assignedCrew)
                .map((allocation) => [allocation.assignedCrew!.id, allocation]),
        );

        const locomotiveMap = new Map<string, any>();
        stationLocomotives.forEach((locomotive) => {
            locomotiveMap.set(locomotive.id, locomotive);
        });
        activeAllocations.forEach((allocation) => {
            if (allocation.assignedLocomotive && !locomotiveMap.has(allocation.assignedLocomotive.id)) {
                locomotiveMap.set(allocation.assignedLocomotive.id, allocation.assignedLocomotive);
            }
        });

        const depotIds = Array.from(
            new Set(
                Array.from(locomotiveMap.values())
                    .map((locomotive: any) => locomotive.depotId)
                    .filter((value): value is string => Boolean(value)),
            ),
        );
        const activeCrewIds = Array.from(activeCrewMap.keys());
        const crews = depotIds.length || activeCrewIds.length
            ? await this.prisma.crew.findMany({
                where: {
                    OR: [
                        depotIds.length ? { depotId: { in: depotIds } } : undefined,
                        activeCrewIds.length ? { id: { in: activeCrewIds } } : undefined,
                    ].filter(Boolean) as any,
                },
                include: {
                    depot: { select: { id: true, name: true } },
                },
                orderBy: [{ status: 'asc' }, { availableFrom: 'asc' }],
            })
            : [];

        const formatAllocation = (allocation: any) => {
            const conflictFlags = (allocation.conflictFlags ?? {}) as Record<string, boolean>;
            return {
                allocationId: allocation.id,
                trainRunId: allocation.trainRun.id,
                trainNumber: allocation.trainRun.train.number,
                routeLabel: `${allocation.trainRun.originStation?.name ?? '—'} → ${allocation.trainRun.destinationStation?.name ?? '—'}`,
                originStation: allocation.trainRun.originStation?.name ?? null,
                destinationStation: allocation.trainRun.destinationStation?.name ?? null,
                plannedArrival: allocation.plannedArrival.toISOString(),
                plannedDeparture: allocation.plannedDeparture.toISOString(),
                status: allocation.trainRun.status,
                slotStatus: allocation.slotStatus,
                trackName: allocation.assignedTrack?.name ?? null,
                locomotiveLabel: allocation.assignedLocomotive
                    ? `${allocation.assignedLocomotive.series}${allocation.assignedLocomotive.number}`
                    : null,
                crewId: allocation.assignedCrew?.id ?? null,
                conflictCount: Object.values(conflictFlags).filter(Boolean).length,
                conflictFlags,
                notes: allocation.notes ?? null,
            };
        };

        const snapshotTracks = tracks.map((track) => {
            const activeAllocation = activeTrackMap.get(track.id);
            const maintenanceActive =
                track.status === 'MAINTENANCE'
                || this.overlapsMaintenance(snapshotAt, track.maintenanceFrom, track.maintenanceTo);

            return {
                id: track.id,
                name: track.name,
                operationalStatus: maintenanceActive
                    ? 'MAINTENANCE'
                    : activeAllocation
                        ? 'OCCUPIED'
                        : 'FREE',
                occupiedByTrainNumber: activeAllocation?.trainRun.train.number ?? null,
                occupiedUntil: activeAllocation?.plannedDeparture?.toISOString?.() ?? null,
                maintenanceFrom: track.maintenanceFrom?.toISOString?.() ?? null,
                maintenanceTo: track.maintenanceTo?.toISOString?.() ?? null,
            };
        });

        const snapshotLocomotives = Array.from(locomotiveMap.values()).map((locomotive: any) => {
            const activeAllocation = activeLocoMap.get(locomotive.id);
            const maintenanceActive =
                locomotive.status === 'MAINTENANCE'
                || this.overlapsMaintenance(snapshotAt, locomotive.maintenanceFrom, locomotive.maintenanceTo);

            const operationalStatus = activeAllocation
                ? 'WORKING'
                : maintenanceActive
                    ? 'MAINTENANCE'
                    : locomotive.availableFrom.getTime() <= snapshotAt.getTime()
                        ? 'IDLE'
                        : 'UPCOMING';

            return {
                id: locomotive.id,
                label: `${locomotive.series}${locomotive.number}`,
                series: locomotive.series,
                number: locomotive.number,
                depotName: locomotive.depot?.name ?? null,
                locationStation: locomotive.locationStation?.name ?? station?.name ?? null,
                status: locomotive.status,
                operationalStatus,
                availableFrom: locomotive.availableFrom.toISOString(),
                idleMinutes: operationalStatus === 'IDLE'
                    ? Math.max(0, Math.round((snapshotAt.getTime() - locomotive.availableFrom.getTime()) / 60_000))
                    : null,
                currentTrainNumber: activeAllocation?.trainRun.train.number ?? null,
                currentTrackName: activeAllocation?.assignedTrack?.name ?? null,
                maintenanceFrom: locomotive.maintenanceFrom?.toISOString?.() ?? null,
                maintenanceTo: locomotive.maintenanceTo?.toISOString?.() ?? null,
            };
        });

        const snapshotCrews = crews.map((crew) => {
            const activeAllocation = activeCrewMap.get(crew.id);
            const operationalStatus = activeAllocation
                ? 'WORKING'
                : crew.status === 'UNAVAILABLE'
                    ? 'UNAVAILABLE'
                    : crew.status === 'RESTING'
                        ? 'RESTING'
                        : crew.availableFrom.getTime() <= snapshotAt.getTime()
                            ? 'IDLE'
                            : 'UPCOMING';

            return {
                id: crew.id,
                depotName: crew.depot?.name ?? null,
                status: crew.status,
                operationalStatus,
                availableFrom: crew.availableFrom.toISOString(),
                requiredNoticeMinutes: crew.requiredNoticeMinutes,
                currentTrainNumber: activeAllocation?.trainRun.train.number ?? null,
            };
        });

        const snapshotBindings = activeBindings.map((binding) => {
            const locomotive = binding.allocations[0]?.locomotive;
            return {
                id: binding.id,
                status: binding.status,
                arrivalDt: binding.arrivalDt.toISOString(),
                departureDt: binding.departureDt.toISOString(),
                dwellMinutes: binding.dwellMinutes,
                arrivalTrainNumber: binding.arrivalTrain?.number ?? null,
                departureTrainNumber: binding.departureTrain?.number ?? null,
                locomotiveLabel: locomotive ? `${locomotive.series}${locomotive.number}` : null,
                depotName: locomotive?.depot?.name ?? null,
            };
        });

        const stationsInvolved = Array.from(
            new Set(
                [...activeAllocations, ...upcomingAllocations].flatMap((allocation) => [
                    allocation.trainRun.originStation?.name,
                    allocation.trainRun.destinationStation?.name,
                ]).filter((value): value is string => Boolean(value)),
            ),
        ).sort((left, right) => left.localeCompare(right, 'ru'));

        return {
            stationId,
            stationName: station?.name ?? null,
            stationCode: station?.code ?? null,
            snapshotAt: snapshotAt.toISOString(),
            versionId: latestVersion.id,
            versionCreatedAt: latestVersion.createdAt.toISOString(),
            summary: {
                activeRoutes: activeAllocations.length,
                upcomingRoutes: upcomingAllocations.length,
                occupiedTracks: snapshotTracks.filter((track) => track.operationalStatus === 'OCCUPIED').length,
                freeTracks: snapshotTracks.filter((track) => track.operationalStatus === 'FREE').length,
                activeLocomotives: snapshotLocomotives.filter((locomotive) => locomotive.operationalStatus === 'WORKING').length,
                idleLocomotives: snapshotLocomotives.filter((locomotive) => locomotive.operationalStatus === 'IDLE').length,
                maintenanceLocomotives: snapshotLocomotives.filter((locomotive) => locomotive.operationalStatus === 'MAINTENANCE').length,
                activeCrews: snapshotCrews.filter((crew) => crew.operationalStatus === 'WORKING').length,
                idleCrews: snapshotCrews.filter((crew) => crew.operationalStatus === 'IDLE').length,
                activeBindings: snapshotBindings.length,
                recentEvents: recentEvents.length,
                stationsInvolved,
            },
            activeAllocations: activeAllocations.map(formatAllocation),
            upcomingAllocations: upcomingAllocations.map(formatAllocation),
            tracks: snapshotTracks,
            locomotives: snapshotLocomotives,
            crews: snapshotCrews,
            bindings: snapshotBindings,
            recentEvents: recentEvents.map((event) => ({
                id: event.id,
                type: event.type,
                createdAt: event.createdAt.toISOString(),
                payload: event.payload,
            })),
        };
    }

    async getResources(stationId: string) {
        const [tracks, locomotives, crews] = await Promise.all([
            this.prisma.track.findMany({
                where: { stationId },
                orderBy: { name: 'asc' },
                select: {
                    id: true,
                    name: true,
                    status: true,
                    maintenanceFrom: true,
                    maintenanceTo: true,
                },
            }),
            this.prisma.locomotive.findMany({
                where: { locationStationId: stationId },
                orderBy: [{ status: 'asc' }, { availableFrom: 'asc' }],
                select: {
                    id: true,
                    series: true,
                    number: true,
                    status: true,
                    availableFrom: true,
                    maintenanceFrom: true,
                    maintenanceTo: true,
                },
            }),
            this.prisma.crew.findMany({
                where: {
                    depot: {
                        locomotives: {
                            some: { locationStationId: stationId },
                        },
                    },
                },
                orderBy: [{ status: 'asc' }, { availableFrom: 'asc' }],
                select: {
                    id: true,
                    status: true,
                    availableFrom: true,
                    requiredNoticeMinutes: true,
                },
            }),
        ]);

        return {
            stationId,
            summary: {
                tracks: tracks.length,
                locomotives: locomotives.length,
                crews: crews.length,
                availableTracks: tracks.filter((t) => t.status === 'FREE').length,
                availableLocomotives: locomotives.filter((l) => l.status === 'AVAILABLE').length,
                availableCrews: crews.filter((c) => c.status === 'AVAILABLE').length,
            },
            tracks,
            locomotives: locomotives.map((l) => ({
                ...l,
                label: `${l.series}${l.number}`,
            })),
            crews,
        };
    }

    async getDecisionQueue(stationId: string, hours?: string) {
        const now = new Date();
        const hoursWindow = Number.isFinite(Number(hours)) && Number(hours) > 0 ? Number(hours) : 6;
        const toDate = new Date(now.getTime() + hoursWindow * 60 * 60_000);

        const latestVersion = await this.prisma.scheduleVersion.findFirst({
            where: { stationId },
            orderBy: { createdAt: 'desc' },
            select: { id: true, createdAt: true },
        });

        if (!latestVersion) {
            return {
                stationId,
                versionId: null,
                generatedAt: now.toISOString(),
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
                assignedTrack: { select: { id: true, name: true, status: true } },
                assignedLocomotive: {
                    select: {
                        id: true,
                        series: true,
                        number: true,
                        status: true,
                        availableFrom: true,
                        maintenanceFrom: true,
                        maintenanceTo: true,
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

        const items = allocations
            .map((allocation) => this.buildDecisionItem(allocation, now))
            .filter((item) => item !== null)
            .sort((a, b) => {
                const severityDelta =
                    this.severityWeight(b.severity) - this.severityWeight(a.severity);
                if (severityDelta !== 0) return severityDelta;
                return new Date(a.plannedDeparture).getTime() - new Date(b.plannedDeparture).getTime();
            });

        return {
            stationId,
            versionId: latestVersion.id,
            versionCreatedAt: latestVersion.createdAt,
            generatedAt: now.toISOString(),
            items,
        };
    }

    async getGlobalLocomotives() {
        const [locos, models] = await Promise.all([
            this.prisma.locomotive.findMany({
                include: {
                    depot: { select: { name: true } },
                    locationStation: { select: { name: true } },
                },
                orderBy: [{ series: 'asc' }, { number: 'asc' }],
            }),
            this.prisma.locomotiveModel.findMany({
                select: {
                    series: true,
                    maintenanceRules: {
                        orderBy: { createdAt: 'desc' },
                        take: 1,
                        select: {
                            to2KmMin: true,
                            to2KmMax: true,
                            to2DowntimeHours: true,
                            serviceKmMin: true,
                            serviceKmMax: true,
                            serviceDowntimeHours: true,
                        },
                    },
                },
            }),
        ]);

        const maintenanceBySeries = new Map(
            models.map((model) => [model.series.trim().toUpperCase(), model.maintenanceRules[0] ?? null]),
        );

        const formatRange = (min?: number | null, max?: number | null) => {
            if (min == null && max == null) return null;
            if (min != null && max != null) return `${min}-${max}`;
            return String(min ?? max);
        };

        return locos.map((l) => {
            const rule = maintenanceBySeries.get(l.series.trim().toUpperCase());

            return {
                id: l.id,
                series: l.series,
                number: l.number,
                status: l.status,
                depot: l.depot?.name || '-',
                station: l.locationStation?.name || '-',
                availableFrom: l.availableFrom.toISOString(),
                to2MileageRange: formatRange(rule?.to2KmMin, rule?.to2KmMax),
                to2DowntimeHours: rule?.to2DowntimeHours ?? null,
                serviceMileageRange: formatRange(rule?.serviceKmMin, rule?.serviceKmMax),
                serviceDowntimeHours: rule?.serviceDowntimeHours ?? null,
            };
        });
    }

    private buildDecisionItem(allocation: any, now: Date) {
        const plannedDeparture = allocation.plannedDeparture as Date;
        const scheduledDeparture = allocation.trainRun.scheduledDeparture as Date;
        const delayMinutes = Math.max(
            0,
            Math.round((plannedDeparture.getTime() - scheduledDeparture.getTime()) / 60_000),
        );
        const conflictFlags = (allocation.conflictFlags ?? {}) as Record<string, boolean>;
        const hasTrackConflict = Boolean(conflictFlags.track || conflictFlags.track_conflict || conflictFlags.headway || conflictFlags.headway_violation);
        const hasLocoConflict = Boolean(conflictFlags.locomotive || conflictFlags.loco_double_booking);
        const hasCrewConflict = Boolean(conflictFlags.crew || conflictFlags.crew_violation);

        const crew = allocation.assignedCrew;
        const crewNoticeMinutes = crew?.requiredNoticeMinutes ?? 120;
        const crewMustReportAt = new Date(plannedDeparture.getTime() - crewNoticeMinutes * 60_000);
        const locomotiveAcceptanceAt = new Date(plannedDeparture.getTime() - 60 * 60_000);
        const minutesUntilCall = Math.round((crewMustReportAt.getTime() - now.getTime()) / 60_000);

        const recommendations: string[] = [];
        const deadlineWarnings: Array<{ label: string; at: string; status: 'ok' | 'warning' | 'critical' }> = [];

        let summary = 'Контроль отправления';
        let severity: 'info' | 'warning' | 'critical' = 'info';

        if (!crew) {
            severity = minutesUntilCall <= 0 ? 'critical' : 'warning';
            summary = minutesUntilCall <= 0
                ? 'Нет назначенной бригады, время вызова уже наступило'
                : 'Нет назначенной бригады на поезд';
            recommendations.push('Запросить резервную бригаду у депо и подтвердить явку на станцию.');
        } else if (crew.availableFrom.getTime() > crewMustReportAt.getTime()) {
            severity = 'critical';
            summary = 'Бригада не успевает к нормативу T-2 часа';
            recommendations.push('Заменить бригаду или сдвинуть отправление с учетом явки.');
        } else if (minutesUntilCall <= 30) {
            severity = 'warning';
            summary = 'Подходит окно вызова бригады';
            recommendations.push('Подтвердить вызов бригады и готовность к приемке локомотива.');
        }

        if (!allocation.assignedLocomotive) {
            severity = severity === 'critical' ? severity : 'critical';
            summary = 'Нет назначенного локомотива';
            recommendations.push('Подобрать резервный локомотив или перераспределить тягу по участку.');
        } else {
            const locomotiveUnavailable =
                allocation.assignedLocomotive.availableFrom.getTime() > locomotiveAcceptanceAt.getTime();
            const maintenanceOverlap =
                allocation.assignedLocomotive.status === 'MAINTENANCE' ||
                this.overlapsMaintenance(
                    plannedDeparture,
                    allocation.assignedLocomotive.maintenanceFrom,
                    allocation.assignedLocomotive.maintenanceTo,
                );

            if (locomotiveUnavailable || maintenanceOverlap || hasLocoConflict) {
                severity = 'critical';
                summary = maintenanceOverlap
                    ? 'Назначенный локомотив недоступен из-за ТО/ремонта'
                    : 'Назначенный локомотив не успевает к приемке';
                recommendations.push('Назначить резервный локомотив и пересчитать соседние отправления.');
            }
        }

        if (!allocation.assignedTrackId || hasTrackConflict) {
            if (severity !== 'critical') severity = 'critical';
            summary = !allocation.assignedTrackId
                ? 'Нет подтвержденного пути отправления'
                : 'Есть конфликт по пути или интервалу';
            recommendations.push('Подготовить резервный путь или удержать поезд до освобождения окна.');
        }

        if (delayMinutes >= 30 && severity !== 'critical') {
            severity = 'warning';
            summary = 'Есть накопленная задержка по отправлению';
            recommendations.push('Проверить влияние задержки на следующие поезда и соседние станции.');
        }

        if (hasCrewConflict && !recommendations.some((r) => r.includes('бригад'))) {
            if (severity !== 'critical') severity = 'warning';
            recommendations.push('Связаться с депо и подтвердить резерв по локомотивной бригаде.');
        }

        if (recommendations.length === 0) {
            recommendations.push('Подтвердить отправление по плану и контролировать окно T-2/T-1.');
        }

        deadlineWarnings.push({
            label: 'Явка бригады (T-2ч)',
            at: crewMustReportAt.toISOString(),
            status: !crew || crew.availableFrom.getTime() > crewMustReportAt.getTime()
                ? 'critical'
                : minutesUntilCall <= 30
                    ? 'warning'
                    : 'ok',
        });
        deadlineWarnings.push({
            label: 'Приемка локомотива (T-1ч)',
            at: locomotiveAcceptanceAt.toISOString(),
            status: !allocation.assignedLocomotive
                ? 'critical'
                : allocation.assignedLocomotive.availableFrom.getTime() > locomotiveAcceptanceAt.getTime()
                    ? 'critical'
                    : 'ok',
        });

        const shouldShow =
            severity !== 'info' ||
            recommendations.some((r) => !r.includes('по плану'));

        if (!shouldShow) return null;

        return {
            allocationId: allocation.id,
            trainRunId: allocation.trainRun.id,
            trainNumber: allocation.trainRun.train.number,
            priority: allocation.trainRun.train.priority,
            plannedDeparture: plannedDeparture.toISOString(),
            scheduledDeparture: scheduledDeparture.toISOString(),
            delayMinutes,
            severity,
            summary,
            track: allocation.assignedTrack
                ? { id: allocation.assignedTrack.id, name: allocation.assignedTrack.name }
                : null,
            locomotive: allocation.assignedLocomotive
                ? {
                    id: allocation.assignedLocomotive.id,
                    label: `${allocation.assignedLocomotive.series}${allocation.assignedLocomotive.number}`,
                    status: allocation.assignedLocomotive.status,
                    availableFrom: allocation.assignedLocomotive.availableFrom.toISOString(),
                }
                : null,
            crew: crew
                ? {
                    id: crew.id,
                    status: crew.status,
                    availableFrom: crew.availableFrom.toISOString(),
                    requiredNoticeMinutes: crew.requiredNoticeMinutes,
                }
                : null,
            crewCallWindow: {
                mustReportAt: crewMustReportAt.toISOString(),
                locomotiveAcceptanceAt: locomotiveAcceptanceAt.toISOString(),
                minutesUntilCall,
            },
            conflictFlags,
            recommendations,
            deadlines: deadlineWarnings,
        };
    }

    private severityWeight(severity: 'info' | 'warning' | 'critical') {
        const weights = { info: 1, warning: 2, critical: 3 };
        return weights[severity];
    }

    private overlapsMaintenance(pointInTime: Date, maintenanceFrom?: Date | null, maintenanceTo?: Date | null) {
        if (!maintenanceFrom) return false;
        if (!maintenanceTo) return pointInTime.getTime() >= maintenanceFrom.getTime();
        return pointInTime.getTime() >= maintenanceFrom.getTime()
            && pointInTime.getTime() <= maintenanceTo.getTime();
    }

    async getTrains() {
        return this.prisma.train.findMany({
            orderBy: { number: 'asc' },
            select: { id: true, number: true }
        });
    }
}
