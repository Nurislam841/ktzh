import { Injectable, NotFoundException } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import {
  buildLocomotiveTableRows,
  loadIdealNormLookup,
  parseParkWorkbook,
} from './gitural-locomotive-table';

type StopRecord = {
  station: string;
  stationCode: string | null;
  distanceKm: number | null;
  arrivalRaw: string | null;
  departureRaw: string | null;
  dwellMinutes: number | null;
  arrivalOffsetMinutes: number | null;
  departureOffsetMinutes: number | null;
};

type NodeTrainWindow = {
  trainNumber: string;
  routeName: string | null;
  sheetName: string;
  direction: 'forward' | 'backward';
  corridor: string | null;
  entersNodeAt: string | null;
  exitsNodeAt: string | null;
  astanaCoreStop: string | null;
  windowStops: StopRecord[];
};

type GituralSummary = {
  generatedAt: string;
  nodeWindowTrains: number;
  uniqueNodeTrains: number;
  bindingEvents: number;
  bindingSheets: number;
};

type BindingEvent = {
  sheetName: string;
  depot: string | null;
  day: number;
  weekday: string | null;
  arrivalTrainNumber: string | null;
  arrivalTime: string | null;
  departureTrainNumber: string | null;
  departureTime: string | null;
  dwellMinutes: number | null;
};

type TurnaroundRecord = {
  stationSheet: string;
  day: number;
  weekday: string | null;
  depot: string | null;
  arrivalTrainNumber: string | null;
  arrivalRoute: string | null;
  arrivalAstanaStop: string | null;
  arrivalAstanaTime: string | null;
  arrivalBindingTime: string | null;
  departureTrainNumber: string | null;
  departureRoute: string | null;
  departureAstanaStop: string | null;
  departureAstanaTime: string | null;
  departureBindingTime: string | null;
  dwellMinutes: number | null;
  dwellHours: number | null;
  matchType: string;
};

type RoutePairSummary = {
  pairKey: string;
  trainNumbers: string[];
  routes: string[];
  corridors: string[];
  trainsCount: number;
};

type StopOperation = {
  trainNumber: string;
  station: string;
  stationTime: string | null;
  stationOffsetMinutes: number | null;
  type: 'LOCO_CHANGE' | 'TURNAROUND';
  label: string;
  details: string;
};

@Injectable()
export class GituralService {
  private readonly derivedDir = path.resolve(process.cwd(), 'data', 'derived', 'astana-node');
  private readonly windowsPath = path.join(this.derivedDir, 'astana-node-windows.json');
  private readonly summaryPath = path.join(this.derivedDir, 'astana-gitural-summary.json');
  private readonly bindingsPath = path.join(this.derivedDir, 'astana-loco-bindings.json');
  private readonly turnReportPath = path.join(this.derivedDir, 'astana-turn-report.json');
  private readonly parkPath = path.resolve(process.cwd(), 'data', 'Парк КТЖ-ПЛ на 01.01.2026г.xlsx');
  private readonly idealBindingsPath = path.resolve(
    process.cwd(),
    'data',
    'Подвязки 2024-2025',
    'ТЛ-11',
    'с 15.12. 2024 г Новый график KZ4Acт ТЛ11.xlsx',
  );

  private parsedParkPromise: Promise<ReturnType<typeof parseParkWorkbook>> | null = null;
  private idealNormLookupPromise: Promise<ReturnType<typeof loadIdealNormLookup>> | null = null;

