import { Module } from '@nestjs/common';
import { GituralController } from './gitural.controller';
import { GituralService } from './gitural.service';

@Module({
  controllers: [GituralController],
  providers: [GituralService],
  exports: [GituralService],
})
export class GituralModule {}
