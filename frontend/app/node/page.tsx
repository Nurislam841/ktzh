'use client';

import { useState, useEffect, useCallback } from 'react';
import Sidebar from '../../components/Sidebar';
import { getNodeOverview } from '../../lib/api';
import Link from 'next/link';
import {
    Train, AlertTriangle, Clock, Zap, RefreshCw, Filter, Search,
    Flag, CheckCircle2, ArrowRight, Gauge,
} from 'lucide-react';

const P_MAP: Record<string, { cls: string; label: string }> = {
    PASSENGER: { cls: 'priority-high', label: 'Passenger' },
    FREIGHT: { cls: 'priority-medium', label: 'Freight' },
    OTHER: { cls: 'priority-low', label: 'Other' },
};

export default function NodePage() {
    const [stationId, setStationId] = useState('');
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<'ALL' | 'CONFLICTS' | 'DELAYED'>('ALL');

    useEffect(() => {
        const sid = new URLSearchParams(window.location.search).get('stationId') ?? '';
        setStationId(sid);
        if (sid) load(sid);
    }, []);

    const load = useCallback(async (sid: string) => {
        setLoading(true);
        try { setData(await getNodeOverview(sid)); } catch { }
        finally { setLoading(false); }
    }, []);

    const trainRuns: any[] = data?.trainRuns ?? [];
    const filtered = trainRuns.filter(t => {
        if (search && !t.trainRun.number.includes(search) && !(t.track?.name ?? '').toLowerCase().includes(search.toLowerCase())) return false;
        if (filter === 'CONFLICTS' && !Object.values(t.conflictFlags ?? {}).some(Boolean)) return false;
        if (filter === 'DELAYED') {
            const delay = new Date(t.plannedDeparture).getTime() - new Date(t.trainRun.scheduledDeparture).getTime();
            if (delay <= 0) return false;
        }
        return true;
    });

    const conflictCount = trainRuns.filter(t => Object.values(t.conflictFlags ?? {}).some(Boolean)).length;
    const delayedCount = trainRuns.filter(t => new Date(t.plannedDeparture).getTime() - new Date(t.trainRun.scheduledDeparture).getTime() > 0).length;

    return (
        <div className="flex min-h-screen">
            <Sidebar stationId={stationId} />
            <div className="main-wrapper flex-1">
                <header className="topbar">
                    <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-800">Node View</span>
                        <span className="text-gray-300">/</span>
                        {data?.versionId && <code className="text-xs text-sky-600 bg-sky-50 px-2 py-0.5 rounded-lg">v/{data.versionId.slice(0, 8)}</code>}
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={() => stationId && load(stationId)} className="btn-secondary"><RefreshCw size={14} /> Refresh</button>
                        <Link href={`/simulation?stationId=${stationId}`} className="btn-primary"><Zap size={14} /> Inject Event</Link>
                    </div>
                </header>

                <main className="page-content">
                    <div className="mb-6">
                        <h1 className="text-2xl font-bold text-gray-900">Train Run Overview</h1>
                        <p className="text-gray-500 text-sm mt-1">Latest schedule allocation for all trains in the 6-hour planning window</p>
                    </div>

                    {/* Summary */}
                    <div className="grid grid-cols-3 gap-4 mb-6">
                        {[
                            { label: 'Total Trains', value: trainRuns.length, color: 'text-gray-900', bg: 'bg-white', Icon: Train },
                            { label: 'With Conflicts', value: conflictCount, color: 'text-red-600', bg: 'bg-red-50', Icon: AlertTriangle },
                            { label: 'Delayed', value: delayedCount, color: 'text-amber-600', bg: 'bg-amber-50', Icon: Clock },
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

                    {/* Filters */}
                    <div className="card mb-4 flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                        <div className="relative max-w-xs w-full">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by train # or track…" className="input-field pl-9" />
                        </div>
                        <div className="flex gap-2 ml-0 sm:ml-auto">
                            {[
                                { f: 'ALL', icon: Filter, label: 'All', cls: 'badge-blue' },
                                { f: 'CONFLICTS', icon: AlertTriangle, label: 'Conflicts', cls: 'badge-red' },
                                { f: 'DELAYED', icon: Clock, label: 'Delayed', cls: 'badge-yellow' },
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
                        <div className="card animate-pulse h-64 flex items-center justify-center text-gray-400">Loading…</div>
                    ) : (
                        <div className="table-wrapper">
                            <table className="table">
                                <thead><tr>
                                    <th>Train #</th><th>Priority</th><th>Status</th>
                                    <th>Scheduled</th><th>Planned</th><th>Delay</th>
                                    <th>Track</th><th>Locomotive</th><th>Crew</th><th>Conflicts</th>
                                </tr></thead>
                                <tbody>
                                    {filtered.length === 0 ? (
                                        <tr><td colSpan={10} className="text-center text-gray-400 py-12">No trains found</td></tr>
                                    ) : filtered.map((t: any) => {
                                        const delayMs = new Date(t.plannedDeparture).getTime() - new Date(t.trainRun.scheduledDeparture).getTime();
                                        const delayMin = Math.round(delayMs / 60_000);
                                        const flags = Object.entries(t.conflictFlags ?? {}).filter(([, v]) => v);
                                        return (
                                            <tr key={t.allocationId}>
                                                <td><span className="font-mono font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded-lg text-sm">#{t.trainRun.number}</span></td>
                                                <td><span className={P_MAP[t.trainRun.priority]?.cls ?? 'badge-gray'}><Flag size={10} className="inline -mt-0.5 mr-0.5" />{t.trainRun.priority}</span></td>
                                                <td><span className={`badge ${t.trainRun.status === 'PLANNED' ? 'badge-blue' : t.trainRun.status === 'ACTIVE' ? 'badge-green' : 'badge-gray'}`}>{t.trainRun.status}</span></td>
                                                <td className="text-gray-400 text-xs tabular-nums">{new Date(t.trainRun.scheduledDeparture).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })}</td>
                                                <td className="tabular-nums text-sm">{new Date(t.plannedDeparture).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })}</td>
                                                <td>{delayMin > 0 ? <span className="badge-red">+{delayMin}m</span> : <span className="badge-green"><CheckCircle2 size={10} className="inline -mt-0.5 mr-0.5" />On time</span>}</td>
                                                <td className="text-gray-600 font-medium">{t.track?.name ?? <span className="text-gray-300">—</span>}</td>
                                                <td className="font-mono text-xs text-gray-500">{t.locomotive?.label ?? <span className="text-gray-300">—</span>}</td>
                                                <td className="font-mono text-xs text-gray-400">{t.crew?.id?.slice(0, 8) ?? <span className="text-gray-300">—</span>}</td>
                                                <td>{flags.length > 0
                                                    ? <div className="flex gap-1 flex-wrap">{flags.map(([k]) => <span key={k} className="badge-red capitalize">{k}</span>)}</div>
                                                    : <span className="badge-green"><CheckCircle2 size={10} className="inline -mt-0.5 mr-0.5" />Clean</span>}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                            <div className="px-4 py-2 text-xs text-gray-400 border-t border-gray-50">Showing {filtered.length} of {trainRuns.length} trains</div>
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}
