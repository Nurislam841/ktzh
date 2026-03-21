'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '../../components/Sidebar';
import {
    getBindings,
    runBindingConflictCheck,
    getConflictsSummary,
    calculateBindingKpi,
    getStations,
    pickBestStationId,
} from '../../lib/api';
import {
    Link2, AlertTriangle, Clock, RefreshCw,
    CheckCircle, XCircle, FileWarning, Search,
    BarChart3, Play, ArrowUpDown, Plus,
} from 'lucide-react';
import CreateBindingModal from '../../components/CreateBindingModal';

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
    DRAFT: { label: 'Черновик', cls: 'bg-gray-100 text-gray-600' },
    VALIDATED: { label: 'Проверена', cls: 'bg-blue-100 text-blue-700' },
    PLANNED: { label: 'Спланирована', cls: 'bg-green-100 text-green-700' },
    CONFLICT: { label: 'Конфликт', cls: 'bg-red-100 text-red-600' },
    REJECTED: { label: 'Отклонена', cls: 'bg-orange-100 text-orange-700' },
    APPROVED: { label: 'Утверждена', cls: 'bg-emerald-100 text-emerald-700' },
};

const CONFLICT_CODE_MAP: Record<string, string> = {
    FORMAT_ERROR: 'Ошибка формата',
    VALIDATION_ERROR: 'Ошибка валидации',
    REF_NOT_FOUND: 'Справочник не найден',
    SHOULDER_NOT_RESOLVED: 'Плечо не определено',
    MODEL_NOT_ALLOWED: 'Модель не допущена',
    TIME_CONFLICT: 'Пересечение по времени',
    MAINTENANCE_VIOLATION: 'Нарушение ТО',
    SYSTEM_ERROR: 'Системная ошибка',
};

function formatDt(iso: string) {
    return new Date(iso).toLocaleString('ru-RU', {
        day: '2-digit', month: '2-digit',
        hour: '2-digit', minute: '2-digit',
    });
}

function formatDwell(min: number) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return h > 0 ? `${h}ч ${m}м` : `${m}м`;
}

