import { mkdir, writeFile } from 'node:fs/promises';
import * as path from 'node:path';

type Worksheet = Record<string, unknown>;
type Workbook = {
  SheetNames: string[];
  Sheets: Record<string, Worksheet>;
};

type StopRecord = {
  station: string;
  stationCode: string | null;
  distanceKm: number | null;
  arrivalRaw: string | null;
  departureRaw: string | null;
  dwellMinutes: number | null;
  arrivalOffsetMinutes: number | null;
  departureOffsetMinutes: number | null;
};

type TrainRecord = {
  sheetName: string;
  direction: 'forward' | 'backward';
  trainNumber: string;
  routeName: string | null;
  serviceDayStart: string;
  stops: StopRecord[];
  touchesAstanaNode: boolean;
  touchesSelectedShoulders: boolean;
};

type ParseColumnSpec = {
  direction: 'forward' | 'backward';
  numberCol: number;
  routeCol: number;
  arrivalCol: number;
  dwellCol: number;
  departureCol: number;
  stationCol: number;
  distanceCol: number;
  stationCodeCol: number;
};

const OUTPUT_DIR = path.resolve(process.cwd(), 'data', 'derived', 'astana-node');
const DEFAULT_SOURCE = path.resolve(
  process.cwd(),
  'data',
  'Расписания поездов действующие',
  'Траф всех пасс. п-в на 2025-2026гг 21.10.25г..xlsx',
);

const SERVICE_DAY_START = '20:00';
const ASTANA_NODE_STATIONS = ['астана', 'астана-1', 'нурлы жол', 'нурлыжол'];
const ASTANA_SHOULDER_STATIONS = ['караганда', 'екібастуз', 'екибастуз', 'есиль', 'кокшетау'];

const COLUMN_SPECS: ParseColumnSpec[] = [
  {
    direction: 'forward',
    numberCol: 1,
    routeCol: 0,
    arrivalCol: 0,
    dwellCol: 1,
    departureCol: 2,
    stationCol: 3,
    distanceCol: 4,
    stationCodeCol: 5,
  },
  {
    direction: 'backward',
    numberCol: 6,
    routeCol: 5,
    arrivalCol: 6,
    dwellCol: 7,
    departureCol: 8,
    stationCol: 3,
    distanceCol: 4,
    stationCodeCol: 5,
  },
];

async function main() {
  const sourcePath = path.resolve(process.cwd(), process.argv[2] ?? DEFAULT_SOURCE);
  const xlsx = loadXlsx();
  const workbook = xlsx.readFile(sourcePath, { raw: false, cellDates: false }) as Workbook;

  const parsedTrains: TrainRecord[] = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as Array<Array<string | number>>;

    for (const spec of COLUMN_SPECS) {
      const train = parseTrainFromSheet(sheetName, rows, spec);
      if (train) {
        parsedTrains.push(train);
      }
    }
  }

  const astanaNodeTrains = parsedTrains.filter((train) => train.touchesAstanaNode);
  const astanaShoulderTrains = parsedTrains.filter(
    (train) => train.touchesAstanaNode || train.touchesSelectedShoulders,
  );

  const summary = {
    sourcePath,
    serviceDayStart: SERVICE_DAY_START,
    totalParsedTrains: parsedTrains.length,
    astanaNodeTrains: astanaNodeTrains.length,
    astanaShoulderTrains: astanaShoulderTrains.length,
    uniqueAstanaTrainNumbers: unique(astanaShoulderTrains.map((train) => train.trainNumber)).length,
    generatedAt: new Date().toISOString(),
  };

  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(
    path.join(OUTPUT_DIR, 'astana-node-summary.json'),
    JSON.stringify(summary, null, 2),
    'utf8',
  );
  await writeFile(
    path.join(OUTPUT_DIR, 'astana-node-trains.json'),
    JSON.stringify(astanaShoulderTrains, null, 2),
    'utf8',
  );

  console.log(JSON.stringify(summary, null, 2));
}

