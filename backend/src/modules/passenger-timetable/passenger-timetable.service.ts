import { Injectable, NotFoundException } from '@nestjs/common';
import { readdir } from 'node:fs/promises';
import * as path from 'node:path';
import { parseParkWorkbook } from '../gitural/gitural-locomotive-table';
import {
  PASSENGER_ROUTE_CONFIG,
  PASSENGER_ROUTE_CONFIG_BY_KEY,
  type PassengerRouteConfig,
  type PassengerRouteType,
} from './passenger-timetable.config';

type XlsxModule = {
  readFile: (filePath: string, options?: Record<string, unknown>) => {
    SheetNames: string[];
    Sheets: Record<string, unknown>;
  };
  utils: {
    sheet_to_json: (
      sheet: unknown,
      options: { header: number; raw?: boolean; defval: string },
    ) => Array<Array<string | number>>;
  };
};

type ParseIssue = {
  sheetName: string;
  rowNumber: number;
  side?: 'left' | 'right';
  severity: 'warning' | 'error';
  message: string;
  rawStation?: string | null;
  rawValues?: string[];
};

type RawStop = {
  stationName: string;
  stationCode: string | null;
  distanceKm: number | null;
  arrivalTimeRaw: string | null;
  departureTimeRaw: string | null;
  dwellTimeRaw: string | null;
  sourceRow: number;
};

type TimetableStop = {
  route_id: string;
  train_pair: string;
  train_no: string;
  direction: 'outbound' | 'return';
  origin_station: string;
  destination_station: string;
  station_sequence: number;
  station_name: string;
  station_code: string | null;
  distance_km: number | null;
  arrival_time_raw: string | null;
  departure_time_raw: string | null;
  dwell_time_raw: string | null;
  arrival_operational_minute: number | null;
  departure_operational_minute: number | null;
  event_type: 'origin_departure' | 'pass' | 'stop' | 'terminal_arrival' | 'turnaround';
  service_operations: string[];
  locomotive_assignment_id: {
    base: string | null;
    optimized: string | null;
  };
  scenario_type: 'base_optimized_compare';
};

type TimetableTrip = {
  routeId: string;
  tripId: string;
  pairKey: string;
  pairDisplay: string;
  trainNo: string;
  direction: 'outbound' | 'return';
  routeType: PassengerRouteType;
  routeTypeLabel: string;
  routeLabel: string;
  originStation: string;
  destinationStation: string;
  originStationKey: string;
  destinationStationKey: string;
  carrier: 'КТЖ';
  stationSequenceCount: number;
  durationMinutes: number;
  departureOperationalMinute: number;
  arrivalOperationalMinute: number;
  stops: TimetableStop[];
};

type ParkLocomotive = ReturnType<typeof parseParkWorkbook>[number];

type ResourceState = {
  id: string;
  series: string;
  number: string;
  depot: string;
  homeStation: string | null;
  homeStationKey: string | null;
  currentStationKey: string | null;
  availableMinute: number;
  lastAssignmentId: string | null;
  lastPairKey: string | null;
  lastTripId: string | null;
  assignmentCount: number;
};

type ScenarioAssignment = {
  assignmentId: string;
  scenarioType: 'base' | 'optimized';
  tripId: string;
  routeId: string;
  pairKey: string;
  pairDisplay: string;
  trainNo: string;
  routeLabel: string;
  routeType: PassengerRouteType;
  routeTypeLabel: string;
  originStation: string;
  destinationStation: string;
  originStationKey: string;
  destinationStationKey: string;
  departureOperationalMinute: number;
  arrivalOperationalMinute: number;
  releaseOperationalMinute: number;
  locomotiveId: string;
  locomotiveSeries: string;
  locomotiveNumber: string;
  locomotiveDepot: string;
  locomotiveHomeStation: string | null;
  idleBeforeMinutes: number;
  previousAssignmentId: string | null;
  previousTripId: string | null;
  explanation: string[];
};

type UncoveredTrip = {
  tripId: string;
  pairKey: string;
  trainNo: string;
  originStation: string;
  departureOperationalMinute: number;
  reason: string;
};

type IdleBlock = {
  startMinute: number;
  endMinute: number;
  idleMinutes: number;
  previousAssignmentId: string;
  nextAssignmentId: string;
};

type LocomotiveChain = {
  locomotiveId: string;
  label: string;
  series: string;
  number: string;
  depot: string;
  homeStation: string | null;
  assignments: ScenarioAssignment[];
  idleBlocks: IdleBlock[];
  totalIdleMinutes: number;
  maxIdleMinutes: number;
};

type ScenarioMetrics = {
  totalIdleMinutes: number;
  averageIdleMinutes: number;
  maxIdleMinutes: number;
  assignmentsCount: number;
  uncoveredTrips: number;
  conflictsCount: number;
  turnaroundsCount: number;
  coveragePercent: number;
  locomotivesUsed: number;
  danglingLocomotives: number;
};

type ScenarioResult = {
  scenarioType: 'base' | 'optimized';
  assignmentByTripId: Map<string, ScenarioAssignment>;
  assignments: ScenarioAssignment[];
  uncovered: UncoveredTrip[];
  locomotiveChains: Map<string, LocomotiveChain>;
  metrics: ScenarioMetrics;
};

type PairSummary = {
  key: string;
  displayPair: string;
  routeLabel: string;
  routeType: PassengerRouteType;
  routeTypeLabel: string;
  origin: string;
  destination: string;
  tripCount: number;
  stationCount: number;
  trains: string[];
  baseCoveragePercent: number;
  optimizedCoveragePercent: number;
  baseIdleMinutes: number;
  optimizedIdleMinutes: number;
  improvementMinutes: number;
};

type NetworkInsight = {
  type: 'coverage' | 'idle' | 'trip' | 'warning';
  title: string;
  message: string;
};

type DatasetSnapshot = {
  generatedAt: string;
  workbookPath: string;
  pairSummaries: PairSummary[];
  allTrips: TimetableTrip[];
  parseIssues: ParseIssue[];
  stationCount: number;
  scenarios: {
    base: ScenarioResult;
    optimized: ScenarioResult;
  };
  networkInsights: NetworkInsight[];
};

type GraphConnector = {
  scenarioType: 'base' | 'optimized';
  locomotiveId: string;
  locomotiveLabel: string;
  fromTrainNo: string;
  toTrainNo: string;
  stationName: string;
  startMinute: number;
  endMinute: number;
  idleMinutes: number;
  continuationType: 'same_pair' | 'cross_route';
};

type OptimizationStrategy = 'base' | 'balanced' | 'idle_first';

const SERVICE_DAY_MINUTES = 24 * 60;
const SERVICE_DAY_START_MINUTES = 20 * 60;
const MIN_READY_BUFFER_MINUTES = 60;

const ASTANA_ALIASES = [
  'астана',
  'астана 1',
  'астана-1',
  'нурлы жол',
  'нур султан',
  'нур-султан',
  'нур султан нж',
  'нур-султан нж',
];

const STATION_GROUP_ALIASES: Array<{ key: string; aliases: string[] }> = [
  { key: 'астана', aliases: ASTANA_ALIASES },
  { key: 'алматы', aliases: ['алматы', 'алматы 1', 'алматы-1', 'алматы 2', 'алматы-2'] },
  { key: 'оскемен', aliases: ['оскемен', 'оскемен-1', 'оскемен 1'] },
  { key: 'уральск', aliases: ['уральск', 'орал'] },
  { key: 'петропавловск', aliases: ['петропавловск'] },
  { key: 'костанай', aliases: ['костанай', 'кустанай'] },
  { key: 'кызылорда', aliases: ['кызылорда', 'кзыл орда', 'кзыл-орда'] },
  { key: 'мангистау', aliases: ['мангистау', 'мангышлак'] },
  { key: 'жезказган', aliases: ['жезказган'] },
  { key: 'шымкент', aliases: ['шымкент'] },
  { key: 'туркестан', aliases: ['туркестан'] },
  { key: 'сарыагаш', aliases: ['сарыагаш'] },
  { key: 'пресногорьковская', aliases: ['пресногорьковская'] },
  { key: 'караганды', aliases: ['караганд', 'караганды'] },
  { key: 'семей', aliases: ['семей'] },
  { key: 'атырау', aliases: ['атырау'] },
  { key: 'актобе', aliases: ['актобе'] },
  { key: 'павлодар', aliases: ['павлодар'] },
  { key: 'кокшетау', aliases: ['кокшетау'] },
];

