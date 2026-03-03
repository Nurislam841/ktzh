import { Controller, Get, Query } from '@nestjs/common';
import { NodeService } from './node.service';
import { ApiTags, ApiQuery } from '@nestjs/swagger';

@ApiTags('Node')
@Controller('node')
export class NodeController {
    constructor(private readonly nodeService: NodeService) { }

    @Get('overview')
    @ApiQuery({ name: 'stationId', required: true })
    @ApiQuery({ name: 'from', required: false })
    @ApiQuery({ name: 'to', required: false })
    async getOverview(
        @Query('stationId') stationId: string,
        @Query('from') from?: string,
        @Query('to') to?: string,
    ) {
        return this.nodeService.getOverview(stationId, from, to);
    }
}
