import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PassengerTimetableService } from './passenger-timetable.service';

const DAY = 24 * 60;
const SERVICE_DAY_START_MINUTES = 20 * 60;
const RESERVE_MINUTES = 30;

const STATION_GROUP_ALIASES: Array<{ key: string; aliases: string[] }> = [
  { key: 'астана', aliases: ['астана', 'астана 1', 'астана-1', 'нурлы жол', 'нур султан', 'нур-султан', 'нур султан нж', 'нур-султан нж', 'сороковая'] },
  { key: 'алматы', aliases: ['алматы', 'алматы 1', 'алматы-1', 'алматы 2', 'алматы-2'] },
  { key: 'оскемен', aliases: ['оскемен', 'оскемен-1', 'оскемен 1'] },
  { key: 'уральск', aliases: ['уральск', 'орал'] },
  { key: 'петропавловск', aliases: ['петропавловск'] },
  { key: 'костанай', aliases: ['костанай', 'кустанай'] },
  { key: 'кызылорда', aliases: ['кызылорда', 'кзыл орда', 'кзыл-орда'] },
  { key: 'мангистау', aliases: ['мангистау', 'мангышлак'] },
];

function normalizeText(value: string | null | undefined) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}\- ]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeSeries(value: string | null | undefined) {
  return normalizeText(value).replace(/\s+/g, '');
}

function normalizeStationKey(value: string | null | undefined) {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  for (const item of STATION_GROUP_ALIASES) {
    if (item.aliases.some((alias) => normalized.includes(alias))) {
      return item.key;
    }
  }
  return normalized;
}

function formatClock(minute: number) {
  const normalizedMinute = ((minute % DAY) + DAY) % DAY;
  const absolute = (SERVICE_DAY_START_MINUTES + normalizedMinute) % DAY;
  const hh = Math.floor(absolute / 60);
  const mm = absolute % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function formatOperationalMinute(minute?: number | null) {
  if (typeof minute !== 'number' || Number.isNaN(minute)) return '—';
  const dayOffset = Math.floor(minute / DAY);
  return `D+${dayOffset} ${formatClock(minute)}`;
}

function formatMinutes(value?: number | null) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—';
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return hours ? `${hours} ч ${String(minutes).padStart(2, '0')} мин` : `${minutes} мин`;
}

function inferTraction(series?: string | null) {
  const value = String(series ?? '').toUpperCase();
  if (value.includes('ТЭ') || value.includes('TE') || value.includes('ДИЗ')) return 'diesel';
  if (value.includes('KZ4') || value.includes('ВЛ') || value.includes('Э') || value.includes('ЭП')) return 'electric';
  return 'unknown';
}

function toOperationalNowMinute(date = new Date()) {
  const absolute = date.getHours() * 60 + date.getMinutes();
  return absolute >= SERVICE_DAY_START_MINUTES
    ? absolute - SERVICE_DAY_START_MINUTES
    : absolute + (DAY - SERVICE_DAY_START_MINUTES);
}

@Injectable()
export class PassengerBindingOperationsService {
  constructor(
    private readonly passengerTimetableService: PassengerTimetableService,
    private readonly prisma: PrismaService,
  ) {}

