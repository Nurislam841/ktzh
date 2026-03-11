import { Controller, Post, Param, Body } from '@nestjs/common';
import { LocomotiveStateService, StateTransitionEvent } from './locomotive-state.service';

@Controller('locomotive-state')
export class LocomotiveStateController {
    constructor(private readonly locomotiveStateService: LocomotiveStateService) { }

    @Post(':id/transition')
    async transitionState(
        @Param('id') locomotiveId: string,
        @Body() body: { event: StateTransitionEvent; stationId?: string }
    ) {
        return this.locomotiveStateService.transition(locomotiveId, body.event, body.stationId);
    }
}