@Injectable()
export class PassengerTimetableService {
  private readonly dataDir = path.resolve(process.cwd(), 'data');
  private datasetPromise: Promise<DatasetSnapshot> | null = null;

  async getOverview(filters?: { pairKey?: string; locomotiveId?: string }) {
    const dataset = await this.loadDataset();
    const selectedPairKey = this.resolveSelectedPairKey(filters?.pairKey, dataset.pairSummaries);
    const selectedPairTrips = dataset.allTrips
      .filter((item) => item.pairKey === selectedPairKey)
      .sort((left, right) => left.departureOperationalMinute - right.departureOperationalMinute);

    const selectedSummary =
      dataset.pairSummaries.find((item) => item.key === selectedPairKey) ?? dataset.pairSummaries[0] ?? null;

    const stationOrder = this.buildStationOrder(selectedPairTrips, selectedSummary ?? null);
    const connectors = {
      base: this.buildConnectors(dataset.scenarios.base, selectedPairKey),
      optimized: this.buildConnectors(dataset.scenarios.optimized, selectedPairKey),
    };

    const relevantLocomotives = this.buildRelevantLocomotives(
      selectedPairKey,
      dataset.scenarios.base,
      dataset.scenarios.optimized,
    );
    const selectedLocomotiveId =
      relevantLocomotives.find((item) => item.id === filters?.locomotiveId)?.id ??
      relevantLocomotives[0]?.id ??
      null;

    const selectedLocomotive = selectedLocomotiveId
      ? {
          id: selectedLocomotiveId,
          base: this.serializeLocomotiveChain(dataset.scenarios.base.locomotiveChains.get(selectedLocomotiveId) ?? null),
          optimized: this.serializeLocomotiveChain(
            dataset.scenarios.optimized.locomotiveChains.get(selectedLocomotiveId) ?? null,
          ),
        }
      : null;

    const tableRows = selectedPairTrips.map((trip) => {
      const baseAssignment = dataset.scenarios.base.assignmentByTripId.get(trip.tripId) ?? null;
      const optimizedAssignment = dataset.scenarios.optimized.assignmentByTripId.get(trip.tripId) ?? null;
      return {
        tripId: trip.tripId,
        routeId: trip.routeId,
        pairKey: trip.pairKey,
        pairDisplay: trip.pairDisplay,
        trainNo: trip.trainNo,
        direction: trip.direction,
        routeLabel: trip.routeLabel,
        routeType: trip.routeType,
        routeTypeLabel: trip.routeTypeLabel,
        carrier: trip.carrier,
        originStation: trip.originStation,
        destinationStation: trip.destinationStation,
        departureLabel: this.formatOperationalMinute(trip.departureOperationalMinute),
        arrivalLabel: this.formatOperationalMinute(trip.arrivalOperationalMinute),
        durationMinutes: trip.durationMinutes,
        stationCount: trip.stationSequenceCount,
        base: this.serializeAssignment(baseAssignment),
        optimized: this.serializeAssignment(optimizedAssignment),
        improvementMinutes:
          (baseAssignment?.idleBeforeMinutes ?? 0) - (optimizedAssignment?.idleBeforeMinutes ?? 0),
      };
    });

    return {
      generatedAt: dataset.generatedAt,
      sourceFile: path.basename(dataset.workbookPath),
      serviceDayStart: '20:00',
      filters: {
        pairKey: selectedPairKey,
        locomotiveId: selectedLocomotiveId,
      },
      catalog: {
        routeTypes: this.buildRouteTypeSummary(dataset.pairSummaries),
        pairs: dataset.pairSummaries,
      },
      network: {
        totalPairs: dataset.pairSummaries.length,
        totalTrips: dataset.allTrips.length,
        totalStations: dataset.stationCount,
        parseIssuesCount: dataset.parseIssues.length,
        base: dataset.scenarios.base.metrics,
        optimized: dataset.scenarios.optimized.metrics,
        delta: this.buildMetricsDelta(dataset.scenarios.base.metrics, dataset.scenarios.optimized.metrics),
        insights: dataset.networkInsights,
      },
      selectedPair: selectedSummary
        ? {
            ...selectedSummary,
            scenarioMetrics: {
              base: this.buildSelectedPairMetrics(selectedPairKey, selectedPairTrips, dataset.scenarios.base),
              optimized: this.buildSelectedPairMetrics(selectedPairKey, selectedPairTrips, dataset.scenarios.optimized),
            },
            stations: stationOrder,
            trains: selectedPairTrips.map((trip) =>
              this.serializeTrip(
                trip,
                dataset.scenarios.base.assignmentByTripId.get(trip.tripId) ?? null,
                dataset.scenarios.optimized.assignmentByTripId.get(trip.tripId) ?? null,
              ),
            ),
            connectors,
            relevantLocomotives,
            selectedLocomotive,
            tableRows,
          }
        : null,
      parseIssues: dataset.parseIssues.slice(0, 80),
    };
  }

  private async loadDataset(): Promise<DatasetSnapshot> {
    if (!this.datasetPromise) {
      this.datasetPromise = this.buildDataset();
    }
    return this.datasetPromise;
  }

  private async buildDataset(): Promise<DatasetSnapshot> {
    const workbookPath = await this.resolveWorkbookPath();
    const parkPath = await this.resolveParkPath();
    const xlsx = this.loadXlsx();
    const workbook = xlsx.readFile(workbookPath, { raw: false, cellDates: false });
    const parkLocomotives = parseParkWorkbook(parkPath, xlsx);
    const parseIssues: ParseIssue[] = [];
    const allTrips: TimetableTrip[] = [];
    const pairSheetMap = new Map<string, string>();

    for (const sheetName of workbook.SheetNames) {
      const match = sheetName.match(/(\d{1,4})\s*-\s*(\d{1,4})/);
      if (!match) continue;

      const pairKey = this.normalizePairKey(match[1], match[2]);
      const config = PASSENGER_ROUTE_CONFIG_BY_KEY.get(pairKey);
      if (!config) continue;

      if (pairSheetMap.has(pairKey)) {
        parseIssues.push({
          sheetName,
          rowNumber: 1,
          severity: 'warning',
          message: `Повторный лист для пары ${config.displayPair} пропущен, используется '${pairSheetMap.get(pairKey)}'.`,
        });
        continue;
      }

      const parsed = this.parseSheet(workbook.Sheets[sheetName], sheetName, config, parseIssues, xlsx);
      if (!parsed.length) {
        parseIssues.push({
          sheetName,
          rowNumber: 1,
          severity: 'error',
          message: `Не удалось распарсить лист ${sheetName} для пары ${config.displayPair}.`,
        });
        continue;
      }

      pairSheetMap.set(pairKey, sheetName);
      allTrips.push(...parsed);
    }

    const sortedTrips = allTrips.sort(
      (left, right) => left.departureOperationalMinute - right.departureOperationalMinute,
    );
    const baseScenario = this.buildScenario('base', sortedTrips, parkLocomotives, 'base');
    const optimizedCandidates = [
      this.buildScenario('optimized', sortedTrips, parkLocomotives, 'balanced'),
      this.buildScenario('optimized', sortedTrips, parkLocomotives, 'idle_first'),
    ];
    const optimizedCandidate = optimizedCandidates.reduce((best, candidate) =>
      this.isScenarioBetter(candidate, best) ? candidate : best,
    );
    const optimizedScenario = this.isScenarioBetter(optimizedCandidate, baseScenario)
      ? optimizedCandidate
      : this.cloneScenarioAsOptimized(baseScenario, sortedTrips.length);
    const pairSummaries = PASSENGER_ROUTE_CONFIG.map((config) =>
      this.buildPairSummary(config, sortedTrips, baseScenario, optimizedScenario),
    ).filter((item): item is PairSummary => Boolean(item));

    const stationCount = new Set(
      sortedTrips.flatMap((trip) => trip.stops.map((stop) => stop.station_name)),
    ).size;

    return {
      generatedAt: new Date().toISOString(),
      workbookPath,
      pairSummaries,
      allTrips: sortedTrips,
      parseIssues,
      stationCount,
      scenarios: {
        base: baseScenario,
        optimized: optimizedScenario,
      },
      networkInsights: this.buildNetworkInsights(sortedTrips, baseScenario, optimizedScenario),
    };
  }