  async getOverview(filters?: { scenario?: 'base' | 'optimized' }) {
    const dataset: any = await this.passengerTimetableService.getDatasetSnapshot();
    const parkLocomotives: any[] = await this.passengerTimetableService.getParkLocomotives();
    const serviceShoulders = await this.prisma.serviceShoulder.findMany({
      include: {
        fromStation: { select: { name: true } },
        toStation: { select: { name: true } },
        model: { select: { series: true } },
      },
    });

    const scenarioKey = filters?.scenario === 'base' ? 'base' : 'optimized';
    const currentMinute = toOperationalNowMinute();
    const scenario = dataset.scenarios?.[scenarioKey];
    const baseScenario = dataset.scenarios?.base;
    const optimizedScenario = dataset.scenarios?.optimized;
    const shoulderIndex = this.buildShoulderIndex(serviceShoulders);
    const routeSeriesEvidence = this.buildRouteSeriesEvidence(baseScenario, optimizedScenario);

    const locomotives = parkLocomotives.map((item) => {
      const id = `${item.series}:${item.number}:${item.depot}`;
      const baseChain = baseScenario?.locomotiveChains?.get(id) ?? null;
      const optimizedChain = optimizedScenario?.locomotiveChains?.get(id) ?? null;
      const scenarioChain = scenario?.locomotiveChains?.get(id) ?? null;
      const snapshot = this.buildChainSnapshot(scenarioChain, item, currentMinute);
      const candidates = this.buildCandidates({
        tripList: dataset.allTrips ?? [],
        scenario,
        currentMinute,
        currentSnapshot: snapshot,
        currentLocomotiveId: id,
        series: item.series,
        routeSeriesEvidence,
        shoulderIndex,
      });
      const bestCandidate = candidates.find((item) => item.kind === 'recommended') ?? candidates.find((item) => item.kind === 'possible') ?? candidates[0] ?? null;
      const normMinutes = item.serviceNormMinutes ?? item.to2NormMinutes ?? null;
      const overNormMinutes =
        typeof snapshot.currentIdleMinutes === 'number' && typeof normMinutes === 'number'
          ? Math.max(snapshot.currentIdleMinutes - normMinutes, 0)
          : null;

      return {
        id,
        label: `${item.series} №${item.number}`,
        series: item.series,
        number: item.number,
        depot: item.depot,
        routeTypeHistory: Array.from(new Set((scenarioChain?.assignments ?? []).map((assignment: any) => assignment.routeTypeLabel))),
        traction: inferTraction(item.series),
        homeStation: item.location ?? null,
        normMinutes,
        baseTotalIdleMinutes: baseChain?.totalIdleMinutes ?? 0,
        optimizedTotalIdleMinutes: optimizedChain?.totalIdleMinutes ?? 0,
        snapshot,
        bestCandidate,
        alternatives: candidates.slice(0, 6),
      };
    });

    const rows = locomotives.sort((left, right) => {
      const leftWeight = this.statusWeight(left.snapshot.statusKey);
      const rightWeight = this.statusWeight(right.snapshot.statusKey);
      if (leftWeight !== rightWeight) return rightWeight - leftWeight;
      return (right.bestCandidate?.score ?? -999) - (left.bestCandidate?.score ?? -999);
    });

    return {
      generatedAt: new Date().toISOString(),
      serviceDayStart: '20:00',
      cursorMinute: currentMinute,
      cursorLabel: formatOperationalMinute(currentMinute),
      scenario: scenarioKey,
      stats: {
        totalLocomotives: rows.length,
        withRecommendation: rows.filter((item) => item.bestCandidate && ['recommended', 'possible'].includes(item.bestCandidate.kind)).length,
        waitingForBest: rows.filter((item) => item.bestCandidate?.kind === 'possible').length,
        outOfNorm: rows.filter((item) => item.snapshot.statusKey === 'problem').length,
        busyNow: rows.filter((item) => item.snapshot.statusKey === 'busy').length,
        freeNow: rows.filter((item) => ['free', 'idle', 'reserve'].includes(item.snapshot.statusKey)).length,
      },
      rows,
    };
  }

  private buildShoulderIndex(serviceShoulders: any[]) {
    const index = new Map<string, Map<string, Set<string>>>();
    for (const shoulder of serviceShoulders) {
      const series = normalizeSeries(shoulder.model?.series);
      const fromStationKey = normalizeStationKey(shoulder.fromStation?.name);
      const toStationKey = normalizeStationKey(shoulder.toStation?.name);
      if (!series || !fromStationKey || !toStationKey) continue;
      const byStation = index.get(series) ?? new Map<string, Set<string>>();
      const targets = byStation.get(fromStationKey) ?? new Set<string>();
      targets.add(toStationKey);
      byStation.set(fromStationKey, targets);
      index.set(series, byStation);
    }
    return index;
  }

  private buildRouteSeriesEvidence(baseScenario: any, optimizedScenario: any) {
    const evidence = new Map<string, Set<string>>();
    for (const assignment of [...(baseScenario?.assignments ?? []), ...(optimizedScenario?.assignments ?? [])]) {
      const key = assignment.tripId;
      const series = normalizeSeries(assignment.locomotiveSeries);
      if (!key || !series) continue;
      const set = evidence.get(key) ?? new Set<string>();
      set.add(series);
      evidence.set(key, set);
    }
    return evidence;
  }

