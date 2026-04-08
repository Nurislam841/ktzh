'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useDeferredValue, useEffect, useRef, useState } from 'react';
import {
    AlertTriangle,
    ArrowRightLeft,
    BarChart3,
    Clock3,
    GitBranch,
    Layers3,
    Link2,
    Loader2,
    MapPinned,
    Pencil,
    RefreshCw,
    Route,
    Search,
    Sparkles,
    Train,
    Waypoints,
} from 'lucide-react';
import Sidebar from '../Sidebar';
import PassengerRouteMap from './PassengerRouteMap';
import PassengerOperationalGraph from './PassengerOperationalGraph';
import PassengerBindingsWorkbench from './PassengerBindingsWorkbench';
import { getPassengerTimetableOverview, getStations, pickBestStationId } from '../../lib/api';

type PageMode = 'graph' | 'bindings' | 'map';
type ScenarioMode = 'overlay' | 'base' | 'optimized';
type ColorMode = 'train' | 'direction' | 'routeType';

const DAY = 24 * 60;
const LEFT = 190;
const RIGHT = 50;
const TOP = 72;
const BOTTOM = 48;
const ROW = 48;
const HOUR = 40;
const COLORS = ['#38bdf8', '#22c55e', '#f97316', '#f43f5e', '#a78bfa', '#facc15', '#2dd4bf', '#60a5fa'];
const SERVICE_DAY_START_MINUTES = 20 * 60;

const PAGE_META: Record<PageMode, { title: string; description: string }> = {
    graph: {
        title: 'График',
        description: 'Главный рабочий экран по логике ГИД-Урал: нитки, оперативное время 20:00–20:00, действия с поездами и сравнение baseline vs optimized.',
    },
    bindings: {
        title: 'Подвязки локомотивов',
        description: 'Отдельный режим анализа локомотивов: текущая подвязка, idle, следующий поезд, проблемные окна и explainable-цепочки назначений.',
    },
    map: {
        title: 'Карта',
        description: 'Полный маршрут от A до B по всей трассе: станции, текущая позиция поезда, локомотив на маршруте, сегменты тяги и точки возможной смены.',
    },
};

const PAGE_TABS: Array<{ key: PageMode; label: string; icon: any }> = [
    { key: 'graph', label: 'График', icon: Route },
    { key: 'bindings', label: 'Подвязки', icon: Link2 },
    { key: 'map', label: 'Карта', icon: MapPinned },
];

