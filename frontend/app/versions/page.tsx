'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
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

const TRACK_WINDOW_PADDING_MINUTES = 15;
const TRACK_SOON_THRESHOLD_MINUTES = 30;
const TRACK_FALLBACK_OCCUPANCY_MINUTES = 20;

function safeDate(value: unknown) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(String(value));
    return Number.isNaN(date.getTime()) ? null : date;
}

function formatTime(value: unknown) {
    const date = safeDate(value);
    if (!date) return '—';
    return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function formatDateTime(value: unknown) {
    const date = safeDate(value);
    if (!date) return '—';
    return date.toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function formatDuration(totalMinutes: number | null | undefined) {
    if (totalMinutes == null || !Number.isFinite(totalMinutes)) return '—';
    const rounded = Math.max(0, Math.round(totalMinutes));
    const hours = Math.floor(rounded / 60);
    const minutes = rounded % 60;
    if (hours && minutes) return `${hours} ч ${minutes} мин`;
    if (hours) return `${hours} ч`;
    return `${minutes} мин`;
}

function diffMinutes(from: Date, to: Date) {
    return Math.max(0, Math.round((to.getTime() - from.getTime()) / 60_000));
}

function parseTrackOrder(trackName?: string | null) {
    if (!trackName) return Number.MAX_SAFE_INTEGER;
    const match = String(trackName).match(/(\d+)/);
    return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function normalizeTrackName(trackName?: string | null) {
    if (!trackName) return 'Без пути';
    const trimmed = String(trackName).trim();
    const match = trimmed.match(/(\d+)/);
    return match ? `Путь ${Number(match[1])}` : trimmed;
}

function clipNote(note?: string | null) {
    if (!note) return '—';
    return note.length > 90 ? `${note.slice(0, 87)}…` : note;
}

function statusTone(status: string) {
    switch (status) {
        case 'occupied':
            return {
                badge: 'bg-sky-50 text-sky-700 border-sky-200',
                dot: 'bg-sky-500',
                text: 'Занят',
            };
        case 'soon_free':
            return {
                badge: 'bg-amber-50 text-amber-700 border-amber-200',
                dot: 'bg-amber-500',
                text: 'Скоро освободится',
            };
        case 'soon_busy':
            return {
                badge: 'bg-orange-50 text-orange-700 border-orange-200',
                dot: 'bg-orange-500',
                text: 'Скоро будет занят',
            };
        case 'conflict':
            return {
                badge: 'bg-red-50 text-red-700 border-red-200',
                dot: 'bg-red-500',
                text: 'Конфликт',
            };
        default:
            return {
                badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                dot: 'bg-emerald-500',
                text: 'Свободен',
            };
    }
}

function buildTrackDashboard(detail: any) {
    const rawAllocations = Array.isArray(detail?.allocations) ? detail.allocations : [];
    const segments = rawAllocations
        .map((allocation: any) => {
            const plannedDeparture = safeDate(allocation.plannedDeparture);
            if (!plannedDeparture) return null;
            const plannedArrival = safeDate(allocation.plannedArrival);
            const occupancyStart = plannedArrival
                ?? new Date(plannedDeparture.getTime() - TRACK_FALLBACK_OCCUPANCY_MINUTES * 60_000);
            const occupancyEnd = plannedDeparture > occupancyStart
                ? plannedDeparture
                : new Date(occupancyStart.getTime() + 5 * 60_000);
            const conflictEntries = Object.entries(allocation.conflictFlags ?? {}).filter(([, value]) => Boolean(value));

            return {
                id: allocation.id,
                trainNumber: allocation.trainRun?.train?.number ?? '—',
                trackName: normalizeTrackName(allocation.assignedTrack?.name),
                trackOrder: parseTrackOrder(allocation.assignedTrack?.name),
                plannedArrival,
                plannedDeparture,
                occupancyStart,
                occupancyEnd,
                slotStatus: allocation.slotStatus,
                locomotiveLabel: allocation.assignedLocomotive
                    ? `${allocation.assignedLocomotive.series}${allocation.assignedLocomotive.number}`
                    : null,
                notes: allocation.notes ?? null,
                conflictTypes: conflictEntries.map(([key]) => conflictLabel(key)),
                conflictCount: conflictEntries.length,
            };
        })
        .filter(Boolean)
        .sort((left: any, right: any) => {
            const byTrack = left.trackOrder - right.trackOrder;
            if (byTrack !== 0) return byTrack;
            return left.occupancyStart.getTime() - right.occupancyStart.getTime();
        });

    const allTimestamps = segments.flatMap((segment: any) => [
        segment.occupancyStart.getTime(),
        segment.occupancyEnd.getTime(),
    ]);
    const fallbackBase = safeDate(detail?.createdAt) ?? new Date();
    const baseStart = allTimestamps.length > 0 ? Math.min(...allTimestamps) : fallbackBase.getTime();
    const baseEnd = allTimestamps.length > 0 ? Math.max(...allTimestamps) : fallbackBase.getTime() + 60 * 60_000;

    const windowStart = new Date(baseStart - TRACK_WINDOW_PADDING_MINUTES * 60_000);
    const windowEnd = new Date(baseEnd + TRACK_WINDOW_PADDING_MINUTES * 60_000);
    const totalWindowMs = Math.max(windowEnd.getTime() - windowStart.getTime(), 60 * 60_000);
    const liveNow = new Date();
    const referenceTime = liveNow >= windowStart && liveNow <= windowEnd ? liveNow : windowStart;

    const numericTrackOrders = segments
        .map((segment: any) => segment.trackOrder)
        .filter((value: number) => Number.isFinite(value));
    const maxNumericTrack = Math.max(4, ...(numericTrackOrders.length > 0 ? numericTrackOrders : [0]));

    const tracks = new Map<string, any>();
    for (let trackNumber = 1; trackNumber <= maxNumericTrack; trackNumber += 1) {
        const name = `Путь ${trackNumber}`;
        tracks.set(name, {
            name,
            order: trackNumber,
            segments: [],
        });
    }

    segments.forEach((segment: any) => {
        if (!tracks.has(segment.trackName)) {
            tracks.set(segment.trackName, {
                name: segment.trackName,
                order: Number.isFinite(segment.trackOrder) ? segment.trackOrder : Number.MAX_SAFE_INTEGER,
                segments: [],
            });
        }
        tracks.get(segment.trackName).segments.push(segment);
    });

    const sortedTracks = Array.from(tracks.values())
        .sort((left, right) => {
            const byOrder = left.order - right.order;
            if (byOrder !== 0) return byOrder;
            return left.name.localeCompare(right.name, 'ru');
        })
        .map((track) => {
            const trackSegments = [...track.segments].sort((left: any, right: any) => left.occupancyStart.getTime() - right.occupancyStart.getTime());
            let freeCursor = new Date(windowStart);
            const freeWindows: Array<{ start: Date; end: Date; durationMinutes: number }> = [];

            trackSegments.forEach((segment: any) => {
                if (segment.occupancyStart > freeCursor) {
                    freeWindows.push({
                        start: new Date(freeCursor),
                        end: new Date(segment.occupancyStart),
                        durationMinutes: diffMinutes(freeCursor, segment.occupancyStart),
                    });
                }
                if (segment.occupancyEnd > freeCursor) {
                    freeCursor = new Date(segment.occupancyEnd);
                }
            });

            if (freeCursor < windowEnd) {
                freeWindows.push({
                    start: new Date(freeCursor),
                    end: new Date(windowEnd),
                    durationMinutes: diffMinutes(freeCursor, windowEnd),
                });
            }

            const currentSegment = trackSegments.find((segment: any) => referenceTime >= segment.occupancyStart && referenceTime < segment.occupancyEnd) ?? null;
            const nextSegment = trackSegments.find((segment: any) => segment.occupancyStart > referenceTime) ?? null;
            const firstFreeWindow = freeWindows.find((window) => window.end > referenceTime && window.durationMinutes > 0) ?? null;
            const hasConflict = trackSegments.some((segment: any) => segment.conflictCount > 0);

            let status = 'free';
            if (currentSegment?.conflictCount) {
                status = 'conflict';
            } else if (currentSegment) {
                status = diffMinutes(referenceTime, currentSegment.occupancyEnd) <= TRACK_SOON_THRESHOLD_MINUTES ? 'soon_free' : 'occupied';
            } else if (nextSegment?.conflictCount && diffMinutes(referenceTime, nextSegment.occupancyStart) <= TRACK_SOON_THRESHOLD_MINUTES) {
                status = 'conflict';
            } else if (nextSegment && diffMinutes(referenceTime, nextSegment.occupancyStart) <= TRACK_SOON_THRESHOLD_MINUTES) {
                status = 'soon_busy';
            }

            const nextChangeAt = currentSegment?.occupancyEnd ?? nextSegment?.occupancyStart ?? null;
            const statusMessage = currentSegment
                ? `Поезд №${currentSegment.trainNumber} до ${formatTime(currentSegment.occupancyEnd)}`
                : nextSegment
                    ? `Свободен до ${formatTime(nextSegment.occupancyStart)}`
                    : 'Свободен весь выбранный интервал';

            return {
                ...track,
                segments: trackSegments,
                freeWindows,
                firstFreeWindow,
                currentSegment,
                nextSegment,
                nextChangeAt,
                hasConflict,
                status,
                statusMessage,
                occupiedMinutes: trackSegments.reduce((sum: number, segment: any) => sum + diffMinutes(segment.occupancyStart, segment.occupancyEnd), 0),
            };
        });

    const tickStart = new Date(windowStart);
    tickStart.setMinutes(0, 0, 0);
    if (tickStart > windowStart) {
        tickStart.setHours(tickStart.getHours() - 1);
    }
    const tickEnd = new Date(windowEnd);
    tickEnd.setMinutes(0, 0, 0);
    tickEnd.setHours(tickEnd.getHours() + 1);

    const ticks: Array<{ time: Date; left: number }> = [];
    for (let cursor = tickStart.getTime(); cursor <= tickEnd.getTime(); cursor += 60 * 60_000) {
        ticks.push({
            time: new Date(cursor),
            left: Math.min(100, Math.max(0, ((cursor - windowStart.getTime()) / totalWindowMs) * 100)),
        });
    }

    return {
        windowStart,
        windowEnd,
        referenceTime,
        totalWindowMs,
        ticks,
        tracks: sortedTracks,
        summary: {
            totalTracks: sortedTracks.length,
            freeTracks: sortedTracks.filter((track) => track.status === 'free').length,
            occupiedTracks: sortedTracks.filter((track) => track.status === 'occupied' || track.status === 'soon_free').length,
            soonChangeTracks: sortedTracks.filter((track) => track.status === 'soon_free' || track.status === 'soon_busy').length,
            conflictTracks: sortedTracks.filter((track) => track.hasConflict).length,
        },
    };
}

function timelineLeftPercent(date: Date, dashboard: any) {
    return Math.min(
        100,
        Math.max(0, ((date.getTime() - dashboard.windowStart.getTime()) / dashboard.totalWindowMs) * 100),
    );
}

function timelineWidthPercent(start: Date, end: Date, dashboard: any) {
    return Math.min(
        100,
        Math.max(1.5, ((end.getTime() - start.getTime()) / dashboard.totalWindowMs) * 100),
    );
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

    const trackDashboard = useMemo(() => (detail ? buildTrackDashboard(detail) : null), [detail]);

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

                                                        {trackDashboard && (
                                                            <div className="space-y-4">
                                                                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                                                                    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                                                                        <div>
                                                                            <h3 className="text-base font-semibold text-slate-900">Пути в окне версии</h3>
                                                                            <p className="mt-1 text-sm text-slate-500">
                                                                                Окно занятости {formatTime(trackDashboard.windowStart)}–{formatTime(trackDashboard.windowEnd)}.
                                                                                Статус рассчитан относительно {formatTime(trackDashboard.referenceTime)} внутри выбранного интервала.
                                                                            </p>
                                                                        </div>
                                                                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-right">
                                                                            <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">Таймфрейм</div>
                                                                            <div className="mt-1 text-sm font-semibold text-slate-700">
                                                                                {formatDateTime(trackDashboard.windowStart)} → {formatTime(trackDashboard.windowEnd)}
                                                                            </div>
                                                                        </div>
                                                                    </div>

                                                                    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                                                                        {[
                                                                            { label: 'Всего путей', value: trackDashboard.summary.totalTracks, tone: 'border-slate-200 bg-slate-50 text-slate-700' },
                                                                            { label: 'Свободны', value: trackDashboard.summary.freeTracks, tone: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
                                                                            { label: 'Заняты', value: trackDashboard.summary.occupiedTracks, tone: 'border-sky-200 bg-sky-50 text-sky-700' },
                                                                            { label: 'Скоро меняются', value: trackDashboard.summary.soonChangeTracks, tone: 'border-amber-200 bg-amber-50 text-amber-700' },
                                                                            { label: 'Конфликтные', value: trackDashboard.summary.conflictTracks, tone: 'border-red-200 bg-red-50 text-red-700' },
                                                                        ].map((item) => (
                                                                            <div key={item.label} className={`rounded-2xl border px-4 py-3 ${item.tone}`}>
                                                                                <div className="text-[11px] font-medium uppercase tracking-[0.18em] opacity-70">{item.label}</div>
                                                                                <div className="mt-2 text-2xl font-semibold">{item.value}</div>
                                                                            </div>
                                                                        ))}
                                                                    </div>

                                                                    <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
                                                                        <div className="grid grid-cols-[220px,minmax(0,1fr)] border-b border-slate-200 bg-slate-50">
                                                                            <div className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Путь</div>
                                                                            <div className="relative h-12 overflow-hidden px-3">
                                                                                {trackDashboard.ticks.map((tick: any) => (
                                                                                    <div key={tick.time.toISOString()} className="absolute inset-y-0" style={{ left: `${tick.left}%` }}>
                                                                                        <div className="absolute inset-y-0 w-px bg-slate-200" />
                                                                                        <div className="absolute left-2 top-3 text-[11px] font-medium tabular-nums text-slate-400">
                                                                                            {formatTime(tick.time)}
                                                                                        </div>
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        </div>

                                                                        <div className="divide-y divide-slate-200">
                                                                            {trackDashboard.tracks.map((track: any) => {
                                                                                const tone = statusTone(track.status);
                                                                                return (
                                                                                    <div key={track.name} className="grid grid-cols-[220px,minmax(0,1fr)] gap-3 px-4 py-3">
                                                                                        <div className="min-w-0">
                                                                                            <div className="flex flex-wrap items-center gap-2">
                                                                                                <span className="text-sm font-semibold text-slate-900">{track.name}</span>
                                                                                                <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-semibold ${tone.badge}`}>
                                                                                                    <span className={`h-2 w-2 rounded-full ${tone.dot}`} />
                                                                                                    {tone.text}
                                                                                                </span>
                                                                                            </div>
                                                                                            <p className="mt-1 text-sm text-slate-600">{track.statusMessage}</p>
                                                                                            <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-500">
                                                                                                <span>Планов в окне: {track.segments.length}</span>
                                                                                                <span>Занято: {formatDuration(track.occupiedMinutes)}</span>
                                                                                                <span>
                                                                                                    {track.firstFreeWindow
                                                                                                        ? `Ближайшее окно ${formatTime(track.firstFreeWindow.start)}–${formatTime(track.firstFreeWindow.end)}`
                                                                                                        : 'Свободных окон в окне нет'}
                                                                                                </span>
                                                                                            </div>
                                                                                        </div>

                                                                                        <div className="relative h-24 overflow-hidden rounded-2xl border border-slate-200 bg-slate-950/[0.03] px-3">
                                                                                            {trackDashboard.ticks.map((tick: any) => (
                                                                                                <div key={`${track.name}-${tick.time.toISOString()}`} className="absolute inset-y-0" style={{ left: `${tick.left}%` }}>
                                                                                                    <div className="absolute inset-y-0 w-px bg-slate-200/90" />
                                                                                                </div>
                                                                                            ))}

                                                                                            <div className="absolute inset-y-0 z-10" style={{ left: `${timelineLeftPercent(trackDashboard.referenceTime, trackDashboard)}%` }}>
                                                                                                <div className="absolute inset-y-0 w-px bg-slate-900/20" />
                                                                                                <div className="absolute left-2 top-2 rounded-full bg-white/95 px-2 py-0.5 text-[10px] font-semibold text-slate-500 shadow-sm">
                                                                                                    Опорное время
                                                                                                </div>
                                                                                            </div>

                                                                                            {track.segments.length === 0 && (
                                                                                                <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">
                                                                                                    В выбранном окне путь свободен
                                                                                                </div>
                                                                                            )}

                                                                                            {track.segments.map((segment: any) => {
                                                                                                const left = timelineLeftPercent(segment.occupancyStart, trackDashboard);
                                                                                                const width = timelineWidthPercent(segment.occupancyStart, segment.occupancyEnd, trackDashboard);
                                                                                                const useOutsideLabel = width < 10;
                                                                                                const segmentTone = segment.conflictCount > 0
                                                                                                    ? 'border-red-300 bg-red-500/15 text-red-700'
                                                                                                    : segment.slotStatus === 'WAITING_QUEUE'
                                                                                                        ? 'border-amber-300 bg-amber-500/15 text-amber-700'
                                                                                                        : 'border-sky-300 bg-sky-500/15 text-sky-700';

                                                                                                return (
                                                                                                    <div key={segment.id}>
                                                                                                        {useOutsideLabel && (
                                                                                                            <div className="absolute top-3 z-20 -translate-x-1/2 rounded-full border border-white bg-slate-900 px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm" style={{ left: `${left}%` }}>
                                                                                                                №{segment.trainNumber}
                                                                                                            </div>
                                                                                                        )}
                                                                                                        <div
                                                                                                            className={`absolute top-10 h-9 overflow-hidden rounded-xl border px-2 py-1 shadow-sm ${segmentTone}`}
                                                                                                            style={{ left: `${left}%`, width: `${width}%` }}
                                                                                                            title={`Поезд №${segment.trainNumber}\n${formatTime(segment.occupancyStart)}–${formatTime(segment.occupancyEnd)}\nЛокомотив: ${segment.locomotiveLabel ?? '—'}\nСлот: ${slotStatusLabel(segment.slotStatus)}`}
                                                                                                        >
                                                                                                            {!useOutsideLabel && (
                                                                                                                <>
                                                                                                                    <div className="truncate text-[11px] font-semibold">
                                                                                                                        №{segment.trainNumber} · {formatTime(segment.occupancyStart)}–{formatTime(segment.occupancyEnd)}
                                                                                                                    </div>
                                                                                                                    {segment.locomotiveLabel && <div className="truncate text-[10px] opacity-75">{segment.locomotiveLabel}</div>}
                                                                                                                </>
                                                                                                            )}
                                                                                                        </div>
                                                                                                    </div>
                                                                                                );
                                                                                            })}
                                                                                        </div>
                                                                                    </div>
                                                                                );
                                                                            })}
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                                                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                                                                        <div>
                                                                            <h3 className="text-base font-semibold text-slate-900">План по путям</h3>
                                                                            <p className="mt-1 text-sm text-slate-500">
                                                                                Список перестроен по логике диспетчера: сначала путь, внутри пути — по хронологии.
                                                                            </p>
                                                                        </div>
                                                                        <span className="text-xs font-medium text-slate-400">Всего назначений: {detail.allocations?.length ?? 0}</span>
                                                                    </div>

                                                                    <div className="mt-4 space-y-3">
                                                                        {trackDashboard.tracks.map((track: any) => {
                                                                            const tone = statusTone(track.status);
                                                                            return (
                                                                                <details
                                                                                    key={`${track.name}-details`}
                                                                                    open={track.segments.length > 0}
                                                                                    className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/70"
                                                                                >
                                                                                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
                                                                                        <div className="min-w-0">
                                                                                            <div className="flex flex-wrap items-center gap-2">
                                                                                                <span className="font-semibold text-slate-900">{track.name}</span>
                                                                                                <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-semibold ${tone.badge}`}>
                                                                                                    <span className={`h-2 w-2 rounded-full ${tone.dot}`} />
                                                                                                    {tone.text}
                                                                                                </span>
                                                                                                <span className="text-xs text-slate-400">Назначений: {track.segments.length}</span>
                                                                                            </div>
                                                                                            <p className="mt-1 text-sm text-slate-500">{track.statusMessage}</p>
                                                                                        </div>
                                                                                        <div className="text-right text-xs text-slate-400">
                                                                                            {track.nextChangeAt ? `Следующее изменение в ${formatTime(track.nextChangeAt)}` : 'Без изменений в окне'}
                                                                                        </div>
                                                                                    </summary>

                                                                                    <div className="border-t border-slate-200 bg-white">
                                                                                        {track.segments.length > 0 ? (
                                                                                            <div className="divide-y divide-slate-100">
                                                                                                {track.segments.map((segment: any) => (
                                                                                                    <div
                                                                                                        key={`${track.name}-${segment.id}`}
                                                                                                        className="grid gap-3 px-4 py-3 md:grid-cols-[96px,190px,140px,150px,minmax(0,1fr)]"
                                                                                                    >
                                                                                                        <div className="min-w-0">
                                                                                                            <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Поезд</div>
                                                                                                            <div className="mt-1 inline-flex rounded-full bg-sky-50 px-2 py-1 font-mono text-xs font-semibold text-sky-700">
                                                                                                                №{segment.trainNumber}
                                                                                                            </div>
                                                                                                        </div>

                                                                                                        <div className="min-w-0">
                                                                                                            <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Занятость</div>
                                                                                                            <div className="mt-1 text-sm font-semibold text-slate-800">
                                                                                                                {formatTime(segment.occupancyStart)}–{formatTime(segment.occupancyEnd)}
                                                                                                            </div>
                                                                                                            <div className="text-xs text-slate-500">
                                                                                                                Окно {formatDuration(diffMinutes(segment.occupancyStart, segment.occupancyEnd))}
                                                                                                            </div>
                                                                                                        </div>

                                                                                                        <div className="min-w-0">
                                                                                                            <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Слот</div>
                                                                                                            <div className="mt-1">
                                                                                                                <span className={segment.slotStatus === 'IMMEDIATE' ? 'badge-green' : segment.slotStatus === 'WAITING_QUEUE' ? 'badge-yellow' : 'badge-blue'}>
                                                                                                                    {slotStatusLabel(segment.slotStatus)}
                                                                                                                </span>
                                                                                                            </div>
                                                                                                        </div>

                                                                                                        <div className="min-w-0">
                                                                                                            <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Локомотив</div>
                                                                                                            <div className="mt-1 font-mono text-xs text-slate-600">{segment.locomotiveLabel ?? '—'}</div>
                                                                                                        </div>

                                                                                                        <div className="min-w-0">
                                                                                                            <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Ограничения и комментарии</div>
                                                                                                            <div className="mt-1 flex flex-wrap gap-1.5">
                                                                                                                {segment.conflictTypes.length > 0 ? (
                                                                                                                    segment.conflictTypes.map((conflictType: string) => (
                                                                                                                        <span key={conflictType} className="badge-red">{conflictType}</span>
                                                                                                                    ))
                                                                                                                ) : (
                                                                                                                    <span className="badge-green">
                                                                                                                        <CheckCircle2 size={10} className="inline -mt-0.5 mr-0.5" />
                                                                                                                        Без конфликтов
                                                                                                                    </span>
                                                                                                                )}
                                                                                                            </div>
                                                                                                            <div className="mt-2 text-xs text-slate-500" title={segment.notes ?? undefined}>
                                                                                                                {clipNote(segment.notes)}
                                                                                                            </div>
                                                                                                        </div>
                                                                                                    </div>
                                                                                                ))}
                                                                                            </div>
                                                                                        ) : (
                                                                                            <div className="px-4 py-5 text-sm text-slate-400">В выбранном окне по этому пути нет запланированных занятий.</div>
                                                                                        )}
                                                                                    </div>
                                                                                </details>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )}
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
