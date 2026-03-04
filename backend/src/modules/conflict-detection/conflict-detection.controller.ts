import { Controller, Get, Query } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { ConflictDetectionService } from './conflict-detection.service';

@ApiTags('Обнаружение конфликтов')
@Controller('conflicts')
export class ConflictDetectionController {
    constructor(private readonly conflictDetectionService: ConflictDetectionService) { }

    @Get()
    @ApiQuery({ name: 'versionId', required: false })
    @ApiQuery({ name: 'stationId', required: false })
    async detect(
        @Query('versionId') versionId?: string,
        @Query('stationId') stationId?: string,
    ) {
        return this.conflictDetectionService.detect(versionId, stationId);
    }
}
