import { Body, Controller, Param, Post, Get, Query } from '@nestjs/common';
import { TripsService } from './trips.service';
import { WaveService } from '../payments/wave.service';
import { OrangeMoneyService } from '../payments/orange-money.service';
import { PrismaService } from '../prisma/prisma.service';
import { Roles, CurrentUser, AuthUser } from '../auth/auth.decorators';
import { VehicleType, PaymentMethod } from '@prisma/client';

interface Pt { lng: number; lat: number; label?: string }

@Controller('trips')
export class TripsController {
  constructor(
    private trips: TripsService,
    private wave: WaveService,
    private om: OrangeMoneyService,
    private prisma: PrismaService,
  ) {}

  /** Estimation des deux tarifs avant commande (tout utilisateur authentifié). */
  @Post('estimate')
  estimate(@Body() b: { origin: Pt; destination: Pt }) {
    return this.trips.estimate(b.origin, b.destination);
  }

  /** Demande de course. L'identité passager vient du JWT, pas du corps. */
  @Roles('passenger')
  @Post()
  request(
    @CurrentUser('sub') passengerId: string,
    @Body() b: { vehicleType: VehicleType; origin: Pt; destination: Pt },
  ) {
    return this.trips.request(passengerId, b.vehicleType, b.origin, b.destination);
  }

  // Transitions réservées aux conducteurs.
  @Roles('driver') @Post(':id/accept')   accept(@Param('id') id: string)   { return this.trips.accept(id); }
  @Roles('driver') @Post(':id/arriving') arriving(@Param('id') id: string) { return this.trips.arriving(id); }
  @Roles('driver') @Post(':id/start')    start(@Param('id') id: string)    { return this.trips.start(id); }

  /** Fin de course : fige le prix, calcule la commission, règle le portefeuille. */
  @Roles('driver')
  @Post(':id/complete')
  complete(@Param('id') id: string, @Body() b: { method: PaymentMethod; actual?: { km: number; min: number } }) {
    return this.trips.complete(id, b.method, b.actual);
  }

  /** Lien de paiement Wave (passager). */
  @Roles('passenger')
  @Post(':id/pay/wave')
  async payWave(@Param('id') id: string) {
    const trip = await this.prisma.trip.findUnique({ where: { id } });
    const amount = Number(trip?.finalFare ?? trip?.quotedFare ?? 0);
    return this.wave.createCheckout(amount, id);
  }

  /**
   * Lien de paiement Orange Money (passager). On crée d'abord une transaction
   * `pending` portant le pay_token (external_ref) et le notif_token (raw) : la
   * notification OM s'y raccrochera pour confirmer le paiement.
   */
  @Roles('passenger')
  @Post(':id/pay/orange-money')
  async payOrangeMoney(@Param('id') id: string) {
    const trip = await this.prisma.trip.findUnique({ where: { id } });
    const amount = Number(trip?.finalFare ?? trip?.quotedFare ?? 0);
    const om = await this.om.createWebPayment(amount, id);
    await this.prisma.transaction.create({
      data: {
        tripId: id, provider: 'orange_money', method: 'orange_money', direction: 'in',
        amount: BigInt(amount), status: 'pending',
        externalRef: om.pay_token, raw: { notif_token: om.notif_token, payment_url: om.payment_url },
      },
    });
    await this.prisma.trip.update({ where: { id }, data: { paymentStatus: 'processing' } });
    return { payment_url: om.payment_url };
  }

  /** Historique des courses de l'utilisateur (adapté au rôle). */
  @Get('history')
  history(
    @CurrentUser() user: AuthUser,
    @Query('limit') limit?: string,
    @Query('before') before?: string,
  ) {
    return this.trips.history(user.sub, user.role, limit ? +limit : 20, before);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.prisma.trip.findUnique({ where: { id } });
  }

  /** Notation en fin de course (auteur = utilisateur authentifié). */
  @Post(':id/rate')
  rate(
    @Param('id') id: string,
    @CurrentUser('sub') raterId: string,
    @Body() b: { stars: number; comment?: string },
  ) {
    return this.trips.rate(id, raterId, b.stars, b.comment);
  }
}
