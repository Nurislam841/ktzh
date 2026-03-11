import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { BindingService } from './binding.service';
import { BindingController } from './binding.controller';

@Module({
    imports: [PrismaModule],
    controllers: [BindingController],
    providers: [BindingService],
    exports: [BindingService],
})
export class BindingModule { }
