import { Injectable } from '@nestjs/common';
import { GituralService } from '../gitural/gitural.service';

type RowStatus = 'ok' | 'warning' | 'critical' | 'missing';
type ShoulderKey = 'ASTANA_ESIL' | 'ASTANA_EKIBASTUZ' | 'ASTANA_KOKSHETAU' | 'ASTANA_KARAGANDA';

type LocomotiveTableRow = {
  id: string;
  pairKey: string;
  day: number;
  weekday: string | null;
  shoulder: string | null;
  shoulderKey: ShoulderKey | null;
  actualShoulders: string[];
  locomotiveNumber: string | null;
  locomotiveSeries: string | null;
  locomotiveDepot: string | null;
  locomotiveMatchSource: 'park_pool_match' | 'unresolved';
  arrival: string | null;
  arrivalSort: number | null;
  arrivalSource: 'fact' | 'binding' | 'missing';
  driver: string | null;
  driverSource: 'missing';
  driverShoulder: string | null;
  driverShoulderSource: 'binding' | 'missing';
  reporting: string | null;
  reportingSort: number | null;
  reportingSource: 'derived_notice_120' | 'missing';
  departure: string | null;
  departureSort: number | null;
  departureSource: 'fact' | 'binding' | 'missing';
  dwellMinutes: number | null;
  normMinutes: number | null;
  normSource: 'ideal_exact' | 'ideal_shoulder_avg' | 'park_service_fallback' | 'unavailable';
  overDwellMinutes: number | null;
  isTurner: boolean;
  status: RowStatus;
  statusLabel: string;
  issues: string[];
  qualityFlags: string[];
  arrivalTrainNumber: string | null;
  departureTrainNumber: string | null;
  stationSheet: string;
};

type WindowStop = {
  station: string;
  distanceKm?: number | null;
  arrivalRaw?: string | null;
  departureRaw?: string | null;
};

type NodeTrainWindow = {
  trainNumber: string;
  routeName: string | null;
  sheetName: string;
  direction: string | null;
  corridor: string | null;
  windowStops: WindowStop[];
};

type TurnaroundRecord = {
  stationSheet: string;
  day: number;
  weekday: string | null;
  depot: string | null;
  arrivalTrainNumber: string | null;
  arrivalRoute: string | null;
  arrivalAstanaStop: string | null;
  arrivalAstanaTime: string | null;
  arrivalBindingTime: string | null;
  departureTrainNumber: string | null;
  departureRoute: string | null;
  departureAstanaStop: string | null;
  departureAstanaTime: string | null;
  departureBindingTime: string | null;
  dwellMinutes: number | null;
  dwellHours: number | null;
  matchType: string | null;
};

type TimelinePayload = {
  summary: Record<string, unknown>;
  trains: NodeTrainWindow[];
  turnarounds: TurnaroundRecord[];
  locomotiveTable: LocomotiveTableRow[];
};

type Coordinate = { latitude: number; longitude: number };

export type GisAtlasStationPoint = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  kind: 'station' | 'node';
  shoulderKeys: ShoulderKey[];
  shoulders: string[];
  department: string | null;
  status: RowStatus;
  totalRows: number;
  criticalRows: number;
  warningRows: number;
  missingRows: number;
  topRow: LocomotiveTableRow | null;
  topIssue: string | null;
  coordinateSource: 'catalog' | 'interpolated';
  sortIndexByShoulder?: Partial<Record<ShoulderKey, number>>;
};

export type GisAtlasEventPoint = {
  id: string;
  stationName: string;
  latitude: number;
  longitude: number;
  status: RowStatus;
  eventType: 'оборот' | 'перепростой' | 'вне плеча' | 'неполные данные' | 'событие';
  department: string | null;
  shoulder: string | null;
  row: LocomotiveTableRow;
};

export type GisAtlasShoulderLine = {
  id: ShoulderKey;
  label: string;
  department: string;
  status: RowStatus;
  totalRows: number;
  criticalRows: number;
  coordinates: Array<[number, number]>;
  stations: string[];
};

export type GisAtlasDepartmentZone = {
  id: string;
  name: string;
  color: string;
  center: [number, number];
  radiusKm: number;
  status: RowStatus;
  criticalRows: number;
  totalRows: number;
  approximate: true;
};

