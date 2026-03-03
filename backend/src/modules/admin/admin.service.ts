import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SchedulingService } from '../scheduling/scheduling.service';
const addHours = (d: Date, h: number) => new Date(d.getTime() + h * 3_600_000);
const addMinutes = (d: Date, m: number) => new Date(d.getTime() + m * 60_000);
const subHours = (d: Date, h: number) => new Date(d.getTime() - h * 3_600_000);

@Injectable()
export class AdminService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly scheduling: SchedulingService,
    ) { }

    async seed(adminToken: string) {
        const expectedToken = process.env.ADMIN_TOKEN ?? 'super-secret-admin-token-change-me';
        if (adminToken !== expectedToken) {
            throw new UnauthorizedException('Invalid admin token');
        }

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
            data: { name: 'Almaty-1', code: 'ALA1' },
        });

        // 2. Create 6 Tracks
        const tracks = await Promise.all(
            Array.from({ length: 6 }, (_, i) =>
                this.prisma.track.create({
                    data: {
                        stationId: station.id,
                        name: `Track ${i + 1}`,
                        status: 'FREE',
                    },
                }),
            ),
        );

        // 3. Create Depot
        const depot = await this.prisma.depot.create({
            data: { name: 'Almaty Depot' },
        });

        const now = new Date();

        // 4. Create 10 Locomotives
        const locomotives = await Promise.all(
            Array.from({ length: 10 }, (_, i) =>
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
            Array.from({ length: 20 }, (_, i) =>
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
            data: { name: 'Astana', code: 'NQZ' },
        });

        const trainRuns = [];
        for (let i = 0; i < 30; i++) {
            const priority = priorities[i % 3];
            const train = await this.prisma.train.create({
                data: {
                    number: `${700 + i}`,
                    priority,
                },
            });

            // Spread departures across 0–6h from now
            const depOffset = (i * 12) % 360; // 0 to 348 minutes
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
            'Initial plan',
            null,
        );

        return {
            message: 'Seed complete',
            stationId: station.id,
            initialVersionId: versionId,
            summary,
            stats: {
                tracks: tracks.length,
                locomotives: locomotives.length,
                crews: crews.length,
                trainRuns: trainRuns.length,
            },
        };
    }
}
