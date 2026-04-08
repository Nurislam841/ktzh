'use client';

import { useEffect } from 'react';
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { MapLayerMode, PassengerRouteMapModel, RouteSegment, RouteStopPoint } from './PassengerRouteMap';

function FitRouteBounds({ model }: { model: PassengerRouteMapModel }) {
    const map = useMap();

    useEffect(() => {
        map.invalidateSize(false);
        const bounds = model.stops.map((point) => [point.latitude, point.longitude] as [number, number]);
        if (bounds.length === 1) {
            map.setView(bounds[0], 8, { animate: false });
            return;
        }
        map.fitBounds(bounds, {
            animate: false,
            padding: [40, 40],
        });
    }, [map, model]);

    return null;
}

function stopColor(point: RouteStopPoint, model: PassengerRouteMapModel, selectedStopId: string | null) {
    if (point.id === selectedStopId) return '#0ea5e9';
    if (point.id === model.currentStopId) return '#10b981';
    if (point.stop.event_type === 'origin_departure') return '#0f172a';
    if (point.stop.event_type === 'terminal_arrival') return '#ef4444';
    if ((point.stop.dwellMinutes ?? 0) >= 20) return '#f59e0b';
    return '#64748b';
}

function shouldShowPermanentLabel(point: RouteStopPoint, model: PassengerRouteMapModel, selectedStopId: string | null) {
    return (
        point.id === selectedStopId ||
        point.id === model.currentStopId ||
        point.seq === 1 ||
        point.seq === model.stops.length ||
        point.isKeyStop
    );
}

function segmentStyle(segment: RouteSegment, mapMode: MapLayerMode, selectedSegmentId: string | null) {
    const isSelected = segment.id === selectedSegmentId;

    if (mapMode === 'stations-only') {
        return {
            color: '#94a3b8',
            weight: 0,
            opacity: 0,
            dashArray: undefined as string | undefined,
        };
    }

    if (mapMode === 'traction') {
        return {
            color:
                segment.traction === 'electric'
                    ? '#0ea5e9'
                    : segment.traction === 'diesel'
                        ? '#f97316'
                        : segment.traction === 'dual'
                            ? '#8b5cf6'
                            : '#64748b',
            weight: isSelected ? 7 : segment.completed ? 5.5 : 4.2,
            opacity: segment.future ? 0.45 : 0.92,
            dashArray: segment.future ? '8 8' : undefined,
        };
    }

    if (mapMode === 'assignment') {
        return {
            color: segment.assignmentActive ? '#22c55e' : '#94a3b8',
            weight: isSelected ? 7 : segment.assignmentActive ? 5.8 : 3.2,
            opacity: segment.assignmentActive ? 0.96 : 0.28,
            dashArray: segment.assignmentActive ? undefined : '4 10',
        };
    }

    if (mapMode === 'current-position') {
        return {
            color: segment.completed ? '#14b8a6' : '#cbd5e1',
            weight: isSelected ? 7 : segment.completed ? 5.5 : 4,
            opacity: segment.future ? 0.55 : 0.94,
            dashArray: segment.future ? '10 8' : undefined,
        };
    }

    return {
        color: segment.completed ? '#0f766e' : '#1d4ed8',
        weight: isSelected ? 7 : segment.completed ? 5.4 : 4.4,
        opacity: segment.future ? 0.58 : 0.9,
        dashArray: segment.future ? '8 8' : undefined,
    };
}

