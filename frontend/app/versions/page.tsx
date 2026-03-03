'use client';

import { useState, useEffect } from 'react';
import Sidebar from '../../components/Sidebar';
import { getScheduleVersions, getScheduleVersion, compareVersions } from '../../lib/api';
import Link from 'next/link';
import {
    GitCompareArrows, CheckCircle2, AlertTriangle, ArrowRight,
    ChevronDown, ChevronUp, X, Info, Flag, Clock,
} from 'lucide-react';

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

    useEffect(() => {
        const sid = new URLSearchParams(window.location.search).get('stationId') ?? '';
        setStationId(sid);
        if (sid) load(sid, 1);
    }, []);

    const load = async (sid: string, pg: number) => {
        setLoading(true);
        try { const r: any = await getScheduleVersions(sid, pg); setVersions(r.versions ?? []); setTotal(r.total ?? 0); setPage(pg); }
        catch (e: any) { setError(e.message); }
        finally { setLoading(false); }
    };

    const toggleSelect = (id: string) =>
        setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : prev.length < 2 ? [...prev, id] : [prev[1], id]);

    const handleCompare = async () => {
        if (selectedIds.length !== 2) return;
        setDiffLoading(true); setDiff(null);
        try { setDiff(await compareVersions(selectedIds[0], selectedIds[1])); }
        catch (e: any) { setError(e.message); }
        finally { setDiffLoading(false); }
    };

    const handleExpand = async (id: string) => {
        if (expanded === id) { setExpanded(null); setDetail(null); return; }
        setExpanded(id); setDetail(null);
        try { setDetail(await getScheduleVersion(id)); } catch { }
    };

    return (
        <div className="flex min-h-screen">
            <Sidebar stationId={stationId} />
            <div className="main-wrapper flex-1">
                <header className="topbar">
                    <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-800">Schedule Versions</span>
                        <span className="badge-gray ml-1">{total} total</span>
                    </div>
                    <div className="flex gap-2">
                        {selectedIds.length === 2 && (
                            <button onClick={handleCompare} disabled={diffLoading} className="btn-primary">
                                <GitCompareArrows size={14} /> {diffLoading ? 'Comparing…' : 'Compare Selected'}
                            </button>
                        )}
                        {selectedIds.length > 0 && (
                            <button onClick={() => { setSelectedIds([]); setDiff(null); }} className="btn-secondary">
                                <X size={14} /> Clear ({selectedIds.length})
                            </button>
                        )}
                    </div>
                </header>

                <main className="page-content">
                    <div className="mb-6">
                        <h1 className="text-2xl font-bold text-gray-900">Version History</h1>
                        <p className="text-gray-500 text-sm mt-1">Every reschedule creates a new immutable version. Select 2 to compare.</p>
                    </div>

                    {selectedIds.length < 2 && (
                        <div className="announce mb-5">
                            <Info size={18} className="text-sky-500 flex-shrink-0" />
                            <p className="text-sm text-gray-600 flex-1">
                                <span className="font-semibold text-gray-800">Tip: </span>
                                Click any two version cards to select them, then click <strong>Compare Selected</strong>.
                            </p>
                        </div>
                    )}

                    {selectedIds.length === 2 && (
                        <div className="bg-sky-50 border border-sky-200 rounded-2xl px-5 py-3 flex items-center gap-3 mb-5">
                            <GitCompareArrows size={16} className="text-sky-600" />
                            <span className="text-sky-600 font-semibold text-sm">Comparing:</span>
                            {selectedIds.map((id, i) => (
                                <span key={id}>
                                    <code className="text-sky-700 bg-white px-2 py-0.5 rounded-lg text-xs border border-sky-200">{id.slice(0, 8)}…</code>
                                    {i === 0 && <span className="mx-2 text-gray-400">vs</span>}
                                </span>
                            ))}
                            <button onClick={handleCompare} disabled={diffLoading} className="btn-primary ml-auto">
                                <GitCompareArrows size={14} /> Compare
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
                                                    {idx === 0 && <span className="badge-green">Latest</span>}
                                                    <span className={v.reason.startsWith('Event') ? 'badge-yellow' : 'badge-blue'}>{v.reason}</span>
                                                </div>
                                                <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                                                    <Clock size={10} /> {new Date(v.createdAt).toLocaleString()} · {v._count?.allocations ?? 0} allocations
                                                </div>
                                            </div>
                                            <button
                                                onClick={e => { e.stopPropagation(); handleExpand(v.id); }}
                                                className="btn-secondary text-xs py-1.5"
                                            >
                                                {isExpanded ? <><ChevronUp size={12} /> Hide</> : <><ChevronDown size={12} /> Details</>}
                                            </button>
                                        </div>

                                        {isExpanded && (
                                            <div className="mt-4 pt-4 border-t border-gray-100">
                                                {!detail ? (
                                                    <p className="text-gray-400 text-sm">Loading…</p>
                                                ) : (
                                                    <div className="table-wrapper">
                                                        <table className="table">
                                                            <thead><tr><th>Train</th><th>Planned Dep</th><th>Track</th><th>Loco</th><th>Conflicts</th><th>Notes</th></tr></thead>
                                                            <tbody>
                                                                {(detail.allocations ?? []).slice(0, 10).map((a: any) => (
                                                                    <tr key={a.id}>
                                                                        <td><span className="font-mono font-bold text-sky-700 text-xs bg-sky-50 px-2 py-0.5 rounded-lg">#{a.trainRun?.train?.number}</span></td>
                                                                        <td className="text-xs tabular-nums">{new Date(a.plannedDeparture).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })}</td>
                                                                        <td className="text-gray-600">{a.assignedTrack?.name ?? '—'}</td>
                                                                        <td className="text-xs font-mono text-gray-500">{a.assignedLocomotive ? `${a.assignedLocomotive.series}${a.assignedLocomotive.number}` : '—'}</td>
                                                                        <td>
                                                                            {Object.entries(a.conflictFlags ?? {}).filter(([, v]) => v).map(([k]) => <span key={k} className="badge-red mr-1">{k}</span>)}
                                                                            {!Object.values(a.conflictFlags ?? {}).some(Boolean) && <span className="badge-green"><CheckCircle2 size={10} className="inline -mt-0.5 mr-0.5" />OK</span>}
                                                                        </td>
                                                                        <td className="text-xs text-gray-400 max-w-xs truncate">{a.notes || '—'}</td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                        {detail.allocations?.length > 10 && (
                                                            <p className="text-xs text-gray-400 px-1 pt-2">Showing 10 of {detail.allocations.length}</p>
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
                            <button onClick={() => load(stationId, page - 1)} disabled={page === 1} className="btn-secondary">← Prev</button>
                            <span className="flex items-center text-sm text-gray-400 px-2">Page {page}/{Math.ceil(total / 20)}</span>
                            <button onClick={() => load(stationId, page + 1)} disabled={page >= Math.ceil(total / 20)} className="btn-secondary">Next →</button>
                        </div>
                    )}

                    {diff && (
                        <div className="card mt-6">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
                                <div>
                                    <h2 className="font-bold text-gray-900 text-lg flex items-center gap-2"><GitCompareArrows size={18} /> Comparison Result</h2>
                                    <p className="text-sm text-gray-400 mt-1">
                                        <code className="text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded text-xs">{diff.fromVersionId?.slice(0, 8)}</code>
                                        <ArrowRight size={12} className="inline mx-2 text-gray-300" />
                                        <code className="text-sky-600 bg-sky-50 px-1.5 py-0.5 rounded text-xs">{diff.toVersionId?.slice(0, 8)}</code>
                                    </p>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                                {[
                                    { label: 'Changed', v: diff.summary?.totalChanged, cls: 'bg-amber-50 border-amber-200 text-amber-700' },
                                    { label: 'Delay Δ', v: `${diff.summary?.totalDepartureDelayDeltaMinutes ?? 0}m`, cls: diff.summary?.totalDepartureDelayDeltaMinutes > 0 ? 'bg-red-50 border-red-200 text-red-600' : 'bg-green-50 border-green-200 text-green-700' },
                                    { label: 'New Issues', v: diff.summary?.newConflicts, cls: 'bg-red-50 border-red-200 text-red-600' },
                                    { label: 'Resolved', v: diff.summary?.resolvedConflicts, cls: 'bg-green-50 border-green-200 text-green-700' },
                                ].map(s => (
                                    <div key={s.label} className={`rounded-xl border p-3 text-center ${s.cls}`}>
                                        <div className="text-2xl font-bold">{s.v ?? 0}</div>
                                        <div className="text-xs font-medium mt-0.5">{s.label}</div>
                                    </div>
                                ))}
                            </div>

                            <div className="table-wrapper">
                                <table className="table">
                                    <thead><tr><th>Train</th><th>Change</th><th>Old Dep</th><th>New Dep</th><th>Delay Δ</th><th>Conflicts</th></tr></thead>
                                    <tbody>
                                        {(diff.changes ?? []).map((c: any, i: number) => (
                                            <tr key={i}>
                                                <td><span className="font-mono font-bold text-sky-700 text-xs bg-sky-50 px-2 py-0.5 rounded-lg">#{c.trainNumber}</span></td>
                                                <td><span className={c.type === 'CHANGED' ? 'badge-yellow' : c.type === 'ADDED' ? 'badge-green' : 'badge-red'}>{c.type}</span></td>
                                                <td className="text-gray-400 text-xs tabular-nums">{c.from?.plannedDeparture ? new Date(c.from.plannedDeparture).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                                                <td className="text-xs tabular-nums">{c.to?.plannedDeparture ? new Date(c.to.plannedDeparture).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                                                <td>{c.departureDeltaMinutes != null ? <span className={c.departureDeltaMinutes > 0 ? 'badge-red' : 'badge-green'}>{c.departureDeltaMinutes > 0 ? '+' : ''}{c.departureDeltaMinutes}m</span> : '—'}</td>
                                                <td>{Object.entries(c.to?.conflictFlags ?? {}).filter(([, v]) => v).map(([k]) => <span key={k} className="badge-red mr-1">{k}</span>)}{!Object.values(c.to?.conflictFlags ?? {}).some(Boolean) && <span className="badge-green"><CheckCircle2 size={10} className="inline -mt-0.5 mr-0.5" />OK</span>}</td>
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
