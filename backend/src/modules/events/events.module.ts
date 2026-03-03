import { Module } from '@nestjs/common';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { SchedulingModule } from '../scheduling/scheduling.module';

@Module({
    imports: [SchedulingModule],
    controllers: [EventsController],
    providers: [EventsService],
})
export class EventsModule { }
