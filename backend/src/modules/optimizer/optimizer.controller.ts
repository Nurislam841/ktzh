import { Controller, Post, Param, Body } from '@nestjs/common';
import { OptimizerService } from './optimizer.service';

@Controller('optimizer')
export class OptimizerController {
    constructor(private readonly optimizerService: OptimizerService) { }

    @Post('station/:id/solve-lap')
    async solveLap(@Param('id') stationId: string) {
        const assignments = await this.optimizerService.solveAssignment(stationId);
        return {
            success: true,
            message: `LAP completed. Generated ${assignments.length} assignments.`,
            assignments,
        };
    }

    @Post('station/:id/approve-lap')
    async approveLap(@Param('id') stationId: string, @Body() body: { locomotiveId: string, trainRunId: string, recommendationType: string }) {
        return this.optimizerService.approveAssignment(body);
    }
}