export default function PassengerRouteMapLeaflet({
    model,
    assignment,
    scenarioLabel,
    mapMode,
    selectedStopId,
    selectedSegmentId,
    onSelectStop,
    onSelectSegment,
}: {
    model: PassengerRouteMapModel;
    assignment: any;
    scenarioLabel: string;
    mapMode: MapLayerMode;
    selectedStopId: string | null;
    selectedSegmentId: string | null;
    onSelectStop: (stopId: string) => void;
    onSelectSegment: (segmentId: string) => void;
}) {
    return (
        <div className="overflow-hidden rounded-[1.6rem] border border-slate-200 bg-white">
            <div className="relative h-[560px] w-full">
                <MapContainer
                    center={[51.15, 71.45]}
                    zoom={6}
                    minZoom={4}
                    maxZoom={13}
                    style={{ height: '100%', width: '100%' }}
                    className="z-0"
                >
                    <FitRouteBounds model={model} />

                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
                        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                    />

                    <TileLayer
                        attribution='&copy; <a href="https://www.openrailwaymap.org/">OpenRailwayMap</a>'
                        url="https://{s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png"
                        opacity={0.82}
                    />

                    {mapMode !== 'stations-only'
                        ? model.segments.map((segment) => {
                            const style = segmentStyle(segment, mapMode, selectedSegmentId);

                            return (
                                <Polyline
                                    key={segment.id}
                                    positions={segment.geometry}
                                    pathOptions={{
                                        color: style.color,
                                        weight: style.weight,
                                        opacity: style.opacity,
                                        dashArray: style.dashArray,
                                        lineCap: 'round',
                                        lineJoin: 'round',
                                    }}
                                    eventHandlers={{
                                        click: () => onSelectSegment(segment.id),
                                    }}
                                >
                                    <Tooltip sticky direction="top">
                                        <div className="text-xs">
                                            <div className="font-semibold">{`${segment.from.stop.station_name} → ${segment.to.stop.station_name}`}</div>
                                            <div className="text-slate-500">{`Traction: ${segment.traction}`}</div>
                                        </div>
                                    </Tooltip>
                                    <Popup maxWidth={320}>
                                        <div className="space-y-1 text-sm">
                                            <div className="font-semibold text-slate-900">{`${segment.from.stop.station_name} → ${segment.to.stop.station_name}`}</div>
                                            <div className="text-slate-600">{`Сегмент №${segment.seq}`}</div>
                                            <div className="text-slate-600">{`Тяга: ${segment.traction}`}</div>
                                            <div className="text-slate-600">{`Электрификация: ${segment.electrified ? 'Да' : 'Нет'}`}</div>
                                            <div className="text-slate-600">{`Геометрия: ${segment.geometry.length} точек • ${segment.geometrySource}`}</div>
                                            <div className="text-slate-600">{`Подвязка: ${segment.assignmentActive ? 'активна' : 'вне плеча локомотива'}`}</div>
                                        </div>
                                    </Popup>
                                </Polyline>
                            );
                        })
                        : null}

                    {model.stops.map((point) => (
                        <CircleMarker
                            key={point.id}
                            center={[point.latitude, point.longitude]}
                            radius={point.id === selectedStopId ? 7.5 : point.isKeyStop ? 5.5 : 4}
                            pathOptions={{
                                color: '#ffffff',
                                weight: point.id === selectedStopId ? 2.4 : 1.4,
                                fillColor: stopColor(point, model, selectedStopId),
                                fillOpacity: 0.96,
                            }}
                            eventHandlers={{
                                click: () => onSelectStop(point.id),
                            }}
                        >
                            <Tooltip permanent={shouldShowPermanentLabel(point, model, selectedStopId)} direction="top">
                                <div className="text-xs">
                                    <div className="font-semibold">{point.stop.station_name}</div>
                                    <div className="text-slate-500">{point.stop.station_code ?? 'Без кода'}</div>
                                </div>
                            </Tooltip>
                            <Popup maxWidth={340}>
                                <div className="space-y-1 text-sm">
                                    <div className="font-semibold text-slate-900">{point.stop.station_name}</div>
                                    <div className="text-slate-500">{point.stop.station_code ?? 'Без кода станции'}</div>
                                    <div className="text-slate-600">{`Прибытие: ${point.stop.arrivalLabel ?? '—'}`}</div>
                                    <div className="text-slate-600">{`Отправление: ${point.stop.departureLabel ?? '—'}`}</div>
                                    <div className="text-slate-600">{`Стоянка: ${point.stop.dwellMinutes ?? 0} мин`}</div>
                                    <div className="text-slate-600">{`Операция: ${(point.stop.service_operations ?? []).join(', ') || point.stop.event_type}`}</div>
                                    <div className="text-slate-600">{`Поезд: ${point.stop.train_no}`}</div>
                                    <div className="text-slate-600">{`Локомотив: ${assignment?.locomotiveLabel ?? 'Нет подвязки'}`}</div>
                                    <div className="text-slate-600">{`Сценарий: ${scenarioLabel}`}</div>
                                </div>
                            </Popup>
                        </CircleMarker>
                    ))}

                    {mapMode !== 'stations-only'
                        ? model.tractionChanges.map((change) => (
                            <CircleMarker
                                key={change.segmentId}
                                center={[change.latitude, change.longitude]}
                                radius={7}
                                pathOptions={{
                                    color: '#ffffff',
                                    weight: 2,
                                    fillColor: '#8b5cf6',
                                    fillOpacity: 0.95,
                                }}
                                eventHandlers={{
                                    click: () => onSelectSegment(change.segmentId),
                                }}
                            >
                                <Tooltip direction="top">
                                    <div className="text-xs font-semibold">{`Смена тяги: ${change.stationName}`}</div>
                                </Tooltip>
                            </CircleMarker>
                        ))
                        : null}

                    <CircleMarker
                        center={[model.currentPoint.latitude, model.currentPoint.longitude]}
                        radius={10}
                        pathOptions={{
                            color: '#ffffff',
                            weight: 3,
                            fillColor: '#ef4444',
                            fillOpacity: 1,
                        }}
                    >
                        <Tooltip direction="top" permanent>
                            <div className="text-xs font-semibold">{model.currentPoint.label}</div>
                        </Tooltip>
                        <Popup>
                            <div className="space-y-1 text-sm">
                                <div className="font-semibold text-slate-900">Текущая позиция поезда</div>
                                <div className="text-slate-600">{model.currentPoint.label}</div>
                                <div className="text-slate-500">{model.currentPoint.minuteLabel}</div>
                            </div>
                        </Popup>
                    </CircleMarker>

                    {mapMode === 'assignment' || assignment?.locomotiveLabel ? (
                        <CircleMarker
                            center={[model.currentPoint.latitude, model.currentPoint.longitude]}
                            radius={14}
                            pathOptions={{
                                color: '#f59e0b',
                                weight: 3,
                                fillColor: 'transparent',
                                fillOpacity: 0,
                            }}
                        >
                            <Tooltip direction="right">
                                <div className="text-xs font-semibold">{assignment?.locomotiveLabel ?? 'Нет подвязки'}</div>
                            </Tooltip>
                        </CircleMarker>
                    ) : null}
                </MapContainer>
            </div>
        </div>
    );
}
