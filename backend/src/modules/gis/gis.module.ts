import { Module } from '@nestjs/common';
import { GisService } from './gis.service';
import { GisController } from './gis.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { GituralModule } from '../gitural/gitural.module';

@Module({
  imports: [PrismaModule, GituralModule],
  providers: [GisService],
  controllers: [GisController]
})
export class GisModule { }