export type GisAtlasPayload = {
  generatedAt: string;
  summary: {
    totalStations: number;
    totalNodes: number;
    totalEvents: number;
    criticalEvents: number;
    warningEvents: number;
    missingEvents: number;
    problematicStations: number;
  };
  stations: GisAtlasStationPoint[];
  events: GisAtlasEventPoint[];
  shoulders: GisAtlasShoulderLine[];
  departments: GisAtlasDepartmentZone[];
  schematicOverlay: {
    imageUrl: string;
    bounds: [[number, number], [number, number]];
    note: string;
  };
  locomotiveTable: LocomotiveTableRow[];
};

const ASTANA_ANCHOR: Coordinate = { latitude: 51.1694, longitude: 71.4491 };

const STATION_COORDS: Record<string, Coordinate & { node?: boolean }> = {
  'Астана-1': { latitude: 51.1965, longitude: 71.4143, node: true },
  'Нурлы жол': { latitude: 51.1518, longitude: 71.4686, node: true },
  Сороковая: { latitude: 51.1785, longitude: 71.5215, node: true },
  Есиль: { latitude: 51.9557, longitude: 66.4086, node: true },
  'Караганда-Сорт': { latitude: 49.8019, longitude: 73.1097, node: true },
  Караганды: { latitude: 49.8047, longitude: 73.1094, node: true },
  Павлодар: { latitude: 52.3156, longitude: 76.9674, node: true },
  'Екибастуз I': { latitude: 51.7297, longitude: 75.3229, node: true },
  Ерейментау: { latitude: 51.6259, longitude: 73.1023, node: true },
  Макинка: { latitude: 52.6327, longitude: 70.4165, node: true },
  Кокшетау: { latitude: 53.2833, longitude: 69.3833, node: true },
  Шортанды: { latitude: 51.6996, longitude: 70.9992, node: true },
  Атбасар: { latitude: 51.8126, longitude: 68.3591, node: true },
  Аршалы: { latitude: 50.8456, longitude: 72.1825, node: true },
  Жаксы: { latitude: 51.9131, longitude: 67.3164 },
};

const SHOULDER_META: Record<
  ShoulderKey,
  {
    label: string;
    department: string;
    endPoint: Coordinate;
    curve: number;
  }
> = {
  ASTANA_ESIL: {
    label: 'Астана–Есиль',
    department: 'Костанайское отделение',
    endPoint: STATION_COORDS['Есиль'],
    curve: -0.65,
  },
  ASTANA_EKIBASTUZ: {
    label: 'Астана–Екибастуз',
    department: 'Павлодарское отделение',
    endPoint: STATION_COORDS['Павлодар'],
    curve: 0.42,
  },
  ASTANA_KOKSHETAU: {
    label: 'Астана–Кокшетау',
    department: 'Акмолинское отделение',
    endPoint: STATION_COORDS['Кокшетау'],
    curve: 0.58,
  },
  ASTANA_KARAGANDA: {
    label: 'Астана–Караганда',
    department: 'Карагандинское отделение',
    endPoint: STATION_COORDS['Караганда-Сорт'],
    curve: -0.32,
  },
};

const SHOULDER_HINTS: Array<{ shoulder: ShoulderKey; aliases: string[] }> = [
  {
    shoulder: 'ASTANA_EKIBASTUZ',
    aliases: ['павлодар', 'екибастуз', 'ерейментау', 'родники', 'шидерты', 'калкаман', 'майкайын', 'бозшаколь'],
  },
  {
    shoulder: 'ASTANA_KOKSHETAU',
    aliases: ['кокшетау', 'макинка', 'шортанды', 'ак куль', 'ак-куль', 'жалтыр', 'макинка'],
  },
  {
    shoulder: 'ASTANA_ESIL',
    aliases: ['есиль', 'жаксы', 'атбасар', 'тобол', 'ирченко', 'жана-есиль', 'красивый-казахский'],
  },
  {
    shoulder: 'ASTANA_KARAGANDA',
    aliases: ['караганд', 'аршалы', 'анар', 'актасты', 'нура', 'ельтай', 'едыге', 'кокпекты', 'шокай', 'мырза'],
  },
];

