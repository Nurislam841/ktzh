import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { CrewCallService } from './crew-call.service';
import { GenerateCrewCallsDto } from './dto/generate-crew-calls.dto';
import { UpdateCrewCallStatusDto } from './dto/update-crew-call-status.dto';

@ApiTags('Crew Calls')
@Controller('crew-calls')
export class CrewCallController {
    constructor(private readonly crewCallService: CrewCallService) { }

    @Post('generate')
    async generate(@Body() dto: GenerateCrewCallsDto) {
        return this.crewCallService.generateForStation(dto.stationId, dto.hours ?? 6);
    }

    @Get()
    @ApiQuery({ name: 'stationId', required: true })
    @ApiQuery({ name: 'hours', required: false })
    async list(
        @Query('stationId') stationId: string,
        @Query('hours') hours?: string,
    ) {
        const hoursWindow = Number.isFinite(Number(hours)) && Number(hours) > 0 ? Number(hours) : 6;
        return this.crewCallService.list(stationId, hoursWindow);
    }

    @Patch(':id/status')
    async updateStatus(
        @Param('id') id: string,
        @Body() dto: UpdateCrewCallStatusDto,
    ) {
        return this.crewCallService.updateStatus(id, dto.status, dto.notes);
    }
}
