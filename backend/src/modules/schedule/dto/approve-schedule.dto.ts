import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ApproveScheduleDto {
    @ApiProperty({ required: false, example: 'dispatcher.user01' })
    @IsOptional()
    @IsString()
    approvedByUserId?: string;
}

export class RejectScheduleDto {
    @ApiProperty({ required: false, example: 'dispatcher.user01' })
    @IsOptional()
    @IsString()
    rejectedByUserId?: string;

    @ApiProperty({ required: false, example: 'Headway conflict on Track 2' })
    @IsOptional()
    @IsString()
    reason?: string;
}
