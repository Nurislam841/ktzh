import { Controller, Get, Param, Query } from '@nestjs/common';
import { ScheduleService } from './schedule.service';
import { ApiTags, ApiQuery } from '@nestjs/swagger';

@ApiTags('Schedule')
@Controller('schedule')
export class ScheduleController {
    constructor(private readonly scheduleService: ScheduleService) { }

    @Get('versions')
    @ApiQuery({ name: 'stationId', required: true })
    @ApiQuery({ name: 'page', required: false })
    @ApiQuery({ name: 'limit', required: false })
    async listVersions(
        @Query('stationId') stationId: string,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
    ) {
        return this.scheduleService.listVersions(
            stationId,
            page ? parseInt(page) : 1,
            limit ? parseInt(limit) : 20,
        );
    }

    @Get('version/:id')
    async getVersion(@Param('id') id: string) {
        return this.scheduleService.getVersion(id);
    }

    @Get('compare')
    @ApiQuery({ name: 'fromVersionId', required: true })
    @ApiQuery({ name: 'toVersionId', required: true })
    async compare(
        @Query('fromVersionId') fromVersionId: string,
        @Query('toVersionId') toVersionId: string,
    ) {
        return this.scheduleService.compareVersions(fromVersionId, toVersionId);
    }
}
