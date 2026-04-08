import { Module } from '@nestjs/common';
import { PassengerTimetableController } from './passenger-timetable.controller';
import { PassengerTimetableService } from './passenger-timetable.service';

@Module({
  controllers: [PassengerTimetableController],
  providers: [PassengerTimetableService],
  exports: [PassengerTimetableService],
})
export class PassengerTimetableModule {}
