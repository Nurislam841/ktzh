'use client';

import { useState, useEffect, useCallback } from 'react';
import Sidebar from '../../components/Sidebar';
import { getCrewCalls, getNodeDecisionQueue, getNodeOverview, getNodeResources, getStations, pickBestStationId } from '../../lib/api';
import Link from 'next/link';
import LocomotiveGanttChart from '../../components/LocomotiveGanttChart';
import DispatcherDecisionQueue from '../../components/DispatcherDecisionQueue';
import CrewCallBoard from '../../components/CrewCallBoard';
import {
    Train, AlertTriangle, Clock, Zap, RefreshCw, Filter, Search,
    Flag, CheckCircle2,
} from 'lucide-react';

const P_MAP: Record<string, { cls: string; label: string }> = {
    PASSENGER: { cls: 'priority-high', label: 'Пассажирский' },
    FREIGHT: { cls: 'priority-medium', label: 'Грузовой' },
    OTHER: { cls: 'priority-low', label: 'Прочий' },
};

function statusLabel(status: string) {
    const labels: Record<string, string> = {
        PLANNED: 'Запланирован',
        READY: 'Готов',
        WAITING_SLOT: 'Ожидает слот',
        LOCO_ASSIGNED: 'Локомотив назначен',
        CREW_CONFIRMED: 'Бригада подтверждена',
        DELAYED: 'Задержан',
        ACTIVE: 'В работе',
        DEPARTED: 'Отправлен',
        ARRIVED: 'Прибыл',
        CANCELLED: 'Отменен',
    };
    return labels[status] ?? status;
}

function statusBadge(status: string) {
    if (['CREW_CONFIRMED', 'DEPARTED', 'ARRIVED'].includes(status)) return 'badge-green';
    if (['READY', 'LOCO_ASSIGNED', 'ACTIVE'].includes(status)) return 'badge-blue';
    if (['WAITING_SLOT', 'DELAYED'].includes(status)) return 'badge-yellow';
    if (status === 'CANCELLED') return 'badge-red';
    return 'badge-gray';
}

function conflictLabel(key: string) {
    const labels: Record<string, string> = {
        track: 'Путь',
        locomotive: 'Локомотив',
        crew: 'Бригада',
        headway: 'Интервал',
        track_conflict: 'Конфликт пути',
        headway_violation: 'Нарушение интервала',
        crew_violation: 'Нарушение по бригаде',
        loco_double_booking: 'Двойное назначение локомотива',
    };
    return labels[key] ?? key;
}

function operationScenarioMeta(scenario?: string) {
    const map: Record<string, { label: string; cls: string }> = {
        FORMATION: { label: 'Формирование', cls: 'badge-blue' },
        TRANSIT: { label: 'Транзит', cls: 'badge-gray' },
    };
    return map[scenario ?? ''] ?? { label: scenario ?? '—', cls: 'badge-gray' };
}

