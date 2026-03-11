import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CrewCallStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class UpdateCrewCallStatusDto {
    @ApiProperty({ enum: CrewCallStatus })
    @IsEnum(CrewCallStatus)
    status!: CrewCallStatus;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    notes?: string;
}
