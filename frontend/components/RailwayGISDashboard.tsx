'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Circle, CircleMarker, ImageOverlay, MapContainer, Polyline, Popup, TileLayer, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { AlertTriangle, GitBranch, Layers3, MapPinned, Maximize2, Minimize2, Radar, Train } from 'lucide-react';
import type { GituralLocomotiveTableRow } from './GituralLocomotiveTable';

export type GisAtlasStationPoint = {
    id: string;
    name: string;
    latitude: number;
    longitude: number;
    kind: 'station' | 'node';
    shoulderKeys: string[];
    shoulders: string[];
    department: string | null;
    status: 'ok' | 'warning' | 'critical' | 'missing';
    totalRows: number;
    criticalRows: number;
    warningRows: number;
    missingRows: number;
    topRow: GituralLocomotiveTableRow | null;
    topIssue: string | null;
    coordinateSource: 'catalog' | 'interpolated';
    sortIndexByShoulder?: Record<string, number>;
};

export type GisAtlasEventPoint = {
    id: string;
    stationName: string;
    latitude: number;
    longitude: number;
    status: 'ok' | 'warning' | 'critical' | 'missing';
    eventType: 'оборот' | 'перепростой' | 'вне плеча' | 'неполные данные' | 'событие';
    department: string | null;
    shoulder: string | null;
    row: GituralLocomotiveTableRow;
};

export type GisAtlasShoulderLine = {
    id: string;
    label: string;
    department: string;
    status: 'ok' | 'warning' | 'critical' | 'missing';
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
    status: 'ok' | 'warning' | 'critical' | 'missing';
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
    locomotiveTable: GituralLocomotiveTableRow[];
};

const KAZAKHSTAN_BOUNDS: [[number, number], [number, number]] = [
    [40.0, 46.0],
    [56.0, 89.0],
];

const ASTANA_SECTOR_BOUNDS: [[number, number], [number, number]] = [
    [49.2, 66.0],
    [53.9, 77.4],
];

const ASTANA_KEY_LABELS = new Set([
    'Астана-1',
    'Нурлы жол',
    'Сороковая',
    'Есиль',
    'Атбасар',
    'Шортанды',
    'Макинка',
    'Кокшетау',
    'Ерейментау',
    'Екибастуз I',
    'Павлодар',
    'Аршалы',
    'Караганда-Сорт',
]);

const STATUS_META = {
    ok: {
        color: '#22c55e',
        fill: '#dcfce7',
        label: 'Норма',
    },
    warning: {
        color: '#f59e0b',
        fill: '#fef3c7',
        label: 'Риск',
    },
    critical: {
        color: '#ef4444',
        fill: '#ffe4e6',
        label: 'Перепростой',
    },
    missing: {
        color: '#64748b',
        fill: '#e2e8f0',
        label: 'Нет данных',
    },
} as const;

function isSelectedRow(row: GituralLocomotiveTableRow, selectedPair?: string, selectedTrainNumber?: string) {
    if (selectedPair && row.pairKey === selectedPair) return true;
    if (!selectedTrainNumber) return false;
    return row.arrivalTrainNumber === selectedTrainNumber || row.departureTrainNumber === selectedTrainNumber;
}

function formatMinutes(value: number | null) {
    if (typeof value !== 'number') return '—';
    const hours = Math.floor(value / 60);
    const minutes = value % 60;
    if (!hours) return `${minutes}м`;
    return `${hours}ч ${String(minutes).padStart(2, '0')}м`;
}

function PopupField({ label, value, accent }: { label: string; value: string; accent?: string }) {
    return (
        <div className="grid grid-cols-[118px_minmax(0,1fr)] gap-3 border-b border-slate-100 py-1.5 last:border-b-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</div>
            <div className={`text-sm font-semibold ${accent ?? 'text-slate-900'}`}>{value}</div>
        </div>
    );
}

function MapViewController({ viewMode, resizeKey }: { viewMode: 'astana' | 'country'; resizeKey: number }) {
    const map = useMap();

    useEffect(() => {
        map.invalidateSize(false);
        map.fitBounds(viewMode === 'astana' ? ASTANA_SECTOR_BOUNDS : KAZAKHSTAN_BOUNDS, {
            animate: false,
            padding: [24, 24],
        });
    }, [map, resizeKey, viewMode]);

    return null;
}

