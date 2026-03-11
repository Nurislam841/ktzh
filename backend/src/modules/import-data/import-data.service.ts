import { Injectable, Logger } from '@nestjs/common';
import { LocomotiveStatus, Prisma, TrainPriority } from '@prisma/client';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { PrismaService } from '../../prisma/prisma.service';
import { SchedulingService } from '../scheduling/scheduling.service';

type ExcelRow = Record<string, string>;
type SheetRow = { sheet: string; row: ExcelRow };

type CategorizedFiles = {
    fleet: string[];
    trainListDocx: string[];
    schedules: string[];
    serviceSegments: string[];
    refuelingPoints: string[];
    ignored: string[];
};

@Injectable()
export class ImportDataService {
    private readonly logger = new Logger(ImportDataService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly scheduling: SchedulingService,
    ) { }

    async importAll(dataDir = path.resolve(process.cwd(), 'data')) {
        const dataExists = await this.pathExists(dataDir);
        if (!dataExists) {
            throw new Error(`Каталог с данными не найден: ${dataDir}`);
        }

        const files = await this.collectFiles(dataDir);
        const categorized = this.categorizeFiles(files);

        await this.prisma.$transaction([
            this.prisma.schedule.deleteMany(),
            this.prisma.serviceSegment.deleteMany(),
            this.prisma.refuelingPoint.deleteMany(),
        ]);

        const locomotivesImported = await this.importLocomotives(categorized.fleet);
        const trainsImported = await this.importTrainsFromDocx(categorized.trainListDocx);
        const schedulesImported = await this.importSchedules(categorized.schedules);
        const serviceSegmentsImported = await this.importServiceSegments(categorized.serviceSegments);
        const refuelingPointsImported = await this.importRefuelingPoints(categorized.refuelingPoints);

        return {
            dataDir,
            filesScanned: files.length,
            categorized: {
                fleet: categorized.fleet.length,
                trainListDocx: categorized.trainListDocx.length,
                schedules: categorized.schedules.length,
                serviceSegments: categorized.serviceSegments.length,
                refuelingPoints: categorized.refuelingPoints.length,
                ignored: categorized.ignored.length,
            },
            imported: {
                locomotives: locomotivesImported,
                trains: trainsImported,
                schedules: schedulesImported,
                serviceSegments: serviceSegmentsImported,
                refuelingPoints: refuelingPointsImported,
            },
        };
    }

    async bootstrapOperationalData() {
        await this.prisma.$transaction([
            this.prisma.allocation.deleteMany(),
            this.prisma.scheduleVersion.deleteMany(),
            this.prisma.operationalEvent.deleteMany(),
            this.prisma.auditLog.deleteMany(),
            this.prisma.trainRun.deleteMany(),
            this.prisma.track.deleteMany(),
            this.prisma.crew.deleteMany(),
        ]);

        const stations = await this.ensureStationsFromRefuelingPoints();
        const tracksCreated = await this.createTracksForStations(stations.map((s) => s.id));
        const crewsCreated = await this.createCrewsForDepots();
        const trainRunsCreated = await this.createTrainRuns(stations);
        const versions = await this.createInitialScheduleVersions();

        return {
            stations: stations.length,
            tracksCreated,
            crewsCreated,
            trainRunsCreated,
            scheduleVersionsCreated: versions,
        };
    }

