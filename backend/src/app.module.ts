import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AdminModule } from './modules/admin/admin.module';
import { NodeModule } from './modules/node/node.module';
import { ScheduleModule } from './modules/schedule/schedule.module';
import { EventsModule } from './modules/events/events.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { SchedulingModule } from './modules/scheduling/scheduling.module';

@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
        AdminModule,
        NodeModule,
        ScheduleModule,
        EventsModule,
        AnalyticsModule,
        SchedulingModule,
    ],
})
export class AppModule { }
