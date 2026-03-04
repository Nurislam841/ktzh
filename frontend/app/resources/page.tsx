'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Sidebar from '../../components/Sidebar';
import { getNodeResources, getStations, pickBestStationId } from '../../lib/api';
import { RefreshCw, Train, Users, Route, Wrench, Clock, CheckCircle2 } from 'lucide-react';

function statusBadge(status: string) {
    if (status === 'AVAILABLE' || status === 'FREE') return 'badge-green';
    if (status === 'MAINTENANCE' || status === 'UNAVAILABLE') return 'badge-red';
    if (status === 'ASSIGNED' || status === 'IN_TRANSIT' || status === 'OCCUPIED') return 'badge-yellow';
    return 'badge-gray';
}

function statusLabel(status: string) {
    const labels: Record<string, string> = {
        AVAILABLE: 'Доступен',
        ASSIGNED: 'Назначен',
        IN_TRANSIT: 'В пути',
        MAINTENANCE: 'Ремонт',
        UNAVAILABLE: 'Недоступна',
        RESTING: 'Отдых',
        FREE: 'Свободен',
        OCCUPIED: 'Занят',
    };
    return labels[status] ?? status;
}

export default function ResourcesPage() {
    const [stationId, setStationId] = useState('');
    const [stations, setStations] = useState<any[]>([]);
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(false);

    const loadResources = useCallback(async (sid: string) => {
        if (!sid) return;
        setLoading(true);
        try {
            const res = await getNodeResources(sid);
            setData(res);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        let mounted = true;
        (async () => {
            const stationRes = await getStations();
            if (!mounted) return;
            setStations(stationRes.stations ?? []);

            const fromQuery = new URLSearchParams(window.location.search).get('stationId') ?? '';
            const fromStorage = window.localStorage.getItem('ktz_station_id') ?? '';
            const best = pickBestStationId(stationRes.stations ?? []);
            const selected = fromQuery || fromStorage || best;

            if (!selected) return;
            setStationId(selected);
            window.localStorage.setItem('ktz_station_id', selected);
            window.history.replaceState({}, '', `/resources?stationId=${selected}`);
            await loadResources(selected);
        })();
        return () => { mounted = false; };
    }, [loadResources]);

    const summary = data?.summary ?? {};
    const tracks: any[] = data?.tracks ?? [];
    const locomotives: any[] = data?.locomotives ?? [];
    const crews: any[] = data?.crews ?? [];

    const maintenanceCount = useMemo(
        () => tracks.filter((t) => t.status === 'MAINTENANCE').length + locomotives.filter((l) => l.status === 'MAINTENANCE').length,
        [locomotives, tracks],
    );

    return (
        <div className="flex min-h-screen">
            <Sidebar stationId={stationId} />
            <div className="main-wrapper flex-1">
                <header className="topbar">
                    <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-800">Ресурсы узла</span>
                        <span className="text-gray-300">/</span>
                        <span className="text-gray-500 text-sm">Локомотивы, бригады, пути</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <select
                            value={stationId}
                            onChange={async (e) => {
                                const sid = e.target.value;
                                setStationId(sid);
                                window.localStorage.setItem('ktz_station_id', sid);
                                window.history.replaceState({}, '', `/resources?stationId=${sid}`);
                                await loadResources(sid);
                            }}
                            className="input-field !py-2 !px-3 !w-64"
                        >
                            {stations.map((s: any) => (
                                <option key={s.id} value={s.id}>
                                    {s.name} ({s.trainRuns} поездов, {s.locomotives} лок.)
                                </option>
                            ))}
                        </select>
                        <button onClick={() => stationId && loadResources(stationId)} className="btn-secondary"><RefreshCw size={14} /> Обновить</button>
                        <Link href={`/node?stationId=${stationId}`} className="btn-primary"><Route size={14} /> Узел</Link>
                    </div>
                </header>

                <main className="page-content">
                    <div className="mb-6">
                        <h1 className="text-2xl font-bold text-gray-900">Состояние ресурсов станции</h1>
                        <p className="text-gray-500 text-sm mt-1">Актуальные данные по доступности и ограничениям</p>
                    </div>

                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                        <div className="stat-card"><div className="stat-icon bg-sky-50 text-sky-600"><Route size={20} /></div><div><div className="text-xs text-gray-400">Пути</div><div className="font-semibold">{summary.tracks ?? 0} всего</div></div></div>
                        <div className="stat-card"><div className="stat-icon bg-indigo-50 text-indigo-600"><Train size={20} /></div><div><div className="text-xs text-gray-400">Локомотивы</div><div className="font-semibold">{summary.locomotives ?? 0} всего</div></div></div>
                        <div className="stat-card"><div className="stat-icon bg-orange-50 text-orange-600"><Users size={20} /></div><div><div className="text-xs text-gray-400">Бригады</div><div className="font-semibold">{summary.crews ?? 0} всего</div></div></div>
                        <div className="stat-card"><div className="stat-icon bg-red-50 text-red-600"><Wrench size={20} /></div><div><div className="text-xs text-gray-400">Ремонт/ограничения</div><div className="font-semibold">{maintenanceCount}</div></div></div>
                    </div>

                    {loading ? (
                        <div className="card animate-pulse h-60" />
                    ) : (
                        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                            <div className="card">
                                <h2 className="font-semibold text-gray-800 mb-3">Пути</h2>
                                <div className="table-wrapper">
                                    <table className="table">
                                        <thead><tr><th>Путь</th><th>Статус</th><th>Ограничение до</th></tr></thead>
                                        <tbody>
                                            {tracks.map((t) => (
                                                <tr key={t.id}>
                                                    <td>{t.name}</td>
                                                    <td><span className={`badge ${statusBadge(t.status)}`}>{statusLabel(t.status)}</span></td>
                                                    <td className="text-xs text-gray-500">{t.maintenanceTo ? new Date(t.maintenanceTo).toLocaleString('ru-RU') : '—'}</td>
                                                </tr>
                                            ))}
                                            {tracks.length === 0 && <tr><td colSpan={3} className="text-center text-gray-400 py-6">Нет данных</td></tr>}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            <div className="card">
                                <h2 className="font-semibold text-gray-800 mb-3">Локомотивы</h2>
                                <div className="table-wrapper">
                                    <table className="table">
                                        <thead><tr><th>Локомотив</th><th>Статус</th><th>Доступен с</th></tr></thead>
                                        <tbody>
                                            {locomotives.map((l) => (
                                                <tr key={l.id}>
                                                    <td className="font-mono text-xs">{l.label}</td>
                                                    <td><span className={`badge ${statusBadge(l.status)}`}>{statusLabel(l.status)}</span></td>
                                                    <td className="text-xs text-gray-500">{l.availableFrom ? new Date(l.availableFrom).toLocaleString('ru-RU') : '—'}</td>
                                                </tr>
                                            ))}
                                            {locomotives.length === 0 && <tr><td colSpan={3} className="text-center text-gray-400 py-6">Нет локомотивов на станции</td></tr>}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            <div className="card">
                                <h2 className="font-semibold text-gray-800 mb-3">Бригады</h2>
                                <div className="table-wrapper">
                                    <table className="table">
                                        <thead><tr><th>Бригада</th><th>Статус</th><th>Доступна с</th></tr></thead>
                                        <tbody>
                                            {crews.map((c) => (
                                                <tr key={c.id}>
                                                    <td className="font-mono text-xs">{c.id.slice(0, 8)}</td>
                                                    <td><span className={`badge ${statusBadge(c.status)}`}>{statusLabel(c.status)}</span></td>
                                                    <td className="text-xs text-gray-500 flex items-center gap-1"><Clock size={12} />{c.availableFrom ? new Date(c.availableFrom).toLocaleString('ru-RU') : '—'}</td>
                                                </tr>
                                            ))}
                                            {crews.length === 0 && <tr><td colSpan={3} className="text-center text-gray-400 py-6">Нет бригад для этой станции</td></tr>}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {!loading && (
                        <div className="announce mt-6">
                            <CheckCircle2 size={18} className="text-green-600" />
                            <p className="text-sm text-gray-600">Данные ресурсов загружены. Используй этот экран вместе с симуляцией событий и сравнением версий.</p>
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}
