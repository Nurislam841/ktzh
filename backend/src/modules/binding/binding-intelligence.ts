import { GituralLocomotiveTableRow } from '../gitural/gitural-locomotive-table';

type ShoulderKey =
  | 'ASTANA_ESIL'
  | 'ASTANA_EKIBASTUZ'
  | 'ASTANA_KOKSHETAU'
  | 'ASTANA_KARAGANDA';

type TractionType = 'electric' | 'diesel' | 'unknown';
type RecommendationStatus = 'recommended' | 'acceptable' | 'undesirable' | 'forbidden';
type RecommendationBias = 'wait_for_fit' | 'dispatch_now' | 'manual_review';

type NodeTrainWindow = {
  trainNumber: string;
  routeName: string | null;
  sheetName: string;
  direction: 'forward' | 'backward';
  corridor: string | null;
  entersNodeAt: string | null;
  exitsNodeAt: string | null;
  astanaCoreStop: string | null;
  windowStops: Array<{
    station: string;
    stationCode: string | null;
    distanceKm: number | null;
    arrivalRaw: string | null;
    departureRaw: string | null;
    dwellMinutes: number | null;
    arrivalOffsetMinutes: number | null;
    departureOffsetMinutes: number | null;
  }>;
};

export type BindingRecommendationCandidate = {
  trainNumber: string;
  routeName: string | null;
  corridor: string | null;
  departureLabel: string | null;
  departureTime: string | null;
  departureDay: number | null;
  departureSort: number | null;
  waitMinutes: number | null;
  projectedDwellMinutes: number | null;
  projectedOverDwellMinutes: number | null;
  shoulderKey: ShoulderKey | null;
  shoulderLabel: string | null;
  score: number;
  status: RecommendationStatus;
  statusLabel: string;
  tractionCompatible: boolean;
  shoulderFit: 'ideal' | 'good' | 'weak' | 'bad';
  reasons: string[];
};

export type BindingIntelligenceRow = {
  id: string;
  stationName: string;
  pairKey: string;
  day: number;
  weekday: string | null;
  locomotiveNumber: string | null;
  locomotiveSeries: string | null;
  locomotiveDepot: string | null;
  tractionType: TractionType;
  shoulder: string | null;
  shoulderKey: ShoulderKey | null;
  actualShoulders: string[];
  arrival: string | null;
  arrivalDay: number | null;
  arrivalTime: string | null;
  arrivalSort: number | null;
  arrivalTrainNumber: string | null;
  currentIdleMinutes: number | null;
  dwellMinutes: number | null;
  normMinutes: number | null;
  overDwellMinutes: number | null;
  overDwellNowMinutes: number | null;
  waitToBestMinutes: number | null;
  canWaitMinutes: number | null;
  riskOfLeavingShoulder: 'low' | 'medium' | 'high';
  recommendationBias: RecommendationBias;
  recommendationBiasLabel: string;
  currentDepartureTrainNumber: string | null;
  currentDeparture: string | null;
  bestCandidate: BindingRecommendationCandidate | null;
  alternatives: BindingRecommendationCandidate[];
  plannedCandidate: BindingRecommendationCandidate | null;
  planAlignment: 'aligned' | 'acceptable' | 'risk' | 'missing';
  planAlignmentLabel: string;
  recommendationSummary: string;
  issues: string[];
  qualityFlags: string[];
  status: 'ok' | 'warning' | 'critical' | 'missing';
  statusLabel: string;
};

