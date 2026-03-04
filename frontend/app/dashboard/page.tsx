'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Sidebar from '../../components/Sidebar';
import {
    getAnalytics,
    getScheduleVersions,
    getNodeOverview,
    getStations,
    pickBestStationId,
    seedData,
    getAssistantInsights,
    getDashboardNotifications,
} from '../../lib/api';
import {
    Train, Clock, AlertTriangle, FileText, Gauge, Cog, Users, CalendarDays,
    Search, Bell, LayoutGrid, Timer, ListTodo, CalendarRange,
    MoreHorizontal, Paperclip, MessageCircle, Sprout, Zap, RefreshCw,
    Sparkles, Plus, Flag, CircleCheck, ChevronRight,
} from 'lucide-react';

function Avatar({ letter, color }: { letter: string; color: string }) {
    return (
        <div className={`w-7 h-7 rounded-full ${color} flex items-center justify-center text-white text-xs font-bold -ml-1 first:ml-0 border-2 border-white`}>
            {letter}
        </div>
    );
}

function StatCard({
    icon: Icon,
    iconBg,
    count,
    label,
    sub,
    onMore,
}: {
    icon: any;
    iconBg: string;
    count: string | number;
    label: string;
    sub: string;
    onMore?: () => void;
}) {
    return (
        <div className="stat-card">
            <div className={`stat-icon ${iconBg}`}><Icon size={20} /></div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                    <div>
                        <div className="text-xs text-gray-400 mb-0.5">{sub}</div>
                        <div className="font-semibold text-gray-900">{count} {label}</div>
                    </div>
                    <button className="text-gray-300 hover:text-gray-500 p-1" onClick={onMore}><MoreHorizontal size={14} /></button>
                </div>
            </div>
        </div>
    );
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

function KanbanCard({ run, onOpen }: { run: any; onOpen: () => void }) {
    const pMap: Record<string, { cls: string; label: string }> = {
        PASSENGER: { cls: 'priority-high', label: 'Пассажирский' },
        FREIGHT: { cls: 'priority-medium', label: 'Грузовой' },
        OTHER: { cls: 'priority-low', label: 'Прочий' },
    };
    const p = pMap[run.trainRun?.priority] ?? pMap.OTHER;
    const dep = new Date(run.plannedDeparture);
    const sched = new Date(run.trainRun?.scheduledDeparture);
    const delayMin = Math.round((dep.getTime() - sched.getTime()) / 60_000);
    const hasConflict = Object.values(run.conflictFlags ?? {}).some(Boolean);
    const conflictCount = Object.entries(run.conflictFlags ?? {}).filter(([, v]) => Boolean(v)).length;

    return (
        <div className="kanban-card group">
            <div className="flex items-center gap-2 mb-2">
                <span className={p.cls}><Flag size={10} className="inline -mt-0.5 mr-0.5" />{p.label}</span>
                {hasConflict && <span className="badge-red"><AlertTriangle size={10} className="inline -mt-0.5 mr-0.5" />Конфликт</span>}
            </div>

            <p className="font-semibold text-gray-900 text-sm leading-tight mb-0.5">
                Поезд №{run.trainRun?.number}
            </p>
            <p className="text-xs text-gray-400 mb-3">
                {run.track?.name ?? 'Нет пути'} · {run.locomotive?.label ?? 'Нет локомотива'}
            </p>

            <div className="mb-3">
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                    <span>Задержка</span>
                    <span>{delayMin > 0 ? `+${delayMin} мин` : 'По графику'}</span>
                </div>
                <div className="progress-bar">
                    <div
                        className={`progress-fill ${delayMin > 30 ? 'bg-red-500' : delayMin > 0 ? 'bg-amber-400' : 'bg-green-500'}`}
                        style={{ width: `${Math.min(100, Math.max(5, (delayMin / 60) * 100))}%` }}
                    />
                </div>
            </div>

            <div className="flex items-center justify-between">
                <div className="text-xs text-gray-400 flex items-center gap-1">
                    <Clock size={12} />
                    <span>{dep.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-400">
                    <span className="flex items-center gap-0.5"><Paperclip size={11} />{run.notes ? '1' : '0'}</span>
                    <span className="flex items-center gap-0.5"><MessageCircle size={11} />{conflictCount}</span>
                    <button className="text-gray-300 hover:text-gray-600" onClick={onOpen}><ChevronRight size={12} /></button>
                </div>
            </div>
            {hasConflict && (
                <div className="mt-2 text-[11px] text-red-500 truncate">
                    {Object.entries(run.conflictFlags ?? {})
                        .filter(([, v]) => Boolean(v))
                        .map(([k]) => conflictLabel(k))
                        .join(', ')}
                </div>
            )}
        </div>
    );
}

export default function DashboardPage() {
    const router = useRouter();
    const [stationId, setStationId] = useState('');
    const [analytics, setAnalytics] = useState<any>(null);
    const [versions, setVersions] = useState<any>(null);
    const [nodeData, setNodeData] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [seeding, setSeeding] = useState(false);
    const [seedError, setSeedError] = useState('');
    const [assistantLoading, setAssistantLoading] = useState(false);
    const [assistantData, setAssistantData] = useState<any>(null);
    const [assistantError, setAssistantError] = useState('');
    const [notificationsOpen, setNotificationsOpen] = useState(false);
    const [notificationsLoading, setNotificationsLoading] = useState(false);
    const [notificationsData, setNotificationsData] = useState<any>(null);

    const loadAll = useCallback(async (sid: string) => {
        setLoading(true);
        try {
            const [a, v, n] = await Promise.all([getAnalytics(sid), getScheduleVersions(sid), getNodeOverview(sid)]);
            setAnalytics(a); setVersions(v); setNodeData(n);
        } catch { }
        finally { setLoading(false); }
    }, []);

    const resolveStationId = useCallback(async () => {
        const fromStorage = window.localStorage.getItem('ktz_station_id') ?? '';
        if (fromStorage) return fromStorage;
        const stations = await getStations();
        return pickBestStationId(stations.stations);
    }, []);

    const loadNotifications = useCallback(async (sid: string) => {
        if (!sid) return;
        setNotificationsLoading(true);
        try {
            const data = await getDashboardNotifications(sid);
            setNotificationsData(data);
        } finally {
            setNotificationsLoading(false);
        }
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
                    window.history.replaceState({}, '', `/dashboard?stationId=${sid}`);
                }
            }
            if (!mounted) return;
            setStationId(sid);
            if (sid) {
                window.localStorage.setItem('ktz_station_id', sid);
                await Promise.all([loadAll(sid), loadNotifications(sid)]);
            }
        })();
        return () => { mounted = false; };
    }, [loadAll, loadNotifications, resolveStationId]);

    const handleSeed = async () => {
        setSeeding(true); setSeedError('');
        try {
            const r: any = await seedData();
            if (r.stationId) {
                setStationId(r.stationId);
                window.localStorage.setItem('ktz_station_id', r.stationId);
                window.history.replaceState({}, '', `/dashboard?stationId=${r.stationId}`);
                await Promise.all([loadAll(r.stationId), loadNotifications(r.stationId)]);
            }
        } catch (e: any) { setSeedError(e.message); }
        finally { setSeeding(false); }
    };

    const handleAskAssistant = async () => {
        if (!stationId) return;
        setAssistantLoading(true);
        setAssistantError('');
        try {
            const data = await getAssistantInsights(stationId);
            setAssistantData(data);
        } catch (e: any) {
            setAssistantError(e.message ?? 'Ошибка загрузки подсказок');
        } finally {
            setAssistantLoading(false);
        }
    };

    const handleGlobalSearch = () => {
        if (!stationId) return;
        const q = (window.prompt('Введите № поезда или название пути:') ?? '').trim();
        if (!q) return;
        router.push(`/node?stationId=${stationId}&q=${encodeURIComponent(q)}`);
    };

    const handleNotificationsToggle = async () => {
        const next = !notificationsOpen;
        setNotificationsOpen(next);
        if (next && stationId) {
            await loadNotifications(stationId);
        }
    };

    const trains: any[] = nodeData?.trainRuns ?? [];
    const grouped = {
        planned: trains.filter(t => t.trainRun?.status === 'PLANNED'),
        active: trains.filter(t => ['ACTIVE', 'READY', 'LOCO_ASSIGNED', 'CREW_CONFIRMED'].includes(t.trainRun?.status)),
        conflicts: trains.filter(t => Object.values(t.conflictFlags ?? {}).some(Boolean)),
        departed: trains.filter(t => ['DEPARTED', 'ARRIVED', 'CANCELLED'].includes(t.trainRun?.status)),
    };

    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Доброе утро' : hour < 18 ? 'Добрый день' : 'Добрый вечер';
    const totalConflicts = analytics ? Object.values(analytics.conflictsCountByType as Record<string, number>).reduce((a, b) => a + b, 0) : 0;
    const unreadCount = notificationsData?.unreadCount ?? 0;

    return (
        <div className="flex min-h-screen">
            <Sidebar stationId={stationId} />
            <div className="main-wrapper flex-1">

                <header className="topbar">
                    <div className="flex items-center gap-1 bg-gray-100/80 p-1.5 rounded-full shadow-inner">
                        {[
                            { label: 'Обзор', href: `/dashboard?stationId=${stationId}` },
                            { label: 'Активность', href: `/node?stationId=${stationId}` },
                            { label: 'График', href: `/versions?stationId=${stationId}` },
                            { label: 'События', href: `/simulation?stationId=${stationId}` },
                            { label: 'Аналитика', href: `/node?stationId=${stationId}&filter=CONFLICTS` },
                        ].map((t, i) => (
                            <Link key={t.label} href={t.href} className={i === 0 ? 'nav-tab-active' : 'nav-tab'}>{t.label}</Link>
                        ))}
                    </div>
                    <div className="flex items-center gap-3 relative">
                        <div className="flex items-center">
                            {['D', 'O', 'A'].map((l, i) => (
                                <Avatar key={i} letter={l} color={['bg-sky-500', 'bg-emerald-500', 'bg-violet-500'][i]} />
                            ))}
                            <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-xs text-gray-500 -ml-1 border-2 border-white">+10</div>
                        </div>
                        <button className="sidebar-icon !w-8 !h-8" onClick={handleGlobalSearch}><Search size={16} /></button>
                        <button className="sidebar-icon !w-8 !h-8 relative" onClick={handleNotificationsToggle}>
                            <Bell size={16} />
                            {unreadCount > 0 && <span className="absolute -top-1 -right-1 text-[10px] min-w-4 h-4 px-1 rounded-full bg-red-500 text-white flex items-center justify-center">{Math.min(unreadCount, 9)}</span>}
                        </button>
                        <div className="w-8 h-8 rounded-full bg-sky-600 flex items-center justify-center text-white text-sm font-bold">D</div>

                        {notificationsOpen && (
                            <div className="absolute top-11 right-0 z-20 w-96 bg-white border border-gray-100 rounded-2xl shadow-xl p-3">
                                <div className="flex items-center justify-between mb-2">
                                    <p className="font-semibold text-sm text-gray-800">Уведомления</p>
                                    <button className="text-xs text-sky-600" onClick={() => stationId && loadNotifications(stationId)}>Обновить</button>
                                </div>
                                {notificationsLoading ? (
                                    <p className="text-xs text-gray-400">Загрузка...</p>
                                ) : (notificationsData?.items ?? []).length === 0 ? (
                                    <p className="text-xs text-gray-400">Уведомлений пока нет.</p>
                                ) : (
                                    <div className="max-h-72 overflow-y-auto space-y-2">
                                        {(notificationsData?.items ?? []).map((n: any) => (
                                            <div key={n.id} className="rounded-xl border border-gray-100 p-2">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className={`text-[11px] px-2 py-0.5 rounded-full ${n.level === 'critical' ? 'bg-red-100 text-red-600' : n.level === 'warning' ? 'bg-amber-100 text-amber-700' : 'bg-sky-100 text-sky-700'}`}>{n.level === 'critical' ? 'Критично' : n.level === 'warning' ? 'Внимание' : 'Инфо'}</span>
                                                    <span className="text-[11px] text-gray-400">{new Date(n.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span>
                                                </div>
                                                <p className="text-xs font-semibold text-gray-700 mt-1">{n.title}</p>
                                                <p className="text-xs text-gray-500">{n.message}</p>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </header>

                <main className="page-content">
                    <div className="mb-8">
                        <h1 className="text-4xl tracking-tight font-bold text-gray-900 mb-2">{greeting}, диспетчер</h1>
                        <p className="text-gray-500 text-lg">Контролируйте движение поездов, конфликты и изменения расписания.</p>
                    </div>

                    {!stationId ? (
                        <div className="announce mb-6">
                            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center flex-shrink-0">
                                <Train size={18} className="text-white" />
                            </div>
                            <div className="flex-1">
                                <span className="font-semibold text-gray-900">Система КТЖ готова.</span>
                                <span className="text-gray-500 ml-2">Заполните демо-данные, чтобы сразу начать симуляцию пересчета расписания.</span>
                            </div>
                            <button onClick={handleSeed} disabled={seeding} className="btn-orange flex-shrink-0">
                                {seeding ? <><RefreshCw size={14} className="animate-spin" /> Заполнение...</> : <><Sprout size={14} /> Заполнить демо-данные</>}
                            </button>
                        </div>
                    ) : (
                        <div className="announce mb-6">
                            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center flex-shrink-0">
                                <CircleCheck size={18} className="text-white" />
                            </div>
                            <p className="flex-1 text-sm text-gray-600">
                                <span className="font-semibold text-gray-900">Станция активна.</span>{' '}Перепланирование в реальном времени включено.
                                <code className="text-sky-600 ml-2 text-xs bg-sky-50 px-2 py-0.5 rounded-lg">{stationId.slice(0, 8)}…</code>
                            </p>
                            <Link href={`/simulation?stationId=${stationId}`} className="btn-orange flex-shrink-0">
                                <Zap size={14} /> Открыть симуляцию
                            </Link>
                        </div>
                    )}
                    {seedError && <p className="text-red-500 text-sm mb-4">{seedError}</p>}

                    {(assistantLoading || assistantData || assistantError) && (
                        <div className="card mb-6">
                            <div className="flex items-center justify-between mb-3">
                                <h2 className="font-semibold text-gray-800">Подсказки ИИ для диспетчера</h2>
                                <button className="btn-secondary text-xs py-1.5" onClick={handleAskAssistant}>Обновить</button>
                            </div>
                            {assistantLoading ? (
                                <p className="text-sm text-gray-400">Загрузка подсказок...</p>
                            ) : assistantError ? (
                                <p className="text-sm text-red-500">{assistantError}</p>
                            ) : (
                                <ul className="space-y-1">
                                    {(assistantData?.recommendations ?? []).map((r: string, idx: number) => (
                                        <li key={idx} className="text-sm text-gray-600 flex gap-2">
                                            <ChevronRight size={14} className="text-sky-500 mt-0.5" />{r}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}

                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                        <StatCard icon={Train} iconBg="bg-sky-50 text-sky-600" count={analytics?.totalTrains ?? '—'} label="поездов" sub="Окно планирования" onMore={() => router.push(`/node?stationId=${stationId}`)} />
                        <StatCard icon={Timer} iconBg="bg-amber-50 text-amber-600" count={`${analytics?.avgDelayMinutes ?? 0} мин`} label="средняя задержка" sub="Текущая версия" onMore={() => router.push(`/node?stationId=${stationId}&filter=DELAYED`)} />
                        <StatCard icon={AlertTriangle} iconBg="bg-red-50 text-red-500" count={totalConflicts} label="конфликтов" sub="Не решено" onMore={() => router.push(`/node?stationId=${stationId}&filter=CONFLICTS`)} />
                        <StatCard icon={FileText} iconBg="bg-violet-50 text-violet-600" count={(versions as any)?.total ?? '—'} label="версий" sub="История расписаний" onMore={() => router.push(`/versions?stationId=${stationId}`)} />
                        <StatCard icon={Gauge} iconBg="bg-green-50 text-green-600" count={`${analytics?.trackOccupancyRate ?? 0}%`} label="пути" sub="Занятость" onMore={() => router.push(`/node?stationId=${stationId}`)} />
                        <StatCard icon={Cog} iconBg="bg-indigo-50 text-indigo-600" count={`${analytics?.locomotiveUtilization ?? 0}%`} label="локомотивы" sub="Использование" onMore={() => router.push(`/node?stationId=${stationId}`)} />
                        <StatCard icon={Users} iconBg="bg-orange-50 text-orange-600" count={`${analytics?.crewUtilization ?? 0}%`} label="бригады" sub="Использование" onMore={() => router.push(`/node?stationId=${stationId}`)} />
                        <StatCard icon={CalendarDays} iconBg="bg-teal-50 text-teal-600" count={(versions as any)?.versions?.[0] ? 'Есть' : '—'} label="последняя" sub="Версия графика" onMore={() => router.push(`/versions?stationId=${stationId}`)} />
                    </div>

                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-1 bg-gray-50 border border-gray-100 rounded-full p-1.5 shadow-inner">
                            {[
                                { icon: LayoutGrid, label: 'Доска' },
                                { icon: Timer, label: 'Лента' },
                                { icon: ListTodo, label: 'Таблица' },
                                { icon: CalendarRange, label: 'Календарь' },
                            ].map((t, i) => (
                                <button key={t.label} className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 ${i === 0 ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`} onClick={() => router.push(`/node?stationId=${stationId}`)}>
                                    <t.icon size={16} /> {t.label}
                                </button>
                            ))}
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => stationId && loadAll(stationId)} className="btn-secondary">
                                <RefreshCw size={14} /> Обновить
                            </button>
                            <button className="btn-orange" onClick={handleAskAssistant}>
                                <Sparkles size={14} /> {assistantLoading ? 'Загрузка...' : 'Спросить ИИ KTZ'}
                            </button>
                            <Link href={`/simulation?stationId=${stationId}`} className="btn-dark">
                                <Plus size={14} /> Добавить событие
                            </Link>
                        </div>
                    </div>

                    {loading ? (
                        <div className="grid grid-cols-4 gap-4">
                            {[...Array(4)].map((_, i) => (
                                <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4 animate-pulse">
                                    <div className="h-4 bg-gray-100 rounded mb-4 w-24" />
                                    {[...Array(3)].map((_, j) => <div key={j} className="h-32 bg-gray-50 rounded-xl mb-3" />)}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            {[
                                { title: 'Запланировано', dot: 'bg-gray-400', count: grouped.planned.length, badge: 'bg-gray-100 text-gray-500', items: grouped.planned, empty: 'Нет запланированных поездов', group: 'PLANNED' },
                                { title: 'В работе', dot: 'bg-amber-400', count: grouped.active.length, badge: 'bg-amber-100 text-amber-600', items: grouped.active, empty: 'Нет активных поездов', group: 'ACTIVE' },
                                { title: 'Конфликты', dot: 'bg-red-400', count: grouped.conflicts.length, badge: 'bg-red-100 text-red-500', items: grouped.conflicts, empty: null, group: 'CONFLICTS' },
                                { title: 'Завершено', dot: 'bg-green-500', count: grouped.departed.length, badge: 'bg-green-100 text-green-600', items: grouped.departed, empty: 'Пока пусто', group: 'DEPARTED' },
                            ].map(col => (
                                <div key={col.title} className="kanban-col">
                                    <div className="kanban-header">
                                        <div className="flex items-center gap-2">
                                            <span className={`w-2 h-2 rounded-full ${col.dot} inline-block`} />
                                            <span className="text-sm font-semibold text-gray-600">{col.title}</span>
                                            <span className={`w-5 h-5 rounded-full text-xs font-bold flex items-center justify-center ${col.badge}`}>{col.count}</span>
                                        </div>
                                        <button className="text-gray-300 hover:text-gray-500" onClick={() => {
                                            if (col.group === 'CONFLICTS') {
                                                router.push(`/node?stationId=${stationId}&filter=CONFLICTS`);
                                            } else {
                                                router.push(`/node?stationId=${stationId}&group=${col.group}`);
                                            }
                                        }}><MoreHorizontal size={14} /></button>
                                    </div>
                                    {col.items.slice(0, 5).map((r: any, i: number) => (
                                        <KanbanCard
                                            key={i}
                                            run={r}
                                            onOpen={() => router.push(`/node?stationId=${stationId}&q=${encodeURIComponent(r.trainRun?.number ?? '')}`)}
                                        />
                                    ))}
                                    {col.items.length === 0 && col.title === 'Конфликты' ? (
                                        <div className="kanban-card text-center py-6 border-dashed">
                                            <CircleCheck size={24} className="mx-auto text-green-500 mb-1" />
                                            <p className="text-xs text-gray-400">Конфликтов нет!</p>
                                        </div>
                                    ) : col.items.length === 0 && (
                                        <p className="text-xs text-gray-400 text-center py-6">{col.empty}</p>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}
