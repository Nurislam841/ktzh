'use client';

import { useState, useEffect, useCallback } from 'react';
import Sidebar from '../../components/Sidebar';
import {
    getScheduleVersions,
    getScheduleVersion,
    compareVersions,
    getStations,
    pickBestStationId,
    getConflicts,
    setScheduleApprovalMode,
    approveScheduleVersion,
    rejectScheduleVersion,
} from '../../lib/api';
import {
    GitCompareArrows, CheckCircle2, AlertTriangle, ArrowRight,
    ChevronDown, ChevronUp, X, Info, Clock, Loader2,
} from 'lucide-react';

function approvalModeLabel(mode: string) {
    const map: Record<string, string> = {
        AUTOMATIC: 'Авто',
        MANUAL: 'Ручной',
    };
    return map[mode] ?? mode;
}

function approvalStatusLabel(status: string) {
    const map: Record<string, string> = {
        PENDING: 'Ожидает',
        APPROVED: 'Одобрено',
        REJECTED: 'Отклонено',
    };
    return map[status] ?? status;
}

function conflictLabel(key: string) {
    const map: Record<string, string> = {
        track: 'Путь',
        locomotive: 'Локомотив',
        crew: 'Бригада',
        headway: 'Интервал',
        track_conflict: 'Конфликт пути',
        headway_violation: 'Нарушение интервала',
        crew_violation: 'Нарушение по бригаде',
        loco_double_booking: 'Двойное назначение локомотива',
    };
    return map[key] ?? key;
}

function slotStatusLabel(status: string) {
    const map: Record<string, string> = {
        IMMEDIATE: 'Сразу',
        WAITING_QUEUE: 'Очередь',
        ASSIGNED: 'Назначено',
    };
    return map[status] ?? status;
}

function priorityLabel(priority: string) {
    const map: Record<string, string> = {
        PASSENGER: 'Пассажирский',
        FREIGHT: 'Грузовой',
        OTHER: 'Прочий',
    };
    return map[priority] ?? priority;
}

function changeTypeLabel(type: string) {
    const map: Record<string, string> = {
        CHANGED: 'Изменен',
        ADDED: 'Добавлен',
        REMOVED: 'Удален',
    };
    return map[type] ?? type;
}

function modeFilterLabel(mode: 'ALL' | 'AUTOMATIC' | 'MANUAL') {
    const map = {
        ALL: 'Все',
        AUTOMATIC: 'Авто',
        MANUAL: 'Ручной',
    };
    return map[mode];
}

function statusFilterLabel(status: 'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED') {
    const map = {
        ALL: 'Все',
        PENDING: 'Ожидает',
        APPROVED: 'Одобрено',
        REJECTED: 'Отклонено',
    };
    return map[status];
}

