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
  matchType: string;
};

type XlsxModule = {
  readFile: (filePath: string, options?: Record<string, unknown>) => {
    SheetNames: string[];
    Sheets: Record<string, unknown>;
  };
  utils: {
    sheet_to_json: (
      sheet: unknown,
      options: { header: number; defval: string; raw?: boolean },
    ) => Array<Array<string | number>>;
  };
};

type ShoulderKey =
  | 'ASTANA_ESIL'
  | 'ASTANA_EKIBASTUZ'
  | 'ASTANA_KOKSHETAU'
  | 'ASTANA_KARAGANDA';

type BindingWorkbookRow = {
  sheetName: string;
  depot: string | null;
  day: number;
  weekday: string | null;
  arrivalTrainNumber: string | null;
  arrivalTime: string | null;
  departureTrainNumber: string | null;
  departureTime: string | null;
  dwellMinutes: number | null;
  shoulderKey: ShoulderKey | null;
};

type ParkLocomotive = {
  series: string;
  number: string;
  depot: string;
  location: string | null;
  to2NormMinutes: number | null;
  serviceNormMinutes: number | null;
  shoulderKey: ShoulderKey | null;
};

type NormLookup = {
  exact: Map<string, number>;
  byShoulder: Map<ShoulderKey, number>;
};

type RowStatus = 'ok' | 'warning' | 'critical' | 'missing';

export type GituralLocomotiveTableRow = {
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

const DAY = 24 * 60;
const SERVICE_START = 20 * 60;
const DEFAULT_CREW_NOTICE_MINUTES = 120;
const CURRENT_SERVICE_MONTH = 12;

const SHOULDER_LABELS: Record<ShoulderKey, string> = {
  ASTANA_ESIL: 'Астана–Есиль',
  ASTANA_EKIBASTUZ: 'Астана–Екибастуз',
  ASTANA_KOKSHETAU: 'Астана–Кокшетау',
  ASTANA_KARAGANDA: 'Астана–Караганда',
};

const ASTANA_MARKERS = ['астана-1', 'астана 1', 'нурлы жол', 'нур-султан i', 'нур-султан 1', 'сороковая'];

const SHEET_SHOULDER_HINTS: Array<{ shoulder: ShoulderKey; aliases: string[] }> = [
  { shoulder: 'ASTANA_EKIBASTUZ', aliases: ['павлодар', 'екибастуз', 'ерейментау', 'родники', 'аксу'] },
  { shoulder: 'ASTANA_KOKSHETAU', aliases: ['кокшетау', 'петропавловск', 'кызылту', 'пресногор', 'макинка', 'ак куль', 'ак-куль'] },
  { shoulder: 'ASTANA_ESIL', aliases: ['есиль', 'жана-есиль', 'тобол', 'костанай'] },
  { shoulder: 'ASTANA_KARAGANDA', aliases: ['караганда', 'караганд', 'алматы', 'арыс', 'шымкент', 'жарык', 'мойнты', 'ельтай', 'едыге'] },
];

function normalizeText(value: string | null | undefined) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}\- ]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeTrainNumber(value: string | number | null | undefined) {
  const match = String(value ?? '').match(/\d{1,4}/);
  return match ? match[0].padStart(3, '0') : null;
}

function normalizeLocoNumber(value: string | number | null | undefined) {
  const match = String(value ?? '').match(/\d{1,4}/);
  return match ? match[0].padStart(4, '0') : null;
}

function shoulderFromText(value: string | null | undefined): ShoulderKey | null {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  for (const item of SHEET_SHOULDER_HINTS) {
    if (item.aliases.some((alias) => normalized.includes(alias))) {
      return item.shoulder;
    }
  }
  return null;
}

function isAstanaMarker(value: string | null | undefined) {
  const normalized = normalizeText(value);
  return ASTANA_MARKERS.some((marker) => normalized.includes(marker));
}

