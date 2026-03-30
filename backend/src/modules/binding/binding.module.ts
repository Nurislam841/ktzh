import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { BindingService } from './binding.service';
import { BindingController } from './binding.controller';
import { GituralModule } from '../gitural/gitural.module';

@Module({
    imports: [PrismaModule, GituralModule],
    controllers: [BindingController],
    providers: [BindingService],
    exports: [BindingService],
})
export class BindingModule { }
