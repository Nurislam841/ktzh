import { Injectable, Logger } from '@nestjs/common';
import {
  DEMO_FALLBACK_STOPS,
  DEMO_TRAIN_DEFINITIONS,
  type DemoTrainDefinition,
} from './passenger-demo-bindings.data';
import { buildDemoSimulationReports } from './passenger-demo-bindings.reports';
import { PassengerTimetableService } from './passenger-timetable.service';

const DAY_MINUTES = 24 * 60;
const SERVICE_DAY_START_MINUTES = 20 * 60;
const LOCOMOTIVE_BASES = [
  'Алматы-2',
  'Нурлы жол',
  'Астана-1',
  'Шымкент',
  'Атырау',
  'Павлодар',
  'Кызылорда',
  'Орал',
  'Актобе',
  'Мангистау',
];

function normalizeText(value: string | null | undefined) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}\- ]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizePairKey(pair: string) {
  const [leftRaw = '', rightRaw = ''] = pair.split('/');
  const left = leftRaw.trim().replace(/\D+/g, '');
  const right = rightRaw.trim().replace(/\D+/g, '');
  return [left, right]
    .sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10))
    .map((value) => value.padStart(3, '0'))
    .join('/');
}

function tractionLabel(value: 'electric' | 'diesel') {
  return value === 'electric' ? 'Электровоз' : 'Тепловоз';
}