    private async importLocomotives(files: string[]): Promise<number> {
        if (!files.length) return 0;

        const existingLocos = await this.prisma.locomotive.findMany({
            select: { id: true, series: true, number: true },
        });
        const locoByKey = new Map(
            existingLocos.map((l) => [this.locomotiveKey(l.series, l.number), l.id]),
        );

        const depotCache = new Map<string, string>();
        const stationCache = new Map<string, string>();
        let imported = 0;

        for (const filePath of files) {
            const rows = await this.readExcelRows(filePath);
            for (const { row } of rows) {
                const series = this.cleanValue(
                    this.pickValue(row, ['серия', 'series', 'типлок', 'локомотив']),
                );
                const number = this.cleanValue(
                    this.pickValue(row, ['номер', 'number', 'num']),
                );

                if (!series && !number) continue;
                if (!number) continue;

                const depotName =
                    this.cleanValue(this.pickValue(row, ['депо', 'приписк', 'depot'])) ||
                    'Импортированное депо';
                const locationName = this.cleanValue(
                    this.pickValue(row, ['станц', 'дислокац', 'место', 'location']),
                );
                const statusText = this.cleanValue(
                    this.pickValue(row, ['статус', 'состояни', 'status']),
                );

                const seriesNormalized = series || 'UNKNOWN';
                const numberNormalized = number.replace(/\s+/g, '');
                const depotId = await this.ensureDepot(depotName, depotCache);
                const stationId = locationName
                    ? await this.ensureStation(locationName, stationCache)
                    : null;

                const key = this.locomotiveKey(seriesNormalized, numberNormalized);
                const existingId = locoByKey.get(key);
                const status = this.mapLocomotiveStatus(statusText);

                if (existingId) {
                    await this.prisma.locomotive.update({
                        where: { id: existingId },
                        data: {
                            depotId,
                            locationStationId: stationId,
                            status,
                        },
                    });
                } else {
                    const created = await this.prisma.locomotive.create({
                        data: {
                            series: seriesNormalized,
                            number: numberNormalized,
                            depotId,
                            locationStationId: stationId,
                            status,
                            availableFrom: new Date(),
                        },
                    });
                    locoByKey.set(key, created.id);
                }

                imported++;
            }
        }

        return imported;
    }

    private async importTrainsFromDocx(files: string[]): Promise<number> {
        if (!files.length) return 0;
        const mammoth = this.loadMammoth();
        let imported = 0;

        for (const filePath of files) {
            const result = await mammoth.extractRawText({ path: filePath });
            const lines = result.value
                .split('\n')
                .map((line: string) => line.trim())
                .filter((line: string) => line.length > 0);

            for (const line of lines) {
                const parsed = this.parseTrainLine(line);
                if (!parsed) continue;

                const existing = await this.prisma.train.findUnique({
                    where: { number: parsed.number },
                    select: {
                        id: true,
                        route: true,
                        frequency: true,
                        wagons: true,
                        carrier: true,
                    },
                });

                if (existing) {
                    await this.prisma.train.update({
                        where: { id: existing.id },
                        data: {
                            route: parsed.route ?? existing.route,
                            frequency: parsed.frequency ?? existing.frequency,
                            wagons: parsed.wagons ?? existing.wagons,
                            carrier: parsed.carrier ?? existing.carrier,
                        },
                    });
                } else {
                    await this.prisma.train.create({
                        data: {
                            number: parsed.number,
                            route: parsed.route ?? null,
                            frequency: parsed.frequency ?? null,
                            wagons: parsed.wagons ?? null,
                            carrier: parsed.carrier ?? null,
                        },
                    });
                }

                imported++;
            }
        }

        return imported;
    }

