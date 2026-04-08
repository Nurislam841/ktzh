'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, CalendarDays, Clock3, GitBranch, RefreshCw, Route, Search, Waypoints } from 'lucide-react';
import Sidebar from '../../components/Sidebar';
import GituralLocomotiveTable from '../../components/GituralLocomotiveTable';
import GituralTimeline from '../../components/GituralTimeline';
import { getGituralTimeline, getStations, pickBestStationId } from '../../lib/api';

const ASTANA_GRAPH_STATIONS = ['Кокшетау', 'Есиль', 'Астана', 'Екибастуз', 'Караганда'];
const ASTANA_GRAPH_NOTE = 'Для схемы графика центральная точка «Астана» агрегирует Астана-1, Нурлы жол, Нур-Султан I и Сороковую; промежуточные малые станции скрыты только в этом окне.';

function normalizeStationName(value: string | null | undefined) {
    return String(value ?? '')
        .toLowerCase()
        .replaceAll('ё', 'е')
        .replace(/\s+/g, ' ')
        .trim();
}

function mapGraphStation(stationName: string | null | undefined) {
    const normalized = normalizeStationName(stationName);
    if (!normalized) return null;
    if (normalized.includes('кокшетау')) return 'Кокшетау';
    if (normalized.includes('есиль')) return 'Есиль';
    if (
        normalized.includes('астана-1') ||
        normalized.includes('астана 1') ||
        normalized.includes('нурлы жол') ||
        normalized.includes('нур-султан i') ||
        normalized.includes('нур-султан 1') ||
        normalized.includes('сороковая')
    ) {
        return 'Астана';
    }
    if (normalized.includes('екибастуз')) return 'Екибастуз';
    if (normalized.includes('караганд')) return 'Караганда';
    return null;
}

function getGraphStartOffset(stop: any) {
    return typeof stop?.arrivalOffsetMinutes === 'number'
        ? stop.arrivalOffsetMinutes
        : typeof stop?.departureOffsetMinutes === 'number'
            ? stop.departureOffsetMinutes
            : null;
}

function getGraphEndOffset(stop: any) {
    return typeof stop?.departureOffsetMinutes === 'number'
        ? stop.departureOffsetMinutes
        : typeof stop?.arrivalOffsetMinutes === 'number'
            ? stop.arrivalOffsetMinutes
            : null;
}

function minNumber(...values: Array<number | null>) {
    const valid = values.filter((value): value is number => typeof value === 'number');
    return valid.length ? Math.min(...valid) : null;
}

function maxNumber(...values: Array<number | null>) {
    const valid = values.filter((value): value is number => typeof value === 'number');
    return valid.length ? Math.max(...valid) : null;
}

function reduceGraphStops(windowStops: any[] = []) {
    const reduced: any[] = [];

    windowStops.forEach((stop) => {
        const station = mapGraphStation(stop?.station);
        const arrivalOffsetMinutes = getGraphStartOffset(stop);
        const departureOffsetMinutes = getGraphEndOffset(stop);

        if (!station || (arrivalOffsetMinutes === null && departureOffsetMinutes === null)) {
            return;
        }

        const nextStop = {
            ...stop,
            station,
            distanceKm: null,
            arrivalRaw: stop?.arrivalRaw ?? stop?.departureRaw ?? null,
            departureRaw: stop?.departureRaw ?? stop?.arrivalRaw ?? null,
            arrivalOffsetMinutes,
            departureOffsetMinutes,
            dwellMinutes:
                typeof stop?.dwellMinutes === 'number'
                    ? stop.dwellMinutes
                    : typeof arrivalOffsetMinutes === 'number' && typeof departureOffsetMinutes === 'number'
                        ? Math.max(departureOffsetMinutes - arrivalOffsetMinutes, 0)
                        : null,
        };

        const previous = reduced[reduced.length - 1];
        if (!previous || previous.station !== station) {
            reduced.push(nextStop);
            return;
        }

        previous.arrivalOffsetMinutes = minNumber(previous.arrivalOffsetMinutes, nextStop.arrivalOffsetMinutes);
        previous.departureOffsetMinutes = maxNumber(previous.departureOffsetMinutes, nextStop.departureOffsetMinutes);
        previous.arrivalRaw = previous.arrivalRaw ?? nextStop.arrivalRaw;
        previous.departureRaw = nextStop.departureRaw ?? previous.departureRaw;
        previous.dwellMinutes =
            typeof previous.arrivalOffsetMinutes === 'number' && typeof previous.departureOffsetMinutes === 'number'
                ? Math.max(previous.departureOffsetMinutes - previous.arrivalOffsetMinutes, 0)
                : previous.dwellMinutes ?? nextStop.dwellMinutes;
    });

    return reduced;
}