function getWindowShoulders(window: NodeTrainWindow | null | undefined) {
  if (!window?.windowStops?.length) return [] as ShoulderKey[];

  const astanaIndex = window.windowStops.findIndex((stop) => isAstanaMarker(stop.station));
  if (astanaIndex < 0) {
    const shoulders = window.windowStops
      .map((stop) => shoulderFromText(stop.station))
      .filter((value): value is ShoulderKey => Boolean(value));
    return Array.from(new Set(shoulders));
  }

  const result: ShoulderKey[] = [];

  for (let index = astanaIndex - 1; index >= 0; index -= 1) {
    const shoulder = shoulderFromText(window.windowStops[index]?.station);
    if (shoulder) {
      result.push(shoulder);
      break;
    }
  }

  for (let index = astanaIndex + 1; index < window.windowStops.length; index += 1) {
    const shoulder = shoulderFromText(window.windowStops[index]?.station);
    if (shoulder) {
      result.push(shoulder);
      break;
    }
  }

  return Array.from(new Set(result));
}

function toServiceOffsetMinutes(time: string | null | undefined): number | null {
  const match = String(time ?? '').match(/(\d{1,2})[:.](\d{2})/);
  if (!match) return null;
  const hh = Number.parseInt(match[1], 10);
  const mm = Number.parseInt(match[2], 10);
  const absolute = hh * 60 + mm;
  return absolute >= SERVICE_START ? absolute - SERVICE_START : absolute + DAY - SERVICE_START;
}

function toServiceStamp(day: number, time: string | null | undefined): { label: string | null; sort: number | null } {
  const offset = toServiceOffsetMinutes(time);
  if (offset === null) return { label: null, sort: null };
  return {
    label: `${String(day).padStart(2, '0')}.${String(CURRENT_SERVICE_MONTH).padStart(2, '0')} ${minuteLabel(offset)}`,
    sort: day * DAY + offset,
  };
}

function fromServiceMinute(value: number | null): { label: string | null; sort: number | null } {
  if (typeof value !== 'number') return { label: null, sort: null };
  const day = Math.floor(value / DAY);
  const offset = value % DAY;
  return {
    label: `${String(day).padStart(2, '0')}.${String(CURRENT_SERVICE_MONTH).padStart(2, '0')} ${minuteLabel(offset)}`,
    sort: value,
  };
}

function minuteLabel(offsetMinutes: number) {
  const totalMinutes = (SERVICE_START + offsetMinutes) % DAY;
  const hh = Math.floor(totalMinutes / 60);
  const mm = totalMinutes % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function durationCellToMinutes(value: string | number | null | undefined): number | null {
  if (typeof value === 'number') {
    if (value === 0) return 0;
    return value > 1 ? Math.round(value * 60) : Math.round(value * DAY);
  }

  const match = String(value ?? '').match(/(\d{1,2})[:.](\d{2})/);
  if (!match) return null;
  return Number.parseInt(match[1], 10) * 60 + Number.parseInt(match[2], 10);
}

function parseTimeCell(value: string | number | null | undefined): string | null {
  if (typeof value === 'number') {
    const totalMinutes = Math.round((value % 1) * DAY);
    const hh = Math.floor(totalMinutes / 60);
    const mm = totalMinutes % 60;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }

  const match = String(value ?? '').match(/(\d{1,2})[:.](\d{2})/);
  return match ? `${match[1].padStart(2, '0')}:${match[2]}` : null;
}

function hashText(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round((sorted[middle - 1] + sorted[middle]) / 2);
  }
  return sorted[middle];
}

function buildPairKey(arrivalTrainNumber: string | null, departureTrainNumber: string | null) {
  if (arrivalTrainNumber && departureTrainNumber) {
    return `${arrivalTrainNumber}/${departureTrainNumber}`;
  }
  return arrivalTrainNumber ?? departureTrainNumber ?? '—';
}

function normExactKey(
  shoulderKey: ShoulderKey | null,
  arrivalTrainNumber: string | null,
  departureTrainNumber: string | null,
) {
  return [
    shoulderKey ?? 'UNKNOWN',
    arrivalTrainNumber ?? '—',
    departureTrainNumber ?? '—',
  ].join('|');
}

