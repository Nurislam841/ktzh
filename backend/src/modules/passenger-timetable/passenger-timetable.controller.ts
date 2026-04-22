import { Controller, Get, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { PassengerBindingOperationsService } from './passenger-binding-operations.service';
import { PassengerDemoBindingsService } from './passenger-demo-bindings.service';
import { PassengerTimetableService } from './passenger-timetable.service';
import { PassengerTimetableSyncService } from './passenger-timetable-sync.service';

@Controller('passenger-timetable')
export class PassengerTimetableController {
  constructor(
    private readonly passengerTimetableService: PassengerTimetableService,
    private readonly passengerTimetableSyncService: PassengerTimetableSyncService,
    private readonly passengerBindingOperationsService: PassengerBindingOperationsService,
    private readonly passengerDemoBindingsService: PassengerDemoBindingsService,
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

  @Get('demo-bindings')
  async getDemoBindings() {
    return this.passengerDemoBindingsService.getOverview();
  }

  @Get('demo-bindings/export')
  async exportDemoBindings(@Res() res: Response) {
    const buffer = await this.passengerDemoBindingsService.exportWorkbookBuffer();
    const stamp = new Date().toISOString().slice(0, 10);

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="ktz-passenger-demo-report-${stamp}.xlsx"`,
    );
    res.send(buffer);
  }
}
