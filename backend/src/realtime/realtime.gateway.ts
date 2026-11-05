import {
  WebSocketGateway, WebSocketServer, SubscribeMessage, MessageBody,
  ConnectedSocket, OnGatewayConnection,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { MatchingService } from '../matching/matching.service';

/**
 * Canal temps réel (Socket.IO), authentifié par JWT à la CONNEXION :
 * le client passe son jeton dans `handshake.auth.token` (ou l'en-tête
 * Authorization). Un socket non authentifié est déconnecté -> les
 * handlers de message travaillent sur une identité de confiance.
 *
 *  - Le conducteur pousse sa position (~toutes les 4-5 s) -> MàJ PostGIS
 *    + diffusion aux passagers de sa course active.
 *  - Événements de course poussés aux salons `trip:<id>` et `driver:<id>`.
 */
@WebSocketGateway({ cors: { origin: '*' } })
export class RealtimeGateway implements OnGatewayConnection {
  private readonly log = new Logger(RealtimeGateway.name);
  @WebSocketServer() server: Server;

  constructor(private jwt: JwtService, private matching: MatchingService) {}

  handleConnection(client: Socket) {
    try {
      const raw =
        client.handshake.auth?.token ??
        (client.handshake.headers.authorization ?? '').replace('Bearer ', '');
      client.data.user = this.jwt.verify(raw);   // { sub, role }
    } catch {
      this.log.warn(`Socket refusé (jeton invalide) : ${client.id}`);
      client.disconnect(true);
    }
  }

  // ------- émission (appelée par TripsService) -------
  toTrip(tripId: string, event: string, payload: any) {
    this.server.to(`trip:${tripId}`).emit(event, payload);
  }
  toDriver(driverId: string, event: string, payload: any) {
    this.server.to(`driver:${driverId}`).emit(event, payload);
  }

  // ------- réception (socket déjà authentifié) -------
  @SubscribeMessage('driver:online')
  onDriverOnline(@MessageBody() d: { driverId: string }, @ConnectedSocket() s: Socket) {
    if (s.data.user?.role !== 'driver') return { ok: false };
    s.join(`driver:${d.driverId}`);
    return { ok: true };
  }

  @SubscribeMessage('trip:subscribe')
  onTripSubscribe(@MessageBody() d: { tripId: string }, @ConnectedSocket() s: Socket) {
    s.join(`trip:${d.tripId}`);
    return { ok: true };
  }

  @SubscribeMessage('driver:location')
  async onDriverLocation(
    @MessageBody() d: { driverId: string; lng: number; lat: number; tripId?: string },
    @ConnectedSocket() s: Socket,
  ) {
    if (s.data.user?.role !== 'driver') return { ok: false };
    await this.matching.updateLocation(d.driverId, d.lng, d.lat);
    if (d.tripId) this.toTrip(d.tripId, 'driver:location', { lng: d.lng, lat: d.lat });
    return { ok: true };
  }
}