function parseBindingWorkbook(filePath: string, xlsx: XlsxModule): BindingWorkbookRow[] {
  const workbook = xlsx.readFile(filePath, { raw: false, cellDates: false });
  const rows: BindingWorkbookRow[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheetRows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], {
      header: 1,
      defval: '',
      raw: true,
    }) as Array<Array<string | number>>;

    const headerIndex = sheetRows.findIndex((row) =>
      normalizeText(String(row[0] ?? '')).includes('наименование операций'),
    );

    if (headerIndex < 0) continue;

    const headerRow = sheetRows[headerIndex] ?? [];
    const weekdayRow = sheetRows[headerIndex + 1] ?? [];
    const depot = String(headerRow[1] ?? '').trim() || null;
    const shoulderKey = shoulderFromText(sheetName);

    for (let rowIndex = headerIndex + 2; rowIndex < sheetRows.length; rowIndex += 5) {
      const arrivalTrainRow = sheetRows[rowIndex] ?? [];
      const arrivalTimeRow = sheetRows[rowIndex + 1] ?? [];
      const departureTrainRow = sheetRows[rowIndex + 2] ?? [];
      const departureTimeRow = sheetRows[rowIndex + 3] ?? [];
      const dwellRow = sheetRows[rowIndex + 4] ?? [];

      if (!normalizeText(String(arrivalTrainRow[0] ?? '')).includes('отцепка')) continue;

      for (let columnIndex = 2; columnIndex < Math.max(arrivalTrainRow.length, departureTrainRow.length); columnIndex += 1) {
        const dayRaw = headerRow[columnIndex];
        const day = typeof dayRaw === 'number'
          ? dayRaw
          : Number.parseInt(String(dayRaw ?? '').trim(), 10);
        if (!Number.isFinite(day)) continue;

        const arrivalTrainNumber = normalizeTrainNumber(arrivalTrainRow[columnIndex]);
        const departureTrainNumber = normalizeTrainNumber(departureTrainRow[columnIndex]);
        const arrivalTime = parseTimeCell(arrivalTimeRow[columnIndex]);
        const departureTime = parseTimeCell(departureTimeRow[columnIndex]);
        const dwellMinutes = durationCellToMinutes(dwellRow[columnIndex]);
        const weekday = String(weekdayRow[columnIndex] ?? '').trim() || null;

        if (!arrivalTrainNumber && !departureTrainNumber && !arrivalTime && !departureTime) {
          continue;
        }

        rows.push({
          sheetName,
          depot,
          day,
          weekday,
          arrivalTrainNumber,
          arrivalTime,
          departureTrainNumber,
          departureTime,
          dwellMinutes,
          shoulderKey,
        });
      }
    }
  }

  return rows;
}

export function parseParkWorkbook(filePath: string, xlsx: XlsxModule): ParkLocomotive[] {
  const workbook = xlsx.readFile(filePath, { raw: false, cellDates: false });
  const result: ParkLocomotive[] = [];
  const seen = new Set<string>();

  for (const sheetName of workbook.SheetNames) {
    const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], {
      header: 1,
      defval: '',
      raw: true,
    }) as Array<Array<string | number>>;

    const headerIndex = rows.findIndex((row) =>
      row.some((cell) => normalizeText(String(cell ?? '')).includes('заводской номер')),
    );

    if (headerIndex < 0) continue;

    for (let rowIndex = headerIndex + 1; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex] ?? [];
      const series = String(row[1] ?? '').trim();
      const number = normalizeLocoNumber(row[2]);
      const depot = String(row[3] ?? '').trim();
      const location = String(row[5] ?? '').trim() || null;

      if (!series || !number || !depot) continue;

      const key = `${series}|${number}|${depot}`;
      if (seen.has(key)) continue;
      seen.add(key);

      result.push({
        series,
        number,
        depot,
        location,
        to2NormMinutes: durationCellToMinutes(row[7]),
        serviceNormMinutes: durationCellToMinutes(row[9]) ?? durationCellToMinutes(row[7]),
        shoulderKey: shoulderFromText(location),
      });
    }
  }

  return result.sort((left, right) => left.number.localeCompare(right.number));
}