function EventPopupCard({ point }: { point: GisAtlasEventPoint }) {
    const row = point.row;
    const meta = STATUS_META[row.status];
    return (
        <div className="min-w-[320px] max-w-[360px]">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Событие на карте</div>
                        <div className="mt-1 text-lg font-bold text-slate-950">{point.stationName}</div>
                        <div className="mt-1 text-xs text-slate-500">{point.department ?? 'Отделение не определено'} · {point.eventType}</div>
                    </div>
                    <span className="rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ color: meta.color, backgroundColor: meta.fill }}>
                        {row.statusLabel}
                    </span>
                </div>

                <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50/80 px-3 py-2 text-xs text-slate-500">
                    Popup собран из той же строки, что и нижняя таблица локомотивных состояний.
                </div>

                <div className="mt-4">
                    <PopupField label="Плечо" value={row.shoulder ?? '—'} />
                    <PopupField label="Локомотив" value={row.locomotiveNumber ?? '—'} />
                    <PopupField label="Прибытие" value={row.arrival ?? '—'} />
                    <PopupField label="Машинист" value={row.driver ?? '—'} />
                    <PopupField label="Плечо машиниста" value={row.driverShoulder ?? '—'} />
                    <PopupField label="Явка" value={row.reporting ?? '—'} />
                    <PopupField label="Отправление" value={row.departure ?? '—'} />
                    <PopupField label="Простой" value={formatMinutes(row.dwellMinutes)} />
                    <PopupField label="Норма" value={formatMinutes(row.normMinutes)} />
                    <PopupField label="Перепростой" value={formatMinutes(row.overDwellMinutes)} accent={(row.overDwellMinutes ?? 0) > 0 ? 'text-rose-700' : 'text-slate-900'} />
                    <PopupField label="Оборотчик" value={row.isTurner ? 'Да' : 'Нет'} />
                    <PopupField label="Дополнительно" value={row.issues[0] ?? 'Без критических замечаний'} accent="text-slate-600" />
                </div>
            </div>
        </div>
    );
}

function StationPopupCard({ point }: { point: GisAtlasStationPoint }) {
    const meta = STATUS_META[point.status];
    return (
        <div className="min-w-[320px] max-w-[360px]">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                            {point.kind === 'node' ? 'Узел / станция' : 'Станция / точка'}
                        </div>
                        <div className="mt-1 text-lg font-bold text-slate-950">{point.name}</div>
                        <div className="mt-1 text-xs text-slate-500">{point.department ?? 'Отделение не определено'}</div>
                    </div>
                    <span className="rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ color: meta.color, backgroundColor: meta.fill }}>
                        {meta.label}
                    </span>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-2xl border border-slate-100 bg-slate-50 px-2 py-2">
                        <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Связанных</div>
                        <div className="mt-1 text-lg font-bold text-slate-900">{point.totalRows}</div>
                    </div>
                    <div className="rounded-2xl border border-rose-100 bg-rose-50 px-2 py-2">
                        <div className="text-[11px] uppercase tracking-[0.16em] text-rose-400">Критично</div>
                        <div className="mt-1 text-lg font-bold text-rose-700">{point.criticalRows}</div>
                    </div>
                    <div className="rounded-2xl border border-amber-100 bg-amber-50 px-2 py-2">
                        <div className="text-[11px] uppercase tracking-[0.16em] text-amber-500">Внимание</div>
                        <div className="mt-1 text-lg font-bold text-amber-700">{point.warningRows}</div>
                    </div>
                </div>

                <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3 text-xs leading-5 text-slate-500">
                    Координата: {point.coordinateSource === 'catalog' ? 'опорный GIS-каталог' : 'интерполяция по плечу от узла Астана'}
                </div>

                {point.topRow ? (
                    <div className="mt-4">
                        <PopupField label="Плечо" value={point.topRow.shoulder ?? '—'} />
                        <PopupField label="Локомотив" value={point.topRow.locomotiveNumber ?? '—'} />
                        <PopupField label="Прибытие" value={point.topRow.arrival ?? '—'} />
                        <PopupField label="Отправление" value={point.topRow.departure ?? '—'} />
                        <PopupField label="Простой" value={formatMinutes(point.topRow.dwellMinutes)} />
                        <PopupField label="Норма" value={formatMinutes(point.topRow.normMinutes)} />
                        <PopupField label="Перепростой" value={formatMinutes(point.topRow.overDwellMinutes)} accent={(point.topRow.overDwellMinutes ?? 0) > 0 ? 'text-rose-700' : 'text-slate-900'} />
                        <PopupField label="Комментарий" value={point.topIssue ?? 'Связанные события без отдельного замечания'} accent="text-slate-600" />
                    </div>
                ) : (
                    <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3 text-sm text-slate-500">
                        По этой точке в текущем наборе факта/подвязок нет связанных dwell-событий, поэтому она показана нейтрально.
                    </div>
                )}
            </div>
        </div>
    );
}

