import { Controller, Get, Query } from '@nestjs/common';
import { PassengerTimetableService } from './passenger-timetable.service';

@Controller('passenger-timetable')
export class PassengerTimetableController {
  constructor(private readonly passengerTimetableService: PassengerTimetableService) {}

  @Get('overview')
  async getOverview(
    @Query('pairKey') pairKey?: string,
    @Query('locomotiveId') locomotiveId?: string,
  ) {
    return this.passengerTimetableService.getOverview({
      pairKey,
      locomotiveId,
    });
  }
}