    private async importSchedules(files: string[]): Promise<number> {
        if (!files.length) return 0;

        const trainRows = await this.prisma.train.findMany({
            select: { id: true, number: true },
        });
        const trainByNumber = new Map(trainRows.map((t) => [t.number, t.id]));

        const records: Prisma.ScheduleCreateManyInput[] = [];
        let imported = 0;

        for (const filePath of files) {
            const rows = await this.readExcelRows(filePath);
            const sourceFile = path.relative(path.resolve(process.cwd(), 'data'), filePath);
            const sourceGroup = this.detectSourceGroup(filePath);

            for (const { row, sheet } of rows) {
                const trainNumberRaw =
                    this.cleanValue(
                        this.pickValue(row, ['поезд', 'train', 'номерпоезда']),
                    ) || this.detectTrainNumberFromValues(row);
                if (!trainNumberRaw) continue;

                const trainNumber = this.normalizeTrainNumber(trainNumberRaw);
                if (!trainNumber) continue;

                const station =
                    this.cleanValue(
                        this.pickValue(row, ['станц', 'station', 'пункт']),
                    ) || this.detectStationFromValues(row);
                if (!station) continue;

                const arrivalRaw = this.cleanValue(
                    this.pickValue(row, ['приб', 'arrival', 'arr']),
                );
                const departureRaw = this.cleanValue(
                    this.pickValue(row, ['отпр', 'departure', 'dep']),
                );
                const operation = this.cleanValue(
                    this.pickValue(row, ['операц', 'operation', 'примеч']),
                );

                let trainId = trainByNumber.get(trainNumber);
                if (!trainId) {
                    const createdTrain = await this.prisma.train.create({
                        data: { number: trainNumber },
                        select: { id: true },
                    });
                    trainId = createdTrain.id;
                    trainByNumber.set(trainNumber, trainId);
                }

                records.push({
                    trainId,
                    trainNumber,
                    station,
                    arrival: this.parseDateValue(arrivalRaw),
                    departure: this.parseDateValue(departureRaw),
                    arrivalRaw: arrivalRaw || null,
                    departureRaw: departureRaw || null,
                    operation: operation || null,
                    sourceFile,
                    sourceSheet: sheet || null,
                    sourceGroup: sourceGroup || null,
                });
                imported++;
            }
        }

        if (records.length) {
            const chunkSize = 1000;
            for (let i = 0; i < records.length; i += chunkSize) {
                await this.prisma.schedule.createMany({
                    data: records.slice(i, i + chunkSize),
                });
            }
        }

        return imported;
    }

    private async importServiceSegments(files: string[]): Promise<number> {
        if (!files.length) return 0;
        const rowsToCreate: Prisma.ServiceSegmentCreateManyInput[] = [];
        const dedupe = new Set<string>();
        let imported = 0;

        for (const filePath of files) {
            const rows = await this.readExcelRows(filePath);
            const sourceFile = path.relative(path.resolve(process.cwd(), 'data'), filePath);
            for (const { row } of rows) {
                const locoSeries =
                    this.cleanValue(this.pickValue(row, ['серия', 'series'])) ||
                    this.valueByIndex(row, 0);
                const startStation =
                    this.cleanValue(this.pickValue(row, ['нач', 'отст', 'from', 'start'])) ||
                    this.valueByIndex(row, 1);
                const endStation =
                    this.cleanValue(this.pickValue(row, ['кон', 'дост', 'to', 'end'])) ||
                    this.valueByIndex(row, 2);

                if (!locoSeries || !startStation || !endStation) continue;

                const key = `${locoSeries}|${startStation}|${endStation}`;
                if (dedupe.has(key)) continue;
                dedupe.add(key);

                rowsToCreate.push({
                    locoSeries,
                    startStation,
                    endStation,
                    sourceFile,
                });
                imported++;
            }
        }

        if (rowsToCreate.length) {
            await this.prisma.serviceSegment.createMany({ data: rowsToCreate });
        }

        return imported;
    }

    private async importRefuelingPoints(files: string[]): Promise<number> {
        if (!files.length) return 0;
        let imported = 0;

        for (const filePath of files) {
            const rows = await this.readExcelRows(filePath);
            const sourceFile = path.relative(path.resolve(process.cwd(), 'data'), filePath);

            for (const { row } of rows) {
                const station =
                    this.cleanValue(this.pickValue(row, ['станц', 'station', 'пункт'])) ||
                    this.valueByIndex(row, 0);
                if (!station) continue;

                const fuel = this.parseBoolean(
                    this.pickValue(row, ['топлив', 'fuel', 'диз']),
                );
                const sand = this.parseBoolean(
                    this.pickValue(row, ['пес', 'sand']),
                );
                const water = this.parseBoolean(
                    this.pickValue(row, ['вод', 'water']),
                );
                const notes = this.cleanValue(
                    this.pickValue(row, ['примеч', 'коммент', 'note']),
                );

                await this.prisma.refuelingPoint.upsert({
                    where: { station },
                    update: {
                        fuel,
                        sand,
                        water,
                        notes: notes || null,
                        sourceFile,
                    },
                    create: {
                        station,
                        fuel,
                        sand,
                        water,
                        notes: notes || null,
                        sourceFile,
                    },
                });
                imported++;
            }
        }

        return imported;
    }