const THREAD_ACTIONS = [
    {
        id: 'glue',
        label: 'Склейка',
        icon: GitBranch,
        summary: 'Соединяет смежные нитки одного оборота, если они стыкуются по станции и времени.',
    },
    {
        id: 'split',
        label: 'Разрыв',
        icon: ArrowRightLeft,
        summary: 'Разрывает нитку в конфликтной точке, если по времени или по станции возникла несогласованность.',
    },
    {
        id: 'renumber',
        label: 'Смена номера',
        icon: Train,
        summary: 'Меняет номер движения в точке оборота и оставляет историю связки до и после операции.',
    },
    {
        id: 'correct',
        label: 'Корректировка',
        icon: Pencil,
        summary: 'Подготавливает быструю корректировку времени, стоянки или станции без потери исходной строки.',
    },
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

function toOperationalNowMinute(date = new Date()) {
    const absolute = date.getHours() * 60 + date.getMinutes();
    return absolute >= SERVICE_DAY_START_MINUTES
        ? absolute - SERVICE_DAY_START_MINUTES
        : absolute + (DAY - SERVICE_DAY_START_MINUTES);
}

function operationalClockLabel(minute: number) {
    const normalizedMinute = ((minute % DAY) + DAY) % DAY;
    const absolute = (SERVICE_DAY_START_MINUTES + normalizedMinute) % DAY;
    return `${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`;
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

function mergeQueryString(
    pathname: string,
    searchParams: URLSearchParams,
    updates: Record<string, string | null | undefined>,
) {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([key, value]) => {
        if (typeof value === 'string' && value.length > 0) {
            params.set(key, value);
            return;
        }
        params.delete(key);
    });
    const query = params.toString();
    return `${pathname}${query ? `?${query}` : ''}`;
}

function buildFilterKey(filters: { pairKey?: string | null; locomotiveId?: string | null }) {
    return `${filters.pairKey ?? ''}|${filters.locomotiveId ?? ''}`;
}

function buildSelectionKey(selection: {
    pairKey?: string | null;
    trainNo?: string | null;
    locomotiveId?: string | null;
    scenario?: string | null;
}) {
    return `${selection.pairKey ?? ''}|${selection.trainNo ?? ''}|${selection.locomotiveId ?? ''}|${selection.scenario ?? ''}`;
}

function debugGraphState(event: string, payload: Record<string, unknown> = {}) {
    if (typeof window === 'undefined') return;
    console.info(`[PassengerGraphState] ${event}`, {
        renderTimestamp: new Date().toISOString(),
        ...payload,
    });
}

function buildThreadValidation(selectedTrain: any, parseIssuesCount: number) {
    if (!selectedTrain) return [];
    return [
        { label: 'Парный оборот', value: selectedTrain.pairDisplay, tone: 'bg-sky-50 text-sky-700' },
        {
            label: 'Покрытие base',
            value: selectedTrain.baseAssignment?.locomotiveLabel ?? 'Нет подвязки',
            tone: selectedTrain.baseAssignment ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700',
        },
        {
            label: 'Покрытие optimized',
            value: selectedTrain.optimizedAssignment?.locomotiveLabel ?? 'Нет подвязки',
            tone: selectedTrain.optimizedAssignment ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700',
        },
        {
            label: 'Лог ошибок парсинга',
            value: `${parseIssuesCount}`,
            tone: parseIssuesCount > 0 ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600',
        },
    ];
}

function buildThreadActionMessage(actionId: string, selectedTrain: any) {
    if (!selectedTrain) return 'Сначала выбери нитку на графике.';
    const trainLabel = `поезд ${selectedTrain.trainNo} (${selectedTrain.originStation} → ${selectedTrain.destinationStation})`;
    if (actionId === 'glue') {
        return `MVP-панель подготовила контекст для операции "Склейка" по нитке ${trainLabel}. Следующим серверным шагом сюда ляжет валидация по станции стыка, времени и паре поездов.`;
    }
    if (actionId === 'split') {
        return `Для ${trainLabel} выбран режим "Разрыв". В текущем MVP это explainable action strip: он выделяет нитку и подготавливает точку разрыва без потери исходных данных.`;
    }
    if (actionId === 'renumber') {
        return `Для ${trainLabel} выбран режим "Смена номера". Он нужен для связки оборота типа 4 → 3 или других парных сценариев после конечной станции.`;
    }
    return `Для ${trainLabel} выбран режим "Корректировка". Он предназначен для быстрой правки времени, стоянки или конфликтной станции с обязательным журналированием до/после.`;
}

function describeLocomotiveChain(chain: any) {
    if (!chain) return null;
    const assignments = chain.assignments ?? [];
    const idleBlocks = chain.idleBlocks ?? [];
    const cursor = toOperationalNowMinute();
    const maxMinute = Math.max(
        0,
        ...assignments.map((item: any) => item.releaseOperationalMinute ?? 0),
        ...idleBlocks.map((item: any) => item.endMinute ?? 0),
    );
    const candidateMoments = Array.from({ length: Math.max(2, Math.ceil(maxMinute / DAY) + 2) }, (_, index) => cursor + index * DAY);
    const activeAssignment = assignments.find((item: any) =>
        candidateMoments.some((minute) =>
            typeof item.departureOperationalMinute === 'number' &&
            typeof item.releaseOperationalMinute === 'number' &&
            minute >= item.departureOperationalMinute &&
            minute <= item.releaseOperationalMinute,
        ),
    ) ?? null;
    const activeIdle = idleBlocks.find((item: any) =>
        candidateMoments.some((minute) =>
            typeof item.startMinute === 'number' &&
            typeof item.endMinute === 'number' &&
            minute >= item.startMinute &&
            minute <= item.endMinute,
        ),
    ) ?? null;

    if (activeAssignment) {
        const status =
            candidateMoments.some((minute) => minute <= activeAssignment.arrivalOperationalMinute)
                ? 'В рейсе'
                : 'На обороте';
        return {
            status,
            location: status === 'В рейсе'
                ? `${activeAssignment.originStation} → ${activeAssignment.destinationStation}`
                : activeAssignment.destinationStation,
            releaseLabel: activeAssignment.releaseLabel,
            nextTrain: null,
            idleLabel: null,
        };
    }

    if (activeIdle) {
        const nextAssignment = assignments.find((item: any) => item.assignmentId === activeIdle.nextAssignmentId) ?? null;
        const previousAssignment = assignments.find((item: any) => item.assignmentId === activeIdle.previousAssignmentId) ?? null;
        return {
            status: 'Простой',
            location: nextAssignment?.originStation ?? previousAssignment?.destinationStation ?? chain.homeStation ?? '—',
            releaseLabel: nextAssignment?.departureLabel ?? previousAssignment?.releaseLabel ?? '—',
            nextTrain: nextAssignment?.trainNo ?? null,
            idleLabel: `${activeIdle.startLabel} → ${activeIdle.endLabel}`,
        };
    }

    const firstAssignment = assignments[0] ?? null;
    if (firstAssignment && cursor < firstAssignment.departureOperationalMinute) {
        return {
            status: 'Резерв',
            location: chain.homeStation ?? firstAssignment.originStation,
            releaseLabel: firstAssignment.departureLabel,
            nextTrain: firstAssignment.trainNo,
            idleLabel: null,
        };
    }

    const lastAssignment = assignments[assignments.length - 1] ?? null;
    return {
        status: 'Свободен',
        location: lastAssignment?.destinationStation ?? chain.homeStation ?? '—',
        releaseLabel: lastAssignment?.releaseLabel ?? '—',
        nextTrain: null,
        idleLabel: null,
    };
}

function RailGraph({
    pair,
    mode,
    colorMode,
    selectedTrainNo,
    onSelectTrain,
}: {
    pair: any;
    mode: ScenarioMode;
    colorMode: ColorMode;
    selectedTrainNo: string | null;
    onSelectTrain: (trainNo: string) => void;
}) {
    const stations = pair?.stations ?? [];
    const stationIndex = new Map<string, number>(stations.map((station: any) => [String(station.name), Number(station.index)]));
    const connectors = mode === 'overlay' ? [...(pair.connectors?.base ?? []), ...(pair.connectors?.optimized ?? [])] : pair.connectors?.[mode] ?? [];
    const maxMinute = Math.max(
        DAY,
        ...((pair?.trains ?? []).flatMap((trip: any) => trip.stops.flatMap((stop: any) => [stop.arrival_operational_minute ?? 0, stop.departure_operational_minute ?? 0]))),
        ...(connectors.map((connector: any) => connector.endMinute) ?? []),
    );
    const visibleMinutes = Math.max(DAY, Math.ceil((maxMinute + 180) / DAY) * DAY);
    const width = LEFT + RIGHT + (visibleMinutes / 60) * HOUR;
    const height = TOP + BOTTOM + Math.max(stations.length - 1, 1) * ROW;
    const xFor = (minute: number) => LEFT + (minute / 60) * HOUR;
    const yFor = (index: number) => TOP + index * ROW;

    const buildPoints = (trip: any) => {
        const points: Array<{ x: number; y: number }> = [];
        trip.stops.forEach((stop: any) => {
            const index = stationIndex.get(stop.station_name);
            if (index === undefined) return;
            const arrival: number | null =
                typeof stop.arrival_operational_minute === 'number'
                    ? Number(stop.arrival_operational_minute)
                    : typeof stop.departure_operational_minute === 'number'
                        ? Number(stop.departure_operational_minute)
                        : null;
            const departure: number | null =
                typeof stop.departure_operational_minute === 'number'
                    ? Number(stop.departure_operational_minute)
                    : typeof stop.arrival_operational_minute === 'number'
                        ? Number(stop.arrival_operational_minute)
                        : null;
            if (typeof arrival === 'number') points.push({ x: xFor(arrival), y: yFor(index) });
            if (typeof departure === 'number') points.push({ x: xFor(departure), y: yFor(index) });
        });
        return points.filter((point, index, array) => index === 0 || point.x !== array[index - 1].x || point.y !== array[index - 1].y);
    };

    return (
        <div className="overflow-hidden rounded-[2rem] border border-slate-800 bg-slate-950 shadow-[0_20px_50px_rgba(15,23,42,0.24)]">
            <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
                <div>
                    <h3 className="text-lg font-semibold text-white">Railway timetable</h3>
                    <p className="text-sm text-slate-400">X = 20:00–20:00, Y = станции полного маршрута</p>
                </div>
                <div className="text-xs text-slate-300">
                    {mode === 'overlay' ? 'Base idle = amber • Optimized idle = emerald' : 'Сценарий на графике'}
                </div>
            </div>
            <div className="overflow-auto">
                <svg width={width} height={height}>
                    <rect width={width} height={height} fill="#020617" />
                    {Array.from({ length: visibleMinutes / 60 + 1 }).map((_, hour) => {
                        const x = xFor(hour * 60);
                        const main = hour % 6 === 0;
                        const absolute = (20 * 60 + hour * 60) % DAY;
                        const hh = Math.floor(absolute / 60);
                        const mm = absolute % 60;
                        return (
                            <g key={hour}>
                                <line
                                    x1={x}
                                    x2={x}
                                    y1={TOP - 18}
                                    y2={height - BOTTOM + 8}
                                    stroke={main ? '#334155' : '#1e293b'}
                                    strokeDasharray={main ? '0' : '2 8'}
                                />
                                <text x={x + 4} y={46} fill="#94a3b8" fontSize="11">
                                    {`${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`}
                                </text>
                            </g>
                        );
                    })}
                    {stations.map((station: any) => (
                        <g key={station.name}>
                            <line x1={LEFT} x2={width - RIGHT} y1={yFor(station.index)} y2={yFor(station.index)} stroke="#1e293b" />
                            <text x={24} y={yFor(station.index) + 5} fill="#e2e8f0" fontSize="13" fontWeight="600">
                                {station.name}
                            </text>
                        </g>
                    ))}
                    {connectors.filter((connector: any) => connector.endMinute > connector.startMinute).map((connector: any) => {
                        const index = stationIndex.get(connector.stationName);
                        if (index === undefined) return null;
                        return (
                            <line
                                key={`${connector.scenarioType}-${connector.locomotiveId}-${connector.startMinute}`}
                                x1={xFor(connector.startMinute)}
                                x2={xFor(connector.endMinute)}
                                y1={yFor(index)}
                                y2={yFor(index)}
                                stroke={connector.scenarioType === 'base' ? '#f59e0b' : '#10b981'}
                                strokeWidth={connector.scenarioType === 'base' ? 2.5 : 3}
                                strokeDasharray={connector.scenarioType === 'base' ? '10 8' : '4 6'}
                            />
                        );
                    })}
                    {(pair?.trains ?? []).map((trip: any) => {
                        const points = buildPoints(trip);
                        if (points.length < 2) return null;
                        const selected = selectedTrainNo === trip.trainNo;
                        const color = colorForTrip(trip, colorMode);
                        return (
                            <g key={trip.tripId}>
                                <polyline
                                    points={points.map((point) => `${point.x},${point.y}`).join(' ')}
                                    fill="none"
                                    stroke={color}
                                    strokeWidth={selected ? 4.5 : 2.75}
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    opacity={selected || !selectedTrainNo ? 1 : 0.42}
                                    onClick={() => onSelectTrain(trip.trainNo)}
                                    className="cursor-pointer"
                                />
                                <text x={points[points.length - 1].x + 8} y={points[points.length - 1].y - 8} fill={color} fontSize="12" fontWeight="700">
                                    {trip.trainNo}
                                </text>
                            </g>
                        );
                    })}
                </svg>
            </div>
        </div>
    );
}

function StatCard({
    label,
    value,
    note,
    icon: Icon,
    cls,
}: {
    label: string;
    value: string;
    note: string;
    icon: any;
    cls: string;
}) {
    return (
        <div className="rounded-[1.75rem] border border-white/60 bg-white/95 p-5 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
            <div className="mb-3 flex items-center justify-between">
                <span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${cls}`}>
                    <Icon size={18} />
                </span>
                <span className="text-xs font-medium uppercase tracking-[0.24em] text-slate-400">{label}</span>
            </div>
            <div className="text-2xl font-bold text-slate-900">{value}</div>
            <p className="mt-2 text-sm leading-6 text-slate-500">{note}</p>
        </div>
    );
}

function buildRecommendationCards(selectedLocomotive: any) {
    const recommendations: string[] = [];
    const baseIdle = selectedLocomotive?.base?.totalIdleMinutes ?? 0;
    const optimizedIdle = selectedLocomotive?.optimized?.totalIdleMinutes ?? 0;
    if (baseIdle > optimizedIdle) {
        recommendations.push(`Optimized scenario сокращает простой на ${formatMinutes(baseIdle - optimizedIdle)} для выбранного локомотива.`);
    }
    if (selectedLocomotive?.optimized?.idleBlocks?.some((item: any) => item.idleMinutes >= 180)) {
        recommendations.push('Есть длинное idle-окно: его стоит рассматривать как точку следующей переподвязки или переноса смены тяги.');
    }
    (selectedLocomotive?.optimized?.assignments ?? []).forEach((assignment: any) => {
        (assignment.explanation ?? []).forEach((item: string) => recommendations.push(item));
    });
    if (!recommendations.length) {
        recommendations.push('Для этой пары optimizer не ухудшил baseline и оставил explainable safe fallback без лишних перестановок локомотива.');
    }

    return Array.from(new Set(recommendations)).slice(0, 6).map((message, index) => ({
        id: `rec-${index}`,
        title: index === 0 ? 'Главная рекомендация' : `Рекомендация ${index + 1}`,
        message,
    }));
}

export default function PassengerWorkspace({ pageMode }: { pageMode: PageMode }) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [stationId, setStationId] = useState('');
    const [overview, setOverview] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [routeType, setRouteType] = useState<string>('all');
    const [search, setSearch] = useState('');
    const [colorMode, setColorMode] = useState<ColorMode>('train');
    const [threadAction, setThreadAction] = useState<string>('glue');
    const deferredSearch = useDeferredValue(search);
    const overviewRequestRef = useRef<{
        id: number;
        controller: AbortController | null;
        filterKey: string;
    }>({
        id: 0,
        controller: null,
        filterKey: '',
    });
    const previousSelectionRef = useRef<{
        pairKey: string | null;
        trainNo: string | null;
        locomotiveId: string | null;
        scenario: ScenarioMode;
    } | null>(null);

    const pairKeyParam = searchParams.get('pairKey') ?? undefined;
    const locomotiveIdParam = searchParams.get('locomotiveId') ?? undefined;
    const trainNoParam = searchParams.get('trainNo') ?? undefined;
    const scenarioParam = searchParams.get('scenario') ?? undefined;
    const scenarioMode: ScenarioMode =
        scenarioParam === 'base' || scenarioParam === 'optimized' || scenarioParam === 'overlay'
            ? scenarioParam
            : pageMode === 'map'
                ? 'optimized'
                : 'overlay';

    const updateRoute = useCallback((updates: Record<string, string | null | undefined>, source = 'route-update') => {
        const currentParams = new URLSearchParams(searchParams.toString());
        const nextParams = new URLSearchParams(searchParams.toString());
        Object.entries(updates).forEach(([key, value]) => {
            if (typeof value === 'string' && value.length > 0) {
                nextParams.set(key, value);
                return;
            }
            nextParams.delete(key);
        });

        const currentHref = `${pathname}${currentParams.toString() ? `?${currentParams.toString()}` : ''}`;
        const nextHref = `${pathname}${nextParams.toString() ? `?${nextParams.toString()}` : ''}`;
        if (nextHref === currentHref) return;

        const currentSelection = {
            pairKey: currentParams.get('pairKey'),
            trainNo: currentParams.get('trainNo'),
            locomotiveId: currentParams.get('locomotiveId'),
            scenario: currentParams.get('scenario') ?? scenarioMode,
        };
        const nextSelection = {
            pairKey: nextParams.get('pairKey'),
            trainNo: nextParams.get('trainNo'),
            locomotiveId: nextParams.get('locomotiveId'),
            scenario: nextParams.get('scenario') ?? scenarioMode,
        };
        debugGraphState('selection-switch-requested', {
            source,
            previousSelectedTrainId: currentSelection.trainNo,
            nextSelectedTrainId: nextSelection.trainNo,
            previousPairKey: currentSelection.pairKey,
            nextPairKey: nextSelection.pairKey,
            previousRequestId: overviewRequestRef.current.id || null,
            currentRequestId: overviewRequestRef.current.id || null,
            nextHref,
        });
        router.replace(nextHref, { scroll: false });
    }, [pathname, router, scenarioMode, searchParams]);

    const hrefForPage = useCallback((nextPage: PageMode, overrides?: Record<string, string | null | undefined>) => {
        return mergeQueryString(`/${nextPage}`, new URLSearchParams(searchParams.toString()), overrides ?? {});
    }, [searchParams]);

    const loadOverview = useCallback(async (pairKey?: string, locomotiveId?: string, source = 'query-change') => {
        const requestId = overviewRequestRef.current.id + 1;
        const filterKey = buildFilterKey({ pairKey: pairKey ?? null, locomotiveId: locomotiveId ?? null });
        const previousRequestId = overviewRequestRef.current.id || null;
        overviewRequestRef.current.controller?.abort();
        const controller = new AbortController();
        overviewRequestRef.current.controller = controller;
        overviewRequestRef.current.id = requestId;
        overviewRequestRef.current.filterKey = filterKey;

        debugGraphState('overview-fetch-start', {
            source,
            previousRequestId,
            currentRequestId: requestId,
            pairKey: pairKey ?? null,
            locomotiveId: locomotiveId ?? null,
        });

        setLoading(true);
        setError(null);
        setOverview((current: any) => {
            const currentFilterKey = buildFilterKey({
                pairKey: current?.filters?.pairKey ?? null,
                locomotiveId: current?.filters?.locomotiveId ?? null,
            });
            return currentFilterKey === filterKey ? current : null;
        });
        try {
            const data = await getPassengerTimetableOverview(
                { pairKey, locomotiveId },
                { signal: controller.signal },
            );
            if (controller.signal.aborted) {
                debugGraphState('overview-fetch-aborted', {
                    source,
                    currentRequestId: requestId,
                    pairKey: pairKey ?? null,
                    locomotiveId: locomotiveId ?? null,
                });
                return;
            }
            if (overviewRequestRef.current.id !== requestId) {
                debugGraphState('overview-fetch-stale-ignored', {
                    source,
                    previousRequestId,
                    currentRequestId: requestId,
                    activeRequestId: overviewRequestRef.current.id,
                    pairKey: pairKey ?? null,
                    locomotiveId: locomotiveId ?? null,
                });
                return;
            }
            setOverview(data);
            debugGraphState('overview-fetch-applied', {
                source,
                currentRequestId: requestId,
                pairKey: data?.filters?.pairKey ?? pairKey ?? null,
                locomotiveId: data?.filters?.locomotiveId ?? locomotiveId ?? null,
            });
        } catch (requestError) {
            if (
                controller.signal.aborted ||
                (requestError instanceof Error && requestError.name === 'AbortError')
            ) {
                debugGraphState('overview-fetch-aborted', {
                    source,
                    currentRequestId: requestId,
                    pairKey: pairKey ?? null,
                    locomotiveId: locomotiveId ?? null,
                });
                return;
            }
            if (overviewRequestRef.current.id !== requestId) {
                debugGraphState('overview-fetch-stale-ignored', {
                    source,
                    currentRequestId: requestId,
                    activeRequestId: overviewRequestRef.current.id,
                    pairKey: pairKey ?? null,
                    locomotiveId: locomotiveId ?? null,
                });
                return;
            }
            setError(requestError instanceof Error ? requestError.message : 'Не удалось загрузить пассажирский полигон.');
            debugGraphState('overview-fetch-error', {
                source,
                currentRequestId: requestId,
                pairKey: pairKey ?? null,
                locomotiveId: locomotiveId ?? null,
                message: requestError instanceof Error ? requestError.message : 'unknown-error',
            });
        } finally {
            if (overviewRequestRef.current.id === requestId) {
                setLoading(false);
            }
        }
    }, []);

    useEffect(() => {
        let mounted = true;
        (async () => {
            const fromStorage = window.localStorage.getItem('ktz_station_id') ?? '';
            const sid = fromStorage || pickBestStationId((await getStations()).stations);
            if (!mounted) return;
            setStationId(sid);
            if (sid) window.localStorage.setItem('ktz_station_id', sid);
        })();
        return () => {
            mounted = false;
        };
    }, []);

    useEffect(() => {
        void loadOverview(pairKeyParam, locomotiveIdParam, 'query-change');
    }, [loadOverview, locomotiveIdParam, pairKeyParam]);

    useEffect(() => {
        return () => {
            overviewRequestRef.current.controller?.abort();
        };
    }, []);

    useEffect(() => {
        debugGraphState('graph-auto-refresh-disabled', {
            pollingTriggerSource: 'none',
        });
    }, []);

    useEffect(() => {
        if (loading || !overview?.selectedPair) return;
        const currentQueryFilterKey = buildFilterKey({
            pairKey: pairKeyParam ?? null,
            locomotiveId: locomotiveIdParam ?? null,
        });
        const overviewFilterKey = buildFilterKey({
            pairKey: overview.filters?.pairKey ?? null,
            locomotiveId: overview.filters?.locomotiveId ?? null,
        });
        const updates: Record<string, string | null | undefined> = {};
        if ((pairKeyParam ?? '') !== (overview.filters?.pairKey ?? '')) {
            updates.pairKey = overview.filters?.pairKey ?? null;
        }
        if ((locomotiveIdParam ?? '') !== (overview.filters?.locomotiveId ?? '')) {
            updates.locomotiveId = overview.filters?.locomotiveId ?? null;
        }
        const trains = overview.selectedPair?.trains ?? [];
        const safeTrainNo = trains.some((item: any) => item.trainNo === trainNoParam) ? trainNoParam : trains[0]?.trainNo ?? null;
        if ((trainNoParam ?? '') !== (safeTrainNo ?? '')) {
            updates.trainNo = safeTrainNo;
        }
        if (Object.keys(updates).length) {
            debugGraphState('route-normalized', {
                source: 'normalize-selection',
                updates,
                pairKey: overview.filters?.pairKey ?? null,
                locomotiveId: overview.filters?.locomotiveId ?? null,
            });
            updateRoute(updates, 'normalize-selection');
        }
    }, [loading, locomotiveIdParam, overview, pairKeyParam, trainNoParam, updateRoute]);

    const selectedPair = overview?.selectedPair ?? null;
    const selectedTrainNo = selectedPair?.trains?.some((trip: any) => trip.trainNo === trainNoParam)
        ? trainNoParam ?? null
        : selectedPair?.trains?.[0]?.trainNo ?? null;
    const selectedTrain = selectedPair?.trains?.find((trip: any) => trip.trainNo === selectedTrainNo) ?? null;
    const selectedAssignment = scenarioMode === 'base' ? selectedTrain?.baseAssignment : selectedTrain?.optimizedAssignment;
    const selectedLocomotive = selectedPair?.selectedLocomotive ?? null;
    const selectedLocomotiveBaseState = describeLocomotiveChain(selectedLocomotive?.base ?? null);
    const selectedLocomotiveOptimizedState = describeLocomotiveChain(selectedLocomotive?.optimized ?? null);

    useEffect(() => {
        const nextSelection = {
            pairKey: selectedPair?.key ?? overview?.filters?.pairKey ?? null,
            trainNo: selectedTrainNo,
            locomotiveId: overview?.filters?.locomotiveId ?? null,
            scenario: scenarioMode,
        };
        const previousSelection = previousSelectionRef.current;
        if (
            !previousSelection ||
            previousSelection.pairKey !== nextSelection.pairKey ||
            previousSelection.trainNo !== nextSelection.trainNo ||
            previousSelection.locomotiveId !== nextSelection.locomotiveId ||
            previousSelection.scenario !== nextSelection.scenario
        ) {
            debugGraphState('render-selection-committed', {
                previousSelectedTrainId: previousSelection?.trainNo ?? null,
                nextSelectedTrainId: nextSelection.trainNo,
                previousPairKey: previousSelection?.pairKey ?? null,
                nextPairKey: nextSelection.pairKey,
                currentRequestId: overviewRequestRef.current.id || null,
                pollingTriggerSource: 'none',
            });
            previousSelectionRef.current = nextSelection;
        }
    }, [overview, scenarioMode, selectedPair?.key, selectedTrainNo]);

    const pairOptions = (overview?.catalog?.pairs ?? []).filter((pair: any) => routeType === 'all' || pair.routeType === routeType);
    const tripRows = (selectedPair?.tableRows ?? []).filter((row: any) =>
        !deferredSearch ||
        normalize(
            [row.trainNo, row.routeLabel, row.originStation, row.destinationStation, row.base?.locomotiveLabel, row.optimized?.locomotiveLabel]
                .filter(Boolean)
                .join(' '),
        ).includes(normalize(deferredSearch)),
    );
    const selectedTrainStops = (selectedTrain?.stops ?? []).filter((stop: any) =>
        !deferredSearch ||
        normalize([selectedTrain.trainNo, stop.station_name, stop.arrivalLabel, stop.departureLabel, ...(stop.service_operations ?? [])].filter(Boolean).join(' '))
            .includes(normalize(deferredSearch)),
    );
    const locomotiveRows = (selectedPair?.relevantLocomotives ?? []).filter((row: any) =>
        !deferredSearch ||
        normalize([row.label, row.homeStation, row.id].filter(Boolean).join(' ')).includes(normalize(deferredSearch)),
    );

    const graphStats = [
        {
            label: 'Idle base',
            value: formatMinutes(selectedPair?.scenarioMetrics?.base?.totalIdleMinutes),
            note: 'Суммарный простой по выбранной паре до оптимизации.',
            icon: Clock3,
            cls: 'bg-amber-50 text-amber-600',
        },
        {
            label: 'Idle optimized',
            value: formatMinutes(selectedPair?.scenarioMetrics?.optimized?.totalIdleMinutes),
            note: 'Суммарный простой по выбранной паре после оптимизации.',
            icon: BarChart3,
            cls: 'bg-emerald-50 text-emerald-600',
        },
        {
            label: 'Coverage',
            value: `${(selectedPair?.scenarioMetrics?.optimized?.coveragePercent ?? 0).toFixed(1)}%`,
            note: 'Покрытие ниток локомотивами в optimized scenario.',
            icon: Waypoints,
            cls: 'bg-sky-50 text-sky-600',
        },
        {
            label: 'Idle saved',
            value: formatMinutes((selectedPair?.scenarioMetrics?.base?.totalIdleMinutes ?? 0) - (selectedPair?.scenarioMetrics?.optimized?.totalIdleMinutes ?? 0)),
            note: 'Видимый эффект по выбранной паре поездов.',
            icon: Sparkles,
            cls: 'bg-violet-50 text-violet-600',
        },
    ];

    const locomotiveStats = [
        {
            label: 'Локомотивов в паре',
            value: String(locomotiveRows.length),
            note: 'Список ресурсов, реально задействованных в выбранной паре поездов.',
            icon: Train,
            cls: 'bg-slate-100 text-slate-700',
        },
        {
            label: 'Base idle',
            value: formatMinutes(selectedLocomotive?.base?.totalIdleMinutes),
            note: 'Простой выбранного локомотива в baseline.',
            icon: Clock3,
            cls: 'bg-amber-50 text-amber-600',
        },
        {
            label: 'Optimized idle',
            value: formatMinutes(selectedLocomotive?.optimized?.totalIdleMinutes),
            note: 'Простой выбранного локомотива после оптимизации.',
            icon: BarChart3,
            cls: 'bg-emerald-50 text-emerald-600',
        },
        {
            label: 'Idle reduction',
            value: formatMinutes((selectedLocomotive?.base?.totalIdleMinutes ?? 0) - (selectedLocomotive?.optimized?.totalIdleMinutes ?? 0)),
            note: 'Эффект по выбранной цепочке подвязок.',
            icon: Sparkles,
            cls: 'bg-sky-50 text-sky-600',
        },
    ];

    const recommendations = buildRecommendationCards(selectedLocomotive);
    const threadValidation = buildThreadValidation(selectedTrain, overview?.parseIssues?.length ?? 0);
    const selectedThreadAction = THREAD_ACTIONS.find((item) => item.id === threadAction) ?? THREAD_ACTIONS[0];
    const currentPageMeta = PAGE_META[pageMode];
    const graphRenderKey = buildSelectionKey({
        pairKey: selectedPair?.key ?? overview?.filters?.pairKey ?? null,
        trainNo: selectedTrainNo,
        locomotiveId: overview?.filters?.locomotiveId ?? null,
    });

    const handleRouteTypeChange = async (nextRouteType: string) => {
        setRouteType(nextRouteType);
        const allPairs = overview?.catalog?.pairs ?? [];
        const filtered = allPairs.filter((pair: any) => nextRouteType === 'all' || pair.routeType === nextRouteType);
        if (filtered.length && !filtered.some((pair: any) => pair.key === overview?.filters?.pairKey)) {
            updateRoute({
                pairKey: filtered[0].key,
                locomotiveId: null,
                trainNo: null,
            }, 'route-type-change');
        }
    };

    const renderHeader = () => (
        <header className="topbar border-b border-slate-200/80 bg-[linear-gradient(135deg,#f8fafc_0%,#ffffff_48%,#ecfeff_100%)]">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0">
                    <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        <Layers3 size={12} />
                        Passenger Operations Workspace
                    </div>
                    <div className="mt-4 flex items-center gap-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-950 via-slate-800 to-sky-700 text-white shadow-[0_14px_24px_rgba(15,23,42,0.18)]">
                            {pageMode === 'graph' ? <Route size={20} /> : pageMode === 'bindings' ? <Link2 size={20} /> : <MapPinned size={20} />}
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-slate-950">{currentPageMeta.title}</h1>
                            <p className="mt-1 max-w-4xl text-sm leading-6 text-slate-500">{currentPageMeta.description}</p>
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    {PAGE_TABS.map((tab) => {
                        const Icon = tab.icon;
                        const active = tab.key === pageMode;
                        return (
                            <Link
                                key={tab.key}
                                href={hrefForPage(tab.key)}
                                className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold transition ${
                                    active
                                        ? 'bg-slate-950 text-white shadow-[0_10px_22px_rgba(15,23,42,0.16)]'
                                        : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-950'
                                }`}
                            >
                                <Icon size={15} />
                                {tab.label}
                            </Link>
                        );
                    })}
                    <button
                        onClick={() => loadOverview(overview?.filters?.pairKey, overview?.filters?.locomotiveId ?? undefined, 'manual-refresh')}
                        className="btn-primary"
                        disabled={loading}
                    >
                        {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                        Обновить
                    </button>
                </div>
            </div>
        </header>
    );

    const renderControlBar = () => (
        <section className="rounded-[2rem] border border-slate-200 bg-white px-5 py-4 shadow-[0_12px_32px_rgba(15,23,42,0.04)]">
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-[220px_minmax(260px,1fr)_220px_220px_minmax(240px,1fr)]">
                <select
                    className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:ring-2 focus:ring-sky-100"
                    value={routeType}
                    onChange={(event) => void handleRouteTypeChange(event.target.value)}
                >
                    <option value="all">Все типы маршрутов</option>
                    {(overview?.catalog?.routeTypes ?? []).map((item: any) => (
                        <option key={item.routeType} value={item.routeType}>
                            {`${item.routeTypeLabel} (${item.pairCount})`}
                        </option>
                    ))}
                </select>

                <select
                    className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:ring-2 focus:ring-sky-100"
                    value={overview?.filters?.pairKey ?? ''}
                    onChange={(event) =>
                        updateRoute({
                            pairKey: event.target.value,
                            locomotiveId: null,
                            trainNo: null,
                        }, 'pair-select')
                    }
                >
                    {pairOptions.map((pair: any) => (
                        <option key={pair.key} value={pair.key}>
                            {`${pair.displayPair} • ${pair.routeLabel}`}
                        </option>
                    ))}
                </select>

                {pageMode === 'bindings' ? (
                    <select
                        className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:ring-2 focus:ring-sky-100"
                        value={overview?.filters?.locomotiveId ?? ''}
                        onChange={(event) => updateRoute({ locomotiveId: event.target.value || null }, 'locomotive-select')}
                    >
                        {(selectedPair?.relevantLocomotives ?? []).map((item: any) => (
                            <option key={item.id} value={item.id}>{`${item.label} • idle Δ ${formatMinutes(item.improvementMinutes)}`}</option>
                        ))}
                    </select>
                ) : (
                    <select
                        className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:ring-2 focus:ring-sky-100"
                        value={selectedTrainNo ?? ''}
                        onChange={(event) => updateRoute({ trainNo: event.target.value || null }, 'train-select')}
                    >
                        {(selectedPair?.trains ?? []).map((train: any) => (
                            <option key={train.tripId} value={train.trainNo}>{`Поезд ${train.trainNo} • ${train.originStation} → ${train.destinationStation}`}</option>
                        ))}
                    </select>
                )}

                <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3">
                    {(['overlay', 'base', 'optimized'] as ScenarioMode[])
                        .filter((item) => pageMode !== 'map' || item !== 'overlay')
                        .map((item) => (
                            <button
                                key={item}
                                onClick={() => updateRoute({ scenario: item }, 'scenario-toggle')}
                                className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                                    scenarioMode === item
                                        ? 'bg-slate-950 text-white'
                                        : 'text-slate-500 hover:bg-white hover:text-slate-900'
                                }`}
                            >
                                {item === 'overlay' ? 'Overlay' : item === 'base' ? 'Base' : 'Optimized'}
                            </button>
                        ))}
                </div>

                <div className="relative">
                    <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Поезд, станция, локомотив"
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm text-slate-700 outline-none transition focus:ring-2 focus:ring-sky-100"
                    />
                </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5">{`Опер. сутки ${overview?.serviceDayStart ?? '20:00'} → 20:00`}</span>
                <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5">{`Pairs ${overview?.network?.totalPairs ?? 0}`}</span>
                <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5">{`Trips ${overview?.network?.totalTrips ?? 0}`}</span>
                <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5">{`Cursor ${operationalClockLabel(toOperationalNowMinute())}`}</span>
            </div>
        </section>
    );

    const renderGraphView = () => (
        <PassengerOperationalGraph
            key={graphRenderKey}
            pair={selectedPair}
            selectedTrain={selectedTrain}
            selectedTrainNo={selectedTrainNo}
            tripRows={tripRows}
            selectedTrainStops={selectedTrainStops}
            graphStats={graphStats}
            threadValidation={threadValidation}
            threadActions={THREAD_ACTIONS}
            threadAction={threadAction}
            onThreadActionChange={setThreadAction}
            threadActionMessage={buildThreadActionMessage(threadAction, selectedTrain)}
            insights={overview?.network?.insights ?? []}
            scenarioMode={scenarioMode}
            onScenarioModeChange={(scenario) => updateRoute({ scenario }, 'graph-scenario-toggle')}
            colorMode={colorMode}
            onColorModeChange={setColorMode}
            onSelectTrain={(trainNo) => updateRoute({ trainNo }, 'graph-train-select')}
            hrefForPage={hrefForPage}
            selectedLocomotiveId={overview?.filters?.locomotiveId ?? null}
        />
    );

    const renderBindingsView = () => (
        <PassengerBindingsWorkbench
            pair={selectedPair}
            locomotives={locomotiveRows}
            selectedLocomotiveId={overview?.filters?.locomotiveId ?? null}
            selectedLocomotive={selectedLocomotive}
            recommendations={recommendations}
            scenarioMode={scenarioMode}
            hrefForPage={hrefForPage}
            onSelectLocomotive={(locomotiveId) => updateRoute({ locomotiveId }, 'locomotive-workbench-select')}
        />
    );

    const renderMapView = () => (
        <div className="space-y-6">
            <section className="grid grid-cols-1 gap-4 xl:grid-cols-4">
                <StatCard
                    label="Train"
                    value={selectedTrain ? `№${selectedTrain.trainNo}` : '—'}
                    note={selectedTrain ? `${selectedTrain.originStation} → ${selectedTrain.destinationStation}` : 'Выбери поезд для карты полного маршрута.'}
                    icon={Train}
                    cls="bg-slate-100 text-slate-700"
                />
                <StatCard
                    label="Duration"
                    value={formatMinutes(selectedTrain?.durationMinutes)}
                    note="Длительность маршрута по операционным суткам 20:00–20:00."
                    icon={Clock3}
                    cls="bg-sky-50 text-sky-600"
                />
                <StatCard
                    label="Stations"
                    value={String(selectedTrain?.stationSequenceCount ?? 0)}
                    note="Количество точек от A до B по полной нитке."
                    icon={Waypoints}
                    cls="bg-emerald-50 text-emerald-600"
                />
                <StatCard
                    label="Locomotive"
                    value={selectedAssignment?.locomotiveLabel ?? 'Нет подвязки'}
                    note="Локомотив выбранного сценария, связанный с картой поезда."
                    icon={Link2}
                    cls="bg-violet-50 text-violet-600"
                />
            </section>

            <PassengerRouteMap
                train={selectedTrain}
                assignment={selectedAssignment}
                scenarioLabel={scenarioMode === 'base' ? 'Baseline scenario' : 'Optimized scenario'}
                scenarioMode={scenarioMode === 'base' ? 'base' : 'optimized'}
                hrefForPage={hrefForPage}
                selectedLocomotiveId={overview?.filters?.locomotiveId ?? null}
            />
        </div>
    );

    return (
        <div className="flex min-h-screen">
            <Sidebar stationId={stationId} />
            <div className="main-wrapper flex-1">
                {renderHeader()}
                <main className="page-content space-y-6">
                    {renderControlBar()}

                    {error ? (
                        <section className="rounded-[1.75rem] border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
                            {error}
                        </section>
                    ) : null}

                    {!selectedPair && loading ? (
                        <section className="rounded-[1.75rem] border border-slate-200 bg-white px-5 py-10 text-center text-slate-500">
                            Загрузка пассажирского полигона...
                        </section>
                    ) : null}

                    {selectedPair ? (
                        <>
                            {pageMode === 'graph' ? renderGraphView() : null}
                            {pageMode === 'bindings' ? renderBindingsView() : null}
                            {pageMode === 'map' ? renderMapView() : null}
                        </>
                    ) : null}
                </main>
            </div>
        </div>
    );
}