function formatOperationalMinute(minute: number) {
  const dayOffset = Math.floor(minute / DAY_MINUTES);
  const normalized = ((minute % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  const absolute = (SERVICE_DAY_START_MINUTES + normalized) % DAY_MINUTES;
  const hh = Math.floor(absolute / 60);
  const mm = absolute % 60;
  return `D+${dayOffset} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

type DemoStopRow = {
  index: number;
  station: string;
  arrival: string | null;
  departure: string | null;
  arrivalMinute: number | null;
  departureMinute: number | null;
  dwellMinutes: number;
  dwellLabel: string;
  eventType: string;
  eventLabel: string;
};

type DemoTrainRow = {
  id: string;
  pair: string;
  pairKey: string;
  routeLabel: string;
  origin: string;
  destination: string;
  category: DemoTrainDefinition['category'];
  categoryLabel: string;
  periodicity: string;
  compositions: string;
  wagonCount: number;
  carrier: string;
  tractionType: 'electric' | 'diesel';
  tractionLabel: string;
  assignedLocomotiveId: string;
  assignedLocomotiveLabel: string;
  assignedLocomotiveStatus: string;
  compositionCount: number;
  stopCount: number;
  stops: DemoStopRow[];
};

type DemoLocomotiveRow = {
  id: string;
  label: string;
  tractionType: 'electric' | 'diesel';
  tractionLabel: string;
  status: 'assigned' | 'reserve';
  statusLabel: string;
  assignedPair: string | null;
  assignedRouteLabel: string | null;
  station: string;
  note: string;
};

type AllocatorLocomotive = {
  id: string;
  label: string;
  tractionType: 'electric' | 'diesel';
  tractionLabel: string;
  station: string;
  assignedPair: string | null;
  assignedRouteLabel: string | null;
};

@Injectable()
export class PassengerDemoBindingsService {
  private readonly logger = new Logger(PassengerDemoBindingsService.name);

  constructor(private readonly passengerTimetableService: PassengerTimetableService) {}

  async getOverview() {
    const dataset = await this.loadDatasetSafe();
    const tripIndex = this.buildTripIndex(dataset?.allTrips ?? []);
    const electricFleet = this.buildAllocatorFleet('electric', 40);
    const dieselFleet = this.buildAllocatorFleet('diesel', 40);
    const fleet = [...electricFleet, ...dieselFleet];

    const trains: DemoTrainRow[] = DEMO_TRAIN_DEFINITIONS.map((definition) => {
      const pairKey = normalizePairKey(definition.pair);
      const trip = this.pickTripForDefinition(definition, tripIndex.get(pairKey) ?? []);
      const stops = this.buildStops(definition, trip);
      const compositionCount = this.extractCompositionCount(definition.compositions);
      const locomotive = this.assignLocomotiveForTrain(definition, fleet);

      const row: DemoTrainRow = {
        id: pairKey,
        pair: definition.pair,
        pairKey,
        routeLabel: definition.routeLabel,
        origin: definition.origin,
        destination: definition.destination,
        category: definition.category,
        categoryLabel: definition.categoryLabel,
        periodicity: definition.periodicity,
        compositions: definition.compositions,
        wagonCount: definition.wagonCount,
        carrier: definition.carrier,
        tractionType: definition.tractionType,
        tractionLabel: tractionLabel(definition.tractionType),
        assignedLocomotiveId: locomotive?.id ?? `unassigned:${pairKey}`,
        assignedLocomotiveLabel: locomotive?.label ?? 'Ожидает свободный локомотив',
        assignedLocomotiveStatus: locomotive
          ? 'Текущий лучший кандидат из станционного пула'
          : 'Ожидает свободную тягу на станции',
        compositionCount,
        stopCount: stops.length,
        stops,
      };

      return row;
    });

    const trainByPair = new Map(trains.map((item) => [item.pair, item]));
    const locomotives: DemoLocomotiveRow[] = fleet.map((locomotive) => {
      const assignedTrain = locomotive.assignedPair ? trainByPair.get(locomotive.assignedPair) ?? null : null;

      if (assignedTrain && locomotive.assignedPair) {
        return {
          id: locomotive.id,
          label: locomotive.label,
          tractionType: locomotive.tractionType,
          tractionLabel: locomotive.tractionLabel,
          status: 'assigned',
          statusLabel: 'Кандидат по станции',
          assignedPair: locomotive.assignedPair,
          assignedRouteLabel: locomotive.assignedRouteLabel,
          station: locomotive.station,
          note: `${locomotive.label} сейчас лучший кандидат для состава №${assignedTrain.pair}, но платформа может автоматически выбрать любой другой свободный локомотив этой же станции.`,
        };
      }

      return {
        id: locomotive.id,
        label: locomotive.label,
        tractionType: locomotive.tractionType,
        tractionLabel: locomotive.tractionLabel,
        status: 'reserve',
        statusLabel: 'Резерв',
        assignedPair: null,
        assignedRouteLabel: null,
        station: locomotive.station,
        note: 'Свободен на станции и может быть автоматически выдан любому составу с этой же станции.',
      };
    });

    const reports = buildDemoSimulationReports({
      trains,
      locomotives,
      now: new Date(),
    });

    return {
      generatedAt: new Date().toISOString(),
      source: dataset
        ? 'passenger-timetable + station-pool auto binding + idle minimization'
        : 'demo fleet fallback + station-pool auto binding + idle minimization',
      summary: {
        totalTrains: trains.length,
        totalLocomotives: locomotives.length,
        electricLocomotives: electricFleet.length,
        dieselLocomotives: dieselFleet.length,
        assignedLocomotives: locomotives.filter((item) => item.status === 'assigned').length,
        reserveLocomotives: locomotives.filter((item) => item.status === 'reserve').length,
        totalWagons: trains.reduce((sum, item) => sum + item.wagonCount, 0),
        monthlySavedIdleHours: reports.monthlyReport.summary.savedIdleHoursTotal,
        dailySavedIdleHours: reports.dailyReport.summary.savedIdleHours,
        monthlyBaselineIdleHours: reports.monthlyReport.summary.averageBaselineIdleHoursPerTrainDay,
        monthlyOptimizedIdleHours: reports.monthlyReport.summary.averageOptimizedIdleHoursPerTrainDay,
      },
      trains,
      locomotives,
      ...reports,
    };
  }

  async exportWorkbookBuffer() {
    const overview = await this.getOverview();
    const xlsx = this.loadXlsx();
    const workbook = xlsx.utils.book_new();

    const summaryRows = [
      ['Показатель', 'Значение'],
      ['Дата генерации', overview.generatedAt],
      ['Источник', overview.source],
      ['Поезда', overview.summary.totalTrains],
      ['Вагонность по перечню', overview.summary.totalWagons],
      ['Локомотивы', overview.summary.totalLocomotives],
      ['Электровозы', overview.summary.electricLocomotives],
      ['Тепловозы', overview.summary.dieselLocomotives],
      ['Резерв', overview.summary.reserveLocomotives],
      ['Сейчас в пути', overview.live.summary.trainsInMotion],
      ['Сейчас на обороте', overview.live.summary.trainsOnTurnaround],
      ['Сегодня в графике', overview.dailyReport.summary.trainsScheduled],
      ['Простой вручную за сутки, ч', overview.dailyReport.summary.baselineAverageIdleHours],
      ['Простой после авто за сутки, ч', overview.dailyReport.summary.optimizedAverageIdleHours],
      ['Сэкономлено за сутки, ч', overview.dailyReport.summary.savedIdleHours],
      ['Простой вручную по месяцу, ч', overview.monthlyReport.summary.averageBaselineIdleHoursPerTrainDay],
      ['Простой после авто по месяцу, ч', overview.monthlyReport.summary.averageOptimizedIdleHoursPerTrainDay],
      ['Сэкономлено за месяц, ч', overview.monthlyReport.summary.savedIdleHoursTotal],
    ];

    const routeRows = [
      [
        'Поезд',
        'Маршрут',
        'Категория',
        'Периодичность',
        'Составы',
        'Вагонов',
        'Тяга',
        'Локомотив',
        'Перевозчик',
      ],
      ...overview.trains.map((item: any) => [
        item.pair,
        item.routeLabel,
        item.categoryLabel,
        item.periodicity,
        item.compositions,
        item.wagonCount,
        item.tractionLabel,
        item.assignedLocomotiveLabel,
        item.carrier,
      ]),
    ];

    const liveRows = [
      [
        'Поезд',
        'Маршрут',
        'Локомотив',
        'Статус',
        'Локация',
        'Следующее событие',
        'Время события',
        'Ожидание вручную',
        'Ожидание авто',
        'Экономия',
      ],
      ...overview.live.rows.map((item: any) => [
        item.pair,
        item.routeLabel,
        item.locomotiveLabel,
        item.stateLabel,
        item.currentLocation,
        item.nextEventLabel,
        item.nextEventTime,
        item.manualIdleLabel,
        item.optimizedIdleLabel,
        item.savedIdleLabel,
      ]),
    ];

    const dailyRows = [
      [
        'Поезд',
        'Маршрут',
        'Локомотив',
        'Сегодня',
        'Статус сейчас',
        'Плановое отпр.',
        'Отпр. вручную',
        'Отпр. авто',
        'Возврат состава',
        'Оборот',
        'Простой вручную',
        'Простой авто',
        'Экономия',
      ],
      ...overview.dailyReport.rows.map((item: any) => [
        item.pair,
        item.routeLabel,
        item.locomotiveLabel,
        item.scheduledLabel,
        item.statusNow,
        item.plannedDepartureLabel,
        item.baselineDepartureLabel,
        item.autoDepartureLabel,
        item.returnArrivalLabel,
        item.turnaroundLabel,
        item.baselineIdleLabel,
        item.optimizedIdleLabel,
        item.savedIdleLabel,
      ]),
    ];

    const monthlyHeader = [
      'Поезд',
      'Маршрут',
      'Авто-локо',
      'Периодичность',
      'Вручную / авто / экономия, ч',
      ...overview.monthlyReport.days.map((day: any) => `${day.dayNumber} ${day.weekdayShort}`),
    ];
    const monthlyRows = [
      monthlyHeader,
      ...overview.monthlyReport.rows.map((row: any) => [
        row.pair,
        row.routeLabel,
        row.locomotiveLabel,
        row.periodicity,
        `${row.averageBaselineIdleHours} / ${row.averageOptimizedIdleHours} / ${row.savedIdleHours}`,
        ...row.cells.map((cell: any) =>
          cell.isActive
            ? `${cell.plannedDepartureLabel}\nавто ${cell.autoDepartureLabel}\nручн ${cell.baselineIdleLabel}\nавто ${cell.optimizedIdleLabel}\nэкономия ${cell.savedIdleLabel}`
            : '—',
        ),
      ]),
    ];

    const fleetRows = [
      ['Локомотив', 'Тяга', 'Статус', 'Поезд', 'Маршрут', 'Станция', 'Примечание'],
      ...overview.locomotives.map((item: any) => [
        item.label,
        item.tractionLabel,
        item.statusLabel,
        item.assignedPair ?? '',
        item.assignedRouteLabel ?? '',
        item.station,
        item.note,
      ]),
    ];

    const selectedStopsRows = [
      ['Поезд', 'Станция', 'Приб.', 'Отпр.', 'Стоянка', 'Тип операции'],
      ...overview.trains.flatMap((train: any) =>
        train.stops.map((stop: any) => [
          train.pair,
          stop.station,
          stop.arrival ?? '',
          stop.departure ?? '',
          stop.dwellLabel,
          stop.eventLabel,
        ]),
      ),
    ];

    xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet(summaryRows), 'Summary');
    xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet(routeRows), 'Routes');
    xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet(liveRows), 'Live');
    xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet(dailyRows), 'Daily');
    xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet(monthlyRows), 'Monthly');
    xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet(fleetRows), 'Fleet');
    xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet(selectedStopsRows), 'Stops');

    return xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  }

  private async loadDatasetSafe() {
    try {
      return await this.passengerTimetableService.getDatasetSnapshot();
    } catch (error) {
      this.logger.warn(`Demo page fallback activated: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  private buildTripIndex(allTrips: any[]) {
    const index = new Map<string, any[]>();

    allTrips.forEach((trip) => {
      const bucket = index.get(trip.pairKey) ?? [];
      bucket.push(trip);
      index.set(trip.pairKey, bucket);
    });

    return index;
  }

  private pickTripForDefinition(definition: DemoTrainDefinition, trips: any[]) {
    if (!trips.length) return null;

    return (
      trips.find(
        (trip) =>
          normalizeText(trip.originStation) === normalizeText(definition.origin) &&
          normalizeText(trip.destinationStation) === normalizeText(definition.destination),
      ) ??
      trips.find((trip) => normalizeText(trip.originStation) === normalizeText(definition.origin)) ??
      trips[0]
    );
  }

  private buildStops(definition: DemoTrainDefinition, trip: any): DemoStopRow[] {
    if (trip?.stops?.length) {
      return trip.stops.map((stop: any, index: number) => {
        const arrivalMinute =
          typeof stop.arrival_operational_minute === 'number' ? stop.arrival_operational_minute : null;
        const departureMinute =
          typeof stop.departure_operational_minute === 'number' ? stop.departure_operational_minute : null;
        const dwellMinutes =
          typeof arrivalMinute === 'number' && typeof departureMinute === 'number'
            ? Math.max(departureMinute - arrivalMinute, 0)
            : 0;

        return {
          index: index + 1,
          station: stop.station_name,
          arrival: typeof arrivalMinute === 'number' ? formatOperationalMinute(arrivalMinute) : null,
          departure: typeof departureMinute === 'number' ? formatOperationalMinute(departureMinute) : null,
          arrivalMinute,
          departureMinute,
          dwellMinutes,
          dwellLabel: `${dwellMinutes} мин`,
          eventType: stop.event_type,
          eventLabel: this.eventLabel(stop.event_type),
        };
      });
    }

    return this.buildFallbackStops(definition);
  }

  private buildFallbackStops(definition: DemoTrainDefinition) {
    const pairKey = normalizePairKey(definition.pair);
    const stations = DEMO_FALLBACK_STOPS[pairKey] ?? [
      definition.origin,
      'Узловая-1',
      'Узловая-2',
      definition.destination,
    ];

    let cursor = 60 + (DEMO_TRAIN_DEFINITIONS.findIndex((item) => item.pair === definition.pair) % 8) * 35;

    return stations.map((station, index) => {
      const isFirst = index === 0;
      const isLast = index === stations.length - 1;
      const arrivalMinute = isFirst ? null : cursor;
      const dwellMinutes = isFirst || isLast ? 0 : 12 + ((index * 3) % 11);
      const departureMinute = isLast ? null : (arrivalMinute ?? cursor) + dwellMinutes;

      if (typeof departureMinute === 'number') {
        cursor = departureMinute + 90 + ((index * 41) % 85);
      }

      const eventType = isFirst ? 'origin_departure' : isLast ? 'terminal_arrival' : 'stop';

      return {
        index: index + 1,
        station,
        arrival: typeof arrivalMinute === 'number' ? formatOperationalMinute(arrivalMinute) : null,
        departure: typeof departureMinute === 'number' ? formatOperationalMinute(departureMinute) : null,
        arrivalMinute,
        departureMinute,
        dwellMinutes,
        dwellLabel: `${dwellMinutes} мин`,
        eventType,
        eventLabel: this.eventLabel(eventType),
      };
    });
  }

  private extractCompositionCount(value: string) {
    const match = value.match(/\d+/);
    return match ? Math.max(Number.parseInt(match[0], 10), 1) : 1;
  }

  private buildAllocatorFleet(tractionType: 'electric' | 'diesel', count: number): AllocatorLocomotive[] {
    const stationSequence = this.buildStationDemandSequence(tractionType, count);
    const prefix = tractionType === 'electric' ? 'Э' : 'Т';

    return Array.from({ length: count }, (_, index) => ({
      id: `${tractionType === 'electric' ? 'E' : 'T'}-${index + 1}`,
      label: `${prefix}-${index + 1}`,
      tractionType,
      tractionLabel: tractionLabel(tractionType),
      station: stationSequence[index] ?? LOCOMOTIVE_BASES[index % LOCOMOTIVE_BASES.length],
      assignedPair: null,
      assignedRouteLabel: null,
    }));
  }

  private buildStationDemandSequence(tractionType: 'electric' | 'diesel', count: number) {
    const stationDemand = new Map<string, number>();

    DEMO_TRAIN_DEFINITIONS
      .filter((item) => item.tractionType === tractionType)
      .forEach((item) => {
        const station = item.origin;
        stationDemand.set(station, (stationDemand.get(station) ?? 0) + 1);
      });

    const sequence: string[] = [];
    stationDemand.forEach((demand, station) => {
      for (let index = 0; index < demand; index += 1) {
        sequence.push(station);
      }
    });

    const fillers = Array.from(new Set([
      ...Array.from(stationDemand.keys()),
      ...LOCOMOTIVE_BASES,
    ]));

    let cursor = 0;
    while (sequence.length < count) {
      sequence.push(fillers[cursor % fillers.length]);
      cursor += 1;
    }

    return sequence.slice(0, count);
  }

  private assignLocomotiveForTrain(definition: DemoTrainDefinition, fleet: AllocatorLocomotive[]) {
    const sameStation = fleet.find((item) =>
      item.tractionType === definition.tractionType &&
      item.assignedPair === null &&
      normalizeText(item.station) === normalizeText(definition.origin),
    );

    if (sameStation) {
      sameStation.assignedPair = definition.pair;
      sameStation.assignedRouteLabel = definition.routeLabel;
      return sameStation;
    }

    const sameTraction = fleet.find((item) =>
      item.tractionType === definition.tractionType &&
      item.assignedPair === null,
    );

    if (sameTraction) {
      sameTraction.assignedPair = definition.pair;
      sameTraction.assignedRouteLabel = definition.routeLabel;
      sameTraction.station = definition.origin;
      return sameTraction;
    }

    return null;
  }

  private eventLabel(value: string) {
    if (value === 'origin_departure') return 'DEPARTURE_PREP';
    if (value === 'terminal_arrival') return 'ARRIVAL';
    if (value === 'turnaround') return 'TURNAROUND';
    return 'stop';
  }

  private loadXlsx() {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('xlsx');
  }
}
