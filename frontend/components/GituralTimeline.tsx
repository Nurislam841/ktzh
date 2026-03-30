'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, Minimize2, Minus, Plus, RotateCcw } from 'lucide-react';

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

type TrainWindow = {
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

type StationItem = {
    name: string;
    distanceKm: number | null;
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
    arrivalOffsetMinutes: number | null;
    departureOffsetMinutes: number | null;
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
    arrivalAstanaOffsetMinutes: number | null;
    departureAstanaOffsetMinutes: number | null;
};

type StopOperation = {
    trainNumber: string;
    station: string;
    stationTime: string | null;
    stationOffsetMinutes: number | null;
    type: 'LOCO_CHANGE' | 'TURNAROUND';
    label: string;
    details: string;
};

const DAY = 24 * 60;
const HOUR_WIDTH = 72;
const LEFT = 188;
const RIGHT = 72;
const TOP = 96;
const BOTTOM = 84;
const ROW = 116;
const EDGE = 640;
const MIN_ZOOM = 0.65;
const MAX_ZOOM = 2.4;
const ZOOM_STEP = 0.2;
const ORDER = ['Кокшетау', 'Есиль', 'Астана', 'Екибастуз', 'Караганда'];
const COLORS = ['#38bdf8', '#22c55e', '#f97316', '#a855f7', '#facc15', '#2dd4bf', '#fb7185', '#60a5fa', '#34d399', '#f43f5e'];

function colorFromTrain(trainNumber: string) {
    let hash = 0;
    for (let i = 0; i < trainNumber.length; i += 1) hash = trainNumber.charCodeAt(i) + ((hash << 5) - hash);
    return COLORS[Math.abs(hash) % COLORS.length];
}

function minuteLabel(offsetMinutes: number) {
    const totalMinutes = (20 * 60 + offsetMinutes) % (24 * 60);
    const hh = Math.floor(totalMinutes / 60);
    const mm = totalMinutes % 60;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function startOf(stop: StopRecord) {
    return typeof stop.arrivalOffsetMinutes === 'number' ? stop.arrivalOffsetMinutes : stop.departureOffsetMinutes;
}

function endOf(stop: StopRecord) {
    return typeof stop.departureOffsetMinutes === 'number' ? stop.departureOffsetMinutes : stop.arrivalOffsetMinutes;
}

function buildPoints(stops: StopRecord[], stationIndex: Map<string, number>, xFor: (minutes: number) => number, yFor: (index: number) => number) {
    const points: Array<{ x: number; y: number }> = [];
    stops.forEach((stop) => {
        const idx = stationIndex.get(stop.station);
        const start = startOf(stop);
        const end = endOf(stop);
        if (idx === undefined) return;
        if (typeof start === 'number') points.push({ x: xFor(start), y: yFor(idx) });
        if (typeof end === 'number') points.push({ x: xFor(end), y: yFor(idx) });
    });
    return points.filter((point, index, array) => index === 0 || array[index - 1].x !== point.x || array[index - 1].y !== point.y);
}

export default function GituralTimeline({
    trains,
    stations,
    bindings,
    turnarounds,
    highlightedPair,
    stopOperations,
    selectedTrainNumber,
    onSelectTrain,
    sourceTrainsCount,
    aggregationNote,
    serviceDayStart = '20:00',
}: {
    trains: TrainWindow[];
    stations: StationItem[];
    bindings: BindingEvent[];
    turnarounds: TurnaroundRecord[];
    highlightedPair?: string;
    stopOperations: StopOperation[];
    selectedTrainNumber?: string;
    onSelectTrain?: (trainNumber: string) => void;
    sourceTrainsCount?: number;
    aggregationNote?: string;
    serviceDayStart?: string;
}) {
    const [expanded, setExpanded] = useState(false);
    const [visibleMinutes, setVisibleMinutes] = useState(DAY * 2);
    const [zoomLevel, setZoomLevel] = useState(1);
    const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
    const viewportRef = useRef<HTMLDivElement | null>(null);
    const pendingCenterMinutesRef = useRef<number | null>(null);

    const orderedStations = useMemo(() => [...stations].sort((a, b) => {
        const left = ORDER.indexOf(a.name);
        const right = ORDER.indexOf(b.name);
        if (left >= 0 && right >= 0) return left - right;
        if (left >= 0) return -1;
        if (right >= 0) return 1;
        return a.name.localeCompare(b.name, 'ru');
    }), [stations]);

    const stationIndex = useMemo(() => new Map(orderedStations.map((station, index) => [station.name, index])), [orderedStations]);

    const maxMinutes = useMemo(() => {
        const values: number[] = [];
        trains.forEach((train) => train.windowStops.forEach((stop) => {
            if (typeof stop.arrivalOffsetMinutes === 'number') values.push(stop.arrivalOffsetMinutes);
            if (typeof stop.departureOffsetMinutes === 'number') values.push(stop.departureOffsetMinutes);
        }));
        bindings.forEach((item) => {
            if (typeof item.arrivalOffsetMinutes === 'number') values.push(item.arrivalOffsetMinutes);
            if (typeof item.departureOffsetMinutes === 'number') values.push(item.departureOffsetMinutes);
        });
        turnarounds.forEach((item) => {
            if (typeof item.arrivalAstanaOffsetMinutes === 'number') values.push(item.arrivalAstanaOffsetMinutes);
            if (typeof item.departureAstanaOffsetMinutes === 'number') values.push(item.departureAstanaOffsetMinutes);
        });
        stopOperations.forEach((item) => {
            if (typeof item.stationOffsetMinutes === 'number') values.push(item.stationOffsetMinutes);
        });
        return values.length ? Math.max(...values) : DAY;
    }, [bindings, stopOperations, trains, turnarounds]);

    useEffect(() => {
        const base = Math.max(DAY, Math.ceil((maxMinutes + 180) / DAY) * DAY);
        setVisibleMinutes((current) => current < base ? base : current);
    }, [maxMinutes]);

    useEffect(() => {
        if (!expanded) return undefined;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setExpanded(false);
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [expanded]);

    useEffect(() => {
        const viewport = viewportRef.current;
        if (!viewport) return undefined;

        const updateSize = () => {
            setViewportSize({
                width: viewport.clientWidth,
                height: viewport.clientHeight,
            });
        };

        updateSize();

        if (typeof ResizeObserver === 'undefined') {
            window.addEventListener('resize', updateSize);
            return () => window.removeEventListener('resize', updateSize);
        }

        const observer = new ResizeObserver(() => updateSize());
        observer.observe(viewport);
        return () => observer.disconnect();
    }, [expanded]);

    const stationBands = Math.max(orderedStations.length - 1, 1);
    const usableViewportWidth = Math.max(viewportSize.width - 24, 0);
    const expandedBaseHourWidth = usableViewportWidth ? Math.max(42, Math.min(96, usableViewportWidth / 24)) : HOUR_WIDTH;
    const baseHourWidth = expanded ? expandedBaseHourWidth : HOUR_WIDTH;
    const hourWidth = baseHourWidth * zoomLevel;
    const rowHeight = expanded && viewportSize.height
        ? Math.min(176, Math.max(ROW, (viewportSize.height - TOP - BOTTOM - 36) / stationBands))
        : ROW;
    const contentWidth = LEFT + (visibleMinutes / 60) * hourWidth + RIGHT;
    const width = expanded ? Math.max(contentWidth, LEFT + RIGHT + usableViewportWidth) : contentWidth;
    const contentHeight = TOP + stationBands * rowHeight + BOTTOM;
    const height = expanded ? Math.max(contentHeight, viewportSize.height) : contentHeight;
    const hours = Math.floor(visibleMinutes / 60);
    const days = Math.ceil(visibleMinutes / DAY);
    const xFor = (minutes: number) => LEFT + (minutes / 60) * hourWidth;
    const yFor = (index: number) => TOP + index * rowHeight;
    const zoomPercent = Math.round(zoomLevel * 100);

    const onScroll = () => {
        const viewport = viewportRef.current;
        if (!viewport) return;
        if (viewport.scrollLeft + viewport.clientWidth >= viewport.scrollWidth - EDGE) {
            setVisibleMinutes((current) => current + DAY);
        }
    };

    const rememberViewportCenter = () => {
        const viewport = viewportRef.current;
        if (!viewport) return;
        const centerMinutes = ((viewport.scrollLeft + viewport.clientWidth / 2 - LEFT) / hourWidth) * 60;
        pendingCenterMinutesRef.current = Number.isFinite(centerMinutes) ? Math.max(0, centerMinutes) : 0;
    };

    const changeZoom = (direction: 'in' | 'out' | 'reset') => {
        rememberViewportCenter();
        setZoomLevel((current) => {
            if (direction === 'reset') return 1;
            const delta = direction === 'in' ? ZOOM_STEP : -ZOOM_STEP;
            return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number((current + delta).toFixed(2))));
        });
    };

    useEffect(() => {
        const viewport = viewportRef.current;
        const centerMinutes = pendingCenterMinutesRef.current;
        if (!viewport || centerMinutes === null) return;
        const nextScrollLeft = Math.max(0, LEFT + (centerMinutes / 60) * hourWidth - viewport.clientWidth / 2);
        viewport.scrollLeft = nextScrollLeft;
        pendingCenterMinutesRef.current = null;
    }, [expanded, hourWidth, visibleMinutes, width]);

    const shellClass = expanded
        ? 'fixed inset-0 z-[70] flex h-[100dvh] flex-col overflow-hidden bg-[#02040a] shadow-[0_30px_80px_rgba(0,0,0,0.75)]'
        : 'relative flex flex-col overflow-hidden rounded-[32px] border border-cyan-400/15 bg-[#02040a] shadow-[0_24px_60px_rgba(2,6,23,0.28)]';

    return (
        <>
            {expanded && <div className="fixed inset-0 z-[60] bg-slate-950/80 backdrop-blur-sm" onClick={() => setExpanded(false)} />}
            <div className={shellClass}>
                <div className={`flex flex-col gap-4 border-b border-white/10 px-6 py-5 lg:flex-row lg:items-start lg:justify-between ${expanded ? 'pb-4 pt-6' : ''}`}>
                    <div className="max-w-3xl">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">
                                {serviceDayStart} → вправо
                            </span>
                            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-300">
                                Ниток на схеме: {trains.length}{typeof sourceTrainsCount === 'number' ? ` из ${sourceTrainsCount}` : ''}
                            </span>
                            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-300">
                                Видно: {Math.round(visibleMinutes / 60)} ч
                            </span>
                        </div>
                        <h2 className="mt-3 text-xl font-semibold text-white">График узла Астаны в отдельном окне</h2>
                        <p className="mt-2 text-sm leading-6 text-slate-300">
                            Малые станции скрыты только на этой визуализации. Оставлены пять опорных точек узла:
                            {' '}Кокшетау, Есиль, Астана, Екибастуз и Караганда.
                        </p>
                        {aggregationNote && <p className="mt-2 text-sm leading-6 text-slate-400">{aggregationNote}</p>}
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-300">
                            {zoomPercent}%
                        </span>
                        <button
                            type="button"
                            onClick={() => changeZoom('out')}
                            disabled={zoomLevel <= MIN_ZOOM}
                            className="btn-secondary border-white/15 bg-white/5 text-slate-100 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            <Minus size={14} />
                            Отдалить
                        </button>
                        <button
                            type="button"
                            onClick={() => changeZoom('reset')}
                            disabled={zoomLevel === 1}
                            className="btn-secondary border-white/15 bg-white/5 text-slate-100 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            <RotateCcw size={14} />
                            100%
                        </button>
                        <button
                            type="button"
                            onClick={() => changeZoom('in')}
                            disabled={zoomLevel >= MAX_ZOOM}
                            className="btn-secondary border-white/15 bg-white/5 text-slate-100 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            <Plus size={14} />
                            Приблизить
                        </button>
                        <button type="button" onClick={() => setVisibleMinutes((current) => current + DAY)} className="btn-secondary border-white/15 bg-white/5 text-slate-100 hover:bg-white/10">
                            <Plus size={14} />
                            Ещё сутки
                        </button>
                        <button type="button" onClick={() => setExpanded((current) => !current)} className="btn-secondary border-white/15 bg-white/5 text-slate-100 hover:bg-white/10">
                            {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                            {expanded ? 'Свернуть' : 'Открыть окно'}
                        </button>
                    </div>
                </div>

                <div ref={viewportRef} onScroll={onScroll} className={expanded ? 'min-h-0 flex-1 overflow-auto px-4 pb-4' : 'max-h-[82vh] overflow-auto'}>
                    <svg width={width} height={height} className="block min-w-full">
                        <rect x="0" y="0" width={width} height={height} fill="#02040a" />
                        <rect x="14" y="14" width={width - 28} height={height - 28} rx="28" fill="none" stroke="#1e293b" strokeWidth="1.5" />

                        {Array.from({ length: days + 1 }).map((_, dayIndex) => {
                            const x = xFor(dayIndex * DAY);
                            return (
                                <g key={`day-${dayIndex}`}>
                                    <line x1={x} y1={30} x2={x} y2={height - 28} stroke="#94a3b8" strokeWidth="1.5" opacity="0.55" />
                                    {dayIndex < days && (
                                        <text x={x + 12} y={44} fontSize="11" fill="#e2e8f0" fontWeight="700">
                                            {`Сутки +${dayIndex}`}
                                        </text>
                                    )}
                                </g>
                            );
                        })}

                        {Array.from({ length: hours + 1 }).map((_, hourIndex) => {
                            const minutes = hourIndex * 60;
                            const x = xFor(minutes);
                            const dayBoundary = minutes % DAY === 0;
                            const major = minutes % (6 * 60) === 0;
                            const showLabel = true;
                            return (
                                <g key={`hour-${hourIndex}`}>
                                    <line x1={x} y1={56} x2={x} y2={height - 28} stroke={dayBoundary ? '#64748b' : major ? '#334155' : '#172033'} strokeWidth={dayBoundary ? 1.5 : major ? 1.1 : 0.8} />
                                    {showLabel && hourIndex < hours && <text x={x + 6} y={76} fontSize="11" fill={dayBoundary ? '#f8fafc' : '#94a3b8'}>{minuteLabel(minutes)}</text>}
                                </g>
                            );
                        })}

                        {orderedStations.map((station, index) => {
                            const y = yFor(index);
                            const isAstana = station.name === 'Астана';
                            return (
                                <g key={station.name}>
                                    {isAstana && <rect x={LEFT} y={y - 34} width={width - LEFT - 36} height={68} rx="22" fill="#0c4a6e" opacity="0.18" />}
                                    <line x1={LEFT} y1={y} x2={width - 32} y2={y} stroke={isAstana ? '#38bdf8' : '#334155'} strokeWidth={isAstana ? 1.5 : 1} strokeDasharray={isAstana ? '0' : '5 7'} />
                                    <rect x="22" y={y - 28} width="128" height="40" rx="20" fill={isAstana ? '#082f49' : '#0f172a'} stroke={isAstana ? '#38bdf8' : '#1e293b'} />
                                    <text x="40" y={y - 10} fontSize="13" fill="#f8fafc" fontWeight="700">{station.name}</text>
                                    <text x="40" y={y + 2} fontSize="10" fill={isAstana ? '#7dd3fc' : '#94a3b8'}>{isAstana ? 'Центральный узел' : 'Плечо'}</text>
                                </g>
                            );
                        })}

                        {trains.map((train) => {
                            const points = buildPoints(train.windowStops, stationIndex, xFor, yFor);
                            if (!points.length) return null;
                            const color = colorFromTrain(train.trainNumber);
                            const pair = train.sheetName.match(/(\d{1,4})\s*-\s*(\d{1,4})/);
                            const pairKey = pair ? `${pair[1].padStart(3, '0')}/${pair[2].padStart(3, '0')}` : train.trainNumber;
                            const selected = selectedTrainNumber === train.trainNumber;
                            const highlighted = !highlightedPair || highlightedPair === pairKey;
                            const first = points[0];
                            return (
                                <g key={`${train.sheetName}-${train.direction}-${train.trainNumber}`} opacity={highlighted ? (selected ? 1 : 0.9) : 0.14} onClick={() => onSelectTrain?.(train.trainNumber)} style={{ cursor: onSelectTrain ? 'pointer' : 'default' }}>
                                    {points.length > 1 ? (
                                        <>
                                            <polyline fill="none" stroke={color} strokeWidth={selected ? 9 : 7} opacity="0.22" strokeLinejoin="round" strokeLinecap="round" points={points.map((point) => `${point.x},${point.y}`).join(' ')} />
                                            <polyline fill="none" stroke={color} strokeWidth={selected ? 4.3 : 3} strokeLinejoin="round" strokeLinecap="round" points={points.map((point) => `${point.x},${point.y}`).join(' ')} />
                                        </>
                                    ) : (
                                        <circle cx={first.x} cy={first.y} r={selected ? 6 : 4} fill={color} />
                                    )}
                                    {points.map((point, index) => <circle key={`${train.trainNumber}-${index}`} cx={point.x} cy={point.y} r={selected ? 4 : 2.8} fill={color} />)}
                                    {train.windowStops.map((stop) => {
                                        const idx = stationIndex.get(stop.station);
                                        const start = startOf(stop);
                                        const end = endOf(stop);
                                        if (idx === undefined || typeof start !== 'number' || typeof end !== 'number') return null;
                                        const dwell = Math.max(end - start, stop.dwellMinutes ?? 0);
                                        if (dwell < 8) return null;
                                        return (
                                            <g key={`${train.trainNumber}-${stop.station}-${start}`}>
                                                <rect x={xFor(start)} y={yFor(idx) - 18} width={Math.max(18, xFor(end) - xFor(start))} height={16} rx={8} fill={color} opacity="0.2" />
                                                <text x={xFor(start) + 6} y={yFor(idx) - 7} fontSize="9" fill={color} fontWeight="700">{`${dwell}м`}</text>
                                            </g>
                                        );
                                    })}
                                    <rect x={first.x + 10} y={first.y - 32} width={Math.max(48, `${pairKey} ${train.trainNumber}`.length * 7.2)} height={18} rx={9} fill="#02040a" stroke={color} opacity="0.9" />
                                    <text x={first.x + 18} y={first.y - 19} fontSize="10" fill={color} fontWeight="700">{`${pairKey} · ${train.trainNumber}`}</text>
                                </g>
                            );
                        })}

                        {stopOperations.map((item, index) => {
                            const stationIdx = stationIndex.get(item.station);
                            if (stationIdx === undefined || typeof item.stationOffsetMinutes !== 'number') return null;
                            const fill = item.type === 'LOCO_CHANGE' ? '#f59e0b' : '#10b981';
                            const x = xFor(item.stationOffsetMinutes);
                            const y = yFor(stationIdx);
                            return (
                                <g key={`operation-${index}`}>
                                    <rect x={x - 19} y={y - 31} width={38} height={14} rx={7} fill={fill} opacity="0.95" />
                                    <text x={x} y={y - 21} fontSize="8" fill="#02040a" textAnchor="middle" fontWeight="800">{item.label}</text>
                                </g>
                            );
                        })}

                        {turnarounds.map((item, index) => {
                            if (typeof item.arrivalAstanaOffsetMinutes !== 'number' || typeof item.departureAstanaOffsetMinutes !== 'number') return null;
                            const x1 = xFor(item.arrivalAstanaOffsetMinutes);
                            const x2 = xFor(item.departureAstanaOffsetMinutes);
                            const y = height - 34 - (index % 3) * 14;
                            return (
                                <g key={`turnaround-${index}`}>
                                    <line x1={x1} y1={y} x2={x2} y2={y} stroke="#2dd4bf" strokeWidth="2" strokeDasharray="6 5" opacity="0.9" />
                                    <text x={Math.min(x1, x2) + 6} y={y - 5} fontSize="9" fill="#5eead4">{`${item.arrivalTrainNumber ?? '—'}→${item.departureTrainNumber ?? '—'}`}</text>
                                </g>
                            );
                        })}
                    </svg>
                </div>
            </div>
        </>
    );
}