const DEPARTMENT_ZONES: Array<{
  id: string;
  name: string;
  color: string;
  center: [number, number];
  radiusKm: number;
}> = [
  { id: 'aktobe', name: 'Актюбинское отделение', color: '#22c55e', center: [50.28, 57.16], radiusKm: 210 },
  { id: 'atyrau', name: 'Атырауское отделение', color: '#06b6d4', center: [47.11, 51.92], radiusKm: 220 },
  { id: 'mangystau', name: 'Мангистауское отделение', color: '#14b8a6', center: [43.65, 51.14], radiusKm: 180 },
  { id: 'kostanay', name: 'Костанайское отделение', color: '#84cc16', center: [53.21, 63.62], radiusKm: 210 },
  { id: 'akmola', name: 'Акмолинское отделение', color: '#65a30d', center: [51.17, 71.45], radiusKm: 180 },
  { id: 'pavlodar', name: 'Павлодарское отделение', color: '#3b82f6', center: [52.31, 76.97], radiusKm: 170 },
  { id: 'karaganda', name: 'Карагандинское отделение', color: '#f97316', center: [49.80, 73.10], radiusKm: 210 },
  { id: 'semey', name: 'Семейское отделение', color: '#a855f7', center: [50.41, 80.23], radiusKm: 170 },
  { id: 'east-kz', name: 'Восточно-Казахстанское отделение', color: '#0ea5e9', center: [49.95, 82.61], radiusKm: 160 },
  { id: 'almaty', name: 'Алматинское отделение', color: '#10b981', center: [43.24, 76.89], radiusKm: 180 },
  { id: 'zhambyl', name: 'Жамбылское отделение', color: '#06b6d4', center: [42.90, 71.37], radiusKm: 130 },
  { id: 'shymkent', name: 'Шымкентское отделение', color: '#2563eb', center: [42.34, 69.59], radiusKm: 130 },
  { id: 'kyzylorda', name: 'Кызылординское отделение', color: '#ef4444', center: [44.85, 65.50], radiusKm: 180 },
  { id: 'uralsk', name: 'Уральское отделение', color: '#fb923c', center: [51.20, 51.37], radiusKm: 170 },
];

const ASTANA_CORE_STATIONS = new Set(['Астана-1', 'Нурлы жол', 'Сороковая']);

@Injectable()
export class GisService {
  constructor(private readonly gituralService: GituralService) {}

