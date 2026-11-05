import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { VehicleType } from '@prisma/client';

export interface FareResult {
  vehicleType: VehicleType;
  distanceKm: number;
  durationMin: number;
  fare: number;           // FCFA, entier
  commissionPct: number;  // ex. 0.18
}

@Injectable()
export class PricingService {
  constructor(private prisma: PrismaService) {}

  /**
   * Tarif = max(minimum, base + km*prix_km + min*prix_min), arrondi à 100 FCFA.
   * Le barème actif est lu en base -> modifiable sans redéploiement.
   */
  async quote(vehicleType: VehicleType, distanceKm: number, durationMin: number): Promise<FareResult> {
    const p = await this.prisma.pricing.findFirst({
      where: { vehicleType, isActive: true },
    });
    if (!p) throw new NotFoundException(`Aucun barème actif pour ${vehicleType}`);

    const raw =
      Number(p.baseFare) +
      distanceKm * Number(p.perKm) +
      durationMin * Number(p.perMin);

    const fare = this.roundTo(Math.max(Number(p.minimumFare), raw), 100);

    return {
      vehicleType,
      distanceKm,
      durationMin,
      fare,
      commissionPct: Number(p.commissionPct),
    };
  }

  /** Estimation pour les deux types en un appel (écran « choisir la course »). */
  async quoteAll(distanceKm: number, durationMin: number): Promise<FareResult[]> {
    return Promise.all(
      (['car', 'moto'] as VehicleType[]).map((t) => this.quote(t, distanceKm, durationMin)),
    );
  }

  commissionOf(fare: number, pct: number): number {
    return Math.round(fare * pct);
  }

  private roundTo(n: number, step: number): number {
    return Math.round(n / step) * step;
  }
}
