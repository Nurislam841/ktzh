import { Controller, Post, Param } from '@nestjs/common';
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
}