export default function BindingsPage() {
    const router = useRouter();
    const [stationId, setStationId] = useState('');
    const [bindings, setBindings] = useState<any[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [periodId, setPeriodId] = useState('2026-03');
    const [statusFilter, setStatusFilter] = useState('');
    const [searchQuery, setSearchQuery] = useState('');

    const [isCreateOpen, setIsCreateOpen] = useState(false);

    // Conflict check
    const [checking, setChecking] = useState(false);
    const [checkResult, setCheckResult] = useState<any>(null);

    // KPI
    const [kpiLoading, setKpiLoading] = useState(false);
    const [kpi, setKpi] = useState<any>(null);

    // Conflict summary
    const [conflictSummary, setConflictSummary] = useState<any>(null);

    const loadBindings = useCallback(async () => {
        setLoading(true);
        try {
            const data = await getBindings({
                periodId: periodId || undefined,
                status: statusFilter || undefined,
                take: 100,
            });
            setBindings(data.items);
            setTotal(data.total);
        } catch (err) {
            console.error('Load bindings error:', err);
        } finally {
            setLoading(false);
        }
    }, [periodId, statusFilter]);

    const loadSummary = useCallback(async () => {
        if (!periodId) return;
        try {
            const summary = await getConflictsSummary(periodId);
            setConflictSummary(summary);
        } catch { }
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
                    } catch { }
                }
            }
            if (!mounted) return;
            setStationId(sid);
            if (sid) window.localStorage.setItem('ktz_station_id', sid);
        })();
        return () => { mounted = false; };
    }, []);

    useEffect(() => {
        loadBindings();
        loadSummary();
    }, [loadBindings, loadSummary]);

    const handleConflictCheck = async () => {
        if (!periodId) return;
        setChecking(true);
        try {
            const result = await runBindingConflictCheck(periodId);
            setCheckResult(result);
            await loadBindings();
            await loadSummary();
        } catch (err: any) {
            setCheckResult({ error: err.message });
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
        } catch (err: any) {
            setKpi({ error: err.message });
        } finally {
            setKpiLoading(false);
        }
    };

    // Stats
    const statsByStatus: Record<string, number> = {};
    bindings.forEach(b => {
        statsByStatus[b.status] = (statsByStatus[b.status] ?? 0) + 1;
    });

    const filteredBindings = searchQuery
        ? bindings.filter(b =>
            b.arrivalTrain?.number?.includes(searchQuery) ||
            b.departureTrain?.number?.includes(searchQuery) ||
            b.turnaroundStation?.name?.toLowerCase().includes(searchQuery.toLowerCase())
        )
        : bindings;

    return (
        <div className="flex min-h-screen">
            <Sidebar stationId={stationId} />
            <div className="main-wrapper flex-1">

                <header className="topbar">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center">
                            <Link2 size={18} className="text-white" />
                        </div>
                        <div>
                            <h1 className="text-lg font-bold text-gray-900">Подвязки локомотивов</h1>
                            <p className="text-xs text-gray-400">BPMN-контур привязки рейсов к локомотивам</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <input
                            type="text"
                            placeholder="Период (2026-03)"
                            value={periodId}
                            onChange={e => setPeriodId(e.target.value)}
                            className="px-3 py-2 rounded-xl border border-gray-200 text-sm w-36 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                        />
                        <button onClick={loadBindings} className="btn-secondary" disabled={loading}>
                            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Обновить
                        </button>
                    </div>
                </header>

                <main className="page-content">
                    {/* Stat cards */}
                    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
                        {[
                            { label: 'Всего', count: total, cls: 'bg-gray-50 text-gray-700', icon: Link2 },
                            { label: 'Спланировано', count: statsByStatus.PLANNED ?? 0, cls: 'bg-green-50 text-green-700', icon: CheckCircle },
                            { label: 'Конфликтов', count: statsByStatus.CONFLICT ?? 0, cls: 'bg-red-50 text-red-600', icon: AlertTriangle },
                            { label: 'Черновики', count: statsByStatus.DRAFT ?? 0, cls: 'bg-blue-50 text-blue-600', icon: FileWarning },
                            { label: 'Утверждено', count: statsByStatus.APPROVED ?? 0, cls: 'bg-emerald-50 text-emerald-700', icon: CheckCircle },
                        ].map(s => (
                            <div key={s.label} className={`rounded-2xl border border-gray-100 p-4 ${s.cls}`}>
                                <div className="flex items-center gap-2 mb-1">
                                    <s.icon size={16} />
                                    <span className="text-xs font-medium">{s.label}</span>
                                </div>
                                <p className="text-2xl font-bold">{s.count}</p>
                            </div>
                        ))}
                    </div>

                    {/* Actions bar */}
                    <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                        <div className="flex items-center gap-2">
                            <div className="relative">
                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Поиск по № поезда / станции"
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    className="pl-8 pr-3 py-2 rounded-xl border border-gray-200 text-sm w-60 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                                />
                            </div>
                            <select
                                value={statusFilter}
                                onChange={e => setStatusFilter(e.target.value)}
                                className="px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                            >
                                <option value="">Все статусы</option>
                                {Object.entries(STATUS_MAP).map(([k, v]) => (
                                    <option key={k} value={k}>{v.label}</option>
                                ))}
                            </select>
                        </div>
                        <div className="flex items-center gap-2">
                            <button onClick={() => setIsCreateOpen(true)} className="btn-primary">
                                <Plus size={14} /> Создать подвязку
                            </button>
                            <button onClick={handleConflictCheck} disabled={checking} className="btn-orange">
                                <Play size={14} /> {checking ? 'Проверка...' : 'Проверить конфликты'}
                            </button>
                            <button onClick={handleCalcKpi} disabled={kpiLoading} className="btn-dark">
                                <BarChart3 size={14} /> {kpiLoading ? 'Расчёт...' : 'Рассчитать KPI'}
                            </button>
                        </div>
                    </div>

                    {/* Check result banner */}
                    {checkResult && (
                        <div className={`announce mb-4 ${checkResult.error ? '' : ''}`}>
                            {checkResult.error ? (
                                <p className="text-red-500 text-sm">{checkResult.error}</p>
                            ) : (
                                <div className="flex items-center gap-4 text-sm">
                                    <span className="font-semibold text-gray-900">Проверено: {checkResult.checked}</span>
                                    <span className="text-red-500 font-semibold">Конфликтов: {checkResult.conflicts?.length ?? 0}</span>
                                    <button className="text-sky-600 text-xs underline" onClick={() => setCheckResult(null)}>Закрыть</button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* KPI panel */}
                    {kpi && !kpi.error && kpi.avgDwell !== undefined && (
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                            <div className="card">
                                <p className="text-xs text-gray-400 mb-1">Ср. простой</p>
                                <p className="text-xl font-bold text-gray-900">{formatDwell(Math.round(kpi.avgDwell))}</p>
                            </div>
                            <div className="card">
                                <p className="text-xs text-gray-400 mb-1">Макс. простой</p>
                                <p className="text-xl font-bold text-gray-900">{formatDwell(kpi.maxDwell)}</p>
                            </div>
                            <div className="card">
                                <p className="text-xs text-gray-400 mb-1">Утилизация</p>
                                <p className="text-xl font-bold text-gray-900">{(kpi.utilization * 100).toFixed(1)}%</p>
                            </div>
                            <div className="card">
                                <p className="text-xs text-gray-400 mb-1">Конфликтов</p>
                                <p className="text-xl font-bold text-red-500">{kpi.conflictsCnt}</p>
                            </div>
                        </div>
                    )}

                    {/* Conflict summary */}
                    {conflictSummary && conflictSummary.total > 0 && (
                        <div className="card mb-6">
                            <h3 className="font-semibold text-sm text-gray-800 mb-3">Сводка конфликтов по типу</h3>
                            <div className="flex flex-wrap gap-2">
                                {Object.entries(conflictSummary.byCode).map(([code, cnt]: [string, any]) => (
                                    <div key={code} className="flex items-center gap-1.5 bg-red-50 text-red-600 px-3 py-1.5 rounded-full text-xs font-medium">
                                        <AlertTriangle size={12} />
                                        {CONFLICT_CODE_MAP[code] ?? code}: {cnt}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Bindings table */}
                    <div className="card overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-gray-100">
                                        <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Станция</th>
                                        <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                                            <div className="flex items-center gap-1"><ArrowUpDown size={10} />Приход</div>
                                        </th>
                                        <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Отход</th>
                                        <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Простой</th>
                                        <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Статус</th>
                                        <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Конфликты</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        [...Array(5)].map((_, i) => (
                                            <tr key={i} className="border-b border-gray-50">
                                                {[...Array(6)].map((_, j) => (
                                                    <td key={j} className="py-3 px-4"><div className="h-4 bg-gray-100 rounded animate-pulse w-20" /></td>
                                                ))}
                                            </tr>
                                        ))
                                    ) : filteredBindings.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} className="text-center py-12 text-gray-400">
                                                <Link2 size={32} className="mx-auto mb-2 text-gray-300" />
                                                <p>Подвязок пока нет</p>
                                                <p className="text-xs mt-1">Загрузите XLSX через <code className="bg-gray-100 px-1 rounded">POST /api/v1/files</code> или создайте через API</p>
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredBindings.map(b => (
                                            <tr key={b.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors cursor-pointer" onClick={() => { }}>
                                                <td className="py-3 px-4">
                                                    <span className="font-medium text-gray-900">{b.turnaroundStation?.name ?? '—'}</span>
                                                </td>
                                                <td className="py-3 px-4">
                                                    <div>
                                                        <span className="font-medium text-gray-900">№{b.arrivalTrain?.number ?? '—'}</span>
                                                        <span className="text-gray-400 ml-2 text-xs">{formatDt(b.arrivalDt)}</span>
                                                    </div>
                                                </td>
                                                <td className="py-3 px-4">
                                                    <div>
                                                        <span className="font-medium text-gray-900">№{b.departureTrain?.number ?? '—'}</span>
                                                        <span className="text-gray-400 ml-2 text-xs">{formatDt(b.departureDt)}</span>
                                                    </div>
                                                </td>
                                                <td className="py-3 px-4">
                                                    <div className="flex items-center gap-1 text-gray-600">
                                                        <Clock size={12} />
                                                        <span>{formatDwell(b.dwellMinutes)}</span>
                                                    </div>
                                                </td>
                                                <td className="py-3 px-4">
                                                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_MAP[b.status]?.cls ?? 'bg-gray-100 text-gray-600'}`}>
                                                        {b.status === 'CONFLICT' && <AlertTriangle size={10} />}
                                                        {b.status === 'APPROVED' && <CheckCircle size={10} />}
                                                        {b.status === 'REJECTED' && <XCircle size={10} />}
                                                        {STATUS_MAP[b.status]?.label ?? b.status}
                                                    </span>
                                                </td>
                                                <td className="py-3 px-4">
                                                    {b.conflicts?.length > 0 ? (
                                                        <span className="text-red-500 text-xs font-medium">
                                                            {b.conflicts.length} конфликт(ов)
                                                        </span>
                                                    ) : (
                                                        <span className="text-green-500 text-xs">Нет</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                        {total > 0 && (
                            <div className="px-4 py-3 border-t border-gray-100 text-xs text-gray-400 flex justify-between">
                                <span>Показано: {filteredBindings.length} из {total}</span>
                                <span>Период: {periodId}</span>
                            </div>
                        )}
                    </div>
                </main>
                <CreateBindingModal 
                    isOpen={isCreateOpen} 
                    onClose={() => setIsCreateOpen(false)} 
                    onSuccess={() => {
                        loadBindings();
                        loadSummary();
                    }}
                    periodId={periodId}
                    initialStationId={stationId}
                />
            </div>
        </div>
    );
}
