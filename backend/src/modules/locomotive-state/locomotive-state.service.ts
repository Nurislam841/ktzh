import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LocomotiveStatus } from '@prisma/client';

export type StateTransitionEvent =
    | 'ASSIGN_TO_TRAIN'
    | 'DEPART'
    | 'ARRIVE'
    | 'START_MAINTENANCE'
    | 'FINISH_MAINTENANCE';

@Injectable()
export class LocomotiveStateService {
    private readonly logger = new Logger(LocomotiveStateService.name);

    constructor(private prisma: PrismaService) { }

    // Define valid transitions
    private readonly transitions: Record<LocomotiveStatus, Partial<Record<StateTransitionEvent, LocomotiveStatus>>> = {
        [LocomotiveStatus.AVAILABLE]: {
            ASSIGN_TO_TRAIN: LocomotiveStatus.ASSIGNED,
            START_MAINTENANCE: LocomotiveStatus.MAINTENANCE,
        },
        [LocomotiveStatus.ASSIGNED]: {
            DEPART: LocomotiveStatus.IN_TRANSIT,
            // allow unassigning back to available if needed:
            // UNASSIGN: LocomotiveStatus.AVAILABLE 
        },
        [LocomotiveStatus.IN_TRANSIT]: {
            ARRIVE: LocomotiveStatus.AVAILABLE,
        },
        [LocomotiveStatus.MAINTENANCE]: {
            FINISH_MAINTENANCE: LocomotiveStatus.AVAILABLE,
        },
    };

    async transition(locomotiveId: string, event: StateTransitionEvent, stationId?: string) {
        const loco = await this.prisma.locomotive.findUnique({
            where: { id: locomotiveId },
        });

        if (!loco) {
            throw new BadRequestException('Locomotive not found');
        }

        const currentStatus = loco.status;
        const allowedTransitions = this.transitions[currentStatus];
        const newStatus = allowedTransitions[event];

        if (!newStatus) {
            throw new BadRequestException(`Cannot transition locomotive ${locomotiveId} from ${currentStatus} via event ${event}`);
        }

        const updateData: any = {
            status: newStatus,
        };

        if (stationId && newStatus === LocomotiveStatus.AVAILABLE) {
            updateData.locationStationId = stationId;
        }

        const updated = await this.prisma.locomotive.update({
            where: { id: locomotiveId },
            data: updateData,
        });

        this.logger.log(`Locomotive ${locomotiveId} transitioned to ${newStatus}`);

        // Post-transition hooks
        if (newStatus === LocomotiveStatus.AVAILABLE) {
            this.handleArrivalHook(updated.id, stationId);
        }

        return updated;
    }

    private async handleArrivalHook(locomotiveId: string, stationId?: string) {
        this.logger.log(`Locomotive ${locomotiveId} arrived at ${stationId || 'depot'}. Triggering optimization / KPI checks...`);
        // Here we can trigger the Optimizer service or KPI calculation.
    }
}