  private buildChainSnapshot(chain: any, parkLocomotive: any, currentMinute: number) {
    if (!chain) {
      return {
        status: 'Свободен',
        statusKey: 'free',
        locationStation: parkLocomotive.location ?? '—',
        locationStationKey: normalizeStationKey(parkLocomotive.location),
        currentTrainNo: null,
        releaseMinute: currentMinute,
        releaseLabel: formatOperationalMinute(currentMinute),
        currentIdleMinutes: 0,
      };
    }

    const assignments = chain.assignments ?? [];
    const idleBlocks = chain.idleBlocks ?? [];

    const activeAssignment = assignments.find((item: any) =>
      typeof item.departureOperationalMinute === 'number' &&
      typeof item.releaseOperationalMinute === 'number' &&
      currentMinute >= item.departureOperationalMinute &&
      currentMinute <= item.releaseOperationalMinute,
    ) ?? null;

    if (activeAssignment) {
      return {
        status: 'В рейсе',
        statusKey: 'busy',
        locationStation: activeAssignment.destinationStation,
        locationStationKey: normalizeStationKey(activeAssignment.destinationStation),
        currentTrainNo: activeAssignment.trainNo,
        releaseMinute: activeAssignment.releaseOperationalMinute,
        releaseLabel: formatOperationalMinute(activeAssignment.releaseOperationalMinute),
        currentIdleMinutes: 0,
      };
    }

    const activeIdle = idleBlocks.find((item: any) =>
      typeof item.startMinute === 'number' &&
      typeof item.endMinute === 'number' &&
      currentMinute >= item.startMinute &&
      currentMinute <= item.endMinute,
    ) ?? null;

    if (activeIdle) {
      const previousAssignment = assignments.find((item: any) => item.assignmentId === activeIdle.previousAssignmentId) ?? null;
      return {
        status: activeIdle.idleMinutes > (parkLocomotive.serviceNormMinutes ?? 240) ? 'Вне нормы' : 'Простой',
        statusKey: activeIdle.idleMinutes > (parkLocomotive.serviceNormMinutes ?? 240) ? 'problem' : 'idle',
        locationStation: previousAssignment?.destinationStation ?? parkLocomotive.location ?? '—',
        locationStationKey: normalizeStationKey(previousAssignment?.destinationStation ?? parkLocomotive.location),
        currentTrainNo: null,
        releaseMinute: currentMinute,
        releaseLabel: formatOperationalMinute(currentMinute),
        currentIdleMinutes: currentMinute - activeIdle.startMinute,
      };
    }

    const lastAssignment = assignments[assignments.length - 1] ?? null;
    const releaseMinute = lastAssignment?.releaseOperationalMinute ?? currentMinute;
    return {
      status: assignments.length ? 'Резерв' : 'Свободен',
      statusKey: assignments.length ? 'reserve' : 'free',
      locationStation: lastAssignment?.destinationStation ?? parkLocomotive.location ?? '—',
      locationStationKey: normalizeStationKey(lastAssignment?.destinationStation ?? parkLocomotive.location),
      currentTrainNo: null,
      releaseMinute,
      releaseLabel: formatOperationalMinute(releaseMinute),
      currentIdleMinutes: Math.max(currentMinute - releaseMinute, 0),
    };
  }

