import { Module } from '@nestjs/common';
import { SchedulingService } from './scheduling.service';
import { GreedySolver } from './greedy-solver';
import { SchedulingController } from './scheduling.controller';

@Module({
    controllers: [SchedulingController],
    providers: [SchedulingService, GreedySolver],
    exports: [SchedulingService],
})
export class SchedulingModule { }
