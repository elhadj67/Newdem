import { Injectable, Logger } from '@nestjs/common';
import { MatchingService } from '../matching/matching.service';

export interface Route {
  distanceKm: number;
  durationMin: number;
  source: 'osrm' | 'fallback';
}

interface Pt { lng: number; lat: number }

/**
 * Distance et durée réelles via OSRM (routage sur le réseau routier).
 * Démo publique par défaut ; en production, self-host OSRM (données OSM Sénégal)
 * pour la fiabilité et le respect des limites d'usage.
 * Repli automatique à vol d'oiseau (PostGIS) si OSRM est indisponible.
 */
@Injectable()
export class RoutingService {
  private readonly log = new Logger(RoutingService.name);
  private readonly base = process.env.OSRM_URL ?? 'https://router.project-osrm.org';

  constructor(private matching: MatchingService) {}

  async route(o: Pt, d: Pt): Promise<Route> {
    // OSRM attend l'ordre lon,lat ; overview=false = pas de géométrie.
    const url = `${this.base}/route/v1/driving/${o.lng},${o.lat};${d.lng},${d.lat}?overview=false`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (res.ok) {
        const j: any = await res.json();
        if (j.code === 'Ok' && j.routes?.length) {
          return {
            distanceKm: +(j.routes[0].distance / 1000).toFixed(2),
            durationMin: Math.max(1, Math.round(j.routes[0].duration / 60)),
            source: 'osrm',
          };
        }
      }
    } catch (e) {
      this.log.warn(`OSRM indisponible, repli à vol d'oiseau : ${(e as Error).message}`);
    }
    // Repli : distance géodésique + hypothèse ~20 km/h en ville.
    const km = await this.matching.straightLineKm(o.lng, o.lat, d.lng, d.lat);
    return { distanceKm: +km.toFixed(2), durationMin: Math.max(5, Math.round(km * 3)), source: 'fallback' };
  }
}
