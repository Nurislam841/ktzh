import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { SchedulingModule } from '../scheduling/scheduling.module';

@Module({
    imports: [SchedulingModule],
    controllers: [AdminController],
    providers: [AdminService],
})
export class AdminModule { }
