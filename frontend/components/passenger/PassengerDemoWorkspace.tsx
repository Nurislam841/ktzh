'use client';

import { useEffect, useState } from 'react';
import {
    Download,
    FileSpreadsheet,
    Printer,
    RefreshCw,
    Search,
    Table2,
    Train,
    TrainFront,
    Waypoints,
} from 'lucide-react';
import Sidebar from '../Sidebar';
import {
    downloadPassengerDemoBindingsWorkbook,
    getPassengerDemoBindings,
    getStations,
    pickBestStationId,
} from '../../lib/api';

function downloadCsv(filename: string, rows: Array<Record<string, string | number | null>>) {
    if (!rows.length) return;
    const headers = Object.keys(rows[0]);
    const csv = [
        headers.join(','),
        ...rows.map((row) => headers.map((header) => `"${String(row[header] ?? '').replace(/"/g, '""')}"`).join(',')),
    ].join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(href);
}

function toneForCategory(value: string) {
    if (value === 'talgo') return 'bg-violet-50 text-violet-700 border-violet-200';
    if (value === 'international') return 'bg-sky-50 text-sky-700 border-sky-200';
    if (value === 'private_standard') return 'bg-amber-50 text-amber-700 border-amber-200';
    return 'bg-emerald-50 text-emerald-700 border-emerald-200';
}

function toneForLocomotive(value: string) {
    return value === 'electric'
        ? 'bg-sky-50 text-sky-700 border-sky-200'
        : 'bg-amber-50 text-amber-700 border-amber-200';
}

function toneForFleetStatus(value: string) {
    return value === 'assigned'
        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
        : 'bg-slate-100 text-slate-600 border-slate-200';
}

function toneForLiveState(value: string) {
    if (value === 'outbound' || value === 'return') return 'bg-sky-50 text-sky-700 border-sky-200';
    if (value === 'turnaround') return 'bg-amber-50 text-amber-700 border-amber-200';
    if (value === 'waiting') return 'bg-rose-50 text-rose-700 border-rose-200';
    if (value === 'prep') return 'bg-violet-50 text-violet-700 border-violet-200';
    if (value === 'ready') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    return 'bg-slate-100 text-slate-600 border-slate-200';
}