function reduceGraphOperations(stopOperations: any[] = []) {
    return stopOperations
        .map((item) => {
            const station = mapGraphStation(item?.station);
            if (!station) return null;
            return { ...item, station };
        })
        .filter(Boolean);
}

function buildAstanaGraphTimeline(timeline: any) {
    if (!timeline) return null;

    const trains = (timeline.trains ?? [])
        .map((train: any) => ({
            ...train,
            astanaCoreStop: mapGraphStation(train?.astanaCoreStop) ?? train?.astanaCoreStop ?? null,
            windowStops: reduceGraphStops(train?.windowStops ?? []),
        }))
        .filter((train: any) => train.windowStops.length > 0);

    return {
        ...timeline,
        stations: ASTANA_GRAPH_STATIONS.map((name) => ({ name, distanceKm: null })),
        trains,
        stopOperations: reduceGraphOperations(timeline.stopOperations ?? []),
    };
}

function getPairBadgeClass(isSelected: boolean) {
    return isSelected ? 'border-sky-300 bg-sky-50' : 'border-gray-100';
}

export default function GraphPage() {
    const [stationId, setStationId] = useState('');
    const [loading, setLoading] = useState(false);
    const [timeline, setTimeline] = useState<any>(null);
    const [corridor, setCorridor] = useState('');
    const [trainNumber, setTrainNumber] = useState('');
    const [day, setDay] = useState<number | ''>('');
    const [selectedPair, setSelectedPair] = useState('');
    const [selectedTrainNumber, setSelectedTrainNumber] = useState('');

    const resolveStationId = useCallback(async () => {
        const fromStorage = window.localStorage.getItem('ktz_station_id') ?? '';
        if (fromStorage) return fromStorage;
        const stations = await getStations();
        return pickBestStationId(stations.stations);
    }, []);

    const load = useCallback(async (
        nextCorridor = corridor,
        nextTrainNumber = trainNumber,
        nextDay = day,
    ) => {
        setLoading(true);
        try {
            const data: any = await getGituralTimeline({
                corridor: nextCorridor || undefined,
                trainNumber: nextTrainNumber || undefined,
                day: typeof nextDay === 'number' ? nextDay : undefined,
            });
            setTimeline(data);
            if (selectedTrainNumber && !data.trains?.some((item: any) => item.trainNumber === selectedTrainNumber)) {
                setSelectedTrainNumber('');
            }
        } finally {
            setLoading(false);
        }
    }, [corridor, day, selectedTrainNumber, trainNumber]);

    useEffect(() => {
        let mounted = true;
        (async () => {
            const sid = await resolveStationId();
            if (!mounted) return;
            setStationId(sid);
            if (sid) {
                window.localStorage.setItem('ktz_station_id', sid);
            }
            await load('', '', '');
        })();
        return () => { mounted = false; };
    }, [load, resolveStationId]);

    const stats = useMemo(() => {
        if (!timeline?.summary) return [];
        return [
            { label: 'Нитки графика', value: timeline.total ?? 0, icon: Route, cls: 'bg-sky-50 text-sky-700' },
            { label: 'Уникальные поезда', value: timeline.summary.uniqueNodeTrains, icon: Waypoints, cls: 'bg-emerald-50 text-emerald-700' },
            { label: 'Операции подвязки', value: timeline.bindings?.length ?? 0, icon: BarChart3, cls: 'bg-amber-50 text-amber-700' },
            { label: 'Обороты', value: timeline.turnarounds?.length ?? 0, icon: GitBranch, cls: 'bg-teal-50 text-teal-700' },
        ];
    }, [timeline]);

    const selectedTrain = useMemo(() => {
        if (!selectedTrainNumber) return null;
        return (timeline?.trains ?? []).find((item: any) => item.trainNumber === selectedTrainNumber) ?? null;
    }, [selectedTrainNumber, timeline]);

    const selectedTrainOperations = useMemo(() => {
        if (!selectedTrainNumber) return [];
        return (timeline?.stopOperations ?? []).filter((item: any) => item.trainNumber === selectedTrainNumber);
    }, [selectedTrainNumber, timeline]);

    const graphTimeline = useMemo(() => buildAstanaGraphTimeline(timeline), [timeline]);

    const handleSelectLocomotiveRow = useCallback((row: any) => {
        if (row?.pairKey) {
            setSelectedPair(row.pairKey);
        }

        if (row?.departureTrainNumber) {
            setSelectedTrainNumber(row.departureTrainNumber);
            return;
        }

        if (row?.arrivalTrainNumber) {
            setSelectedTrainNumber(row.arrivalTrainNumber);
        }
    }, []);

    return (
        <div className="flex min-h-screen">
            <Sidebar stationId={stationId} />
            <div className="main-wrapper flex-1">
                <header className="topbar">
                    <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-slate-900 to-sky-700">
                            <Route size={18} className="text-white" />
                        </div>
                        <div>
                            <h1 className="text-lg font-bold text-gray-900">График узла Астана</h1>
                            <p className="text-xs text-gray-400">Аналог графика Гитурал: ось времени 20:00–20:00, станции по вертикали, поезд как нитка.</p>
                        </div>
                    </div>
                    <button onClick={() => load()} className="btn-secondary" disabled={loading}>
                        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Обновить
                    </button>
                </header>

                <main className="page-content">
                    <div className="mb-6 grid grid-cols-1 gap-3 lg:grid-cols-4">
                        {stats.map((item) => (
                            <div key={item.label} className={`rounded-3xl border border-gray-100 p-4 ${item.cls}`}>
                                <div className="mb-2 flex items-center gap-2">
                                    <item.icon size={16} />
                                    <span className="text-xs font-medium">{item.label}</span>
                                </div>
                                <div className="text-2xl font-bold">{item.value}</div>
                            </div>
                        ))}
                    </div>

                    <div className="card mb-6 flex flex-col gap-3 xl:flex-row xl:items-center">
                        <div className="relative w-full xl:max-w-sm">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                value={trainNumber}
                                onChange={(event) => setTrainNumber(event.target.value)}
                                placeholder="Фильтр по номеру поезда"
                                className="input-field pl-9"
                            />
                        </div>
                        <select
                            value={corridor}
                            onChange={(event) => setCorridor(event.target.value)}
                            className="input-field xl:max-w-md"
                        >
                            <option value="">Все коридоры</option>
                            {(timeline?.corridors ?? []).map((item: string) => (
                                <option key={item} value={item}>{item}</option>
                            ))}
                        </select>
                        <select
                            value={day}
                            onChange={(event) => setDay(event.target.value ? Number(event.target.value) : '')}
                            className="input-field xl:max-w-[180px]"
                        >
                            <option value="">Все графические сутки</option>
                            {(timeline?.days ?? []).map((item: number) => (
                                <option key={item} value={item}>{item} число</option>
                            ))}
                        </select>
                        <button onClick={() => load(corridor, trainNumber, day)} className="btn-primary">
                            Показать
                        </button>
                    </div>

                    <div className="mb-4 rounded-3xl border border-sky-100 bg-sky-50 p-4 text-sm text-sky-900">
                        На этом экране мы держим узловой график как отдельный диспетчерский инструмент: станции по вертикали, время по горизонтали,
                        стоянки видны горизонтальными сегментами, а обороты и смены локомотива читаются прямо по ниткам. Ниже график связан с живой таблицей
                        по локомотивным состояниям: клик по строке выделяет нитку, клик по нитке подсвечивает строку.
                    </div>

                    <div className="card mb-6">
                        <div className="mb-4 flex items-center gap-2">
                            <CalendarDays size={16} className="text-slate-700" />
                            <h2 className="font-semibold text-gray-900">Маршрутные пары</h2>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <button
                                onClick={() => setSelectedPair('')}
                                className={selectedPair ? 'badge-gray' : 'badge-blue'}
                            >
                                Все пары
                            </button>
                            {(timeline?.routePairs ?? []).map((pair: any) => (
                                <button
                                    key={pair.pairKey}
                                    onClick={() => {
                                        setSelectedPair(pair.pairKey);
                                        setSelectedTrainNumber('');
                                    }}
                                    className={selectedPair === pair.pairKey ? 'badge-blue' : 'badge-gray'}
                                    title={(pair.routes ?? []).join(' / ')}
                                >
                                    {pair.pairKey}
                                </button>
                            ))}
                        </div>
                    </div>

                    <GituralTimeline
                        trains={graphTimeline?.trains ?? []}
                        stations={graphTimeline?.stations ?? ASTANA_GRAPH_STATIONS.map((name) => ({ name, distanceKm: null }))}
                        bindings={graphTimeline?.bindings ?? []}
                        turnarounds={graphTimeline?.turnarounds ?? []}
                        highlightedPair={selectedPair || undefined}
                        stopOperations={graphTimeline?.stopOperations ?? []}
                        selectedTrainNumber={selectedTrainNumber || undefined}
                        onSelectTrain={setSelectedTrainNumber}
                        sourceTrainsCount={timeline?.trains?.length ?? 0}
                        aggregationNote={ASTANA_GRAPH_NOTE}
                        serviceDayStart={timeline?.serviceDayStart ?? '20:00'}
                    />

                    <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-4">
                        <div className="card">
                            <div className="mb-4 flex items-center gap-2">
                                <Route size={16} className="text-sky-700" />
                                <h2 className="font-semibold text-gray-900">Пары и нитки</h2>
                            </div>
                            <div className="max-h-[320px] space-y-3 overflow-auto">
                                {(timeline?.routePairs ?? []).map((pair: any) => (
                                    <button
                                        key={pair.pairKey}
                                        onClick={() => {
                                            const nextPair = pair.pairKey === selectedPair ? '' : pair.pairKey;
                                            setSelectedPair(nextPair);
                                            setSelectedTrainNumber('');
                                        }}
                                        className={`w-full rounded-2xl border p-3 text-left ${getPairBadgeClass(selectedPair === pair.pairKey)}`}
                                    >
                                        <div className="text-sm font-semibold text-gray-900">{pair.pairKey}</div>
                                        <div className="mt-1 text-xs text-gray-500">
                                            Ниток: {pair.trainsCount} · Поезда: {(pair.trainNumbers ?? []).join(', ')}
                                        </div>
                                        {!!pair.routes?.length && (
                                            <div className="mt-2 text-xs text-gray-600">{pair.routes[0]}</div>
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="card">
                            <div className="mb-4 flex items-center gap-2">
                                <Search size={16} className="text-indigo-700" />
                                <h2 className="font-semibold text-gray-900">Карточка поезда</h2>
                            </div>
                            {selectedTrain ? (
                                <div className="space-y-4">
                                    <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-3">
                                        <div className="text-lg font-bold text-gray-900">{selectedTrain.trainNumber}</div>
                                        <div className="mt-1 text-xs text-gray-600">{selectedTrain.routeName ?? 'Маршрут не указан'}</div>
                                        <div className="mt-2 flex flex-wrap gap-2">
                                            {selectedTrain.corridor && <span className="badge-blue">{selectedTrain.corridor}</span>}
                                            {selectedTrain.astanaCoreStop && <span className="badge-green">{selectedTrain.astanaCoreStop}</span>}
                                            <span className="badge-gray">{selectedTrain.direction === 'forward' ? 'Туда' : 'Обратно'}</span>
                                        </div>
                                    </div>

                                    <div className="max-h-[320px] space-y-2 overflow-auto">
                                        {selectedTrain.windowStops.map((stop: any, index: number) => {
                                            const operations = selectedTrainOperations.filter((item: any) => item.station === stop.station);
                                            const hasLongStop = (stop.dwellMinutes ?? 0) >= 30;
                                            return (
                                                <div key={`${selectedTrain.trainNumber}-${stop.station}-${index}`} className="rounded-2xl border border-gray-100 p-3">
                                                    <div className="flex items-center justify-between gap-3">
                                                        <div className="text-sm font-semibold text-gray-900">{stop.station}</div>
                                                        <div className="text-xs text-gray-500">
                                                            {stop.arrivalRaw ?? '—'} → {stop.departureRaw ?? '—'}
                                                        </div>
                                                    </div>
                                                    <div className="mt-2 flex flex-wrap gap-2">
                                                        {typeof stop.dwellMinutes === 'number' && (
                                                            <span className={hasLongStop ? 'badge-yellow' : 'badge-gray'}>
                                                                Стоянка {stop.dwellMinutes}м
                                                            </span>
                                                        )}
                                                        {operations.map((operation: any, operationIndex: number) => (
                                                            <span key={operationIndex} className={operation.type === 'LOCO_CHANGE' ? 'badge-yellow' : 'badge-green'}>
                                                                {operation.label}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ) : (
                                <div className="text-sm text-gray-500">
                                    Кликни по нитке на графике, чтобы открыть карточку прохода поезда через узел.
                                </div>
                            )}
                        </div>

                        <div className="card">
                            <div className="mb-4 flex items-center gap-2">
                                <Clock3 size={16} className="text-violet-700" />
                                <h2 className="font-semibold text-gray-900">Операции на стоянках</h2>
                            </div>
                            <div className="max-h-[320px] space-y-3 overflow-auto">
                                {(timeline?.stopOperations ?? [])
                                    .filter((item: any) => {
                                        if (!selectedPair) return true;
                                        return selectedPair.includes(String(item.trainNumber).padStart(3, '0'));
                                    })
                                    .slice(0, 24)
                                    .map((item: any, index: number) => (
                                        <div key={`${item.trainNumber}-${item.station}-${index}`} className="rounded-2xl border border-gray-100 p-3">
                                            <div className="flex items-center justify-between gap-3">
                                                <div className="text-sm font-semibold text-gray-900">{item.trainNumber} · {item.station}</div>
                                                <span className={item.type === 'LOCO_CHANGE' ? 'badge-yellow' : 'badge-green'}>
                                                    {item.label}
                                                </span>
                                            </div>
                                            <div className="mt-1 text-xs text-gray-500">
                                                {item.stationTime ?? '—'} · {item.details}
                                            </div>
                                        </div>
                                    ))}
                                {!(timeline?.stopOperations ?? []).length && (
                                    <div className="text-sm text-gray-500">Операции на стоянках не найдены.</div>
                                )}
                            </div>
                        </div>

                        <div className="card">
                            <div className="mb-4 flex items-center gap-2">
                                <GitBranch size={16} className="text-teal-700" />
                                <h2 className="font-semibold text-gray-900">Обороты по узлу</h2>
                            </div>
                            <div className="max-h-[320px] space-y-3 overflow-auto">
                                {(timeline?.turnarounds ?? [])
                                    .filter((item: any) => !selectedPair || `${String(item.arrivalTrainNumber ?? '').padStart(3, '0')}/${String(item.departureTrainNumber ?? '').padStart(3, '0')}` === selectedPair)
                                    .slice(0, 20)
                                    .map((item: any, index: number) => (
                                        <div key={`${item.stationSheet}-${index}`} className="rounded-2xl border border-gray-100 p-3">
                                            <div className="text-sm font-semibold text-gray-900">
                                                {item.arrivalTrainNumber ?? '—'} → {item.departureTrainNumber ?? '—'}
                                            </div>
                                            <div className="mt-1 text-xs text-gray-500">
                                                {item.stationSheet} · {item.arrivalAstanaStop ?? '—'} {item.arrivalAstanaTime ?? '—'} → {item.departureAstanaStop ?? '—'} {item.departureAstanaTime ?? '—'}
                                            </div>
                                            <div className="mt-2 badge-green">
                                                <Clock3 size={10} /> {item.dwellHours ? `${item.dwellHours}ч` : 'время не рассчитано'}
                                            </div>
                                        </div>
                                    ))}
                                {!(timeline?.turnarounds ?? []).length && (
                                    <div className="text-sm text-gray-500">Для текущего фильтра обороты не найдены.</div>
                                )}
                            </div>
                        </div>
                    </div>

                    <GituralLocomotiveTable
                        rows={timeline?.locomotiveTable ?? []}
                        selectedPair={selectedPair || undefined}
                        selectedTrainNumber={selectedTrainNumber || undefined}
                        onSelectRow={handleSelectLocomotiveRow}
                    />
                </main>
            </div>
        </div>
    );
}
