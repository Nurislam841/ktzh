import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

export const scheduleApprovalModeValues = ['AUTOMATIC', 'MANUAL'] as const;
export type ScheduleApprovalModeDto = (typeof scheduleApprovalModeValues)[number];

export class SetApprovalModeDto {
    @ApiProperty({ enum: scheduleApprovalModeValues })
    @IsEnum(scheduleApprovalModeValues)
    mode!: ScheduleApprovalModeDto;
}
