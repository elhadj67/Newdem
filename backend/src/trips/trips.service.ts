import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PricingService } from '../pricing/pricing.service';
import { MatchingService } from '../matching/matching.service';
import { RoutingService } from '../routing/routing.service';
import { WalletService } from '../wallet/wallet.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { MetricsService } from '../observability/metrics.service';
import { assertTransition, timestampField } from './trip-state';
import { VehicleType, TripStatus, PaymentMethod } from '@prisma/client';

interface Point { lng: number; lat: number; label?: string }

@Injectable()
export class TripsService {
  constructor(
    private prisma: PrismaService,
    private pricing: PricingService,
    private matching: MatchingService,
    private routing: RoutingService,
    private wallet: WalletService,
    private rt: RealtimeGateway,
    private metrics: MetricsService,
  ) {}

  /** Estimation (les deux types) avant commande — distance/durée via OSRM. */
  async estimate(origin: Point, destination: Point) {
    const r = await this.routing.route(origin, destination);
    return {
      distanceKm: r.distanceKm,
      durationMin: r.durationMin,
      quotes: await this.pricing.quoteAll(r.distanceKm, r.durationMin),
    };
  }

  /** Demande de course : fige un devis et crée la course, puis lance le matching. */
  async request(passengerId: string, vehicleType: VehicleType, origin: Point, destination: Point) {
    const est = await this.estimate(origin, destination);
    const quote = est.quotes.find((q) => q.vehicleType === vehicleType)!;

    const trip = await this.prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO trips (passenger_id, vehicle_type, status,
        origin, origin_label, destination, destination_label,
        est_distance_km, est_duration_min, quoted_fare)
      VALUES (
        ${passengerId}::uuid, ${vehicleType}::vehicle_type, 'requested',
        ST_MakePoint(${origin.lng}, ${origin.lat})::geography, ${origin.label ?? null},
        ST_MakePoint(${destination.lng}, ${destination.lat})::geography, ${destination.label ?? null},
        ${est.distanceKm}, ${est.durationMin}, ${quote.fare}
      ) RETURNING id;
    `;
    const tripId = trip[0].id;
    this.metrics.tripsRequested.inc({ vehicle_type: vehicleType });
    this.dispatch(tripId, origin, vehicleType).catch(() => {});
    return { tripId, ...quote, estimate: est };
  }

  /** Attribution : cherche le meilleur conducteur proche et le propose. */
  private async dispatch(tripId: string, origin: Point, vehicleType: VehicleType) {
    const candidates = await this.matching.findNearby(vehicleType, origin.lng, origin.lat);
    if (candidates.length === 0) {
      await this.setStatus(tripId, 'no_driver');
      this.rt.toTrip(tripId, 'trip:no_driver', { tripId });
      return;
    }
    const best = candidates[0];
    await this.prisma.trip.update({
      where: { id: tripId },
      data: { driverId: best.driver_id, status: 'assigned', assignedAt: new Date() },
    });
    // Notifier le conducteur (il accepte / refuse ; timeout -> candidat suivant)
    this.rt.toDriver(best.driver_id, 'ride:offer', { tripId, distanceM: best.distance_m });
    this.rt.toTrip(tripId, 'trip:assigned', { tripId, driverId: best.driver_id });
  }

  /** Transition générique validée par la machine à états. */
  async setStatus(tripId: string, to: TripStatus, extra: Record<string, any> = {}) {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) throw new NotFoundException('Course introuvable');
    assertTransition(trip.status, to);

    const data: Record<string, any> = { status: to, ...extra };
    const ts = timestampField(to);
    if (ts) data[ts] = new Date();

    const updated = await this.prisma.trip.update({ where: { id: tripId }, data });
    this.rt.toTrip(tripId, `trip:${to}`, { tripId, status: to });
    return updated;
  }

  accept(tripId: string)   { return this.setStatus(tripId, 'accepted'); }
  arriving(tripId: string) { return this.setStatus(tripId, 'arriving'); }
  start(tripId: string)    { return this.setStatus(tripId, 'in_progress'); }

  /**
   * Fin de course : fige le prix final, calcule la commission, règle le
   * portefeuille selon le moyen de paiement, met la course à `completed`.
   */
  async complete(tripId: string, method: PaymentMethod, actual?: { km: number; min: number }) {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) throw new NotFoundException('Course introuvable');

    // Prix final : recalcul sur la distance/durée réelles si fournies, sinon devis.
    let finalFare = Number(trip.quotedFare);
    let commissionPct = 0.18;
    if (actual) {
      const q = await this.pricing.quote(trip.vehicleType, actual.km, actual.min);
      finalFare = q.fare;
      commissionPct = q.commissionPct;
    } else {
      const p = await this.prisma.pricing.findFirst({ where: { vehicleType: trip.vehicleType, isActive: true } });
      commissionPct = Number(p?.commissionPct ?? 0.18);
    }
    const commission = this.pricing.commissionOf(finalFare, commissionPct);

    const updated = await this.setStatus(tripId, 'completed', {
      finalFare: BigInt(finalFare),
      commissionAmount: BigInt(commission),
      paymentMethod: method,
      paymentStatus: method === 'cash' ? 'paid' : 'pending',
      actualDistanceKm: actual?.km,
      actualDurationMin: actual?.min,
    });

    // Cash : on règle tout de suite (commission débitée du portefeuille).
    // Mobile money : le règlement du portefeuille se fait au webhook de paiement.
    if (method === 'cash' && trip.driverId) {
      await this.wallet.settleTrip({ driverId: trip.driverId, tripId, fare: finalFare, commission, method });
    }
    return { ...updated, finalFare, commission };
  }

  /**
   * Notation en fin de course. Le rater est l'utilisateur authentifié ; le noté
   * est l'autre partie. Une note passager -> conducteur met à jour la moyenne
   * du conducteur de façon atomique. Une seule note par (course, auteur).
   */
  async rate(tripId: string, raterId: string, stars: number, comment?: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: { driver: true },
    });
    if (!trip) throw new NotFoundException('Course introuvable');
    if (trip.status !== 'completed') {
      throw new BadRequestException('Course non terminée');
    }

    const raterIsPassenger = raterId === trip.passengerId;
    const rateeId = raterIsPassenger ? trip.driver?.userId : trip.passengerId;
    if (!rateeId) throw new BadRequestException('Destinataire de la note introuvable');

    return this.prisma.$transaction(async (tx) => {
      await tx.rating.create({
        data: { tripId, raterId, rateeId, stars, comment: comment ?? null },
      });
      // Mise à jour de la moyenne du conducteur si c'est lui qui est noté.
      if (raterIsPassenger && trip.driverId) {
        const d = await tx.driver.findUnique({ where: { id: trip.driverId } });
        if (d) {
          const count = d.ratingCount + 1;
          const avg = (Number(d.rating) * d.ratingCount + stars) / count;
          await tx.driver.update({
            where: { id: trip.driverId },
            data: { rating: avg.toFixed(2), ratingCount: count },
          });
        }
      }
      return { ok: true };
    });
  }

  /**
   * Historique des courses de l'utilisateur, adapté à son rôle :
   * un passager voit ses trajets, un conducteur les courses qu'il a assurées.
   * Pagination par curseur (createdAt décroissant). N'expose pas les colonnes
   * géographiques — seulement les libellés et le récapitulatif.
   */
  async history(userId: string, role: string, limit = 20, before?: string) {
    let where: any = { passengerId: userId };
    if (role === 'driver') {
      const driver = await this.prisma.driver.findUnique({ where: { userId } });
      where = { driverId: driver?.id ?? '__none__' };
    }
    if (before) where.createdAt = { lt: new Date(before) };

    const trips = await this.prisma.trip.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 50),
      select: {
        id: true, vehicleType: true, status: true,
        originLabel: true, destinationLabel: true,
        quotedFare: true, finalFare: true, commissionAmount: true,
        paymentMethod: true, paymentStatus: true,
        completedAt: true, createdAt: true,
      },
    });

    const asDriver = role === 'driver';
    return trips.map((t) => ({
      id: t.id,
      vehicleType: t.vehicleType,
      status: t.status,
      from: t.originLabel,
      to: t.destinationLabel,
      fare: Number(t.finalFare ?? t.quotedFare),
      commission: asDriver && t.commissionAmount ? Number(t.commissionAmount) : undefined,
      paymentMethod: t.paymentMethod,
      paymentStatus: t.paymentStatus,
      date: t.completedAt ?? t.createdAt,
    }));
  }
}
