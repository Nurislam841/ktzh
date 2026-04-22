import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { PassengerBindingOperationsService } from './passenger-binding-operations.service';
import { PassengerDemoBindingsService } from './passenger-demo-bindings.service';
import { PassengerTimetableController } from './passenger-timetable.controller';
import { PassengerTimetableService } from './passenger-timetable.service';
import { PassengerTimetableSyncService } from './passenger-timetable-sync.service';

@Module({
  imports: [PrismaModule],
  controllers: [PassengerTimetableController],
  providers: [
    PassengerTimetableService,
    PassengerTimetableSyncService,
    PassengerBindingOperationsService,
    PassengerDemoBindingsService,
  ],
  exports: [
    PassengerTimetableService,
    PassengerTimetableSyncService,
    PassengerBindingOperationsService,
    PassengerDemoBindingsService,
  ],
})
export class PassengerTimetableModule {}
