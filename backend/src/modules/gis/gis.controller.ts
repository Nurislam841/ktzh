import { Controller, Get } from '@nestjs/common';
import { GisService } from './gis.service';

@Controller('gis')
export class GisController {
    constructor(private readonly gisService: GisService) { }

    @Get('map-data')
    async getMapData() {
        return this.gisService.getMapData();
    }

    @Get('route-lines')
    async getRouteLines() {
        return this.gisService.getRouteLines();
    }
}
