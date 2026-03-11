import { Module } from '@nestjs/common';
import { CrewCallController } from './crew-call.controller';
import { CrewCallService } from './crew-call.service';

@Module({
    controllers: [CrewCallController],
    providers: [CrewCallService],
    exports: [CrewCallService],
})
export class CrewCallModule { }
