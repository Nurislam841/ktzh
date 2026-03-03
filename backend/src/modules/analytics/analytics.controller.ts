import { Controller, Get, Query } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { ApiTags, ApiQuery } from '@nestjs/swagger';

@ApiTags('Analytics')
@Controller('analytics')
export class AnalyticsController {
    constructor(private readonly analyticsService: AnalyticsService) { }

    @Get('node-overview')
    @ApiQuery({ name: 'stationId', required: true })
    @ApiQuery({ name: 'versionId', required: false })
    async getNodeOverview(
        @Query('stationId') stationId: string,
        @Query('versionId') versionId?: string,
    ) {
        return this.analyticsService.getNodeOverview(stationId, versionId);
    }
}