    private async ensureStationsFromRefuelingPoints() {
        const existingStations = await this.prisma.station.findMany({
            select: { id: true, name: true, code: true },
        });
        const byCanonical = new Map<string, { id: string; name: string }>();
        for (const station of existingStations) {
            byCanonical.set(this.canonicalStationName(station.name), {
                id: station.id,
                name: station.name,
            });
        }

        const refueling = await this.prisma.refuelingPoint.findMany({
            select: { station: true },
        });

        for (const point of refueling) {
            const canonical = this.canonicalStationName(point.station);
            if (!canonical || /^\d+$/.test(canonical)) continue;
            if (byCanonical.has(canonical)) continue;

            const created = await this.prisma.station.create({
                data: {
                    name: this.prettyStationName(canonical),
                    code: null,
                },
                select: { id: true, name: true },
            });
            byCanonical.set(canonical, created);
        }

        return this.prisma.station.findMany({
            orderBy: { name: 'asc' },
            select: { id: true, name: true },
        });
    }

    private async createTracksForStations(stationIds: string[]) {
        let created = 0;
        for (const stationId of stationIds) {
            for (let i = 1; i <= 4; i++) {
                await this.prisma.track.create({
                    data: {
                        stationId,
                        name: `Путь ${i}`,
                        status: 'FREE',
                    },
                });
                created++;
            }
        }
        return created;
    }

    private async createCrewsForDepots() {
        const depots = await this.prisma.depot.findMany({
            include: {
                locomotives: {
                    select: { id: true },
                },
            },
        });

        let created = 0;
        for (const depot of depots) {
            const locoCount = depot.locomotives.length;
            const crewsToCreate = Math.max(2, Math.ceil(locoCount / 2));

            for (let i = 0; i < crewsToCreate; i++) {
                await this.prisma.crew.create({
                    data: {
                        depotId: depot.id,
                        status: 'AVAILABLE',
                        availableFrom: new Date(Date.now() - 3 * 60 * 60_000),
                        requiredNoticeMinutes: 120,
                    },
                });
                created++;
            }
        }

        return created;
    }

    private async createTrainRuns(stations: { id: string; name: string }[]) {
        const trains = await this.prisma.train.findMany({
            orderBy: { number: 'asc' },
            select: { id: true, number: true, priority: true },
        });
        if (!trains.length || stations.length < 2) return 0;

        const stationCycle = stations.length;
        const now = new Date();
        let created = 0;

        for (let idx = 0; idx < trains.length; idx++) {
            const train = trains[idx];
            const origin = stations[idx % stationCycle];
            const destination = stations[(idx + 1) % stationCycle];

            const departure = new Date(now.getTime() + (idx % 72) * 5 * 60_000);
            const durationMinutes = 90 + (idx % 6) * 15;
            const arrival = new Date(departure.getTime() + durationMinutes * 60_000);

            const inferredPriority = this.inferPriority(train.number);
            await this.prisma.train.update({
                where: { id: train.id },
                data: { priority: inferredPriority },
            });

            await this.prisma.trainRun.create({
                data: {
                    trainId: train.id,
                    originStationId: origin.id,
                    destinationStationId: destination.id,
                    scheduledDeparture: departure,
                    scheduledArrival: arrival,
                    currentDelayMinutes: 0,
                    status: 'PLANNED',
                    operationScenario: idx % 5 === 0 ? 'FORMATION' : 'TRANSIT',
                    requiresCrewChange: true,
                    requiresLocoChange: idx % 5 === 0,
                },
            });
            created++;
        }

        return created;
    }

