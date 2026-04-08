import { Controller, Get, Post, Query } from '@nestjs/common';
import { PassengerBindingOperationsService } from './passenger-binding-operations.service';
import { PassengerTimetableService } from './passenger-timetable.service';
import { PassengerTimetableSyncService } from './passenger-timetable-sync.service';

@Controller('passenger-timetable')
export class PassengerTimetableController {
  constructor(
    private readonly passengerTimetableService: PassengerTimetableService,
    private readonly passengerTimetableSyncService: PassengerTimetableSyncService,
    private readonly passengerBindingOperationsService: PassengerBindingOperationsService,
  ) {}

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
  @Post('sync-db')
  async syncDatabase() {
    return this.passengerTimetableSyncService.syncDatabase();
  }

  @Get('binding-operations')
  async getBindingOperations(@Query('scenario') scenario?: 'base' | 'optimized') {
    return this.passengerBindingOperationsService.getOverview({ scenario });
  }
}