export type BindingIntelligencePayload = {
  generatedAt: string;
  selectedDay: number | null;
  serviceDayStart: string;
  cursorLabel: string;
  stats: {
    totalLocomotives: number;
    withRecommendation: number;
    critical: number;
    waitingForFit: number;
    outOfNorm: number;
  };
  rows: BindingIntelligenceRow[];
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

type ModelInfo = {
  series: string;
  tractionType?: string | null;
};

const DAY = 24 * 60;
const SERVICE_START = 20 * 60;

const SHOULDER_LABELS: Record<ShoulderKey, string> = {
  ASTANA_ESIL: 'Астана-Есиль',
  ASTANA_EKIBASTUZ: 'Астана-Экибастуз',
  ASTANA_KOKSHETAU: 'Астана-Кокшетау',
  ASTANA_KARAGANDA: 'Астана-Караганда',
};

const ASTANA_MARKERS = ['астана-1', 'астана 1', 'нурлы жол', 'нур-султан i', 'нур-султан 1', 'сороковая'];

const SHEET_SHOULDER_HINTS: Array<{ shoulder: ShoulderKey; aliases: string[] }> = [
  { shoulder: 'ASTANA_EKIBASTUZ', aliases: ['павлодар', 'экибастуз', 'ерейментау', 'родники', 'аксу'] },
  { shoulder: 'ASTANA_KOKSHETAU', aliases: ['кокшетау', 'петропавловск', 'кызылту', 'пресногорьк', 'макинка', 'ак куль', 'ак-куль'] },
  { shoulder: 'ASTANA_ESIL', aliases: ['есиль', 'жана-есиль', 'тобол', 'костанай'] },
  { shoulder: 'ASTANA_KARAGANDA', aliases: ['караганд', 'алматы', 'арыс', 'шымкент', 'жарык', 'мойнты', 'ельтай', 'едыге'] },
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

function toServiceOffsetMinutes(time: string | null | undefined): number | null {
  const match = String(time ?? '').match(/(\d{1,2})[:.](\d{2})/);
  if (!match) return null;
  const hh = Number.parseInt(match[1], 10);
  const mm = Number.parseInt(match[2], 10);
  const absolute = hh * 60 + mm;
  return absolute >= SERVICE_START ? absolute - SERVICE_START : absolute + DAY - SERVICE_START;
}

function minuteLabel(offsetMinutes: number) {
  const totalMinutes = (SERVICE_START + offsetMinutes) % DAY;
  const hh = Math.floor(totalMinutes / 60);
  const mm = totalMinutes % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function formatServiceStamp(sort: number | null) {
  if (typeof sort !== 'number') {
    return { label: null, day: null, time: null };
  }
  const day = Math.floor(sort / DAY);
  const offset = sort % DAY;
  const time = minuteLabel(offset);
  return {
    label: `${String(day).padStart(2, '0')}.12 ${time}`,
    day,
    time,
  };
}

function currentServiceSort(selectedDay: number | null) {
  if (selectedDay === null) return null;
  const now = new Date();
  const absolute = now.getHours() * 60 + now.getMinutes();
  const offset = absolute >= SERVICE_START ? absolute - SERVICE_START : absolute + DAY - SERVICE_START;
  return selectedDay * DAY + offset;
}

function detectTraction(series: string | null | undefined, modelsBySeries: Map<string, TractionType>) {
  const normalized = normalizeSeries(series);
  if (!normalized) return 'unknown' as const;

  const fromModel = modelsBySeries.get(normalized);
  if (fromModel) return fromModel;

  if (normalized.startsWith('kz4') || normalized.startsWith('kz8') || normalized.startsWith('вл') || normalized.startsWith('эп')) {
    return 'electric' as const;
  }

  if (normalized.startsWith('тэ') || normalized.startsWith('теп')) {
    return 'diesel' as const;
  }

  return 'unknown' as const;
}

function tractionLabel(tractionType: TractionType) {
  if (tractionType === 'electric') return 'Электровоз';
  if (tractionType === 'diesel') return 'Тепловоз';
  return 'Тяга не определена';
}

function candidateStatusLabel(status: RecommendationStatus) {
  if (status === 'recommended') return 'Рекомендовано';
  if (status === 'acceptable') return 'Допустимо';
  if (status === 'undesirable') return 'Нежелательно';
  return 'Не подходит';
}

function buildShoulderSeriesStats(parkLocomotives: ParkLocomotive[], modelsBySeries: Map<string, TractionType>) {
  const stats = new Map<ShoulderKey, { series: Set<string>; traction: Set<TractionType> }>();

  parkLocomotives.forEach((item) => {
    if (!item.shoulderKey) return;
    const current = stats.get(item.shoulderKey) ?? { series: new Set<string>(), traction: new Set<TractionType>() };
    current.series.add(normalizeSeries(item.series));
    current.traction.add(detectTraction(item.series, modelsBySeries));
    stats.set(item.shoulderKey, current);
  });

  return stats;
}

function extractDirectionalData(window: NodeTrainWindow | null | undefined) {
  if (!window?.windowStops?.length) {
    return {
      beforeAstanaShoulder: null as ShoulderKey | null,
      afterAstanaShoulder: null as ShoulderKey | null,
      astanaDepartureSort: null as number | null,
      astanaArrivalSort: null as number | null,
      astanaStation: window?.astanaCoreStop ?? null,
    };
  }

  const astanaIndex = window.windowStops.findIndex((stop) => isAstanaMarker(stop.station));
  if (astanaIndex < 0) {
    return {
      beforeAstanaShoulder: null as ShoulderKey | null,
      afterAstanaShoulder: null as ShoulderKey | null,
      astanaDepartureSort: null as number | null,
      astanaArrivalSort: null as number | null,
      astanaStation: window.astanaCoreStop ?? null,
    };
  }

  let beforeAstanaShoulder: ShoulderKey | null = null;
  let afterAstanaShoulder: ShoulderKey | null = null;

  for (let index = astanaIndex - 1; index >= 0; index -= 1) {
    beforeAstanaShoulder = shoulderFromText(window.windowStops[index]?.station);
    if (beforeAstanaShoulder) break;
  }

  for (let index = astanaIndex + 1; index < window.windowStops.length; index += 1) {
    afterAstanaShoulder = shoulderFromText(window.windowStops[index]?.station);
    if (afterAstanaShoulder) break;
  }

  const astanaStop = window.windowStops[astanaIndex];

  return {
    beforeAstanaShoulder,
    afterAstanaShoulder,
    astanaDepartureSort: typeof astanaStop?.departureOffsetMinutes === 'number' ? astanaStop.departureOffsetMinutes : null,
    astanaArrivalSort: typeof astanaStop?.arrivalOffsetMinutes === 'number' ? astanaStop.arrivalOffsetMinutes : null,
    astanaStation: astanaStop?.station ?? window.astanaCoreStop ?? null,
  };
}

function buildRecommendationSummary(args: {
  bestCandidate: BindingRecommendationCandidate | null;
  recommendationBias: RecommendationBias;
}) {
  if (!args.bestCandidate) {
    return 'Подходящий следующий поезд не найден в текущем срезе графика.';
  }

  if (args.recommendationBias === 'wait_for_fit') {
    return `Лучше дождаться поезда №${args.bestCandidate.trainNumber}: он лучше сохраняет плечо и оборот локомотива.`;
  }

  if (args.recommendationBias === 'dispatch_now') {
    return `Лучший кандидат сейчас — поезд №${args.bestCandidate.trainNumber}: ожидание уже близко к норме простоя.`;
  }

  return `Лучший кандидат — поезд №${args.bestCandidate.trainNumber}, но требуется ручная проверка диспетчера.`;
}

function scoreCandidate(args: {
  row: GituralLocomotiveTableRow;
    candidate: NodeTrainWindow;
    candidateShoulder: ShoulderKey | null;
    candidateDepartureSort: number;
  candidateDepartureDay: number;
  candidateDepartureTime: string | null;
  preferredShoulder: ShoulderKey | null;
  inboundShoulder: ShoulderKey | null;
  locoTraction: TractionType;
  shoulderStats: Map<ShoulderKey, { series: Set<string>; traction: Set<TractionType> }>;
  modelsBySeries: Map<string, TractionType>;
}): BindingRecommendationCandidate {
  const reasons: string[] = [];
  let score = 50;

  const waitMinutes =
    typeof args.row.arrivalSort === 'number'
      ? Math.max(args.candidateDepartureSort - args.row.arrivalSort, 0)
      : null;

  const projectedDwellMinutes = waitMinutes;
  const projectedOverDwellMinutes =
    typeof projectedDwellMinutes === 'number' && typeof args.row.normMinutes === 'number'
      ? Math.max(projectedDwellMinutes - args.row.normMinutes, 0)
      : null;

  const shoulderPool = args.candidateShoulder ? args.shoulderStats.get(args.candidateShoulder) ?? null : null;
  const normalizedSeries = normalizeSeries(args.row.locomotiveSeries);

  let tractionCompatible = true;
  if (args.locoTraction !== 'unknown' && shoulderPool?.traction.size) {
    tractionCompatible = shoulderPool.traction.has(args.locoTraction);
  }

  let shoulderFit: BindingRecommendationCandidate['shoulderFit'] = 'weak';
  if (args.candidateShoulder && args.preferredShoulder && args.candidateShoulder === args.preferredShoulder) {
    score += 32;
    shoulderFit = 'ideal';
    reasons.push('Сохраняет рабочее плечо обращения локомотива.');
  } else if (args.candidateShoulder && args.inboundShoulder && args.candidateShoulder === args.inboundShoulder) {
    score += 26;
    shoulderFit = 'good';
    reasons.push('Возвращает локомотив в логичное направление после прибытия.');
  } else if (args.candidateShoulder) {
    score -= 18;
    shoulderFit = 'bad';
    reasons.push('Уводит локомотив с предпочтительного плеча.');
  } else {
    score -= 8;
    reasons.push('Направление по плечу у кандидата определить не удалось.');
  }

  if (shoulderPool?.series.size && normalizedSeries) {
    if (shoulderPool.series.has(normalizedSeries)) {
      score += 28;
      reasons.push('Модель локомотива подтверждена на этом плече по реальному парку.');
    } else if (tractionCompatible) {
      score += 10;
      reasons.push('Тяга совпадает с типовыми машинами этого плеча.');
    } else {
      score -= 90;
      tractionCompatible = false;
      reasons.push('Тип тяги не соответствует фактическому плечу обращения.');
    }
  } else if (!tractionCompatible) {
    score -= 80;
    reasons.push('Тип тяги не совпадает с доступным плечом.');
  } else if (args.locoTraction !== 'unknown') {
    score += 8;
    reasons.push(`Подходит по типу тяги: ${tractionLabel(args.locoTraction).toLowerCase()}.`);
  }

  if (typeof waitMinutes === 'number') {
    if (waitMinutes <= 30) {
      score += 16;
      reasons.push('Можно подвязать почти сразу без лишнего ожидания.');
    } else if (waitMinutes <= 90) {
      score += 12;
      reasons.push('Ожидание до отправления остаётся операционно комфортным.');
    } else if (waitMinutes <= 180) {
      score += 6;
      reasons.push('Поезд не ближайший, но ожидание ещё допустимо.');
    } else if (waitMinutes <= 360) {
      score -= 6;
      reasons.push('Ожидание заметное, нужно проверить цену ожидания.');
    } else {
      score -= 18;
      reasons.push('До отправления слишком долго ждать.');
    }
  }

  if (typeof projectedOverDwellMinutes === 'number') {
    if (projectedOverDwellMinutes === 0) {
      score += 14;
      reasons.push('Не создаёт перепростой относительно нормы.');
    } else if (projectedOverDwellMinutes <= 60) {
      score -= 10;
      reasons.push('Даёт умеренный перепростой, но ещё допустим как компромисс.');
    } else {
      score -= 24;
      reasons.push('Ведёт к критичному перепростою.');
    }
  }

  if (args.row.departureTrainNumber && args.row.departureTrainNumber === args.candidate.trainNumber) {
    score += 10;
    reasons.push('Совпадает с текущей плановой подвязкой из рабочего набора.');
  }

  const normalizedCandidateRoute = normalizeText(args.candidate.routeName);
  if (args.inboundShoulder === 'ASTANA_EKIBASTUZ' && /павлодар|экибастуз|ерейментау/.test(normalizedCandidateRoute)) {
    score += 14;
    reasons.push('Маршрут ведёт обратно в павлодарско-экибастузское направление.');
  }

  if (args.inboundShoulder === 'ASTANA_KARAGANDA' && /караганд/.test(normalizedCandidateRoute)) {
    score += 12;
    reasons.push('Маршрут сохраняет карагандинский оборот.');
  }

  let status: RecommendationStatus = 'acceptable';
  if (!tractionCompatible || score < 15) {
    status = 'forbidden';
  } else if (score >= 95) {
    status = 'recommended';
  } else if (score >= 65) {
    status = 'acceptable';
  } else {
    status = 'undesirable';
  }

  return {
    trainNumber: args.candidate.trainNumber,
    routeName: args.candidate.routeName,
    corridor: args.candidate.corridor,
    departureLabel: formatServiceStamp(args.candidateDepartureSort).label,
    departureTime: args.candidateDepartureTime,
    departureDay: args.candidateDepartureDay,
    departureSort: args.candidateDepartureSort,
    waitMinutes,
    projectedDwellMinutes,
    projectedOverDwellMinutes,
    shoulderKey: args.candidateShoulder,
    shoulderLabel: args.candidateShoulder ? SHOULDER_LABELS[args.candidateShoulder] : null,
    score,
    status,
    statusLabel: candidateStatusLabel(status),
    tractionCompatible,
    shoulderFit,
    reasons,
  };
}

function planAlignmentLabel(value: BindingIntelligenceRow['planAlignment']) {
  if (value === 'aligned') return 'Совпадает с рекомендацией';
  if (value === 'acceptable') return 'План допустим';
  if (value === 'risk') return 'Есть риск';
  return 'План не выбран';
}

function recommendationBiasLabel(value: RecommendationBias) {
  if (value === 'wait_for_fit') return 'Лучше подождать более подходящий поезд';
  if (value === 'dispatch_now') return 'Рационально подвязать ближайший допустимый поезд';
  return 'Нужна ручная проверка диспетчера';
}

export function buildBindingIntelligence(args: {
  rows: GituralLocomotiveTableRow[];
  trains: NodeTrainWindow[];
  parkLocomotives: ParkLocomotive[];
  selectedDay: number | null;
  models: ModelInfo[];
}): BindingIntelligencePayload {
  const modelsBySeries = new Map<string, TractionType>(
    args.models.map((item) => {
      const normalized = normalizeSeries(item.series);
      const traction = normalizeText(item.tractionType).includes('эл')
        ? 'electric'
        : normalizeText(item.tractionType).includes('теп')
          ? 'diesel'
          : 'unknown';
      return [normalized, traction];
    }),
  );

  const shoulderStats = buildShoulderSeriesStats(args.parkLocomotives, modelsBySeries);
  const trainDirections = new Map(
    args.trains.map((train) => [train.trainNumber, extractDirectionalData(train)]),
  );
  const currentSort = currentServiceSort(args.selectedDay);

  const enrichedRows: BindingIntelligenceRow[] = args.rows.map((row) => {
    const arrivalDirection = row.arrivalTrainNumber ? trainDirections.get(row.arrivalTrainNumber) : null;
    const preferredShoulder = row.shoulderKey ?? arrivalDirection?.beforeAstanaShoulder ?? null;
    const inboundShoulder = arrivalDirection?.beforeAstanaShoulder ?? row.shoulderKey ?? null;
    const locoTraction = detectTraction(row.locomotiveSeries, modelsBySeries);

    const candidates = args.trains
      .map((candidate) => {
        const direction = extractDirectionalData(candidate);
        if (typeof direction.astanaDepartureSort !== 'number') return null;
        if (typeof row.arrivalSort !== 'number') return null;
        const anchoredDepartureSort = row.day * DAY + direction.astanaDepartureSort;
        if (anchoredDepartureSort < row.arrivalSort) return null;
        if (candidate.trainNumber === row.arrivalTrainNumber) return null;

        const departureStamp = formatServiceStamp(anchoredDepartureSort);
        return scoreCandidate({
          row,
          candidate,
          candidateShoulder: direction.afterAstanaShoulder,
          candidateDepartureSort: anchoredDepartureSort,
          candidateDepartureDay: departureStamp.day ?? row.day,
          candidateDepartureTime: departureStamp.time,
          preferredShoulder,
          inboundShoulder,
          locoTraction,
          shoulderStats,
          modelsBySeries,
        });
      })
      .filter((item): item is BindingRecommendationCandidate => Boolean(item))
      .sort((left, right) => right.score - left.score || (left.waitMinutes ?? Number.MAX_SAFE_INTEGER) - (right.waitMinutes ?? Number.MAX_SAFE_INTEGER));

    const recommendedPool = candidates.filter((item) => item.status !== 'forbidden');
    const bestCandidate = recommendedPool[0] ?? null;
    const alternatives = recommendedPool.slice(1, 4);
    const plannedCandidate = row.departureTrainNumber
      ? candidates.find((item) => item.trainNumber === row.departureTrainNumber) ?? null
      : null;

    const currentIdleMinutes =
      typeof row.arrivalSort === 'number' && typeof currentSort === 'number'
        ? Math.max(currentSort - row.arrivalSort, 0)
        : row.dwellMinutes;

    const overDwellNowMinutes =
      typeof currentIdleMinutes === 'number' && typeof row.normMinutes === 'number'
        ? Math.max(currentIdleMinutes - row.normMinutes, 0)
        : row.overDwellMinutes;

    let recommendationBias: RecommendationBias = 'manual_review';
    if (bestCandidate && (bestCandidate.waitMinutes ?? 0) > 45 && bestCandidate.shoulderFit !== 'bad') {
      recommendationBias = 'wait_for_fit';
    } else if (bestCandidate) {
      recommendationBias = 'dispatch_now';
    }

    let planAlignment: BindingIntelligenceRow['planAlignment'] = 'missing';
    if (bestCandidate && plannedCandidate?.trainNumber === bestCandidate.trainNumber) {
      planAlignment = 'aligned';
    } else if (plannedCandidate && bestCandidate && plannedCandidate.score >= bestCandidate.score - 12) {
      planAlignment = 'acceptable';
    } else if (plannedCandidate) {
      planAlignment = 'risk';
    }

    const stationStamp = formatServiceStamp(row.arrivalSort);

    return {
      id: row.id,
      stationName: 'Астана',
      pairKey: row.pairKey,
      day: row.day,
      weekday: row.weekday,
      locomotiveNumber: row.locomotiveNumber,
      locomotiveSeries: row.locomotiveSeries,
      locomotiveDepot: row.locomotiveDepot,
      tractionType: locoTraction,
      shoulder: row.shoulder,
      shoulderKey: row.shoulderKey,
      actualShoulders: row.actualShoulders,
      arrival: row.arrival,
      arrivalDay: stationStamp.day,
      arrivalTime: stationStamp.time,
      arrivalSort: row.arrivalSort,
      arrivalTrainNumber: row.arrivalTrainNumber,
      currentIdleMinutes,
      dwellMinutes: row.dwellMinutes,
      normMinutes: row.normMinutes,
      overDwellMinutes: row.overDwellMinutes,
      overDwellNowMinutes,
      waitToBestMinutes: bestCandidate?.waitMinutes ?? null,
      canWaitMinutes:
        typeof row.normMinutes === 'number' && typeof currentIdleMinutes === 'number'
          ? Math.max(row.normMinutes - currentIdleMinutes, 0)
          : null,
      riskOfLeavingShoulder:
        bestCandidate?.shoulderFit === 'bad'
          ? 'high'
          : bestCandidate?.shoulderFit === 'weak'
            ? 'medium'
            : 'low',
      recommendationBias,
      recommendationBiasLabel: recommendationBiasLabel(recommendationBias),
      currentDepartureTrainNumber: row.departureTrainNumber,
      currentDeparture: row.departure,
      bestCandidate,
      alternatives,
      plannedCandidate,
      planAlignment,
      planAlignmentLabel: planAlignmentLabel(planAlignment),
      recommendationSummary: buildRecommendationSummary({
        bestCandidate,
        recommendationBias,
      }),
      issues: row.issues,
      qualityFlags: row.qualityFlags,
      status: row.status,
      statusLabel: row.statusLabel,
    };
  });

  const stats = {
    totalLocomotives: enrichedRows.length,
    withRecommendation: enrichedRows.filter((item) => Boolean(item.bestCandidate)).length,
    critical: enrichedRows.filter((item) => item.status === 'critical' || (item.overDwellNowMinutes ?? 0) > 0).length,
    waitingForFit: enrichedRows.filter((item) => item.recommendationBias === 'wait_for_fit').length,
    outOfNorm: enrichedRows.filter((item) => (item.overDwellNowMinutes ?? 0) > 0).length,
  };

  return {
    generatedAt: new Date().toISOString(),
    selectedDay: args.selectedDay,
    serviceDayStart: '20:00',
    cursorLabel: currentSort === null ? 'Не задан день' : formatServiceStamp(currentSort).label ?? 'Срез недоступен',
    stats,
    rows: enrichedRows.sort((left, right) => {
      const severity = (right.overDwellNowMinutes ?? 0) - (left.overDwellNowMinutes ?? 0);
      if (severity !== 0) return severity;
      return (right.bestCandidate?.score ?? -1) - (left.bestCandidate?.score ?? -1);
    }),
  };
}
