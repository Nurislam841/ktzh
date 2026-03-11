import { Controller, Get, Query } from '@nestjs/common';
import { NodeService } from './node.service';
import { ApiTags, ApiQuery } from '@nestjs/swagger';

@ApiTags('Узел')
@Controller('node')
export class NodeController {
    constructor(private readonly nodeService: NodeService) { }

    @Get('stations')
    async listStations() {
        return this.nodeService.listStations();
    }

    @Get('overview')
    @ApiQuery({ name: 'stationId', required: true })
    @ApiQuery({ name: 'from', required: false })
    @ApiQuery({ name: 'to', required: false })
    @ApiQuery({ name: 'hours', required: false, description: 'Окно в часах, если не передан to' })
    async getOverview(
        @Query('stationId') stationId: string,
        @Query('from') from?: string,
        @Query('to') to?: string,
        @Query('hours') hours?: string,
    ) {
        return this.nodeService.getOverview(stationId, from, to, hours);
    }

    @Get('resources')
    @ApiQuery({ name: 'stationId', required: true })
    async getResources(@Query('stationId') stationId: string) {
        return this.nodeService.getResources(stationId);
    }

    @Get('decision-queue')
    @ApiQuery({ name: 'stationId', required: true })
    @ApiQuery({ name: 'hours', required: false, description: 'Окно в часах для очереди решений' })
    async getDecisionQueue(
        @Query('stationId') stationId: string,
        @Query('hours') hours?: string,
    ) {
        return this.nodeService.getDecisionQueue(stationId, hours);
    }
}