  private buildCandidates(args: {
    tripList: any[];
    scenario: any;
    currentMinute: number;
    currentSnapshot: any;
    currentLocomotiveId: string;
    series: string;
    routeSeriesEvidence: Map<string, Set<string>>;
    shoulderIndex: Map<string, Map<string, Set<string>>>;
  }) {
    const currentStationKey = args.currentSnapshot.locationStationKey;
    if (!currentStationKey) return [];
    const currentSeriesKey = normalizeSeries(args.series);

    return args.tripList
      .flatMap((trip) => {
        const assigned = args.scenario?.assignmentByTripId?.get(trip.tripId) ?? null;
        const stops = trip.stops ?? [];
        return stops.map((stop: any, index: number) => {
          const stopStationKey = normalizeStationKey(stop.station_name);
          const departureMinute = stop.departure_operational_minute;
          if (stopStationKey !== currentStationKey) return null;
          if (typeof departureMinute !== 'number') return null;
          const gapMinutes = departureMinute - (args.currentSnapshot.releaseMinute ?? args.currentMinute);
          const reserveOk = gapMinutes >= RESERVE_MINUTES;
          const occupiedByAnother = assigned?.locomotiveId && assigned.locomotiveId !== args.currentLocomotiveId;
          const compatibility = this.resolveCompatibility({
            trip,
            stopIndex: index,
            currentStationKey,
            currentSeriesKey,
            routeSeriesEvidence: args.routeSeriesEvidence,
            shoulderIndex: args.shoulderIndex,
          });

          let kind: 'recommended' | 'possible' | 'conflict' | 'impossible' = 'possible';
          let reason = 'Поезд проходит через текущую станцию локомотива и доступен для рассмотрения.';
          let score = 40;

          if (!reserveOk) {
            kind = 'impossible';
            score = -100;
            reason = 'Не хватает технологического резерва перед отправлением.';
          } else if (!compatibility.compatible) {
            kind = 'impossible';
            score = -80;
            reason = compatibility.reason;
          } else if (occupiedByAnother) {
            kind = 'conflict';
            score = 25;
            reason = `В текущем сценарии поезд уже занят локомотивом ${assigned.locomotiveSeries} №${assigned.locomotiveNumber}.`;
          } else {
            if (gapMinutes <= 90) {
              kind = 'recommended';
              score += 50;
              reason = 'Короткое окно до отправления и подтвержденная совместимость по маршруту.';
            } else {
              kind = 'possible';
              score += Math.max(0, 40 - Math.round(gapMinutes / 15));
              reason = 'Назначение допустимо, но образует более длинное окно ожидания.';
            }
          }

          if (trip.routeType === 'talgo') score += 6;
          if (trip.routeType === 'private_standard') score += 2;

          return {
            tripId: trip.tripId,
            trainNo: trip.trainNo,
            pairKey: trip.pairKey,
            pairDisplay: trip.pairDisplay,
            routeLabel: trip.routeLabel,
            routeType: trip.routeType,
            routeTypeLabel: trip.routeTypeLabel,
            stationName: stop.station_name,
            departureMinute,
            departureLabel: formatOperationalMinute(departureMinute),
            gapMinutes,
            compatibilitySource: compatibility.source,
            kind,
            score,
            reason,
            assignedLocomotiveLabel: assigned ? `${assigned.locomotiveSeries} №${assigned.locomotiveNumber}` : null,
          };
        }).filter(Boolean);
      })
      .sort((left: any, right: any) => right.score - left.score || left.gapMinutes - right.gapMinutes);
  }

  private resolveCompatibility(args: {
    trip: any;
    stopIndex: number;
    currentStationKey: string;
    currentSeriesKey: string;
    routeSeriesEvidence: Map<string, Set<string>>;
    shoulderIndex: Map<string, Map<string, Set<string>>>;
  }) {
    const routeEvidence = args.routeSeriesEvidence.get(args.trip.tripId);
    if (routeEvidence?.has(args.currentSeriesKey)) {
      return { compatible: true, source: 'assignment', reason: 'Серия уже подтверждена на этом маршруте фактической подвязкой.' };
    }

    const targets = args.shoulderIndex.get(args.currentSeriesKey)?.get(args.currentStationKey);
    if (targets?.size) {
      const downstream = (args.trip.stops ?? [])
        .slice(args.stopIndex + 1)
        .map((stop: any) => normalizeStationKey(stop.station_name))
        .filter(Boolean);
      if (downstream.some((item: string | null) => item && targets.has(item))) {
        return { compatible: true, source: 'shoulder', reason: 'Серия подтверждена на одном из downstream плеч маршрута.' };
      }
    }

    return { compatible: false, source: 'none', reason: 'Для этой серии нет подтвержденного плеча или фактической подвязки на маршруте.' };
  }

  private statusWeight(statusKey: string) {
    if (statusKey === 'problem') return 5;
    if (statusKey === 'idle') return 4;
    if (statusKey === 'free') return 3;
    if (statusKey === 'reserve') return 2;
    if (statusKey === 'busy') return 1;
    return 0;
  }
}
