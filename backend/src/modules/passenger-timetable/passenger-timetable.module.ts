import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { PassengerBindingOperationsService } from './passenger-binding-operations.service';
import { PassengerTimetableController } from './passenger-timetable.controller';
import { PassengerTimetableService } from './passenger-timetable.service';
import { PassengerTimetableSyncService } from './passenger-timetable-sync.service';

@Module({
  imports: [PrismaModule],
  controllers: [PassengerTimetableController],
  providers: [PassengerTimetableService, PassengerTimetableSyncService, PassengerBindingOperationsService],
  exports: [PassengerTimetableService, PassengerTimetableSyncService, PassengerBindingOperationsService],
})
export class PassengerTimetableModule {}
