'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { Clock3, Link2, LocateFixed, MapPinned, Milestone, PlugZap, Route, Train } from 'lucide-react';
import { getGisAtlas } from '../../lib/api';

const SERVICE_DAY_MINUTES = 24 * 60;
const SERVICE_DAY_START_MINUTES = 20 * 60;

type TractionType = 'electric' | 'diesel' | 'dual' | 'unknown';
type CoordinateSource = 'atlas' | 'catalog' | 'interpolated' | 'fallback';

export type MapLayerMode =
    | 'full-route'
    | 'current-position'
    | 'stations-only'
    | 'traction'
    | 'assignment';

type GeoPoint = {
    latitude: number;
    longitude: number;
};

type AtlasStationPoint = {
    name: string;
    latitude: number;
    longitude: number;
    kind?: 'station' | 'node';
    coordinateSource?: 'catalog' | 'interpolated';
};

type AtlasShoulderLine = {
    id: string;
    label: string;
    stations: string[];
    coordinates: Array<[number, number]>;
};

export type RouteStopPoint = {
    id: string;
    seq: number;
    stop: any;
    latitude: number;
    longitude: number;
    minute: number | null;
    coordinateSource: CoordinateSource;
    isKeyStop: boolean;
    isCompleted: boolean;
};

export type RouteSegment = {
    id: string;
    seq: number;
    from: RouteStopPoint;
    to: RouteStopPoint;
    geometry: Array<[number, number]>;
    geometrySource: 'shoulder' | 'network' | 'smoothed';
    traction: TractionType;
    electrified: boolean;
    completed: boolean;
    future: boolean;
    assignmentActive: boolean;
    tractionChange: boolean;
};

export type PassengerRouteMapModel = {
    stops: RouteStopPoint[];
    segments: RouteSegment[];
    currentPoint: {
        latitude: number;
        longitude: number;
        label: string;
        minuteLabel: string;
        status: 'before_departure' | 'en_route' | 'arrived';
    };
    currentOperationalMinute: number;
    currentOperationalLabel: string;
    currentStopId: string | null;
    currentSegmentId: string | null;
    assignmentTraction: TractionType;
    tractionChanges: Array<{
        stationName: string;
        segmentId: string;
        tractionBefore: TractionType;
        tractionAfter: TractionType;
        latitude: number;
        longitude: number;
    }>;
    stationCount: number;
    durationMinutes: number;
    completedStops: number;
    remainingStops: number;
    interpolatedStopsCount: number;
    shoulderGeometrySegments: number;
};

const MAP_MODES: Array<{ id: MapLayerMode; label: string }> = [
    { id: 'full-route', label: 'Full route' },
    { id: 'current-position', label: 'Current position' },
    { id: 'stations-only', label: 'Stations only' },
    { id: 'traction', label: 'Traction / electrification' },
    { id: 'assignment', label: 'Locomotive assignment' },
];

const DynamicPassengerRouteMapLeaflet = dynamic(
    () => import('./PassengerRouteMapLeaflet'),
    {
        ssr: false,
        loading: () => (
            <div className="flex h-[560px] w-full items-center justify-center rounded-[1.75rem] border border-slate-200 bg-white">
                <div className="flex items-center gap-3 text-slate-500">
                    <Route size={18} className="animate-pulse" />
                    Loading railway route map...
                </div>
            </div>
        ),
    },
);

const STATION_COORDS: Array<{ aliases: string[]; point: GeoPoint }> = [
    { aliases: ['астана', 'астана-1', 'астана 1', 'нурлы жол', 'нур султан', 'нур-султан', 'нур султан нж'], point: { latitude: 51.1694, longitude: 71.4491 } },
    { aliases: ['сороковая'], point: { latitude: 51.1785, longitude: 71.5215 } },
    { aliases: ['аршалы'], point: { latitude: 50.8456, longitude: 72.1825 } },
    { aliases: ['караганда', 'караганды', 'караганда-сорт'], point: { latitude: 49.8019, longitude: 73.1097 } },
    { aliases: ['мойынты', 'моинты'], point: { latitude: 47.2167, longitude: 73.3667 } },
    { aliases: ['балхаш'], point: { latitude: 46.8481, longitude: 74.995 } },
    { aliases: ['шу', 'чу'], point: { latitude: 43.5983, longitude: 73.7616 } },
    { aliases: ['тараз'], point: { latitude: 42.9, longitude: 71.3667 } },
    { aliases: ['шымкент'], point: { latitude: 42.3417, longitude: 69.5901 } },
    { aliases: ['туркестан'], point: { latitude: 43.2973, longitude: 68.2518 } },
    { aliases: ['сарыагаш'], point: { latitude: 41.4554, longitude: 69.1672 } },
    { aliases: ['кызылорда'], point: { latitude: 44.8486, longitude: 65.4997 } },
    { aliases: ['жезказган'], point: { latitude: 47.7833, longitude: 67.7167 } },
    { aliases: ['костанай', 'кустанай'], point: { latitude: 53.2144, longitude: 63.6246 } },
    { aliases: ['петропавловск'], point: { latitude: 54.8667, longitude: 69.15 } },
    { aliases: ['кокшетау'], point: { latitude: 53.2833, longitude: 69.3833 } },
    { aliases: ['есиль'], point: { latitude: 51.9557, longitude: 66.4086 } },
    { aliases: ['павлодар'], point: { latitude: 52.3156, longitude: 76.9675 } },
    { aliases: ['екибастуз'], point: { latitude: 51.7297, longitude: 75.3229 } },
    { aliases: ['семей'], point: { latitude: 50.4111, longitude: 80.2275 } },
    { aliases: ['оскемен', 'усть-каменогорск'], point: { latitude: 49.9483, longitude: 82.6289 } },
    { aliases: ['аягоз'], point: { latitude: 47.9647, longitude: 80.4392 } },
    { aliases: ['алматы', 'алматы-1', 'алматы 1', 'алматы-2', 'алматы 2'], point: { latitude: 43.2389, longitude: 76.8897 } },
    { aliases: ['актобе'], point: { latitude: 50.3004, longitude: 57.1546 } },
    { aliases: ['атырау'], point: { latitude: 47.1, longitude: 51.9167 } },
    { aliases: ['мангистау', 'мангышлак', 'актау'], point: { latitude: 43.689, longitude: 51.1578 } },
    { aliases: ['орал', 'уральск'], point: { latitude: 51.2, longitude: 51.3667 } },
    { aliases: ['пресногорьковская'], point: { latitude: 54.85, longitude: 64.08 } },
];

