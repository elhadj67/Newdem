import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { VehicleType } from '@prisma/client';

export interface NearbyDriver {
  driver_id: string;
  rating: number;
  distance_m: number;
}

@Injectable()
export class MatchingService {
  constructor(private prisma: PrismaService) {}

  /**
   * Conducteurs éligibles les plus proches d'un point.
   * S'appuie sur l'index GiST (idx_drivers_location) via ST_DWithin,
   * triés par distance croissante puis par note.
   * lng/lat en WGS84 (attention à l'ordre : ST_MakePoint(lng, lat)).
   */
  async findNearby(
    vehicleType: VehicleType,
    lng: number,
    lat: number,
    radiusMeters = 3000,
    limit = 8,
  ): Promise<NearbyDriver[]> {
    return this.prisma.$queryRaw<NearbyDriver[]>`
      SELECT d.id AS driver_id,
             d.rating::float AS rating,
             ST_Distance(d.last_location, ref.g) AS distance_m
      FROM drivers d
      JOIN vehicles v ON v.driver_id = d.id
                     AND v.type = ${vehicleType}::vehicle_type
                     AND v.is_active
      CROSS JOIN (SELECT ST_MakePoint(${lng}, ${lat})::geography AS g) ref
      WHERE d.status = 'online'
        AND d.kyc_status = 'approved'
        AND d.last_location IS NOT NULL
        AND ST_DWithin(d.last_location, ref.g, ${radiusMeters})
      ORDER BY distance_m ASC, d.rating DESC
      LIMIT ${limit};
    `;
  }

  /** Met à jour la position d'un conducteur (appelé depuis la passerelle temps réel). */
  async updateLocation(driverId: string, lng: number, lat: number): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE drivers
      SET last_location = ST_MakePoint(${lng}, ${lat})::geography,
          last_seen_at = now()
      WHERE id = ${driverId}::uuid;
    `;
  }

  /** Distance à vol d'oiseau (fallback si pas d'API de routage). */
  async straightLineKm(aLng: number, aLat: number, bLng: number, bLat: number): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ m: number }[]>`
      SELECT ST_Distance(
        ST_MakePoint(${aLng}, ${aLat})::geography,
        ST_MakePoint(${bLng}, ${bLat})::geography
      ) AS m;
    `;
    return Number(rows[0]?.m ?? 0) / 1000;
  }
}
