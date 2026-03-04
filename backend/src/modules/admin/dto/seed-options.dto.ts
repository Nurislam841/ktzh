import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class SeedOptionsDto {
    @ApiPropertyOptional({ example: 8, description: 'Количество путей на станции' })
    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(64)
    tracks?: number;

    @ApiPropertyOptional({ example: 24, description: 'Количество локомотивов' })
    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(1000)
    locomotives?: number;

    @ApiPropertyOptional({ example: 36, description: 'Количество бригад' })
    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(2000)
    crews?: number;

    @ApiPropertyOptional({ example: 60, description: 'Количество поездов (train runs)' })
    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(5000)
    trainRuns?: number;

    @ApiPropertyOptional({ example: 6, description: 'Окно планирования (часы)' })
    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(72)
    windowHours?: number;
}

export class ImportDataDto {
    @ApiPropertyOptional({ example: 'backend/data', description: 'Путь к каталогу с файлами данных' })
    @IsOptional()
    dataDir?: string;
}