export default function RailwayGISDashboard({
    atlas,
    selectedPair,
    selectedTrainNumber,
    onSelectRow,
}: {
    atlas: GisAtlasPayload;
    selectedPair?: string;
    selectedTrainNumber?: string;
    onSelectRow?: (row: GituralLocomotiveTableRow) => void;
}) {
    const [showRailNetwork, setShowRailNetwork] = useState(true);
    const [showSchematic, setShowSchematic] = useState(true);
    const [showShoulders, setShowShoulders] = useState(true);
    const [showDepartments, setShowDepartments] = useState(true);
    const [showStations, setShowStations] = useState(true);
    const [showEvents, setShowEvents] = useState(true);
    const [showNodes, setShowNodes] = useState(true);
    const [viewMode, setViewMode] = useState<'astana' | 'country'>('astana');
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [resizeKey, setResizeKey] = useState(0);
    const containerRef = useRef<HTMLDivElement | null>(null);

    const selectedEventIds = useMemo(() => {
        const ids = new Set<string>();
        atlas.events.forEach((eventPoint) => {
            if (isSelectedRow(eventPoint.row, selectedPair, selectedTrainNumber)) {
                ids.add(eventPoint.id);
            }
        });
        return ids;
    }, [atlas.events, selectedPair, selectedTrainNumber]);

    useEffect(() => {
        const handleFullscreenChange = () => {
            const nextFullscreen = document.fullscreenElement === containerRef.current;
            setIsFullscreen(nextFullscreen);
            setResizeKey((current) => current + 1);
        };

        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, []);

    const toggleFullscreen = async () => {
        if (!containerRef.current) return;

        if (document.fullscreenElement === containerRef.current) {
            await document.exitFullscreen();
            return;
        }

        await containerRef.current.requestFullscreen();
    };

    return (
        <div
            ref={containerRef}
            className={`relative flex h-full flex-col overflow-hidden bg-white ${isFullscreen ? 'h-screen rounded-none border-0' : 'min-h-[760px] rounded-[28px] border border-slate-200'}`}
        >
            <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-slate-950 px-5 py-3 text-white">
                <label className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm">
                    <input type="checkbox" checked={showRailNetwork} onChange={(event) => setShowRailNetwork(event.target.checked)} />
                    Реальная ж/д сеть
                </label>
                <label className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm">
                    <input type="checkbox" checked={showSchematic} onChange={(event) => setShowSchematic(event.target.checked)} />
                    Схема РЦУП
                </label>
                <label className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm">
                    <input type="checkbox" checked={showShoulders} onChange={(event) => setShowShoulders(event.target.checked)} />
                    Плечи
                </label>
                <label className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm">
                    <input type="checkbox" checked={showDepartments} onChange={(event) => setShowDepartments(event.target.checked)} />
                    Отделения
                </label>
                <label className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm">
                    <input type="checkbox" checked={showNodes} onChange={(event) => setShowNodes(event.target.checked)} />
                    Узлы
                </label>
                <label className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm">
                    <input type="checkbox" checked={showStations} onChange={(event) => setShowStations(event.target.checked)} />
                    Станции
                </label>
                <label className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm">
                    <input type="checkbox" checked={showEvents} onChange={(event) => setShowEvents(event.target.checked)} />
                    События
                </label>

                <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 p-1">
                    <button
                        type="button"
                        onClick={() => setViewMode('astana')}
                        className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${viewMode === 'astana' ? 'bg-white text-slate-950' : 'text-slate-200 hover:bg-white/10'}`}
                    >
                        Узел Астана
                    </button>
                    <button
                        type="button"
                        onClick={() => setViewMode('country')}
                        className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${viewMode === 'country' ? 'bg-white text-slate-950' : 'text-slate-200 hover:bg-white/10'}`}
                    >
                        Весь Казахстан
                    </button>
                </div>

                <button
                    type="button"
                    onClick={() => void toggleFullscreen()}
                    className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-semibold text-slate-100 transition hover:bg-white/10"
                >
                    {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                    {isFullscreen ? 'Свернуть' : 'Полный экран'}
                </button>

                <div className="ml-auto flex flex-wrap items-center gap-2 text-[11px] text-slate-300">
                    <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-3 py-1.5">
                        <MapPinned size={12} />
                        {atlas.stations.length} точек
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-3 py-1.5">
                        <Radar size={12} />
                        {atlas.events.length} событий
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-3 py-1.5">
                        <GitBranch size={12} />
                        {atlas.shoulders.length} плеч
                    </span>
                </div>
            </div>

            <div className="relative flex-1">
                <div className="absolute left-4 top-4 z-[500] max-w-[300px] rounded-3xl border border-slate-200 bg-white/95 p-4 shadow-xl backdrop-blur">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Легенда</div>
                    <div className="mt-3 space-y-2 text-sm text-slate-700">
                        {Object.values(STATUS_META).map((item) => (
                            <div key={item.label} className="flex items-center gap-2">
                                <span className="h-3.5 w-3.5 rounded-full border border-white shadow-sm" style={{ backgroundColor: item.color }} />
                                {item.label}
                            </div>
                        ))}
                        <div className="flex items-center gap-2">
                            <span className="h-1.5 w-8 rounded-full bg-sky-500" />
                            Линии плеч
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="h-4 w-4 rounded-full border-2 border-slate-700 bg-white" />
                            Узлы / станции
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="h-3 w-3 rounded-full border border-slate-300 bg-slate-200" />
                            Точки событий
                        </div>
                        <div className="flex items-center gap-2">
                            <Layers3 size={14} className="text-slate-500" />
                            Зоны отделений и схема РЦУП
                        </div>
                    </div>
                </div>

                <div className="absolute right-4 top-4 z-[500] max-w-[360px] rounded-3xl border border-slate-200 bg-white/95 p-4 shadow-xl backdrop-blur">
                    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                        <Train size={13} />
                        Контроль сети
                    </div>
                    <div className="mt-2 text-sm leading-6 text-slate-600">
                        {atlas.schematicOverlay.note}
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded-2xl border border-rose-100 bg-rose-50 px-3 py-2">
                            <div className="uppercase tracking-[0.16em] text-rose-400">Перепростой</div>
                            <div className="mt-1 text-lg font-bold text-rose-700">{atlas.summary.criticalEvents}</div>
                        </div>
                        <div className="rounded-2xl border border-amber-100 bg-amber-50 px-3 py-2">
                            <div className="uppercase tracking-[0.16em] text-amber-400">Риск</div>
                            <div className="mt-1 text-lg font-bold text-amber-700">{atlas.summary.warningEvents}</div>
                        </div>
                    </div>
                </div>

                <MapContainer
                    center={[51.15, 71.45]}
                    zoom={7}
                    minZoom={4}
                    maxZoom={10}
                    maxBounds={KAZAKHSTAN_BOUNDS}
                    maxBoundsViscosity={1}
                    style={{ height: '100%', width: '100%' }}
                    className="z-0"
                >
                    <MapViewController viewMode={viewMode} resizeKey={resizeKey} />

                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
                        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                    />

                    {showSchematic && (
                        <ImageOverlay
                            url={atlas.schematicOverlay.imageUrl}
                            bounds={atlas.schematicOverlay.bounds}
                            opacity={showRailNetwork ? 0.32 : 0.72}
                        />
                    )}

                    {showRailNetwork && (
                        <TileLayer
                            attribution='&copy; <a href="https://www.openrailwaymap.org/">OpenRailwayMap</a>'
                            url="https://{s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png"
                            opacity={showSchematic ? 0.7 : 0.9}
                        />
                    )}

                    {showDepartments && atlas.departments.map((zone) => {
                        const meta = STATUS_META[zone.status];
                        return (
                            <Circle
                                key={zone.id}
                                center={zone.center}
                                radius={zone.radiusKm * 1000}
                                pathOptions={{
                                    color: zone.color,
                                    fillColor: zone.color,
                                    fillOpacity: zone.totalRows ? 0.08 : 0.04,
                                    weight: 1,
                                    dashArray: '6 6',
                                }}
                            >
                                <Tooltip permanent direction="center" className="border-0 bg-transparent shadow-none">
                                    <div className="rounded-full border border-white/70 bg-white/85 px-3 py-1 text-[11px] font-bold text-slate-700 shadow-sm">
                                        {zone.name}
                                        {zone.totalRows ? ` · ${meta.label.toLowerCase()}` : ''}
                                    </div>
                                </Tooltip>
                            </Circle>
                        );
                    })}

                    {showShoulders && atlas.shoulders.map((line) => {
                        const meta = STATUS_META[line.status];
                        return (
                            <Polyline
                                key={line.id}
                                positions={line.coordinates}
                                pathOptions={{
                                    color: meta.color,
                                    weight: line.criticalRows > 0 ? 5 : 3.5,
                                    opacity: 0.78,
                                }}
                            >
                                <Tooltip sticky>
                                    <div className="text-xs">
                                        <div className="font-bold">{line.label}</div>
                                        <div className="text-slate-500">{line.department}</div>
                                        <div className="mt-1 text-slate-600">Связанных событий: {line.totalRows}</div>
                                        <div className="text-slate-600">Критичных: {line.criticalRows}</div>
                                    </div>
                                </Tooltip>
                            </Polyline>
                        );
                    })}

                    {showStations && atlas.stations.filter((point) => point.kind === 'station').map((point) => {
                        const meta = STATUS_META[point.status];
                        return (
                            <CircleMarker
                                key={point.id}
                                center={[point.latitude, point.longitude]}
                                radius={point.totalRows ? 5.5 : 4}
                                pathOptions={{
                                    color: meta.color,
                                    fillColor: meta.color,
                                    fillOpacity: point.totalRows ? 0.9 : 0.65,
                                    weight: 1.5,
                                }}
                                eventHandlers={{
                                    click: () => point.topRow && onSelectRow?.(point.topRow),
                                }}
                            >
                                <Tooltip>
                                    <div className="text-xs">
                                        <div className="font-bold">{point.name}</div>
                                        <div className="text-slate-500">{point.totalRows ? `${point.totalRows} связанных событий` : 'Нет связанных событий'}</div>
                                    </div>
                                </Tooltip>
                                <Popup maxWidth={380}>
                                    <StationPopupCard point={point} />
                                </Popup>
                            </CircleMarker>
                        );
                    })}

                    {showNodes && atlas.stations.filter((point) => point.kind === 'node').map((point) => {
                        const meta = STATUS_META[point.status];
                        const selected = point.topRow ? isSelectedRow(point.topRow, selectedPair, selectedTrainNumber) : false;
                        return (
                            <CircleMarker
                                key={point.id}
                                center={[point.latitude, point.longitude]}
                                radius={selected ? 11 : 9}
                                pathOptions={{
                                    color: selected ? '#0f172a' : meta.color,
                                    fillColor: meta.color,
                                    fillOpacity: 0.92,
                                    weight: selected ? 3 : 2,
                                }}
                                eventHandlers={{
                                    click: () => point.topRow && onSelectRow?.(point.topRow),
                                }}
                            >
                                <Tooltip permanent={viewMode === 'astana' && ASTANA_KEY_LABELS.has(point.name)} direction={viewMode === 'astana' ? 'top' : 'auto'}>
                                    <div className="text-xs">
                                        <div className="font-bold">{point.name}</div>
                                        <div className="text-slate-500">{point.kind === 'node' ? 'Узел мониторинга' : 'Станция'}</div>
                                    </div>
                                </Tooltip>
                                <Popup maxWidth={380}>
                                    <StationPopupCard point={point} />
                                </Popup>
                            </CircleMarker>
                        );
                    })}

                    {showEvents && atlas.events.map((point) => {
                        const meta = STATUS_META[point.status];
                        const selected = selectedEventIds.has(point.id);
                        return (
                            <CircleMarker
                                key={point.id}
                                center={[point.latitude, point.longitude]}
                                radius={selected ? 8 : 5}
                                pathOptions={{
                                    color: selected ? '#020617' : meta.color,
                                    fillColor: meta.color,
                                    fillOpacity: 0.95,
                                    weight: selected ? 2.5 : 1.2,
                                }}
                                eventHandlers={{
                                    click: () => onSelectRow?.(point.row),
                                }}
                            >
                                <Tooltip>
                                    <div className="text-xs">
                                        <div className="font-bold">{point.row.locomotiveNumber ?? '—'} · {point.stationName}</div>
                                        <div className="text-slate-500">{point.eventType} · {point.row.shoulder ?? 'без плеча'}</div>
                                    </div>
                                </Tooltip>
                                <Popup maxWidth={420}>
                                    <EventPopupCard point={point} />
                                </Popup>
                            </CircleMarker>
                        );
                    })}
                </MapContainer>
            </div>

            <div className="grid grid-cols-1 gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4 lg:grid-cols-4">
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Проблемные станции</div>
                    <div className="mt-1 text-2xl font-bold text-slate-950">{atlas.summary.problematicStations}</div>
                </div>
                <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3">
                    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-500">
                        <AlertTriangle size={12} />
                        Перепростой
                    </div>
                    <div className="mt-1 text-2xl font-bold text-rose-700">{atlas.summary.criticalEvents}</div>
                </div>
                <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-500">Риск</div>
                    <div className="mt-1 text-2xl font-bold text-amber-700">{atlas.summary.warningEvents}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Точек без данных</div>
                    <div className="mt-1 text-2xl font-bold text-slate-700">
                        {atlas.stations.filter((item) => item.status === 'missing').length}
                    </div>
                </div>
            </div>
        </div>
    );
}
