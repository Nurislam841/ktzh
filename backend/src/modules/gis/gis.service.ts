import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

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
    idleLocomotivesCount: number;
    sumDwellTimeMinutes: number;
    maxDwellTimeMinutes: number;
}

@Injectable()
export class GisService {
    constructor(private prisma: PrismaService) { }

    async getMapData(): Promise<GisStationData[]> {
        const stations = await this.prisma.station.findMany({
            where: {
                latitude: { not: null },
                longitude: { not: null },
            },
            include: {
                locomotives: {
                    select: { status: true, availableFrom: true }
                }
            }
        });

        const now = new Date();

        return stations.map(station => {
            const available = station.locomotives.filter(l => l.status === 'AVAILABLE').length;
            const assigned = station.locomotives.filter(l => l.status === 'ASSIGNED').length;
            const maintenance = station.locomotives.filter(l => l.status === 'MAINTENANCE').length;
            const in_transit = station.locomotives.filter(l => l.status === 'IN_TRANSIT').length;

            let idleCount = 0;
            let sumDwellMinutes = 0;
            let maxDwellMinutes = 0;

            for (const loco of station.locomotives) {
                if (loco.status === 'AVAILABLE' && loco.availableFrom) {
                    const dwellMinutes = Math.floor((now.getTime() - loco.availableFrom.getTime()) / 60000);
                    if (dwellMinutes > 0) {
                        idleCount++;
                        sumDwellMinutes += dwellMinutes;
                        if (dwellMinutes > maxDwellMinutes) {
                            maxDwellMinutes = dwellMinutes;
                        }
                    }
                }
            }

            // Define "congestion" as too many available locos waiting
            const isCongested = available >= 3;

            return {
                id: station.id,
                name: station.name,
                code: station.code,
                latitude: station.latitude as number,
                longitude: station.longitude as number,
                availableLocomotives: available,
                assignedLocomotives: assigned,
                maintenanceLocomotives: maintenance,
                inTransitLocomotives: in_transit,
                isCongested,
                idleLocomotivesCount: idleCount,
                sumDwellTimeMinutes: sumDwellMinutes,
                maxDwellTimeMinutes: maxDwellMinutes,
            };
        });
    }

    async getRouteLines() {
        // Get shoulders (direct station-to-station service segments)
        const shoulders = await this.prisma.serviceShoulder.findMany({
            include: {
                fromStation: { select: { id: true, name: true, code: true, latitude: true, longitude: true } },
                toStation: { select: { id: true, name: true, code: true, latitude: true, longitude: true } },
                _count: { select: { bindingPlans: true } },
            },
        });

        // Get route-based connections with distances
        const routes = await this.prisma.route.findMany({
            include: {
                stops: {
                    orderBy: { seqNo: 'asc' },
                    include: {
                        station: { select: { id: true, name: true, code: true, latitude: true, longitude: true } },
                    },
                },
                train: { select: { number: true } },
            },
        });

        // Build unique segments from shoulders
        const segmentMap = new Map<string, any>();

        for (const sh of shoulders) {
            if (!sh.fromStation.latitude || !sh.fromStation.longitude || !sh.toStation.latitude || !sh.toStation.longitude) continue;
            const key = [sh.fromStationId, sh.toStationId].sort().join('_');
            if (!segmentMap.has(key)) {
                segmentMap.set(key, {
                    from: { id: sh.fromStation.id, name: sh.fromStation.name, code: sh.fromStation.code, lat: sh.fromStation.latitude, lng: sh.fromStation.longitude },
                    to: { id: sh.toStation.id, name: sh.toStation.name, code: sh.toStation.code, lat: sh.toStation.latitude, lng: sh.toStation.longitude },
                    distanceKm: null,
                    trainCount: sh._count.bindingPlans,
                    source: 'shoulder',
                });
            } else {
                segmentMap.get(key).trainCount += sh._count.bindingPlans;
            }
        }

        // Add route-based segments with distances
        for (const route of routes) {
            for (let i = 0; i < route.stops.length - 1; i++) {
                const a = route.stops[i];
                const b = route.stops[i + 1];
                if (!a.station.latitude || !a.station.longitude || !b.station.latitude || !b.station.longitude) continue;
                const key = [a.stationId, b.stationId].sort().join('_');
                if (!segmentMap.has(key)) {
                    segmentMap.set(key, {
                        from: { id: a.station.id, name: a.station.name, code: a.station.code, lat: a.station.latitude, lng: a.station.longitude },
                        to: { id: b.station.id, name: b.station.name, code: b.station.code, lat: b.station.latitude, lng: b.station.longitude },
                        distanceKm: b.distanceKm && a.distanceKm ? b.distanceKm - a.distanceKm : b.distanceKm,
                        trainCount: 1,
                        source: 'route',
                    });
                } else {
                    const seg = segmentMap.get(key);
                    seg.trainCount += 1;
                    // Update distance if we have it and segment doesn't yet
                    if (!seg.distanceKm && b.distanceKm) {
                        seg.distanceKm = b.distanceKm && a.distanceKm ? b.distanceKm - a.distanceKm : b.distanceKm;
                    }
                }
            }
        }

        return Array.from(segmentMap.values());
    }
}
