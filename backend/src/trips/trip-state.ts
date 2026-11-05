import { BadRequestException } from '@nestjs/common';
import { TripStatus } from '@prisma/client';

/**
 * Transitions autorisées de la course. Toute transition hors de cette table
 * est refusée -> évite les états incohérents (ex. payer une course annulée).
 */
const ALLOWED: Record<TripStatus, TripStatus[]> = {
  requested:   ['assigned', 'cancelled', 'no_driver'],
  assigned:    ['accepted', 'cancelled', 'requested'], // requested = ré-attribution
  accepted:    ['arriving', 'cancelled'],
  arriving:    ['in_progress', 'cancelled'],
  in_progress: ['completed'],
  completed:   [],
  cancelled:   [],
  no_driver:   [],
};

export function canTransition(from: TripStatus, to: TripStatus): boolean {
  return ALLOWED[from]?.includes(to) ?? false;
}

export function assertTransition(from: TripStatus, to: TripStatus): void {
  if (!canTransition(from, to)) {
    throw new BadRequestException(`Transition invalide : ${from} -> ${to}`);
  }
}

/** Horodatage à renseigner selon le nouvel état. */
export function timestampField(to: TripStatus): string | null {
  switch (to) {
    case 'assigned':    return 'assignedAt';
    case 'accepted':    return 'acceptedAt';
    case 'in_progress': return 'startedAt';
    case 'completed':   return 'completedAt';
    case 'cancelled':   return 'cancelledAt';
    default:            return null;
  }
}
