import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { BindingAnalyticsService } from './binding-analytics.service';
import { BindingAnalyticsController } from './binding-analytics.controller';

@Module({
    imports: [PrismaModule],
    controllers: [BindingAnalyticsController],
    providers: [BindingAnalyticsService],
    exports: [BindingAnalyticsService],
})
export class BindingAnalyticsModule { }
