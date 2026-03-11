import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class GenerateCrewCallsDto {
    @ApiProperty({ description: 'UUID станции' })
    @IsString()
    stationId!: string;

    @ApiPropertyOptional({ description: 'Окно генерации в часах', default: 6 })
    @IsOptional()
    @IsInt()
    @Min(1)
    hours?: number;
}