  private parseSheet(
    sheet: unknown,
    sheetName: string,
    config: PassengerRouteConfig,
    issues: ParseIssue[],
    xlsx: XlsxModule,
  ): TimetableTrip[] {
    const rows = xlsx.utils.sheet_to_json(sheet, {
      header: 1,
      raw: false,
      defval: '',
    }) as Array<Array<string | number>>;

    const headerIndex = rows.findIndex((row) =>
      row.some((cell) => this.normalizeText(cell).includes('раздельные')),
    );

    if (headerIndex < 0) {
      issues.push({
        sheetName,
        rowNumber: 1,
        severity: 'error',
        message: 'В листе не найден заголовок колонок с раздельными пунктами.',
      });
      return [];
    }

    const meta = this.extractSheetMeta(rows, headerIndex, config);
    const leftRawStops: RawStop[] = [];
    const rightRawStops: RawStop[] = [];

    for (let rowIndex = headerIndex + 1; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex] ?? [];
      const stationName = this.cleanCell(row[3]);
      const rowNumber = rowIndex + 1;

      const hasTimeData =
        [0, 1, 2, 6, 7, 8].some((index) => Boolean(this.cleanCell(row[index])));

      if (!stationName) {
        if (hasTimeData) {
          issues.push({
            sheetName,
            rowNumber,
            severity: 'warning',
            message: 'Строка содержит времена, но не содержит названия станции.',
            rawValues: row.map((item) => String(item ?? '')),
          });
        }
        continue;
      }

      if (this.shouldSkipStationRow(stationName)) {
        continue;
      }

      const distanceKm = this.parseInteger(row[4]);
      const stationCode = this.cleanDigits(row[5]);
      const leftStop = this.buildRawStop(
        row,
        0,
        stationName,
        stationCode,
        distanceKm,
        rowNumber,
        'left',
        sheetName,
        issues,
      );
      const rightStop = this.buildRawStop(
        row,
        6,
        stationName,
        stationCode,
        distanceKm,
        rowNumber,
        'right',
        sheetName,
        issues,
      );

      if (leftStop) leftRawStops.push(leftStop);
      if (rightStop) rightRawStops.push(rightStop);
    }

    const routeMaxDistance = Math.max(
      ...[...leftRawStops, ...rightRawStops]
        .map((item) => item.distanceKm ?? -1)
        .filter((item) => item >= 0),
      0,
    );

    const leftStops = this.normalizeTripStops(leftRawStops, false, routeMaxDistance);
    const rightStops = this.normalizeTripStops([...rightRawStops].reverse(), true, routeMaxDistance);

    const leftTrip = this.buildTrip(config, meta.leftTrainNo, meta.leftRouteLabel, leftStops, sheetName, issues);
    const rightTrip = this.buildTrip(config, meta.rightTrainNo, meta.rightRouteLabel, rightStops, sheetName, issues);

