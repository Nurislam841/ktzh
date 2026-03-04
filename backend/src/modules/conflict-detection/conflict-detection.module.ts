import { Module } from '@nestjs/common';
import { ConflictDetectionController } from './conflict-detection.controller';
import { ConflictDetectionService } from './conflict-detection.service';

@Module({
    controllers: [ConflictDetectionController],
    providers: [ConflictDetectionService],
    exports: [ConflictDetectionService],
})
export class ConflictDetectionModule { }
