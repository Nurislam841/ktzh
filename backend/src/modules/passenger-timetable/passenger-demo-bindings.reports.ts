const DAY_MINUTES = 24 * 60;
const HOUR_MINUTES = 60;

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const TIME_FORMATTER = new Intl.DateTimeFormat('ru-RU', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const MONTH_FORMATTER = new Intl.DateTimeFormat('ru-RU', {
  month: 'long',
  year: 'numeric',
});

const WEEKDAY_FORMATTER = new Intl.DateTimeFormat('ru-RU', {
  weekday: 'short',
});

type DemoStop = {
  arrivalMinute: number | null;
  departureMinute: number | null;
};

type DemoTrain = {
  pairKey: string;
  pair: string;
  routeLabel: string;
  origin: string;
  destination: string;
  category: 'talgo' | 'standard' | 'private_standard' | 'international';
  periodicity: string;
  wagonCount: number;
  tractionType: 'electric' | 'diesel';
  tractionLabel: string;
  compositionCount: number;
  assignedLocomotiveId: string;
  assignedLocomotiveLabel: string;
  stops: DemoStop[];
};

type DemoLocomotive = {
  id: string;
  label: string;
  tractionType: 'electric' | 'diesel';
  station: string;
};

type RouteProfile = {
  departureMinuteOfDay: number;
  travelMinutes: number;
  returnTravelMinutes: number;
  turnaroundMinutes: number;
  originRecoveryMinutes: number;
  cycleMinutes: number;
};

type ScheduleEntry = {
  train: DemoTrain;
  profile: RouteProfile;
  dayIndex: number;
  date: Date;
  dateKey: string;
  scheduledDeparture: Date;
};

type ScenarioLocomotiveState = {
  id: string;
  label: string;
  station: string;
  tractionType: 'electric' | 'diesel';
  availableFrom: Date;
};

type ScenarioEvent = {
  pairKey: string;
  dateKey: string;
  scheduledDeparture: Date;
  actualDeparture: Date;
  arrivalOutbound: Date;
  returnDeparture: Date;
  returnArrival: Date;
  availableAgainAtOrigin: Date;
  locomotiveId: string;
  locomotiveLabel: string;
  waitMinutes: number;
};

type CombinedEvent = {
  train: DemoTrain;
  profile: RouteProfile;
  dayIndex: number;
  date: Date;
  dateKey: string;
  scheduledDeparture: Date;
  manual: ScenarioEvent;
  auto: ScenarioEvent;
  savedWaitMinutes: number;
};

type SimulationState =
  | 'prep'
  | 'waiting'
  | 'outbound'
  | 'turnaround'
  | 'return'
  | 'ready';

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}\- ]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function roundHours(value: number) {
  return Math.round(value * 10) / 10;
}

function formatHoursFromMinutes(minutes: number) {
  return `${roundHours(minutes / HOUR_MINUTES).toFixed(1)} ч`;
}