function StatCard({
    label,
    value,
    note,
    icon: Icon,
    cls,
}: {
    label: string;
    value: string | number;
    note: string;
    icon: any;
    cls: string;
}) {
    return (
        <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
            <div className="mb-3 flex items-center justify-between">
                <span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${cls}`}>
                    <Icon size={18} />
                </span>
                <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">{label}</div>
            </div>
            <div className="text-2xl font-black text-slate-950">{value}</div>
            <div className="mt-2 text-sm leading-6 text-slate-500">{note}</div>
        </div>
    );
}

export default function PassengerDemoWorkspace({ initialStationId = '' }: { initialStationId?: string }) {
    const [stationId, setStationId] = useState('');
    const [overview, setOverview] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [fleetSearch, setFleetSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('all');
    const [fleetStatusFilter, setFleetStatusFilter] = useState('all');
    const [selectedPair, setSelectedPair] = useState('');
    const [refreshTick, setRefreshTick] = useState(0);

    useEffect(() => {
        let mounted = true;
        (async () => {
            const stationIdFromUrl = initialStationId.trim();
            if (stationIdFromUrl) {
                setStationId(stationIdFromUrl);
                window.localStorage.setItem('ktz_station_id', stationIdFromUrl);
                return;
            }

            const stationResponse = await getStations();
            if (!mounted) return;
            const fromStorage = window.localStorage.getItem('ktz_station_id') ?? '';
            const sid = fromStorage || pickBestStationId(stationResponse.stations);
            if (!mounted) return;
            setStationId(sid);
            if (sid) window.localStorage.setItem('ktz_station_id', sid);
        })();
        return () => {
            mounted = false;
        };
    }, [initialStationId]);

    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        setError('');
        getPassengerDemoBindings({ signal: controller.signal })
            .then((data) => {
                setOverview(data);
                setSelectedPair((current) => current || data.trains?.[0]?.pairKey || '');
            })
            .catch((reason: any) => {
                if (!controller.signal.aborted) {
                    setError(reason?.message ?? 'Не удалось загрузить demo-витрину.');
                }
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });
        return () => controller.abort();
    }, [refreshTick]);

    const trains = overview?.trains ?? [];
    const locomotives = overview?.locomotives ?? [];
    const searchNeedle = search.trim().toLowerCase();
    const fleetNeedle = fleetSearch.trim().toLowerCase();
    const filteredTrains = trains.filter((item: any) => {
        const matchesSearch = !searchNeedle || [
            item.pair,
            item.routeLabel,
            item.origin,
            item.destination,
            item.assignedLocomotiveLabel,
            item.carrier,
        ].join(' ').toLowerCase().includes(searchNeedle);
        const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter;
        return matchesSearch && matchesCategory;
    });

    useEffect(() => {
        if (!filteredTrains.length) return;
        if (!filteredTrains.some((item: any) => item.pairKey === selectedPair)) {
            setSelectedPair(filteredTrains[0].pairKey);
        }
    }, [filteredTrains, selectedPair]);

    const activeTrain =
        filteredTrains.find((item: any) => item.pairKey === selectedPair) ??
        trains.find((item: any) => item.pairKey === selectedPair) ??
        filteredTrains[0] ??
        null;

    const filteredLocomotives = locomotives.filter((item: any) => {
        const matchesSearch = !fleetNeedle || [
            item.label,
            item.station,
            item.assignedPair,
            item.assignedRouteLabel,
            item.note,
        ].join(' ').toLowerCase().includes(fleetNeedle);
        const matchesStatus = fleetStatusFilter === 'all' || item.status === fleetStatusFilter;
        return matchesSearch && matchesStatus;
    });

    const linkedLocomotive = activeTrain
        ? locomotives.find((item: any) => item.id === activeTrain.assignedLocomotiveId) ?? null
        : null;
    const live = overview?.live ?? {
        simulatedNowLabel: '—',
        summary: {
            trainsInMotion: 0,
            trainsOnTurnaround: 0,
            trainsPreparing: 0,
            assignedLocomotivesBusy: 0,
            reserveLocomotives: 0,
            wagonsWaitingForLoco: 0,
        },
        rows: [],
    };
    const dailyReport = overview?.dailyReport ?? {
        dateLabel: '—',
        summary: {
            trainsScheduled: 0,
            departuresToday: 0,
            arrivalsToday: 0,
            averageTurnaroundHours: 0,
            baselineAverageIdleHours: 0,
            optimizedAverageIdleHours: 0,
            savedIdleHours: 0,
        },
        rows: [],
    };
    const monthlyReport = overview?.monthlyReport ?? {
        monthLabel: '—',
        summary: {
            totalTrainDays: 0,
            averageActiveTrainsPerDay: 0,
            averageTurnaroundHoursPerTrainDay: 0,
            averageBaselineIdleHoursPerTrainDay: 0,
            averageOptimizedIdleHoursPerTrainDay: 0,
            savedIdleHoursTotal: 0,
        },
        days: [],
        rows: [],
    };
    const visiblePairKeys = new Set(filteredTrains.map((item: any) => item.pairKey));
    const filteredLiveRows = (live.rows ?? []).filter((item: any) => visiblePairKeys.has(item.pairKey));
    const filteredDailyRows = (dailyReport.rows ?? []).filter((item: any) => visiblePairKeys.has(item.pairKey));
    const filteredMonthlyRows = (monthlyReport.rows ?? []).filter((item: any) => visiblePairKeys.has(item.pairKey));
    const activeLiveRow = activeTrain
        ? filteredLiveRows.find((item: any) => item.pairKey === activeTrain.pairKey) ??
          live.rows?.find((item: any) => item.pairKey === activeTrain.pairKey) ??
          null
        : null;
    const activeDailyRow = activeTrain
        ? filteredDailyRows.find((item: any) => item.pairKey === activeTrain.pairKey) ??
          dailyReport.rows?.find((item: any) => item.pairKey === activeTrain.pairKey) ??
          null
        : null;
    const activeMonthlyRow = activeTrain
        ? filteredMonthlyRows.find((item: any) => item.pairKey === activeTrain.pairKey) ??
          monthlyReport.rows?.find((item: any) => item.pairKey === activeTrain.pairKey) ??
          null
        : null;

    const summary = overview?.summary ?? {
        totalTrains: 0,
        totalLocomotives: 0,
        electricLocomotives: 0,
        dieselLocomotives: 0,
        assignedLocomotives: 0,
        reserveLocomotives: 0,
        totalWagons: 0,
        monthlySavedIdleHours: 0,
    };

    function handlePrint() {
        window.print();
    }

    return (
        <div className="flex min-h-screen bg-slate-50">
            <Sidebar stationId={stationId} />
            <div className="main-wrapper flex-1">
                <header className="topbar print-hidden">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-950 via-sky-700 to-cyan-500 shadow-lg shadow-sky-200">
                            <TrainFront size={18} className="text-white" />
                        </div>
                        <div>
                            <h1 className="text-lg font-bold text-gray-900">Demo-подвязка пассажирских поездов</h1>
                            <p className="text-xs text-gray-400">
                                42 поезда из перечня, 80 условных локомотивов и отчет, который показывает, как платформа режет простой вагонов за счет автоматической подвязки по станции.
                            </p>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            onClick={() => setRefreshTick((current) => current + 1)}
                            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300"
                        >
                            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                            Обновить
                        </button>
                        <button
                            onClick={downloadPassengerDemoBindingsWorkbook}
                            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300"
                        >
                            <FileSpreadsheet size={14} />
                            Excel
                        </button>
                        <button
                            onClick={handlePrint}
                            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300"
                        >
                            <Printer size={14} />
                            Печать / PDF
                        </button>
                        <button
                            onClick={() => downloadCsv('demo-trains-report.csv', trains.map((item: any) => ({
                                pair: item.pair,
                                route: item.routeLabel,
                                category: item.categoryLabel,
                                periodicity: item.periodicity,
                                compositions: item.compositions,
                                wagons: item.wagonCount,
                                traction: item.tractionLabel,
                                locomotive: item.assignedLocomotiveLabel,
                                carrier: item.carrier,
                            })))}
                            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300"
                        >
                            <Download size={14} />
                            Поезда CSV
                        </button>
                        <button
                            onClick={() => downloadCsv('demo-locomotives-report.csv', locomotives.map((item: any) => ({
                                locomotive: item.label,
                                traction: item.tractionLabel,
                                status: item.statusLabel,
                                train: item.assignedPair,
                                route: item.assignedRouteLabel,
                                station: item.station,
                                note: item.note,
                            })))}
                            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300"
                        >
                            <Download size={14} />
                            Локомотивы CSV
                        </button>
                    </div>
                </header>

                <main className="page-content space-y-6 print-area">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
                        <StatCard label="Поезда" value={summary.totalTrains} note="Полный demo-перечень из двух фото." icon={Train} cls="bg-slate-100 text-slate-700" />
                        <StatCard label="Вагонность" value={summary.totalWagons} note="Суммарная вагонность по перечню маршрутов." icon={Waypoints} cls="bg-sky-50 text-sky-700" />
                        <StatCard label="Локомотивы" value={summary.totalLocomotives} note="40 электровозов и 40 тепловозов." icon={TrainFront} cls="bg-emerald-50 text-emerald-700" />
                        <StatCard label="Электровозы" value={summary.electricLocomotives} note="Парк для тальго и международных маршрутов." icon={TrainFront} cls="bg-sky-50 text-sky-700" />
                        <StatCard label="Тепловозы" value={summary.dieselLocomotives} note="Парк для стандартных и частных маршрутов." icon={TrainFront} cls="bg-amber-50 text-amber-700" />
                        <StatCard label="Снижение простоя" value={`${summary.monthlySavedIdleHours} ч`} note="Суммарная экономия часов за месяц против жесткой ручной подвязки." icon={Table2} cls="bg-violet-50 text-violet-700" />
                    </div>

                    <section className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.35fr)_420px]">
                        <div className="rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
                            <div className="border-b border-slate-100 px-5 py-4">
                                <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">Псевдо real-time</div>
                                <h2 className="mt-2 text-xl font-black text-slate-950">Как будто весь парк живет прямо сейчас</h2>
                                <p className="mt-1 text-sm text-slate-500">
                                    Сервер симулирует цикл движения и в каждом окне пытается выдать составу любой свободный локомотив той же тяги на той же станции.
                                </p>
                            </div>
                            <div className="max-h-[420px] overflow-auto">
                                <table className="w-full min-w-[960px] text-sm">
                                    <thead className="sticky top-0 z-10 bg-white">
                                        <tr className="border-b border-slate-100 text-left">
                                            {['Поезд', 'Маршрут', 'Локомотив', 'Статус', 'Локация', 'Следующее событие', 'Вручную / авто / экономия'].map((label) => (
                                                <th key={label} className="px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-slate-500">{label}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredLiveRows.map((item: any) => (
                                            <tr key={`live-${item.pairKey}`} className={`border-b border-slate-100 ${item.pairKey === activeTrain?.pairKey ? 'bg-sky-50/50' : ''}`}>
                                                <td className="px-4 py-4 font-mono text-base font-black text-slate-950">№{item.pair}</td>
                                                <td className="px-4 py-4 text-slate-700">{item.routeLabel}</td>
                                                <td className="px-4 py-4 font-semibold text-slate-900">{item.locomotiveLabel}</td>
                                                <td className="px-4 py-4">
                                                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold ${toneForLiveState(item.stateKey)}`}>
                                                        {item.stateLabel}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-4 text-slate-700">{item.currentLocation}</td>
                                                <td className="px-4 py-4">
                                                    <div className="font-semibold text-slate-900">{item.nextEventLabel}</div>
                                                    <div className="mt-1 text-xs text-slate-500">{item.nextEventTime}</div>
                                                </td>
                                                <td className="px-4 py-4">
                                                    <div className="text-xs text-slate-500">вручную {item.manualIdleLabel}</div>
                                                    <div className="mt-1 text-xs font-semibold text-slate-800">авто {item.optimizedIdleLabel}</div>
                                                    <div className="mt-1 text-xs font-semibold text-emerald-700">экономия {item.savedIdleLabel}</div>
                                                </td>
                                            </tr>
                                        ))}
                                        {!filteredLiveRows.length ? (
                                            <tr>
                                                <td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-500">Для текущих фильтров live-снимок пуст.</td>
                                            </tr>
                                        ) : null}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <aside className="space-y-5">
                            <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
                                <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">Срез времени</div>
                                <div className="mt-2 text-2xl font-black text-slate-950">{live.simulatedNowLabel}</div>
                                <div className="mt-1 text-sm text-slate-500">Текущий симулированный момент по всей сети с перераспределением свободной тяги.</div>
                                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3"><div className="text-xs text-slate-400">В пути</div><div className="mt-1 font-semibold text-slate-900">{live.summary.trainsInMotion}</div></div>
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3"><div className="text-xs text-slate-400">На обороте</div><div className="mt-1 font-semibold text-slate-900">{live.summary.trainsOnTurnaround}</div></div>
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3"><div className="text-xs text-slate-400">Ждут тягу</div><div className="mt-1 font-semibold text-slate-900">{live.summary.wagonsWaitingForLoco}</div></div>
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3"><div className="text-xs text-slate-400">Экономия сегодня</div><div className="mt-1 font-semibold text-emerald-700">{dailyReport.summary.savedIdleHours} ч</div></div>
                                </div>
                            </div>

                            <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
                                <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">Суточная сводка</div>
                                <div className="mt-2 text-xl font-black text-slate-950">{dailyReport.dateLabel}</div>
                                <div className="mt-4 space-y-3 text-sm">
                                    <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"><span className="text-slate-500">Поездов в графике</span><span className="font-semibold text-slate-900">{dailyReport.summary.trainsScheduled}</span></div>
                                    <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"><span className="text-slate-500">Отправлений за сутки</span><span className="font-semibold text-slate-900">{dailyReport.summary.departuresToday}</span></div>
                                    <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"><span className="text-slate-500">Прибытий за сутки</span><span className="font-semibold text-slate-900">{dailyReport.summary.arrivalsToday}</span></div>
                                    <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"><span className="text-slate-500">Средний оборот</span><span className="font-semibold text-slate-900">{dailyReport.summary.averageTurnaroundHours} ч</span></div>
                                    <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"><span className="text-slate-500">Простой вручную</span><span className="font-semibold text-slate-900">{dailyReport.summary.baselineAverageIdleHours} ч</span></div>
                                    <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"><span className="text-slate-500">Простой после авто</span><span className="font-semibold text-slate-900">{dailyReport.summary.optimizedAverageIdleHours} ч</span></div>
                                    <div className="flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3"><span className="text-emerald-700">Сэкономлено за сутки</span><span className="font-semibold text-emerald-800">{dailyReport.summary.savedIdleHours} ч</span></div>
                                </div>
                            </div>
                        </aside>
                    </section>

                    <section className="rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
                        <div className="border-b border-slate-100 px-5 py-4">
                            <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">Суточный отчет</div>
                            <h2 className="mt-2 text-xl font-black text-slate-950">На сегодня: как авто-подвязка режет ожидание состава</h2>
                        </div>
                        <div className="max-h-[520px] overflow-auto">
                            <table className="w-full min-w-[1540px] text-sm">
                                <thead className="sticky top-0 z-10 bg-white">
                                    <tr className="border-b border-slate-100 text-left">
                                        {['№', 'Маршрут', 'Локомотив', 'Статус сейчас', 'Сегодня', 'План', 'Ручная схема', 'Авто-подвязка', 'Возврат', 'Оборот', 'Простой вручную', 'Простой авто', 'Экономия'].map((label) => (
                                            <th key={label} className="px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-slate-500">{label}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredDailyRows.map((item: any) => (
                                        <tr key={`daily-${item.pairKey}`} className={`border-b border-slate-100 ${item.pairKey === activeTrain?.pairKey ? 'bg-sky-50/50' : ''}`}>
                                            <td className="px-4 py-4 font-mono text-base font-black text-slate-950">№{item.pair}</td>
                                            <td className="px-4 py-4 text-slate-700">{item.routeLabel}</td>
                                            <td className="px-4 py-4 font-semibold text-slate-900">{item.locomotiveLabel}</td>
                                            <td className="px-4 py-4 text-slate-700">{item.statusNow}</td>
                                            <td className="px-4 py-4">
                                                <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold ${item.scheduledToday ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                                                    {item.scheduledLabel}
                                                </span>
                                            </td>
                                            <td className="px-4 py-4 text-slate-700">{item.plannedDepartureLabel}</td>
                                            <td className="px-4 py-4 text-slate-700">{item.baselineDepartureLabel}</td>
                                            <td className="px-4 py-4 font-semibold text-slate-900">{item.autoDepartureLabel}</td>
                                            <td className="px-4 py-4 text-slate-700">{item.returnArrivalLabel}</td>
                                            <td className="px-4 py-4 text-slate-700">{item.turnaroundLabel}</td>
                                            <td className="px-4 py-4 text-slate-700">{item.baselineIdleLabel}</td>
                                            <td className="px-4 py-4 text-slate-700">{item.optimizedIdleLabel}</td>
                                            <td className="px-4 py-4">
                                                <div className="font-semibold text-emerald-700">{item.savedIdleLabel}</div>
                                                <div className="mt-1 text-xs text-slate-500">след. запуск {item.nextRunLabel}</div>
                                            </td>
                                        </tr>
                                    ))}
                                    {!filteredDailyRows.length ? (
                                        <tr>
                                            <td colSpan={13} className="px-4 py-12 text-center text-sm text-slate-500">Для текущих фильтров суточный отчет пуст.</td>
                                        </tr>
                                    ) : null}
                                </tbody>
                            </table>
                        </div>
                    </section>

                    <section className="rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
                        <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-4 xl:flex-row xl:items-end xl:justify-between">
                            <div>
                                <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">Месячный отчет</div>
                                <h2 className="mt-2 text-xl font-black text-slate-950">Матрица сокращения простоя по дням месяца</h2>
                                <p className="mt-1 text-sm text-slate-500">
                                    В ячейке видно, когда состав должен был выйти, когда реально вышел при авто-подвязке и сколько часов ожидания удалось снять по сравнению с жесткой схемой.
                                </p>
                            </div>
                            <div className="grid grid-cols-2 gap-3 text-sm xl:grid-cols-5">
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"><div className="text-xs text-slate-400">Месяц</div><div className="mt-1 font-semibold text-slate-900">{monthlyReport.monthLabel}</div></div>
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"><div className="text-xs text-slate-400">Поездо-дней</div><div className="mt-1 font-semibold text-slate-900">{monthlyReport.summary.totalTrainDays}</div></div>
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"><div className="text-xs text-slate-400">Активно в среднем</div><div className="mt-1 font-semibold text-slate-900">{monthlyReport.summary.averageActiveTrainsPerDay}</div></div>
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"><div className="text-xs text-slate-400">Вручную</div><div className="mt-1 font-semibold text-slate-900">{monthlyReport.summary.averageBaselineIdleHoursPerTrainDay} ч</div></div>
                                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3"><div className="text-xs text-emerald-700">Авто / экономия</div><div className="mt-1 font-semibold text-emerald-800">{monthlyReport.summary.averageOptimizedIdleHoursPerTrainDay} ч / {monthlyReport.summary.savedIdleHoursTotal} ч</div></div>
                            </div>
                        </div>
                        <div className="max-h-[620px] overflow-auto">
                            <table className="w-full min-w-[4200px] text-xs">
                                <thead className="sticky top-0 z-10 bg-white">
                                    <tr className="border-b border-slate-100 text-left">
                                        <th className="px-3 py-3 text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Поезд</th>
                                        <th className="px-3 py-3 text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Маршрут / Авто-локо</th>
                                        <th className="px-3 py-3 text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Вручную / авто / экономия</th>
                                        {monthlyReport.days.map((day: any) => (
                                            <th key={day.dateKey} className={`min-w-[118px] px-2 py-3 text-center text-[11px] font-black uppercase tracking-[0.14em] ${day.isToday ? 'bg-sky-50 text-sky-700' : 'text-slate-500'}`}>
                                                <div>{day.dayNumber}</div>
                                                <div className="mt-1">{day.weekdayShort}</div>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredMonthlyRows.map((row: any) => (
                                        <tr key={`month-${row.pairKey}`} className={`border-b border-slate-100 align-top ${row.pairKey === activeTrain?.pairKey ? 'bg-sky-50/35' : ''}`}>
                                            <td className="px-3 py-3">
                                                <div className="font-mono text-sm font-black text-slate-950">№{row.pair}</div>
                                                <div className="mt-1 text-[11px] text-slate-500">{row.periodicity}</div>
                                            </td>
                                            <td className="px-3 py-3">
                                                <div className="font-semibold text-slate-900">{row.routeLabel}</div>
                                                <div className="mt-1 text-[11px] text-slate-500">{row.locomotiveLabel}</div>
                                            </td>
                                            <td className="px-3 py-3">
                                                <div className="font-semibold text-slate-900">{row.averageBaselineIdleHours} ч / {row.averageOptimizedIdleHours} ч</div>
                                                <div className="mt-1 text-[11px] font-semibold text-emerald-700">экономия {row.savedIdleHours} ч</div>
                                                <div className="mt-1 text-[11px] text-slate-500">оборот {row.averageTurnaroundHours} ч</div>
                                            </td>
                                            {row.cells.map((cell: any) => (
                                                <td key={`${row.pairKey}-${cell.dateKey}`} className={`min-w-[118px] px-2 py-3 ${cell.isActive ? '' : 'bg-slate-50/70'}`}>
                                                    {cell.isActive ? (
                                                        <div className="space-y-1 rounded-2xl border border-slate-200 bg-white px-2 py-2 text-center">
                                                            <div className="font-black text-slate-950">{row.pair}</div>
                                                            <div className="text-[11px] text-slate-500">план {cell.plannedDepartureLabel}</div>
                                                            <div className="text-[11px] text-slate-700">авто {cell.autoDepartureLabel}</div>
                                                            <div className="text-[11px] text-slate-500">ручн {cell.baselineIdleLabel}</div>
                                                            <div className="text-[11px] text-slate-700">авто {cell.optimizedIdleLabel}</div>
                                                            <div className="text-[11px] font-semibold text-emerald-700">экономия {cell.savedIdleLabel}</div>
                                                        </div>
                                                    ) : (
                                                        <div className="text-center text-[11px] text-slate-300">—</div>
                                                    )}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                    {!filteredMonthlyRows.length ? (
                                        <tr>
                                            <td colSpan={3 + (monthlyReport.days?.length ?? 0)} className="px-4 py-12 text-center text-sm text-slate-500">Для текущих фильтров месячный отчет пуст.</td>
                                        </tr>
                                    ) : null}
                                </tbody>
                            </table>
                        </div>
                    </section>

                    <section className="rounded-[28px] border border-slate-200 bg-white px-5 py-4 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
                        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                            <div>
                                <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">Основной реестр</div>
                                <h2 className="mt-2 text-xl font-black text-slate-950">Поезда, вагоны и снижение простоя</h2>
                                <p className="mt-1 text-sm text-slate-500">
                                    Слева полный перечень поездов, справа выбранный маршрут и эффект авто-подвязки. Ниже отдельная витрина парка по станциям.
                                </p>
                            </div>
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[280px_220px]">
                                <div className="relative">
                                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input
                                        value={search}
                                        onChange={(event) => setSearch(event.target.value)}
                                        placeholder="Поиск по поезду, маршруту, локомотиву"
                                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-9 py-2.5 text-sm text-slate-700 outline-none ring-sky-200 transition focus:ring-2"
                                    />
                                </div>
                                <select
                                    value={categoryFilter}
                                    onChange={(event) => setCategoryFilter(event.target.value)}
                                    className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none ring-sky-200 transition focus:ring-2"
                                >
                                    <option value="all">Все категории</option>
                                    <option value="talgo">Тальго</option>
                                    <option value="standard">Стандартные</option>
                                    <option value="private_standard">Частные</option>
                                    <option value="international">Международные</option>
                                </select>
                            </div>
                        </div>
                        {error ? (
                            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
                        ) : null}
                    </section>

                    <section className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.45fr)_380px]">
                        <div className="rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
                            <div className="border-b border-slate-100 px-5 py-4">
                                <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">Список поездов</div>
                                <h3 className="mt-2 text-lg font-black text-slate-950">42 маршрута из перечня</h3>
                            </div>
                            <div className="max-h-[660px] overflow-auto">
                                <table className="w-full min-w-[1120px] text-sm">
                                    <thead className="sticky top-0 z-10 bg-white">
                                        <tr className="border-b border-slate-100 text-left">
                                            {['№', 'Маршрут', 'Категория', 'Периодичность', 'Составы', 'Ваг.', 'Тяга', 'Локомотив', 'Перевозчик'].map((label) => (
                                                <th key={label} className="px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-slate-500">{label}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {loading ? (
                                            <tr>
                                                <td colSpan={9} className="px-4 py-12 text-center text-sm text-slate-500">Собираю demo-витрину поездов и локомотивов...</td>
                                            </tr>
                                        ) : null}
                                        {!loading && !filteredTrains.length ? (
                                            <tr>
                                                <td colSpan={9} className="px-4 py-12 text-center text-sm text-slate-500">По текущим фильтрам поезда не найдены.</td>
                                            </tr>
                                        ) : null}
                                        {!loading ? filteredTrains.map((item: any) => {
                                            const active = item.pairKey === activeTrain?.pairKey;
                                            return (
                                                <tr
                                                    key={item.pairKey}
                                                    onClick={() => setSelectedPair(item.pairKey)}
                                                    className={`cursor-pointer border-b border-slate-100 transition ${active ? 'bg-sky-50/60' : 'hover:bg-slate-50/80'}`}
                                                >
                                                    <td className="px-4 py-4 font-mono text-base font-black text-slate-950">{item.pair}</td>
                                                    <td className="px-4 py-4">
                                                        <div className="font-semibold text-slate-900">{item.routeLabel}</div>
                                                        <div className="mt-1 text-xs text-slate-500">{item.origin} → {item.destination}</div>
                                                    </td>
                                                    <td className="px-4 py-4">
                                                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold ${toneForCategory(item.category)}`}>
                                                            {item.categoryLabel}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-4 font-semibold text-slate-900">{item.periodicity}</td>
                                                    <td className="px-4 py-4 text-slate-700">{item.compositions}</td>
                                                    <td className="px-4 py-4 font-semibold text-slate-900">{item.wagonCount}</td>
                                                    <td className="px-4 py-4">
                                                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold ${toneForLocomotive(item.tractionType)}`}>
                                                            {item.tractionLabel}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-4">
                                                        <div className="font-semibold text-slate-900">{item.assignedLocomotiveLabel}</div>
                                                        <div className="mt-1 text-xs text-slate-500">{item.assignedLocomotiveStatus}</div>
                                                    </td>
                                                    <td className="px-4 py-4 text-slate-700">{item.carrier}</td>
                                                </tr>
                                            );
                                        }) : null}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <aside className="space-y-5">
                            <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
                                <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">Выбранный поезд</div>
                                {activeTrain ? (
                                    <div className="mt-3 space-y-4">
                                        <div>
                                            <div className="text-2xl font-black text-slate-950">№{activeTrain.pair}</div>
                                            <div className="mt-1 text-sm text-slate-500">{activeTrain.routeLabel}</div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3 text-sm">
                                            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                                                <div className="text-xs text-slate-400">Категория</div>
                                                <div className="mt-1 font-semibold text-slate-900">{activeTrain.categoryLabel}</div>
                                            </div>
                                            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                                                <div className="text-xs text-slate-400">Вагонов</div>
                                                <div className="mt-1 font-semibold text-slate-900">{activeTrain.wagonCount}</div>
                                            </div>
                                            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                                                <div className="text-xs text-slate-400">Периодичность</div>
                                                <div className="mt-1 font-semibold text-slate-900">{activeTrain.periodicity}</div>
                                            </div>
                                            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                                                <div className="text-xs text-slate-400">Остановок</div>
                                                <div className="mt-1 font-semibold text-slate-900">{activeTrain.stopCount}</div>
                                            </div>
                                            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                                                <div className="text-xs text-slate-400">Сейчас</div>
                                                <div className="mt-1 font-semibold text-slate-900">{activeLiveRow?.stateLabel ?? '—'}</div>
                                            </div>
                                            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                                                <div className="text-xs text-slate-400">Экономия/мес</div>
                                                <div className="mt-1 font-semibold text-emerald-700">{activeMonthlyRow ? `${activeMonthlyRow.savedIdleHours} ч` : '—'}</div>
                                            </div>
                                        </div>

                                        <div className="rounded-[24px] border border-emerald-200 bg-emerald-50 px-4 py-4">
                                            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-700">Автоматическая подвязка</div>
                                            <div className="mt-2 text-3xl font-black text-slate-950">{activeTrain.assignedLocomotiveLabel}</div>
                                            <div className="mt-1 text-sm text-slate-600">{activeTrain.tractionLabel} · не жесткая подвязка на месяц, а текущий кандидат станции</div>
                                            <div className="mt-3 space-y-1 text-sm text-slate-700">
                                                <div>Маршрут: {activeTrain.origin} → {activeTrain.destination}</div>
                                                <div>Статус: {activeTrain.assignedLocomotiveStatus}</div>
                                                <div>Перевозчик: {activeTrain.carrier}</div>
                                                <div>Сейчас по циклу: {activeLiveRow?.currentLocation ?? '—'}</div>
                                                <div>Сегодня вручную: {activeDailyRow?.baselineIdleLabel ?? '—'}</div>
                                                <div>Сегодня после авто: {activeDailyRow?.optimizedIdleLabel ?? '—'}</div>
                                                <div className="font-semibold text-emerald-700">Сегодня экономия: {activeDailyRow?.savedIdleLabel ?? '—'}</div>
                                            </div>
                                        </div>

                                        {linkedLocomotive ? (
                                            <div className="rounded-[24px] border border-slate-200 bg-white px-4 py-4">
                                                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Локомотив в парке</div>
                                                <div className="mt-2 text-lg font-bold text-slate-950">{linkedLocomotive.label}</div>
                                                <div className="mt-1 text-sm text-slate-500">{linkedLocomotive.station}</div>
                                                <div className="mt-3 text-sm leading-6 text-slate-700">{linkedLocomotive.note}</div>
                                            </div>
                                        ) : null}
                                    </div>
                                ) : (
                                    <div className="mt-3 text-sm text-slate-500">Выберите поезд в таблице слева.</div>
                                )}
                            </div>
                        </aside>
                    </section>

                    <section className="rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
                        <div className="border-b border-slate-100 px-5 py-4">
                            <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">Маршрутная таблица</div>
                            <h3 className="mt-2 text-lg font-black text-slate-950">Станции, прибытие, отправление и простой состава</h3>
                        </div>
                        <div className="max-h-[560px] overflow-auto">
                            <table className="w-full min-w-[920px] text-sm">
                                <thead className="sticky top-0 z-10 bg-slate-50">
                                    <tr className="border-b border-slate-100 text-left">
                                        {['#', 'Станция', 'Статус', 'Приб.', 'Отпр.', 'Стоянка'].map((label) => (
                                            <th key={label} className="px-8 py-5 text-xs font-black uppercase tracking-[0.24em] text-slate-500">{label}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {activeTrain?.stops?.map((stop: any) => (
                                        <tr key={`${activeTrain.pairKey}-${stop.index}-${stop.station}`} className="border-b border-slate-100">
                                            <td className="px-8 py-5 text-4xl font-light text-slate-400">{stop.index}</td>
                                            <td className="px-8 py-5">
                                                <div className="text-2xl font-bold text-slate-950">{stop.station}</div>
                                                <div className="mt-1 text-sm uppercase tracking-[0.08em] text-slate-500">{stop.eventLabel}</div>
                                            </td>
                                            <td className="px-8 py-5 text-sm text-slate-500">{stop.eventType}</td>
                                            <td className="px-8 py-5 text-2xl font-medium text-slate-700">{stop.arrival ?? '—'}</td>
                                            <td className="px-8 py-5 text-2xl font-medium text-slate-700">{stop.departure ?? '—'}</td>
                                            <td className="px-8 py-5">
                                                <span className="inline-flex rounded-full bg-slate-100 px-5 py-3 text-2xl font-semibold text-slate-600">
                                                    {stop.dwellLabel}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                    {!activeTrain ? (
                                        <tr>
                                            <td colSpan={6} className="px-4 py-12 text-center text-sm text-slate-500">Сначала выберите поезд из реестра.</td>
                                        </tr>
                                    ) : null}
                                </tbody>
                            </table>
                        </div>
                    </section>

                    <section className="rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
                        <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-4 xl:flex-row xl:items-end xl:justify-between">
                            <div>
                                <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">Парк локомотивов</div>
                                <h3 className="mt-2 text-lg font-black text-slate-950">Станционный пул и текущие кандидаты на подвязку</h3>
                            </div>
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[280px_220px]">
                                <div className="relative">
                                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input
                                        value={fleetSearch}
                                        onChange={(event) => setFleetSearch(event.target.value)}
                                        placeholder="Поиск по локомотиву или маршруту"
                                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-9 py-2.5 text-sm text-slate-700 outline-none ring-sky-200 transition focus:ring-2"
                                    />
                                </div>
                                <select
                                    value={fleetStatusFilter}
                                    onChange={(event) => setFleetStatusFilter(event.target.value)}
                                    className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none ring-sky-200 transition focus:ring-2"
                                >
                                    <option value="all">Весь парк</option>
                                    <option value="assigned">Только подвязанные</option>
                                    <option value="reserve">Только резерв</option>
                                </select>
                            </div>
                        </div>
                        <div className="max-h-[620px] overflow-auto">
                            <table className="w-full min-w-[1080px] text-sm">
                                <thead className="sticky top-0 z-10 bg-white">
                                    <tr className="border-b border-slate-100 text-left">
                                        {['Локомотив', 'Тяга', 'Статус', 'Поезд', 'Маршрут', 'Станция', 'Примечание'].map((label) => (
                                            <th key={label} className="px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-slate-500">{label}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredLocomotives.map((item: any) => {
                                        const linked = item.id === activeTrain?.assignedLocomotiveId;
                                        return (
                                            <tr key={item.id} className={`border-b border-slate-100 ${linked ? 'bg-sky-50/50' : ''}`}>
                                                <td className="px-4 py-4">
                                                    <div className="font-mono text-base font-black text-slate-950">{item.label}</div>
                                                    <div className="mt-1 text-xs text-slate-500">{item.id}</div>
                                                </td>
                                                <td className="px-4 py-4">
                                                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold ${toneForLocomotive(item.tractionType)}`}>
                                                        {item.tractionLabel}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-4">
                                                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold ${toneForFleetStatus(item.status)}`}>
                                                        {item.statusLabel}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-4 font-semibold text-slate-900">{item.assignedPair ? `№${item.assignedPair}` : '—'}</td>
                                                <td className="px-4 py-4 text-slate-700">{item.assignedRouteLabel ?? 'Станционный резерв'}</td>
                                                <td className="px-4 py-4 text-slate-700">{item.station}</td>
                                                <td className="px-4 py-4 text-slate-500">{item.note}</td>
                                            </tr>
                                        );
                                    })}
                                    {!filteredLocomotives.length ? (
                                        <tr>
                                            <td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-500">По текущим фильтрам локомотивы не найдены.</td>
                                        </tr>
                                    ) : null}
                                </tbody>
                            </table>
                        </div>
                    </section>
                </main>
            </div>
        </div>
    );
}