    private async createInitialScheduleVersions() {
        const stationsWithRuns = await this.prisma.station.findMany({
            where: {
                trainRunsOrigin: { some: {} },
            },
            select: { id: true },
        });

        let created = 0;
        for (const station of stationsWithRuns) {
            const hasLocomotive = await this.prisma.locomotive.count({
                where: { locationStationId: station.id, status: 'AVAILABLE' },
            });
            if (!hasLocomotive) continue;

            await this.scheduling.runRescheduler(
                station.id,
                'Инициализация графика из импортированных данных',
                null,
            );
            created++;
        }

        return created;
    }

    private async collectFiles(rootDir: string): Promise<string[]> {
        const output: string[] = [];
        const stack = [rootDir];

        while (stack.length) {
            const current = stack.pop()!;
            const entries = await fs.readdir(current, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(current, entry.name);
                if (entry.isDirectory()) {
                    stack.push(fullPath);
                } else if (entry.isFile()) {
                    output.push(fullPath);
                }
            }
        }

        return output;
    }

    private categorizeFiles(files: string[]): CategorizedFiles {
        const categorized: CategorizedFiles = {
            fleet: [],
            trainListDocx: [],
            schedules: [],
            serviceSegments: [],
            refuelingPoints: [],
            ignored: [],
        };

        for (const filePath of files) {
            const ext = path.extname(filePath).toLowerCase();
            const normalized = this.normalizeText(filePath);
            const isExcel = ext === '.xlsx' || ext === '.xls';

            if (isExcel && normalized.includes('паркктжпл')) {
                categorized.fleet.push(filePath);
                continue;
            }

            if (ext === '.docx' && normalized.includes('переченьпоездов')) {
                categorized.trainListDocx.push(filePath);
                continue;
            }

            if (isExcel && normalized.includes('плечиобслуживания')) {
                categorized.serviceSegments.push(filePath);
                continue;
            }

            if (
                isExcel &&
                (normalized.includes('пунктыэкипировок') ||
                    normalized.includes('экипировкалокомотивовпеском'))
            ) {
                categorized.refuelingPoints.push(filePath);
                continue;
            }

            if (isExcel && normalized.includes('подвязки')) {
                categorized.schedules.push(filePath);
                continue;
            }

            categorized.ignored.push(filePath);
        }

        return categorized;
    }

    private async readExcelRows(filePath: string): Promise<SheetRow[]> {
        const xlsx = this.loadXlsx();
        const workbook = xlsx.readFile(filePath, { cellDates: true });
        const output: SheetRow[] = [];

        for (const sheetName of workbook.SheetNames) {
            const sheet = workbook.Sheets[sheetName];
            const rows: any[][] = xlsx.utils.sheet_to_json(sheet, {
                header: 1,
                raw: false,
                defval: '',
            });
            if (!rows.length) continue;

            const headerIndex = this.findHeaderIndex(rows);
            const headers = this.buildHeaders(rows[headerIndex] ?? []);

            for (let i = headerIndex + 1; i < rows.length; i++) {
                const rawRow = rows[i] ?? [];
                const record: ExcelRow = {};
                let nonEmpty = 0;

                headers.forEach((header, colIndex) => {
                    const value = this.cleanValue(String(rawRow[colIndex] ?? ''));
                    record[header] = value;
                    if (value) nonEmpty++;
                });

                if (nonEmpty === 0) continue;
                output.push({ sheet: sheetName, row: record });
            }
        }

        return output;
    }

    private buildHeaders(headerRow: any[]): string[] {
        const used = new Map<string, number>();
        return headerRow.map((raw, idx) => {
            const cleaned = this.cleanValue(String(raw ?? ''));
            const base = cleaned || `col_${idx + 1}`;
            const count = (used.get(base) ?? 0) + 1;
            used.set(base, count);
            return count === 1 ? base : `${base}_${count}`;
        });
    }

