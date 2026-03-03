'use client';

import { useState, useEffect } from 'react';
import Sidebar from '../../components/Sidebar';
import { createEvent, compareVersions, EventType, getNodeOverview } from '../../lib/api';
import Link from 'next/link';
import {
    Zap, ArrowLeft, RefreshCw, CircleOff, UserX, Clock, Construction,
    Wrench, CheckCircle2, AlertTriangle, Flag, ArrowRight, Loader2,
    RotateCcw, ChevronRight,
} from 'lucide-react';

const EVENT_TYPES: { value: EventType; label: string; Icon: any; color: string; description: string }[] = [
    { value: 'LOCOMOTIVE_FAILURE', label: 'Loco Failure', Icon: CircleOff, color: 'border-red-200 bg-red-50', description: 'Locomotive marked FAILED' },
    { value: 'CREW_UNAVAILABLE', label: 'Crew Unavailable', Icon: UserX, color: 'border-amber-200 bg-amber-50', description: 'Crew marked UNAVAILABLE' },
    { value: 'TRAIN_DELAY', label: 'Train Delay', Icon: Clock, color: 'border-blue-200 bg-blue-50', description: 'Add delay minutes to a run' },
    { value: 'TRACK_BLOCKED', label: 'Track Blocked', Icon: Construction, color: 'border-orange-200 bg-orange-50', description: 'Block track for maintenance' },
    { value: 'MAINTENANCE_STARTED', label: 'Maint. Started', Icon: Wrench, color: 'border-purple-200 bg-purple-50', description: 'Loco enters maintenance' },
    { value: 'MAINTENANCE_ENDED', label: 'Maint. Ended', Icon: CheckCircle2, color: 'border-green-200 bg-green-50', description: 'Loco returns to service' },
];

function examplePayload(type: EventType, nodeData: any): string {
    const runs = nodeData?.trainRuns ?? [];
    const first = runs[0];
    switch (type) {
        case 'LOCOMOTIVE_FAILURE': return JSON.stringify({ locomotiveId: first?.locomotive?.id ?? '<loco-uuid>' }, null, 2);
        case 'CREW_UNAVAILABLE': return JSON.stringify({ crewId: first?.crew?.id ?? '<crew-uuid>' }, null, 2);
        case 'TRAIN_DELAY': return JSON.stringify({ trainRunId: first?.trainRun?.id ?? '<run-uuid>', delayMinutes: 30 }, null, 2);
        case 'TRACK_BLOCKED': return JSON.stringify({ trackId: nodeData?.tracks?.[0]?.id ?? '<track-uuid>' }, null, 2);
        case 'MAINTENANCE_STARTED': return JSON.stringify({ locomotiveId: first?.locomotive?.id ?? '<loco-uuid>' }, null, 2);
        case 'MAINTENANCE_ENDED': return JSON.stringify({ locomotiveId: first?.locomotive?.id ?? '<loco-uuid>' }, null, 2);
        default: return '{}';
    }
}

