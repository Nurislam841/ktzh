'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, RefreshCw, Route, Search, Waypoints, GitBranch, Clock3, CalendarDays } from 'lucide-react';
import Sidebar from '../../components/Sidebar';
import GituralTimeline from '../../components/GituralTimeline';
import { getGituralTimeline, getStations, pickBestStationId } from '../../lib/api';

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

    return (
        <div className="flex min-h-screen">
            <Sidebar stationId={stationId} />
            <div className="main-wrapper flex-1">
                <header className="topbar">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-slate-900 to-sky-700 flex items-center justify-center">
                            <Route size={18} className="text-white" />
                        </div>
                        <div>
                            <h1 className="text-lg font-bold text-gray-900">График Узла Астана</h1>
                            <p className="text-xs text-gray-400">Аналог графика Гитурал: ось времени 20:00-20:00, станции по вертикали, поезд как нитка</p>
                        </div>
                    </div>
                    <button onClick={() => load()} className="btn-secondary" disabled={loading}>
                        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Обновить
                    </button>
                </header>

                <main className="page-content">
                    <div className="grid grid-cols-1 lg:grid-cols-4 gap-3 mb-6">
                        {stats.map((item) => (
                            <div key={item.label} className={`rounded-3xl border border-gray-100 p-4 ${item.cls}`}>
                                <div className="flex items-center gap-2 mb-2">
                                    <item.icon size={16} />
                                    <span className="text-xs font-medium">{item.label}</span>
                                </div>
                                <div className="text-2xl font-bold">{item.value}</div>
                            </div>
                        ))}
                    </div>

                    <div className="card mb-6 flex flex-col xl:flex-row gap-3 xl:items-center">
                        <div className="relative w-full xl:max-w-sm">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                value={trainNumber}
                                onChange={(e) => setTrainNumber(e.target.value)}
                                placeholder="Фильтр по номеру поезда"
                                className="input-field pl-9"
                            />
                        </div>
                        <select
                            value={corridor}
                            onChange={(e) => setCorridor(e.target.value)}
                            className="input-field xl:max-w-md"
                        >
                            <option value="">Все коридоры</option>
                            {(timeline?.corridors ?? []).map((item: string) => (
                                <option key={item} value={item}>{item}</option>
                            ))}
                        </select>
                        <select
                            value={day}
                            onChange={(e) => setDay(e.target.value ? Number(e.target.value) : '')}
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
                        На втором фото у тебя именно узловой график-нитка: станции по вертикали, время по горизонтали, горизонтальный сегмент показывает стоянку, а обороты и смены локомотива читаются прямо по графику. Это можно и нужно держать в платформе как отдельный экран, связанный с подвязками и вызовом бригад.
                    </div>

                    <div className="card mb-6">
                        <div className="flex items-center gap-2 mb-4">
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
                        trains={timeline?.trains ?? []}
                        stations={timeline?.stations ?? []}
                        bindings={timeline?.bindings ?? []}
                        turnarounds={timeline?.turnarounds ?? []}
                        highlightedPair={selectedPair || undefined}
                        stopOperations={timeline?.stopOperations ?? []}
                        selectedTrainNumber={selectedTrainNumber || undefined}
                        onSelectTrain={setSelectedTrainNumber}
                    />

                    <div className="grid grid-cols-1 xl:grid-cols-4 gap-4 mt-6">
                        <div className="card">
                            <div className="flex items-center gap-2 mb-4">
                                <Route size={16} className="text-sky-700" />
                                <h2 className="font-semibold text-gray-900">Пары и нитки</h2>
                            </div>
                            <div className="space-y-3 max-h-[320px] overflow-auto">
                                {(timeline?.routePairs ?? []).map((pair: any) => (
                                    <button
                                        key={pair.pairKey}
                                        onClick={() => {
                                            const nextPair = pair.pairKey === selectedPair ? '' : pair.pairKey;
                                            setSelectedPair(nextPair);
                                            setSelectedTrainNumber('');
                                        }}
                                        className={`w-full rounded-2xl border p-3 text-left ${selectedPair === pair.pairKey ? 'border-sky-300 bg-sky-50' : 'border-gray-100'}`}
                                    >
                                        <div className="text-sm font-semibold text-gray-900">{pair.pairKey}</div>
                                        <div className="text-xs text-gray-500 mt-1">
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
                            <div className="flex items-center gap-2 mb-4">
                                <Search size={16} className="text-indigo-700" />
                                <h2 className="font-semibold text-gray-900">Карточка поезда</h2>
                            </div>
                            {selectedTrain ? (
                                <div className="space-y-4">
                                    <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-3">
                                        <div className="text-lg font-bold text-gray-900">{selectedTrain.trainNumber}</div>
                                        <div className="text-xs text-gray-600 mt-1">{selectedTrain.routeName ?? 'Маршрут не указан'}</div>
                                        <div className="mt-2 flex gap-2 flex-wrap">
                                            {selectedTrain.corridor && <span className="badge-blue">{selectedTrain.corridor}</span>}
                                            {selectedTrain.astanaCoreStop && <span className="badge-green">{selectedTrain.astanaCoreStop}</span>}
                                            <span className="badge-gray">{selectedTrain.direction === 'forward' ? 'Туда' : 'Обратно'}</span>
                                        </div>
                                    </div>

                                    <div className="space-y-2 max-h-[320px] overflow-auto">
                                        {selectedTrain.windowStops.map((stop: any, index: number) => {
                                            const ops = selectedTrainOperations.filter((item: any) => item.station === stop.station);
                                            const hasLongStop = (stop.dwellMinutes ?? 0) >= 30;
                                            return (
                                                <div key={`${selectedTrain.trainNumber}-${stop.station}-${index}`} className="rounded-2xl border border-gray-100 p-3">
                                                    <div className="flex items-center justify-between gap-3">
                                                        <div className="text-sm font-semibold text-gray-900">{stop.station}</div>
                                                        <div className="text-xs text-gray-500">
                                                            {stop.arrivalRaw ?? '—'} → {stop.departureRaw ?? '—'}
                                                        </div>
                                                    </div>
                                                    <div className="mt-2 flex gap-2 flex-wrap">
                                                        {typeof stop.dwellMinutes === 'number' && (
                                                            <span className={hasLongStop ? 'badge-yellow' : 'badge-gray'}>
                                                                Стоянка {stop.dwellMinutes}м
                                                            </span>
                                                        )}
                                                        {ops.map((op: any, opIndex: number) => (
                                                            <span key={opIndex} className={op.type === 'LOCO_CHANGE' ? 'badge-yellow' : 'badge-green'}>
                                                                {op.label}
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
                            <div className="flex items-center gap-2 mb-4">
                                <Clock3 size={16} className="text-violet-700" />
                                <h2 className="font-semibold text-gray-900">Операции на стоянках</h2>
                            </div>
                            <div className="space-y-3 max-h-[320px] overflow-auto">
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
                                            <div className="text-xs text-gray-500 mt-1">
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
                            <div className="flex items-center gap-2 mb-4">
                                <GitBranch size={16} className="text-teal-700" />
                                <h2 className="font-semibold text-gray-900">Обороты по узлу</h2>
                            </div>
                            <div className="space-y-3 max-h-[320px] overflow-auto">
                                {(timeline?.turnarounds ?? [])
                                    .filter((item: any) => !selectedPair || `${String(item.arrivalTrainNumber ?? '').padStart(3, '0')}/${String(item.departureTrainNumber ?? '').padStart(3, '0')}` === selectedPair)
                                    .slice(0, 20)
                                    .map((item: any, index: number) => (
                                    <div key={`${item.stationSheet}-${index}`} className="rounded-2xl border border-gray-100 p-3">
                                        <div className="text-sm font-semibold text-gray-900">
                                            {item.arrivalTrainNumber ?? '—'} → {item.departureTrainNumber ?? '—'}
                                        </div>
                                        <div className="text-xs text-gray-500 mt-1">
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

                        <div className="card">
                            <div className="flex items-center gap-2 mb-4">
                                <BarChart3 size={16} className="text-amber-700" />
                                <h2 className="font-semibold text-gray-900">Подвязки локомотивов</h2>
                            </div>
                            <div className="space-y-3 max-h-[320px] overflow-auto">
                                {(timeline?.bindings ?? [])
                                    .filter((item: any) => {
                                        if (!selectedPair) return true;
                                        const arrival = item.arrivalTrainNumber ? String(item.arrivalTrainNumber).padStart(3, '0') : '';
                                        const departure = item.departureTrainNumber ? String(item.departureTrainNumber).padStart(3, '0') : '';
                                        return selectedPair.includes(arrival) || selectedPair.includes(departure);
                                    })
                                    .slice(0, 24)
                                    .map((item: any, index: number) => (
                                    <div key={`${item.sheetName}-${index}`} className="rounded-2xl border border-gray-100 p-3">
                                        <div className="text-sm font-semibold text-gray-900">{item.sheetName}</div>
                                        <div className="text-xs text-gray-500 mt-1">
                                            {item.arrivalTrainNumber ?? '—'} {item.arrivalTime ?? '—'} → {item.departureTrainNumber ?? '—'} {item.departureTime ?? '—'}
                                        </div>
                                        <div className="mt-2 flex gap-2 flex-wrap">
                                            {item.depot && <span className="badge-gray">{item.depot}</span>}
                                            {item.dwellMinutes !== null && <span className="badge-yellow">{item.dwellMinutes}м</span>}
                                            {item.weekday && <span className="badge-blue">{item.weekday}</span>}
                                        </div>
                                    </div>
                                ))}
                                {!(timeline?.bindings ?? []).length && (
                                    <div className="text-sm text-gray-500">Для текущего фильтра подвязки не найдены.</div>
                                )}
                            </div>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
}
