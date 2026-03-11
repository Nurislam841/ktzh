import { Controller, Get, Post, Put, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { BindingService, BindingPlanDto } from './binding.service';
import { BindingPlanStatus } from '@prisma/client';

@ApiTags('Bindings')
@Controller('api/v1/bindings')
export class BindingController {
    constructor(private readonly binding: BindingService) { }

    @Post()
    @ApiOperation({ summary: 'UPSERT binding plans (single or batch)' })
    async upsert(@Body() body: BindingPlanDto | BindingPlanDto[]) {
        const items = Array.isArray(body) ? body : [body];
        const results = await this.binding.upsertMany(items);
        return { count: results.length, items: results.map((r) => ({ id: r.id, status: r.status })) };
    }

    @Get()
    @ApiOperation({ summary: 'List binding plans with filters' })
    @ApiQuery({ name: 'periodId', required: false })
    @ApiQuery({ name: 'stationId', required: false })
    @ApiQuery({ name: 'status', required: false, enum: BindingPlanStatus })
    @ApiQuery({ name: 'skip', required: false })
    @ApiQuery({ name: 'take', required: false })
    async list(
        @Query('periodId') periodId?: string,
        @Query('stationId') stationId?: string,
        @Query('status') status?: BindingPlanStatus,
        @Query('skip') skip?: string,
        @Query('take') take?: string,
    ) {
        return this.binding.list({
            periodId,
            stationId,
            status,
            skip: skip ? parseInt(skip, 10) : undefined,
            take: take ? parseInt(take, 10) : undefined,
        });
    }

    @Get(':bindingId')
    @ApiOperation({ summary: 'Get binding plan detail' })
    async detail(@Param('bindingId') bindingId: string) {
        return this.binding.findById(bindingId);
    }

    @Put(':bindingId/status')
    @ApiOperation({ summary: 'Transition binding plan status' })
    async transitionStatus(
        @Param('bindingId') bindingId: string,
        @Body() body: { status: BindingPlanStatus; reason?: string },
    ) {
        return this.binding.transition(bindingId, body.status, body.reason);
    }
}