export default function VersionsPage() {
    const [stationId, setStationId] = useState('');
    const [versions, setVersions] = useState<any[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [diff, setDiff] = useState<any>(null);
    const [diffLoading, setDiffLoading] = useState(false);
    const [error, setError] = useState('');
    const [expanded, setExpanded] = useState<string | null>(null);
    const [detail, setDetail] = useState<any>(null);
    const [conflictsByVersion, setConflictsByVersion] = useState<Record<string, any>>({});
    const [conflictsLoadingId, setConflictsLoadingId] = useState<string | null>(null);
    const [approvalBusyId, setApprovalBusyId] = useState<string | null>(null);
    const [approvalModeFilter, setApprovalModeFilter] = useState<'ALL' | 'AUTOMATIC' | 'MANUAL'>('ALL');
    const [approvalStatusFilter, setApprovalStatusFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('ALL');
    const [pendingQueue, setPendingQueue] = useState<any[]>([]);
    const [pendingTotal, setPendingTotal] = useState(0);
    const [pendingLoading, setPendingLoading] = useState(false);

    const load = useCallback(async (sid: string, pg: number) => {
        setLoading(true);
        try {
            const r: any = await getScheduleVersions(sid, {
                page: pg,
                limit: 20,
                approvalMode: approvalModeFilter === 'ALL' ? undefined : approvalModeFilter,
                approvalStatus: approvalStatusFilter === 'ALL' ? undefined : approvalStatusFilter,
            });
            setVersions(r.versions ?? []);
            setTotal(r.total ?? 0);
            setPage(pg);
        }
        catch (e: any) { setError(e.message); }
        finally { setLoading(false); }
    }, [approvalModeFilter, approvalStatusFilter]);

    const loadPendingQueue = useCallback(async (sid: string) => {
        setPendingLoading(true);
        try {
            const r: any = await getScheduleVersions(sid, {
                page: 1,
                limit: 5,
                approvalStatus: 'PENDING',
            });
            setPendingQueue(r.versions ?? []);
            setPendingTotal(r.total ?? 0);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setPendingLoading(false);
        }
    }, []);

    const resolveStationId = useCallback(async () => {
        const fromStorage = window.localStorage.getItem('ktz_station_id') ?? '';
        if (fromStorage) return fromStorage;
        const stations = await getStations();
        return pickBestStationId(stations.stations);
    }, []);

    useEffect(() => {
        let mounted = true;
        (async () => {
            let sid = new URLSearchParams(window.location.search).get('stationId') ?? '';
            if (!sid) {
                try {
                    sid = await resolveStationId();
                } catch { }
                if (sid) {
                    window.history.replaceState({}, '', `/versions?stationId=${sid}`);
                }
            }
            if (!mounted) return;
            setStationId(sid);
        })();
        return () => { mounted = false; };
    }, [resolveStationId]);

    useEffect(() => {
        if (!stationId) return;
        window.localStorage.setItem('ktz_station_id', stationId);
        void load(stationId, 1);
        void loadPendingQueue(stationId);
    }, [stationId, load, loadPendingQueue]);

    const toggleSelect = (id: string) =>
        setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : prev.length < 2 ? [...prev, id] : [prev[1], id]);

    const handleCompare = async () => {
        if (selectedIds.length !== 2) return;
        setDiffLoading(true); setDiff(null);
        try { setDiff(await compareVersions(selectedIds[0], selectedIds[1])); }
        catch (e: any) { setError(e.message); }
        finally { setDiffLoading(false); }
    };

    const loadConflicts = useCallback(async (versionId: string) => {
        setConflictsLoadingId(versionId);
        try {
            const conflicts = await getConflicts({ versionId });
            setConflictsByVersion((prev) => ({ ...prev, [versionId]: conflicts }));
        } catch (e: any) {
            setError(e.message);
        } finally {
            setConflictsLoadingId(null);
        }
    }, []);

    const patchVersion = useCallback((id: string, next: any) => {
        setVersions((prev) => prev.map((v) => (v.id === id ? { ...v, ...next } : v)));
        setDetail((prev: any) => (prev?.id === id ? { ...prev, ...next } : prev));
    }, []);

    const refreshAfterApproval = useCallback(async () => {
        if (!stationId) return;
        await Promise.all([
            load(stationId, page),
            loadPendingQueue(stationId),
        ]);
    }, [stationId, page, load, loadPendingQueue]);

    const handleSetMode = async (id: string, mode: 'AUTOMATIC' | 'MANUAL') => {
        setApprovalBusyId(id);
        try {
            const updated = await setScheduleApprovalMode(id, mode);
            patchVersion(id, updated);
            await refreshAfterApproval();
        } catch (e: any) {
            setError(e.message);
        } finally {
            setApprovalBusyId(null);
        }
    };

    const handleApprove = async (id: string) => {
        setApprovalBusyId(id);
        try {
            const updated = await approveScheduleVersion(id, 'dispatcher.ui');
            patchVersion(id, updated);
            await refreshAfterApproval();
        } catch (e: any) {
            setError(e.message);
        } finally {
            setApprovalBusyId(null);
        }
    };

    const handleReject = async (id: string) => {
        const reason = window.prompt('Причина отклонения (необязательно)') ?? undefined;
        setApprovalBusyId(id);
        try {
            const updated = await rejectScheduleVersion(id, 'dispatcher.ui', reason);
            patchVersion(id, updated);
            await refreshAfterApproval();
        } catch (e: any) {
            setError(e.message);
        } finally {
            setApprovalBusyId(null);
        }
    };

    const handleExpand = async (id: string) => {
        if (expanded === id) { setExpanded(null); setDetail(null); return; }
        setExpanded(id); setDetail(null);
        try {
            const [versionDetail] = await Promise.all([
                getScheduleVersion(id),
                conflictsByVersion[id] ? Promise.resolve(null) : loadConflicts(id),
            ]);
            setDetail(versionDetail);
        } catch { }
    };

    return (
        <div className="flex min-h-screen">
            <Sidebar stationId={stationId} />
            <div className="main-wrapper flex-1">
                <header className="topbar">
                    <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-800">Версии расписания</span>
                        <span className="badge-gray ml-1">всего: {total}</span>
                    </div>
                    <div className="flex gap-2">
                        {selectedIds.length === 2 && (
                            <button onClick={handleCompare} disabled={diffLoading} className="btn-primary">
                                <GitCompareArrows size={14} /> {diffLoading ? 'Сравнение...' : 'Сравнить выбранные'}
                            </button>
                        )}
                        {selectedIds.length > 0 && (
                            <button onClick={() => { setSelectedIds([]); setDiff(null); }} className="btn-secondary">
                                <X size={14} /> Очистить ({selectedIds.length})
                            </button>
                        )}
                    </div>
                </header>

                <main className="page-content">
                    <div className="mb-6">
                        <h1 className="text-2xl font-bold text-gray-900">История версий</h1>
                        <p className="text-gray-500 text-sm mt-1">Каждый пересчет создает новую неизменяемую версию. Выберите 2 версии для сравнения.</p>
                    </div>

                    <div className="card mb-5">
                        <div className="flex flex-wrap items-center gap-2 mb-3">
                            <span className="font-semibold text-gray-800">Очередь согласования диспетчера</span>
                            <span className="badge-yellow">Ожидают: {pendingTotal}</span>
                            <button
                                onClick={() => stationId && loadPendingQueue(stationId)}
                                className="btn-secondary text-xs py-1.5 ml-auto"
                            >
                                Обновить очередь
                            </button>
                        </div>
                        {pendingLoading ? (
                            <p className="text-xs text-gray-400">Загрузка ожидающих версий...</p>
                        ) : pendingQueue.length === 0 ? (
                            <span className="badge-green"><CheckCircle2 size={10} className="inline -mt-0.5 mr-0.5" />Нет версий на согласовании</span>
                        ) : (
                            <div className="space-y-2">
                                {pendingQueue.map((v: any) => (
                                    <div key={v.id} className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 flex items-center gap-2">
                                        <code className="text-xs text-sky-700 bg-white px-2 py-0.5 rounded border border-sky-100">{v.id.slice(0, 8)}…</code>
                                        <span className="text-xs text-gray-500 truncate">{v.reason}</span>
                                        <button
                                            disabled={approvalBusyId === v.id}
                                            onClick={() => handleApprove(v.id)}
                                            className="btn-secondary text-xs py-1.5 ml-auto !bg-emerald-50 !text-emerald-700 !border-emerald-200"
                                        >
                                            Одобрить
                                        </button>
                                        <button
                                            disabled={approvalBusyId === v.id}
                                            onClick={() => handleReject(v.id)}
                                            className="btn-secondary text-xs py-1.5 !bg-red-50 !text-red-700 !border-red-200"
                                        >
                                            Отклонить
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="card mb-5 flex flex-wrap gap-3 items-center">
                        <span className="text-xs text-gray-400">Фильтр:</span>
                        <span className="text-xs text-gray-500">Режим</span>
                        {(['ALL', 'AUTOMATIC', 'MANUAL'] as const).map((mode) => (
                            <button
                                key={mode}
                                onClick={() => setApprovalModeFilter(mode)}
                                className={`btn-secondary text-xs py-1.5 ${approvalModeFilter === mode ? '!bg-sky-50 !text-sky-700 !border-sky-200' : ''}`}
                            >
                                {modeFilterLabel(mode)}
                            </button>
                        ))}
                        <span className="text-xs text-gray-500 ml-2">Статус</span>
                        {(['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as const).map((status) => (
                            <button
                                key={status}
                                onClick={() => setApprovalStatusFilter(status)}
                                className={`btn-secondary text-xs py-1.5 ${approvalStatusFilter === status ? '!bg-violet-50 !text-violet-700 !border-violet-200' : ''}`}
                            >
                                {statusFilterLabel(status)}
                            </button>
                        ))}
                    </div>

                    {selectedIds.length < 2 && (
                        <div className="announce mb-5">
                            <Info size={18} className="text-sky-500 flex-shrink-0" />
                            <p className="text-sm text-gray-600 flex-1">
                                <span className="font-semibold text-gray-800">Подсказка: </span>
                                выберите любые две карточки версий, затем нажмите <strong>Сравнить выбранные</strong>.
                            </p>
                        </div>
                    )}

                    {selectedIds.length === 2 && (
                        <div className="bg-sky-50 border border-sky-200 rounded-2xl px-5 py-3 flex items-center gap-3 mb-5">
                            <GitCompareArrows size={16} className="text-sky-600" />
                            <span className="text-sky-600 font-semibold text-sm">Сравнение:</span>
                            {selectedIds.map((id, i) => (
                                <span key={id}>
                                    <code className="text-sky-700 bg-white px-2 py-0.5 rounded-lg text-xs border border-sky-200">{id.slice(0, 8)}…</code>
                                    {i === 0 && <span className="mx-2 text-gray-400">и</span>}
                                </span>
                            ))}
                            <button onClick={handleCompare} disabled={diffLoading} className="btn-primary ml-auto">
                                <GitCompareArrows size={14} /> Сравнить
                            </button>
                        </div>
                    )}

                    {error && <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4"><p className="text-red-600 text-sm flex items-center gap-1"><AlertTriangle size={14} />{error}</p></div>}

                    {loading ? (
                        <div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="card animate-pulse h-16" />)}</div>
                    ) : (
                        <div className="space-y-3">
                            {versions.map((v: any, idx) => {
                                const isSelected = selectedIds.includes(v.id);
                                const isExpanded = expanded === v.id;
                                return (
                                    <div key={v.id} className={`card cursor-pointer transition-all border-2 ${isSelected ? 'border-sky-400 shadow-md shadow-sky-100' : 'border-transparent hover:border-gray-200'}`}>
                                        <div className="flex items-center gap-4" onClick={() => toggleSelect(v.id)}>
                                            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${isSelected ? 'border-sky-500 bg-sky-500' : 'border-gray-200'}`}>
                                                {isSelected && <CheckCircle2 size={12} className="text-white" />}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <code className="font-mono font-semibold text-sky-700 text-sm">{v.id.slice(0, 16)}…</code>
                                                    {idx === 0 && <span className="badge-green">Последняя</span>}
                                                    <span className={v.reason.startsWith('Событие') || v.reason.startsWith('Event') ? 'badge-yellow' : 'badge-blue'}>{v.reason}</span>
                                                    <span className={v.approvalMode === 'MANUAL' ? 'badge-purple' : 'badge-gray'}>{approvalModeLabel(v.approvalMode)}</span>
                                                    <span
                                                        className={
                                                            v.approvalStatus === 'APPROVED'
                                                                ? 'badge-green'
                                                                : v.approvalStatus === 'REJECTED'
                                                                    ? 'badge-red'
                                                                    : 'badge-yellow'
                                                        }
                                                    >
                                                        {approvalStatusLabel(v.approvalStatus)}
                                                    </span>
                                                </div>
                                                <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                                                    <Clock size={10} /> {new Date(v.createdAt).toLocaleString('ru-RU')} · назначений: {v._count?.allocations ?? 0}
                                                </div>
                                            </div>
                                            <button
                                                onClick={e => { e.stopPropagation(); handleExpand(v.id); }}
                                                className="btn-secondary text-xs py-1.5"
                                            >
                                                {isExpanded ? <><ChevronUp size={12} /> Скрыть</> : <><ChevronDown size={12} /> Детали</>}
                                            </button>
                                        </div>

                                        {isExpanded && (
                                            <div className="mt-4 pt-4 border-t border-gray-100">
                                                {!detail ? (
                                                    <p className="text-gray-400 text-sm">Загрузка...</p>
                                                ) : (
                                                    <div className="space-y-4">
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <span className="text-xs text-gray-400 mr-1">Согласование диспетчера:</span>
                                                            <button
                                                                disabled={approvalBusyId === v.id}
                                                                onClick={() => handleSetMode(v.id, 'AUTOMATIC')}
                                                                className={`btn-secondary text-xs py-1.5 ${detail.approvalMode === 'AUTOMATIC' ? '!bg-sky-50 !text-sky-700 !border-sky-200' : ''}`}
                                                            >
                                                                Авто
                                                            </button>
                                                            <button
                                                                disabled={approvalBusyId === v.id}
                                                                onClick={() => handleSetMode(v.id, 'MANUAL')}
                                                                className={`btn-secondary text-xs py-1.5 ${detail.approvalMode === 'MANUAL' ? '!bg-violet-50 !text-violet-700 !border-violet-200' : ''}`}
                                                            >
                                                                Ручной
                                                            </button>
                                                            {detail.approvalMode === 'MANUAL' && (
                                                                <>
                                                                    <button
                                                                        disabled={approvalBusyId === v.id}
                                                                        onClick={() => handleApprove(v.id)}
                                                                        className="btn-secondary text-xs py-1.5 !bg-emerald-50 !text-emerald-700 !border-emerald-200"
                                                                    >
                                                                        {approvalBusyId === v.id ? <Loader2 size={12} className="animate-spin" /> : null}
                                                                        Одобрить
                                                                    </button>
                                                                    <button
                                                                        disabled={approvalBusyId === v.id}
                                                                        onClick={() => handleReject(v.id)}
                                                                        className="btn-secondary text-xs py-1.5 !bg-red-50 !text-red-700 !border-red-200"
                                                                    >
                                                                        Отклонить
                                                                    </button>
                                                                </>
                                                            )}
                                                            <span
                                                                className={
                                                                    detail.approvalStatus === 'APPROVED'
                                                                        ? 'badge-green ml-auto'
                                                                        : detail.approvalStatus === 'REJECTED'
                                                                            ? 'badge-red ml-auto'
                                                                            : 'badge-yellow ml-auto'
                                                                }
                                                            >
                                                                {approvalStatusLabel(detail.approvalStatus)}
                                                            </span>
                                                        </div>

                                                        <div className="bg-gray-50 rounded-xl border border-gray-100 p-3">
                                                            <div className="flex items-center gap-2 mb-2">
                                                                <span className="font-semibold text-sm text-gray-800">Проверка конфликтов</span>
                                                                <button onClick={() => loadConflicts(v.id)} className="btn-secondary text-xs py-1.5 ml-auto">
                                                                    Перепроверить
                                                                </button>
                                                            </div>
                                                            {conflictsLoadingId === v.id ? (
                                                                <p className="text-xs text-gray-400">Загрузка конфликтов...</p>
                                                            ) : conflictsByVersion[v.id] ? (
                                                                <div className="space-y-2">
                                                                    <div className="flex flex-wrap gap-1.5">
                                                                        <span className="badge-gray">Всего: {conflictsByVersion[v.id].summary?.total ?? 0}</span>
                                                                        <span className="badge-red">Путь: {conflictsByVersion[v.id].summary?.byType?.track_conflict ?? 0}</span>
                                                                        <span className="badge-red">Интервал: {conflictsByVersion[v.id].summary?.byType?.headway_violation ?? 0}</span>
                                                                        <span className="badge-yellow">Бригада: {conflictsByVersion[v.id].summary?.byType?.crew_violation ?? 0}</span>
                                                                        <span className="badge-yellow">Локомотив: {conflictsByVersion[v.id].summary?.byType?.loco_double_booking ?? 0}</span>
                                                                    </div>
                                                                    {(conflictsByVersion[v.id].conflicts ?? []).length > 0 ? (
                                                                        <div className="text-xs text-gray-500 max-h-32 overflow-y-auto space-y-1">
                                                                            {(conflictsByVersion[v.id].conflicts ?? []).slice(0, 5).map((c: any, ci: number) => (
                                                                                <div key={ci} className="flex items-center gap-2">
                                                                                    <span className="badge-red">{conflictLabel(c.type)}</span>
                                                                                    <span>Рейсы: {(c.trainRunIds ?? []).join(', ')}</span>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    ) : (
                                                                        <span className="badge-green"><CheckCircle2 size={10} className="inline -mt-0.5 mr-0.5" />Конфликтов нет</span>
                                                                    )}
                                                                </div>
                                                            ) : (
                                                                <p className="text-xs text-gray-400">Снимок конфликтов пока не загружен.</p>
                                                            )}
                                                        </div>

                                                        <div className="table-wrapper">
                                                            <table className="table">
                                                                <thead><tr><th>Поезд</th><th>План. отправление</th><th>Слот</th><th>Путь</th><th>Локомотив</th><th>Конфликты</th><th>Примечание</th></tr></thead>
                                                                <tbody>
                                                                    {(detail.allocations ?? []).slice(0, 10).map((a: any) => (
                                                                        <tr key={a.id}>
                                                                            <td><span className="font-mono font-bold text-sky-700 text-xs bg-sky-50 px-2 py-0.5 rounded-lg">#{a.trainRun?.train?.number}</span></td>
                                                                            <td className="text-xs tabular-nums">{new Date(a.plannedDeparture).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</td>
                                                                            <td>
                                                                                <span className={a.slotStatus === 'IMMEDIATE' ? 'badge-green' : a.slotStatus === 'WAITING_QUEUE' ? 'badge-yellow' : 'badge-blue'}>
                                                                                    {slotStatusLabel(a.slotStatus)}
                                                                                </span>
                                                                            </td>
                                                                            <td className="text-gray-600">{a.assignedTrack?.name ?? '—'}</td>
                                                                            <td className="text-xs font-mono text-gray-500">{a.assignedLocomotive ? `${a.assignedLocomotive.series}${a.assignedLocomotive.number}` : '—'}</td>
                                                                            <td>
                                                                                {Object.entries(a.conflictFlags ?? {}).filter(([, value]) => value).map(([k]) => <span key={k} className="badge-red mr-1">{conflictLabel(k)}</span>)}
                                                                                {!Object.values(a.conflictFlags ?? {}).some(Boolean) && <span className="badge-green"><CheckCircle2 size={10} className="inline -mt-0.5 mr-0.5" />ОК</span>}
                                                                            </td>
                                                                            <td className="text-xs text-gray-400 max-w-xs truncate">{a.notes || '—'}</td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                            {detail.allocations?.length > 10 && (
                                                                <p className="text-xs text-gray-400 px-1 pt-2">Показано 10 из {detail.allocations.length}</p>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {total > 20 && (
                        <div className="flex gap-2 mt-5 justify-center">
                            <button onClick={() => load(stationId, page - 1)} disabled={page === 1} className="btn-secondary">← Назад</button>
                            <span className="flex items-center text-sm text-gray-400 px-2">Стр. {page}/{Math.ceil(total / 20)}</span>
                            <button onClick={() => load(stationId, page + 1)} disabled={page >= Math.ceil(total / 20)} className="btn-secondary">Вперед →</button>
                        </div>
                    )}

                    {diff && (
                        <div className="card mt-6">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
                                <div>
                                    <h2 className="font-bold text-gray-900 text-lg flex items-center gap-2"><GitCompareArrows size={18} /> Результат сравнения</h2>
                                    <p className="text-sm text-gray-400 mt-1">
                                        <code className="text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded text-xs">{diff.fromVersionId?.slice(0, 8)}</code>
                                        <ArrowRight size={12} className="inline mx-2 text-gray-300" />
                                        <code className="text-sky-600 bg-sky-50 px-1.5 py-0.5 rounded text-xs">{diff.toVersionId?.slice(0, 8)}</code>
                                    </p>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                                {[
                                    { label: 'Изменено', v: diff.summary?.totalChanged, cls: 'bg-amber-50 border-amber-200 text-amber-700' },
                                    { label: 'Задержка Δ', v: `${diff.summary?.totalDepartureDelayDeltaMinutes ?? 0} мин`, cls: diff.summary?.totalDepartureDelayDeltaMinutes > 0 ? 'bg-red-50 border-red-200 text-red-600' : 'bg-green-50 border-green-200 text-green-700' },
                                    { label: 'Новые проблемы', v: diff.summary?.newConflicts, cls: 'bg-red-50 border-red-200 text-red-600' },
                                    { label: 'Решено', v: diff.summary?.resolvedConflicts, cls: 'bg-green-50 border-green-200 text-green-700' },
                                ].map(s => (
                                    <div key={s.label} className={`rounded-xl border p-3 text-center ${s.cls}`}>
                                        <div className="text-2xl font-bold">{s.v ?? 0}</div>
                                        <div className="text-xs font-medium mt-0.5">{s.label}</div>
                                    </div>
                                ))}
                            </div>

                            <div className="table-wrapper">
                                <table className="table">
                                    <thead><tr><th>Поезд</th><th>Изменение</th><th>Стар. отправление</th><th>Нов. отправление</th><th>Задержка Δ</th><th>Конфликты</th></tr></thead>
                                    <tbody>
                                        {(diff.changes ?? []).map((c: any, i: number) => (
                                            <tr key={i}>
                                                <td><span className="font-mono font-bold text-sky-700 text-xs bg-sky-50 px-2 py-0.5 rounded-lg">#{c.trainNumber}</span></td>
                                                <td><span className={c.type === 'CHANGED' ? 'badge-yellow' : c.type === 'ADDED' ? 'badge-green' : 'badge-red'}>{changeTypeLabel(c.type)}</span></td>
                                                <td className="text-gray-400 text-xs tabular-nums">{c.from?.plannedDeparture ? new Date(c.from.plannedDeparture).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                                                <td className="text-xs tabular-nums">{c.to?.plannedDeparture ? new Date(c.to.plannedDeparture).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                                                <td>{c.departureDeltaMinutes != null ? <span className={c.departureDeltaMinutes > 0 ? 'badge-red' : 'badge-green'}>{c.departureDeltaMinutes > 0 ? '+' : ''}{c.departureDeltaMinutes} мин</span> : '—'}</td>
                                                <td>{Object.entries(c.to?.conflictFlags ?? {}).filter(([, v]) => v).map(([k]) => <span key={k} className="badge-red mr-1">{conflictLabel(k)}</span>)}{!Object.values(c.to?.conflictFlags ?? {}).some(Boolean) && <span className="badge-green"><CheckCircle2 size={10} className="inline -mt-0.5 mr-0.5" />ОК</span>}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}
