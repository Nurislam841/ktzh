import React, { useEffect, useMemo, useState } from 'react';
import { MapContainer, Marker, Polyline, Popup, TileLayer, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

export interface GisStationData {
    id: string;
    name: string;
    code: string | null;
    latitude: number;
    longitude: number;
    availableLocomotives: number;
    assignedLocomotives: number;
    maintenanceLocomotives?: number;
    inTransitLocomotives?: number;
    isCongested: boolean;
    idleLocomotivesCount?: number;
    sumDwellTimeMinutes?: number;
    maxDwellTimeMinutes?: number;
}

interface RouteSegment {
    from: { id: string; name: string; code: string | null; lat: number; lng: number };
    to: { id: string; name: string; code: string | null; lat: number; lng: number };
    distanceKm: number | null;
    trainCount: number;
    source: string;
}

const KAZAKHSTAN_BOUNDS: L.LatLngBoundsExpression = [
    [40.0, 46.0],
    [56.0, 89.0],
];

function FitMapToStations({ stations }: { stations: GisStationData[] }) {
    const map = useMap();

    useEffect(() => {
        if (stations.length === 0) {
            map.fitBounds(KAZAKHSTAN_BOUNDS, { animate: false });
            return;
        }

        const bounds = L.latLngBounds(
            stations.map((station) => [station.latitude, station.longitude] as [number, number]),
        );
        map.fitBounds(bounds.pad(0.35), { animate: false });
    }, [map, stations]);

    return null;
}

const RailwayGISDashboard = () => {
    const [stations, setStations] = useState<GisStationData[]>([]);
    const [routeLines, setRouteLines] = useState<RouteSegment[]>([]);
    const [loading, setLoading] = useState(true);
    const [showRailNetwork, setShowRailNetwork] = useState(true);
    const [showLogicalRoutes, setShowLogicalRoutes] = useState(true);

    useEffect(() => {
        delete (L.Icon.Default.prototype as any)._getIconUrl;
        L.Icon.Default.mergeOptions({
            iconRetinaUrl: '/images/marker-icon-2x.png',
            iconUrl: '/images/marker-icon.png',
            shadowUrl: '/images/marker-shadow.png',
        });

        const fetchData = async () => {
            try {
                const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
                const [stationsRes, routesRes] = await Promise.all([
                    fetch(`${apiBase}/gis/map-data`),
                    fetch(`${apiBase}/gis/route-lines`),
                ]);
                const stationsData = await stationsRes.json();
                const routesData = await routesRes.json();
                setStations(stationsData);
                setRouteLines(routesData);
            } catch (error) {
                console.error('Error fetching GIS data:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, []);

    const createIcon = (color: string, isPulsing = false) => {
        const pulseAnim = isPulsing ? 'animation: pulse 2s infinite;' : '';
        return new L.DivIcon({
            html: `
                <style>
                    @keyframes pulse {
                        0% { box-shadow: 0 0 0 0 rgba(168, 85, 247, 0.7); }
                        70% { box-shadow: 0 0 0 10px rgba(168, 85, 247, 0); }
                        100% { box-shadow: 0 0 0 0 rgba(168, 85, 247, 0); }
                    }
                </style>
                <div style="background-color: ${color}; width: 18px; height: 18px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 4px rgba(0,0,0,0.5); ${pulseAnim}"></div>
            `,
            className: '',
            iconSize: [22, 22],
            iconAnchor: [11, 11],
        });
    };

    const okIcon = createIcon('#22c55e');
    const congestedIcon = createIcon('#ef4444');
    const idleIcon = createIcon('#a855f7', true);

    const routeLegend = useMemo(
        () => [
            { label: '1-2', color: '#94a3b8', widthClass: 'w-3 h-0.5' },
            { label: '2-5', color: '#3b82f6', widthClass: 'w-3 h-0.5' },
            { label: '5-10', color: '#f97316', widthClass: 'w-4 h-1' },
            { label: '10+ плеч', color: '#d946ef', widthClass: 'w-4 h-1' },
        ],
        [],
    );

    const getLineColor = (trainCount: number) => {
        if (trainCount >= 10) return '#d946ef';
        if (trainCount >= 5) return '#f97316';
        if (trainCount >= 2) return '#3b82f6';
        return '#94a3b8';
    };

    const getLineWeight = (trainCount: number) => {
        if (trainCount >= 10) return 4;
        if (trainCount >= 5) return 3;
        if (trainCount >= 2) return 2.5;
        return 1.5;
    };

    if (loading) {
        return <div className="flex h-full items-center justify-center p-8 text-gray-400">Loading Map...</div>;
    }

    return (
        <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-1">
            <div className="flex items-center gap-4 border-b border-gray-100 bg-white/80 px-4 py-2">
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                        type="checkbox"
                        checked={showRailNetwork}
                        onChange={(e) => setShowRailNetwork(e.target.checked)}
                        className="rounded border-gray-300 text-sky-600 focus:ring-sky-500"
                    />
                    <span className="font-medium text-gray-700">Показать железнодорожную сеть</span>
                </label>

                <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                        type="checkbox"
                        checked={showLogicalRoutes}
                        onChange={(e) => setShowLogicalRoutes(e.target.checked)}
                        className="rounded border-gray-300 text-sky-600 focus:ring-sky-500"
                    />
                    <span className="font-medium text-gray-700">Показать логические плечи</span>
                </label>

                <div className="ml-auto flex items-center gap-3 text-[11px] text-gray-500">
                    {showRailNetwork && (
                        <span className="flex items-center gap-1">
                            <div className="h-0.5 w-3 rounded bg-slate-600" />
                            реальная ж/д сеть
                        </span>
                    )}
                    {showLogicalRoutes &&
                        routeLegend.map((item) => (
                            <span key={item.label} className="flex items-center gap-1">
                                <div className={`${item.widthClass} rounded`} style={{ backgroundColor: item.color }} />
                                {item.label}
                            </span>
                        ))}
                </div>
            </div>

            <MapContainer
                center={[48.0196, 66.9237]}
                zoom={5}
                minZoom={5}
                maxZoom={11}
                maxBounds={KAZAKHSTAN_BOUNDS}
                maxBoundsViscosity={1}
                style={{ height: '100%', width: '100%', borderRadius: '0 0 1rem 1rem' }}
                className="z-0"
            >
                <FitMapToStations stations={stations} />

                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
                    url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                />

                {showRailNetwork && (
                    <TileLayer
                        attribution='&copy; <a href="https://www.openrailwaymap.org/">OpenRailwayMap</a>'
                        url="https://{s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png"
                        opacity={0.85}
                    />
                )}

                {showLogicalRoutes &&
                    routeLines.map((seg, idx) => (
                        <Polyline
                            key={`route-${idx}`}
                            positions={[
                                [seg.from.lat, seg.from.lng],
                                [seg.to.lat, seg.to.lng],
                            ]}
                            pathOptions={{
                                color: getLineColor(seg.trainCount),
                                weight: getLineWeight(seg.trainCount),
                                opacity: 0.72,
                                dashArray: seg.trainCount < 2 ? '6 4' : undefined,
                            }}
                        >
                            <Tooltip permanent={false} direction="center" className="route-tooltip">
                                <div className="text-xs font-semibold">
                                    {seg.from.name} → {seg.to.name}
                                    {seg.distanceKm && <span className="ml-1 text-sky-600">({seg.distanceKm} км)</span>}
                                    <br />
                                    <span className="font-normal text-gray-500">Логическое плечо: {seg.trainCount} поездов</span>
                                </div>
                            </Tooltip>
                        </Polyline>
                    ))}

                {stations.map((station) => {
                    const hasHighIdle = (station.idleLocomotivesCount || 0) > 0 && (station.sumDwellTimeMinutes || 0) > 120;

                    return (
                        <Marker
                            key={station.id}
                            position={[station.latitude, station.longitude]}
                            icon={station.isCongested ? congestedIcon : hasHighIdle ? idleIcon : okIcon}
                        >
                            <Popup className="overflow-hidden rounded-xl border-0 shadow-lg">
                                <div className="min-w-[240px] p-2">
                                    <h3 className="mb-1 text-lg font-bold">{station.name}</h3>
                                    <p className="mb-3 ml-0 text-sm text-gray-500">{station.code || 'No Code'}</p>

                                    {showLogicalRoutes && (
                                        <div className="mb-3 rounded-lg border border-sky-100 bg-sky-50 p-2 text-[11px] leading-tight text-sky-700">
                                            Цветные линии показывают логические плечи и поток поездов. Точная геометрия пути отображается отдельным слоем железнодорожной сети.
                                        </div>
                                    )}

                                    {hasHighIdle && (
                                        <div className="mb-3 flex flex-col gap-1 rounded-lg border border-purple-100 bg-purple-50 p-2">
                                            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-purple-700">
                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                                                Простой локомотивов
                                            </div>
                                            <div className="flex items-end justify-between">
                                                <span className="text-xs text-purple-600/80">Потеряно времени:</span>
                                                <span className="text-sm font-bold text-purple-700">
                                                    {Math.floor((station.sumDwellTimeMinutes || 0) / 60)}ч {Math.floor((station.sumDwellTimeMinutes || 0) % 60)}м
                                                </span>
                                            </div>
                                            <div className="flex items-end justify-between">
                                                <span className="text-[10px] text-purple-600/70">Локомотивов:</span>
                                                <span className="text-xs font-semibold text-purple-700">{station.idleLocomotivesCount} шт.</span>
                                            </div>
                                        </div>
                                    )}

                                    <div className="mb-2 flex items-center justify-between rounded-lg bg-gray-50 p-2">
                                        <span className="text-sm font-medium">Available Locos</span>
                                        <span className={`text-sm font-bold ${station.isCongested ? 'text-red-600' : 'text-green-600'}`}>
                                            {station.availableLocomotives}
                                        </span>
                                    </div>

                                    <div className="mb-2 flex items-center justify-between rounded-lg bg-gray-50 p-2">
                                        <span className="text-sm font-medium">Assigned Locos</span>
                                        <span className="text-sm font-bold text-blue-600">{station.assignedLocomotives}</span>
                                    </div>

                                    <div className="mb-2 grid grid-cols-2 gap-2">
                                        <div className="flex flex-col items-center rounded-lg bg-gray-50 p-2">
                                            <span className="text-xs font-medium text-gray-500">In Transit</span>
                                            <span className="text-sm font-bold text-purple-600">{station.inTransitLocomotives || 0}</span>
                                        </div>
                                        <div className="flex flex-col items-center rounded-lg bg-gray-50 p-2">
                                            <span className="text-xs font-medium text-gray-500">Maintenance</span>
                                            <span className="text-sm font-bold text-orange-600">{station.maintenanceLocomotives || 0}</span>
                                        </div>
                                    </div>

                                    {station.isCongested && (
                                        <div className="mb-2 mt-3 rounded-md border border-red-100 bg-red-50 p-2 text-[11px] leading-tight text-red-600">
                                            Warning: High congestion detected at this node. Optimization recommended.
                                        </div>
                                    )}

                                    <button
                                        onClick={() => {
                                            const btn = document.getElementById(`opt-btn-${station.id}`);
                                            if (btn) {
                                                btn.innerText = 'Optimizing...';
                                                btn.setAttribute('disabled', 'true');
                                            }
                                            fetch(
                                                `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/optimizer/station/${station.id}/solve-lap`,
                                                { method: 'POST' },
                                            )
                                                .then((res) => res.json())
                                                .then((data) => {
                                                    alert(data.message || 'Optimization complete');
                                                    window.location.reload();
                                                })
                                                .catch(() => alert('Failed to run optimization'));
                                        }}
                                        id={`opt-btn-${station.id}`}
                                        className={`mt-2 flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-white transition-colors ${
                                            hasHighIdle
                                                ? 'bg-purple-600 shadow-sm shadow-purple-200 hover:bg-purple-700'
                                                : 'bg-sky-600 hover:bg-sky-700'
                                        }`}
                                    >
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
                                        {hasHighIdle ? 'Устранить простой (LAP)' : 'Run LAP Optimizer'}
                                    </button>
                                </div>
                            </Popup>
                        </Marker>
                    );
                })}
            </MapContainer>
        </div>
    );
};

export default RailwayGISDashboard;