  async getAtlas(): Promise<GisAtlasPayload> {
    const timeline = (await this.gituralService.getTimeline()) as TimelinePayload;
    const stationDrafts = this.buildStationDrafts(timeline.trains);
    const turnoutMap = new Map(
      timeline.turnarounds.map((item) => [this.buildEventKey(item.day, item.stationSheet, item.arrivalTrainNumber, item.departureTrainNumber), item]),
    );

    const eventPoints = timeline.locomotiveTable.map((row) => {
      const turnaround = turnoutMap.get(
        this.buildEventKey(row.day, row.stationSheet, row.arrivalTrainNumber, row.departureTrainNumber),
      );
      const stationName = this.resolveEventStationName(turnaround);
      const baseStation = stationDrafts.get(stationName) ?? stationDrafts.get('Астана-1') ?? stationDrafts.get('Нурлы жол');
      const jitter = this.deterministicJitter(row.id, 0.11);

      return {
        id: `event-${row.id}`,
        stationName,
        latitude: (baseStation?.latitude ?? ASTANA_ANCHOR.latitude) + jitter.latitude,
        longitude: (baseStation?.longitude ?? ASTANA_ANCHOR.longitude) + jitter.longitude,
        status: row.status,
        eventType: this.classifyEventType(row),
        department: row.shoulderKey ? SHOULDER_META[row.shoulderKey].department : null,
        shoulder: row.shoulder,
        row,
      } satisfies GisAtlasEventPoint;
    });

    const rowsByStation = new Map<string, LocomotiveTableRow[]>();
    eventPoints.forEach((eventPoint) => {
      const bucket = rowsByStation.get(eventPoint.stationName) ?? [];
      bucket.push(eventPoint.row);
      rowsByStation.set(eventPoint.stationName, bucket);
    });

    const stationPoints = Array.from(stationDrafts.values())
      .map((station) => {
        const rows = rowsByStation.get(station.name) ?? [];
        const status = this.aggregateStatus(rows.map((item) => item.status));
        const sortedRows = [...rows].sort((left, right) => this.compareRows(left, right));
        const topRow = sortedRows[0] ?? null;

        return {
          ...station,
          status,
          totalRows: rows.length,
          criticalRows: rows.filter((item) => item.status === 'critical').length,
          warningRows: rows.filter((item) => item.status === 'warning').length,
          missingRows: rows.filter((item) => item.status === 'missing').length,
          topRow,
          topIssue: topRow?.issues?.[0] ?? null,
        } satisfies GisAtlasStationPoint;
      })
      .sort((left, right) => left.name.localeCompare(right.name, 'ru'));

    const shoulderLines = (Object.keys(SHOULDER_META) as ShoulderKey[]).map((shoulderKey) => {
      const stations = stationPoints
        .filter((item) => item.shoulderKeys.includes(shoulderKey))
        .sort(
          (left, right) =>
            (left.sortIndexByShoulder?.[shoulderKey] ?? Number.MAX_SAFE_INTEGER) -
            (right.sortIndexByShoulder?.[shoulderKey] ?? Number.MAX_SAFE_INTEGER),
        );

      const relatedRows = timeline.locomotiveTable.filter((row) => row.shoulderKey === shoulderKey);

      return {
        id: shoulderKey,
        label: SHOULDER_META[shoulderKey].label,
        department: SHOULDER_META[shoulderKey].department,
        status: this.aggregateStatus(relatedRows.map((item) => item.status)),
        totalRows: relatedRows.length,
        criticalRows: relatedRows.filter((item) => item.status === 'critical').length,
        coordinates: stations.map((item) => [item.latitude, item.longitude] as [number, number]),
        stations: stations.map((item) => item.name),
      } satisfies GisAtlasShoulderLine;
    });

    const departments = DEPARTMENT_ZONES.map((zone) => {
      const relevantRows = timeline.locomotiveTable.filter(
        (row) => row.shoulderKey && SHOULDER_META[row.shoulderKey].department === zone.name,
      );
      return {
        ...zone,
        status: this.aggregateStatus(relevantRows.map((item) => item.status)),
        criticalRows: relevantRows.filter((item) => item.status === 'critical').length,
        totalRows: relevantRows.length,
        approximate: true as const,
      };
    });

    const problematicStations = stationPoints.filter((item) => item.status === 'critical' || item.status === 'warning').length;

    return {
      generatedAt: new Date().toISOString(),
      summary: {
        totalStations: stationPoints.filter((item) => item.kind === 'station').length,
        totalNodes: stationPoints.filter((item) => item.kind === 'node').length,
        totalEvents: eventPoints.length,
        criticalEvents: eventPoints.filter((item) => item.status === 'critical').length,
        warningEvents: eventPoints.filter((item) => item.status === 'warning').length,
        missingEvents: eventPoints.filter((item) => item.status === 'missing').length,
        problematicStations,
      },
      stations: stationPoints,
      events: eventPoints,
      shoulders: shoulderLines,
      departments,
      schematicOverlay: {
        imageUrl: '/images/ktz-rcup-schematic.png',
        bounds: [
          [40.2, 45.8],
          [56.0, 87.8],
        ],
        note: 'Схематический слой наложен как визуальный reference по присланной карте РЦУП. Он не является строгой геодезической привязкой.',
      },
      locomotiveTable: timeline.locomotiveTable,
    };
  }

  async getMapData() {
    const atlas = await this.getAtlas();
    return atlas.stations;
  }

  async getRouteLines() {
    const atlas = await this.getAtlas();
    return atlas.shoulders;
  }