    return [leftTrip, rightTrip].filter((item): item is TimetableTrip => Boolean(item));
  }

  private buildTrip(
    config: PassengerRouteConfig,
    trainNo: string | null,
    routeLabel: string | null,
    stops: Omit<TimetableStop, 'route_id' | 'train_pair' | 'train_no' | 'direction' | 'origin_station' | 'destination_station' | 'locomotive_assignment_id' | 'scenario_type'>[],
    sheetName: string,
    issues: ParseIssue[],
  ): TimetableTrip | null {
    if (!trainNo) {
      issues.push({
        sheetName,
        rowNumber: 1,
        severity: 'error',
        message: 'Для одной из ниток не удалось определить номер поезда.',
      });
      return null;
    }

    if (!stops.length) {
      issues.push({
        sheetName,
        rowNumber: 1,
        severity: 'error',
        message: `Для поезда ${trainNo} не найдено ни одной валидной остановки.`,
      });
      return null;
    }

    const originStation = stops[0].station_name;
    const destinationStation = stops[stops.length - 1].station_name;
    const direction =
      this.normalizeStationKey(originStation) === this.normalizeStationKey(config.origin)
        ? 'outbound'
        : 'return';

    const departureOperationalMinute =
      stops.find((item) => typeof item.departure_operational_minute === 'number')?.departure_operational_minute ??
      0;
    const arrivalOperationalMinute =
      [...stops]
        .reverse()
        .find((item) => typeof item.arrival_operational_minute === 'number')?.arrival_operational_minute ??
      departureOperationalMinute;

    const routeId = `${config.key}:${trainNo}`;
    const tripId = `${routeId}:${direction}`;
    const effectiveRouteLabel =
      routeLabel ??
      (direction === 'outbound'
        ? `${config.origin} – ${config.destination}`
        : `${config.destination} – ${config.origin}`);

    const enrichedStops: TimetableStop[] = stops.map((stop) => ({
      ...stop,
      route_id: routeId,
      train_pair: config.displayPair,
      train_no: trainNo,
      direction,
      origin_station: originStation,
      destination_station: destinationStation,
      locomotive_assignment_id: {
        base: null,
        optimized: null,
      },
      scenario_type: 'base_optimized_compare',
    }));

    return {
      routeId,
      tripId,
      pairKey: config.key,
      pairDisplay: config.displayPair,
      trainNo,
      direction,
      routeType: config.routeType,
      routeTypeLabel: config.routeTypeLabel,
      routeLabel: effectiveRouteLabel,
      originStation,
      destinationStation,
      originStationKey: this.normalizeStationKey(originStation) ?? this.normalizeText(originStation),
      destinationStationKey:
        this.normalizeStationKey(destinationStation) ?? this.normalizeText(destinationStation),
      carrier: config.carrier,
      stationSequenceCount: enrichedStops.length,
      durationMinutes: Math.max(arrivalOperationalMinute - departureOperationalMinute, 0),
      departureOperationalMinute,
      arrivalOperationalMinute,
      stops: enrichedStops,
    };
  }

  private normalizeTripStops(
    rawStops: RawStop[],
    reverseDistance: boolean,
    routeMaxDistance: number,
  ) {
    const result: Omit<TimetableStop, 'route_id' | 'train_pair' | 'train_no' | 'direction' | 'origin_station' | 'destination_station' | 'locomotive_assignment_id' | 'scenario_type'>[] = [];
    let previousMinute: number | null = null;

    rawStops.forEach((stop, index) => {
      const arrivalMinute = this.toProgressiveOperationalMinute(stop.arrivalTimeRaw, previousMinute);
      if (arrivalMinute !== null) {
        previousMinute = arrivalMinute;
      }

      const departureMinute = this.toProgressiveOperationalMinute(stop.departureTimeRaw, previousMinute);
      if (departureMinute !== null) {
        previousMinute = departureMinute;
      }

      const dwellMinutes =
        typeof arrivalMinute === 'number' && typeof departureMinute === 'number'
          ? Math.max(departureMinute - arrivalMinute, 0)
          : this.parseDurationMinutes(stop.dwellTimeRaw);

      const eventType = this.resolveEventType(index, rawStops.length, arrivalMinute, departureMinute, dwellMinutes);
      const distanceKm =
        stop.distanceKm === null
          ? null
          : reverseDistance
            ? Math.max(routeMaxDistance - stop.distanceKm, 0)
            : stop.distanceKm;

      result.push({
        station_sequence: index + 1,
        station_name: stop.stationName,
        station_code: stop.stationCode,
        distance_km: distanceKm,
        arrival_time_raw: stop.arrivalTimeRaw,
        departure_time_raw: stop.departureTimeRaw,
        dwell_time_raw: stop.dwellTimeRaw,
        arrival_operational_minute: arrivalMinute,
        departure_operational_minute: departureMinute,
        event_type: eventType,
        service_operations: this.resolveServiceOperations(eventType, dwellMinutes),
      });
    });

    return result;
  }

  private buildScenario(
    scenarioType: 'base' | 'optimized',
    trips: TimetableTrip[],
    parkLocomotives: ParkLocomotive[],
    strategy: OptimizationStrategy,
  ): ScenarioResult {
    const resources = this.buildInitialResources(parkLocomotives);
    const assignments: ScenarioAssignment[] = [];
    const uncovered: UncoveredTrip[] = [];

    for (const trip of trips) {
      const candidates = resources.filter(
        (item) =>
          item.currentStationKey === trip.originStationKey &&
          item.availableMinute <= trip.departureOperationalMinute,
      );

      const selected = this.pickCandidate(scenarioType, strategy, trip, candidates);
      if (!selected) {
        uncovered.push({
          tripId: trip.tripId,
          pairKey: trip.pairKey,
          trainNo: trip.trainNo,
          originStation: trip.originStation,
          departureOperationalMinute: trip.departureOperationalMinute,
          reason: `На станции ${trip.originStation} к ${this.formatOperationalMinute(trip.departureOperationalMinute)} не найден доступный локомотив.`,
        });
        continue;
      }

      const assignmentId = `${scenarioType}:${selected.id}:${trip.tripId}`;
      const idleBeforeMinutes =
        selected.assignmentCount === 0
          ? 0
          : Math.max(trip.departureOperationalMinute - selected.availableMinute, 0);

      const explanation =
        scenarioType === 'base'
          ? [
              selected.homeStationKey === trip.originStationKey
                ? 'Базовый сценарий оставил локомотив в домашнем пуле станции отправления.'
                : 'Базовый сценарий использовал первый доступный локомотив локального пула.',
              `Выбран ресурс ${selected.series} №${selected.number} из депо ${selected.depot}.`,
              idleBeforeMinutes > 0
                ? `Перед рейсом локомотив ожидал ${this.formatMinutes(idleBeforeMinutes)}.`
                : 'Рейс взят без дополнительного ожидания после предыдущего задания.',
            ]
          : [
              'Оптимизированный сценарий выбрал ресурс с минимальным окном idle до отправления.',
              selected.lastPairKey === trip.pairKey
                ? 'Сохранена непрерывная работа в пределах той же парной нитки.'
                : 'Допущена межмаршрутная переиспользуемость внутри той же станции.',
              idleBeforeMinutes > 0
                ? `Окно idle перед рейсом сокращено до ${this.formatMinutes(idleBeforeMinutes)}.`
                : 'Локомотив взят сразу после предшествующего оборота.',
            ];

      const assignment: ScenarioAssignment = {
        assignmentId,
        scenarioType,
        tripId: trip.tripId,
        routeId: trip.routeId,
        pairKey: trip.pairKey,
        pairDisplay: trip.pairDisplay,
        trainNo: trip.trainNo,
        routeLabel: trip.routeLabel,
        routeType: trip.routeType,
        routeTypeLabel: trip.routeTypeLabel,
        originStation: trip.originStation,
        destinationStation: trip.destinationStation,
        originStationKey: trip.originStationKey,
        destinationStationKey: trip.destinationStationKey,
        departureOperationalMinute: trip.departureOperationalMinute,
        arrivalOperationalMinute: trip.arrivalOperationalMinute,
        releaseOperationalMinute: trip.arrivalOperationalMinute + MIN_READY_BUFFER_MINUTES,
        locomotiveId: selected.id,
        locomotiveSeries: selected.series,
        locomotiveNumber: selected.number,
        locomotiveDepot: selected.depot,
        locomotiveHomeStation: selected.homeStation,
        idleBeforeMinutes,
        previousAssignmentId: selected.lastAssignmentId,
        previousTripId: selected.lastTripId,
        explanation,
      };

      assignments.push(assignment);
      selected.availableMinute = assignment.releaseOperationalMinute;
      selected.currentStationKey = trip.destinationStationKey;
      selected.lastAssignmentId = assignment.assignmentId;
      selected.lastTripId = trip.tripId;
      selected.lastPairKey = trip.pairKey;
      selected.assignmentCount += 1;
    }

    const assignmentByTripId = new Map(assignments.map((item) => [item.tripId, item]));
    const locomotiveChains = this.buildLocomotiveChains(assignments);
    return {
      scenarioType,
      assignmentByTripId,
      assignments,
      uncovered,
      locomotiveChains,
      metrics: this.buildScenarioMetrics(trips.length, assignments, uncovered, locomotiveChains),
    };
  }

  private buildLocomotiveChains(assignments: ScenarioAssignment[]) {
    const chainMap = new Map<string, LocomotiveChain>();

    assignments
      .slice()
      .sort((left, right) => left.departureOperationalMinute - right.departureOperationalMinute)
      .forEach((assignment) => {
        const existing = chainMap.get(assignment.locomotiveId) ?? {
          locomotiveId: assignment.locomotiveId,
          label: `${assignment.locomotiveSeries} №${assignment.locomotiveNumber}`,
          series: assignment.locomotiveSeries,
          number: assignment.locomotiveNumber,
          depot: assignment.locomotiveDepot,
          homeStation: assignment.locomotiveHomeStation,
          assignments: [],
          idleBlocks: [],
          totalIdleMinutes: 0,
          maxIdleMinutes: 0,
        };

        const previous = existing.assignments[existing.assignments.length - 1];
        if (previous && assignment.idleBeforeMinutes > 0) {
          existing.idleBlocks.push({
            startMinute: previous.releaseOperationalMinute,
            endMinute: assignment.departureOperationalMinute,
            idleMinutes: assignment.idleBeforeMinutes,
            previousAssignmentId: previous.assignmentId,
            nextAssignmentId: assignment.assignmentId,
          });
          existing.totalIdleMinutes += assignment.idleBeforeMinutes;
          existing.maxIdleMinutes = Math.max(existing.maxIdleMinutes, assignment.idleBeforeMinutes);
        }

        existing.assignments.push(assignment);
        chainMap.set(assignment.locomotiveId, existing);
      });

    return chainMap;
  }

  private buildScenarioMetrics(
    totalTrips: number,
    assignments: ScenarioAssignment[],
    uncovered: UncoveredTrip[],
    locomotiveChains: Map<string, LocomotiveChain>,
  ): ScenarioMetrics {
    const idleBlocks = Array.from(locomotiveChains.values()).flatMap((item) => item.idleBlocks);
    const totalIdleMinutes = idleBlocks.reduce((sum, item) => sum + item.idleMinutes, 0);
    const maxIdleMinutes = idleBlocks.reduce((max, item) => Math.max(max, item.idleMinutes), 0);
    const locomotivesUsed = locomotiveChains.size;
    const turnaroundsCount = Array.from(locomotiveChains.values()).reduce((sum, chain) => {
      let count = 0;
      for (let index = 1; index < chain.assignments.length; index += 1) {
        const previous = chain.assignments[index - 1];
        const current = chain.assignments[index];
        if (
          previous.pairKey === current.pairKey &&
          previous.destinationStationKey === current.originStationKey &&
          previous.trainNo !== current.trainNo
        ) {
          count += 1;
        }
      }
      return sum + count;
    }, 0);

    return {
      totalIdleMinutes,
      averageIdleMinutes: locomotivesUsed ? Math.round(totalIdleMinutes / locomotivesUsed) : 0,
      maxIdleMinutes,
      assignmentsCount: assignments.length,
      uncoveredTrips: uncovered.length,
      conflictsCount: uncovered.length,
      turnaroundsCount,
      coveragePercent: totalTrips ? Number(((assignments.length / totalTrips) * 100).toFixed(1)) : 0,
      locomotivesUsed,
      danglingLocomotives: Array.from(locomotiveChains.values()).filter((item) => item.assignments.length <= 1).length,
    };
  }

  private isScenarioBetter(candidate: ScenarioResult, baseline: ScenarioResult) {
    if (candidate.metrics.coveragePercent !== baseline.metrics.coveragePercent) {
      return candidate.metrics.coveragePercent > baseline.metrics.coveragePercent;
    }
    if (candidate.metrics.totalIdleMinutes !== baseline.metrics.totalIdleMinutes) {
      return candidate.metrics.totalIdleMinutes < baseline.metrics.totalIdleMinutes;
    }
    return candidate.metrics.maxIdleMinutes < baseline.metrics.maxIdleMinutes;
  }

  private cloneScenarioAsOptimized(source: ScenarioResult, totalTrips: number): ScenarioResult {
    const idMap = new Map<string, string>();
    source.assignments.forEach((assignment) => {
      idMap.set(assignment.assignmentId, assignment.assignmentId.replace(/^base:/, 'optimized:'));
    });

    const assignments = source.assignments.map((assignment) => ({
      ...assignment,
      scenarioType: 'optimized' as const,
      assignmentId: idMap.get(assignment.assignmentId) ?? assignment.assignmentId.replace(/^base:/, 'optimized:'),
      previousAssignmentId: assignment.previousAssignmentId
        ? idMap.get(assignment.previousAssignmentId) ??
          assignment.previousAssignmentId.replace(/^base:/, 'optimized:')
        : null,
    }));

    const assignmentByTripId = new Map(assignments.map((assignment) => [assignment.tripId, assignment]));
    const locomotiveChains = this.buildLocomotiveChains(assignments);

    return {
      scenarioType: 'optimized',
      assignmentByTripId,
      assignments,
      uncovered: source.uncovered,
      locomotiveChains,
      metrics: this.buildScenarioMetrics(totalTrips, assignments, source.uncovered, locomotiveChains),
    };
  }

  private buildPairSummary(
    config: PassengerRouteConfig,
    allTrips: TimetableTrip[],
    baseScenario: ScenarioResult,
    optimizedScenario: ScenarioResult,
  ): PairSummary | null {
    const trips = allTrips.filter((item) => item.pairKey === config.key);
    if (!trips.length) return null;

    const stations = new Set(trips.flatMap((trip) => trip.stops.map((stop) => stop.station_name)));
    const baseAssignments = trips
      .map((trip) => baseScenario.assignmentByTripId.get(trip.tripId))
      .filter((item): item is ScenarioAssignment => Boolean(item));
    const optimizedAssignments = trips
      .map((trip) => optimizedScenario.assignmentByTripId.get(trip.tripId))
      .filter((item): item is ScenarioAssignment => Boolean(item));

    return {
      key: config.key,
      displayPair: config.displayPair,
      routeLabel: config.routeLabel,
      routeType: config.routeType,
      routeTypeLabel: config.routeTypeLabel,
      origin: config.origin,
      destination: config.destination,
      tripCount: trips.length,
      stationCount: stations.size,
      trains: trips.map((item) => item.trainNo),
      baseCoveragePercent: trips.length ? Number(((baseAssignments.length / trips.length) * 100).toFixed(1)) : 0,
      optimizedCoveragePercent: trips.length
        ? Number(((optimizedAssignments.length / trips.length) * 100).toFixed(1))
        : 0,
      baseIdleMinutes: baseAssignments.reduce((sum, item) => sum + item.idleBeforeMinutes, 0),
      optimizedIdleMinutes: optimizedAssignments.reduce((sum, item) => sum + item.idleBeforeMinutes, 0),
      improvementMinutes:
        baseAssignments.reduce((sum, item) => sum + item.idleBeforeMinutes, 0) -
        optimizedAssignments.reduce((sum, item) => sum + item.idleBeforeMinutes, 0),
    };
  }

  private buildNetworkInsights(
    trips: TimetableTrip[],
    baseScenario: ScenarioResult,
    optimizedScenario: ScenarioResult,
  ): NetworkInsight[] {
    const insights: NetworkInsight[] = [];
    const coverageDelta = optimizedScenario.metrics.coveragePercent - baseScenario.metrics.coveragePercent;
    const idleDelta = baseScenario.metrics.totalIdleMinutes - optimizedScenario.metrics.totalIdleMinutes;

    insights.push({
      type: 'coverage',
      title: 'Покрытие поездов локомотивами',
      message:
        coverageDelta > 0
          ? `Оптимизация повысила покрытие с ${baseScenario.metrics.coveragePercent}% до ${optimizedScenario.metrics.coveragePercent}%.`
          : `Покрытие осталось на уровне ${optimizedScenario.metrics.coveragePercent}% для ${trips.length} ниток.`,
    });

    insights.push({
      type: 'idle',
      title: 'Суммарный простой локомотивов',
      message:
        idleDelta > 0
          ? `Общий idle сокращён на ${this.formatMinutes(idleDelta)}: с ${this.formatMinutes(baseScenario.metrics.totalIdleMinutes)} до ${this.formatMinutes(optimizedScenario.metrics.totalIdleMinutes)}.`
          : idleDelta === 0 && coverageDelta === 0
            ? 'Rule-based optimizer не нашёл цепочку лучше baseline, поэтому optimized-витрина оставлена на уровне базового сценария как safe fallback.'
            : `Суммарный idle не удалось сократить, текущее значение ${this.formatMinutes(optimizedScenario.metrics.totalIdleMinutes)}.`,
    });

    const improvedTrips = trips
      .map((trip) => {
        const baseAssignment = baseScenario.assignmentByTripId.get(trip.tripId);
        const optimizedAssignment = optimizedScenario.assignmentByTripId.get(trip.tripId);
        return {
          trip,
          improvement:
            (baseAssignment?.idleBeforeMinutes ?? 0) - (optimizedAssignment?.idleBeforeMinutes ?? 0),
        };
      })
      .filter((item) => item.improvement > 0)
      .sort((left, right) => right.improvement - left.improvement)
      .slice(0, 3);

    improvedTrips.forEach((item) => {
      insights.push({
        type: 'trip',
        title: `Лучший эффект по поезду №${item.trip.trainNo}`,
        message: `${item.trip.routeLabel}: простой перед отправлением снижен на ${this.formatMinutes(item.improvement)}.`,
      });
    });

    if (!improvedTrips.length) {
      insights.push({
        type: 'warning',
        title: 'Ограничение MVP',
        message:
          'Текущий rule-based optimizer работает без сложного solver-слоя и без разрешённых резервных перегонов между станциями.',
      });
    }

    return insights;
  }

  private buildConnectors(scenario: ScenarioResult, selectedPairKey: string): GraphConnector[] {
    const result: GraphConnector[] = [];

    for (const chain of scenario.locomotiveChains.values()) {
      for (let index = 1; index < chain.assignments.length; index += 1) {
        const previous = chain.assignments[index - 1];
        const current = chain.assignments[index];
        if (previous.destinationStationKey !== current.originStationKey) continue;
        if (previous.pairKey !== selectedPairKey && current.pairKey !== selectedPairKey) continue;

        result.push({
          scenarioType: scenario.scenarioType,
          locomotiveId: chain.locomotiveId,
          locomotiveLabel: chain.label,
          fromTrainNo: previous.trainNo,
          toTrainNo: current.trainNo,
          stationName: current.originStation,
          startMinute: previous.releaseOperationalMinute,
          endMinute: current.departureOperationalMinute,
          idleMinutes: current.idleBeforeMinutes,
          continuationType: previous.pairKey === current.pairKey ? 'same_pair' : 'cross_route',
        });
      }
    }

    return result.sort((left, right) => left.startMinute - right.startMinute);
  }

  private buildRelevantLocomotives(
    pairKey: string,
    baseScenario: ScenarioResult,
    optimizedScenario: ScenarioResult,
  ) {
    const ids = new Set<string>([
      ...Array.from(baseScenario.locomotiveChains.keys()),
      ...Array.from(optimizedScenario.locomotiveChains.keys()),
    ]);

    return Array.from(ids)
      .map((id) => {
        const baseChain = baseScenario.locomotiveChains.get(id) ?? null;
        const optimizedChain = optimizedScenario.locomotiveChains.get(id) ?? null;
        const label = baseChain?.label ?? optimizedChain?.label ?? id;
        const baseAssignmentsForPair =
          baseChain?.assignments.filter((item) => item.pairKey === pairKey) ?? [];
        const optimizedAssignmentsForPair =
          optimizedChain?.assignments.filter((item) => item.pairKey === pairKey) ?? [];
        return {
          id,
          label,
          series: baseChain?.series ?? optimizedChain?.series ?? null,
          number: baseChain?.number ?? optimizedChain?.number ?? null,
          depot: baseChain?.depot ?? optimizedChain?.depot ?? null,
          homeStation: baseChain?.homeStation ?? optimizedChain?.homeStation ?? null,
          baseAssignments: baseAssignmentsForPair.length,
          optimizedAssignments: optimizedAssignmentsForPair.length,
          baseTotalIdleMinutes: baseChain?.totalIdleMinutes ?? 0,
          optimizedTotalIdleMinutes: optimizedChain?.totalIdleMinutes ?? 0,
          baseMaxIdleMinutes: baseChain?.maxIdleMinutes ?? 0,
          optimizedMaxIdleMinutes: optimizedChain?.maxIdleMinutes ?? 0,
          improvementMinutes:
            (baseChain?.totalIdleMinutes ?? 0) - (optimizedChain?.totalIdleMinutes ?? 0),
          baseChain: this.serializeLocomotiveChain(baseChain),
          optimizedChain: this.serializeLocomotiveChain(optimizedChain),
        };
      })
      .sort((left, right) => {
        const assignmentWeight =
          right.optimizedAssignments + right.baseAssignments - (left.optimizedAssignments + left.baseAssignments);
        if (assignmentWeight !== 0) return assignmentWeight;
        return right.improvementMinutes - left.improvementMinutes;
      });
  }

  private buildStationOrder(trips: TimetableTrip[], summary: PairSummary | null) {
    if (!trips.length) return [];

    const preferred = summary
      ? trips.find(
          (item) => this.normalizeStationKey(item.originStation) === this.normalizeStationKey(summary.origin),
        ) ?? trips[0]
      : trips[0];

    const ordered = preferred.stops.map((stop) => ({
      name: stop.station_name,
      distanceKm: stop.distance_km,
      key: this.normalizeStationKey(stop.station_name),
    }));

    for (const trip of trips) {
      for (const stop of trip.stops) {
        const key = this.normalizeStationKey(stop.station_name);
        if (!ordered.some((item) => item.key === key)) {
          ordered.push({
            name: stop.station_name,
            distanceKm: stop.distance_km,
            key,
          });
        }
      }
    }

    return ordered.map((item, index) => ({
      index,
      name: item.name,
      distanceKm: item.distanceKm,
    }));
  }

  private buildSelectedPairMetrics(pairKey: string, trips: TimetableTrip[], scenario: ScenarioResult) {
    const assignments = scenario.assignments.filter((item) => item.pairKey === pairKey);
    const uncovered = scenario.uncovered.filter((item) => item.pairKey === pairKey);
    const locomotivesUsed = new Set(assignments.map((item) => item.locomotiveId)).size;
    const totalIdleMinutes = assignments.reduce((sum, item) => sum + item.idleBeforeMinutes, 0);
    const maxIdleMinutes = assignments.reduce((max, item) => Math.max(max, item.idleBeforeMinutes), 0);
    const turnaroundsCount = assignments.reduce((sum, assignment) => {
      const previous = assignment.previousTripId
        ? scenario.assignmentByTripId.get(assignment.previousTripId) ?? null
        : null;

      if (
        previous &&
        previous.pairKey === pairKey &&
        previous.destinationStationKey === assignment.originStationKey &&
        previous.trainNo !== assignment.trainNo
      ) {
        return sum + 1;
      }

      return sum;
    }, 0);

    return {
      totalIdleMinutes,
      averageIdleMinutes: locomotivesUsed ? Math.round(totalIdleMinutes / locomotivesUsed) : 0,
      maxIdleMinutes,
      assignmentsCount: assignments.length,
      uncoveredTrips: uncovered.length,
      conflictsCount: uncovered.length,
      turnaroundsCount,
      coveragePercent: trips.length ? Number(((assignments.length / trips.length) * 100).toFixed(1)) : 0,
      locomotivesUsed,
      danglingLocomotives: Array.from(new Set(assignments.map((item) => item.locomotiveId))).filter((id) => {
        const chain = scenario.locomotiveChains.get(id);
        return !chain || chain.assignments.length <= 1;
      }).length,
    };
  }

  private serializeTrip(
    trip: TimetableTrip,
    baseAssignment: ScenarioAssignment | null,
    optimizedAssignment: ScenarioAssignment | null,
  ) {
    return {
      ...trip,
      departureLabel: this.formatOperationalMinute(trip.departureOperationalMinute),
      arrivalLabel: this.formatOperationalMinute(trip.arrivalOperationalMinute),
      baseAssignment: this.serializeAssignment(baseAssignment),
      optimizedAssignment: this.serializeAssignment(optimizedAssignment),
      stops: trip.stops.map((stop) => ({
        ...stop,
        arrivalLabel:
          typeof stop.arrival_operational_minute === 'number'
            ? this.formatOperationalMinute(stop.arrival_operational_minute)
            : null,
        departureLabel:
          typeof stop.departure_operational_minute === 'number'
            ? this.formatOperationalMinute(stop.departure_operational_minute)
            : null,
        dwellMinutes:
          typeof stop.arrival_operational_minute === 'number' &&
          typeof stop.departure_operational_minute === 'number'
            ? Math.max(stop.departure_operational_minute - stop.arrival_operational_minute, 0)
            : this.parseDurationMinutes(stop.dwell_time_raw),
        locomotive_assignment_id: {
          base: baseAssignment?.assignmentId ?? null,
          optimized: optimizedAssignment?.assignmentId ?? null,
        },
        locomotives: {
          base: baseAssignment ? `${baseAssignment.locomotiveSeries} №${baseAssignment.locomotiveNumber}` : null,
          optimized: optimizedAssignment
            ? `${optimizedAssignment.locomotiveSeries} №${optimizedAssignment.locomotiveNumber}`
            : null,
        },
      })),
    };
  }

  private serializeLocomotiveChain(chain: LocomotiveChain | null) {
    if (!chain) return null;
    return {
      locomotiveId: chain.locomotiveId,
      label: chain.label,
      series: chain.series,
      number: chain.number,
      depot: chain.depot,
      homeStation: chain.homeStation,
      totalIdleMinutes: chain.totalIdleMinutes,
      maxIdleMinutes: chain.maxIdleMinutes,
      assignments: chain.assignments.map((item) => ({
        ...this.serializeAssignment(item),
        releaseLabel: this.formatOperationalMinute(item.releaseOperationalMinute),
      })),
      idleBlocks: chain.idleBlocks.map((item) => ({
        ...item,
        startLabel: this.formatOperationalMinute(item.startMinute),
        endLabel: this.formatOperationalMinute(item.endMinute),
      })),
    };
  }

  private serializeAssignment(assignment: ScenarioAssignment | null) {
    if (!assignment) return null;
    return {
      assignmentId: assignment.assignmentId,
      scenarioType: assignment.scenarioType,
      tripId: assignment.tripId,
      routeId: assignment.routeId,
      pairKey: assignment.pairKey,
      trainNo: assignment.trainNo,
      pairDisplay: assignment.pairDisplay,
      routeLabel: assignment.routeLabel,
      routeType: assignment.routeType,
      routeTypeLabel: assignment.routeTypeLabel,
      locomotiveId: assignment.locomotiveId,
      locomotiveSeries: assignment.locomotiveSeries,
      locomotiveNumber: assignment.locomotiveNumber,
      locomotiveDepot: assignment.locomotiveDepot,
      locomotiveLabel: `${assignment.locomotiveSeries} №${assignment.locomotiveNumber}`,
      originStation: assignment.originStation,
      originStationKey: assignment.originStationKey,
      destinationStation: assignment.destinationStation,
      destinationStationKey: assignment.destinationStationKey,
      departureOperationalMinute: assignment.departureOperationalMinute,
      arrivalOperationalMinute: assignment.arrivalOperationalMinute,
      releaseOperationalMinute: assignment.releaseOperationalMinute,
      departureLabel: this.formatOperationalMinute(assignment.departureOperationalMinute),
      arrivalLabel: this.formatOperationalMinute(assignment.arrivalOperationalMinute),
      releaseLabel: this.formatOperationalMinute(assignment.releaseOperationalMinute),
      idleBeforeMinutes: assignment.idleBeforeMinutes,
      idleBeforeLabel: this.formatMinutes(assignment.idleBeforeMinutes),
      previousAssignmentId: assignment.previousAssignmentId,
      explanation: assignment.explanation,
    };
  }

  private buildMetricsDelta(base: ScenarioMetrics, optimized: ScenarioMetrics) {
    return {
      idleMinutesSaved: base.totalIdleMinutes - optimized.totalIdleMinutes,
      idlePercentSaved:
        base.totalIdleMinutes > 0
          ? Number((((base.totalIdleMinutes - optimized.totalIdleMinutes) / base.totalIdleMinutes) * 100).toFixed(1))
          : 0,
      coverageDeltaPercent: Number((optimized.coveragePercent - base.coveragePercent).toFixed(1)),
      uncoveredTripsClosed: base.uncoveredTrips - optimized.uncoveredTrips,
      maxIdleReductionMinutes: base.maxIdleMinutes - optimized.maxIdleMinutes,
    };
  }

  private buildRouteTypeSummary(pairSummaries: PairSummary[]) {
    const grouped = new Map<
      PassengerRouteType,
      { routeType: PassengerRouteType; routeTypeLabel: string; pairCount: number; tripCount: number }
    >();

    pairSummaries.forEach((item) => {
      const existing = grouped.get(item.routeType) ?? {
        routeType: item.routeType,
        routeTypeLabel: item.routeTypeLabel,
        pairCount: 0,
        tripCount: 0,
      };
      existing.pairCount += 1;
      existing.tripCount += item.tripCount;
      grouped.set(item.routeType, existing);
    });

    return Array.from(grouped.values());
  }

  private extractSheetMeta(
    rows: Array<Array<string | number>>,
    headerIndex: number,
    config: PassengerRouteConfig,
  ) {
    let leftTrainNo: string | null = null;
    let rightTrainNo: string | null = null;
    let leftRouteLabel: string | null = null;
    let rightRouteLabel: string | null = null;

    for (let rowIndex = 0; rowIndex < headerIndex; rowIndex += 1) {
      const row = rows[rowIndex] ?? [];
      const leftText = this.extractHalfText(row, 0, 6);
      const rightText = this.extractHalfText(row, 6, 12);

      if (!leftTrainNo && this.normalizeText(leftText).includes('поезд')) {
        leftTrainNo = this.extractTrainNumber(leftText);
      }
      if (!rightTrainNo && this.normalizeText(rightText).includes('поезд')) {
        rightTrainNo = this.extractTrainNumber(rightText);
      }

      if (!leftRouteLabel && this.looksLikeRouteLabel(leftText)) {
        leftRouteLabel = this.cleanRouteLabel(leftText);
      }
      if (!rightRouteLabel && this.looksLikeRouteLabel(rightText)) {
        rightRouteLabel = this.cleanRouteLabel(rightText);
      }
    }

    return {
      leftTrainNo: leftTrainNo ?? config.displayPair.split('/')[1] ?? null,
      rightTrainNo: rightTrainNo ?? config.displayPair.split('/')[0] ?? null,
      leftRouteLabel: leftRouteLabel ?? `${config.origin} – ${config.destination}`,
      rightRouteLabel: rightRouteLabel ?? `${config.destination} – ${config.origin}`,
    };
  }

  private buildRawStop(
    row: Array<string | number>,
    offset: number,
    stationName: string,
    stationCode: string | null,
    distanceKm: number | null,
    rowNumber: number,
    side: 'left' | 'right',
    sheetName: string,
    issues: ParseIssue[],
  ): RawStop | null {
    const arrivalRaw = this.parseTimeCell(row[offset]);
    const dwellRaw = this.cleanCell(row[offset + 1]);
    const departureRaw = this.parseTimeCell(row[offset + 2]);

    const hasRawValues = [row[offset], row[offset + 1], row[offset + 2]]
      .map((value) => this.cleanCell(value))
      .some(Boolean);

    if (!hasRawValues) return null;

    if (!arrivalRaw && !departureRaw && !this.parseDurationMinutes(dwellRaw)) {
      issues.push({
        sheetName,
        rowNumber,
        side,
        severity: 'warning',
        message: 'Строка имеет непустые значения, но не распознана ни как время, ни как стоянка.',
        rawStation: stationName,
        rawValues: [this.cleanCell(row[offset]), dwellRaw, this.cleanCell(row[offset + 2])],
      });
      return null;
    }

    return {
      stationName: this.prettyStationName(stationName),
      stationCode,
      distanceKm,
      arrivalTimeRaw: arrivalRaw,
      departureTimeRaw: departureRaw,
      dwellTimeRaw: dwellRaw || null,
      sourceRow: rowNumber,
    };
  }

  private buildInitialResources(parkLocomotives: ParkLocomotive[]): ResourceState[] {
    const seen = new Set<string>();
    const result: ResourceState[] = [];

    for (const locomotive of parkLocomotives) {
      const id = `${locomotive.series}:${locomotive.number}:${locomotive.depot}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const homeStation = locomotive.location ?? null;
      result.push({
        id,
        series: locomotive.series,
        number: locomotive.number,
        depot: locomotive.depot,
        homeStation,
        homeStationKey: this.normalizeStationKey(homeStation),
        currentStationKey: this.normalizeStationKey(homeStation),
        availableMinute: 0,
        lastAssignmentId: null,
        lastPairKey: null,
        lastTripId: null,
        assignmentCount: 0,
      });
    }

    return result;
  }

  private pickCandidate(
    scenarioType: 'base' | 'optimized',
    strategy: OptimizationStrategy,
    trip: TimetableTrip,
    candidates: ResourceState[],
  ) {
    if (!candidates.length) return null;

    const sorted = [...candidates].sort((left, right) => {
      const leftIdle = Math.max(trip.departureOperationalMinute - left.availableMinute, 0);
      const rightIdle = Math.max(trip.departureOperationalMinute - right.availableMinute, 0);
      const leftHomePenalty = left.homeStationKey === trip.originStationKey ? 0 : 1;
      const rightHomePenalty = right.homeStationKey === trip.originStationKey ? 0 : 1;
      const leftSamePairPenalty = left.lastPairKey === trip.pairKey ? 0 : 1;
      const rightSamePairPenalty = right.lastPairKey === trip.pairKey ? 0 : 1;

      if (scenarioType === 'base' || strategy === 'base') {
        if (leftHomePenalty !== rightHomePenalty) return leftHomePenalty - rightHomePenalty;
        if (left.availableMinute !== right.availableMinute) return left.availableMinute - right.availableMinute;
        if (leftSamePairPenalty !== rightSamePairPenalty) return leftSamePairPenalty - rightSamePairPenalty;
      } else if (strategy === 'idle_first') {
        if (leftIdle !== rightIdle) return leftIdle - rightIdle;
        if (left.availableMinute !== right.availableMinute) return right.availableMinute - left.availableMinute;
        if (leftSamePairPenalty !== rightSamePairPenalty) return leftSamePairPenalty - rightSamePairPenalty;
        if (leftHomePenalty !== rightHomePenalty) return leftHomePenalty - rightHomePenalty;
      } else {
        const leftScore = leftIdle + leftSamePairPenalty * 30 + leftHomePenalty * 10;
        const rightScore = rightIdle + rightSamePairPenalty * 30 + rightHomePenalty * 10;
        if (leftScore !== rightScore) return leftScore - rightScore;
        if (left.availableMinute !== right.availableMinute) return right.availableMinute - left.availableMinute;
      }

      return left.number.localeCompare(right.number, 'ru');
    });

    return sorted[0] ?? null;
  }

  private resolveSelectedPairKey(pairKey: string | undefined, summaries: PairSummary[]) {
    if (!summaries.length) return '';
    if (!pairKey) return summaries[0].key;
    const normalized = this.normalizePairInput(pairKey);
    return summaries.find((item) => item.key === normalized)?.key ?? summaries[0].key;
  }

  private normalizePairInput(value: string) {
    const digits = String(value ?? '').match(/\d{1,4}/g) ?? [];
    if (digits.length < 2) return String(value ?? '');
    const [left, right] = digits;
    if (!left || !right) return String(value ?? '');
    return this.normalizePairKey(left, right);
  }

  private normalizePairKey(left: string, right: string) {
    const ordered = [left, right].sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10));
    return `${ordered[0].padStart(3, '0')}/${ordered[1].padStart(3, '0')}`;
  }

  private normalizeText(value: string | number | null | undefined) {
    return String(value ?? '')
      .toLowerCase()
      .replace(/ё/g, 'е')
      .replace(/[^\p{L}\p{N}\- ]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private normalizeStationKey(value: string | null | undefined) {
    const normalized = this.normalizeText(value);
    if (!normalized) return null;

    for (const item of STATION_GROUP_ALIASES) {
      if (item.aliases.some((alias) => normalized.includes(alias))) {
        return item.key;
      }
    }

    return normalized;
  }

  private cleanCell(value: string | number | null | undefined) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
  }

  private cleanDigits(value: string | number | null | undefined) {
    const digits = this.cleanCell(value).replace(/[^\d]/g, '');
    return digits || null;
  }

  private parseTimeCell(value: string | number | null | undefined): string | null {
    if (typeof value === 'number') {
      const totalMinutes = Math.round((value % 1) * SERVICE_DAY_MINUTES);
      const hh = Math.floor(totalMinutes / 60);
      const mm = totalMinutes % 60;
      return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    }

    const match = this.cleanCell(value).match(/(\d{1,2})[:.](\d{2})/);
    if (!match) return null;
    return `${match[1].padStart(2, '0')}:${match[2]}`;
  }

  private parseDurationMinutes(value: string | null | undefined) {
    const cleaned = this.cleanCell(value);
    if (!cleaned) return 0;
    const clockMatch = cleaned.match(/(\d{1,2})[:.](\d{2})/);
    if (clockMatch) {
      return Number.parseInt(clockMatch[1], 10) * 60 + Number.parseInt(clockMatch[2], 10);
    }
    const numericMatch = cleaned.match(/(\d{1,3})/);
    return numericMatch ? Number.parseInt(numericMatch[1], 10) : 0;
  }

  private parseInteger(value: string | number | null | undefined) {
    const digits = this.cleanCell(value).replace(/[^\d]/g, '');
    return digits ? Number.parseInt(digits, 10) : null;
  }

  private toOperationalOffsetMinutes(time: string | null | undefined) {
    const parsed = this.parseTimeCell(time);
    if (!parsed) return null;
    const [hh, mm] = parsed.split(':').map(Number);
    const absolute = hh * 60 + mm;
    return absolute >= SERVICE_DAY_START_MINUTES
      ? absolute - SERVICE_DAY_START_MINUTES
      : absolute + SERVICE_DAY_MINUTES - SERVICE_DAY_START_MINUTES;
  }

  private toProgressiveOperationalMinute(time: string | null | undefined, previous: number | null) {
    const offset = this.toOperationalOffsetMinutes(time);
    if (offset === null) return null;
    let candidate = offset;
    while (typeof previous === 'number' && candidate < previous) {
      candidate += SERVICE_DAY_MINUTES;
    }
    return candidate;
  }

  private resolveEventType(
    index: number,
    total: number,
    arrivalMinute: number | null,
    departureMinute: number | null,
    dwellMinutes: number,
  ): 'origin_departure' | 'pass' | 'stop' | 'terminal_arrival' | 'turnaround' {
    if (index === 0 && departureMinute !== null && arrivalMinute === null) return 'origin_departure';
    if (index === total - 1 && arrivalMinute !== null && departureMinute === null) return 'terminal_arrival';
    if (arrivalMinute !== null && departureMinute !== null) {
      return dwellMinutes > 0 ? 'stop' : 'pass';
    }
    if (index === total - 1) return 'terminal_arrival';
    if (index === 0) return 'origin_departure';
    return 'stop';
  }

  private resolveServiceOperations(
    eventType: 'origin_departure' | 'pass' | 'stop' | 'terminal_arrival' | 'turnaround',
    dwellMinutes: number,
  ) {
    const operations: string[] = [];
    if (eventType === 'origin_departure') operations.push('DEPARTURE_PREP');
    if (eventType === 'terminal_arrival') operations.push('TURNAROUND_READY');
    if (eventType === 'stop' && dwellMinutes >= 30) operations.push('SERVICE_STOP');
    if (eventType === 'pass') operations.push('PASS_THROUGH');
    return operations;
  }

  private extractHalfText(row: Array<string | number>, start: number, end: number) {
    return row
      .slice(start, end)
      .map((item) => this.cleanCell(item))
      .filter(Boolean)
      .join(' ')
      .trim();
  }

  private extractTrainNumber(text: string) {
    const digits = text.match(/\d{1,4}/);
    if (!digits) return null;
    return String(Number.parseInt(digits[0], 10));
  }

  private looksLikeRouteLabel(text: string) {
    const normalized = this.normalizeText(text);
    return Boolean(normalized) && normalized.includes('-') && !normalized.includes('общ') && !normalized.includes('маршрут');
  }

  private cleanRouteLabel(text: string) {
    return this.cleanCell(text)
      .replace(/\s*-\s*/g, ' – ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private shouldSkipStationRow(stationName: string) {
    const normalized = this.normalizeText(stationName);
    if (!normalized) return true;
    if (normalized.includes('поезд')) return true;
    if (normalized.includes('маршрут')) return true;
    if (!/[\p{L}]/u.test(normalized)) return true;
    if (normalized.startsWith('№')) return true;
    return false;
  }

  private prettyStationName(value: string) {
    const cleaned = this.cleanCell(value).replace(/\s+/g, ' ');
    if (!cleaned) return '';
    return cleaned;
  }

  private formatOperationalMinute(value: number) {
    const dayIndex = Math.floor(value / SERVICE_DAY_MINUTES);
    const offset = value % SERVICE_DAY_MINUTES;
    const absolute = (SERVICE_DAY_START_MINUTES + offset) % SERVICE_DAY_MINUTES;
    const hh = Math.floor(absolute / 60);
    const mm = absolute % 60;
    return `D+${dayIndex} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }

  private formatMinutes(value: number) {
    const hours = Math.floor(value / 60);
    const minutes = value % 60;
    if (!hours) return `${minutes} мин`;
    return `${hours} ч ${String(minutes).padStart(2, '0')} мин`;
  }

  private async resolveWorkbookPath() {
    const files = await readdir(this.dataDir);
    const workbook = files.find(
      (item) =>
        item.toLowerCase().includes('траф') &&
        item.toLowerCase().includes('пасс') &&
        item.toLowerCase().endsWith('.xlsx'),
    );
    if (!workbook) {
      throw new NotFoundException('Файл маршрутного трафика пассажирских поездов не найден в backend/data.');
    }
    return path.join(this.dataDir, workbook);
  }

  private async resolveParkPath() {
    const files = await readdir(this.dataDir);
    const parkFile = files.find(
      (item) =>
        item.toLowerCase().includes('парк') &&
        item.toLowerCase().includes('ктж') &&
        item.toLowerCase().endsWith('.xlsx'),
    );
    if (!parkFile) {
      throw new NotFoundException('Файл парка локомотивов не найден в backend/data.');
    }
    return path.join(this.dataDir, parkFile);
  }

  private loadXlsx(): XlsxModule {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('xlsx');
  }
}
