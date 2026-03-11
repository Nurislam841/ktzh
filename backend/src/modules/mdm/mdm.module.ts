import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { MdmService } from './mdm.service';
import { MdmController } from './mdm.controller';

@Module({
    imports: [PrismaModule],
    controllers: [MdmController],
    providers: [MdmService],
    exports: [MdmService],
})
export class MdmModule { }
