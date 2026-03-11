import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { MdmModule } from '../mdm/mdm.module';
import { BindingModule } from '../binding/binding.module';
import { BindingImportService } from './binding-import.service';
import { BindingImportController } from './binding-import.controller';

@Module({
    imports: [PrismaModule, MdmModule, BindingModule],
    controllers: [BindingImportController],
    providers: [BindingImportService],
    exports: [BindingImportService],
})
export class BindingImportModule { }
