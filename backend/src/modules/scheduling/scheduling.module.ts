import { Module } from '@nestjs/common';
import { SchedulingService } from './scheduling.service';
import { GreedySolver } from './greedy-solver';

@Module({
    providers: [SchedulingService, GreedySolver],
    exports: [SchedulingService],
})
export class SchedulingModule { }
