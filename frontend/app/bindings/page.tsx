'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Sidebar from '../../components/Sidebar';
import CreateBindingModal from '../../components/CreateBindingModal';
import BindingDwellBoard from '../../components/BindingDwellBoard';
import BindingRecommendationsTable from '../../components/BindingRecommendationsTable';
import {
    calculateBindingKpi,
    getBindingIntelligence,
    getBindings,
    getConflictsSummary,
    getStations,
    pickBestStationId,
    runBindingConflictCheck,
    type BindingIntelligencePayload,
    type BindingIntelligenceRow,
} from '../../lib/api';
import {
    AlertTriangle,
    BarChart3,
    CalendarDays,
    CheckCircle2,
    Clock3,
    Gauge,
    Link2,
    PauseCircle,
    Plus,
    RefreshCw,
    Search,
    ShieldAlert,
    Sparkles,
} from 'lucide-react';

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
    DRAFT: { label: 'Черновик', cls: 'bg-slate-100 text-slate-600' },
    VALIDATED: { label: 'Проверена', cls: 'bg-sky-100 text-sky-700' },
    PLANNED: { label: 'Спланирована', cls: 'bg-emerald-100 text-emerald-700' },
    CONFLICT: { label: 'Конфликт', cls: 'bg-rose-100 text-rose-700' },
    REJECTED: { label: 'Отклонена', cls: 'bg-amber-100 text-amber-700' },
    APPROVED: { label: 'Утверждена', cls: 'bg-teal-100 text-teal-700' },
};

function formatMinutes(value: number | null | undefined) {
    if (typeof value !== 'number') return '—';
    const hours = Math.floor(value / 60);
    const minutes = value % 60;
    if (!hours) return `${minutes}м`;
    return `${hours}ч ${String(minutes).padStart(2, '0')}м`;
}

function formatDt(iso: string) {
    return new Date(iso).toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}