  async getTimeline(corridor?: string, trainNumber?: string, day?: number) {
    const [summary, trains, bindings, turnarounds, parkLocomotives, idealNormLookup] = await Promise.all([
      this.readJson<GituralSummary>(this.summaryPath),
      this.readJson<NodeTrainWindow[]>(this.windowsPath),
      this.readJson<BindingEvent[]>(this.bindingsPath),
      this.readJson<TurnaroundRecord[]>(this.turnReportPath),
      this.getParkLocomotives(),
      this.getIdealNormLookup(),
    ]);

    const corridors = Array.from(
      new Set(trains.map((item) => item.corridor).filter((item): item is string => Boolean(item))),
    ).sort((a, b) => a.localeCompare(b, 'ru'));

    const filtered = trains.filter((item) => {
      if (corridor && item.corridor !== corridor) return false;
      if (trainNumber && !item.trainNumber.includes(trainNumber)) return false;
      return true;
    });

    const visibleTrainNumbers = new Set(filtered.map((item) => item.trainNumber));
    const relatedBindingsAll = bindings
      .filter((item) => {
        if (typeof day === 'number' && item.day !== day) return false;
        return (
          (item.arrivalTrainNumber && visibleTrainNumbers.has(item.arrivalTrainNumber)) ||
          (item.departureTrainNumber && visibleTrainNumbers.has(item.departureTrainNumber))
        );
      })
      .map((item) => ({
        ...item,
        arrivalOffsetMinutes: item.arrivalTime ? this.toServiceOffsetMinutes(item.arrivalTime) : null,
        departureOffsetMinutes: item.departureTime ? this.toServiceOffsetMinutes(item.departureTime) : null,
      }));

    const relatedTurnaroundsAll = turnarounds
      .filter((item) => {
        if (typeof day === 'number' && item.day !== day) return false;
        return (
          (item.arrivalTrainNumber && visibleTrainNumbers.has(item.arrivalTrainNumber)) ||
          (item.departureTrainNumber && visibleTrainNumbers.has(item.departureTrainNumber))
        );
      })
      .map((item) => ({
        ...item,
        arrivalAstanaOffsetMinutes: item.arrivalAstanaTime ? this.toServiceOffsetMinutes(item.arrivalAstanaTime) : null,
        departureAstanaOffsetMinutes: item.departureAstanaTime ? this.toServiceOffsetMinutes(item.departureAstanaTime) : null,
      }));

    const relatedBindings = relatedBindingsAll.slice(0, 200);
    const relatedTurnarounds = relatedTurnaroundsAll.slice(0, 120);

    const days = Array.from(new Set(bindings.map((item) => item.day))).sort((a, b) => a - b);
    const routePairs = this.buildRoutePairs(filtered);
    const stopOperations = this.buildStopOperations(filtered, relatedBindings, relatedTurnarounds);
    const locomotiveTable = buildLocomotiveTableRows({
      bindings: relatedBindingsAll,
      turnarounds: relatedTurnaroundsAll,
      windows: filtered.length ? filtered : trains,
      idealNormLookup,
      parkLocomotives,
    });

    return {
      summary,
      serviceDayStart: '20:00',
      corridors,
      days,
      selectedDay: typeof day === 'number' ? day : null,
      stations: this.buildStationOrder(filtered.length ? filtered : trains),
      trains: filtered,
      bindings: relatedBindings,
      turnarounds: relatedTurnarounds,
      routePairs,
      stopOperations,
      locomotiveTable,
      total: filtered.length,
    };
  }

  private buildStationOrder(trains: NodeTrainWindow[]) {
    const stationMap = new Map<string, { name: string; distanceKm: number | null; order: number }>();

    trains.forEach((train) => {
      train.windowStops.forEach((stop, index) => {
        const existing = stationMap.get(stop.station);
        const candidateDistance = stop.distanceKm ?? null;

        if (!existing) {
          stationMap.set(stop.station, {
            name: stop.station,
            distanceKm: candidateDistance,
            order: index,
          });
          return;
        }

        if (existing.distanceKm === null && candidateDistance !== null) {
          existing.distanceKm = candidateDistance;
        }
        existing.order = Math.min(existing.order, index);
      });
    });

    return Array.from(stationMap.values()).sort((a, b) => {
      if (a.distanceKm !== null && b.distanceKm !== null) {
        return a.distanceKm - b.distanceKm;
      }
      if (a.distanceKm !== null) return -1;
      if (b.distanceKm !== null) return 1;
      return a.order - b.order;
    });
  }

  private async readJson<T>(filePath: string): Promise<T> {
    try {
      const content = await readFile(filePath, 'utf8');
      return JSON.parse(content) as T;
    } catch {
      throw new NotFoundException(`Derived gitural data not found: ${filePath}`);
    }
  }

  private async getParkLocomotives() {
    if (!this.parsedParkPromise) {
      this.parsedParkPromise = Promise.resolve(parseParkWorkbook(this.parkPath, this.loadXlsx()));
    }
    return this.parsedParkPromise;
  }

  private async getIdealNormLookup() {
    if (!this.idealNormLookupPromise) {
      this.idealNormLookupPromise = Promise.resolve(
        loadIdealNormLookup(this.idealBindingsPath, this.loadXlsx()),
      );
    }
    return this.idealNormLookupPromise;
  }

  private loadXlsx() {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('xlsx');
  }