    private findHeaderIndex(rows: any[][]): number {
        const limit = Math.min(rows.length, 20);
        for (let i = 0; i < limit; i++) {
            const row = rows[i] ?? [];
            const nonEmpty = row
                .map((cell) => this.cleanValue(String(cell ?? '')))
                .filter(Boolean);
            if (nonEmpty.length >= 2 && nonEmpty.some((value) => /[A-Za-zА-Яа-я]/.test(value))) {
                return i;
            }
        }
        return 0;
    }

    private parseTrainLine(line: string): {
        number: string;
        route?: string;
        frequency?: string;
        wagons?: number;
        carrier?: string;
    } | null {
        const startsWithNumber = line.match(/^\s*№?\s*(\d{2,5}[A-Za-zА-Яа-я]?)/);
        const inLineNumber = line.match(/№\s*(\d{2,5}[A-Za-zА-Яа-я]?)/i);
        const hasTrainKeyword = /поезд|поезда|train/i.test(line);
        const number = startsWithNumber?.[1] ?? (hasTrainKeyword ? inLineNumber?.[1] : undefined);
        if (!number) return null;

        const route = line.match(/([A-Za-zА-Яа-я0-9().\s]+-\s*[A-Za-zА-Яа-я0-9().\s]+)/)?.[1]?.trim();

        let frequency: string | undefined;
        const normalizedLine = this.normalizeText(line);
        if (normalizedLine.includes('ежеднев')) frequency = 'DAILY';
        else if (normalizedLine.includes('нечет')) frequency = 'ODD_DAYS';
        else if (normalizedLine.includes('чет')) frequency = 'EVEN_DAYS';

        const wagonsRaw = line.match(/(\d{1,2})\s*вагон/i)?.[1];
        const wagons = wagonsRaw ? parseInt(wagonsRaw, 10) : undefined;

        let carrier: string | undefined;
        if (/ктж|kazakhstan\s*temir/i.test(line)) carrier = 'KTZ';

        return {
            number: this.normalizeTrainNumber(number),
            route,
            frequency,
            wagons,
            carrier,
        };
    }

    private pickValue(row: ExcelRow, normalizedTokens: string[]): string {
        for (const [key, value] of Object.entries(row)) {
            if (!value) continue;
            const normalizedKey = this.normalizeText(key);
            if (normalizedTokens.some((token) => normalizedKey.includes(token))) {
                return value;
            }
        }
        return '';
    }

    private valueByIndex(row: ExcelRow, idx: number): string {
        return this.cleanValue(Object.values(row)[idx] ?? '');
    }

    private detectTrainNumberFromValues(row: ExcelRow): string {
        for (const value of Object.values(row)) {
            const cleaned = this.cleanValue(value);
            if (!cleaned) continue;
            const match = cleaned.match(/(?:^|[^\d])(\d{2,5}[A-Za-zА-Яа-я]?)(?:[^\d]|$)/);
            if (match?.[1]) return match[1];
        }
        return '';
    }

    private detectStationFromValues(row: ExcelRow): string {
        const values = Object.values(row)
            .map((value) => this.cleanValue(value))
            .filter(Boolean);
        for (const value of values) {
            if (/\d/.test(value)) continue;
            if (value.length < 3) continue;
            return value;
        }
        return '';
    }

    private parseBoolean(value: string): boolean | null {
        const normalized = this.normalizeText(value);
        if (!normalized) return null;
        if (['1', 'true', 'yes', 'да', 'есть', '+', 'y'].includes(normalized)) return true;
        if (['0', 'false', 'no', 'нет', 'n', '-', 'x'].includes(normalized)) return false;
        return null;
    }

