import { Controller, Get, Post, Query, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { BindingConflictService } from './binding-conflict.service';
import { ConflictCode } from '@prisma/client';

@ApiTags('Binding Conflicts')
@Controller('api/v1/conflicts')
export class BindingConflictController {
    constructor(private readonly conflicts: BindingConflictService) { }

    @Post('check')
    @ApiOperation({ summary: 'Run conflict checks for a period' })
    async runChecks(@Body() body: { periodId: string }) {
        return this.conflicts.checkConflicts(body.periodId);
    }

    @Get()
    @ApiOperation({ summary: 'List conflicts with filters' })
    @ApiQuery({ name: 'periodId', required: false })
    @ApiQuery({ name: 'code', required: false, enum: ConflictCode })
    @ApiQuery({ name: 'bindingId', required: false })
    async list(
        @Query('periodId') periodId?: string,
        @Query('code') code?: ConflictCode,
        @Query('bindingId') bindingId?: string,
    ) {
        return this.conflicts.list({ periodId, code, bindingId });
    }
}
