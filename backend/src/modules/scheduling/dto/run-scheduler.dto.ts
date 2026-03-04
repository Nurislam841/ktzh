import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class RunSchedulerDto {
    @ApiProperty()
    @IsString()
    stationId!: string;

    @ApiProperty({ required: false, example: 'Ручной запуск пересчета диспетчером' })
    @IsOptional()
    @IsString()
    reason?: string;

    @ApiProperty({ required: false, nullable: true })
    @IsOptional()
    @IsString()
    baseVersionId?: string | null;
}
