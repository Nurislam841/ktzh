'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Crosshair,
    Focus,
    GitBranch,
    Link2,
    MapPinned,
    Minus,
    Plus,
    Route,
    Sparkles,
    Train,
} from 'lucide-react';

type ScenarioMode = 'overlay' | 'base' | 'optimized';
type ColorMode = 'train' | 'direction' | 'routeType';

type GraphEventNode = {
    key: string;
    tripId: string;
    trainNo: string;
    stationName: string;
    stationIndex: number;
    x: number;
    y: number;
    arrivalMinute: number | null;
    departureMinute: number | null;
    dwellMinutes: number;
    eventType: string;
    nodeKind: 'origin' | 'terminal' | 'arrival' | 'departure' | 'stop' | 'pass';
    stop: any;
    trip: any;
};

type DwellSegment = {
    key: string;
    trainNo: string;
    stationName: string;
    stationIndex: number;
    x1: number;
    x2: number;
    y: number;
    dwellMinutes: number;
    stop: any;
    trip: any;
};

type ThreadLabel = {
    key: string;
    x: number;
    y: number;
    text: string;
};

type TripGraphLayout = {
    trip: any;
    points: Array<{ x: number; y: number }>;
    nodes: GraphEventNode[];
    dwellSegments: DwellSegment[];
    labels: ThreadLabel[];
    minMinute: number;
    maxMinute: number;
};

type TooltipState = {
    x: number;
    y: number;
    title: string;
    lines: string[];
};

const DAY = 24 * 60;
const LEFT_PANEL_WIDTH = 230;
const AXIS_HEIGHT = 72;
const MINOR_GRID_MINUTES = 15;
const MIDNIGHT_MINUTE = 4 * 60;
const COLORS = ['#38bdf8', '#22c55e', '#f97316', '#f43f5e', '#a78bfa', '#facc15', '#2dd4bf', '#60a5fa'];
const SERVICE_DAY_START_MINUTES = 20 * 60;
const MAJOR_STATION_KEYWORDS = [
    'астана',
    'нурлы',
    'алматы',
    'караганда',
    'мойынты',
    'шу',
    'шымкент',
    'тараз',
    'туркестан',
    'сарыагаш',
    'кызылорда',
    'жезказган',
    'павлодар',
    'екибастуз',
    'семей',
    'оскемен',
    'костанай',
    'петропавловск',
    'актобе',
    'атырау',
    'орал',
    'уральск',
    'мангистау',
];

function formatMinutes(value?: number | null) {
    if (typeof value !== 'number' || Number.isNaN(value)) return '—';
    const hours = Math.floor(value / 60);
    const minutes = value % 60;
    return hours ? `${hours} ч ${String(minutes).padStart(2, '0')} мин` : `${minutes} мин`;
}