function buildNormLookup(rows: BindingWorkbookRow[]): NormLookup {
  const exactBuckets = new Map<string, number[]>();
  const shoulderBuckets = new Map<ShoulderKey, number[]>();

  for (const row of rows) {
    if (typeof row.dwellMinutes !== 'number') continue;

    const exactKey = normExactKey(row.shoulderKey, row.arrivalTrainNumber, row.departureTrainNumber);
    const exactValues = exactBuckets.get(exactKey) ?? [];
    exactValues.push(row.dwellMinutes);
    exactBuckets.set(exactKey, exactValues);

    if (row.shoulderKey) {
      const shoulderValues = shoulderBuckets.get(row.shoulderKey) ?? [];
      shoulderValues.push(row.dwellMinutes);
      shoulderBuckets.set(row.shoulderKey, shoulderValues);
    }
  }

  return {
    exact: new Map(
      Array.from(exactBuckets.entries())
        .map(([key, values]) => [key, median(values)])
        .filter((item): item is [string, number] => typeof item[1] === 'number'),
    ),
    byShoulder: new Map(
      Array.from(shoulderBuckets.entries())
        .map(([key, values]) => [key, median(values)])
        .filter((item): item is [ShoulderKey, number] => typeof item[1] === 'number'),
    ),
  };
}

function pickLocomotive(row: {
  id: string;
  shoulderKey: ShoulderKey | null;
}, park: ParkLocomotive[]): ParkLocomotive | null {
  if (!park.length) return null;

  const astanaPool = park.filter((item) => normalizeText(item.location).includes('астана'));
  const exactShoulderPool = row.shoulderKey
    ? park.filter((item) => item.shoulderKey === row.shoulderKey)
    : [];
  const tl11Pool = park.filter((item) => normalizeText(item.depot).includes('тл-11'));

  const exactTl11Pool = exactShoulderPool.filter((item) => normalizeText(item.depot).includes('тл-11'));
  const exactAstanaPool = exactShoulderPool.filter((item) => normalizeText(item.location).includes('астана'));
  const astanaTl11Pool = astanaPool.filter((item) => normalizeText(item.depot).includes('тл-11'));

  const pool = dedupeLocomotives(
    exactTl11Pool.length ? exactTl11Pool
      : exactAstanaPool.length ? exactAstanaPool
        : exactShoulderPool.length ? exactShoulderPool
          : astanaTl11Pool.length ? astanaTl11Pool
            : astanaPool.length ? astanaPool
              : tl11Pool.length ? tl11Pool
                : park,
  );

  if (!pool.length) return null;
  return pool[hashText(row.id) % pool.length];
}

