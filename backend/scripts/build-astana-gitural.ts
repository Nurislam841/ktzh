import { mkdir, readFile, writeFile } from 'node:fs/promises';
import * as path from 'node:path';

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

type NodeTrainWindow = {
  trainNumber: string;
  routeName: string | null;
  sheetName: string;
  direction: 'forward' | 'backward';
  corridor: string | null;
  entersNodeAt: string | null;
  exitsNodeAt: string | null;
  astanaCoreStop: string | null;
  windowStops: StopRecord[];
};

type BindingEvent = {
  sheetName: string;
  depot: string | null;
  day: number;
  weekday: string | null;
  arrivalTrainNumber: string | null;
  arrivalTime: string | null;
  departureTrainNumber: string | null;
  departureTime: string | null;
  dwellMinutes: number | null;
};

const DERIVED_DIR = path.resolve(process.cwd(), 'data', 'derived', 'astana-node');
const TRAINS_PATH = path.join(DERIVED_DIR, 'astana-node-trains.json');
const BINDINGS_SOURCE = path.resolve(
  process.cwd(),
  'data',
  'Подвязки 2025-2026',
  'ТЛ-11',
  'Новый график KZ4Acт ТЛ11.xlsx',
);

const ASTANA_CORE = ['нурлы жол', 'астана-1', 'сороковая'];
const SHOULDER_ANCHORS = ['караганда-сорт', 'караганды', 'кокшетау', 'есиль', 'екибастуз', 'павлодар'];

async function main() {
  const trains = JSON.parse(await readFile(TRAINS_PATH, 'utf8')) as TrainRecord[];
  const xlsx = loadXlsx();
  const wb = xlsx.readFile(BINDINGS_SOURCE, { raw: false, cellDates: false }) as {
    SheetNames: string[];
    Sheets: Record<string, unknown>;
  };

  const nodeWindows = buildNodeWindows(trains);
  const bindingEvents = parseBindingEvents(wb);

  const summary = {
    generatedAt: new Date().toISOString(),
    nodeWindowTrains: nodeWindows.length,
    uniqueNodeTrains: new Set(nodeWindows.map((item) => item.trainNumber)).size,
    bindingEvents: bindingEvents.length,
    bindingSheets: new Set(bindingEvents.map((item) => item.sheetName)).size,
  };

  await mkdir(DERIVED_DIR, { recursive: true });
  await writeFile(path.join(DERIVED_DIR, 'astana-gitural-summary.json'), JSON.stringify(summary, null, 2), 'utf8');
  await writeFile(path.join(DERIVED_DIR, 'astana-node-windows.json'), JSON.stringify(nodeWindows, null, 2), 'utf8');
  await writeFile(path.join(DERIVED_DIR, 'astana-loco-bindings.json'), JSON.stringify(bindingEvents, null, 2), 'utf8');

  console.log(JSON.stringify(summary, null, 2));
}

function buildNodeWindows(trains: TrainRecord[]): NodeTrainWindow[] {
  const results: NodeTrainWindow[] = [];

  for (const train of trains) {
    const normalizedStops = train.stops.map((stop) => normalize(stop.station));
    const astanaIndices = normalizedStops
      .map((station, index) => (ASTANA_CORE.includes(station) ? index : -1))
      .filter((index) => index >= 0);
    if (!astanaIndices.length) continue;

    const astanaIndex = astanaIndices[0];
    const leftAnchorIndex = findAnchorIndex(normalizedStops, astanaIndex, -1);
    const rightAnchorIndex = findAnchorIndex(normalizedStops, astanaIndex, 1);
    const from = leftAnchorIndex !== null ? leftAnchorIndex : Math.max(0, astanaIndex - 6);
    const to = rightAnchorIndex !== null ? rightAnchorIndex : Math.min(train.stops.length - 1, astanaIndex + 6);

    const windowStops = train.stops.slice(from, to + 1);
    results.push({
      trainNumber: train.trainNumber,
      routeName: train.routeName,
      sheetName: train.sheetName,
      direction: train.direction,
      corridor: corridorLabel(train.stops[from]?.station ?? null, train.stops[to]?.station ?? null),
      entersNodeAt: firstDefined(windowStops.map((stop) => stop.arrivalRaw ?? stop.departureRaw)),
      exitsNodeAt: lastDefined(windowStops.map((stop) => stop.departureRaw ?? stop.arrivalRaw)),
      astanaCoreStop: train.stops[astanaIndex]?.station ?? null,
      windowStops,
    });
  }

  return results.sort((a, b) => a.trainNumber.localeCompare(b.trainNumber));
}