export default function BindingsPage() {
    const [stationId, setStationId] = useState('');
    const [periodId, setPeriodId] = useState('2026-03');
    const [bindings, setBindings] = useState<any[]>([]);
    const [bindingsTotal, setBindingsTotal] = useState(0);
    const [bindingsLoading, setBindingsLoading] = useState(false);
    const [intelligence, setIntelligence] = useState<BindingIntelligencePayload | null>(null);
    const [intelligenceLoading, setIntelligenceLoading] = useState(false);
    const [selectedDay, setSelectedDay] = useState<number | ''>('');
    const [selectedRow, setSelectedRow] = useState<BindingIntelligenceRow | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [shoulderFilter, setShoulderFilter] = useState('');
    const [tractionFilter, setTractionFilter] = useState('');
    const [qualityFilter, setQualityFilter] = useState('');
    const [onlyProblematic, setOnlyProblematic] = useState(false);
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [createRow, setCreateRow] = useState<BindingIntelligenceRow | null>(null);
    const [checking, setChecking] = useState(false);
    const [checkResult, setCheckResult] = useState<any>(null);
    const [kpiLoading, setKpiLoading] = useState(false);
    const [kpi, setKpi] = useState<any>(null);
    const [conflictSummary, setConflictSummary] = useState<any>(null);

    const loadBindings = useCallback(async () => {
        setBindingsLoading(true);
        try {
            const data = await getBindings({ periodId, take: 100 });
            setBindings(data.items);
            setBindingsTotal(data.total);
        } finally {
            setBindingsLoading(false);
        }
    }, [periodId]);

    const loadIntelligence = useCallback(async (day?: number) => {
        setIntelligenceLoading(true);
        try {
            const data = await getBindingIntelligence(day);
            setIntelligence(data);
            if (typeof day === 'number') {
                setSelectedDay(day);
            } else {
                setSelectedDay(data.selectedDay ?? '');
            }
        } finally {
            setIntelligenceLoading(false);
        }
    }, []);

    const loadSummary = useCallback(async () => {
        if (!periodId) return;
        try {
            const summary = await getConflictsSummary(periodId);
            setConflictSummary(summary);
        } catch {
            setConflictSummary(null);
        }
    }, [periodId]);

    useEffect(() => {
        let mounted = true;
        (async () => {
            let sid = new URLSearchParams(window.location.search).get('stationId') ?? '';
            if (!sid) {
                const stored = window.localStorage.getItem('ktz_station_id') ?? '';
                if (stored) {
                    sid = stored;
                } else {
                    try {
                        const stations = await getStations();
                        sid = pickBestStationId(stations.stations);
                    } catch {
                        sid = '';
                    }
                }
            }

            if (!mounted) return;
            setStationId(sid);
            if (sid) window.localStorage.setItem('ktz_station_id', sid);
            await Promise.all([loadBindings(), loadIntelligence(), loadSummary()]);
        })();
        return () => { mounted = false; };
    }, [loadBindings, loadIntelligence, loadSummary]);

    const handleConflictCheck = async () => {
        if (!periodId) return;
        setChecking(true);
        try {
            const result = await runBindingConflictCheck(periodId);
            setCheckResult(result);
            await Promise.all([loadBindings(), loadSummary()]);
        } catch (reason: any) {
            setCheckResult({ error: reason.message });
        } finally {
            setChecking(false);
        }
    };

    const handleCalcKpi = async () => {
        if (!periodId) return;
        setKpiLoading(true);
        try {
            const result = await calculateBindingKpi(periodId);
            setKpi(result);
        } catch (reason: any) {
            setKpi({ error: reason.message });
        } finally {
            setKpiLoading(false);
        }
    };

    const filteredRows = useMemo(() => {
        const normalizedSearch = searchQuery.trim().toLowerCase();
        return (intelligence?.rows ?? []).filter((row) => {
            if (shoulderFilter && row.shoulder !== shoulderFilter) return false;
            if (tractionFilter && row.tractionType !== tractionFilter) return false;
            if (qualityFilter && row.status !== qualityFilter) return false;
            if (onlyProblematic && (row.overDwellNowMinutes ?? 0) <= 0 && row.status === 'ok') return false;
            if (!normalizedSearch) return true;
            const haystack = [
                row.locomotiveNumber,
                row.locomotiveSeries,
                row.arrivalTrainNumber,
                row.bestCandidate?.trainNumber,
                row.shoulder,
                row.recommendationSummary,
            ].join(' ').toLowerCase();
            return haystack.includes(normalizedSearch);
        });
    }, [intelligence, onlyProblematic, qualityFilter, searchQuery, shoulderFilter, tractionFilter]);

    useEffect(() => {
        if (!filteredRows.length) {
            setSelectedRow(null);
            return;
        }
        if (!selectedRow || !filteredRows.some((row) => row.id === selectedRow.id)) {
            setSelectedRow(filteredRows[0]);
        }
    }, [filteredRows, selectedRow]);

    const shoulderOptions = useMemo(
        () => Array.from(new Set((intelligence?.rows ?? []).map((row) => row.shoulder).filter((value): value is string => Boolean(value)))).sort((left, right) => left.localeCompare(right, 'ru')),
        [intelligence],
    );

    const openCreateModal = (row?: BindingIntelligenceRow | null) => {
        setCreateRow(row ?? selectedRow);
        setIsCreateOpen(true);
    };

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
                            <h1 className="text-lg font-bold text-gray-900">Подвязки локомотивов</h1>
                            <p className="text-xs text-gray-400">Интеллектуальный диспетчерский инструмент по выбору следующего поезда под локомотив</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <input
                            type="text"
                            value={periodId}
                            onChange={(event) => setPeriodId(event.target.value)}
                            className="w-32 rounded-2xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 outline-none ring-sky-200 transition focus:ring-2"
                        />
                        <button onClick={() => Promise.all([loadBindings(), loadSummary(), loadIntelligence(typeof selectedDay === 'number' ? selectedDay : undefined)])} className="btn-secondary" disabled={bindingsLoading || intelligenceLoading}>
                            <RefreshCw size={14} className={bindingsLoading || intelligenceLoading ? 'animate-spin' : ''} />
                            Обновить
                        </button>
                    </div>
                </header>

                <main className="page-content space-y-6">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
                        {[
                            { label: 'Оперативных локомотивов', value: intelligence?.stats.totalLocomotives ?? 0, icon: Gauge, cls: 'bg-slate-50 text-slate-700' },
                            { label: 'Есть рекомендация', value: intelligence?.stats.withRecommendation ?? 0, icon: Sparkles, cls: 'bg-sky-50 text-sky-700' },
                            { label: 'Лучше подождать', value: intelligence?.stats.waitingForFit ?? 0, icon: Clock3, cls: 'bg-amber-50 text-amber-700' },
                            { label: 'Вне нормы', value: intelligence?.stats.outOfNorm ?? 0, icon: AlertTriangle, cls: 'bg-rose-50 text-rose-700' },
                            { label: 'Сохранённые подвязки', value: bindingsTotal, icon: CheckCircle2, cls: 'bg-emerald-50 text-emerald-700' },
                        ].map((item) => (
                            <div key={item.label} className={`rounded-[24px] border border-slate-100 p-4 shadow-sm ${item.cls}`}>
                                <div className="mb-1 flex items-center gap-2 text-xs font-semibold">
                                    <item.icon size={15} />
                                    {item.label}
                                </div>
                                <div className="text-2xl font-black">{item.value}</div>
                            </div>
                        ))}
                    </div>

                    <div className="rounded-[28px] border border-slate-200 bg-white px-5 py-4 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
                        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                            <div className="grid flex-1 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
                                <div className="relative">
                                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input
                                        value={searchQuery}
                                        onChange={(event) => setSearchQuery(event.target.value)}
                                        placeholder="Поиск по локомотиву, плечу, поезду"
                                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-9 py-2.5 text-sm text-slate-700 outline-none ring-sky-200 transition focus:ring-2"
                                    />
                                </div>
                                <select value={shoulderFilter} onChange={(event) => setShoulderFilter(event.target.value)} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none ring-sky-200 transition focus:ring-2">
                                    <option value="">Все плечи</option>
                                    {shoulderOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                                </select>
                                <select value={tractionFilter} onChange={(event) => setTractionFilter(event.target.value)} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none ring-sky-200 transition focus:ring-2">
                                    <option value="">Вся тяга</option>
                                    <option value="electric">Электровоз</option>
                                    <option value="diesel">Тепловоз</option>
                                    <option value="unknown">Не определено</option>
                                </select>
                                <select value={qualityFilter} onChange={(event) => setQualityFilter(event.target.value)} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none ring-sky-200 transition focus:ring-2">
                                    <option value="">Все статусы</option>
                                    <option value="ok">В норме</option>
                                    <option value="warning">Риск</option>
                                    <option value="critical">Критично</option>
                                    <option value="missing">Неполные данные</option>
                                </select>
                                <select
                                    value={selectedDay}
                                    onChange={(event) => {
                                        const value = event.target.value ? Number(event.target.value) : '';
                                        setSelectedDay(value);
                                        void loadIntelligence(typeof value === 'number' ? value : undefined);
                                    }}
                                    className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none ring-sky-200 transition focus:ring-2"
                                >
                                    <option value="">Опер. день</option>
                                    {(intelligence?.days ?? []).map((day) => <option key={day} value={day}>{day}</option>)}
                                </select>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                                <label className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                                    <input type="checkbox" checked={onlyProblematic} onChange={(event) => setOnlyProblematic(event.target.checked)} />
                                    Только проблемные
                                </label>
                                <button onClick={() => openCreateModal()} className="btn-primary">
                                    <Plus size={14} />
                                    Создать подвязку
                                </button>
                                <button onClick={handleConflictCheck} disabled={checking} className="btn-orange">
                                    <ShieldAlert size={14} />
                                    {checking ? 'Проверка...' : 'Проверить конфликты'}
                                </button>
                                <button onClick={handleCalcKpi} disabled={kpiLoading} className="btn-dark">
                                    <BarChart3 size={14} />
                                    {kpiLoading ? 'Расчёт...' : 'Рассчитать KPI'}
                                </button>
                            </div>
                        </div>

                        <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-slate-500">
                            <span className="inline-flex items-center gap-1"><CalendarDays size={12} /> Срез графика: {intelligence?.cursorLabel ?? '—'}</span>
                            <span className="inline-flex items-center gap-1"><PauseCircle size={12} /> В строках: {filteredRows.length} локомотивов</span>
                            <span className="inline-flex items-center gap-1"><Clock3 size={12} /> Операционные сутки: {intelligence?.serviceDayStart ?? '20:00'} → 20:00</span>
                        </div>
                    </div>

                    {checkResult && (
                        <div className={`rounded-[24px] border px-4 py-3 text-sm ${checkResult.error ? 'border-rose-100 bg-rose-50 text-rose-700' : 'border-slate-200 bg-white text-slate-700'}`}>
                            {checkResult.error
                                ? checkResult.error
                                : `Проверено подвязок: ${checkResult.checked}. Найдено конфликтов: ${checkResult.conflicts?.length ?? 0}.`}
                        </div>
                    )}

                    {kpi && !kpi.error && (
                        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                            <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
                                <div className="text-xs text-slate-400">Средний простой</div>
                                <div className="mt-1 text-xl font-black text-slate-950">{formatMinutes(Math.round(kpi.avgDwell))}</div>
                            </div>
                            <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
                                <div className="text-xs text-slate-400">Максимум</div>
                                <div className="mt-1 text-xl font-black text-slate-950">{formatMinutes(kpi.maxDwell)}</div>
                            </div>
                            <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
                                <div className="text-xs text-slate-400">Утилизация</div>
                                <div className="mt-1 text-xl font-black text-slate-950">{(kpi.utilization * 100).toFixed(1)}%</div>
                            </div>
                            <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
                                <div className="text-xs text-slate-400">Конфликтов</div>
                                <div className="mt-1 text-xl font-black text-rose-700">{kpi.conflictsCnt}</div>
                            </div>
                        </div>
                    )}

                    {conflictSummary?.total > 0 && (
                        <div className="rounded-[28px] border border-rose-100 bg-rose-50 px-5 py-4 text-sm text-rose-700">
                            В периоде {periodId} уже зарегистрировано конфликтов: {conflictSummary.total}. Это важно учитывать перед ручной подвязкой.
                        </div>
                    )}

                    {intelligenceLoading ? (
                        <div className="rounded-[28px] border border-slate-200 bg-white px-6 py-10 text-center text-sm text-slate-500 shadow-sm">
                            Считаю рекомендации по локомотивам и следующим поездам...
                        </div>
                    ) : (
                        <>
                            <BindingDwellBoard rows={filteredRows} selectedRowId={selectedRow?.id} onSelectRow={setSelectedRow} />
                            <BindingRecommendationsTable
                                rows={filteredRows}
                                selectedRowId={selectedRow?.id}
                                onSelectRow={setSelectedRow}
                                onCreateBinding={(row) => openCreateModal(row)}
                            />
                        </>
                    )}

                    <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
                        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                            <div>
                                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Сохранённые записи</div>
                                <h2 className="mt-1 text-lg font-black text-slate-950">Уже созданные binding plans</h2>
                            </div>
                            <div className="text-xs text-slate-400">Период: {periodId}</div>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[980px] text-sm">
                                <thead>
                                    <tr className="border-b border-slate-100 text-left">
                                        {['Станция', 'Локомотив', 'Прибытие', 'Отправление', 'Простой', 'Статус', 'Конфликты'].map((label) => (
                                            <th key={label} className="px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-slate-500">{label}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {bindingsLoading ? (
                                        <tr>
                                            <td colSpan={7} className="px-4 py-10 text-center text-slate-400">Загружаю сохранённые подвязки...</td>
                                        </tr>
                                    ) : bindings.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} className="px-4 py-10 text-center text-slate-400">Пока нет сохранённых binding plans для выбранного периода.</td>
                                        </tr>
                                    ) : (
                                        bindings.map((binding) => {
                                            const locomotive = binding.allocations?.[0]?.locomotive ?? null;
                                            return (
                                                <tr key={binding.id} className="border-b border-slate-100 hover:bg-slate-50/60">
                                                    <td className="px-4 py-4 font-semibold text-slate-900">{binding.turnaroundStation?.name ?? '—'}</td>
                                                    <td className="px-4 py-4">
                                                        {locomotive ? (
                                                            <>
                                                                <div className="font-mono font-black text-slate-950">{locomotive.number}</div>
                                                                <div className="mt-1 text-xs text-slate-500">{locomotive.series}</div>
                                                            </>
                                                        ) : (
                                                            <span className="text-slate-400">Не выбран</span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-4">
                                                        <div className="font-semibold text-slate-900">№{binding.arrivalTrain?.number ?? '—'}</div>
                                                        <div className="mt-1 text-xs text-slate-500">{formatDt(binding.arrivalDt)}</div>
                                                    </td>
                                                    <td className="px-4 py-4">
                                                        <div className="font-semibold text-slate-900">№{binding.departureTrain?.number ?? '—'}</div>
                                                        <div className="mt-1 text-xs text-slate-500">{formatDt(binding.departureDt)}</div>
                                                    </td>
                                                    <td className="px-4 py-4 text-slate-700">{formatMinutes(binding.dwellMinutes)}</td>
                                                    <td className="px-4 py-4">
                                                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_MAP[binding.status]?.cls ?? 'bg-slate-100 text-slate-600'}`}>
                                                            {STATUS_MAP[binding.status]?.label ?? binding.status}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-4">
                                                        {binding.conflicts?.length > 0 ? (
                                                            <span className="text-xs font-bold text-rose-600">{binding.conflicts.length} конфликт(ов)</span>
                                                        ) : (
                                                            <span className="text-xs text-emerald-600">Нет</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </main>

                <CreateBindingModal
                    isOpen={isCreateOpen}
                    onClose={() => setIsCreateOpen(false)}
                    onSuccess={() => {
                        void Promise.all([
                            loadBindings(),
                            loadSummary(),
                            loadIntelligence(typeof selectedDay === 'number' ? selectedDay : undefined),
                        ]);
                    }}
                    periodId={periodId}
                    initialStationId={stationId}
                    intelligenceRows={intelligence?.rows ?? []}
                    initialRow={createRow}
                />
            </div>
        </div>
    );
}
