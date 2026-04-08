
import { Injectable } from '@nestjs/common';
import { LocomotiveStatus, MovementType, TractionType, TrainPriority } from '@prisma/client';
import * as path from 'node:path';
import { PrismaService } from '../../prisma/prisma.service';
import { PassengerTimetableService } from './passenger-timetable.service';

const VALID_FROM = new Date('2025-10-21T20:00:00.000Z');
const VALID_TO = new Date('2026-12-31T19:59:00.000Z');
const PASSENGER_FREQUENCY = '2025-2026';

function normalize(value: string | null | undefined) {
  return String(value ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function inferTraction(series?: string | null): TractionType {
  const value = String(series ?? '').toUpperCase();
  if (value.includes('ТЭ') || value.includes('TE') || value.includes('ДИЗ')) return TractionType.DIESEL;
  if (value.includes('KZ4') || value.includes('ВЛ') || value.includes('Э') || value.includes('ЭП')) return TractionType.ELECTRIC;
  return TractionType.DUAL;
}

function addOperationalMinutes(minute?: number | null) {
  if (typeof minute !== 'number' || Number.isNaN(minute)) return null;
  return new Date(VALID_FROM.getTime() + minute * 60_000);
}

@Injectable()
export class PassengerTimetableSyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passengerTimetableService: PassengerTimetableService,
  ) {}

  async syncDatabase() {
    const dataset: any = await this.passengerTimetableService.getDatasetSnapshot();
    const parkLocomotives: any[] = await this.passengerTimetableService.getParkLocomotives();
    const sourceFile = path.basename(dataset.workbookPath);

    const stationMap = await this.ensureStations(dataset, parkLocomotives);
    const depotMap = await this.ensureDepots(parkLocomotives);
    const modelMap = await this.ensureLocomotiveModels(parkLocomotives);
    const trainMap = await this.ensureTrains(dataset.allTrips ?? []);
    const routeSummary = await this.rebuildRoutesAndSchedules(dataset.allTrips ?? [], trainMap, stationMap, sourceFile);
    const locomotiveSummary = await this.syncLocomotives(parkLocomotives, depotMap, stationMap);
    const shoulderSummary = await this.syncServiceShoulders(dataset, stationMap, depotMap, modelMap);

    return {
      sourceFile,
      syncedAt: new Date().toISOString(),
      stations: stationMap.size,
      trains: trainMap.size,
      routes: routeSummary.routes,
      routeStops: routeSummary.routeStops,
      schedules: routeSummary.schedules,
      depots: depotMap.size,
      locomotiveModels: modelMap.size,
      locomotivesCreated: locomotiveSummary.created,
      locomotivesUpdated: locomotiveSummary.updated,
      serviceShouldersCreated: shoulderSummary,
      pairCount: dataset.pairSummaries?.length ?? 0,
      tripCount: dataset.allTrips?.length ?? 0,
      parseIssues: dataset.parseIssues?.length ?? 0,
    };
  }

  private async ensureStations(dataset: any, parkLocomotives: any[]) {
    const existing = await this.prisma.station.findMany({
      select: { id: true, name: true, code: true },
    });

    const byCode = new Map(existing.filter((item) => item.code).map((item) => [String(item.code), item]));
    const byName = new Map(existing.map((item) => [normalize(item.name), item]));
    const result = new Map<string, string>();

    const candidates = new Map<string, { name: string; code: string | null }>();
    for (const trip of dataset.allTrips ?? []) {
      for (const stop of trip.stops ?? []) {
        const key = normalize(stop.station_name);
        if (!key) continue;
        candidates.set(key, {
          name: stop.station_name,
          code: stop.station_code ?? null,
        });
      }
    }

    for (const locomotive of parkLocomotives) {
      const name = locomotive.location ?? null;
      const key = normalize(name);
      if (!key || candidates.has(key)) continue;
      candidates.set(key, { name, code: null });
    }

    for (const candidate of candidates.values()) {
      const byStationCode = candidate.code ? byCode.get(candidate.code) ?? null : null;
      const byStationName = byName.get(normalize(candidate.name)) ?? null;
      const existingStation = byStationCode ?? byStationName;

      if (existingStation) {
        if (candidate.code && !existingStation.code) {
          const updated = await this.prisma.station.update({
            where: { id: existingStation.id },
            data: { code: candidate.code },
          });
          byCode.set(candidate.code, updated);
          byName.set(normalize(updated.name), updated);
          result.set(normalize(updated.name), updated.id);
        } else {
          result.set(normalize(existingStation.name), existingStation.id);
        }
        continue;
      }

      const created = await this.prisma.station.create({
        data: {
          name: candidate.name,
          code: candidate.code,
        },
      });
      if (created.code) byCode.set(created.code, created);
      byName.set(normalize(created.name), created);
      result.set(normalize(created.name), created.id);
    }

    return result;
  }

  private async ensureDepots(parkLocomotives: any[]) {
    const existing = await this.prisma.depot.findMany({ select: { id: true, name: true } });
    const result = new Map(existing.map((item) => [normalize(item.name), item.id]));

    for (const locomotive of parkLocomotives) {
      const name = String(locomotive.depot ?? '').trim();
      const key = normalize(name);
      if (!key || result.has(key)) continue;
      const created = await this.prisma.depot.create({ data: { name } });
      result.set(key, created.id);
    }

    return result;
  }

  private async ensureLocomotiveModels(parkLocomotives: any[]) {
    const existing = await this.prisma.locomotiveModel.findMany({ select: { id: true, series: true } });
    const result = new Map(existing.map((item) => [item.series, item.id]));

    const seriesSet = new Set<string>();
    for (const locomotive of parkLocomotives) {
      const series = String(locomotive.series ?? '').trim();
      if (series) seriesSet.add(series);
    }

    for (const series of seriesSet) {
      if (result.has(series)) continue;
      const created = await this.prisma.locomotiveModel.create({
        data: {
          series,
          sectionsCount: 1,
          tractionType: inferTraction(series),
          description: 'Imported from passenger park workbook',
        },
      });
      result.set(series, created.id);
    }

    return result;
  }

  private async ensureTrains(trips: any[]) {
    const result = new Map<string, string>();

    for (const trip of trips) {
      const train = await this.prisma.train.upsert({
        where: { number: trip.trainNo },
        create: {
          number: trip.trainNo,
          priority: TrainPriority.PASSENGER,
          route: trip.routeLabel,
          frequency: PASSENGER_FREQUENCY,
          carrier: trip.carrier,
        },
        update: {
          priority: TrainPriority.PASSENGER,
          route: trip.routeLabel,
          frequency: PASSENGER_FREQUENCY,
          carrier: trip.carrier,
        },
        select: { id: true },
      });
      result.set(trip.trainNo, train.id);
    }

    return result;
  }

  private async rebuildRoutesAndSchedules(trips: any[], trainMap: Map<string, string>, stationMap: Map<string, string>, sourceFile: string) {
    const trainIds = Array.from(trainMap.values());
    const trainNumbers = Array.from(trainMap.keys());
    const existingRoutes = await this.prisma.route.findMany({
      where: { trainId: { in: trainIds } },
      select: { id: true },
    });
    const existingRouteIds = existingRoutes.map((item) => item.id);

    if (existingRouteIds.length) {
      await this.prisma.routeStop.deleteMany({ where: { routeId: { in: existingRouteIds } } });
      await this.prisma.route.deleteMany({ where: { id: { in: existingRouteIds } } });
    }

    if (trainNumbers.length) {
      await this.prisma.schedule.deleteMany({ where: { trainNumber: { in: trainNumbers } } });
    }

    let routeCount = 0;
    let routeStopCount = 0;
    const scheduleRows: any[] = [];

    for (const trip of trips) {
      const trainId = trainMap.get(trip.trainNo);
      if (!trainId) continue;
      const route = await this.prisma.route.create({
        data: {
          trainId,
          validFrom: VALID_FROM,
          validTo: VALID_TO,
        },
        select: { id: true },
      });
      routeCount += 1;

      const stopsPayload = (trip.stops ?? []).flatMap((stop: any) => {
        const stationId = stationMap.get(normalize(stop.station_name));
        if (!stationId) return [];
        return [{
          routeId: route.id,
          stationId,
          seqNo: stop.station_sequence,
          stationCode: stop.station_code ?? null,
          arrivalDt: addOperationalMinutes(stop.arrival_operational_minute),
          departureDt: addOperationalMinutes(stop.departure_operational_minute),
          stopMinutes: typeof stop.arrival_operational_minute === 'number' && typeof stop.departure_operational_minute === 'number'
            ? Math.max(stop.departure_operational_minute - stop.arrival_operational_minute, 0)
            : null,
          distanceKm: typeof stop.distance_km === 'number' ? Math.round(stop.distance_km) : null,
        }];
      });

      if (stopsPayload.length) {
        await this.prisma.routeStop.createMany({ data: stopsPayload });
        routeStopCount += stopsPayload.length;
      }

      for (const stop of trip.stops ?? []) {
        scheduleRows.push({
          trainId,
          trainNumber: trip.trainNo,
          station: stop.station_name,
          arrival: addOperationalMinutes(stop.arrival_operational_minute),
          departure: addOperationalMinutes(stop.departure_operational_minute),
          arrivalRaw: stop.arrival_time_raw ?? null,
          departureRaw: stop.departure_time_raw ?? null,
          operation: stop.event_type ?? null,
          sourceFile,
          sourceSheet: trip.pairDisplay,
          sourceGroup: 'passenger_timetable',
        });
      }
    }

    for (let index = 0; index < scheduleRows.length; index += 500) {
      await this.prisma.schedule.createMany({
        data: scheduleRows.slice(index, index + 500),
      });
    }

    return { routes: routeCount, routeStops: routeStopCount, schedules: scheduleRows.length };
  }

  private async syncLocomotives(parkLocomotives: any[], depotMap: Map<string, string>, stationMap: Map<string, string>) {
    const existing = await this.prisma.locomotive.findMany({
      select: { id: true, series: true, number: true },
    });
    const byKey = new Map(existing.map((item) => [`${item.series}|${item.number}`, item.id]));
    let created = 0;
    let updated = 0;

    for (const item of parkLocomotives) {
      const series = String(item.series ?? '').trim();
      const number = String(item.number ?? '').trim();
      const depotId = depotMap.get(normalize(item.depot));
      if (!series || !number || !depotId) continue;
      const stationId = item.location ? stationMap.get(normalize(item.location)) ?? null : null;
      const key = `${series}|${number}`;
      const existingId = byKey.get(key);

      if (existingId) {
        await this.prisma.locomotive.update({
          where: { id: existingId },
          data: {
            depotId,
            locationStationId: stationId,
            status: LocomotiveStatus.AVAILABLE,
            availableFrom: new Date(),
          },
        });
        updated += 1;
        continue;
      }

      const locomotive = await this.prisma.locomotive.create({
        data: {
          series,
          number,
          depotId,
          locationStationId: stationId,
          status: LocomotiveStatus.AVAILABLE,
          availableFrom: new Date(),
        },
        select: { id: true },
      });
      byKey.set(key, locomotive.id);
      created += 1;
    }

    return { created, updated };
  }

  private async syncServiceShoulders(dataset: any, stationMap: Map<string, string>, depotMap: Map<string, string>, modelMap: Map<string, string>) {
    const rows: Array<{ depotId: string; fromStationId: string; toStationId: string; modelId: string; sectionsCount: number; movementType: MovementType }> = [];
    const seen = new Set<string>();

    for (const scenario of [dataset.scenarios?.base, dataset.scenarios?.optimized]) {
      for (const assignment of scenario?.assignments ?? []) {
        const depotId = depotMap.get(normalize(assignment.locomotiveDepot));
        const fromStationId = stationMap.get(normalize(assignment.originStation));
        const toStationId = stationMap.get(normalize(assignment.destinationStation));
        const modelId = modelMap.get(assignment.locomotiveSeries);
        if (!depotId || !fromStationId || !toStationId || !modelId) continue;
        const key = `${depotId}|${fromStationId}|${toStationId}|${modelId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push({
          depotId,
          fromStationId,
          toStationId,
          modelId,
          sectionsCount: 1,
          movementType: MovementType.PASSENGER,
        });
      }
    }

    if (!rows.length) return 0;
    const created = await this.prisma.serviceShoulder.createMany({
      data: rows,
      skipDuplicates: true,
    });
    return created.count;
  }
}