export default function NodePage() {
    const [stationId, setStationId] = useState('');
    const [data, setData] = useState<any>(null);
    const [resources, setResources] = useState<any>(null);
    const [decisionQueue, setDecisionQueue] = useState<any>(null);
    const [crewCalls, setCrewCalls] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<'ALL' | 'CONFLICTS' | 'DELAYED'>('ALL');
    const [group, setGroup] = useState<'ALL' | 'PLANNED' | 'ACTIVE' | 'DEPARTED'>('ALL');
    const [hours, setHours] = useState(6);

    const load = useCallback(async (sid: string, h = 6) => {
        setLoading(true);
        try {
            const [overviewResponse, resourcesResponse, decisionQueueResponse, crewCallsResponse] = await Promise.all([
                getNodeOverview(sid, undefined, undefined, h),
                getNodeResources(sid),
                getNodeDecisionQueue(sid, h),
                getCrewCalls(sid, h),
            ]);
            setData(overviewResponse);
            setResources(resourcesResponse);
            setDecisionQueue(decisionQueueResponse);
            setCrewCalls(crewCallsResponse);
        } catch { }
        finally { setLoading(false); }
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
            const params = new URLSearchParams(window.location.search);
            let sid = params.get('stationId') ?? '';
            const q = params.get('q') ?? '';
            const f = params.get('filter');
            const g = params.get('group');
            const h = Number(params.get('hours') ?? '6');
            if (!sid) {
                try {
                    sid = await resolveStationId();
                } catch { }
                if (sid) {
                    window.history.replaceState({}, '', `/node?stationId=${sid}`);
                }
            }
            if (!mounted) return;
            setStationId(sid);
            if (q) setSearch(q);
            if (f === 'CONFLICTS' || f === 'DELAYED' || f === 'ALL') setFilter(f);
            if (g === 'PLANNED' || g === 'ACTIVE' || g === 'DEPARTED' || g === 'ALL') setGroup(g);
            if (Number.isFinite(h) && [6, 12, 24].includes(h)) setHours(h);
            if (sid) {
                window.localStorage.setItem('ktz_station_id', sid);
                await load(sid, Number.isFinite(h) && [6, 12, 24].includes(h) ? h : 6);
            }
        })();
        return () => { mounted = false; };
    }, [load, resolveStationId]);

    const trainRuns: any[] = data?.trainRuns ?? [];
    const filtered = trainRuns.filter(t => {
        if (search && !t.trainRun.number.includes(search) && !(t.track?.name ?? '').toLowerCase().includes(search.toLowerCase())) return false;
        if (filter === 'CONFLICTS' && !Object.values(t.conflictFlags ?? {}).some(Boolean)) return false;
        if (filter === 'DELAYED') {
            const delay = new Date(t.plannedDeparture).getTime() - new Date(t.trainRun.scheduledDeparture).getTime();
            if (delay <= 0) return false;
        }
        if (group === 'PLANNED' && t.trainRun.status !== 'PLANNED') return false;
        if (group === 'ACTIVE' && !['ACTIVE', 'READY', 'LOCO_ASSIGNED', 'CREW_CONFIRMED'].includes(t.trainRun.status)) return false;
        if (group === 'DEPARTED' && !['DEPARTED', 'ARRIVED', 'CANCELLED'].includes(t.trainRun.status)) return false;
        return true;
    });

    const conflictCount = trainRuns.filter(t => Object.values(t.conflictFlags ?? {}).some(Boolean)).length;
    const delayedCount = trainRuns.filter(t => new Date(t.plannedDeparture).getTime() - new Date(t.trainRun.scheduledDeparture).getTime() > 0).length;
    const formationCount = trainRuns.filter(t => t.trainRun.operationScenario === 'FORMATION').length;

    return (
        <div className="flex min-h-screen">
            <Sidebar stationId={stationId} />
            <div className="main-wrapper flex-1">
                <header className="topbar">
                    <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-800">Обзор узла</span>
                        <span className="text-gray-300">/</span>
                        {data?.versionId && <code className="text-xs text-sky-600 bg-sky-50 px-2 py-0.5 rounded-lg">v/{data.versionId.slice(0, 8)}</code>}
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={() => stationId && load(stationId, hours)} className="btn-secondary"><RefreshCw size={14} /> Обновить</button>
                        <Link href={`/resources?stationId=${stationId}`} className="btn-secondary"><Train size={14} /> Ресурсы</Link>
                        <Link href={`/simulation?stationId=${stationId}`} className="btn-primary"><Zap size={14} /> Добавить событие</Link>
                    </div>
                </header>

                <main className="page-content">
                    <div className="mb-6">
                        <h1 className="text-2xl font-bold text-gray-900">Обзор поездной работы</h1>
                        <p className="text-gray-500 text-sm mt-1">Последняя версия распределения поездов в окне планирования {hours} часов</p>
                        {group !== 'ALL' && <span className="badge-blue mt-2 inline-flex">Группа: {group}</span>}
                    </div>

                    {/* Gantt Chart Area */}
                    {!loading && resources?.locomotives && (
                        <div className="mb-8">
                            <LocomotiveGanttChart 
                                stationId={stationId}
                                locomotives={resources.locomotives}
                                trainRuns={filtered}
                                windowHours={hours}
                                startDate={new Date()}
                            />
                        </div>
                    )}

                    {/* Summary */}
                    <div className="grid grid-cols-4 gap-4 mb-6">
                        {[
                            { label: 'Всего поездов', value: trainRuns.length, color: 'text-gray-900', bg: 'bg-white', Icon: Train },
                            { label: 'Формирование', value: formationCount, color: 'text-sky-700', bg: 'bg-sky-50', Icon: Zap },
                            { label: 'С конфликтами', value: conflictCount, color: 'text-red-600', bg: 'bg-red-50', Icon: AlertTriangle },
                            { label: 'С задержкой', value: delayedCount, color: 'text-amber-600', bg: 'bg-amber-50', Icon: Clock },
                        ].map(s => (
                            <div key={s.label} className={`card flex items-center gap-4 ${s.bg}`}>
                                <div className={`w-12 h-12 rounded-xl ${s.bg} flex items-center justify-center ${s.color}`}><s.Icon size={24} /></div>
                                <div>
                                    <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                                    <div className="text-xs text-gray-400">{s.label}</div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <DispatcherDecisionQueue items={decisionQueue?.items ?? []} />
                    <CrewCallBoard items={crewCalls?.items ?? []} onUpdated={() => stationId ? load(stationId, hours) : undefined} />

                    {/* Filters */}
                    <div className="card mb-4 flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                        <div className="relative max-w-xs w-full">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск по № поезда или пути…" className="input-field pl-9" />
                        </div>
                        <div className="flex gap-2 ml-0 sm:ml-auto">
                            {[6, 12, 24].map((h) => (
                                <button
                                    key={h}
                                    onClick={async () => {
                                        setHours(h);
                                        if (stationId) {
                                            const params = new URLSearchParams(window.location.search);
                                            params.set('stationId', stationId);
                                            params.set('hours', String(h));
                                            window.history.replaceState({}, '', `/node?${params.toString()}`);
                                            await load(stationId, h);
                                        }
                                    }}
                                    className={`px-3 py-1.5 rounded-full text-xs ${hours === h ? 'badge-blue' : 'badge-gray'}`}
                                >
                                    {h}ч
                                </button>
                            ))}
                            {[
                                { f: 'ALL', icon: Filter, label: 'Все', cls: 'badge-blue' },
                                { f: 'CONFLICTS', icon: AlertTriangle, label: 'Конфликты', cls: 'badge-red' },
                                { f: 'DELAYED', icon: Clock, label: 'Задержки', cls: 'badge-yellow' },
                            ].map(btn => (
                                <button
                                    key={btn.f}
                                    onClick={() => setFilter(btn.f as any)}
                                    className={`flex items-center gap-1 cursor-pointer px-3 py-1.5 ${filter === btn.f ? btn.cls : 'badge-gray'}`}
                                >
                                    <btn.icon size={12} /> {btn.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Table */}
                    {loading ? (
                        <div className="card animate-pulse h-64 flex items-center justify-center text-gray-400">Загрузка…</div>
                    ) : (
                        <div className="table-wrapper">
                            <table className="table">
                                <thead><tr>
                                    <th>№ поезда</th><th>Сценарий</th><th>Приоритет</th><th>Статус</th>
                                    <th>По графику</th><th>План</th><th>Задержка</th>
                                    <th>Путь</th><th>Локомотив</th><th>Бригада</th><th>Конфликты</th>
                                </tr></thead>
                                <tbody>
                                    {filtered.length === 0 ? (
                                        <tr><td colSpan={11} className="text-center text-gray-400 py-12">Поезда не найдены</td></tr>
                                    ) : filtered.map((t: any) => {
                                        const delayMs = new Date(t.plannedDeparture).getTime() - new Date(t.trainRun.scheduledDeparture).getTime();
                                        const delayMin = Math.round(delayMs / 60_000);
                                        const flags = Object.entries(t.conflictFlags ?? {}).filter(([, v]) => v);
                                        const scenario = operationScenarioMeta(t.trainRun.operationScenario);
                                        return (
                                            <tr key={t.allocationId}>
                                                <td><span className="font-mono font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded-lg text-sm">#{t.trainRun.number}</span></td>
                                                <td>
                                                    <div className="flex flex-col gap-1">
                                                        <span className={scenario.cls}>{scenario.label}</span>
                                                        {(t.trainRun.requiresCrewChange || t.trainRun.requiresLocoChange) && (
                                                            <span className="text-[10px] text-gray-400">
                                                                {t.trainRun.requiresCrewChange ? 'смена бригады' : 'без смены бригады'}
                                                                {t.trainRun.requiresLocoChange ? ' · смена тяги' : ''}
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td><span className={P_MAP[t.trainRun.priority]?.cls ?? 'badge-gray'}><Flag size={10} className="inline -mt-0.5 mr-0.5" />{P_MAP[t.trainRun.priority]?.label ?? t.trainRun.priority}</span></td>
                                                <td><span className={`badge ${statusBadge(t.trainRun.status)}`}>{statusLabel(t.trainRun.status)}</span></td>
                                                <td className="text-gray-400 text-xs tabular-nums">{new Date(t.trainRun.scheduledDeparture).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</td>
                                                <td className="tabular-nums text-sm">{new Date(t.plannedDeparture).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</td>
                                                <td>{delayMin > 0 ? <span className="badge-red">+{delayMin} мин</span> : <span className="badge-green"><CheckCircle2 size={10} className="inline -mt-0.5 mr-0.5" />По графику</span>}</td>
                                                <td className="text-gray-600 font-medium">{t.track?.name ?? <span className="text-gray-300">—</span>}</td>
                                                <td className="font-mono text-xs text-gray-500">{t.locomotive?.label ?? <span className="text-gray-300">—</span>}</td>
                                                <td className="font-mono text-xs text-gray-400">{t.crew?.id?.slice(0, 8) ?? <span className="text-gray-300">—</span>}</td>
                                                <td>{flags.length > 0
                                                    ? <div className="flex gap-1 flex-wrap">{flags.map(([k]) => <span key={k} className="badge-red capitalize">{conflictLabel(k)}</span>)}</div>
                                                    : <span className="badge-green"><CheckCircle2 size={10} className="inline -mt-0.5 mr-0.5" />Чисто</span>}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                            <div className="px-4 py-2 text-xs text-gray-400 border-t border-gray-50">Показано {filtered.length} из {trainRuns.length} поездов</div>
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}