function parseTrainFromSheet(
  sheetName: string,
  rows: Array<Array<string | number>>,
  spec: ParseColumnSpec,
): TrainRecord | null {
  const trainNumber = findTrainNumber(rows, spec.numberCol);
  if (!trainNumber) return null;

  const routeName = findRouteName(rows, spec.routeCol);
  const stops: StopRecord[] = [];

  for (let rowIndex = 10; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex] ?? [];
    const station = cleanValue(row[spec.stationCol]);
    if (!station || looksLikeMetaRow(station)) continue;

    const arrivalRaw = parseTimeText(row[spec.arrivalCol]);
    const departureRaw = parseTimeText(row[spec.departureCol]);
    const distanceKm = parseNullableInt(row[spec.distanceCol]);
    const stationCode = parseNullableCode(row[spec.stationCodeCol]);

    if (!arrivalRaw && !departureRaw) continue;

    stops.push({
      station,
      stationCode,
      distanceKm,
      arrivalRaw,
      departureRaw,
      dwellMinutes: calculateDwellMinutes(arrivalRaw, departureRaw),
      arrivalOffsetMinutes: arrivalRaw ? toServiceOffsetMinutes(arrivalRaw) : null,
      departureOffsetMinutes: departureRaw ? toServiceOffsetMinutes(departureRaw) : null,
    });
  }

  if (!stops.length) return null;

  const orderedStops = spec.direction === 'backward' ? [...stops].reverse() : stops;
  const normalizedStops = applyDayRollovers(orderedStops);
  const stationNames = normalizedStops.map((stop) => normalizeText(stop.station));

  return {
    sheetName,
    direction: spec.direction,
    trainNumber,
    routeName,
    serviceDayStart: SERVICE_DAY_START,
    stops: normalizedStops,
    touchesAstanaNode: stationNames.some((name) => ASTANA_NODE_STATIONS.includes(name)),
    touchesSelectedShoulders: stationNames.some((name) => ASTANA_SHOULDER_STATIONS.includes(name)),
  };
}

function findTrainNumber(rows: Array<Array<string | number>>, numberCol: number): string | null {
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    const value = cleanValue(rows[i]?.[numberCol]);
    if (!value) continue;
    const match = value.match(/^\d{1,4}$/);
    if (match) {
      return value.padStart(3, '0');
    }
  }
  return null;
}

function findRouteName(rows: Array<Array<string | number>>, routeCol: number): string | null {
  for (let i = 0; i < Math.min(rows.length, 8); i++) {
    const value = cleanValue(rows[i]?.[routeCol]);
    if (value && !/поезд|общ\.?вр/i.test(value)) {
      return value;
    }
  }
  return null;
}

function looksLikeMetaRow(station: string): boolean {
  const normalized = normalizeText(station);
  return normalized === 'раздельныепункты' || normalized === 'поезд';
}

function parseTimeText(value: string | number | undefined): string | null {
  const text = cleanValue(value);
  if (!text || text === '-' || text === '—') return null;

  const match = text.match(/(\d{1,2})[:.](\d{2})/);
  if (!match) return null;

  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

function parseNullableInt(value: string | number | undefined): number | null {
  const text = cleanValue(value);
  if (!text) return null;
  const numeric = text.replace(/[^\d-]/g, '');
  if (!numeric) return null;
  const parsed = Number.parseInt(numeric, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function parseNullableCode(value: string | number | undefined): string | null {
  const text = cleanValue(value);
  if (!text || !/\d{4,}/.test(text)) return null;
  return text;
}

function calculateDwellMinutes(arrivalRaw: string | null, departureRaw: string | null): number | null {
  if (!arrivalRaw || !departureRaw) return null;
  const arrival = toServiceOffsetMinutes(arrivalRaw);
  const departure = toServiceOffsetMinutes(departureRaw);
  const diff = departure >= arrival ? departure - arrival : departure + 24 * 60 - arrival;
  return diff;
}

function toServiceOffsetMinutes(timeText: string): number {
  const [hoursText, minutesText] = timeText.split(':');
  const hours = Number.parseInt(hoursText, 10);
  const minutes = Number.parseInt(minutesText, 10);
  const minutesFromMidnight = hours * 60 + minutes;
  const serviceStartMinutes = 20 * 60;

  return minutesFromMidnight >= serviceStartMinutes
    ? minutesFromMidnight - serviceStartMinutes
    : minutesFromMidnight + (24 * 60 - serviceStartMinutes);
}

function applyDayRollovers(stops: StopRecord[]): StopRecord[] {
  let previous = -1;

  return stops.map((stop) => {
    let arrivalOffset = stop.arrivalOffsetMinutes;
    let departureOffset = stop.departureOffsetMinutes;

    if (arrivalOffset !== null) {
      while (arrivalOffset < previous) {
        arrivalOffset += 24 * 60;
      }
      previous = arrivalOffset;
    }

    if (departureOffset !== null) {
      while (departureOffset < previous) {
        departureOffset += 24 * 60;
      }
      previous = departureOffset;
    }

    return {
      ...stop,
      arrivalOffsetMinutes: arrivalOffset,
      departureOffsetMinutes: departureOffset,
      dwellMinutes:
        arrivalOffset !== null && departureOffset !== null ? departureOffset - arrivalOffset : stop.dwellMinutes,
    };
  });
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function cleanValue(value: string | number | undefined): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeText(value: string): string {
  return cleanValue(value)
    .toLowerCase()
    .replace(/[^a-z0-9а-яёіқңғүұһә-]+/gi, '');
}

function loadXlsx() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('xlsx');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