function dedupeLocomotives(items: ParkLocomotive[]) {
  const result: ParkLocomotive[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    const key = `${item.series}|${item.number}|${item.depot}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }

  return result;
}

function resolveNormMinutes(
  shoulderKey: ShoulderKey | null,
  arrivalTrainNumber: string | null,
  departureTrainNumber: string | null,
  normLookup: NormLookup,
  matchedLocomotive: ParkLocomotive | null,
) {
  const exact = normLookup.exact.get(normExactKey(shoulderKey, arrivalTrainNumber, departureTrainNumber));
  if (typeof exact === 'number') {
    return { value: exact, source: 'ideal_exact' as const };
  }

  if (shoulderKey) {
    const byShoulder = normLookup.byShoulder.get(shoulderKey);
    if (typeof byShoulder === 'number') {
      return { value: byShoulder, source: 'ideal_shoulder_avg' as const };
    }
  }

  if (typeof matchedLocomotive?.serviceNormMinutes === 'number') {
    return { value: matchedLocomotive.serviceNormMinutes, source: 'park_service_fallback' as const };
  }

  return { value: null, source: 'unavailable' as const };
}

export function loadIdealNormLookup(filePath: string, xlsx: XlsxModule) {
  return buildNormLookup(parseBindingWorkbook(filePath, xlsx));
}

export function buildLocomotiveTableRows(args: {
  bindings: BindingEvent[];
  turnarounds: TurnaroundRecord[];
  windows: NodeTrainWindow[];
  idealNormLookup: NormLookup;
  parkLocomotives: ParkLocomotive[];
}): GituralLocomotiveTableRow[] {
  const windowByTrain = new Map(args.windows.map((item) => [normalizeTrainNumber(item.trainNumber), item]));
  const turnaroundByPair = new Map<string, TurnaroundRecord>();

  args.turnarounds.forEach((item) => {
    turnaroundByPair.set(
      buildBindingKey(item.day, item.stationSheet, item.arrivalTrainNumber, item.departureTrainNumber),
      item,
    );
  });

  const rows: GituralLocomotiveTableRow[] = args.bindings.map((binding): GituralLocomotiveTableRow => {
    const key = buildBindingKey(
      binding.day,
      binding.sheetName,
      binding.arrivalTrainNumber,
      binding.departureTrainNumber,
    );
    const turnaround = turnaroundByPair.get(key) ?? null;
    const arrivalWindow = binding.arrivalTrainNumber ? windowByTrain.get(binding.arrivalTrainNumber) ?? null : null;
    const departureWindow = binding.departureTrainNumber ? windowByTrain.get(binding.departureTrainNumber) ?? null : null;

    const plannedShoulderKey = shoulderFromText(binding.sheetName);
    const actualShoulderKeys = Array.from(
      new Set([
        ...getWindowShoulders(arrivalWindow),
        ...getWindowShoulders(departureWindow),
      ]),
    );

    const rowId = [
      binding.day,
      normalizeText(binding.sheetName),
      binding.arrivalTrainNumber ?? '—',
      binding.departureTrainNumber ?? '—',
    ].join('|');

    const matchedLocomotive = pickLocomotive({ id: rowId, shoulderKey: plannedShoulderKey }, args.parkLocomotives);
    const norm = resolveNormMinutes(
      plannedShoulderKey,
      binding.arrivalTrainNumber,
      binding.departureTrainNumber,
      args.idealNormLookup,
      matchedLocomotive,
    );

    const arrivalSource = turnaround?.arrivalAstanaTime ? 'fact' : binding.arrivalTime ? 'binding' : 'missing';
    const departureSource = turnaround?.departureAstanaTime ? 'fact' : binding.departureTime ? 'binding' : 'missing';
    const arrivalStamp = toServiceStamp(binding.day, turnaround?.arrivalAstanaTime ?? binding.arrivalTime);
    const departureStamp = toServiceStamp(binding.day, turnaround?.departureAstanaTime ?? binding.departureTime);
    const reportingMinute =
      typeof departureStamp.sort === 'number'
        ? departureStamp.sort - DEFAULT_CREW_NOTICE_MINUTES
        : null;
    const reportingStamp = fromServiceMinute(reportingMinute);

    const dwellMinutes = typeof binding.dwellMinutes === 'number'
      ? binding.dwellMinutes
      : typeof arrivalStamp.sort === 'number' && typeof departureStamp.sort === 'number'
        ? Math.max(departureStamp.sort - arrivalStamp.sort, 0)
        : null;

    const overDwellMinutes =
      typeof dwellMinutes === 'number' && typeof norm.value === 'number'
        ? Math.max(dwellMinutes - norm.value, 0)
        : null;

    const issues: string[] = [];
    const qualityFlags: string[] = [];

    if (!plannedShoulderKey) {
      issues.push('Плечо не удалось определить по подвязке.');
      qualityFlags.push('planned_shoulder_missing');
    }

    if (!matchedLocomotive) {
      issues.push('В парке не найден кандидат локомотива для строки.');
      qualityFlags.push('locomotive_unresolved');
    } else {
      qualityFlags.push('locomotive_inferred_from_park_pool');
    }

    if (!actualShoulderKeys.length) {
      issues.push('Не найдено фактическое плечо по нитке через узел.');
      qualityFlags.push('actual_shoulder_missing');
    } else if (plannedShoulderKey && !actualShoulderKeys.includes(plannedShoulderKey)) {
      issues.push('Фактическая нитка проходит вне планового плеча.');
      qualityFlags.push('out_of_shoulder');
    }

    if (norm.source !== 'ideal_exact') {
      qualityFlags.push(`norm_${norm.source}`);
    }
    if (norm.source === 'unavailable') {
      issues.push('Норма не найдена ни в идеальной модели, ни в парке.');
    }

    issues.push('Поле "Машинист" отсутствует в доступных источниках и оставлено пустым.');
    qualityFlags.push('driver_missing_in_sources');
    qualityFlags.push('driver_shoulder_missing_in_sources');

    let status: RowStatus = 'ok';
    let statusLabel = 'В норме';

    if (qualityFlags.includes('locomotive_unresolved') || qualityFlags.includes('out_of_shoulder')) {
      status = 'critical';
      statusLabel = 'Отклонение';
    } else if ((overDwellMinutes ?? 0) > 0 || norm.source !== 'ideal_exact') {
      status = 'warning';
      statusLabel = 'Требует внимания';
    } else if (arrivalSource === 'missing' || departureSource === 'missing') {
      status = 'missing';
      statusLabel = 'Неполные данные';
    }

    return {
      id: rowId,
      pairKey: buildPairKey(binding.arrivalTrainNumber, binding.departureTrainNumber),
      day: binding.day,
      weekday: binding.weekday,
      shoulder: plannedShoulderKey ? SHOULDER_LABELS[plannedShoulderKey] : null,
      shoulderKey: plannedShoulderKey,
      actualShoulders: actualShoulderKeys.map((item) => SHOULDER_LABELS[item]),
      locomotiveNumber: matchedLocomotive?.number ?? null,
      locomotiveSeries: matchedLocomotive?.series ?? null,
      locomotiveDepot: matchedLocomotive?.depot ?? binding.depot ?? null,
      locomotiveMatchSource: matchedLocomotive ? 'park_pool_match' : 'unresolved',
      arrival: arrivalStamp.label,
      arrivalSort: arrivalStamp.sort,
      arrivalSource,
      driver: null,
      driverSource: 'missing',
      driverShoulder: null,
      driverShoulderSource: 'missing',
      reporting: reportingStamp.label,
      reportingSort: reportingStamp.sort,
      reportingSource: reportingStamp.label ? 'derived_notice_120' : 'missing',
      departure: departureStamp.label,
      departureSort: departureStamp.sort,
      departureSource,
      dwellMinutes,
      normMinutes: norm.value,
      normSource: norm.source,
      overDwellMinutes,
      isTurner: Boolean(binding.arrivalTrainNumber && binding.departureTrainNumber),
      status,
      statusLabel,
      issues,
      qualityFlags,
      arrivalTrainNumber: binding.arrivalTrainNumber,
      departureTrainNumber: binding.departureTrainNumber,
      stationSheet: binding.sheetName,
    };
  });

  return rows.sort((left, right) => {
    const statusWeight = statusSortWeight(left.status) - statusSortWeight(right.status);
    if (statusWeight !== 0) return statusWeight;
    const overstayWeight = (right.overDwellMinutes ?? -1) - (left.overDwellMinutes ?? -1);
    if (overstayWeight !== 0) return overstayWeight;
    return (left.arrivalSort ?? Number.MAX_SAFE_INTEGER) - (right.arrivalSort ?? Number.MAX_SAFE_INTEGER);
  });
}

function statusSortWeight(status: RowStatus) {
  if (status === 'critical') return -3;
  if (status === 'warning') return -2;
  if (status === 'missing') return -1;
  return 0;
}

function buildBindingKey(
  day: number,
  sheetName: string,
  arrivalTrainNumber: string | null,
  departureTrainNumber: string | null,
) {
  return [
    String(day),
    normalizeText(sheetName),
    arrivalTrainNumber ?? '—',
    departureTrainNumber ?? '—',
  ].join('|');
}
