import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { MdmService } from './mdm.service';

@ApiTags('Reference / MDM')
@Controller('api/v1/reference')
export class MdmController {
    constructor(private readonly mdm: MdmService) { }

    // ── LocomotiveModel ────────────────────────────

    @Get('locomotive-models')
    @ApiOperation({ summary: 'List all locomotive models' })
    async listModels() {
        return this.mdm.findAllModels();
    }

    @Post('locomotive-models')
    @ApiOperation({ summary: 'Create/update locomotive model' })
    async upsertModel(
        @Body() body: { series: string; sectionsCount?: number; tractionType?: string; description?: string },
    ) {
        return this.mdm.upsertModel(body as any);
    }

    // ── ServiceShoulder ────────────────────────────

    @Get('shoulders')
    @ApiOperation({ summary: 'List service shoulders' })
    @ApiQuery({ name: 'depotId', required: false })
    @ApiQuery({ name: 'modelId', required: false })
    async listShoulders(
        @Query('depotId') depotId?: string,
        @Query('modelId') modelId?: string,
    ) {
        return this.mdm.findAllShoulders({ depotId, modelId });
    }

    @Post('shoulders')
    @ApiOperation({ summary: 'Create a service shoulder' })
    async createShoulder(
        @Body() body: {
            depotId: string;
            fromStationId: string;
            toStationId: string;
            modelId: string;
            sectionsCount?: number;
            movementType?: string;
        },
    ) {
        return this.mdm.createShoulder(body as any);
    }

    // ── MaintenanceRule ────────────────────────────

    @Get('maintenance-rules')
    @ApiOperation({ summary: 'List maintenance rules by model' })
    @ApiQuery({ name: 'modelId', required: true })
    async listRules(@Query('modelId') modelId: string) {
        return this.mdm.findRulesByModel(modelId);
    }

    @Post('maintenance-rules')
    @ApiOperation({ summary: 'Create a maintenance rule' })
    async createRule(
        @Body() body: {
            modelId: string;
            to2KmMin?: number; to2KmMax?: number; to2DowntimeHours?: number;
            serviceKmMin?: number; serviceKmMax?: number; serviceDowntimeHours?: number;
        },
    ) {
        return this.mdm.createRule(body as any);
    }
}