const ELECTRIC_HINTS = ['астана', 'нурлы жол', 'караганда', 'мойынты', 'шу', 'чу', 'тараз', 'шымкент', 'туркестан', 'сарыагаш', 'алматы', 'павлодар', 'екибастуз', 'семей', 'оскемен', 'кокшетау', 'костанай', 'петропавловск', 'аягоз'];
const DIESEL_HINTS = ['атырау', 'актобе', 'мангистау', 'орал', 'уральск', 'жезказган', 'кызылорда', 'пресногорьковская'];

function normalizeStationName(value: string | null | undefined) {
    return String(value ?? '')
        .toLowerCase()
        .replaceAll('ё', 'е')
        .replace(/[^a-zа-я0-9 -]/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function stationsMatch(left: string | null | undefined, right: string | null | undefined) {
    const a = normalizeStationName(left);
    const b = normalizeStationName(right);
    if (!a || !b) return false;
    return a === b || a.includes(b) || b.includes(a);
}

function formatMinutes(value?: number | null) {
    if (typeof value !== 'number' || Number.isNaN(value)) return '—';
    const hours = Math.floor(value / 60);
    const minutes = value % 60;
    return hours ? `${hours} ч ${String(minutes).padStart(2, '0')} мин` : `${minutes} мин`;
}

function operationalLabel(minute: number) {
    const offset = ((minute % SERVICE_DAY_MINUTES) + SERVICE_DAY_MINUTES) % SERVICE_DAY_MINUTES;
    const absolute = (SERVICE_DAY_START_MINUTES + offset) % SERVICE_DAY_MINUTES;
    return `${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`;
}

function operationalDayLabel(minute: number | null | undefined) {
    if (typeof minute !== 'number' || Number.isNaN(minute)) return '—';
    const dayOffset = Math.floor(minute / SERVICE_DAY_MINUTES);
    return `D+${dayOffset} ${operationalLabel(minute)}`;
}

function toOperationalNowMinute(date = new Date()) {
    const absolute = date.getHours() * 60 + date.getMinutes();
    return absolute >= SERVICE_DAY_START_MINUTES
        ? absolute - SERVICE_DAY_START_MINUTES
        : absolute + (SERVICE_DAY_MINUTES - SERVICE_DAY_START_MINUTES);
}

function inferTractionType(series?: string | null): TractionType {
    const normalized = normalizeStationName(series);
    if (!normalized) return 'unknown';
    if (normalized.includes('эп') || normalized.includes('вл') || normalized.includes('кz4') || normalized.includes('kz4') || normalized.includes('kz8')) return 'electric';
    if (normalized.includes('тэп') || normalized.includes('тэ') || normalized.includes('2тэ')) return 'diesel';
    return 'unknown';
}

function tractionLabel(traction: TractionType) {
    if (traction === 'electric') return 'Электрифицированный сегмент';
    if (traction === 'diesel') return 'Неэлектрифицированный сегмент';
    if (traction === 'dual') return 'Двойная тяга';
    return 'Профиль тяги не определен';
}

function coordinateSourceLabel(source: CoordinateSource) {
    if (source === 'atlas') return 'GIS atlas';
    if (source === 'catalog') return 'Station catalog';
    if (source === 'interpolated') return 'Interpolated from route';
    return 'Fallback estimate';
}

function geometrySourceLabel(source: RouteSegment['geometrySource']) {
    if (source === 'shoulder') return 'Atlas shoulder geometry';
    if (source === 'network') return 'Railway network path';
    return 'Smoothed route fallback';
}

function resolveKnownCoordinate(stationName: string, atlasStations: AtlasStationPoint[] = []) {
    const normalized = normalizeStationName(stationName);
    if (!normalized) return null;

    const atlasEntry = atlasStations.find((item) => stationsMatch(item.name, stationName));
    if (atlasEntry) {
        return {
            point: {
                latitude: atlasEntry.latitude,
                longitude: atlasEntry.longitude,
            },
            source: atlasEntry.coordinateSource === 'catalog' ? 'atlas' : 'interpolated' as CoordinateSource,
        };
    }

    const catalogEntry = STATION_COORDS.find((item) => item.aliases.some((alias) => normalized.includes(alias)));
    if (catalogEntry) {
        return {
            point: catalogEntry.point,
            source: 'catalog' as CoordinateSource,
        };
    }

    return null;
}

function interpolateStops(stops: any[], atlasStations: AtlasStationPoint[] = []) {
    const seeded = stops.map((stop) => {
        const resolved = resolveKnownCoordinate(stop.station_name, atlasStations);
        return {
            stop,
            geo: resolved?.point ?? null,
            coordinateSource: resolved?.source ?? null,
        };
    });

    const knownIndexes = seeded
        .map((item, index) => (item.geo ? index : -1))
        .filter((index) => index >= 0);

    if (!knownIndexes.length) {
        return seeded.map((item, index) => {
            const ratio = stops.length <= 1 ? 0 : index / Math.max(stops.length - 1, 1);
            return {
                stop: item.stop,
                geo: {
                    latitude: 51 - ratio * 8,
                    longitude: 71 + ratio * 7,
                },
                coordinateSource: 'fallback' as CoordinateSource,
            };
        });
    }

    const firstKnownIndex = knownIndexes[0];
    const lastKnownIndex = knownIndexes[knownIndexes.length - 1];

    for (let index = 0; index < firstKnownIndex; index += 1) {
        const anchor = seeded[firstKnownIndex].geo!;
        const next = seeded[knownIndexes[1] ?? firstKnownIndex].geo ?? anchor;
        const fraction = (firstKnownIndex - index) / Math.max(firstKnownIndex + 1, 1);
        seeded[index].geo = {
            latitude: anchor.latitude + (anchor.latitude - next.latitude) * 0.18 * fraction,
            longitude: anchor.longitude + (anchor.longitude - next.longitude) * 0.18 * fraction,
        };
        seeded[index].coordinateSource = 'interpolated';
    }

    for (let position = 0; position < knownIndexes.length - 1; position += 1) {
        const leftIndex = knownIndexes[position];
        const rightIndex = knownIndexes[position + 1];
        const leftPoint = seeded[leftIndex].geo!;
        const rightPoint = seeded[rightIndex].geo!;
        const span = Math.max(rightIndex - leftIndex, 1);

        for (let index = leftIndex + 1; index < rightIndex; index += 1) {
            if (seeded[index].geo) continue;
            const fraction = (index - leftIndex) / span;
            seeded[index].geo = {
                latitude: leftPoint.latitude + (rightPoint.latitude - leftPoint.latitude) * fraction,
                longitude: leftPoint.longitude + (rightPoint.longitude - leftPoint.longitude) * fraction,
            };
            seeded[index].coordinateSource = 'interpolated';
        }
    }

    for (let index = lastKnownIndex + 1; index < seeded.length; index += 1) {
        const anchor = seeded[lastKnownIndex].geo!;
        const previous = seeded[knownIndexes[knownIndexes.length - 2] ?? lastKnownIndex].geo ?? anchor;
        const fraction = (index - lastKnownIndex) / Math.max(seeded.length - lastKnownIndex, 1);
        seeded[index].geo = {
            latitude: anchor.latitude + (anchor.latitude - previous.latitude) * 0.18 * fraction,
            longitude: anchor.longitude + (anchor.longitude - previous.longitude) * 0.18 * fraction,
        };
        seeded[index].coordinateSource = 'interpolated';
    }

    return seeded.map((item) => ({
        stop: item.stop,
        geo: item.geo!,
        coordinateSource: item.coordinateSource ?? 'fallback',
    }));
}

type ShoulderEdge = {
    from: string;
    to: string;
    geometry: Array<[number, number]>;
    distance: number;
};

function pointDistance(left: [number, number], right: [number, number]) {
    const dLat = left[0] - right[0];
    const dLon = left[1] - right[1];
    return Math.sqrt(dLat * dLat + dLon * dLon);
}

function geometryDistance(points: Array<[number, number]>) {
    let total = 0;
    for (let index = 1; index < points.length; index += 1) {
        total += pointDistance(points[index - 1], points[index]);
    }
    return total;
}

function buildShoulderNetwork(atlasShoulders: AtlasShoulderLine[]) {
    const adjacency = new Map<string, ShoulderEdge[]>();

    for (const shoulder of atlasShoulders) {
        if (!shoulder.stations?.length || shoulder.coordinates?.length !== shoulder.stations.length) continue;
        for (let index = 1; index < shoulder.stations.length; index += 1) {
            const fromName = normalizeStationName(shoulder.stations[index - 1]);
            const toName = normalizeStationName(shoulder.stations[index]);
            if (!fromName || !toName) continue;
            const forwardGeometry = [
                shoulder.coordinates[index - 1] as [number, number],
                shoulder.coordinates[index] as [number, number],
            ];
            const reverseGeometry = [...forwardGeometry].reverse() as Array<[number, number]>;
            const distance = geometryDistance(forwardGeometry);
            const forwardEdge: ShoulderEdge = { from: fromName, to: toName, geometry: forwardGeometry, distance };
            const reverseEdge: ShoulderEdge = { from: toName, to: fromName, geometry: reverseGeometry, distance };
            adjacency.set(fromName, [...(adjacency.get(fromName) ?? []), forwardEdge]);
            adjacency.set(toName, [...(adjacency.get(toName) ?? []), reverseEdge]);
        }
    }

    return adjacency;
}

function stitchEdgeGeometry(edges: ShoulderEdge[]) {
    const stitched: Array<[number, number]> = [];
    edges.forEach((edge, index) => {
        edge.geometry.forEach((point, pointIndex) => {
            if (index > 0 && pointIndex === 0) return;
            stitched.push(point);
        });
    });
    return stitched;
}

function findNetworkGeometry(
    fromStation: string,
    toStation: string,
    atlasShoulders: AtlasShoulderLine[],
) {
    const network = buildShoulderNetwork(atlasShoulders);
    const start = normalizeStationName(fromStation);
    const target = normalizeStationName(toStation);
    if (!start || !target || !network.has(start) || !network.has(target)) return null;

    const queue: Array<{ station: string; cost: number; edges: ShoulderEdge[] }> = [{ station: start, cost: 0, edges: [] }];
    const visited = new Map<string, number>();

    while (queue.length) {
        queue.sort((left, right) => left.cost - right.cost);
        const current = queue.shift()!;
        if ((visited.get(current.station) ?? Number.POSITIVE_INFINITY) <= current.cost) continue;
        visited.set(current.station, current.cost);

        if (current.station === target) {
            return {
                geometry: stitchEdgeGeometry(current.edges),
                source: 'network' as const,
            };
        }

        for (const edge of network.get(current.station) ?? []) {
            const nextCost = current.cost + edge.distance;
            if ((visited.get(edge.to) ?? Number.POSITIVE_INFINITY) <= nextCost) continue;
            queue.push({
                station: edge.to,
                cost: nextCost,
                edges: [...current.edges, edge],
            });
        }
    }

    return null;
}

function smoothDirectGeometry(
    fromPoint: GeoPoint,
    toPoint: GeoPoint,
    previousPoint?: GeoPoint | null,
    nextPoint?: GeoPoint | null,
) {
    const start: [number, number] = [fromPoint.latitude, fromPoint.longitude];
    const end: [number, number] = [toPoint.latitude, toPoint.longitude];
    const prev: [number, number] = previousPoint ? [previousPoint.latitude, previousPoint.longitude] : start;
    const next: [number, number] = nextPoint ? [nextPoint.latitude, nextPoint.longitude] : end;
    const control1: [number, number] = [
        start[0] + (end[0] - prev[0]) * 0.18,
        start[1] + (end[1] - prev[1]) * 0.18,
    ];
    const control2: [number, number] = [
        end[0] - (next[0] - start[0]) * 0.18,
        end[1] - (next[1] - start[1]) * 0.18,
    ];

    const points: Array<[number, number]> = [];
    for (let step = 0; step <= 10; step += 1) {
        const t = step / 10;
        const mt = 1 - t;
        const latitude =
            mt * mt * mt * start[0] +
            3 * mt * mt * t * control1[0] +
            3 * mt * t * t * control2[0] +
            t * t * t * end[0];
        const longitude =
            mt * mt * mt * start[1] +
            3 * mt * mt * t * control1[1] +
            3 * mt * t * t * control2[1] +
            t * t * t * end[1];
        points.push([latitude, longitude]);
    }
    return points;
}

function resolveSegmentGeometry(
    fromStation: string,
    toStation: string,
    fromPoint: GeoPoint,
    toPoint: GeoPoint,
    atlasShoulders: AtlasShoulderLine[],
    previousPoint?: GeoPoint | null,
    nextPoint?: GeoPoint | null,
) {
    for (const shoulder of atlasShoulders) {
        if (!shoulder.stations?.length || shoulder.coordinates?.length !== shoulder.stations.length) continue;
        const stationNames = shoulder.stations.map((item) => normalizeStationName(item));
        const fromMatches = stationNames
            .map((item, index) => (stationsMatch(item, fromStation) ? index : -1))
            .filter((index) => index >= 0);

        for (const fromIndex of fromMatches) {
            for (let toIndex = fromIndex + 1; toIndex < stationNames.length; toIndex += 1) {
                if (!stationsMatch(stationNames[toIndex], toStation)) continue;
                return {
                    geometry: shoulder.coordinates.slice(fromIndex, toIndex + 1).map(([lat, lon]) => [lat, lon] as [number, number]),
                    source: 'shoulder' as const,
                };
            }
            for (let toIndex = fromIndex - 1; toIndex >= 0; toIndex -= 1) {
                if (!stationsMatch(stationNames[toIndex], toStation)) continue;
                return {
                    geometry: shoulder.coordinates.slice(toIndex, fromIndex + 1).reverse().map(([lat, lon]) => [lat, lon] as [number, number]),
                    source: 'shoulder' as const,
                };
            }
        }
    }

    const networkGeometry = findNetworkGeometry(fromStation, toStation, atlasShoulders);
    if (networkGeometry?.geometry?.length) {
        return networkGeometry;
    }

    return {
        geometry: smoothDirectGeometry(fromPoint, toPoint, previousPoint, nextPoint),
        source: 'smoothed' as const,
    };
}

function classifyTraction(fromStation: string, toStation: string, fallback: TractionType): TractionType {
    const fromNormalized = normalizeStationName(fromStation);
    const toNormalized = normalizeStationName(toStation);
    const fromElectric = ELECTRIC_HINTS.some((item) => fromNormalized.includes(item));
    const toElectric = ELECTRIC_HINTS.some((item) => toNormalized.includes(item));
    const fromDiesel = DIESEL_HINTS.some((item) => fromNormalized.includes(item));
    const toDiesel = DIESEL_HINTS.some((item) => toNormalized.includes(item));

    if ((fromDiesel || toDiesel) && !(fromElectric && toElectric)) return 'diesel';
    if ((fromElectric || toElectric) && (fromDiesel || toDiesel)) return 'dual';
    if (fromElectric || toElectric) return 'electric';
    return fallback;
}

function buildKeyStopSet(stops: any[]) {
    const keySet = new Set<number>();
    stops.forEach((stop, index) => {
        const dwellMinutes = Number(stop.dwellMinutes ?? 0);
        const normalized = normalizeStationName(stop.station_name);
        if (index === 0 || index === stops.length - 1 || dwellMinutes >= 20 || index % 10 === 0) {
            keySet.add(index);
        }
        if (
            normalized.includes('астана') ||
            normalized.includes('алматы') ||
            normalized.includes('караганд') ||
            normalized.includes('шу') ||
            normalized.includes('шымкент')
        ) {
            keySet.add(index);
        }
    });
    return keySet;
}

function getStopMinute(stop: any) {
    if (typeof stop.departure_operational_minute === 'number') return stop.departure_operational_minute;
    if (typeof stop.arrival_operational_minute === 'number') return stop.arrival_operational_minute;
    return null;
}

function pickCurrentMinute(train: any) {
    const cursor = toOperationalNowMinute();
    const latest = Math.max(train.arrivalOperationalMinute ?? cursor, train.departureOperationalMinute ?? 0);
    const periods = Math.max(1, Math.ceil(latest / SERVICE_DAY_MINUTES) + 1);
    const candidates = Array.from({ length: periods }, (_, index) => cursor + index * SERVICE_DAY_MINUTES);
    const active = candidates.find((item) => item >= train.departureOperationalMinute && item <= train.arrivalOperationalMinute);
    return {
        cursor,
        effectiveMinute: active ?? cursor,
        currentOperationalLabel: operationalLabel(cursor),
        isActive: typeof active === 'number',
    };
}

function buildCurrentPoint(stops: RouteStopPoint[], effectiveMinute: number, train: any, isActive: boolean, segments: RouteSegment[] = []) {
    const first = stops[0];
    const last = stops[stops.length - 1];

    if (!first || !last) {
        return {
            latitude: 51.15,
            longitude: 71.45,
            label: '??????? ?? ?????????',
            minuteLabel: operationalLabel(effectiveMinute),
            status: 'before_departure' as const,
            focusStopIndex: null as number | null,
            segmentIndex: null as number | null,
        };
    }

    if (!isActive && effectiveMinute < (train.departureOperationalMinute ?? 0)) {
        return {
            latitude: first.latitude,
            longitude: first.longitude,
            label: `?? ??????????? ?? ??????? ${first.stop.station_name}`,
            minuteLabel: operationalLabel(effectiveMinute),
            status: 'before_departure' as const,
            focusStopIndex: 0,
            segmentIndex: null,
        };
    }

    if (!isActive && effectiveMinute >= (train.arrivalOperationalMinute ?? 0)) {
        return {
            latitude: last.latitude,
            longitude: last.longitude,
            label: `????? ?????? ?? ??????? ${last.stop.station_name}`,
            minuteLabel: operationalLabel(effectiveMinute),
            status: 'arrived' as const,
            focusStopIndex: stops.length - 1,
            segmentIndex: null,
        };
    }

    for (let index = 1; index < stops.length; index += 1) {
        const previous = stops[index - 1];
        const current = stops[index];
        const previousMinute = previous.minute;
        const currentMinute = current.minute;
        if (typeof previousMinute !== 'number' || typeof currentMinute !== 'number') continue;
        if (effectiveMinute < previousMinute || effectiveMinute > currentMinute) continue;
        const span = Math.max(currentMinute - previousMinute, 1);
        const ratio = (effectiveMinute - previousMinute) / span;
        const interpolated = interpolateAlongGeometry(segments[index - 1]?.geometry ?? [], ratio);
        return {
            latitude: interpolated.latitude,
            longitude: interpolated.longitude,
            label: `????? ${previous.stop.station_name} ? ${current.stop.station_name}`,
            minuteLabel: operationalLabel(effectiveMinute),
            status: 'en_route' as const,
            focusStopIndex: ratio >= 0.5 ? index : index - 1,
            segmentIndex: index - 1,
        };
    }

    return {
        latitude: first.latitude,
        longitude: first.longitude,
        label: '??????? ?????????? ?? ?????',
        minuteLabel: operationalLabel(effectiveMinute),
        status: 'before_departure' as const,
        focusStopIndex: 0,
        segmentIndex: null,
    };
}

function interpolateAlongGeometry(geometry: Array<[number, number]>, ratio: number) {
    if (!geometry.length) return { latitude: 51.15, longitude: 71.45 };
    if (geometry.length === 1) return { latitude: geometry[0][0], longitude: geometry[0][1] };

    const clampedRatio = Math.max(0, Math.min(1, ratio));
    const totalLength = geometryDistance(geometry);
    if (totalLength <= 0) {
        return { latitude: geometry[0][0], longitude: geometry[0][1] };
    }

    const targetLength = totalLength * clampedRatio;
    let traversed = 0;
    for (let index = 1; index < geometry.length; index += 1) {
        const left = geometry[index - 1];
        const right = geometry[index];
        const segmentLength = pointDistance(left, right);
        if (traversed + segmentLength >= targetLength) {
            const localRatio = segmentLength === 0 ? 0 : (targetLength - traversed) / segmentLength;
            return {
                latitude: left[0] + (right[0] - left[0]) * localRatio,
                longitude: left[1] + (right[1] - left[1]) * localRatio,
            };
        }
        traversed += segmentLength;
    }

    const last = geometry[geometry.length - 1];
    return { latitude: last[0], longitude: last[1] };
}

function findStationIndex(points: RouteStopPoint[], stationName: string | null | undefined, fallback: number) {
    if (!stationName) return fallback;
    const index = points.findIndex((point) => stationsMatch(point.stop.station_name, stationName));
    return index >= 0 ? index : fallback;
}

export function buildPassengerRouteMapModel(
    train: any,
    assignment: any,
    atlasStations: AtlasStationPoint[] = [],
    atlasShoulders: AtlasShoulderLine[] = [],
): PassengerRouteMapModel | null {
    if (!train?.stops?.length) return null;

    const resolvedStops = interpolateStops(train.stops, atlasStations);
    const keyStopIndexes = buildKeyStopSet(train.stops);
    const assignmentTraction = inferTractionType(assignment?.locomotiveSeries);
    const { effectiveMinute, currentOperationalLabel, isActive } = pickCurrentMinute(train);

    const points = resolvedStops.map((item, index) => {
        const minute = getStopMinute(item.stop);
        return {
            id: `${train.tripId}:${item.stop.station_sequence}`,
            seq: index + 1,
            stop: item.stop,
            latitude: item.geo.latitude,
            longitude: item.geo.longitude,
            minute,
            coordinateSource: item.coordinateSource,
            isKeyStop: keyStopIndexes.has(index),
            isCompleted: typeof minute === 'number' ? effectiveMinute >= minute : false,
        } satisfies RouteStopPoint;
    });

    const assignmentStart = findStationIndex(points, assignment?.originStation ?? train.originStation, 0);
    const assignmentEnd = findStationIndex(points, assignment?.destinationStation ?? train.destinationStation, points.length - 1);
    const assignmentRangeStart = Math.min(assignmentStart, assignmentEnd);
    const assignmentRangeEnd = Math.max(assignmentStart, assignmentEnd);

    const segments: RouteSegment[] = [];
    const tractionChanges: PassengerRouteMapModel['tractionChanges'] = [];

    for (let index = 1; index < points.length; index += 1) {
        const from = points[index - 1];
        const to = points[index];
        const traction = classifyTraction(from.stop.station_name, to.stop.station_name, assignmentTraction);
        const previousPoint = index > 1 ? { latitude: points[index - 2].latitude, longitude: points[index - 2].longitude } : null;
        const nextPoint = index < points.length - 1 ? { latitude: points[index + 1].latitude, longitude: points[index + 1].longitude } : null;
        const geometry = resolveSegmentGeometry(
            from.stop.station_name,
            to.stop.station_name,
            { latitude: from.latitude, longitude: from.longitude },
            { latitude: to.latitude, longitude: to.longitude },
            atlasShoulders,
            previousPoint,
            nextPoint,
        );

        const segment: RouteSegment = {
            id: `${train.tripId}:segment:${index}`,
            seq: index,
            from,
            to,
            geometry: geometry.geometry,
            geometrySource: geometry.source,
            traction,
            electrified: traction === 'electric' || traction === 'dual',
            completed:
                typeof to.minute === 'number'
                    ? effectiveMinute >= to.minute
                    : typeof from.minute === 'number'
                        ? effectiveMinute >= from.minute
                        : false,
            future:
                typeof from.minute === 'number'
                    ? effectiveMinute < from.minute
                    : false,
            assignmentActive: index - 1 >= assignmentRangeStart && index - 1 < assignmentRangeEnd,
            tractionChange: false,
        };

        const previousSegment = segments[segments.length - 1];
        if (previousSegment && previousSegment.traction !== traction) {
            segment.tractionChange = true;
            tractionChanges.push({
                stationName: from.stop.station_name,
                segmentId: segment.id,
                tractionBefore: previousSegment.traction,
                tractionAfter: traction,
                latitude: from.latitude,
                longitude: from.longitude,
            });
        }

        segments.push(segment);
    }

    const currentPointDraft = buildCurrentPoint(points, effectiveMinute, train, isActive, segments);
    const completedStops = points.filter((item) => item.isCompleted).length;
    const interpolatedStopsCount = points.filter((item) => item.coordinateSource === 'interpolated' || item.coordinateSource === 'fallback').length;

    return {
        stops: points,
        segments,
        currentPoint: {
            latitude: currentPointDraft.latitude,
            longitude: currentPointDraft.longitude,
            label: currentPointDraft.label,
            minuteLabel: currentPointDraft.minuteLabel,
            status: currentPointDraft.status,
        },
        currentOperationalMinute: effectiveMinute,
        currentOperationalLabel,
        currentStopId:
            typeof currentPointDraft.focusStopIndex === 'number'
                ? points[currentPointDraft.focusStopIndex]?.id ?? null
                : null,
        currentSegmentId:
            typeof currentPointDraft.segmentIndex === 'number'
                ? segments[currentPointDraft.segmentIndex]?.id ?? null
                : null,
        assignmentTraction,
        tractionChanges,
        stationCount: points.length,
        durationMinutes: train.durationMinutes ?? 0,
        completedStops,
        remainingStops: Math.max(points.length - completedStops, 0),
        interpolatedStopsCount,
        shoulderGeometrySegments: segments.filter((segment) => segment.geometrySource === 'shoulder' || segment.geometrySource === 'network').length,
    };
}

export default function PassengerRouteMap({
    train,
    assignment,
    scenarioLabel,
    scenarioMode,
    hrefForPage,
    selectedLocomotiveId,
}: {
    train: any;
    assignment: any;
    scenarioLabel: string;
    scenarioMode: 'base' | 'optimized';
    hrefForPage?: (page: 'graph' | 'bindings' | 'map', overrides?: Record<string, string | null | undefined>) => string;
    selectedLocomotiveId?: string | null;
}) {
    const [atlasStations, setAtlasStations] = useState<AtlasStationPoint[]>([]);
    const [atlasShoulders, setAtlasShoulders] = useState<AtlasShoulderLine[]>([]);
    const [atlasLoaded, setAtlasLoaded] = useState(false);
    const [mapMode, setMapMode] = useState<MapLayerMode>('full-route');
    const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
    const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);

    useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                const atlas = await getGisAtlas();
                if (!mounted) return;
                setAtlasStations(atlas?.stations ?? []);
                setAtlasShoulders(atlas?.shoulders ?? []);
            } catch {
                if (!mounted) return;
                setAtlasStations([]);
                setAtlasShoulders([]);
            } finally {
                if (mounted) setAtlasLoaded(true);
            }
        })();

        return () => {
            mounted = false;
        };
    }, []);

    const model = useMemo(
        () => buildPassengerRouteMapModel(train, assignment, atlasStations, atlasShoulders),
        [assignment, atlasShoulders, atlasStations, train],
    );

    useEffect(() => {
        if (!model) {
            setSelectedStopId(null);
            setSelectedSegmentId(null);
            return;
        }
        setSelectedStopId((current) =>
            model.stops.some((stop) => stop.id === current)
                ? current
                : model.currentStopId ?? model.stops[0]?.id ?? null,
        );
        setSelectedSegmentId((current) =>
            model.segments.some((segment) => segment.id === current)
                ? current
                : model.currentSegmentId ?? model.segments[0]?.id ?? null,
        );
    }, [model]);

    const selectedStop = useMemo(
        () => model?.stops.find((stop) => stop.id === selectedStopId) ?? null,
        [model, selectedStopId],
    );
    const selectedSegment = useMemo(
        () => model?.segments.find((segment) => segment.id === selectedSegmentId) ?? null,
        [model, selectedSegmentId],
    );

    const selectedStopLocomotive =
        selectedStop?.stop?.locomotives?.[scenarioMode] ??
        assignment?.locomotiveLabel ??
        'Нет подвязки';

    const handleSelectStop = (stopId: string) => {
        if (!model) return;
        setSelectedStopId(stopId);
        const relatedSegment =
            model.segments.find((segment) => segment.from.id === stopId) ??
            model.segments.find((segment) => segment.to.id === stopId) ??
            null;
        if (relatedSegment) setSelectedSegmentId(relatedSegment.id);
    };

    const handleSelectSegment = (segmentId: string) => {
        if (!model) return;
        const segment = model.segments.find((item) => item.id === segmentId);
        if (!segment) return;
        setSelectedSegmentId(segmentId);
        setSelectedStopId(segment.to.id);
    };

    if (!model) {
        return (
            <div className="rounded-[2rem] border border-slate-200 bg-white px-6 py-10 text-center text-sm text-slate-500">
                Выбери поезд, чтобы открыть карту полного маршрута.
            </div>
        );
    }

    const nextSegmentByStopId = new Map(model.segments.map((segment) => [segment.from.id, segment]));

    return (
        <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
            <div className="flex flex-col gap-4 border-b border-slate-200 bg-[linear-gradient(135deg,#f8fafc_0%,#ffffff_56%,#ecfeff_100%)] px-6 py-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                    <div>
                        <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                            <MapPinned size={12} />
                            Railway route map
                        </div>
                        <h3 className="mt-3 text-xl font-bold text-slate-950">{train.routeLabel}</h3>
                        <p className="mt-1 text-sm text-slate-500">
                            {`${train.originStation} → ${train.destinationStation} • ${scenarioLabel}`}
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        {MAP_MODES.map((mode) => (
                            <button
                                key={mode.id}
                                onClick={() => setMapMode(mode.id)}
                                className={`rounded-2xl px-4 py-2.5 text-sm font-semibold transition ${
                                    mapMode === mode.id
                                        ? 'bg-slate-950 text-white shadow-[0_10px_24px_rgba(15,23,42,0.14)]'
                                        : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-950'
                                }`}
                            >
                                {mode.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex flex-wrap gap-2 text-xs text-slate-600">
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">{`${model.stationCount} route points`}</span>
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">{`${model.segments.length} ordered segments`}</span>
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">{`Shoulder geometry: ${model.shoulderGeometrySegments}`}</span>
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">{`Interpolated stops: ${model.interpolatedStopsCount}`}</span>
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">{`Operational cursor ${model.currentOperationalLabel}`}</span>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.68fr)_360px]">
                <div className="border-b border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.10),_transparent_28%),linear-gradient(180deg,#f8fafc_0%,#eef2ff_100%)] p-4 xl:border-b-0 xl:border-r">
                    <DynamicPassengerRouteMapLeaflet
                        model={model}
                        assignment={assignment}
                        scenarioLabel={scenarioLabel}
                        mapMode={mapMode}
                        selectedStopId={selectedStopId}
                        selectedSegmentId={selectedSegmentId}
                        onSelectStop={handleSelectStop}
                        onSelectSegment={handleSelectSegment}
                    />

                    <div className="mt-4 flex flex-wrap gap-3 text-xs text-slate-500">
                        <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5">
                            <Clock3 size={12} />
                            {`Опер. время ${model.currentPoint.minuteLabel}`}
                        </span>
                        <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5">
                            <LocateFixed size={12} />
                            {model.currentPoint.label}
                        </span>
                        <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5">
                            <PlugZap size={12} />
                            {tractionLabel(model.assignmentTraction)}
                        </span>
                        <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5">
                            <Milestone size={12} />
                            {atlasLoaded ? `GIS stations ${atlasStations.length}` : 'Подключение GIS atlas...'}
                        </span>
                    </div>
                </div>

                <aside className="space-y-4 p-5">
                    <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
                        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Inspector</div>
                        <div className="mt-2 text-lg font-semibold text-slate-950">
                            {selectedStop?.stop.station_name ?? train.originStation}
                        </div>
                        <p className="mt-2 text-sm leading-6 text-slate-600">
                            Правая панель больше не дублирует station list. Она показывает только контекст выбранной станции и соседнего сегмента маршрута.
                        </p>
                    </div>

                    <div className="rounded-[1.5rem] border border-slate-200 bg-white p-4">
                        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
                            <MapPinned size={16} className="text-sky-600" />
                            Выбранная станция
                        </div>
                        <div className="grid grid-cols-[116px_minmax(0,1fr)] gap-3 text-sm">
                            <div className="text-slate-400">Станция</div>
                            <div className="font-semibold text-slate-900">{selectedStop?.stop.station_name ?? '—'}</div>
                            <div className="text-slate-400">Код</div>
                            <div className="font-semibold text-slate-900">{selectedStop?.stop.station_code ?? '—'}</div>
                            <div className="text-slate-400">Прибытие</div>
                            <div className="font-semibold text-slate-900">{selectedStop?.stop.arrivalLabel ?? operationalDayLabel(selectedStop?.stop.arrival_operational_minute)}</div>
                            <div className="text-slate-400">Отправление</div>
                            <div className="font-semibold text-slate-900">{selectedStop?.stop.departureLabel ?? operationalDayLabel(selectedStop?.stop.departure_operational_minute)}</div>
                            <div className="text-slate-400">Стоянка</div>
                            <div className="font-semibold text-slate-900">{formatMinutes(selectedStop?.stop.dwellMinutes)}</div>
                            <div className="text-slate-400">Операция</div>
                            <div className="font-semibold text-slate-900">{(selectedStop?.stop.service_operations ?? []).join(', ') || selectedStop?.stop.event_type || '—'}</div>
                            <div className="text-slate-400">Локомотив</div>
                            <div className="font-semibold text-slate-900">{selectedStopLocomotive}</div>
                            <div className="text-slate-400">Сценарий</div>
                            <div className="font-semibold text-slate-900">{scenarioLabel}</div>
                            <div className="text-slate-400">Коорд. источник</div>
                            <div className="font-semibold text-slate-900">{selectedStop ? coordinateSourceLabel(selectedStop.coordinateSource) : '—'}</div>
                        </div>
                    </div>

                    <div className="rounded-[1.5rem] border border-slate-200 bg-white p-4">
                        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
                            <PlugZap size={16} className="text-violet-600" />
                            Выбранный сегмент
                        </div>
                        <div className="grid grid-cols-[116px_minmax(0,1fr)] gap-3 text-sm">
                            <div className="text-slate-400">Участок</div>
                            <div className="font-semibold text-slate-900">{selectedSegment ? `${selectedSegment.from.stop.station_name} → ${selectedSegment.to.stop.station_name}` : '—'}</div>
                            <div className="text-slate-400">Тяга</div>
                            <div className="font-semibold text-slate-900">{selectedSegment ? tractionLabel(selectedSegment.traction) : '—'}</div>
                            <div className="text-slate-400">Электрификация</div>
                            <div className="font-semibold text-slate-900">{selectedSegment ? (selectedSegment.electrified ? 'Да' : 'Нет') : '—'}</div>
                            <div className="text-slate-400">Смена тяги</div>
                            <div className="font-semibold text-slate-900">{selectedSegment?.tractionChange ? 'Есть на входе сегмента' : 'Нет'}</div>
                            <div className="text-slate-400">Геометрия</div>
                            <div className="font-semibold text-slate-900">{selectedSegment ? `${selectedSegment.geometry.length} route points • ${geometrySourceLabel(selectedSegment.geometrySource)}` : '—'}</div>
                            <div className="text-slate-400">Статус</div>
                            <div className="font-semibold text-slate-900">
                                {selectedSegment ? (selectedSegment.completed ? 'Пройден' : selectedSegment.future ? 'Впереди' : 'Активный') : '—'}
                            </div>
                        </div>
                    </div>

                    <div className="rounded-[1.5rem] border border-slate-200 bg-white p-4">
                        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
                            <Train size={16} className="text-slate-700" />
                            Поезд и подвязка
                        </div>
                        <div className="space-y-2 text-sm text-slate-600">
                            <div>{`Поезд: №${train.trainNo}`}</div>
                            <div>{`Маршрут: ${train.originStation} → ${train.destinationStation}`}</div>
                            <div>{`Локомотив: ${assignment?.locomotiveLabel ?? 'Нет подвязки'}`}</div>
                            <div>{`Плечо подвязки: ${assignment?.originStation ?? train.originStation} → ${assignment?.destinationStation ?? train.destinationStation}`}</div>
                            <div>{`Освобождение: ${assignment?.releaseLabel ?? '—'}`}</div>
                        </div>

                        {hrefForPage ? (
                            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                                <Link
                                    href={hrefForPage('graph', { trainNo: train.trainNo, scenario: scenarioMode })}
                                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-700"
                                >
                                    <Route size={14} />
                                    На график
                                </Link>
                                <Link
                                    href={hrefForPage('bindings', {
                                        locomotiveId: assignment?.locomotiveId ?? selectedLocomotiveId ?? null,
                                        trainNo: train.trainNo,
                                        scenario: scenarioMode,
                                    })}
                                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-700"
                                >
                                    <Link2 size={14} />
                                    К подвязкам
                                </Link>
                            </div>
                        ) : null}
                    </div>
                </aside>
            </div>

            <div className="border-t border-slate-200 px-4 py-4">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Single station list</div>
                        <h4 className="mt-1 text-lg font-semibold text-slate-950">Полный ordered route A → B</h4>
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                        {`${model.stops.length} station events`}
                    </span>
                </div>

                <div className="max-h-[480px] overflow-auto rounded-[1.5rem] border border-slate-200">
                    <table className="min-w-full text-sm">
                        <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase tracking-[0.18em] text-slate-500">
                            <tr>
                                <th className="px-4 py-3">#</th>
                                <th className="px-4 py-3">Станция</th>
                                <th className="px-4 py-3">Источник</th>
                                <th className="px-4 py-3">Приб.</th>
                                <th className="px-4 py-3">Отпр.</th>
                                <th className="px-4 py-3">Стоянка</th>
                                <th className="px-4 py-3">След. сегмент</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                            {model.stops.map((point) => {
                                const nextSegment = nextSegmentByStopId.get(point.id);
                                const active = point.id === selectedStopId;
                                const current = point.id === model.currentStopId;

                                return (
                                    <tr
                                        key={point.id}
                                        className={`cursor-pointer transition ${
                                            active ? 'bg-sky-50' : current ? 'bg-emerald-50/70' : 'hover:bg-slate-50'
                                        }`}
                                        onClick={() => handleSelectStop(point.id)}
                                    >
                                        <td className="px-4 py-3 text-slate-400">{point.seq}</td>
                                        <td className="px-4 py-3">
                                            <div className="font-semibold text-slate-900">{point.stop.station_name}</div>
                                            <div className="mt-1 flex flex-wrap gap-1 text-[11px] text-slate-500">
                                                {point.stop.event_type === 'origin_departure' ? (
                                                    <span className="rounded-full bg-slate-100 px-2 py-0.5">origin</span>
                                                ) : null}
                                                {point.stop.event_type === 'terminal_arrival' ? (
                                                    <span className="rounded-full bg-rose-50 px-2 py-0.5 text-rose-700">terminal</span>
                                                ) : null}
                                                {current ? (
                                                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">current focus</span>
                                                ) : null}
                                                {point.coordinateSource === 'interpolated' || point.coordinateSource === 'fallback' ? (
                                                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700">{coordinateSourceLabel(point.coordinateSource)}</span>
                                                ) : null}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-slate-600">{coordinateSourceLabel(point.coordinateSource)}</td>
                                        <td className="px-4 py-3 text-slate-600">{point.stop.arrivalLabel ?? '—'}</td>
                                        <td className="px-4 py-3 text-slate-600">{point.stop.departureLabel ?? '—'}</td>
                                        <td className="px-4 py-3">
                                            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                                                Number(point.stop.dwellMinutes ?? 0) >= 30
                                                    ? 'bg-amber-50 text-amber-700'
                                                    : Number(point.stop.dwellMinutes ?? 0) > 0
                                                        ? 'bg-sky-50 text-sky-700'
                                                        : 'bg-slate-100 text-slate-500'
                                            }`}>
                                                {formatMinutes(point.stop.dwellMinutes)}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-slate-600">
                                            {nextSegment ? (
                                                <div>
                                                    <div className="font-medium text-slate-900">{nextSegment.to.stop.station_name}</div>
                                                    <div className="text-xs text-slate-500">{tractionLabel(nextSegment.traction)}</div>
                                                </div>
                                            ) : (
                                                'Конечная'
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
