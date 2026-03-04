import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { ImportDataModule } from '../import-data/import-data.module';

@Module({
    imports: [SchedulingModule, ImportDataModule],
    controllers: [AdminController],
    providers: [AdminService],
})
export class AdminModule { }
