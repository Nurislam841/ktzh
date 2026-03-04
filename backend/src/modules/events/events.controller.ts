import { Controller, Post, Get, Body, Query } from '@nestjs/common';
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { ApiTags, ApiQuery } from '@nestjs/swagger';

@ApiTags('События')
@Controller('events')
export class EventsController {
    constructor(private readonly eventsService: EventsService) { }

    @Post()
    async createEvent(@Body() dto: CreateEventDto) {
        return this.eventsService.createEvent(dto);
    }

    @Get()
    @ApiQuery({ name: 'stationId', required: true })
    @ApiQuery({ name: 'page', required: false })
    @ApiQuery({ name: 'limit', required: false })
    async listEvents(
        @Query('stationId') stationId: string,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
    ) {
        return this.eventsService.listEvents(
            stationId,
            page ? parseInt(page) : 1,
            limit ? parseInt(limit) : 20,
        );
    }
}