function moduloDay(value: number) {
  return ((value % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000);
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function dateKey(date: Date) {
  return [
    String(date.getFullYear()).padStart(4, '0'),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function formatDateTime(value: Date) {
  return DATE_TIME_FORMATTER.format(value);
}

function formatTime(value: Date) {
  return TIME_FORMATTER.format(value);
}

function formatRelativeTime(value: Date, referenceDay: Date) {
  const dayOffset = Math.round(
    (startOfDay(value).getTime() - startOfDay(referenceDay).getTime()) / (24 * 60 * 60 * 1000),
  );

  if (dayOffset > 0) {
    return `+${dayOffset}д ${formatTime(value)}`;
  }

  if (dayOffset < 0) {
    return `${dayOffset}д ${formatTime(value)}`;
  }

  return formatTime(value);
}

function formatWeekdayShort(value: Date) {
  return WEEKDAY_FORMATTER.format(value).replace('.', '');
}

function buildRouteProfile(train: DemoTrain, routeIndex: number): RouteProfile {
  const firstTimedStop =
    train.stops.find((stop) => typeof stop.departureMinute === 'number') ??
    train.stops.find((stop) => typeof stop.arrivalMinute === 'number') ??
    null;
  const lastTimedStop =
    [...train.stops]
      .reverse()
      .find((stop) => typeof stop.arrivalMinute === 'number' || typeof stop.departureMinute === 'number') ?? null;

  const firstMinute = firstTimedStop?.departureMinute ?? firstTimedStop?.arrivalMinute ?? null;
  const lastMinute = lastTimedStop?.arrivalMinute ?? lastTimedStop?.departureMinute ?? null;

  const fallbackDepartureMinute = 4 * HOUR_MINUTES + ((routeIndex * 41 + train.wagonCount * 3) % (12 * HOUR_MINUTES));
  const departureMinuteOfDay = moduloDay((typeof firstMinute === 'number' ? firstMinute : fallbackDepartureMinute) + (routeIndex % 5) * 7);

  const rawTravelMinutes =
    typeof firstMinute === 'number' && typeof lastMinute === 'number' ? lastMinute - firstMinute : 0;
  const heuristicTravelMinutes =
    9 * HOUR_MINUTES +
    train.compositionCount * 55 +
    train.wagonCount * 4 +
    (train.category === 'international' ? 4 * HOUR_MINUTES : 0) +
    (routeIndex % 4) * 35;
  const travelMinutes = Math.min(Math.max(rawTravelMinutes, heuristicTravelMinutes, 6 * HOUR_MINUTES), 40 * HOUR_MINUTES);

  const turnaroundBase =
    train.category === 'talgo'
      ? 90
      : train.category === 'international'
        ? 140
        : train.category === 'private_standard'
          ? 110
          : 120;
  const turnaroundMinutes =
    turnaroundBase +
    Math.min(Math.round(travelMinutes * 0.04), 120) +
    Math.max(train.compositionCount - 1, 0) * 8;
  const returnTravelMinutes =
    travelMinutes + (train.category === 'international' ? 45 : 25) + (routeIndex % 4) * 6;
  const originRecoveryMinutes =
    25 +
    (train.tractionType === 'electric' ? 10 : 20) +
    Math.max(train.compositionCount - 1, 0) * 6;

  return {
    departureMinuteOfDay,
    travelMinutes,
    returnTravelMinutes,
    turnaroundMinutes,
    originRecoveryMinutes,
    cycleMinutes: travelMinutes + turnaroundMinutes + returnTravelMinutes + originRecoveryMinutes,
  };
}

function buildActiveDayIndexes(periodicity: string, routeIndex: number, monthStartDate: Date, daysInMonth: number) {
  const normalized = normalizeText(periodicity);

  if (normalized.includes('ежеднев')) {
    return Array.from({ length: daysInMonth }, (_, index) => index);
  }

  if (normalized.includes('через день')) {
    const offset = routeIndex % 2;
    return Array.from({ length: daysInMonth }, (_, index) => index).filter((index) => index % 2 === offset);
  }

  if (normalized.includes('2') && normalized.includes('нед')) {
    const primaryWeekday = routeIndex % 7;
    const secondaryWeekday = (primaryWeekday + 3) % 7;

    return Array.from({ length: daysInMonth }, (_, index) => index).filter((index) => {
      const weekday = new Date(
        monthStartDate.getFullYear(),
        monthStartDate.getMonth(),
        index + 1,
      ).getDay();
      return weekday === primaryWeekday || weekday === secondaryWeekday;
    });
  }

  if (normalized.includes('1') && normalized.includes('нед')) {
    const targetWeekday = (routeIndex + 2) % 7;
    return Array.from({ length: daysInMonth }, (_, index) => index).filter((index) => {
      const weekday = new Date(
        monthStartDate.getFullYear(),
        monthStartDate.getMonth(),
        index + 1,
      ).getDay();
      return weekday === targetWeekday;
    });
  }

  return Array.from({ length: daysInMonth }, (_, index) => index);
}

function buildScheduleEntries(trains: DemoTrain[], now: Date) {
  const monthStartDate = startOfMonth(now);
  const monthEndDate = endOfMonth(now);
  const daysInMonth = monthEndDate.getDate();

  const entries: ScheduleEntry[] = [];

  trains.forEach((train, routeIndex) => {
    const profile = buildRouteProfile(train, routeIndex);
    const activeDays = buildActiveDayIndexes(train.periodicity, routeIndex, monthStartDate, daysInMonth);

    activeDays.forEach((dayIndex) => {
      const dayDate = new Date(now.getFullYear(), now.getMonth(), dayIndex + 1);
      entries.push({
        train,
        profile,
        dayIndex,
        date: dayDate,
        dateKey: dateKey(dayDate),
        scheduledDeparture: addMinutes(startOfDay(dayDate), profile.departureMinuteOfDay),
      });
    });
  });

  entries.sort((left, right) => left.scheduledDeparture.getTime() - right.scheduledDeparture.getTime());

  return {
    monthStartDate,
    monthEndDate,
    daysInMonth,
    entries,
  };
}

function simulateManualScenario(entries: ScheduleEntry[], monthStartDate: Date) {
  const states = new Map<string, ScenarioLocomotiveState>();
  const events = new Map<string, ScenarioEvent>();

  entries.forEach((entry) => {
    const state =
      states.get(entry.train.pairKey) ??
      {
        id: entry.train.assignedLocomotiveId,
        label: entry.train.assignedLocomotiveLabel,
        station: entry.train.origin,
        tractionType: entry.train.tractionType,
        availableFrom: monthStartDate,
      };

    const actualDeparture = new Date(
      Math.max(entry.scheduledDeparture.getTime(), state.availableFrom.getTime()),
    );
    const arrivalOutbound = addMinutes(actualDeparture, entry.profile.travelMinutes);
    const returnDeparture = addMinutes(arrivalOutbound, entry.profile.turnaroundMinutes);
    const returnArrival = addMinutes(returnDeparture, entry.profile.returnTravelMinutes);
    const availableAgainAtOrigin = addMinutes(returnArrival, entry.profile.originRecoveryMinutes);

    state.availableFrom = availableAgainAtOrigin;
    states.set(entry.train.pairKey, state);

    events.set(`${entry.train.pairKey}:${entry.dateKey}`, {
      pairKey: entry.train.pairKey,
      dateKey: entry.dateKey,
      scheduledDeparture: entry.scheduledDeparture,
      actualDeparture,
      arrivalOutbound,
      returnDeparture,
      returnArrival,
      availableAgainAtOrigin,
      locomotiveId: state.id,
      locomotiveLabel: state.label,
      waitMinutes: Math.max(
        Math.round((actualDeparture.getTime() - entry.scheduledDeparture.getTime()) / 60_000),
        0,
      ),
    });
  });

  return events;
}

function buildPoolKey(tractionType: 'electric' | 'diesel', station: string) {
  return `${tractionType}:${normalizeText(station)}`;
}

function buildOptimizedPool(trains: DemoTrain[], locomotives: DemoLocomotive[], monthStartDate: Date) {
  const pools = new Map<string, ScenarioLocomotiveState[]>();
  const globalByTraction = new Map<'electric' | 'diesel', ScenarioLocomotiveState[]>();

  locomotives.forEach((locomotive) => {
    const state: ScenarioLocomotiveState = {
      id: locomotive.id,
      label: locomotive.label,
      station: locomotive.station,
      tractionType: locomotive.tractionType,
      availableFrom: monthStartDate,
    };
    const poolKey = buildPoolKey(locomotive.tractionType, locomotive.station);
    const stationPool = pools.get(poolKey) ?? [];
    stationPool.push(state);
    pools.set(poolKey, stationPool);

    const tractionPool = globalByTraction.get(locomotive.tractionType) ?? [];
    tractionPool.push(state);
    globalByTraction.set(locomotive.tractionType, tractionPool);
  });

  trains.forEach((train) => {
    const key = buildPoolKey(train.tractionType, train.origin);
    if (!pools.has(key)) {
      const fallbackState: ScenarioLocomotiveState = {
        id: `fallback:${train.pairKey}`,
        label: train.assignedLocomotiveLabel,
        station: train.origin,
        tractionType: train.tractionType,
        availableFrom: monthStartDate,
      };
      pools.set(key, [fallbackState]);
      const tractionPool = globalByTraction.get(train.tractionType) ?? [];
      tractionPool.push(fallbackState);
      globalByTraction.set(train.tractionType, tractionPool);
    }
  });

  return {
    pools,
    globalByTraction,
  };
}

function pickBestAvailableLocomotive(
  pools: Map<string, ScenarioLocomotiveState[]>,
  globalByTraction: Map<'electric' | 'diesel', ScenarioLocomotiveState[]>,
  tractionType: 'electric' | 'diesel',
  station: string,
) {
  const stationPool = pools.get(buildPoolKey(tractionType, station)) ?? [];
  const availablePool = stationPool.length ? stationPool : globalByTraction.get(tractionType) ?? [];

  return [...availablePool].sort((left, right) => {
    const availabilityDelta = left.availableFrom.getTime() - right.availableFrom.getTime();
    if (availabilityDelta !== 0) return availabilityDelta;
    return left.label.localeCompare(right.label, 'ru');
  })[0];
}

function simulateOptimizedScenario(
  entries: ScheduleEntry[],
  trains: DemoTrain[],
  locomotives: DemoLocomotive[],
  monthStartDate: Date,
) {
  const { pools, globalByTraction } = buildOptimizedPool(trains, locomotives, monthStartDate);
  const events = new Map<string, ScenarioEvent>();

  entries.forEach((entry) => {
    const state = pickBestAvailableLocomotive(
      pools,
      globalByTraction,
      entry.train.tractionType,
      entry.train.origin,
    );

    const actualDeparture = new Date(
      Math.max(entry.scheduledDeparture.getTime(), state.availableFrom.getTime()),
    );
    const arrivalOutbound = addMinutes(actualDeparture, entry.profile.travelMinutes);
    const returnDeparture = addMinutes(arrivalOutbound, entry.profile.turnaroundMinutes);
    const returnArrival = addMinutes(returnDeparture, entry.profile.returnTravelMinutes);
    const availableAgainAtOrigin = addMinutes(returnArrival, entry.profile.originRecoveryMinutes);

    state.availableFrom = availableAgainAtOrigin;

    events.set(`${entry.train.pairKey}:${entry.dateKey}`, {
      pairKey: entry.train.pairKey,
      dateKey: entry.dateKey,
      scheduledDeparture: entry.scheduledDeparture,
      actualDeparture,
      arrivalOutbound,
      returnDeparture,
      returnArrival,
      availableAgainAtOrigin,
      locomotiveId: state.id,
      locomotiveLabel: state.label,
      waitMinutes: Math.max(
        Math.round((actualDeparture.getTime() - entry.scheduledDeparture.getTime()) / 60_000),
        0,
      ),
    });
  });

  return events;
}

function buildCombinedEvents(
  entries: ScheduleEntry[],
  manualEvents: Map<string, ScenarioEvent>,
  autoEvents: Map<string, ScenarioEvent>,
) {
  const byRoute = new Map<string, CombinedEvent[]>();

  entries.forEach((entry) => {
    const key = `${entry.train.pairKey}:${entry.dateKey}`;
    const manual = manualEvents.get(key);
    const auto = autoEvents.get(key);

    if (!manual || !auto) return;

    const combined: CombinedEvent = {
      train: entry.train,
      profile: entry.profile,
      dayIndex: entry.dayIndex,
      date: entry.date,
      dateKey: entry.dateKey,
      scheduledDeparture: entry.scheduledDeparture,
      manual,
      auto,
      savedWaitMinutes: Math.max(manual.waitMinutes - auto.waitMinutes, 0),
    };

    const bucket = byRoute.get(entry.train.pairKey) ?? [];
    bucket.push(combined);
    byRoute.set(entry.train.pairKey, bucket);
  });

  byRoute.forEach((events) => {
    events.sort((left, right) => left.scheduledDeparture.getTime() - right.scheduledDeparture.getTime());
  });

  return byRoute;
}

function deriveStateForEvent(event: CombinedEvent, nextEvent: CombinedEvent | null, now: Date) {
  let stateKey: SimulationState = 'ready';
  let stateLabel = 'Готов на станции';
  let currentLocation = event.train.origin;
  let nextEventLabel = nextEvent ? 'Следующий рейс' : 'Цикл закрыт';
  let nextEventTime = nextEvent ? formatDateTime(nextEvent.scheduledDeparture) : '—';

  if (now < event.scheduledDeparture) {
    stateKey = 'prep';
    stateLabel = 'Окно впереди';
    currentLocation = event.train.origin;
    nextEventLabel = 'Плановое отправление';
    nextEventTime = formatDateTime(event.scheduledDeparture);
  } else if (now < event.auto.actualDeparture) {
    stateKey = 'waiting';
    stateLabel = 'Ждет свободную тягу';
    currentLocation = event.train.origin;
    nextEventLabel = 'Авто-подвязка и отправление';
    nextEventTime = formatDateTime(event.auto.actualDeparture);
  } else if (now < event.auto.arrivalOutbound) {
    stateKey = 'outbound';
    stateLabel = 'Идет туда';
    currentLocation = `${event.train.origin} → ${event.train.destination}`;
    nextEventLabel = 'Прибытие';
    nextEventTime = formatDateTime(event.auto.arrivalOutbound);
  } else if (now < event.auto.returnDeparture) {
    stateKey = 'turnaround';
    stateLabel = 'На обороте';
    currentLocation = event.train.destination;
    nextEventLabel = 'Обратное отправление';
    nextEventTime = formatDateTime(event.auto.returnDeparture);
  } else if (now < event.auto.returnArrival) {
    stateKey = 'return';
    stateLabel = 'Идет обратно';
    currentLocation = `${event.train.destination} → ${event.train.origin}`;
    nextEventLabel = 'Возврат на базу';
    nextEventTime = formatDateTime(event.auto.returnArrival);
  } else if (nextEvent) {
    stateKey = 'ready';
    stateLabel = 'Готов на станции';
    currentLocation = event.train.origin;
    nextEventLabel = 'Следующий рейс';
    nextEventTime = formatDateTime(nextEvent.scheduledDeparture);
  }

  return {
    stateKey,
    stateLabel,
    currentLocation,
    nextEventLabel,
    nextEventTime,
  };
}

function buildLiveSnapshot(
  trains: DemoTrain[],
  byRoute: Map<string, CombinedEvent[]>,
  now: Date,
  totalLocomotives: number,
) {
  const todayKey = dateKey(now);
  const rows = trains.map((train) => {
    const routeEvents = byRoute.get(train.pairKey) ?? [];
    const currentIndex = routeEvents.findIndex(
      (event) =>
        now >= event.scheduledDeparture &&
        now < event.auto.availableAgainAtOrigin,
    );
    const relevantIndex =
      currentIndex >= 0
        ? currentIndex
        : Math.max(
            routeEvents.findIndex((event) => event.dateKey === todayKey),
            routeEvents.findIndex((event) => event.scheduledDeparture > now),
          );
    const fallbackIndex = relevantIndex >= 0 ? relevantIndex : Math.max(routeEvents.length - 1, 0);
    const event = routeEvents[fallbackIndex] ?? null;
    const nextEvent = routeEvents[fallbackIndex + 1] ?? null;

    if (!event) {
      return {
        pairKey: train.pairKey,
        pair: train.pair,
        routeLabel: train.routeLabel,
        locomotiveLabel: train.assignedLocomotiveLabel,
        stateKey: 'ready',
        stateLabel: 'Нет данных',
        currentLocation: train.origin,
        nextEventLabel: '—',
        nextEventTime: '—',
        manualIdleLabel: '—',
        optimizedIdleLabel: '—',
        savedIdleLabel: '—',
        idleLabel: '—',
      };
    }

    const liveState = deriveStateForEvent(event, nextEvent, now);

    return {
      pairKey: train.pairKey,
      pair: train.pair,
      routeLabel: train.routeLabel,
      locomotiveLabel: event.auto.locomotiveLabel,
      stateKey: liveState.stateKey,
      stateLabel: liveState.stateLabel,
      currentLocation: liveState.currentLocation,
      nextEventLabel: liveState.nextEventLabel,
      nextEventTime: liveState.nextEventTime,
      manualIdleLabel: formatHoursFromMinutes(event.manual.waitMinutes),
      optimizedIdleLabel: formatHoursFromMinutes(event.auto.waitMinutes),
      savedIdleLabel: formatHoursFromMinutes(event.savedWaitMinutes),
      idleLabel: `ручн. ${formatHoursFromMinutes(event.manual.waitMinutes)} · авто ${formatHoursFromMinutes(event.auto.waitMinutes)}`,
    };
  });

  const busyLocoLabels = new Set(
    rows
      .filter((row) => ['outbound', 'turnaround', 'return'].includes(row.stateKey))
      .map((row) => row.locomotiveLabel),
  );
  const todayRows = rows.filter((row) => row.nextEventTime !== '—');

  return {
    simulatedNowLabel: formatDateTime(now),
    summary: {
      trainsInMotion: rows.filter((row) => row.stateKey === 'outbound' || row.stateKey === 'return').length,
      trainsOnTurnaround: rows.filter((row) => row.stateKey === 'turnaround').length,
      trainsPreparing: rows.filter((row) => row.stateKey === 'prep' || row.stateKey === 'waiting').length,
      assignedLocomotivesBusy: busyLocoLabels.size,
      reserveLocomotives: Math.max(totalLocomotives - busyLocoLabels.size, 0),
      wagonsWaitingForLoco: rows.filter((row) => row.stateKey === 'waiting').length,
      routesInWindow: todayRows.length,
    },
    rows,
  };
}

function buildDailyReport(trains: DemoTrain[], byRoute: Map<string, CombinedEvent[]>, now: Date) {
  const today = startOfDay(now);
  const todayKey = dateKey(today);
  const allEvents = Array.from(byRoute.values()).flat();
  const arrivalsToday = allEvents.filter(
    (event) =>
      dateKey(event.auto.arrivalOutbound) === todayKey || dateKey(event.auto.returnArrival) === todayKey,
  ).length;

  const rows = trains.map((train) => {
    const routeEvents = byRoute.get(train.pairKey) ?? [];
    const todayEvent = routeEvents.find((event) => event.dateKey === todayKey) ?? null;
    const nextEvent = routeEvents.find((event) => event.scheduledDeparture > now) ?? null;

    if (!todayEvent) {
      return {
        pairKey: train.pairKey,
        pair: train.pair,
        routeLabel: train.routeLabel,
        locomotiveLabel: train.assignedLocomotiveLabel,
        scheduledToday: false,
        scheduledLabel: 'Нет рейса',
        statusNow: 'Окно не запланировано',
        plannedDepartureLabel: '—',
        baselineDepartureLabel: '—',
        autoDepartureLabel: '—',
        returnArrivalLabel: '—',
        turnaroundLabel: '—',
        baselineIdleHours: 0,
        optimizedIdleHours: 0,
        savedIdleHours: 0,
        baselineIdleLabel: '—',
        optimizedIdleLabel: '—',
        savedIdleLabel: '—',
        nextRunLabel: nextEvent ? formatDateTime(nextEvent.scheduledDeparture) : '—',
      };
    }

    const liveState = deriveStateForEvent(todayEvent, nextEvent, now);

    return {
      pairKey: train.pairKey,
      pair: train.pair,
      routeLabel: train.routeLabel,
      locomotiveLabel: todayEvent.auto.locomotiveLabel,
      scheduledToday: true,
      scheduledLabel: 'В графике',
      statusNow: liveState.stateLabel,
      plannedDepartureLabel: formatRelativeTime(todayEvent.scheduledDeparture, todayEvent.date),
      baselineDepartureLabel: formatRelativeTime(todayEvent.manual.actualDeparture, todayEvent.date),
      autoDepartureLabel: formatRelativeTime(todayEvent.auto.actualDeparture, todayEvent.date),
      returnArrivalLabel: formatRelativeTime(todayEvent.auto.returnArrival, todayEvent.date),
      turnaroundLabel: formatHoursFromMinutes(todayEvent.profile.turnaroundMinutes),
      baselineIdleHours: roundHours(todayEvent.manual.waitMinutes / HOUR_MINUTES),
      optimizedIdleHours: roundHours(todayEvent.auto.waitMinutes / HOUR_MINUTES),
      savedIdleHours: roundHours(todayEvent.savedWaitMinutes / HOUR_MINUTES),
      baselineIdleLabel: formatHoursFromMinutes(todayEvent.manual.waitMinutes),
      optimizedIdleLabel: formatHoursFromMinutes(todayEvent.auto.waitMinutes),
      savedIdleLabel: formatHoursFromMinutes(todayEvent.savedWaitMinutes),
      nextRunLabel: nextEvent ? formatDateTime(nextEvent.scheduledDeparture) : '—',
      departureLabel: formatRelativeTime(todayEvent.auto.actualDeparture, todayEvent.date),
      arrivalLabel: formatRelativeTime(todayEvent.auto.arrivalOutbound, todayEvent.date),
      returnDepartureLabel: formatRelativeTime(todayEvent.auto.returnDeparture, todayEvent.date),
      returnArrivalExtendedLabel: formatRelativeTime(todayEvent.auto.returnArrival, todayEvent.date),
      idleToNextCycleLabel: formatHoursFromMinutes(todayEvent.auto.waitMinutes),
    };
  });

  const scheduledRows = rows.filter((row) => row.scheduledToday);
  const averageTurnaroundHours = scheduledRows.length
    ? roundHours(
        scheduledRows.reduce((sum, row) => sum + Number(row.turnaroundLabel.replace(/[^\d.]/g, '')), 0) /
          scheduledRows.length,
      )
    : 0;
  const baselineAverageIdleHours = scheduledRows.length
    ? roundHours(scheduledRows.reduce((sum, row) => sum + row.baselineIdleHours, 0) / scheduledRows.length)
    : 0;
  const optimizedAverageIdleHours = scheduledRows.length
    ? roundHours(scheduledRows.reduce((sum, row) => sum + row.optimizedIdleHours, 0) / scheduledRows.length)
    : 0;
  const savedIdleHours = roundHours(
    scheduledRows.reduce((sum, row) => sum + row.savedIdleHours, 0),
  );

  return {
    dateLabel: formatDateTime(now),
    summary: {
      trainsScheduled: scheduledRows.length,
      departuresToday: scheduledRows.length,
      arrivalsToday,
      averageTurnaroundHours,
      baselineAverageIdleHours,
      optimizedAverageIdleHours,
      averageIdleHours: optimizedAverageIdleHours,
      savedIdleHours,
      maxOptimizedIdleHours: scheduledRows.length
        ? Math.max(...scheduledRows.map((row) => row.optimizedIdleHours))
        : 0,
    },
    rows,
  };
}

function buildMonthlyReport(
  trains: DemoTrain[],
  byRoute: Map<string, CombinedEvent[]>,
  monthStartDate: Date,
  daysInMonth: number,
  now: Date,
) {
  const days = Array.from({ length: daysInMonth }, (_, index) => {
    const value = new Date(monthStartDate.getFullYear(), monthStartDate.getMonth(), index + 1);
    return {
      dateKey: dateKey(value),
      dayNumber: index + 1,
      weekdayShort: formatWeekdayShort(value),
      isToday: dateKey(value) === dateKey(now),
    };
  });

  const rows = trains.map((train) => {
    const routeEvents = byRoute.get(train.pairKey) ?? [];
    const uniqueLocomotives = Array.from(new Set(routeEvents.map((event) => event.auto.locomotiveLabel)));
    const cells = days.map((day) => {
      const event = routeEvents.find((item) => item.dateKey === day.dateKey) ?? null;
      if (!event) {
        return {
          dateKey: day.dateKey,
          isActive: false,
          plannedDepartureLabel: '—',
          autoDepartureLabel: '—',
          baselineIdleLabel: '—',
          optimizedIdleLabel: '—',
          savedIdleLabel: '—',
        };
      }

      return {
        dateKey: day.dateKey,
        isActive: true,
        plannedDepartureLabel: formatRelativeTime(event.scheduledDeparture, event.date),
        autoDepartureLabel: formatRelativeTime(event.auto.actualDeparture, event.date),
        baselineIdleLabel: formatHoursFromMinutes(event.manual.waitMinutes),
        optimizedIdleLabel: formatHoursFromMinutes(event.auto.waitMinutes),
        savedIdleLabel: formatHoursFromMinutes(event.savedWaitMinutes),
      };
    });

    const activeEvents = routeEvents.length;
    const averageBaselineIdleHours = activeEvents
      ? roundHours(routeEvents.reduce((sum, event) => sum + event.manual.waitMinutes, 0) / activeEvents / HOUR_MINUTES)
      : 0;
    const averageOptimizedIdleHours = activeEvents
      ? roundHours(routeEvents.reduce((sum, event) => sum + event.auto.waitMinutes, 0) / activeEvents / HOUR_MINUTES)
      : 0;
    const savedIdleHours = roundHours(
      routeEvents.reduce((sum, event) => sum + event.savedWaitMinutes, 0) / HOUR_MINUTES,
    );
    const averageTurnaroundHours = activeEvents
      ? roundHours(routeEvents.reduce((sum, event) => sum + event.profile.turnaroundMinutes, 0) / activeEvents / HOUR_MINUTES)
      : 0;

    return {
      pairKey: train.pairKey,
      pair: train.pair,
      routeLabel: train.routeLabel,
      periodicity: train.periodicity,
      locomotiveLabel:
        uniqueLocomotives.length <= 1
          ? uniqueLocomotives[0] ?? train.assignedLocomotiveLabel
          : `${uniqueLocomotives[0]} +${uniqueLocomotives.length - 1}`,
      averageBaselineIdleHours,
      averageOptimizedIdleHours,
      averageIdleHours: averageOptimizedIdleHours,
      averageTurnaroundHours,
      savedIdleHours,
      cells,
    };
  });

  const allEvents = Array.from(byRoute.values()).flat();
  const totalTrainDays = allEvents.length;
  const totalTurnaroundHours = allEvents.reduce((sum, event) => sum + event.profile.turnaroundMinutes, 0) / HOUR_MINUTES;
  const totalBaselineIdleHours = allEvents.reduce((sum, event) => sum + event.manual.waitMinutes, 0) / HOUR_MINUTES;
  const totalOptimizedIdleHours = allEvents.reduce((sum, event) => sum + event.auto.waitMinutes, 0) / HOUR_MINUTES;
  const savedIdleHoursTotal = roundHours(
    allEvents.reduce((sum, event) => sum + event.savedWaitMinutes, 0) / HOUR_MINUTES,
  );

  return {
    monthLabel: MONTH_FORMATTER.format(monthStartDate),
    summary: {
      totalTrainDays,
      averageActiveTrainsPerDay: roundHours(totalTrainDays / Math.max(daysInMonth, 1)),
      averageTurnaroundHoursPerTrainDay: totalTrainDays ? roundHours(totalTurnaroundHours / totalTrainDays) : 0,
      averageBaselineIdleHoursPerTrainDay: totalTrainDays ? roundHours(totalBaselineIdleHours / totalTrainDays) : 0,
      averageOptimizedIdleHoursPerTrainDay: totalTrainDays ? roundHours(totalOptimizedIdleHours / totalTrainDays) : 0,
      averageIdleHoursPerTrainDay: totalTrainDays ? roundHours(totalOptimizedIdleHours / totalTrainDays) : 0,
      savedIdleHoursTotal,
      routesImproved: rows.filter((row) => row.savedIdleHours > 0).length,
    },
    days,
    rows,
  };
}

export function buildDemoSimulationReports({
  trains,
  locomotives,
  now,
}: {
  trains: DemoTrain[];
  locomotives: DemoLocomotive[];
  now: Date;
}) {
  const { monthStartDate, daysInMonth, entries } = buildScheduleEntries(trains, now);
  const manualEvents = simulateManualScenario(entries, monthStartDate);
  const autoEvents = simulateOptimizedScenario(entries, trains, locomotives, monthStartDate);
  const byRoute = buildCombinedEvents(entries, manualEvents, autoEvents);

  const live = buildLiveSnapshot(trains, byRoute, now, locomotives.length);
  const dailyReport = buildDailyReport(trains, byRoute, now);
  const monthlyReport = buildMonthlyReport(trains, byRoute, monthStartDate, daysInMonth, now);

  return {
    live,
    dailyReport,
    monthlyReport,
  };
}
