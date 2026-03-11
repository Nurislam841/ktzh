import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { MdmModule } from '../mdm/mdm.module';
import { BindingConflictService } from './binding-conflict.service';
import { BindingConflictController } from './binding-conflict.controller';

@Module({
    imports: [PrismaModule, MdmModule],
    controllers: [BindingConflictController],
    providers: [BindingConflictService],
    exports: [BindingConflictService],
})
export class BindingConflictModule { }