function findAnchorIndex(stations: string[], astanaIndex: number, direction: -1 | 1): number | null {
  let i = astanaIndex + direction;
  while (i >= 0 && i < stations.length) {
    if (SHOULDER_ANCHORS.includes(stations[i])) return i;
    i += direction;
  }
  return null;
}

function corridorLabel(fromStation: string | null, toStation: string | null): string | null {
  if (!fromStation && !toStation) return null;
  return `${fromStation ?? '?'} -> ${toStation ?? '?'}`;
}

function parseBindingEvents(workbook: { SheetNames: string[]; Sheets: Record<string, unknown> }): BindingEvent[] {
  const xlsx = loadXlsx();
  const output: BindingEvent[] = [];

  for (const sheetName of workbook.SheetNames) {
    const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], {
      header: 1,
      defval: '',
      raw: true,
    }) as Array<Array<string | number>>;

    const headerRow = rows.find((row) => clean(row[0]).toLowerCase().includes('наименование операций'));
    if (!headerRow) continue;
    const headerIndex = rows.indexOf(headerRow);
    const weekdayRow = rows[headerIndex + 1] ?? [];
    const depot = clean(headerRow[1]) || null;

    for (let rowIndex = headerIndex + 2; rowIndex < rows.length; rowIndex += 5) {
      const arrivalTrainRow = rows[rowIndex] ?? [];
      const arrivalTimeRow = rows[rowIndex + 1] ?? [];
      const departureTrainRow = rows[rowIndex + 2] ?? [];
      const departureTimeRow = rows[rowIndex + 3] ?? [];
      const dwellRow = rows[rowIndex + 4] ?? [];

      if (!clean(arrivalTrainRow[0]).toLowerCase().includes('отцепка')) continue;

      for (let col = 2; col < Math.max(arrivalTrainRow.length, departureTrainRow.length); col++) {
        const arrivalTrainNumber = parseTrain(arrivalTrainRow[col]);
        const departureTrainNumber = parseTrain(departureTrainRow[col]);
        const arrivalTime = parseExcelTime(arrivalTimeRow[col]);
        const departureTime = parseExcelTime(departureTimeRow[col]);
        const dwellMinutes = parseExcelDurationMinutes(dwellRow[col]);
        const weekday = clean(weekdayRow[col]) || null;
        const dayCell = headerRow[col];
        const day = typeof dayCell === 'number' ? dayCell : Number.parseInt(clean(dayCell), 10);

        if (!arrivalTrainNumber && !departureTrainNumber && !arrivalTime && !departureTime) continue;
        if (Number.isNaN(day)) continue;

        output.push({
          sheetName,
          depot,
          day,
          weekday,
          arrivalTrainNumber,
          arrivalTime,
          departureTrainNumber,
          departureTime,
          dwellMinutes,
        });
      }
    }
  }

  return output;
}

function parseTrain(value: string | number | undefined): string | null {
  const text = clean(value).toLowerCase();
  if (!text || text === 'рез') return null;
  const match = text.match(/\d{1,4}/);
  return match ? match[0].padStart(3, '0') : null;
}

function parseExcelTime(value: string | number | undefined): string | null {
  if (typeof value === 'number') {
    const minutes = Math.round(value * 24 * 60);
    const hh = Math.floor(minutes / 60) % 24;
    const mm = minutes % 60;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }

  const text = clean(value);
  if (!text) return null;
  const match = text.match(/(\d{1,2})[:.](\d{2})/);
  return match ? `${match[1].padStart(2, '0')}:${match[2]}` : null;
}

function parseExcelDurationMinutes(value: string | number | undefined): number | null {
  if (typeof value === 'number') {
    return Math.round(value * 24 * 60);
  }

  const time = parseExcelTime(value);
  if (!time) return null;
  const [hh, mm] = time.split(':').map(Number);
  return hh * 60 + mm;
}

function firstDefined(values: Array<string | null>): string | null {
  return values.find((value) => value !== null) ?? null;
}

function lastDefined(values: Array<string | null>): string | null {
  const reversed = [...values].reverse();
  return reversed.find((value) => value !== null) ?? null;
}

function clean(value: string | number | undefined): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalize(value: string): string {
  return clean(value)
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}\- ]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function loadXlsx() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('xlsx');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
