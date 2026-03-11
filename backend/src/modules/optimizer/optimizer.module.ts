import { Module } from '@nestjs/common';
import { OptimizerService } from './optimizer.service';
import { OptimizerController } from './optimizer.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [OptimizerService],
  controllers: [OptimizerController],
})
export class OptimizerModule { }