  private buildStationDrafts(trains: NodeTrainWindow[]) {
    const stationShoulders = new Map<string, Set<ShoulderKey>>();
    const stationRanks = new Map<string, Map<ShoulderKey, number[]>>();

    for (const train of trains) {
      const astanaIndex = train.windowStops.findIndex((stop) => ASTANA_CORE_STATIONS.has(this.canonicalStation(stop.station)));
      if (astanaIndex < 0) continue;

      const leftShoulder = this.inferShoulderKey([
        train.corridor,
        train.sheetName,
        ...train.windowStops.slice(0, astanaIndex + 1).map((stop) => stop.station),
      ]);
      const rightShoulder = this.inferShoulderKey([
        train.corridor,
        train.sheetName,
        ...train.windowStops.slice(astanaIndex).map((stop) => stop.station),
      ]);

      train.windowStops.forEach((stop, index) => {
        const stationName = this.canonicalStation(stop.station);
        if (!stationName) return;

        const assignedShoulders = new Set<ShoulderKey>();
        if (index < astanaIndex && leftShoulder) assignedShoulders.add(leftShoulder);
        if (index > astanaIndex && rightShoulder) assignedShoulders.add(rightShoulder);
        if (index === astanaIndex) {
          if (leftShoulder) assignedShoulders.add(leftShoulder);
          if (rightShoulder) assignedShoulders.add(rightShoulder);
        }
        if (!assignedShoulders.size) {
          if (leftShoulder) assignedShoulders.add(leftShoulder);
          if (rightShoulder) assignedShoulders.add(rightShoulder);
        }

        assignedShoulders.forEach((shoulderKey) => {
          const shoulderBucket = stationShoulders.get(stationName) ?? new Set<ShoulderKey>();
          shoulderBucket.add(shoulderKey);
          stationShoulders.set(stationName, shoulderBucket);

          const rankBucket = stationRanks.get(stationName) ?? new Map<ShoulderKey, number[]>();
          const values = rankBucket.get(shoulderKey) ?? [];
          values.push(Math.abs(index - astanaIndex));
          rankBucket.set(shoulderKey, values);
          stationRanks.set(stationName, rankBucket);
        });
      });
    }

    const drafts = new Map<string, Omit<GisAtlasStationPoint, 'status' | 'totalRows' | 'criticalRows' | 'warningRows' | 'missingRows' | 'topRow' | 'topIssue'>>();

    const shoulderStationOrder = new Map<ShoulderKey, Array<{ name: string; rank: number }>>();
    (Object.keys(SHOULDER_META) as ShoulderKey[]).forEach((shoulderKey) => {
      const items = Array.from(stationRanks.entries())
        .filter(([, rankMap]) => rankMap.has(shoulderKey))
        .map(([name, rankMap]) => ({
          name,
          rank: this.median(rankMap.get(shoulderKey) ?? []),
        }))
        .sort((left, right) => left.rank - right.rank);
      shoulderStationOrder.set(shoulderKey, items);
    });

    for (const [stationName, shoulders] of stationShoulders.entries()) {
      const orderedShoulders = Array.from(shoulders).sort((left, right) => SHOULDER_META[left].label.localeCompare(SHOULDER_META[right].label, 'ru'));
      const primaryShoulder = orderedShoulders[0] ?? null;
      const explicit = STATION_COORDS[stationName];
      const coordinateSource = explicit ? 'catalog' : 'interpolated';
      const coordinate =
        explicit ??
        (primaryShoulder
          ? this.interpolateShoulderCoordinate(
              primaryShoulder,
              this.stationRank(stationName, primaryShoulder, shoulderStationOrder),
              shoulderStationOrder.get(primaryShoulder)?.length ?? 1,
            )
          : ASTANA_ANCHOR);

      drafts.set(stationName, {
        id: `station-${this.normalizeText(stationName).replace(/\s+/g, '-')}`,
        name: stationName,
        latitude: coordinate.latitude,
        longitude: coordinate.longitude,
        kind: explicit?.node || ASTANA_CORE_STATIONS.has(stationName) ? 'node' : 'station',
        shoulderKeys: orderedShoulders,
        shoulders: orderedShoulders.map((item) => SHOULDER_META[item].label),
        department: primaryShoulder ? SHOULDER_META[primaryShoulder].department : null,
        coordinateSource,
        sortIndexByShoulder: Object.fromEntries(
          orderedShoulders.map((shoulderKey) => [
            shoulderKey,
            this.stationRank(stationName, shoulderKey, shoulderStationOrder),
          ]),
        ),
      });
    }

    return drafts;
  }

  private resolveEventStationName(turnaround: TurnaroundRecord | undefined) {
    return this.canonicalStation(turnaround?.arrivalAstanaStop ?? turnaround?.departureAstanaStop ?? 'Астана-1');
  }

  private classifyEventType(row: LocomotiveTableRow): GisAtlasEventPoint['eventType'] {
    if (row.qualityFlags.includes('out_of_shoulder')) return 'вне плеча';
    if ((row.overDwellMinutes ?? 0) > 0) return 'перепростой';
    if (row.status === 'missing') return 'неполные данные';
    if (row.isTurner) return 'оборот';
    return 'событие';
  }

