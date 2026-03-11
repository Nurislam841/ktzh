import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AdminModule } from './modules/admin/admin.module';
import { NodeModule } from './modules/node/node.module';
import { ScheduleModule } from './modules/schedule/schedule.module';
import { EventsModule } from './modules/events/events.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { SchedulingModule } from './modules/scheduling/scheduling.module';
import { ImportDataModule } from './modules/import-data/import-data.module';
import { ConflictDetectionModule } from './modules/conflict-detection/conflict-detection.module';
import { MdmModule } from './modules/mdm/mdm.module';
import { BindingModule } from './modules/binding/binding.module';
import { BindingImportModule } from './modules/binding-import/binding-import.module';
import { BindingConflictModule } from './modules/binding-conflict/binding-conflict.module';
import { BindingAnalyticsModule } from './modules/binding-analytics/binding-analytics.module';
import { OptimizerModule } from './modules/optimizer/optimizer.module';
import { LocomotiveStateModule } from './modules/locomotive-state/locomotive-state.module';
import { GisModule } from './modules/gis/gis.module';
import { CrewCallModule } from './modules/crew-call/crew-call.module';

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
        ImportDataModule,
        ConflictDetectionModule,
        // Binding domain modules
        MdmModule,
        BindingModule,
        BindingImportModule,
        BindingConflictModule,
        BindingAnalyticsModule,
        OptimizerModule,
        LocomotiveStateModule,
        GisModule,
        CrewCallModule,
    ],
})
export class AppModule { }
