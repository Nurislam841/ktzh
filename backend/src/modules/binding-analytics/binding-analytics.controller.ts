import { Controller, Get, Post, Query, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { BindingAnalyticsService } from './binding-analytics.service';

@ApiTags('Binding Analytics')
@Controller('api/v1/kpi')
export class BindingAnalyticsController {
    constructor(private readonly analytics: BindingAnalyticsService) { }

    @Post('calculate')
    @ApiOperation({ summary: 'Calculate KPI for a period' })
    async calculate(
        @Body() body: { periodId: string; scopeType?: string; scopeId?: string },
    ) {
        return this.analytics.calculateKpi(body.periodId, body.scopeType, body.scopeId);
    }

    @Get()
    @ApiOperation({ summary: 'Get KPI snapshots' })
    @ApiQuery({ name: 'periodId', required: true })
    @ApiQuery({ name: 'scopeType', required: false })
    async getKpi(
        @Query('periodId') periodId: string,
        @Query('scopeType') scopeType?: string,
    ) {
        return this.analytics.getKpi(periodId, scopeType);
    }

    @Get('conflicts-summary')
    @ApiOperation({ summary: 'Aggregate conflict counts by code' })
    @ApiQuery({ name: 'periodId', required: true })
    async conflictSummary(@Query('periodId') periodId: string) {
        return this.analytics.conflictSummary(periodId);
    }
}