export default function SimulationPage() {
    const [stationId, setStationId] = useState('');
    const [eventType, setEventType] = useState<EventType>('LOCOMOTIVE_FAILURE');
    const [payload, setPayload] = useState('{}');
    const [submitting, setSubmitting] = useState(false);
    const [result, setResult] = useState<any>(null);
    const [diff, setDiff] = useState<any>(null);
    const [error, setError] = useState('');
    const [nodeData, setNodeData] = useState<any>(null);

    useEffect(() => {
        const sid = new URLSearchParams(window.location.search).get('stationId') ?? '';
        setStationId(sid);
        if (sid) getNodeOverview(sid).then(d => { setNodeData(d); setPayload(examplePayload('LOCOMOTIVE_FAILURE', d)); }).catch(() => { });
    }, []);

    const onTypeChange = (t: EventType) => { setEventType(t); setPayload(examplePayload(t, nodeData)); };

    const handleSubmit = async () => {
        setSubmitting(true); setResult(null); setDiff(null); setError('');
        let parsed: Record<string, unknown>;
        try { parsed = JSON.parse(payload); } catch { setError('Invalid JSON'); setSubmitting(false); return; }
        try {
            const r: any = await createEvent({ stationId, type: eventType, payload: parsed });
            setResult(r);
            if (r.baseVersionId && r.newVersionId) setDiff(await compareVersions(r.baseVersionId, r.newVersionId));
        } catch (e: any) { setError(e.message); }
        finally { setSubmitting(false); }
    };

    const selected = EVENT_TYPES.find(e => e.value === eventType)!;

    return (
        <div className="flex min-h-screen">
            <Sidebar stationId={stationId} />
            <div className="main-wrapper flex-1">
                <header className="topbar">
                    <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-800">Simulation</span>
                        <span className="text-gray-300">/</span>
                        <span className="text-gray-500 text-sm">Event Injection &amp; Rescheduler</span>
                    </div>
                    <Link href={`/dashboard?stationId=${stationId}`} className="btn-secondary"><ArrowLeft size={14} /> Dashboard</Link>
                </header>

                <main className="page-content">
                    <div className="mb-6">
                        <h1 className="text-2xl font-bold text-gray-900">Event Simulation</h1>
                        <p className="text-gray-500 text-sm mt-1">Inject an operational event → trigger greedy rescheduler → compare before/after</p>
                    </div>

                    {/* How it works */}
                    <div className="announce mb-6">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center flex-shrink-0">
                            <Zap size={18} className="text-white" />
                        </div>
                        <p className="text-sm text-gray-600 flex-1">
                            <span className="font-semibold text-gray-900">How it works:</span>{' '}Select event → configure JSON payload → click Inject. The greedy solver runs automatically and generates a new schedule version.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-6">
                        {/* Step 1 */}
                        <div className="card">
                            <div className="flex items-center gap-2 mb-4">
                                <div className="w-6 h-6 rounded-full bg-sky-600 text-white text-xs font-bold flex items-center justify-center">1</div>
                                <h2 className="font-semibold text-gray-800">Select Event Type</h2>
                            </div>
                            <div className="space-y-2">
                                {EVENT_TYPES.map(et => (
                                    <button
                                        key={et.value}
                                        onClick={() => onTypeChange(et.value)}
                                        className={`w-full text-left px-3 py-2.5 rounded-xl border-2 transition-all flex items-center gap-3 ${eventType === et.value ? 'border-sky-400 bg-sky-50' : 'border-gray-100 bg-white hover:border-gray-200'
                                            }`}
                                    >
                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${et.color}`}>
                                            <et.Icon size={16} />
                                        </div>
                                        <div className="flex-1">
                                            <div className="font-medium text-sm text-gray-800">{et.label}</div>
                                            <div className="text-xs text-gray-400">{et.description}</div>
                                        </div>
                                        {eventType === et.value && <CheckCircle2 size={16} className="text-sky-500" />}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Step 2 */}
                        <div className="card">
                            <div className="flex items-center gap-2 mb-4">
                                <div className="w-6 h-6 rounded-full bg-sky-600 text-white text-xs font-bold flex items-center justify-center">2</div>
                                <h2 className="font-semibold text-gray-800">Configure Payload</h2>
                            </div>

                            <div className={`rounded-xl border-2 p-3 mb-3 flex items-center gap-3 ${selected.color}`}>
                                <selected.Icon size={18} />
                                <div>
                                    <div className="font-semibold text-sm text-gray-800">{selected.label}</div>
                                    <div className="text-xs text-gray-500">{selected.description}</div>
                                </div>
                            </div>

                            <label className="text-xs text-gray-500 font-medium block mb-1">Station ID</label>
                            <input value={stationId} onChange={e => setStationId(e.target.value)} className="input-field mb-3" placeholder="Station UUID" />

                            <label className="text-xs text-gray-500 font-medium block mb-1">Payload (JSON)</label>
                            <textarea value={payload} onChange={e => setPayload(e.target.value)} rows={8} className="input-field font-mono text-xs resize-none mb-2" />
                            <button onClick={() => setPayload(examplePayload(eventType, nodeData))} className="text-xs text-sky-600 hover:underline flex items-center gap-1">
                                <RotateCcw size={10} /> Reset to example
                            </button>
                        </div>

                        {/* Step 3 */}
                        <div className="card">
                            <div className="flex items-center gap-2 mb-4">
                                <div className="w-6 h-6 rounded-full bg-sky-600 text-white text-xs font-bold flex items-center justify-center">3</div>
                                <h2 className="font-semibold text-gray-800">Inject &amp; Reschedule</h2>
                            </div>

                            <button onClick={handleSubmit} disabled={submitting || !stationId} className="btn-dark w-full mb-4 justify-center py-3 text-base">
                                {submitting ? <><Loader2 size={16} className="animate-spin" /> Rescheduling…</> : <><Zap size={16} /> Inject Event</>}
                            </button>

                            {error && (
                                <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-3">
                                    <p className="text-red-600 text-sm flex items-center gap-1"><AlertTriangle size={14} /> {error}</p>
                                </div>
                            )}

                            {result && (
                                <div className="space-y-3">
                                    <div className="bg-green-50 border border-green-200 rounded-xl p-3">
                                        <p className="font-semibold text-green-700 text-sm mb-2 flex items-center gap-1"><CheckCircle2 size={14} /> Rescheduled successfully!</p>
                                        <div className="space-y-1 text-xs">
                                            <div className="flex gap-2"><span className="text-gray-400 w-20">Old Version</span><code className="text-amber-600 font-mono">{result.baseVersionId?.slice(0, 8) ?? '—'}</code></div>
                                            <div className="flex gap-2"><span className="text-gray-400 w-20">New Version</span><code className="text-sky-600 font-mono">{result.newVersionId?.slice(0, 8)}</code></div>
                                        </div>
                                    </div>
                                    <div className="bg-gray-50 rounded-xl p-3">
                                        <p className="text-xs font-semibold text-gray-600 mb-2">Solver Summary</p>
                                        <ul className="space-y-1">
                                            {(result.summary ?? []).map((s: string, i: number) => (
                                                <li key={i} className="text-xs text-gray-600 flex gap-2">
                                                    <ChevronRight size={12} className="text-sky-500 flex-shrink-0 mt-0.5" />{s}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Diff */}
                    {diff && (
                        <div className="card">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
                                <div>
                                    <h2 className="font-bold text-gray-900 text-lg">Schedule Comparison</h2>
                                    <p className="text-sm text-gray-400 mt-1">
                                        <code className="text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded text-xs">{diff.fromVersionId?.slice(0, 8)}</code>
                                        <ArrowRight size={12} className="inline mx-2 text-gray-300" />
                                        <code className="text-sky-600 bg-sky-50 px-1.5 py-0.5 rounded text-xs">{diff.toVersionId?.slice(0, 8)}</code>
                                    </p>
                                </div>
                                <div className="flex gap-3">
                                    {[
                                        { label: 'Changed', v: diff.summary?.totalChanged, cls: 'badge-yellow' },
                                        { label: 'New Conflicts', v: diff.summary?.newConflicts, cls: 'badge-red' },
                                        { label: 'Resolved', v: diff.summary?.resolvedConflicts, cls: 'badge-green' },
                                        { label: 'Total Delay Δ', v: `${diff.summary?.totalDepartureDelayDeltaMinutes ?? 0}m`, cls: 'badge-blue' },
                                    ].map(s => (
                                        <div key={s.label} className="text-center">
                                            <div className={`badge ${s.cls} mb-1 text-sm px-2 py-1`}>{s.v ?? 0}</div>
                                            <div className="text-xs text-gray-400">{s.label}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="table-wrapper">
                                <table className="table">
                                    <thead><tr>
                                        <th>Train</th><th>Priority</th><th>Change</th>
                                        <th>Old Dep</th><th>New Dep</th><th>Delay Δ</th>
                                        <th>Track</th><th>Conflicts</th>
                                    </tr></thead>
                                    <tbody>
                                        {(diff.changes ?? []).map((c: any, i: number) => (
                                            <tr key={i} className={c.type === 'CHANGED' ? 'bg-amber-50/30' : c.type === 'ADDED' ? 'bg-green-50/30' : 'bg-red-50/30'}>
                                                <td><span className="font-mono font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded-lg text-xs">#{c.trainNumber}</span></td>
                                                <td><span className={c.priority === 'PASSENGER' ? 'priority-high' : c.priority === 'FREIGHT' ? 'priority-medium' : 'priority-low'}><Flag size={10} className="inline -mt-0.5 mr-0.5" />{c.priority}</span></td>
                                                <td><span className={c.type === 'CHANGED' ? 'badge-yellow' : c.type === 'ADDED' ? 'badge-green' : 'badge-red'}>{c.type}</span></td>
                                                <td className="text-gray-400 text-xs tabular-nums">{c.from?.plannedDeparture ? new Date(c.from.plannedDeparture).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                                                <td className="text-xs tabular-nums">{c.to?.plannedDeparture ? new Date(c.to.plannedDeparture).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                                                <td>{c.departureDeltaMinutes != null ? <span className={c.departureDeltaMinutes > 0 ? 'badge-red' : 'badge-green'}>{c.departureDeltaMinutes > 0 ? '+' : ''}{c.departureDeltaMinutes}m</span> : '—'}</td>
                                                <td className="text-xs text-gray-500">{c.from?.track && c.to?.track && c.from.track !== c.to.track ? <span className="text-amber-600">{c.from.track}<ArrowRight size={10} className="inline mx-0.5" />{c.to.track}</span> : c.to?.track ?? '—'}</td>
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