    private parseDateValue(value: string): Date | null {
        const cleaned = this.cleanValue(value);
        if (!cleaned) return null;

        const parsed = new Date(cleaned);
        if (!Number.isNaN(parsed.getTime())) return parsed;
        return null;
    }

    private detectSourceGroup(filePath: string): string {
        const normalized = this.normalizeText(filePath);
        if (normalized.includes('20252026')) return '2025-2026';
        if (normalized.includes('20242025')) return '2024-2025';
        return '';
    }

    private mapLocomotiveStatus(value: string): LocomotiveStatus {
        const normalized = this.normalizeText(value);
        if (!normalized) return LocomotiveStatus.AVAILABLE;
        if (normalized.includes('ремонт') || normalized.includes('maintenance')) {
            return LocomotiveStatus.MAINTENANCE;
        }
        if (normalized.includes('авар') || normalized.includes('failed')) {
            return LocomotiveStatus.MAINTENANCE;
        }
        if (normalized.includes('впути') || normalized.includes('enroute')) {
            return LocomotiveStatus.IN_TRANSIT;
        }
        return LocomotiveStatus.AVAILABLE;
    }

    private inferPriority(trainNumber: string): TrainPriority {
        const numeric = parseInt(trainNumber.replace(/\D+/g, ''), 10);
        if (!Number.isNaN(numeric)) {
            if (numeric >= 1 && numeric <= 999) return TrainPriority.PASSENGER;
            if (numeric >= 1000) return TrainPriority.FREIGHT;
        }
        return TrainPriority.OTHER;
    }

    private canonicalStationName(value: string): string {
        return this.cleanValue(value)
            .toLowerCase()
            .replace(/^ст[.\s-]*/i, '')
            .replace(/[^\p{L}\p{N}\s-]/gu, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    private prettyStationName(canonical: string): string {
        return canonical
            .split(' ')
            .filter(Boolean)
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join(' ');
    }

    private async ensureDepot(name: string, cache: Map<string, string>) {
        const key = this.normalizeText(name);
        if (cache.has(key)) return cache.get(key)!;

        const existing = await this.prisma.depot.findFirst({ where: { name } });
        if (existing) {
            cache.set(key, existing.id);
            return existing.id;
        }

        const created = await this.prisma.depot.create({ data: { name } });
        cache.set(key, created.id);
        return created.id;
    }

    private async ensureStation(name: string, cache: Map<string, string>) {
        const key = this.normalizeText(name);
        if (cache.has(key)) return cache.get(key)!;

        const existing = await this.prisma.station.findFirst({ where: { name } });
        if (existing) {
            cache.set(key, existing.id);
            return existing.id;
        }

        const created = await this.prisma.station.create({
            data: {
                name,
                code: null,
            },
        });
        cache.set(key, created.id);
        return created.id;
    }

    private locomotiveKey(series: string, number: string) {
        return `${series.toUpperCase()}::${number.toUpperCase()}`;
    }

    private normalizeTrainNumber(value: string): string {
        return this.cleanValue(value).replace(/^№\s*/i, '').replace(/\s+/g, '');
    }

    private cleanValue(value: string): string {
        return String(value ?? '').replace(/\s+/g, ' ').trim();
    }

    private normalizeText(value: string): string {
        return this.cleanValue(value)
            .toLowerCase()
            .replace(/№/g, 'номер')
            .replace(/[^a-z0-9а-я]+/gi, '');
    }

    private async pathExists(targetPath: string) {
        try {
            await fs.access(targetPath);
            return true;
        } catch {
            return false;
        }
    }

    private loadXlsx() {
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            return require('xlsx');
        } catch (error) {
            this.logger.error(
                'Package "xlsx" is required for import:data. Run npm install in backend.',
            );
            throw error;
        }
    }

    private loadMammoth() {
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            return require('mammoth');
        } catch (error) {
            this.logger.error(
                'Package "mammoth" is required for import:data. Run npm install in backend.',
            );
            throw error;
        }
    }
}
