import { Module } from '@nestjs/common';
import { ImportDataService } from './import-data.service';
import { SchedulingModule } from '../scheduling/scheduling.module';

@Module({
    imports: [SchedulingModule],
    providers: [ImportDataService],
    exports: [ImportDataService],
})
export class ImportDataModule { }
