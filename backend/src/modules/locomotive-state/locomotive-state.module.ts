import { Module } from '@nestjs/common';
import { LocomotiveStateService } from './locomotive-state.service';
import { LocomotiveStateController } from './locomotive-state.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [LocomotiveStateService],
  controllers: [LocomotiveStateController],
  exports: [LocomotiveStateService],
})
export class LocomotiveStateModule { }
