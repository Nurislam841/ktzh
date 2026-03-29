import { Controller, Get, Query } from '@nestjs/common';
import { GituralService } from './gitural.service';

@Controller('gitural')
export class GituralController {
  constructor(private readonly gituralService: GituralService) {}

  @Get('timeline')
  async getTimeline(
    @Query('corridor') corridor?: string,
    @Query('trainNumber') trainNumber?: string,
    @Query('day') day?: string,
  ) {
    const parsedDay = day ? Number.parseInt(day, 10) : undefined;
    return this.gituralService.getTimeline(
      corridor,
      trainNumber,
      typeof parsedDay === 'number' && !Number.isNaN(parsedDay) ? parsedDay : undefined,
    );
  }
}