  private toServiceOffsetMinutes(time: string): number {
    const [hh, mm] = time.split(':').map(Number);
    const absolute = hh * 60 + mm;
    const serviceStart = 20 * 60;
    return absolute >= serviceStart ? absolute - serviceStart : absolute + 24 * 60 - serviceStart;
  }

  private buildRoutePairs(trains: NodeTrainWindow[]): RoutePairSummary[] {
    const pairMap = new Map<string, RoutePairSummary>();

    trains.forEach((train) => {
      const pairKey = this.extractPairKey(train.sheetName, train.trainNumber);
      const existing = pairMap.get(pairKey) ?? {
        pairKey,
        trainNumbers: [],
        routes: [],
        corridors: [],
        trainsCount: 0,
      };

      if (!existing.trainNumbers.includes(train.trainNumber)) {
        existing.trainNumbers.push(train.trainNumber);
      }
      if (train.routeName && !existing.routes.includes(train.routeName)) {
        existing.routes.push(train.routeName);
      }
      if (train.corridor && !existing.corridors.includes(train.corridor)) {
        existing.corridors.push(train.corridor);
      }
      existing.trainsCount += 1;
      pairMap.set(pairKey, existing);
    });

    return Array.from(pairMap.values()).sort((a, b) => a.pairKey.localeCompare(b.pairKey, 'ru'));
  }

  private extractPairKey(sheetName: string, trainNumber: string): string {
    const match = sheetName.match(/(\d{1,4})\s*-\s*(\d{1,4})/);
    if (match) {
      return `${match[1].padStart(3, '0')}/${match[2].padStart(3, '0')}`;
    }
    return trainNumber;
  }

  private buildStopOperations(
    trains: NodeTrainWindow[],
    bindings: Array<BindingEvent & { arrivalOffsetMinutes: number | null; departureOffsetMinutes: number | null }>,
    turnarounds: Array<TurnaroundRecord & { arrivalAstanaOffsetMinutes: number | null; departureAstanaOffsetMinutes: number | null }>,
  ): StopOperation[] {
    const operations: StopOperation[] = [];

    for (const train of trains) {
      for (const stop of train.windowStops) {
        const stopTimes = [stop.arrivalOffsetMinutes, stop.departureOffsetMinutes].filter(
          (value): value is number => typeof value === 'number',
        );
        if (!stopTimes.length) continue;

        const matchingBinding = bindings.find((item) => {
          const sameArrivalTrain = item.arrivalTrainNumber === train.trainNumber;
          const sameDepartureTrain = item.departureTrainNumber === train.trainNumber;
          if (!sameArrivalTrain && !sameDepartureTrain) return false;
          const targetOffset =
            sameArrivalTrain ? item.arrivalOffsetMinutes : item.departureOffsetMinutes;
          if (typeof targetOffset !== 'number') return false;
          return stopTimes.some((time) => Math.abs(time - targetOffset) <= 15);
        });

        if (matchingBinding) {
          operations.push({
            trainNumber: train.trainNumber,
            station: stop.station,
            stationTime: stop.arrivalRaw ?? stop.departureRaw,
            stationOffsetMinutes: stop.arrivalOffsetMinutes ?? stop.departureOffsetMinutes,
            type: 'LOCO_CHANGE',
            label: 'ЛОКО',
            details: `${matchingBinding.sheetName}${matchingBinding.depot ? ` / ${matchingBinding.depot}` : ''}`,
          });
        }

        const matchingTurnaround = turnarounds.find((item) => {
          const sameArrivalTrain = item.arrivalTrainNumber === train.trainNumber;
          const sameDepartureTrain = item.departureTrainNumber === train.trainNumber;
          if (!sameArrivalTrain && !sameDepartureTrain) return false;
          const targetOffset =
            sameArrivalTrain ? item.arrivalAstanaOffsetMinutes : item.departureAstanaOffsetMinutes;
          if (typeof targetOffset !== 'number') return false;
          return stopTimes.some((time) => Math.abs(time - targetOffset) <= 30);
        });

        if (matchingTurnaround) {
          operations.push({
            trainNumber: train.trainNumber,
            station: stop.station,
            stationTime: stop.arrivalRaw ?? stop.departureRaw,
            stationOffsetMinutes: stop.arrivalOffsetMinutes ?? stop.departureOffsetMinutes,
            type: 'TURNAROUND',
            label: 'ОБОРОТ',
            details: `${matchingTurnaround.arrivalTrainNumber ?? '—'}→${matchingTurnaround.departureTrainNumber ?? '—'}`,
          });
        }
      }
    }

    return operations;
  }
}