function normalize(value: string) {
    return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function colorFromTrain(trainNo: string) {
    let hash = 0;
    for (let index = 0; index < trainNo.length; index += 1) hash = trainNo.charCodeAt(index) + ((hash << 5) - hash);
    return COLORS[Math.abs(hash) % COLORS.length];
}

function colorForTrip(trip: any, colorMode: ColorMode) {
    if (colorMode === 'direction') return trip.direction === 'outbound' ? '#0ea5e9' : '#22c55e';
    if (colorMode === 'routeType') {
        if (trip.routeType === 'talgo') return '#8b5cf6';
        if (trip.routeType === 'private_standard') return '#f97316';
        return '#38bdf8';
    }
    return colorFromTrain(trip.trainNo);
}

function operationalClockLabel(minute: number) {
    const normalizedMinute = ((minute % DAY) + DAY) % DAY;
    const absolute = (SERVICE_DAY_START_MINUTES + normalizedMinute) % DAY;
    return `${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`;
}

function operationalDayLabel(minute: number | null | undefined) {
    if (typeof minute !== 'number' || Number.isNaN(minute)) return '—';
    const dayOffset = Math.floor(minute / DAY);
    return `D+${dayOffset} ${operationalClockLabel(minute)}`;
}

function toOperationalNowMinute(date = new Date()) {
    const absolute = date.getHours() * 60 + date.getMinutes();
    return absolute >= SERVICE_DAY_START_MINUTES
        ? absolute - SERVICE_DAY_START_MINUTES
        : absolute + (DAY - SERVICE_DAY_START_MINUTES);
}

function getTrainChangeSummary(trip: any) {
    const changes: string[] = [];
    const base = trip?.baseAssignment;
    const optimized = trip?.optimizedAssignment;

    if (!base && optimized) changes.push(`Optimized добавил подвязку ${optimized.locomotiveLabel}.`);
    if (base && !optimized) changes.push('Optimized оставил поезд без подвязки, baseline был покрыт.');
    if (base?.locomotiveLabel && optimized?.locomotiveLabel && base.locomotiveLabel !== optimized.locomotiveLabel) {
        changes.push(`Локомотив: ${base.locomotiveLabel} → ${optimized.locomotiveLabel}.`);
    }
    if (typeof base?.idleBeforeMinutes === 'number' && typeof optimized?.idleBeforeMinutes === 'number') {
        const diff = base.idleBeforeMinutes - optimized.idleBeforeMinutes;
        if (diff > 0) changes.push(`Idle перед отправлением сокращен на ${formatMinutes(diff)}.`);
        if (diff < 0) changes.push(`Idle перед отправлением вырос на ${formatMinutes(Math.abs(diff))}.`);
    }
    if (base?.releaseOperationalMinute !== optimized?.releaseOperationalMinute) {
        changes.push(`Точка освобождения изменена: ${base?.releaseLabel ?? '—'} → ${optimized?.releaseLabel ?? '—'}.`);
    }
    if (!changes.length) {
        changes.push('Временная нитка не менялась: optimizer сохранил расписание и не ухудшил baseline.');
    }

    return changes;
}

function getCurrentTrainStatus(train: any) {
    if (!train?.stops?.length) return 'Поезд не выбран.';
    const cursor = toOperationalNowMinute();
    const latest = Math.max(train.arrivalOperationalMinute ?? cursor, train.departureOperationalMinute ?? 0);
    const candidates = Array.from({ length: Math.max(2, Math.ceil(latest / DAY) + 2) }, (_, index) => cursor + index * DAY);
    const active = candidates.find((item) => item >= train.departureOperationalMinute && item <= train.arrivalOperationalMinute);
    const effectiveMinute = active ?? cursor;
    const first = train.stops[0];
    const last = train.stops[train.stops.length - 1];

    if (!active && effectiveMinute < (train.departureOperationalMinute ?? 0)) {
        return `До отправления из ${first.station_name}`;
    }
    if (!active && effectiveMinute >= (train.arrivalOperationalMinute ?? 0)) {
        return `На конечной станции ${last.station_name}`;
    }

    for (let index = 1; index < train.stops.length; index += 1) {
        const previous = train.stops[index - 1];
        const current = train.stops[index];
        const previousMinute =
            typeof previous.departure_operational_minute === 'number'
                ? previous.departure_operational_minute
                : previous.arrival_operational_minute;
        const currentMinute =
            typeof current.arrival_operational_minute === 'number'
                ? current.arrival_operational_minute
                : current.departure_operational_minute;
        if (typeof previousMinute !== 'number' || typeof currentMinute !== 'number') continue;
        if (effectiveMinute >= previousMinute && effectiveMinute <= currentMinute) {
            return `Между ${previous.station_name} и ${current.station_name}`;
        }
    }

    return 'Позиция поезда уточняется по нитке.';
}

function describeNodeKind(stop: any, arrivalMinute: number | null, departureMinute: number | null): GraphEventNode['nodeKind'] {
    if (stop.event_type === 'origin_departure') return 'origin';
    if (stop.event_type === 'terminal_arrival') return 'terminal';
    if (stop.event_type === 'pass') return 'pass';
    if (typeof arrivalMinute === 'number' && typeof departureMinute === 'number' && departureMinute > arrivalMinute) return 'arrival';
    if (typeof arrivalMinute === 'number' && departureMinute === null) return 'arrival';
    if (typeof departureMinute === 'number' && arrivalMinute === null) return 'departure';
    if ((stop.dwellMinutes ?? 0) > 0) return 'stop';
    return 'pass';
}

function buildThreadLabels(trip: any, nodes: GraphEventNode[]) {
    if (!nodes.length) return [];
    const anchors: ThreadLabel[] = [];
    const step = Math.max(1, Math.floor(nodes.length / 3));
    [0, step, step * 2, nodes.length - 1]
        .filter((index, position, array) => index >= 0 && index < nodes.length && array.indexOf(index) === position)
        .forEach((index) => {
            const node = nodes[index];
            anchors.push({
                key: `${trip.tripId}:label:${index}`,
                x: node.x + 8,
                y: node.y - 10,
                text: `№${trip.trainNo}`,
            });
        });
    return anchors;
}

function buildStationMeta(pair: any) {
    const stations = pair?.stations ?? [];
    const stopFacts = new Map<string, { hasDwell: boolean; isTerminal: boolean }>();

    (pair?.trains ?? []).forEach((trip: any) => {
        (trip.stops ?? []).forEach((stop: any) => {
            const key = String(stop.station_name);
            const current = stopFacts.get(key) ?? { hasDwell: false, isTerminal: false };
            current.hasDwell = current.hasDwell || (Number(stop.dwellMinutes ?? 0) > 0);
            current.isTerminal =
                current.isTerminal ||
                stop.event_type === 'origin_departure' ||
                stop.event_type === 'terminal_arrival';
            stopFacts.set(key, current);
        });
    });

    return stations.map((station: any) => {
        const fact = stopFacts.get(station.name);
        const normalized = normalize(station.name);
        const isMajor =
            Boolean(fact?.hasDwell) ||
            Boolean(fact?.isTerminal) ||
            MAJOR_STATION_KEYWORDS.some((item) => normalized.includes(item)) ||
            station.index % 10 === 0;

        return {
            ...station,
            isMajor,
        };
    });
}

function buildTripGraphLayout(
    trip: any,
    stationIndex: Map<string, number>,
    xFor: (minute: number) => number,
    yFor: (index: number) => number,
) {
    const nodes: GraphEventNode[] = [];
    const dwellSegments: DwellSegment[] = [];
    const points: Array<{ x: number; y: number }> = [];

    (trip.stops ?? []).forEach((stop: any) => {
        const rowIndex = stationIndex.get(stop.station_name);
        if (rowIndex === undefined) return;
        const y = yFor(rowIndex);
        const arrivalMinute = typeof stop.arrival_operational_minute === 'number' ? Number(stop.arrival_operational_minute) : null;
        const departureMinute = typeof stop.departure_operational_minute === 'number' ? Number(stop.departure_operational_minute) : null;
        const dwellMinutes = Number(stop.dwellMinutes ?? 0);

        if (typeof arrivalMinute === 'number') points.push({ x: xFor(arrivalMinute), y });
        if (typeof departureMinute === 'number') points.push({ x: xFor(departureMinute), y });

        if (typeof arrivalMinute === 'number' && typeof departureMinute === 'number' && departureMinute > arrivalMinute) {
            nodes.push({
                key: `${trip.tripId}:${stop.station_sequence}:arrival`,
                tripId: trip.tripId,
                trainNo: trip.trainNo,
                stationName: stop.station_name,
                stationIndex: rowIndex,
                x: xFor(arrivalMinute),
                y,
                arrivalMinute,
                departureMinute,
                dwellMinutes,
                eventType: stop.event_type,
                nodeKind: 'arrival',
                stop,
                trip,
            });
            nodes.push({
                key: `${trip.tripId}:${stop.station_sequence}:departure`,
                tripId: trip.tripId,
                trainNo: trip.trainNo,
                stationName: stop.station_name,
                stationIndex: rowIndex,
                x: xFor(departureMinute),
                y,
                arrivalMinute,
                departureMinute,
                dwellMinutes,
                eventType: stop.event_type,
                nodeKind: stop.event_type === 'terminal_arrival' ? 'terminal' : 'departure',
                stop,
                trip,
            });
            dwellSegments.push({
                key: `${trip.tripId}:${stop.station_sequence}:dwell`,
                trainNo: trip.trainNo,
                stationName: stop.station_name,
                stationIndex: rowIndex,
                x1: xFor(arrivalMinute),
                x2: xFor(departureMinute),
                y,
                dwellMinutes,
                stop,
                trip,
            });
            return;
        }

        const minute = typeof departureMinute === 'number' ? departureMinute : arrivalMinute;
        if (typeof minute !== 'number') return;
        nodes.push({
            key: `${trip.tripId}:${stop.station_sequence}:single`,
            tripId: trip.tripId,
            trainNo: trip.trainNo,
            stationName: stop.station_name,
            stationIndex: rowIndex,
            x: xFor(minute),
            y,
            arrivalMinute,
            departureMinute,
            dwellMinutes,
            eventType: stop.event_type,
            nodeKind: describeNodeKind(stop, arrivalMinute, departureMinute),
            stop,
            trip,
        });
    });

    const dedupedPoints = points.filter((point, index, array) => index === 0 || point.x !== array[index - 1].x || point.y !== array[index - 1].y);
    const labels = buildThreadLabels(trip, nodes);
    const minutes = nodes
        .flatMap((node) => [node.arrivalMinute, node.departureMinute])
        .filter((value): value is number => typeof value === 'number');

    return {
        trip,
        points: dedupedPoints,
        nodes,
        dwellSegments,
        labels,
        minMinute: minutes.length ? Math.min(...minutes) : 0,
        maxMinute: minutes.length ? Math.max(...minutes) : DAY,
    } satisfies TripGraphLayout;
}

function metricTone(label: string) {
    if (label.toLowerCase().includes('optimized') || label.toLowerCase().includes('saved')) return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    if (label.toLowerCase().includes('base')) return 'border-amber-200 bg-amber-50 text-amber-700';
    return 'border-slate-200 bg-slate-50 text-slate-700';
}

function getNodeShape(node: GraphEventNode) {
    if (node.nodeKind === 'origin') return 'diamond';
    if (node.nodeKind === 'terminal') return 'square';
    if (node.nodeKind === 'pass') return 'small';
    if (node.nodeKind === 'arrival') return 'ring';
    return 'circle';
}

export default function PassengerOperationalGraph({
    pair,
    selectedTrain,
    selectedTrainNo,
    tripRows,
    selectedTrainStops,
    graphStats,
    threadValidation,
    threadActions,
    threadAction,
    onThreadActionChange,
    threadActionMessage,
    insights,
    scenarioMode,
    onScenarioModeChange,
    colorMode,
    onColorModeChange,
    onSelectTrain,
    hrefForPage,
    selectedLocomotiveId,
}: {
    pair: any;
    selectedTrain: any;
    selectedTrainNo: string | null;
    tripRows: any[];
    selectedTrainStops: any[];
    graphStats: Array<{ label: string; value: string; note: string }>;
    threadValidation: Array<{ label: string; value: string; tone: string }>;
    threadActions: Array<{ id: string; label: string; icon: any; summary: string }>;
    threadAction: string;
    onThreadActionChange: (id: string) => void;
    threadActionMessage: string;
    insights: any[];
    scenarioMode: ScenarioMode;
    onScenarioModeChange: (scenario: ScenarioMode) => void;
    colorMode: ColorMode;
    onColorModeChange: (mode: ColorMode) => void;
    onSelectTrain: (trainNo: string) => void;
    hrefForPage: (page: 'graph' | 'bindings' | 'map', overrides?: Record<string, string | null | undefined>) => string;
    selectedLocomotiveId?: string | null;
}) {
    const [detailMode, setDetailMode] = useState<'overview' | 'detail'>('detail');
    const [timeZoom, setTimeZoom] = useState(1.1);
    const [stationZoom, setStationZoom] = useState(1);
    const [hoveredTrainNo, setHoveredTrainNo] = useState<string | null>(null);
    const [hoveredStationName, setHoveredStationName] = useState<string | null>(null);
    const [selectedStationName, setSelectedStationName] = useState<string | null>(null);
    const [selectedEventKey, setSelectedEventKey] = useState<string | null>(null);
    const [tooltip, setTooltip] = useState<TooltipState | null>(null);
    const [crosshair, setCrosshair] = useState<{ x: number; y: number; minute: number; stationName: string } | null>(null);

    const scrollRef = useRef<HTMLDivElement | null>(null);
    const graphBodyRef = useRef<HTMLDivElement | null>(null);
    const lastSelectionKeyRef = useRef<string | null>(null);
    const lastAutoScrollEventKeyRef = useRef<string | null>(null);
    const selectionResetKey = `${pair?.key ?? 'no-pair'}:${selectedTrain?.tripId ?? selectedTrainNo ?? 'no-train'}`;

    const stationMeta = useMemo(() => buildStationMeta(pair), [pair]);
    const stationIndex = useMemo<Map<string, number>>(
        () => new Map<string, number>(stationMeta.map((station: any) => [String(station.name), Number(station.index)])),
        [stationMeta],
    );
    const rowHeight = (detailMode === 'detail' ? 34 : 28) * stationZoom;
    const hourWidth = (detailMode === 'detail' ? 64 : 52) * timeZoom;
    const graphHeight = Math.max(stationMeta.length * rowHeight, 420);
    const maxMinute = useMemo(
        () =>
            Math.max(
                DAY,
                ...((pair?.trains ?? []).flatMap((trip: any) =>
                    (trip.stops ?? []).flatMap((stop: any) => [stop.arrival_operational_minute ?? 0, stop.departure_operational_minute ?? 0]),
                )),
            ),
        [pair],
    );
    const visibleMinutes = Math.max(DAY, Math.ceil((maxMinute + 180) / 60) * 60);
    const graphWidth = Math.max((visibleMinutes / 60) * hourWidth, 1200);
    const xFor = useCallback((minute: number) => (minute / 60) * hourWidth, [hourWidth]);
    const yFor = useCallback((index: number) => index * rowHeight + rowHeight / 2, [rowHeight]);
    const tripLayouts = useMemo<TripGraphLayout[]>(
        () => (pair?.trains ?? []).map((trip: any) => buildTripGraphLayout(trip, stationIndex, xFor, yFor)),
        [pair, stationIndex, xFor, yFor],
    );
    const allNodes = useMemo<GraphEventNode[]>(() => tripLayouts.flatMap((layout) => layout.nodes), [tripLayouts]);
    const selectedEvent = useMemo(
        () => allNodes.find((node) => node.key === selectedEventKey) ?? null,
        [allNodes, selectedEventKey],
    );
    const selectedThreadAction = useMemo(
        () => threadActions.find((item) => item.id === threadAction) ?? threadActions[0],
        [threadAction, threadActions],
    );

    useEffect(() => {
        if (lastSelectionKeyRef.current === selectionResetKey) return;
        lastSelectionKeyRef.current = selectionResetKey;
        lastAutoScrollEventKeyRef.current = null;
        setHoveredTrainNo(null);
        setHoveredStationName(null);
        setSelectedStationName(null);
        setSelectedEventKey(null);
        setTooltip(null);
        setCrosshair(null);
        scrollRef.current?.scrollTo({ left: 0, top: 0, behavior: 'auto' });
    }, [selectionResetKey]);

    useEffect(() => {
        if (!selectedTrain) {
            setSelectedEventKey(null);
            setSelectedStationName(null);
            return;
        }
        const selectedLayout = tripLayouts.find((layout) => layout.trip.trainNo === selectedTrain.trainNo);
        if (!selectedLayout?.nodes?.length) return;
        const preferredStationNode = selectedStationName
            ? selectedLayout.nodes.find((node) => node.stationName === selectedStationName)
            : null;
        const nextNode = preferredStationNode ?? selectedLayout.nodes[Math.floor(selectedLayout.nodes.length / 2)] ?? selectedLayout.nodes[0];
        setSelectedEventKey(nextNode.key);
        if (!selectedStationName) setSelectedStationName(nextNode.stationName);
    }, [selectedStationName, selectedTrain, tripLayouts]);

    const scrollToNode = useCallback((node: GraphEventNode | null) => {
        if (!node || !scrollRef.current) return;
        const viewport = scrollRef.current;
        const targetLeft = Math.max(node.x - viewport.clientWidth * 0.38, 0);
        const targetTop = Math.max(node.stationIndex * rowHeight - viewport.clientHeight * 0.32, 0);
        viewport.scrollTo({ left: targetLeft, top: targetTop, behavior: 'smooth' });
    }, [rowHeight]);

    useEffect(() => {
        if (!selectedEvent?.key) return;
        if (lastAutoScrollEventKeyRef.current === selectedEvent.key) return;
        lastAutoScrollEventKeyRef.current = selectedEvent.key;
        scrollToNode(selectedEvent);
    }, [scrollToNode, selectedEvent]);

    const handleGraphMove = (event: React.MouseEvent<HTMLDivElement>) => {
        if (!graphBodyRef.current) return;
        const rect = graphBodyRef.current.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        const minute = Math.max(0, Math.min(visibleMinutes, (x / graphWidth) * visibleMinutes));
        const station = stationMeta[Math.max(0, Math.min(stationMeta.length - 1, Math.round((y - rowHeight / 2) / rowHeight)))];
        if (!station) return;
        setCrosshair({
            x,
            y: yFor(station.index),
            minute,
            stationName: station.name,
        });
    };

    const showTooltip = (event: React.MouseEvent, title: string, lines: string[]) => {
        if (!graphBodyRef.current) return;
        const rect = graphBodyRef.current.getBoundingClientRect();
        setTooltip({
            x: event.clientX - rect.left + 16,
            y: event.clientY - rect.top + 16,
            title,
            lines,
        });
    };

    const clearHover = () => {
        setTooltip(null);
        setCrosshair(null);
        setHoveredTrainNo(null);
        setHoveredStationName(null);
    };

    const fitSelectedTrain = () => {
        const layout = tripLayouts.find((item) => item.trip.trainNo === selectedTrainNo);
        if (!layout || !scrollRef.current) return;
        scrollRef.current.scrollTo({
            left: Math.max(layout.minMinute / 60 * hourWidth - scrollRef.current.clientWidth * 0.18, 0),
            top: 0,
            behavior: 'smooth',
        });
    };

    const resetView = () => {
        setTimeZoom(1.1);
        setStationZoom(1);
        setDetailMode('detail');
        scrollRef.current?.scrollTo({ left: 0, top: 0, behavior: 'smooth' });
    };

    const selectedTrainChangeSummary = useMemo(() => getTrainChangeSummary(selectedTrain), [selectedTrain]);
    const selectedTrainStatus = useMemo(() => getCurrentTrainStatus(selectedTrain), [selectedTrain]);
    const selectedInspectorStop = selectedEvent?.stop ?? null;
    const selectedInspectorTrain = selectedEvent?.trip ?? selectedTrain ?? null;
    const selectedInspectorLocomotiveBase =
        selectedInspectorTrain?.baseAssignment?.locomotiveLabel ?? selectedInspectorStop?.locomotives?.base ?? 'Нет подвязки';
    const selectedInspectorLocomotiveOptimized =
        selectedInspectorTrain?.optimizedAssignment?.locomotiveLabel ?? selectedInspectorStop?.locomotives?.optimized ?? 'Нет подвязки';

    return (
        <div className="space-y-5">
            <section className="rounded-[1.9rem] border border-slate-200 bg-white px-5 py-4 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                    <div>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">Операционный график</div>
                        <h2 className="mt-2 text-xl font-bold text-slate-950">ГИД-подобный график движения 20:00–20:00</h2>
                        <p className="mt-1 max-w-4xl text-sm leading-6 text-slate-500">
                            График показывает нитки как рабочий инструмент: точки событий на каждой станции, dwell-сегменты, сценарии base/optimized,
                            оперативное время с D+0/D+1 и inspector выбранного события без ухода в нижние таблицы.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        {(['overlay', 'base', 'optimized'] as ScenarioMode[]).map((item) => (
                            <button
                                key={item}
                                onClick={() => onScenarioModeChange(item)}
                                className={`rounded-2xl px-4 py-2.5 text-sm font-semibold transition ${
                                    scenarioMode === item
                                        ? 'bg-slate-950 text-white shadow-[0_10px_24px_rgba(15,23,42,0.16)]'
                                        : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-950'
                                }`}
                            >
                                {item === 'overlay' ? 'Overlay' : item === 'base' ? 'Baseline' : 'Optimized'}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 font-semibold text-slate-600">Время: D+N HH:MM</span>
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 font-semibold text-amber-700">Base: amber dashed</span>
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 font-semibold text-emerald-700">Optimized: solid highlighted</span>
                    <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 font-semibold text-violet-700">00:00 отмечен отдельной линией</span>
                    <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 font-semibold text-sky-700">Hover: точное событие и стоянка</span>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3">
                    {graphStats.map((item) => (
                        <div key={item.label} className={`rounded-2xl border px-3.5 py-2 ${metricTone(item.label)}`}>
                            <div className="text-[11px] uppercase tracking-[0.16em] opacity-70">{item.label}</div>
                            <div className="mt-1 text-sm font-bold">{item.value}</div>
                        </div>
                    ))}
                </div>
            </section>

            <section className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.72fr)_360px]">
                <div className="space-y-4">
                    <div className="rounded-[1.9rem] border border-slate-200 bg-white px-4 py-4 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Режим чтения</span>
                                {(['overview', 'detail'] as const).map((item) => (
                                    <button
                                        key={item}
                                        onClick={() => setDetailMode(item)}
                                        className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                                            detailMode === item ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-600'
                                        }`}
                                    >
                                        {item === 'overview' ? 'Обзор' : 'Детализация'}
                                    </button>
                                ))}
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Раскраска</span>
                                {(['train', 'direction', 'routeType'] as ColorMode[]).map((item) => (
                                    <button
                                        key={item}
                                        onClick={() => onColorModeChange(item)}
                                        className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                                            colorMode === item ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-600'
                                        }`}
                                    >
                                        {item === 'train' ? 'По номеру' : item === 'direction' ? 'По направлению' : 'По типу'}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="mt-4 flex flex-wrap items-center gap-2">
                            <div className="inline-flex items-center rounded-2xl border border-slate-200 bg-slate-50 px-2 py-1.5">
                                <button
                                    onClick={() => setTimeZoom((current) => Math.max(0.75, Number((current - 0.2).toFixed(2))))}
                                    className="rounded-xl p-1 text-slate-600 hover:bg-white"
                                    title="Уменьшить масштаб по времени"
                                >
                                    <Minus size={14} />
                                </button>
                                <span className="px-2 text-xs font-semibold text-slate-600">Time</span>
                                <button
                                    onClick={() => setTimeZoom((current) => Math.min(2.4, Number((current + 0.2).toFixed(2))))}
                                    className="rounded-xl p-1 text-slate-600 hover:bg-white"
                                    title="Увеличить масштаб по времени"
                                >
                                    <Plus size={14} />
                                </button>
                            </div>

                            <div className="inline-flex items-center rounded-2xl border border-slate-200 bg-slate-50 px-2 py-1.5">
                                <button
                                    onClick={() => setStationZoom((current) => Math.max(0.8, Number((current - 0.1).toFixed(2))))}
                                    className="rounded-xl p-1 text-slate-600 hover:bg-white"
                                    title="Уменьшить масштаб по станциям"
                                >
                                    <Minus size={14} />
                                </button>
                                <span className="px-2 text-xs font-semibold text-slate-600">Stations</span>
                                <button
                                    onClick={() => setStationZoom((current) => Math.min(1.9, Number((current + 0.1).toFixed(2))))}
                                    className="rounded-xl p-1 text-slate-600 hover:bg-white"
                                    title="Увеличить масштаб по станциям"
                                >
                                    <Plus size={14} />
                                </button>
                            </div>

                            <button onClick={resetView} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700">
                                <Crosshair size={13} />
                                Reset view
                            </button>
                            <button onClick={fitSelectedTrain} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700">
                                <Focus size={13} />
                                Fit selected train
                            </button>
                            <button
                                onClick={() => scrollRef.current?.scrollTo({ left: 0, top: 0, behavior: 'smooth' })}
                                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                            >
                                <Route size={13} />
                                Fit selected route
                            </button>
                        </div>
                    </div>

                    <div className="overflow-hidden rounded-[2rem] border border-slate-800 bg-slate-950 shadow-[0_24px_56px_rgba(15,23,42,0.28)]">
                        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
                            <div>
                                <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">Railway graph tool</div>
                                <h3 className="mt-1 text-lg font-semibold text-white">Нитки, события, dwell и compare прямо на графике</h3>
                            </div>
                            <div className="flex flex-wrap gap-2 text-[11px] text-slate-300">
                                <span className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1">X: 20:00–20:00</span>
                                <span className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1">Y: станции / пункты</span>
                            </div>
                        </div>

                        <div ref={scrollRef} className="relative max-h-[820px] overflow-auto" onMouseLeave={clearHover}>
                            <div className="flex" style={{ width: LEFT_PANEL_WIDTH + graphWidth }}>
                                <div className="sticky left-0 z-30 shrink-0 border-r border-slate-800 bg-slate-950" style={{ width: LEFT_PANEL_WIDTH }}>
                                    <div className="sticky top-0 z-30 flex h-[72px] items-center border-b border-slate-800 bg-slate-950/95 px-4 backdrop-blur">
                                        <div>
                                            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Станции</div>
                                            <div className="mt-1 text-sm font-semibold text-white">Ось маршрута</div>
                                        </div>
                                    </div>
                                    <div style={{ height: graphHeight }}>
                                        {stationMeta.map((station: any) => {
                                            const active = selectedStationName === station.name;
                                            const hovered = hoveredStationName === station.name;
                                            return (
                                                <button
                                                    key={station.name}
                                                    onClick={() => setSelectedStationName(station.name)}
                                                    onMouseEnter={() => setHoveredStationName(station.name)}
                                                    onMouseLeave={() => setHoveredStationName((current) => (current === station.name ? null : current))}
                                                    className={`flex w-full items-center border-b border-slate-900/80 px-4 text-left transition ${
                                                        active
                                                            ? 'bg-sky-500/12'
                                                            : hovered
                                                                ? 'bg-slate-900'
                                                                : station.index % 2 === 0
                                                                    ? 'bg-slate-950'
                                                                    : 'bg-slate-900/80'
                                                    }`}
                                                    style={{ height: rowHeight }}
                                                >
                                                    <div>
                                                        <div className={`leading-none ${station.isMajor ? 'text-sm font-semibold text-slate-100' : 'text-xs font-medium text-slate-300'}`}>{station.name}</div>
                                                        <div className="mt-1 text-[11px] text-slate-500">{station.distanceKm ?? '—'} км</div>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div className="relative shrink-0" style={{ width: graphWidth }}>
                                    <div className="sticky top-0 z-20 h-[72px] border-b border-slate-800 bg-slate-950/95 backdrop-blur">
                                        <svg width={graphWidth} height={72}>
                                            <rect width={graphWidth} height={72} fill="#020617" />
                                            {Array.from({ length: Math.floor(visibleMinutes / MINOR_GRID_MINUTES) + 1 }).map((_, index) => {
                                                const minute = index * MINOR_GRID_MINUTES;
                                                const x = xFor(minute);
                                                const isHour = minute % 60 === 0;
                                                const isMidnight = minute % DAY === MIDNIGHT_MINUTE;
                                                return (
                                                    <g key={`axis-${minute}`}>
                                                        <line
                                                            x1={x}
                                                            x2={x}
                                                            y1={0}
                                                            y2={72}
                                                            stroke={isMidnight ? '#f43f5e' : isHour ? '#475569' : '#1e293b'}
                                                            strokeWidth={isMidnight ? 2.5 : isHour ? 1.4 : 1}
                                                            strokeDasharray={isHour ? '0' : '2 6'}
                                                        />
                                                        {isHour ? (
                                                            <text x={x + 6} y={28} fill={isMidnight ? '#fecdd3' : '#e2e8f0'} fontSize="13" fontWeight="700">
                                                                {operationalClockLabel(minute)}
                                                            </text>
                                                        ) : null}
                                                        {isMidnight ? (
                                                            <text x={x + 6} y={46} fill="#fda4af" fontSize="11" fontWeight="700">
                                                                00:00
                                                            </text>
                                                        ) : null}
                                                    </g>
                                                );
                                            })}
                                        </svg>
                                        {crosshair ? (
                                            <div className="pointer-events-none absolute inset-0">
                                                <div className="absolute top-0 bottom-0 border-l border-dashed border-sky-300/80" style={{ left: crosshair.x }} />
                                                <div className="absolute left-0 right-0 border-t border-dashed border-sky-300/50" style={{ top: crosshair.y }} />
                                                <div className="absolute rounded-full bg-slate-900/95 px-2.5 py-1 text-[11px] font-semibold text-sky-100" style={{ left: Math.min(Math.max(crosshair.x + 10, 10), graphWidth - 130), top: 10 }}>
                                                    {operationalDayLabel(crosshair.minute)}
                                                </div>
                                                <div className="absolute rounded-full bg-slate-900/95 px-2.5 py-1 text-[11px] font-semibold text-slate-100" style={{ left: Math.min(Math.max(crosshair.x + 10, 10), graphWidth - 160), top: Math.max(crosshair.y - 28, 12) }}>
                                                    {crosshair.stationName}
                                                </div>
                                            </div>
                                        ) : null}

                                        {tooltip ? (
                                            <div className="pointer-events-none absolute z-20 max-w-[280px] rounded-2xl border border-slate-700 bg-slate-950/95 px-3 py-3 text-xs text-slate-100 shadow-2xl" style={{ left: Math.min(tooltip.x, graphWidth - 290), top: Math.min(tooltip.y, graphHeight - 170) }}>
                                                <div className="font-semibold text-white">{tooltip.title}</div>
                                                <div className="mt-2 space-y-1.5">
                                                    {tooltip.lines.map((line, index) => (
                                                        <div key={`${tooltip.title}-${index}`} className="leading-5 text-slate-300">{line}</div>
                                                    ))}
                                                </div>
                                            </div>
                                        ) : null}
                                    </div>
                                    <div ref={graphBodyRef} className="relative" style={{ width: graphWidth, height: graphHeight }} onMouseMove={handleGraphMove}>
                                        <svg width={graphWidth} height={graphHeight}>
                                            <rect width={graphWidth} height={graphHeight} fill="#020617" />
                                            {stationMeta.map((station: any) => (
                                                <rect
                                                    key={`row-${station.name}`}
                                                    x={0}
                                                    y={station.index * rowHeight}
                                                    width={graphWidth}
                                                    height={rowHeight}
                                                    fill={selectedStationName === station.name ? 'rgba(14,165,233,0.09)' : station.index % 2 === 0 ? '#020617' : '#0b1220'}
                                                />
                                            ))}

                                            {Array.from({ length: Math.floor(visibleMinutes / MINOR_GRID_MINUTES) + 1 }).map((_, index) => {
                                                const minute = index * MINOR_GRID_MINUTES;
                                                const x = xFor(minute);
                                                const isHour = minute % 60 === 0;
                                                const isMidnight = minute % DAY === MIDNIGHT_MINUTE;
                                                return (
                                                    <line
                                                        key={`grid-${minute}`}
                                                        x1={x}
                                                        x2={x}
                                                        y1={0}
                                                        y2={graphHeight}
                                                        stroke={isMidnight ? '#f43f5e' : isHour ? '#334155' : '#1e293b'}
                                                        strokeWidth={isMidnight ? 2.2 : isHour ? 1.2 : 0.9}
                                                        strokeDasharray={isHour ? '0' : '2 8'}
                                                        opacity={isMidnight ? 0.82 : isHour ? 0.72 : 0.55}
                                                    />
                                                );
                                            })}

                                            {stationMeta.map((station: any) => (
                                                <line
                                                    key={`station-grid-${station.name}`}
                                                    x1={0}
                                                    x2={graphWidth}
                                                    y1={station.index * rowHeight + rowHeight / 2}
                                                    y2={station.index * rowHeight + rowHeight / 2}
                                                    stroke={station.isMajor ? '#334155' : '#1e293b'}
                                                    strokeWidth={station.isMajor ? 1.2 : 0.8}
                                                />
                                            ))}

                                            {tripLayouts.map((layout) => {
                                                if (layout.points.length < 2) return null;
                                                const baseColor = colorForTrip(layout.trip, colorMode);
                                                const isSelected = selectedTrainNo === layout.trip.trainNo;
                                                const isHovered = hoveredTrainNo === layout.trip.trainNo;
                                                const activeOpacity = isSelected ? 1 : isHovered ? 0.96 : selectedTrainNo ? 0.32 : 0.8;
                                                const overlayOffset = scenarioMode === 'overlay' ? 3 : 0;
                                                const renderPolyline = (offset: number, stroke: string, width: number, dasharray?: string, opacity?: number) => (
                                                    <polyline
                                                        points={layout.points.map((point) => `${point.x},${point.y + offset}`).join(' ')}
                                                        fill="none"
                                                        stroke={stroke}
                                                        strokeWidth={width}
                                                        strokeLinecap="round"
                                                        strokeLinejoin="round"
                                                        strokeDasharray={dasharray}
                                                        opacity={opacity}
                                                        className="cursor-pointer"
                                                        onMouseEnter={() => setHoveredTrainNo(layout.trip.trainNo)}
                                                        onMouseLeave={() => setHoveredTrainNo((current) => (current === layout.trip.trainNo ? null : current))}
                                                        onClick={() => onSelectTrain(layout.trip.trainNo)}
                                                    />
                                                );

                                                return (
                                                    <g key={layout.trip.tripId}>
                                                        {scenarioMode === 'overlay'
                                                            ? (
                                                                <>
                                                                    {renderPolyline(-overlayOffset, '#f59e0b', isSelected ? 3.2 : 2.2, '10 8', activeOpacity * 0.9)}
                                                                    {renderPolyline(overlayOffset, baseColor, isSelected ? 4.8 : 3.2, undefined, activeOpacity)}
                                                                </>
                                                            )
                                                            : renderPolyline(0, baseColor, isSelected ? 5 : 3.2, scenarioMode === 'base' ? '12 8' : undefined, activeOpacity)}

                                                        {layout.dwellSegments.map((segment) => {
                                                            const stationSelected = selectedStationName === segment.stationName;
                                                            const baseWidth = detailMode === 'detail' ? 7 : 5;
                                                            const width = stationSelected ? baseWidth + 2 : segment.dwellMinutes >= 30 ? baseWidth + 1.5 : baseWidth;
                                                            const labelVisible = detailMode === 'detail' && hourWidth >= 54 && segment.dwellMinutes >= 5;
                                                            const segmentColor = scenarioMode === 'base' ? '#fbbf24' : scenarioMode === 'optimized' ? '#34d399' : '#f8fafc';
                                                            const tooltipLines = [
                                                                `Станция: ${segment.stationName}`,
                                                                `Прибытие: ${segment.stop.arrivalLabel ?? operationalDayLabel(segment.stop.arrival_operational_minute)}`,
                                                                `Отправление: ${segment.stop.departureLabel ?? operationalDayLabel(segment.stop.departure_operational_minute)}`,
                                                                `Стоянка: ${formatMinutes(segment.dwellMinutes)}`,
                                                            ];
                                                            return (
                                                                <g key={segment.key}>
                                                                    <line
                                                                        x1={segment.x1}
                                                                        x2={segment.x2}
                                                                        y1={segment.y}
                                                                        y2={segment.y}
                                                                        stroke={segmentColor}
                                                                        strokeWidth={width}
                                                                        strokeLinecap="round"
                                                                        opacity={stationSelected ? 1 : 0.95}
                                                                        onMouseEnter={(event) => {
                                                                            setHoveredTrainNo(segment.trainNo);
                                                                            showTooltip(event, `Стоянка • поезд ${segment.trainNo}`, tooltipLines);
                                                                        }}
                                                                        onMouseMove={(event) => showTooltip(event, `Стоянка • поезд ${segment.trainNo}`, tooltipLines)}
                                                                        onMouseLeave={() => setTooltip(null)}
                                                                        onClick={() => {
                                                                            setSelectedStationName(segment.stationName);
                                                                            setSelectedEventKey(`${segment.trip.tripId}:${segment.stop.station_sequence}:arrival`);
                                                                            onSelectTrain(segment.trainNo);
                                                                        }}
                                                                        className="cursor-pointer"
                                                                    />
                                                                    {labelVisible ? (
                                                                        <text
                                                                            x={(segment.x1 + segment.x2) / 2}
                                                                            y={segment.y - 8}
                                                                            fill={segment.dwellMinutes >= 30 ? '#fbbf24' : '#cbd5e1'}
                                                                            fontSize="11"
                                                                            fontWeight="700"
                                                                            textAnchor="middle"
                                                                        >
                                                                            {formatMinutes(segment.dwellMinutes)}
                                                                        </text>
                                                                    ) : null}
                                                                </g>
                                                            );
                                                        })}

                                                        {layout.nodes.map((node) => {
                                                            const selectedNode = selectedEventKey === node.key;
                                                            const selectedStation = selectedStationName === node.stationName;
                                                            const nodeShape = getNodeShape(node);
                                                            const nodeRadius =
                                                                nodeShape === 'small'
                                                                    ? 2.8
                                                                    : nodeShape === 'ring'
                                                                        ? 4.5
                                                                        : nodeShape === 'circle'
                                                                            ? 4
                                                                            : 5.2;
                                                            const nodeColor =
                                                                node.nodeKind === 'origin'
                                                                    ? '#f8fafc'
                                                                    : node.nodeKind === 'terminal'
                                                                        ? '#fda4af'
                                                                        : node.dwellMinutes >= 30
                                                                            ? '#fbbf24'
                                                                            : colorForTrip(layout.trip, colorMode);
                                                            const opacity = selectedStation || selectedNode ? 1 : activeOpacity;
                                                            const tooltipLines = [
                                                                `Станция: ${node.stationName}`,
                                                                `Тип: ${node.nodeKind}`,
                                                                `Прибытие: ${node.stop.arrivalLabel ?? operationalDayLabel(node.arrivalMinute)}`,
                                                                `Отправление: ${node.stop.departureLabel ?? operationalDayLabel(node.departureMinute)}`,
                                                                `Стоянка: ${formatMinutes(node.dwellMinutes)}`,
                                                                `Сценарий: ${scenarioMode === 'overlay' ? 'Base + Optimized' : scenarioMode}`,
                                                                `Локомотив base: ${node.stop.locomotives?.base ?? node.trip.baseAssignment?.locomotiveLabel ?? '—'}`,
                                                                `Локомотив optimized: ${node.stop.locomotives?.optimized ?? node.trip.optimizedAssignment?.locomotiveLabel ?? '—'}`,
                                                            ];

                                                            return (
                                                                <g
                                                                    key={node.key}
                                                                    onMouseEnter={(event) => {
                                                                        setHoveredTrainNo(node.trainNo);
                                                                        showTooltip(event, `Поезд ${node.trainNo}`, tooltipLines);
                                                                    }}
                                                                    onMouseMove={(event) => showTooltip(event, `Поезд ${node.trainNo}`, tooltipLines)}
                                                                    onMouseLeave={() => setTooltip(null)}
                                                                    onClick={() => {
                                                                        onSelectTrain(node.trainNo);
                                                                        setSelectedStationName(node.stationName);
                                                                        setSelectedEventKey(node.key);
                                                                    }}
                                                                    className="cursor-pointer"
                                                                >
                                                                    {nodeShape === 'diamond' ? (
                                                                        <rect x={node.x - 5} y={node.y - 5} width={10} height={10} transform={`rotate(45 ${node.x} ${node.y})`} fill={nodeColor} stroke={selectedNode ? '#ffffff' : '#020617'} strokeWidth={selectedNode ? 2.5 : 1.5} opacity={opacity} />
                                                                    ) : null}
                                                                    {nodeShape === 'square' ? (
                                                                        <rect x={node.x - 5} y={node.y - 5} width={10} height={10} rx={2} fill={nodeColor} stroke={selectedNode ? '#ffffff' : '#020617'} strokeWidth={selectedNode ? 2.5 : 1.5} opacity={opacity} />
                                                                    ) : null}
                                                                    {nodeShape === 'ring' ? (
                                                                        <>
                                                                            <circle cx={node.x} cy={node.y} r={nodeRadius + 1.5} fill="transparent" stroke={nodeColor} strokeWidth={selectedNode ? 3 : 2} opacity={opacity} />
                                                                            <circle cx={node.x} cy={node.y} r={2.4} fill={selectedNode ? '#ffffff' : nodeColor} opacity={opacity} />
                                                                        </>
                                                                    ) : null}
                                                                    {nodeShape === 'circle' || nodeShape === 'small' ? (
                                                                        <circle cx={node.x} cy={node.y} r={selectedNode ? nodeRadius + 1.4 : nodeRadius} fill={nodeColor} stroke={selectedNode ? '#ffffff' : '#020617'} strokeWidth={selectedNode ? 2.4 : 1.1} opacity={opacity} />
                                                                    ) : null}
                                                                </g>
                                                            );
                                                        })}

                                                        {layout.labels
                                                            .filter((_, index) => detailMode === 'detail' || index === 0 || index === layout.labels.length - 1)
                                                            .map((label) => (
                                                                <text
                                                                    key={label.key}
                                                                    x={label.x}
                                                                    y={label.y}
                                                                    fill={colorForTrip(layout.trip, colorMode)}
                                                                    fontSize={selectedTrainNo === layout.trip.trainNo ? 12 : 11}
                                                                    fontWeight="700"
                                                                    opacity={selectedTrainNo === layout.trip.trainNo || !selectedTrainNo ? 0.92 : 0.45}
                                                                >
                                                                    {label.text}
                                                                </text>
                                                            ))}
                                                    </g>
                                                );
                                            })}
                                        </svg>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <section className="grid grid-cols-1 gap-5 xl:grid-cols-[1.12fr_0.88fr]">
                        <div className="rounded-[1.9rem] border border-slate-200 bg-white px-4 py-4 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
                            <div className="mb-4 flex items-center justify-between">
                                <div>
                                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Связь с графиком</div>
                                    <h3 className="mt-1 text-lg font-semibold text-slate-950">Рейсы выбранной пары</h3>
                                </div>
                                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{`${tripRows.length} ниток`}</span>
                            </div>
                            <div className="overflow-hidden rounded-[1.5rem] border border-slate-200">
                                <div className="overflow-x-auto">
                                    <table className="min-w-full text-sm">
                                        <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.18em] text-slate-500">
                                            <tr>
                                                <th className="px-4 py-3">Поезд</th>
                                                <th className="px-4 py-3">Маршрут</th>
                                                <th className="px-4 py-3">Сценарий</th>
                                                <th className="px-4 py-3">Изменение</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 bg-white">
                                            {tripRows.map((row: any) => {
                                                const active = row.trainNo === selectedTrainNo;
                                                const hovered = row.trainNo === hoveredTrainNo;
                                                const changes = getTrainChangeSummary({ baseAssignment: row.base, optimizedAssignment: row.optimized });
                                                return (
                                                    <tr
                                                        key={row.tripId}
                                                        className={`cursor-pointer transition ${active ? 'bg-sky-50' : hovered ? 'bg-slate-50' : 'hover:bg-slate-50'}`}
                                                        onClick={() => onSelectTrain(row.trainNo)}
                                                        onMouseEnter={() => setHoveredTrainNo(row.trainNo)}
                                                        onMouseLeave={() => setHoveredTrainNo((current) => (current === row.trainNo ? null : current))}
                                                    >
                                                        <td className="px-4 py-4">
                                                            <div className="font-semibold text-slate-900">{`№${row.trainNo}`}</div>
                                                            <div className="text-xs text-slate-500">{row.pairDisplay}</div>
                                                        </td>
                                                        <td className="px-4 py-4 text-slate-600">
                                                            <div>{row.routeLabel}</div>
                                                            <div className="text-xs text-slate-500">{`${row.departureLabel} → ${row.arrivalLabel}`}</div>
                                                        </td>
                                                        <td className="px-4 py-4 text-slate-600">
                                                            <div>{row.base?.locomotiveLabel ?? '—'}</div>
                                                            <div className="text-xs text-slate-500">{row.optimized?.locomotiveLabel ?? '—'}</div>
                                                        </td>
                                                        <td className="px-4 py-4">
                                                            <div className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${row.improvementMinutes > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                                                {formatMinutes(row.improvementMinutes)}
                                                            </div>
                                                            <div className="mt-2 text-xs leading-5 text-slate-500">{changes[0]}</div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                        <div className="rounded-[1.9rem] border border-slate-200 bg-white px-4 py-4 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
                            <div className="mb-4 flex items-center justify-between">
                                <div>
                                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Связь с графиком</div>
                                    <h3 className="mt-1 text-lg font-semibold text-slate-950">Станционные события выбранной нитки</h3>
                                </div>
                                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{selectedTrainStops.length}</span>
                            </div>
                            {selectedTrain ? (
                                <div className="max-h-[720px] overflow-auto rounded-[1.5rem] border border-slate-200">
                                    <table className="min-w-full text-sm">
                                        <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase tracking-[0.18em] text-slate-500">
                                            <tr>
                                                <th className="px-4 py-3">#</th>
                                                <th className="px-4 py-3">Станция</th>
                                                <th className="px-4 py-3">Приб.</th>
                                                <th className="px-4 py-3">Отпр.</th>
                                                <th className="px-4 py-3">Стоянка</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 bg-white">
                                            {selectedTrainStops.map((stop: any) => {
                                                const active = selectedStationName === stop.station_name;
                                                const node =
                                                    allNodes.find((item) => item.tripId === selectedTrain.tripId && item.stationName === stop.station_name && item.nodeKind !== 'departure') ??
                                                    allNodes.find((item) => item.tripId === selectedTrain.tripId && item.stationName === stop.station_name) ??
                                                    null;
                                                return (
                                                    <tr
                                                        key={`${selectedTrain.tripId}-${stop.station_sequence}`}
                                                        className={`cursor-pointer transition ${active ? 'bg-sky-50' : 'hover:bg-slate-50'}`}
                                                        onClick={() => {
                                                            setSelectedStationName(stop.station_name);
                                                            if (node) setSelectedEventKey(node.key);
                                                            scrollToNode(node);
                                                        }}
                                                    >
                                                        <td className="px-4 py-3 text-slate-400">{stop.station_sequence}</td>
                                                        <td className="px-4 py-3">
                                                            <div className="font-semibold text-slate-900">{stop.station_name}</div>
                                                            <div className="text-xs text-slate-500">{(stop.service_operations ?? []).join(', ') || stop.event_type}</div>
                                                        </td>
                                                        <td className="px-4 py-3 text-slate-600">{stop.arrivalLabel ?? '—'}</td>
                                                        <td className="px-4 py-3 text-slate-600">{stop.departureLabel ?? '—'}</td>
                                                        <td className="px-4 py-3">
                                                            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${Number(stop.dwellMinutes ?? 0) >= 30 ? 'bg-amber-50 text-amber-700' : Number(stop.dwellMinutes ?? 0) > 0 ? 'bg-sky-50 text-sky-700' : 'bg-slate-100 text-slate-500'}`}>
                                                                {formatMinutes(stop.dwellMinutes)}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-500">
                                    Выбери нитку, чтобы увидеть синхронизированные события по станциям.
                                </div>
                            )}
                        </div>
                    </section>
                </div>

                <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
                    <div className="rounded-[1.9rem] border border-slate-200 bg-white px-4 py-4 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
                        <div className="flex items-center gap-2">
                            <Train size={16} className="text-sky-600" />
                            <h3 className="text-base font-semibold text-slate-950">Inspector</h3>
                        </div>

                        <div className="mt-4 rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-4">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                                {selectedEvent ? 'Выбранное событие' : 'Выбранная нитка'}
                            </div>
                            <div className="mt-2 text-lg font-semibold text-slate-950">{selectedInspectorTrain ? `Поезд ${selectedInspectorTrain.trainNo}` : 'Событие не выбрано'}</div>
                            <div className="mt-1 text-sm text-slate-500">{selectedInspectorTrain?.routeLabel ?? 'Выбери нитку или станцию на графике.'}</div>
                            <div className="mt-3 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-600">
                                {selectedEvent ? `Станция ${selectedEvent.stationName} • ${selectedEvent.nodeKind}` : selectedTrainStatus}
                            </div>
                        </div>
                        <div className="mt-4 space-y-3">
                            <div className="grid grid-cols-[128px_minmax(0,1fr)] gap-3 text-sm">
                                <div className="text-slate-400">Станция</div>
                                <div className="font-semibold text-slate-900">{selectedEvent?.stationName ?? selectedStationName ?? '—'}</div>
                                <div className="text-slate-400">Прибытие</div>
                                <div className="font-semibold text-slate-900">{selectedInspectorStop?.arrivalLabel ?? operationalDayLabel(selectedEvent?.arrivalMinute ?? null)}</div>
                                <div className="text-slate-400">Отправление</div>
                                <div className="font-semibold text-slate-900">{selectedInspectorStop?.departureLabel ?? operationalDayLabel(selectedEvent?.departureMinute ?? null)}</div>
                                <div className="text-slate-400">Стоянка</div>
                                <div className="font-semibold text-slate-900">{formatMinutes(selectedInspectorStop?.dwellMinutes ?? selectedEvent?.dwellMinutes ?? null)}</div>
                                <div className="text-slate-400">Тип события</div>
                                <div className="font-semibold text-slate-900">{selectedEvent?.nodeKind ?? selectedInspectorStop?.event_type ?? '—'}</div>
                                <div className="text-slate-400">Опер. время</div>
                                <div className="font-semibold text-slate-900">{selectedEvent ? `${operationalDayLabel(selectedEvent.arrivalMinute ?? selectedEvent.departureMinute)} / ${operationalClockLabel(selectedEvent.arrivalMinute ?? selectedEvent.departureMinute ?? 0)}` : '—'}</div>
                                <div className="text-slate-400">Локомотив base</div>
                                <div className="font-semibold text-slate-900">{selectedInspectorLocomotiveBase}</div>
                                <div className="text-slate-400">Локомотив optimized</div>
                                <div className="font-semibold text-slate-900">{selectedInspectorLocomotiveOptimized}</div>
                            </div>
                        </div>

                        <div className="mt-4 grid gap-2">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Что изменилось</div>
                            {selectedTrainChangeSummary.map((item) => (
                                <div key={item} className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3 text-sm leading-6 text-slate-600">
                                    {item}
                                </div>
                            ))}
                        </div>

                        <div className="mt-4 grid gap-2">
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                {selectedInspectorTrain ? (
                                    <>
                                        <Link href={hrefForPage('map', { trainNo: selectedInspectorTrain.trainNo, scenario: scenarioMode })} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-700">
                                            <MapPinned size={14} />
                                            К карте
                                        </Link>
                                        <Link
                                            href={hrefForPage('bindings', {
                                                locomotiveId:
                                                    selectedInspectorTrain.optimizedAssignment?.locomotiveId ??
                                                    selectedInspectorTrain.baseAssignment?.locomotiveId ??
                                                    selectedLocomotiveId ??
                                                    null,
                                                trainNo: selectedInspectorTrain.trainNo,
                                                scenario: scenarioMode === 'overlay' ? 'optimized' : scenarioMode,
                                            })}
                                            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-700"
                                        >
                                            <Link2 size={14} />
                                            К подвязкам
                                        </Link>
                                    </>
                                ) : null}
                            </div>
                        </div>
                    </div>

                    <div className="rounded-[1.9rem] border border-slate-200 bg-white px-4 py-4 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
                        <div className="flex items-center gap-2">
                            <GitBranch size={16} className="text-slate-700" />
                            <h3 className="text-base font-semibold text-slate-950">Действия с ниткой</h3>
                        </div>
                        <div className="mt-4 grid gap-2">
                            {threadValidation.map((item) => (
                                <div key={item.label} className={`rounded-2xl px-4 py-3 text-sm font-semibold ${item.tone}`}>
                                    <div className="text-[11px] uppercase tracking-[0.16em] opacity-70">{item.label}</div>
                                    <div className="mt-1">{item.value}</div>
                                </div>
                            ))}
                        </div>

                        <div className="mt-4 grid grid-cols-2 gap-2">
                            {threadActions.map((item) => {
                                const Icon = item.icon;
                                return (
                                    <button
                                        key={item.id}
                                        onClick={() => onThreadActionChange(item.id)}
                                        className={`rounded-2xl border px-3 py-3 text-left text-sm transition ${
                                            threadAction === item.id
                                                ? 'border-slate-900 bg-slate-950 text-white'
                                                : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2 font-semibold">
                                            <Icon size={15} />
                                            {item.label}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>

                        <div className="mt-4 rounded-[1.4rem] border border-slate-100 bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-600">
                            <div className="font-semibold text-slate-900">{selectedThreadAction.label}</div>
                            <p className="mt-2">{selectedThreadAction.summary}</p>
                            <p className="mt-2">{threadActionMessage}</p>
                        </div>
                    </div>

                    <div className="rounded-[1.9rem] border border-slate-200 bg-white px-4 py-4 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
                        <div className="flex items-center gap-2">
                            <Sparkles size={16} className="text-emerald-600" />
                            <h3 className="text-base font-semibold text-slate-950">Легенда и смысл compare</h3>
                        </div>
                        <div className="mt-4 space-y-3">
                            <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                                <div className="font-semibold text-slate-900">Overlay</div>
                                <div className="mt-1">Base показывается amber dashed, optimized — яркой ниткой. Если график одинаковый, различие читается через подвязки и inspector.</div>
                            </div>
                            <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                                <div className="font-semibold text-slate-900">Event nodes</div>
                                <div className="mt-1">Каждая станция имеет точку события. Arrival и departure разделяются отдельными узлами, а dwell читается как горизонтальный сегмент.</div>
                            </div>
                            <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                                <div className="font-semibold text-slate-900">Crosshair</div>
                                <div className="mt-1">Наведи курсор на график, чтобы получить точное operational time и строку станции без ухода в таблицу.</div>
                            </div>
                            {(insights ?? []).slice(0, 3).map((item: any) => (
                                <div key={item.title} className="rounded-[1.25rem] border border-slate-100 bg-slate-50 px-4 py-3">
                                    <div className="font-semibold text-slate-900">{item.title}</div>
                                    <p className="mt-1 text-sm leading-6 text-slate-600">{item.message}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </aside>
            </section>
        </div>
    );
}
