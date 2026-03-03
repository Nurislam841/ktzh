'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Sidebar from '../../components/Sidebar';
import { getAnalytics, getScheduleVersions, getNodeOverview, seedData } from '../../lib/api';
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

function StatCard({ icon: Icon, iconBg, count, label, sub }: { icon: any; iconBg: string; count: string | number; label: string; sub: string }) {
    return (
        <div className="stat-card">
            <div className={`stat-icon ${iconBg}`}><Icon size={20} /></div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                    <div>
                        <div className="text-xs text-gray-400 mb-0.5">{sub}</div>
                        <div className="font-semibold text-gray-900">{count} {label}</div>
                    </div>
                    <button className="text-gray-300 hover:text-gray-500 p-1"><MoreHorizontal size={14} /></button>
                </div>
            </div>
        </div>
    );
}

function KanbanCard({ run }: { run: any }) {
    const pMap: Record<string, { cls: string; label: string }> = {
        PASSENGER: { cls: 'priority-high', label: 'Passenger' },
        FREIGHT: { cls: 'priority-medium', label: 'Freight' },
        OTHER: { cls: 'priority-low', label: 'Other' },
    };
    const p = pMap[run.trainRun?.priority] ?? pMap.OTHER;
    const dep = new Date(run.plannedDeparture);
    const sched = new Date(run.trainRun?.scheduledDeparture);
    const delayMin = Math.round((dep.getTime() - sched.getTime()) / 60_000);
    const hasConflict = Object.values(run.conflictFlags ?? {}).some(Boolean);

    return (
        <div className="kanban-card group">
            <div className="flex items-center gap-2 mb-2">
                <span className={p.cls}><Flag size={10} className="inline -mt-0.5 mr-0.5" />{p.label}</span>
                {hasConflict && <span className="badge-red"><AlertTriangle size={10} className="inline -mt-0.5 mr-0.5" />Conflict</span>}
            </div>

            <p className="font-semibold text-gray-900 text-sm leading-tight mb-0.5">
                Train #{run.trainRun?.number}
            </p>
            <p className="text-xs text-gray-400 mb-3">
                {run.track?.name ?? 'No track'} · {run.locomotive?.label ?? 'No loco'}
            </p>

            <div className="mb-3">
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                    <span>Delay</span>
                    <span>{delayMin > 0 ? `+${delayMin}min` : 'On time'}</span>
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
                    <span>{dep.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-400">
                    <span className="flex items-center gap-0.5"><Paperclip size={11} />{run.notes ? '1' : '0'}</span>
                    <span className="flex items-center gap-0.5"><MessageCircle size={11} />0</span>
                </div>
            </div>
        </div>
    );
}

export default function DashboardPage() {
    const [stationId, setStationId] = useState('');
    const [analytics, setAnalytics] = useState<any>(null);
    const [versions, setVersions] = useState<any>(null);
    const [nodeData, setNodeData] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [seeding, setSeeding] = useState(false);
    const [seedError, setSeedError] = useState('');

    useEffect(() => {
        const sid = new URLSearchParams(window.location.search).get('stationId') ?? '';
        setStationId(sid);
        if (sid) loadAll(sid);
    }, []);

    const loadAll = useCallback(async (sid: string) => {
        setLoading(true);
        try {
            const [a, v, n] = await Promise.all([getAnalytics(sid), getScheduleVersions(sid), getNodeOverview(sid)]);
            setAnalytics(a); setVersions(v); setNodeData(n);
        } catch { }
        finally { setLoading(false); }
    }, []);

    const handleSeed = async () => {
        setSeeding(true); setSeedError('');
        try {
            const r: any = await seedData();
            if (r.stationId) {
                setStationId(r.stationId);
                window.history.replaceState({}, '', `/dashboard?stationId=${r.stationId}`);
                await loadAll(r.stationId);
            }
        } catch (e: any) { setSeedError(e.message); }
        finally { setSeeding(false); }
    };

    const trains: any[] = nodeData?.trainRuns ?? [];
    const grouped = {
        planned: trains.filter(t => t.trainRun?.status === 'PLANNED'),
        active: trains.filter(t => t.trainRun?.status === 'ACTIVE'),
        conflicts: trains.filter(t => Object.values(t.conflictFlags ?? {}).some(Boolean)),
        departed: trains.filter(t => ['DEPARTED', 'ARRIVED'].includes(t.trainRun?.status)),
    };

    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    const totalConflicts = analytics ? Object.values(analytics.conflictsCountByType as Record<string, number>).reduce((a, b) => a + b, 0) : 0;

    return (
        <div className="flex min-h-screen">
            <Sidebar stationId={stationId} />
            <div className="main-wrapper flex-1">

                {/* Topbar */}
                <header className="topbar">
                    <div className="flex items-center gap-1">
                        {['Overview', 'Activity', 'Schedule', 'Events', 'Analytics'].map((t, i) => (
                            <span key={t} className={i === 0 ? 'nav-tab-active' : 'nav-tab'}>{t}</span>
                        ))}
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="flex items-center">
                            {['D', 'O', 'A'].map((l, i) => (
                                <Avatar key={i} letter={l} color={['bg-sky-500', 'bg-emerald-500', 'bg-violet-500'][i]} />
                            ))}
                            <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-xs text-gray-500 -ml-1 border-2 border-white">+10</div>
                        </div>
                        <button className="sidebar-icon !w-8 !h-8"><Search size={16} /></button>
                        <button className="sidebar-icon !w-8 !h-8"><Bell size={16} /></button>
                        <div className="w-8 h-8 rounded-full bg-sky-600 flex items-center justify-center text-white text-sm font-bold">D</div>
                    </div>
                </header>

                <main className="page-content">
                    {/* Greeting */}
                    <div className="mb-6">
                        <h1 className="text-3xl font-bold text-gray-900">{greeting}, Dispatcher</h1>
                        <p className="text-gray-500 mt-1">Stay on top of train schedules, monitor conflicts, and track rescheduling.</p>
                    </div>

                    {/* Banner */}
                    {!stationId ? (
                        <div className="announce mb-6">
                            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center flex-shrink-0">
                                <Train size={18} className="text-white" />
                            </div>
                            <div className="flex-1">
                                <span className="font-semibold text-gray-900">KTZ System is ready.</span>
                                <span className="text-gray-500 ml-2">Seed demo data to start simulating railway rescheduling instantly.</span>
                            </div>
                            <button onClick={handleSeed} disabled={seeding} className="btn-orange flex-shrink-0">
                                {seeding ? <><RefreshCw size={14} className="animate-spin" /> Seeding...</> : <><Sprout size={14} /> Seed Demo Data</>}
                            </button>
                        </div>
                    ) : (
                        <div className="announce mb-6">
                            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center flex-shrink-0">
                                <CircleCheck size={18} className="text-white" />
                            </div>
                            <p className="flex-1 text-sm text-gray-600">
                                <span className="font-semibold text-gray-900">Station active.</span>{' '}Real-time rescheduling is live.
                                <code className="text-sky-600 ml-2 text-xs bg-sky-50 px-2 py-0.5 rounded-lg">{stationId.slice(0, 8)}…</code>
                            </p>
                            <Link href={`/simulation?stationId=${stationId}`} className="btn-orange flex-shrink-0">
                                <Zap size={14} /> Run Simulation
                            </Link>
                        </div>
                    )}
                    {seedError && <p className="text-red-500 text-sm mb-4">{seedError}</p>}

                    {/* Stats */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                        <StatCard icon={Train} iconBg="bg-sky-50 text-sky-600" count={analytics?.totalTrains ?? '—'} label="Trains" sub="Planning Window" />
                        <StatCard icon={Timer} iconBg="bg-amber-50 text-amber-600" count={`${analytics?.avgDelayMinutes ?? 0}min`} label="Avg Delay" sub="Current Version" />
                        <StatCard icon={AlertTriangle} iconBg="bg-red-50 text-red-500" count={totalConflicts} label="Conflicts" sub="Unresolved" />
                        <StatCard icon={FileText} iconBg="bg-violet-50 text-violet-600" count={(versions as any)?.total ?? '—'} label="Versions" sub="Schedule History" />
                        <StatCard icon={Gauge} iconBg="bg-green-50 text-green-600" count={`${analytics?.trackOccupancyRate ?? 0}%`} label="Tracks" sub="Occupancy Rate" />
                        <StatCard icon={Cog} iconBg="bg-indigo-50 text-indigo-600" count={`${analytics?.locomotiveUtilization ?? 0}%`} label="Locos" sub="Utilization" />
                        <StatCard icon={Users} iconBg="bg-orange-50 text-orange-600" count={`${analytics?.crewUtilization ?? 0}%`} label="Crews" sub="Utilization" />
                        <StatCard icon={CalendarDays} iconBg="bg-teal-50 text-teal-600" count={(versions as any)?.versions?.[0] ? 'Active' : '—'} label="Latest" sub="Schedule" />
                    </div>

                    {/* Board tabs + actions */}
                    <div className="flex items-center justify-between mb-5">
                        <div className="flex items-center gap-1 bg-white border border-gray-100 rounded-xl p-1 shadow-sm">
                            {[
                                { icon: LayoutGrid, label: 'Board' },
                                { icon: Timer, label: 'Timeline' },
                                { icon: ListTodo, label: 'Spreadsheet' },
                                { icon: CalendarRange, label: 'Calendar' },
                            ].map((t, i) => (
                                <span key={t.label} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium cursor-pointer transition-colors ${i === 0 ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
                                    <t.icon size={14} /> {t.label}
                                </span>
                            ))}
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => stationId && loadAll(stationId)} className="btn-secondary">
                                <RefreshCw size={14} /> Refresh
                            </button>
                            <button className="btn-orange"><Sparkles size={14} /> Ask KTZ AI</button>
                            <Link href={`/simulation?stationId=${stationId}`} className="btn-dark">
                                <Plus size={14} /> Inject Event
                            </Link>
                        </div>
                    </div>

                    {/* Kanban */}
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
                                { title: 'Planned', dot: 'bg-gray-400', count: grouped.planned.length, badge: 'bg-gray-100 text-gray-500', items: grouped.planned, empty: 'No planned trains' },
                                { title: 'In Progress', dot: 'bg-amber-400', count: grouped.active.length, badge: 'bg-amber-100 text-amber-600', items: grouped.active, empty: 'No active trains' },
                                { title: 'Conflicts', dot: 'bg-red-400', count: grouped.conflicts.length, badge: 'bg-red-100 text-red-500', items: grouped.conflicts, empty: null },
                                { title: 'Completed', dot: 'bg-green-500', count: grouped.departed.length, badge: 'bg-green-100 text-green-600', items: grouped.departed, empty: 'None yet' },
                            ].map(col => (
                                <div key={col.title} className="kanban-col">
                                    <div className="kanban-header">
                                        <div className="flex items-center gap-2">
                                            <span className={`w-2 h-2 rounded-full ${col.dot} inline-block`} />
                                            <span className="text-sm font-semibold text-gray-600">{col.title}</span>
                                            <span className={`w-5 h-5 rounded-full text-xs font-bold flex items-center justify-center ${col.badge}`}>{col.count}</span>
                                        </div>
                                        <button className="text-gray-300 hover:text-gray-500"><MoreHorizontal size={14} /></button>
                                    </div>
                                    {col.items.slice(0, 5).map((r: any, i: number) => <KanbanCard key={i} run={r} />)}
                                    {col.items.length === 0 && col.title === 'Conflicts' ? (
                                        <div className="kanban-card text-center py-6 border-dashed">
                                            <CircleCheck size={24} className="mx-auto text-green-500 mb-1" />
                                            <p className="text-xs text-gray-400">No conflicts!</p>
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
