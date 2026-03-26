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

type TurnReportRow = {
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
  matchType: 'paired' | 'arrival_only' | 'departure_only' | 'unmatched';
};

const DERIVED_DIR = path.resolve(process.cwd(), 'data', 'derived', 'astana-node');
const WINDOWS_PATH = path.join(DERIVED_DIR, 'astana-node-windows.json');
const BINDINGS_PATH = path.join(DERIVED_DIR, 'astana-loco-bindings.json');

async function main() {
  const nodeWindows = JSON.parse(await readFile(WINDOWS_PATH, 'utf8')) as NodeTrainWindow[];
  const bindingEvents = JSON.parse(await readFile(BINDINGS_PATH, 'utf8')) as BindingEvent[];

  const windowByTrain = new Map(nodeWindows.map((item) => [item.trainNumber, item]));

  const rows = bindingEvents
    .map((event) => buildRow(event, windowByTrain))
    .filter((row) => row.matchType !== 'unmatched')
    .sort((a, b) => {
      const dwellDiff = (b.dwellMinutes ?? -1) - (a.dwellMinutes ?? -1);
      if (dwellDiff !== 0) return dwellDiff;
      return a.stationSheet.localeCompare(b.stationSheet);
    });

  const summary = {
    generatedAt: new Date().toISOString(),
    totalBindings: bindingEvents.length,
    matchedBindings: rows.length,
    pairedBindings: rows.filter((row) => row.matchType === 'paired').length,
    arrivalOnlyBindings: rows.filter((row) => row.matchType === 'arrival_only').length,
    departureOnlyBindings: rows.filter((row) => row.matchType === 'departure_only').length,
    topStationsByMatches: summarizeByStation(rows).slice(0, 12),
    topLongestDwells: rows.slice(0, 20).map((row) => ({
      stationSheet: row.stationSheet,
      day: row.day,
      arrivalTrainNumber: row.arrivalTrainNumber,
      departureTrainNumber: row.departureTrainNumber,
      dwellMinutes: row.dwellMinutes,
      dwellHours: row.dwellHours,
    })),
  };

  await mkdir(DERIVED_DIR, { recursive: true });
  await writeFile(path.join(DERIVED_DIR, 'astana-turn-report.json'), JSON.stringify(rows, null, 2), 'utf8');
  await writeFile(path.join(DERIVED_DIR, 'astana-turn-report.csv'), toCsv(rows), 'utf8');
  await writeFile(path.join(DERIVED_DIR, 'astana-turn-summary.json'), JSON.stringify(summary, null, 2), 'utf8');

  console.log(JSON.stringify(summary, null, 2));
}

function buildRow(event: BindingEvent, windowByTrain: Map<string, NodeTrainWindow>): TurnReportRow {
  const arrivalWindow = event.arrivalTrainNumber ? windowByTrain.get(event.arrivalTrainNumber) ?? null : null;
  const departureWindow = event.departureTrainNumber ? windowByTrain.get(event.departureTrainNumber) ?? null : null;

  const matchType: TurnReportRow['matchType'] = arrivalWindow && departureWindow
    ? 'paired'
    : arrivalWindow
      ? 'arrival_only'
      : departureWindow
        ? 'departure_only'
        : 'unmatched';

  return {
    stationSheet: event.sheetName,
    day: event.day,
    weekday: event.weekday,
    depot: event.depot,
    arrivalTrainNumber: event.arrivalTrainNumber,
    arrivalRoute: arrivalWindow?.routeName ?? null,
    arrivalAstanaStop: arrivalWindow?.astanaCoreStop ?? null,
    arrivalAstanaTime: arrivalWindow?.entersNodeAt ?? arrivalWindow?.exitsNodeAt ?? null,
    arrivalBindingTime: event.arrivalTime,
    departureTrainNumber: event.departureTrainNumber,
    departureRoute: departureWindow?.routeName ?? null,
    departureAstanaStop: departureWindow?.astanaCoreStop ?? null,
    departureAstanaTime: departureWindow?.exitsNodeAt ?? departureWindow?.entersNodeAt ?? null,
    departureBindingTime: event.departureTime,
    dwellMinutes: event.dwellMinutes,
    dwellHours: event.dwellMinutes !== null ? round(event.dwellMinutes / 60) : null,
    matchType,
  };
}

function summarizeByStation(rows: TurnReportRow[]) {
  const map = new Map<string, { stationSheet: string; matches: number; paired: number; avgDwellMinutes: number; maxDwellMinutes: number }>();

  for (const row of rows) {
    const current = map.get(row.stationSheet) ?? {
      stationSheet: row.stationSheet,
      matches: 0,
      paired: 0,
      avgDwellMinutes: 0,
      maxDwellMinutes: 0,
    };

    current.matches += 1;
    if (row.matchType === 'paired') current.paired += 1;
    if (row.dwellMinutes !== null) {
      current.avgDwellMinutes += row.dwellMinutes;
      current.maxDwellMinutes = Math.max(current.maxDwellMinutes, row.dwellMinutes);
    }
    map.set(row.stationSheet, current);
  }

  return Array.from(map.values())
    .map((item) => ({
      ...item,
      avgDwellMinutes: item.matches > 0 ? Math.round(item.avgDwellMinutes / item.matches) : 0,
    }))
    .sort((a, b) => b.matches - a.matches);
}

function toCsv(rows: TurnReportRow[]): string {
  const headers: Array<keyof TurnReportRow> = [
    'stationSheet',
    'day',
    'weekday',
    'depot',
    'arrivalTrainNumber',
    'arrivalRoute',
    'arrivalAstanaStop',
    'arrivalAstanaTime',
    'arrivalBindingTime',
    'departureTrainNumber',
    'departureRoute',
    'departureAstanaStop',
    'departureAstanaTime',
    'departureBindingTime',
    'dwellMinutes',
    'dwellHours',
    'matchType',
  ];

  const lines = [
    headers.join(','),
    ...rows.map((row) =>
      headers
        .map((header) => escapeCsv(row[header]))
        .join(','),
    ),
  ];

  return `${lines.join('\n')}\n`;
}

function escapeCsv(value: string | number | null): string {
  const text = value === null ? '' : String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
