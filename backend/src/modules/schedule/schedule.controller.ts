import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ScheduleService } from './schedule.service';
import { ApiTags, ApiQuery } from '@nestjs/swagger';
import { SetApprovalModeDto } from './dto/set-approval-mode.dto';
import { ApproveScheduleDto, RejectScheduleDto } from './dto/approve-schedule.dto';

@ApiTags('Расписание')
@Controller('schedule')
export class ScheduleController {
    constructor(private readonly scheduleService: ScheduleService) { }

    @Get('versions')
    @ApiQuery({ name: 'stationId', required: true })
    @ApiQuery({ name: 'page', required: false })
    @ApiQuery({ name: 'limit', required: false })
    @ApiQuery({ name: 'approvalMode', required: false, enum: ['AUTOMATIC', 'MANUAL'] })
    @ApiQuery({ name: 'approvalStatus', required: false, enum: ['PENDING', 'APPROVED', 'REJECTED'] })
    async listVersions(
        @Query('stationId') stationId: string,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
        @Query('approvalMode') approvalMode?: string,
        @Query('approvalStatus') approvalStatus?: string,
    ) {
        const normalizedMode =
            approvalMode === 'AUTOMATIC' || approvalMode === 'MANUAL'
                ? approvalMode
                : undefined;
        const normalizedStatus =
            approvalStatus === 'PENDING' ||
                approvalStatus === 'APPROVED' ||
                approvalStatus === 'REJECTED'
                ? approvalStatus
                : undefined;

        return this.scheduleService.listVersions(
            stationId,
            page ? parseInt(page) : 1,
            limit ? parseInt(limit) : 20,
            {
                approvalMode: normalizedMode,
                approvalStatus: normalizedStatus,
            },
        );
    }

    @Get('version/:id')
    async getVersion(@Param('id') id: string) {
        return this.scheduleService.getVersion(id);
    }

    @Get('compare')
    @ApiQuery({ name: 'fromVersionId', required: true })
    @ApiQuery({ name: 'toVersionId', required: true })
    async compare(
        @Query('fromVersionId') fromVersionId: string,
        @Query('toVersionId') toVersionId: string,
    ) {
        return this.scheduleService.compareVersions(fromVersionId, toVersionId);
    }

    @Patch('version/:id/mode')
    async setApprovalMode(@Param('id') id: string, @Body() dto: SetApprovalModeDto) {
        return this.scheduleService.setApprovalMode(id, dto.mode);
    }

    @Patch('version/:id/approve')
    async approveVersion(@Param('id') id: string, @Body() dto: ApproveScheduleDto) {
        return this.scheduleService.approveVersion(id, dto.approvedByUserId);
    }

    @Patch('version/:id/reject')
    async rejectVersion(@Param('id') id: string, @Body() dto: RejectScheduleDto) {
        return this.scheduleService.rejectVersion(id, dto.rejectedByUserId, dto.reason);
    }
}