  private interpolateShoulderCoordinate(shoulderKey: ShoulderKey, rank: number, totalStations: number): Coordinate {
    const meta = SHOULDER_META[shoulderKey];
    const safeTotal = Math.max(totalStations - 1, 1);
    const ratio = Math.max(0, Math.min(rank / safeTotal, 1));
    const baseLat = ASTANA_ANCHOR.latitude + (meta.endPoint.latitude - ASTANA_ANCHOR.latitude) * ratio;
    const baseLng = ASTANA_ANCHOR.longitude + (meta.endPoint.longitude - ASTANA_ANCHOR.longitude) * ratio;

    const dx = meta.endPoint.longitude - ASTANA_ANCHOR.longitude;
    const dy = meta.endPoint.latitude - ASTANA_ANCHOR.latitude;
    const len = Math.max(Math.sqrt(dx * dx + dy * dy), 0.0001);
    const normX = -dy / len;
    const normY = dx / len;
    const arc = Math.sin(Math.PI * ratio) * meta.curve;

    return {
      latitude: baseLat + normY * arc,
      longitude: baseLng + normX * arc,
    };
  }

  private buildEventKey(
    day: number,
    stationSheet: string,
    arrivalTrainNumber: string | null,
    departureTrainNumber: string | null,
  ) {
    return `${day}|${this.normalizeText(stationSheet)}|${this.normalizeTrain(arrivalTrainNumber)}|${this.normalizeTrain(departureTrainNumber)}`;
  }

  private inferShoulderKey(values: Array<string | null | undefined>): ShoulderKey | null {
    const normalized = values.map((value) => this.normalizeText(value)).join(' ');
    for (const hint of SHOULDER_HINTS) {
      if (hint.aliases.some((alias) => normalized.includes(alias))) {
        return hint.shoulder;
      }
    }
    return null;
  }

  private canonicalStation(value: string | null | undefined) {
    const raw = String(value ?? '').trim();
    const normalized = this.normalizeText(raw);
    if (!normalized) return '';
    if (normalized.includes('нур-султан i') || normalized.includes('нур-султан 1')) return 'Астана-1';
    if (normalized.includes('астана-1') || normalized.includes('астана 1')) return 'Астана-1';
    if (normalized.includes('нурлы жол')) return 'Нурлы жол';
    if (normalized.includes('сороковая')) return 'Сороковая';
    if (normalized.includes('караганда-сорт')) return 'Караганда-Сорт';
    if (normalized.includes('екибастуз')) return 'Екибастуз I';
    if (normalized.includes('кокшетау')) return 'Кокшетау';
    return raw.replace(/\s+/g, ' ').trim();
  }

  private normalizeTrain(value: string | null | undefined) {
    return String(value ?? '').replace(/\D/g, '').padStart(3, '0');
  }

  private normalizeText(value: string | null | undefined) {
    return String(value ?? '')
      .toLowerCase()
      .replace(/ё/g, 'е')
      .replace(/[^\p{L}\p{N}\- ]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private median(values: number[]) {
    if (!values.length) return 0;
    const sorted = [...values].sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);
    if (sorted.length % 2) return sorted[middle];
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }

  private deterministicJitter(seed: string, amplitude: number): Coordinate {
    let hash = 2166136261;
    for (const char of seed) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    const angle = ((hash >>> 0) % 360) * (Math.PI / 180);
    const radius = ((((hash >>> 8) % 1000) / 1000) * amplitude) / 5;
    return {
      latitude: Math.sin(angle) * radius,
      longitude: Math.cos(angle) * radius,
    };
  }

  private aggregateStatus(statuses: RowStatus[]): RowStatus {
    if (!statuses.length) return 'missing';
    if (statuses.includes('critical')) return 'critical';
    if (statuses.includes('warning')) return 'warning';
    if (statuses.includes('ok')) return 'ok';
    return 'missing';
  }

  private compareRows(left: LocomotiveTableRow, right: LocomotiveTableRow) {
    const statusWeight = this.statusWeight(left.status) - this.statusWeight(right.status);
    if (statusWeight !== 0) return statusWeight;
    const overstay = (right.overDwellMinutes ?? -1) - (left.overDwellMinutes ?? -1);
    if (overstay !== 0) return overstay;
    return (left.arrivalSort ?? Number.MAX_SAFE_INTEGER) - (right.arrivalSort ?? Number.MAX_SAFE_INTEGER);
  }

  private statusWeight(status: RowStatus) {
    if (status === 'critical') return -3;
    if (status === 'warning') return -2;
    if (status === 'missing') return -1;
    return 0;
  }

  private stationRank(name: string, shoulderKey: ShoulderKey, prebuilt?: Map<ShoulderKey, Array<{ name: string; rank: number }>>) {
    const list = prebuilt?.get(shoulderKey);
    if (!list) return Number.MAX_SAFE_INTEGER;
    const found = list.find((item) => item.name === name);
    return found?.rank ?? Number.MAX_SAFE_INTEGER;
  }
}
