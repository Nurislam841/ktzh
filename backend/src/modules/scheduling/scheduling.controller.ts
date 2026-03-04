import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { RunSchedulerDto } from './dto/run-scheduler.dto';
import { SchedulingService } from './scheduling.service';

@ApiTags('Перепланирование')
@Controller('scheduling')
export class SchedulingController {
    constructor(private readonly schedulingService: SchedulingService) { }

    @Post('run')
    async run(@Body() dto: RunSchedulerDto) {
        return this.schedulingService.runRescheduler(
            dto.stationId,
            dto.reason ?? 'Ручной запуск пересчета',
            dto.baseVersionId ?? null,
        );
    }

    @Get('latest')
    @ApiQuery({ name: 'stationId', required: true })
    async latest(@Query('stationId') stationId: string) {
        return this.schedulingService.getLatestVersion(stationId);
    }
}
