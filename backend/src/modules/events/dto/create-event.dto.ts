import { IsEnum, IsNotEmpty, IsObject, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum OperationalEventTypeDto {
    LOCOMOTIVE_FAILURE = 'LOCOMOTIVE_FAILURE',
    CREW_UNAVAILABLE = 'CREW_UNAVAILABLE',
    TRAIN_DELAY = 'TRAIN_DELAY',
    TRACK_BLOCKED = 'TRACK_BLOCKED',
    MAINTENANCE_STARTED = 'MAINTENANCE_STARTED',
    MAINTENANCE_ENDED = 'MAINTENANCE_ENDED',
}

export class CreateEventDto {
    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    stationId!: string;

    @ApiProperty({ enum: OperationalEventTypeDto })
    @IsEnum(OperationalEventTypeDto)
    type!: OperationalEventTypeDto;

    @ApiProperty({ example: { locomotiveId: 'uuid', trainRunId: 'uuid' } })
    @IsObject()
    payload!: Record<string, unknown>;
}
