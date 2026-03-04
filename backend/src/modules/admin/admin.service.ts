import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SchedulingService } from '../scheduling/scheduling.service';
import { ImportDataService } from '../import-data/import-data.service';
const addHours = (d: Date, h: number) => new Date(d.getTime() + h * 3_600_000);
const addMinutes = (d: Date, m: number) => new Date(d.getTime() + m * 60_000);
const subHours = (d: Date, h: number) => new Date(d.getTime() - h * 3_600_000);

@Injectable()
export class AdminService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly scheduling: SchedulingService,
        private readonly importDataService: ImportDataService,
    ) { }

    private ensureToken(adminToken: string) {
        const expectedToken = process.env.ADMIN_TOKEN ?? 'super-secret-admin-token-change-me';
        if (adminToken !== expectedToken) throw new UnauthorizedException('Неверный токен администратора');
    }

    async seed(
        adminToken: string,
        options?: {
            tracks?: number;
            locomotives?: number;
            crews?: number;
            trainRuns?: number;
            windowHours?: number;
        },
    ) {
        this.ensureToken(adminToken);

        const tracksCount = options?.tracks ?? 8;
        const locomotivesCount = options?.locomotives ?? 24;
        const crewsCount = options?.crews ?? 36;
        const trainRunsCount = options?.trainRuns ?? 60;
        const windowHours = options?.windowHours ?? 6;
        const windowMinutes = Math.max(60, windowHours * 60);

        // Clear existing data for idempotency
        await this.prisma.auditLog.deleteMany();
        await this.prisma.allocation.deleteMany();
        await this.prisma.scheduleVersion.deleteMany();
        await this.prisma.operationalEvent.deleteMany();
        await this.prisma.trainRun.deleteMany();
        await this.prisma.train.deleteMany();
        await this.prisma.locomotive.deleteMany();
        await this.prisma.crew.deleteMany();
        await this.prisma.track.deleteMany();
        await this.prisma.depot.deleteMany();
        await this.prisma.station.deleteMany();

        // 1. Create Station
        const station = await this.prisma.station.create({
            data: { name: 'Алматы-1', code: 'ALA1' },
        });

        // 2. Create 6 Tracks
        const tracks = await Promise.all(
            Array.from({ length: tracksCount }, (_, i) =>
                this.prisma.track.create({
                    data: {
                        stationId: station.id,
                        name: `Путь ${i + 1}`,
                        status: 'FREE',
                    },
                }),
            ),
        );

        // 3. Create Depot
        const depot = await this.prisma.depot.create({
            data: { name: 'Алматинское депо' },
        });

        const now = new Date();

        // 4. Create 10 Locomotives
        const locomotives = await Promise.all(
            Array.from({ length: locomotivesCount }, (_, i) =>
                this.prisma.locomotive.create({
                    data: {
                        series: i % 2 === 0 ? 'VL80' : 'TE116',
                        number: `${100 + i}`,
                        depotId: depot.id,
                        locationStationId: station.id,
                        status: 'AVAILABLE',
                        availableFrom: subHours(now, 2), // available 2h ago → definitely usable
                    },
                }),
            ),
        );

        // 5. Create 20 Crews
        const crews = await Promise.all(
            Array.from({ length: crewsCount }, (_, i) =>
                this.prisma.crew.create({
                    data: {
                        depotId: depot.id,
                        status: 'AVAILABLE',
                        availableFrom: subHours(now, 3), // available 3h ago
                        requiredNoticeMinutes: 120,
                    },
                }),
            ),
        );

        // 6. Create 30 TrainRuns in next 6h window
        // Mix of PASSENGER / FREIGHT / OTHER priorities
        const priorities = ['PASSENGER', 'FREIGHT', 'OTHER'] as const;

        const destinationStation = await this.prisma.station.create({
            data: { name: 'Астана', code: 'NQZ' },
        });

        const trainRuns = [];
        for (let i = 0; i < trainRunsCount; i++) {
            const priority = priorities[i % 3];
            const train = await this.prisma.train.create({
                data: {
                    number: `${700 + i}`,
                    priority,
                },
            });

            // Spread departures across planning window
            const depOffset = (i * 12) % windowMinutes;
            const scheduledDeparture = addMinutes(now, depOffset);
            const scheduledArrival = addMinutes(scheduledDeparture, 45 + (i % 3) * 15);

            const run = await this.prisma.trainRun.create({
                data: {
                    trainId: train.id,
                    originStationId: station.id,
                    destinationStationId: destinationStation.id,
                    scheduledDeparture,
                    scheduledArrival,
                    currentDelayMinutes: i % 5 === 0 ? 10 : 0, // some trains already delayed
                    status: 'PLANNED',
                },
            });
            trainRuns.push(run);
        }

        // 7. Run initial scheduler to create first ScheduleVersion
        const { versionId, summary } = await this.scheduling.runRescheduler(
            station.id,
            'Начальный план',
            null,
        );

        return {
            message: 'Демо-данные заполнены',
            stationId: station.id,
            initialVersionId: versionId,
            summary,
            stats: {
                tracks: tracks.length,
                locomotives: locomotives.length,
                crews: crews.length,
                trainRuns: trainRuns.length,
                windowHours,
            },
        };
    }

    async importData(adminToken: string, dataDir?: string) {
        this.ensureToken(adminToken);
        const imported = await this.importDataService.importAll(dataDir);
        return {
            message: 'Импорт данных завершен',
            imported,
        };
    }

    async bootstrapOperationalData(adminToken: string) {
        this.ensureToken(adminToken);
        const bootstrapped = await this.importDataService.bootstrapOperationalData();
        return {
            message: 'Операционные данные подготовлены',
            bootstrapped,
        };
    }

    async importAndBootstrap(adminToken: string, dataDir?: string) {
        this.ensureToken(adminToken);
        const imported = await this.importDataService.importAll(dataDir);
        const bootstrapped = await this.importDataService.bootstrapOperationalData();
        return {
            message: 'Импорт и подготовка завершены',
            imported,
            bootstrapped,
        };
    }
}
