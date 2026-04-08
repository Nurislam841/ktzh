'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
    AlertTriangle,
    CheckCircle2,
    Clock3,
    Link2,
    PlusCircle,
    RefreshCw,
    Search,
    Sparkles,
    Train,
    X,
} from 'lucide-react';
import Sidebar from '../../components/Sidebar';
import { createBinding, getPassengerBindingOperations, getStations, pickBestStationId } from '../../lib/api';

type ScenarioMode = 'base' | 'optimized';

function normalize(value: string) {
    return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function formatMinutes(value?: number | null) {
    if (typeof value !== 'number' || Number.isNaN(value)) return '—';
    const hours = Math.floor(value / 60);
    const minutes = value % 60;
    return hours ? `${hours} ч ${String(minutes).padStart(2, '0')} мин` : `${minutes} мин`;
}

function toneForStatus(statusKey: string) {
    if (statusKey === 'busy') return 'bg-sky-50 text-sky-700 border-sky-200';
    if (statusKey === 'problem') return 'bg-rose-50 text-rose-700 border-rose-200';
    if (statusKey === 'idle') return 'bg-amber-50 text-amber-700 border-amber-200';
    if (statusKey === 'reserve') return 'bg-violet-50 text-violet-700 border-violet-200';
    if (statusKey === 'free') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    return 'bg-slate-100 text-slate-600 border-slate-200';
}

function toneForCandidate(kind: string) {
    if (kind === 'recommended') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (kind === 'possible') return 'bg-sky-50 text-sky-700 border-sky-200';
    if (kind === 'conflict') return 'bg-amber-50 text-amber-700 border-amber-200';
    return 'bg-rose-50 text-rose-700 border-rose-200';
}

function barTone(row: any) {
    if (row.snapshot?.statusKey === 'problem') return 'from-rose-500 to-rose-400';
    if (row.bestCandidate?.kind === 'recommended') return 'from-emerald-500 to-sky-500';
    if (row.bestCandidate?.kind === 'possible') return 'from-sky-500 to-indigo-500';
    return 'from-slate-500 to-slate-400';
}

function buildOperationalIso(referenceIso: string, operationalMinute?: number | null) {
    if (typeof operationalMinute !== 'number' || Number.isNaN(operationalMinute)) return null;
    const reference = new Date(referenceIso);
    if (Number.isNaN(reference.getTime())) return null;
    const anchor = new Date(reference);
    if (reference.getHours() < 20) {
        anchor.setDate(anchor.getDate() - 1);
    }
    anchor.setHours(20, 0, 0, 0);
    return new Date(anchor.getTime() + operationalMinute * 60_000).toISOString();
}

function resolveStationId(stations: Array<{ id: string; name: string }>, names: Array<string | null | undefined>) {
    const normalizedTargets = names.map((item) => normalize(item ?? '')).filter(Boolean);
    for (const target of normalizedTargets) {
        const exact = stations.find((station) => normalize(station.name) === target);
        if (exact) return exact.id;
        const includes = stations.find((station) => normalize(station.name).includes(target) || target.includes(normalize(station.name)));
        if (includes) return includes.id;
    }
    return stations[0]?.id ?? '';
}

export default function PassengerBindingsPage() {
    const [stationId, setStationId] = useState('');
    const [stations, setStations] = useState<Array<{ id: string; name: string }>>([]);
    const [loading, setLoading] = useState(true);
    const [scenarioMode, setScenarioMode] = useState<ScenarioMode>('optimized');
    const [overview, setOverview] = useState<any>(null);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [tractionFilter, setTractionFilter] = useState('all');
    const [routeTypeFilter, setRouteTypeFilter] = useState('all');
    const [onlyProblematic, setOnlyProblematic] = useState(false);
    const [selectedLocomotiveId, setSelectedLocomotiveId] = useState<string | null>(null);
    const [refreshTick, setRefreshTick] = useState(0);
    const [isBindingModalOpen, setBindingModalOpen] = useState(false);
    const [bindingStationId, setBindingStationId] = useState('');
    const [bindingCandidateTripId, setBindingCandidateTripId] = useState('');
    const [bindingSaving, setBindingSaving] = useState(false);
    const [bindingError, setBindingError] = useState('');
    const [bindingSuccess, setBindingSuccess] = useState('');

    useEffect(() => {
        let mounted = true;
        (async () => {
            const stationResponse = await getStations();
            if (!mounted) return;
            setStations(stationResponse.stations.map((item) => ({ id: item.id, name: item.name })));
            const fromStorage = window.localStorage.getItem('ktz_station_id') ?? '';
            const sid = fromStorage || pickBestStationId(stationResponse.stations);
            if (!mounted) return;
            setStationId(sid);
            if (sid) window.localStorage.setItem('ktz_station_id', sid);
        })();
        return () => {
            mounted = false;
        };
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        getPassengerBindingOperations({ scenario: scenarioMode }, { signal: controller.signal })
            .then((data) => {
                setOverview(data);
                setSelectedLocomotiveId((current) => current && data.rows?.some((row: any) => row.id === current) ? current : data.rows?.[0]?.id ?? null);
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });
        return () => controller.abort();
    }, [refreshTick, scenarioMode]);

    const rows = overview?.rows ?? [];
    const maxHorizon = useMemo(() => {
        const values = rows.flatMap((row: any) => [row.snapshot?.currentIdleMinutes ?? 0, row.normMinutes ?? 0, row.bestCandidate?.gapMinutes ?? 0]);
        return Math.max(240, ...values);
    }, [rows]);

    const filteredRows = useMemo(() => {
        const needle = normalize(search);
        return rows.filter((row: any) => {
            const matchesSearch = !needle || normalize([
                row.label,
                row.series,
                row.number,
                row.depot,
                row.snapshot?.locationStation,
                row.bestCandidate?.trainNo,
                row.bestCandidate?.routeLabel,
            ].filter(Boolean).join(' ')).includes(needle);
            const matchesStatus = statusFilter === 'all' || row.snapshot?.statusKey === statusFilter;
            const matchesTraction = tractionFilter === 'all' || row.traction === tractionFilter;
            const matchesRouteType = routeTypeFilter === 'all' || row.bestCandidate?.routeType === routeTypeFilter || row.alternatives?.some((item: any) => item.routeType === routeTypeFilter);
            const matchesProblem = !onlyProblematic || row.snapshot?.statusKey === 'problem';
            return matchesSearch && matchesStatus && matchesTraction && matchesRouteType && matchesProblem;
        });
    }, [onlyProblematic, routeTypeFilter, rows, search, statusFilter, tractionFilter]);

    const activeRow = filteredRows.find((row: any) => row.id === selectedLocomotiveId) ?? filteredRows[0] ?? null;

    useEffect(() => {
        if (activeRow && activeRow.id !== selectedLocomotiveId) {
            setSelectedLocomotiveId(activeRow.id);
        }
    }, [activeRow, selectedLocomotiveId]);

    const stats = overview?.stats ?? {
        totalLocomotives: 0,
        withRecommendation: 0,
        waitingForBest: 0,
        outOfNorm: 0,
        busyNow: 0,
        freeNow: 0,
    };

    const routeTypes = useMemo(() => {
        const set = new Set<string>();
        rows.forEach((row: any) => {
            if (row.bestCandidate?.routeType) set.add(row.bestCandidate.routeType);
            (row.alternatives ?? []).forEach((item: any) => item.routeType && set.add(item.routeType));
        });
        return Array.from(set.values());
    }, [rows]);

    const bindableCandidates = useMemo(() => {
        if (!activeRow) return [];
        const allCandidates = [activeRow.bestCandidate, ...(activeRow.alternatives ?? [])].filter(Boolean);
        const unique = new Map<string, any>();
        allCandidates.forEach((item: any) => {
            if (!item?.tripId) return;
            if (!unique.has(item.tripId)) unique.set(item.tripId, item);
        });
        return Array.from(unique.values()).filter((item: any) => item.kind !== 'impossible');
    }, [activeRow]);

    const selectedBindingCandidate = useMemo(
        () => bindableCandidates.find((item: any) => item.tripId === bindingCandidateTripId) ?? null,
        [bindableCandidates, bindingCandidateTripId],
    );

    function openBindingModal() {
        if (!activeRow) return;
        const defaultCandidate = bindableCandidates[0] ?? null;
        setBindingError('');
        setBindingSuccess('');
        setBindingCandidateTripId(defaultCandidate?.tripId ?? '');
        setBindingStationId(resolveStationId(stations, [defaultCandidate?.stationName, activeRow.snapshot?.locationStation]));
        setBindingModalOpen(true);
    }

    async function handleCreateBinding() {
        if (!activeRow) {
            setBindingError('Сначала выберите локомотив.');
            return;
        }
        if (!bindingStationId) {
            setBindingError('Выберите станцию подвязки.');
            return;
        }
        if (!selectedBindingCandidate) {
            setBindingError('Выберите допустимый поезд для подвязки.');
            return;
        }

        const arrivalDt = buildOperationalIso(overview?.generatedAt ?? new Date().toISOString(), activeRow.snapshot?.releaseMinute ?? overview?.cursorMinute);
        const departureDt = buildOperationalIso(overview?.generatedAt ?? new Date().toISOString(), selectedBindingCandidate.departureMinute);
        if (!arrivalDt || !departureDt) {
            setBindingError('Не удалось собрать корректное время для сохранения подвязки.');
            return;
        }

        try {
            setBindingSaving(true);
            setBindingError('');
            await createBinding({
                periodId: String(overview?.generatedAt ?? new Date().toISOString()).slice(0, 7),
                turnaroundStationId: bindingStationId,
                arrivalTrainNumber: activeRow.snapshot?.currentTrainNo ?? undefined,
                arrivalDt,
                departureTrainNumber: selectedBindingCandidate.trainNo,
                departureDt,
                locomotiveNumber: activeRow.number,
                locomotiveSeries: activeRow.series,
                locomotiveDepot: activeRow.depot,
                tractionType: activeRow.traction,
            });
            setBindingSuccess(`Подвязка ${activeRow.label} → поезд №${selectedBindingCandidate.trainNo} сохранена.`);
            setBindingModalOpen(false);
            setRefreshTick((current) => current + 1);
        } catch (reason: any) {
            setBindingError(reason?.message ?? 'Не удалось сохранить подвязку.');
        } finally {
            setBindingSaving(false);
        }
    }

    return (
        <div className="flex min-h-screen">
            <Sidebar stationId={stationId} />
            <div className="main-wrapper flex-1">
                <header className="topbar">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-950 via-sky-700 to-cyan-500 shadow-lg shadow-sky-200">
                            <Link2 size={18} className="text-white" />
                        </div>
                        <div>
                            <h1 className="text-lg font-bold text-gray-900">Подвязки локомотивов по всей пассажирской сети</h1>
                            <p className="text-xs text-gray-400">Реальный рабочий экран: весь парк, реальные маршруты КТЖ, кандидаты по станции освобождения, времени и подтвержденной совместимости.</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {(['optimized', 'base'] as ScenarioMode[]).map((item) => (
                            <button
                                key={item}
                                onClick={() => setScenarioMode(item)}
                                className={`rounded-2xl px-4 py-2.5 text-sm font-semibold transition ${scenarioMode === item ? 'bg-slate-950 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-950'}`}
                            >
                                {item === 'optimized' ? 'Optimized' : 'Baseline'}
                            </button>
                        ))}
                        <button onClick={() => setRefreshTick((current) => current + 1)} className="btn-secondary" disabled={loading}>
                            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Обновить
                        </button>
                    </div>
                </header>

                <main className="page-content space-y-6">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
                        {[
                            { label: 'Оперативных локомотивов', value: stats.totalLocomotives, tone: 'bg-slate-50 text-slate-700', icon: Train },
                            { label: 'Есть рекомендация', value: stats.withRecommendation, tone: 'bg-sky-50 text-sky-700', icon: Sparkles },
                            { label: 'Лучше подождать', value: stats.waitingForBest, tone: 'bg-amber-50 text-amber-700', icon: Clock3 },
                            { label: 'Вне нормы', value: stats.outOfNorm, tone: 'bg-rose-50 text-rose-700', icon: AlertTriangle },
                            { label: 'В рейсе сейчас', value: stats.busyNow, tone: 'bg-indigo-50 text-indigo-700', icon: Link2 },
                            { label: 'Свободны / резерв', value: stats.freeNow, tone: 'bg-emerald-50 text-emerald-700', icon: CheckCircle2 },
                        ].map((item) => (
                            <div key={item.label} className={`rounded-[24px] border border-slate-100 p-4 shadow-sm ${item.tone}`}>
                                <div className="mb-1 flex items-center gap-2 text-xs font-semibold"><item.icon size={15} /> {item.label}</div>
                                <div className="text-2xl font-black">{item.value}</div>
                            </div>
                        ))}
                    </div>

                    <section className="rounded-[28px] border border-slate-200 bg-white px-5 py-4 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
                        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                            <div className="grid flex-1 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
                                <div className="relative">
                                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Поиск по локомотиву, станции, поезду" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-9 py-2.5 text-sm text-slate-700 outline-none ring-sky-200 transition focus:ring-2" />
                                </div>
                                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none ring-sky-200 transition focus:ring-2">
                                    <option value="all">Все статусы</option>
                                    <option value="free">Свободен</option>
                                    <option value="idle">Простой</option>
                                    <option value="problem">Вне нормы</option>
                                    <option value="reserve">Резерв</option>
                                    <option value="busy">В рейсе</option>
                                </select>
                                <select value={tractionFilter} onChange={(event) => setTractionFilter(event.target.value)} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none ring-sky-200 transition focus:ring-2">
                                    <option value="all">Вся тяга</option>
                                    <option value="electric">Электровоз</option>
                                    <option value="diesel">Тепловоз</option>
                                    <option value="unknown">Не определено</option>
                                </select>
                                <select value={routeTypeFilter} onChange={(event) => setRouteTypeFilter(event.target.value)} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none ring-sky-200 transition focus:ring-2">
                                    <option value="all">Все типы поездов</option>
                                    {routeTypes.map((item) => (
                                        <option key={item} value={item}>{item === 'talgo' ? 'Тальго' : item === 'private_standard' ? 'Частные стандартные' : 'Стандартные'}</option>
                                    ))}
                                </select>
                                <label className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                                    <input type="checkbox" checked={onlyProblematic} onChange={(event) => setOnlyProblematic(event.target.checked)} /> Только проблемные
                                </label>
                            </div>
                            <div className="text-xs text-slate-500">Срез графика: {overview?.cursorLabel ?? '—'} • Опер. сутки 20:00 → 20:00</div>
                        </div>
                        {bindingSuccess ? (
                            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{bindingSuccess}</div>
                        ) : null}
                    </section>

                    <section className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.4fr)_380px]">
                        <div className="rounded-[1.8rem] border border-white/70 bg-white/95 p-4 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
                            <div className="flex items-center justify-between gap-4">
                                <div>
                                    <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">График простоев локомотивов</div>
                                    <h3 className="mt-1 text-lg font-semibold text-slate-950">Кого можно подвязать сейчас, а кого лучше подержать под правильный поезд</h3>
                                </div>
                                <div className="text-xs text-slate-400">Масштаб шкалы: до {formatMinutes(maxHorizon)}</div>
                            </div>

                            <div className="mt-5 space-y-4">
                                {loading ? <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">Считаю допустимые подвязки по всей сети...</div> : null}
                                {!loading && !filteredRows.length ? <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">По текущим фильтрам локомотивы не найдены.</div> : null}
                                {filteredRows.map((row: any) => {
                                    const active = row.id === activeRow?.id;
                                    const idleWidth = Math.min(((row.snapshot?.currentIdleMinutes ?? 0) / maxHorizon) * 100, 100);
                                    const normWidth = Math.min(((row.normMinutes ?? 0) / maxHorizon) * 100, 100);
                                    const bestWidth = Math.min(((row.bestCandidate?.gapMinutes ?? 0) / maxHorizon) * 100, 100);
                                    return (
                                        <button key={row.id} onClick={() => setSelectedLocomotiveId(row.id)} className={`w-full rounded-[1.7rem] border px-4 py-4 text-left transition ${active ? 'border-sky-300 bg-sky-50/50' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                                            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[230px_minmax(0,1fr)_210px] xl:items-center">
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="rounded-full bg-slate-950 px-2.5 py-1 text-xs font-bold text-white">{row.number}</span>
                                                        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-500">{row.series}</span>
                                                    </div>
                                                    <div className="mt-3 text-lg font-semibold text-slate-950">{row.label}</div>
                                                    <div className="mt-1 text-sm text-slate-500">{row.snapshot?.locationStation ?? '—'} • {row.depot}</div>
                                                    <div className={`mt-3 inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${toneForStatus(row.snapshot?.statusKey)}`}>{row.snapshot?.status}</div>
                                                </div>

                                                <div>
                                                    <div className="rounded-[1.4rem] bg-slate-950 px-3 py-3">
                                                        <div className="relative h-8 overflow-hidden rounded-full border border-slate-800 bg-[#081121]">
                                                            <div className={`absolute inset-y-1 left-1 rounded-full bg-gradient-to-r ${barTone(row)}`} style={{ width: `calc(${Math.max(idleWidth, 2)}% - 0.5rem)` }} />
                                                            <div className="absolute inset-y-0 border-l border-dashed border-slate-300/70" style={{ left: `${normWidth}%` }} />
                                                            <div className="absolute inset-y-0 border-l border-sky-300/70" style={{ left: `${bestWidth}%` }} />
                                                            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/85">простой</div>
                                                            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">лучший поезд</div>
                                                        </div>
                                                    </div>
                                                    <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
                                                        <span>сейчас {formatMinutes(row.snapshot?.currentIdleMinutes)}</span>
                                                        <span>норма {formatMinutes(row.normMinutes)}</span>
                                                        <span>ждать до лучшего {formatMinutes(row.bestCandidate?.gapMinutes)}</span>
                                                        <span>{row.snapshot?.releaseLabel ?? '—'}</span>
                                                    </div>
                                                </div>

                                                <div className="rounded-[1.3rem] border border-slate-200 bg-white px-4 py-4">
                                                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Лучший кандидат</div>
                                                    <div className="mt-3 text-3xl font-black text-slate-950">{row.bestCandidate ? `№${row.bestCandidate.trainNo}` : '—'}</div>
                                                    <div className="mt-1 text-sm text-slate-500">{row.bestCandidate?.departureLabel ?? 'Кандидат не найден'}</div>
                                                    <div className={`mt-3 inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${toneForCandidate(row.bestCandidate?.kind ?? 'impossible')}`}>{row.bestCandidate?.kind ?? 'нет варианта'}</div>
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <aside className="space-y-5">
                            <div className="rounded-[1.8rem] border border-white/70 bg-white/95 p-4 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
                                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Inspector</div>
                                {activeRow ? (
                                    <div className="mt-3 space-y-4">
                                        <div>
                                            <div className="text-xl font-bold text-slate-950">{activeRow.label}</div>
                                            <div className="mt-1 text-sm text-slate-500">{activeRow.snapshot?.locationStation ?? '—'} • {activeRow.depot}</div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3 text-sm">
                                            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3"><div className="text-slate-400">Статус</div><div className="mt-1 font-semibold text-slate-900">{activeRow.snapshot?.status}</div></div>
                                            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3"><div className="text-slate-400">Тяга</div><div className="mt-1 font-semibold text-slate-900">{activeRow.traction}</div></div>
                                            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3"><div className="text-slate-400">Освобождение</div><div className="mt-1 font-semibold text-slate-900">{activeRow.snapshot?.releaseLabel}</div></div>
                                            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3"><div className="text-slate-400">Текущий поезд</div><div className="mt-1 font-semibold text-slate-900">{activeRow.snapshot?.currentTrainNo ? `№${activeRow.snapshot.currentTrainNo}` : '—'}</div></div>
                                        </div>

                                        <div className="rounded-[1.3rem] border border-emerald-200 bg-emerald-50 px-4 py-4">
                                            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">Рекомендуемый вариант</div>
                                            {activeRow.bestCandidate ? (
                                                <>
                                                    <div className="mt-2 text-2xl font-black text-slate-950">№{activeRow.bestCandidate.trainNo}</div>
                                                    <div className="mt-1 text-sm text-slate-600">{activeRow.bestCandidate.routeLabel}</div>
                                                    <div className="mt-3 space-y-1 text-sm text-slate-600">
                                                        <div>Станция: {activeRow.bestCandidate.stationName}</div>
                                                        <div>Отправление: {activeRow.bestCandidate.departureLabel}</div>
                                                        <div>Gap: {formatMinutes(activeRow.bestCandidate.gapMinutes)}</div>
                                                        <div>Тип: {activeRow.bestCandidate.routeTypeLabel}</div>
                                                        <div>Подтверждение: {activeRow.bestCandidate.compatibilitySource}</div>
                                                    </div>
                                                    <div className="mt-3 text-sm leading-6 text-slate-700">{activeRow.bestCandidate.reason}</div>
                                                    <div className="mt-4 flex gap-2">
                                                        <Link href={`/passenger-graph?pairKey=${encodeURIComponent(activeRow.bestCandidate.pairKey)}&trainNo=${encodeURIComponent(activeRow.bestCandidate.trainNo)}&scenario=${scenarioMode}`} className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-center text-sm font-semibold text-slate-700 transition hover:border-slate-300">К графику</Link>
                                                        <Link href={`/passenger-map?pairKey=${encodeURIComponent(activeRow.bestCandidate.pairKey)}&trainNo=${encodeURIComponent(activeRow.bestCandidate.trainNo)}&scenario=${scenarioMode}`} className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-center text-sm font-semibold text-slate-700 transition hover:border-slate-300">К карте</Link>
                                                    </div>
                                                    <button onClick={openBindingModal} className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800">
                                                        <PlusCircle size={16} /> Добавить подвязку
                                                    </button>
                                                </>
                                            ) : <div className="mt-2 text-sm text-slate-600">Подходящий поезд пока не найден по текущей станции, времени и подтвержденным плечам.</div>}
                                        </div>
                                    </div>
                                ) : <div className="mt-3 text-sm text-slate-500">Локомотив не выбран.</div>}
                            </div>

                            <div className="rounded-[1.8rem] border border-white/70 bg-white/95 p-4 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
                                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900"><Sparkles size={16} className="text-sky-600" /> Остальные варианты</div>
                                <div className="mt-4 max-h-[480px] space-y-3 overflow-auto pr-1">
                                    {(activeRow?.alternatives ?? []).map((item: any) => (
                                        <div key={`${activeRow.id}-${item.tripId}`} className={`rounded-[1.25rem] border px-4 py-3 ${toneForCandidate(item.kind)}`}>
                                            <div className="flex items-start justify-between gap-3">
                                                <div>
                                                    <div className="font-semibold">Поезд {item.trainNo}</div>
                                                    <div className="mt-1 text-xs opacity-80">{item.routeLabel}</div>
                                                </div>
                                                <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${toneForCandidate(item.kind)}`}>{item.kind}</span>
                                            </div>
                                            <div className="mt-2 text-xs leading-5 opacity-90">{item.reason}</div>
                                            <div className="mt-2 flex flex-wrap gap-2 text-[11px] opacity-80">
                                                <span>{item.departureLabel}</span>
                                                <span>gap {formatMinutes(item.gapMinutes)}</span>
                                                <span>{item.routeTypeLabel}</span>
                                            </div>
                                        </div>
                                    ))}
                                    {!activeRow?.alternatives?.length ? <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">Для выбранного локомотива дополнительных допустимых вариантов пока нет.</div> : null}
                                </div>
                            </div>
                        </aside>
                    </section>
                </main>
            </div>
            {isBindingModalOpen && activeRow ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
                    <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_35px_90px_rgba(15,23,42,0.28)]">
                        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
                            <div>
                                <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">Новая подвязка</div>
                                <h2 className="mt-2 text-2xl font-black text-slate-950">Подбор локомотива под следующий поезд</h2>
                                <p className="mt-1 text-sm text-slate-500">Сохраняем реальную подвязку в binding-domain на основании текущего состояния локомотива и ranked-кандидатов.</p>
                            </div>
                            <button onClick={() => setBindingModalOpen(false)} className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="grid grid-cols-1 gap-5 overflow-y-auto px-6 py-5 xl:grid-cols-[340px_minmax(0,1fr)]">
                            <div className="space-y-4 rounded-[28px] border border-slate-200 bg-slate-50/70 p-4">
                                <div>
                                    <label className="mb-1.5 block text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Станция подвязки</label>
                                    <select value={bindingStationId} onChange={(event) => setBindingStationId(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none ring-sky-200 transition focus:ring-2">
                                        <option value="">Выберите станцию...</option>
                                        {stations.map((station) => (
                                            <option key={station.id} value={station.id}>{station.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="rounded-[24px] border border-slate-200 bg-white px-4 py-4">
                                    <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Статус локомотива</div>
                                    <div className="mt-3 flex items-center gap-2">
                                        <span className="rounded-full bg-slate-950 px-2.5 py-1 text-xs font-bold text-white">{activeRow.number}</span>
                                        <span className="rounded-full border border-slate-200 px-2.5 py-1 text-xs font-bold text-slate-500">{activeRow.series}</span>
                                    </div>
                                    <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                                        <div><div className="text-xs text-slate-400">Станция</div><div className="font-semibold text-slate-900">{activeRow.snapshot?.locationStation ?? '—'}</div></div>
                                        <div><div className="text-xs text-slate-400">Статус</div><div className="font-semibold text-slate-900">{activeRow.snapshot?.status ?? '—'}</div></div>
                                        <div><div className="text-xs text-slate-400">Освобождение</div><div className="font-semibold text-slate-900">{activeRow.snapshot?.releaseLabel ?? '—'}</div></div>
                                        <div><div className="text-xs text-slate-400">Текущий поезд</div><div className="font-semibold text-slate-900">{activeRow.snapshot?.currentTrainNo ? `№${activeRow.snapshot.currentTrainNo}` : '—'}</div></div>
                                    </div>
                                </div>
                                {bindingError ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{bindingError}</div> : null}
                            </div>
                            <div className="space-y-4">
                                <div className="rounded-[28px] border border-slate-200 bg-white px-5 py-4">
                                    <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Ranked-кандидаты</div>
                                    <h3 className="mt-2 text-xl font-bold text-slate-950">Лучший следующий поезд и остальные допустимые варианты</h3>
                                    <p className="mt-1 text-sm text-slate-500">Список уже отфильтрован по реальной станции, времени, резерву и подтвержденной совместимости. Impossible-варианты сюда не попадают.</p>
                                </div>
                                <div className="space-y-3">
                                    {bindableCandidates.length ? bindableCandidates.map((item: any) => {
                                        const selected = item.tripId === bindingCandidateTripId;
                                        return (
                                            <button key={item.tripId} onClick={() => setBindingCandidateTripId(item.tripId)} className={`w-full rounded-[24px] border px-4 py-4 text-left transition ${selected ? 'border-sky-300 bg-sky-50/50' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                                                <div className="flex items-start justify-between gap-4">
                                                    <div>
                                                        <div className="text-lg font-bold text-slate-950">Поезд №{item.trainNo}</div>
                                                        <div className="mt-1 text-sm text-slate-500">{item.routeLabel}</div>
                                                    </div>
                                                    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${toneForCandidate(item.kind)}`}>{item.kind}</span>
                                                </div>
                                                <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-slate-600">
                                                    <div>Станция: {item.stationName}</div>
                                                    <div>Отправление: {item.departureLabel}</div>
                                                    <div>Gap: {formatMinutes(item.gapMinutes)}</div>
                                                    <div>Тип: {item.routeTypeLabel}</div>
                                                </div>
                                                <div className="mt-3 text-sm leading-6 text-slate-700">{item.reason}</div>
                                            </button>
                                        );
                                    }) : <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">По этому локомотиву пока нет допустимых кандидатов для следующего поезда.</div>}
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center justify-end gap-3 border-t border-slate-100 px-6 py-4">
                            <button onClick={() => setBindingModalOpen(false)} className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300">Отмена</button>
                            <button onClick={handleCreateBinding} disabled={bindingSaving || !selectedBindingCandidate || !bindingStationId} className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300">
                                {bindingSaving ? 'Сохраняю подвязку...' : 'Добавить подвязку'}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
