import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';

import { PrismaService } from './prisma/prisma.service';
import { PricingService } from './pricing/pricing.service';
import { MatchingService } from './matching/matching.service';
import { RoutingService } from './routing/routing.service';
import { WalletService } from './wallet/wallet.service';
import { WaveService } from './payments/wave.service';
import { OrangeMoneyService } from './payments/orange-money.service';
import { TripsService } from './trips/trips.service';
import { RealtimeGateway } from './realtime/realtime.gateway';
import { AuthService } from './auth/auth.service';
import { DriversService } from './drivers/drivers.service';
import { KycService } from './drivers/kyc.service';
import { StorageService } from './storage/storage.service';
import { AdminService } from './admin/admin.service';
import { MetricsService } from './observability/metrics.service';
import { MetricsInterceptor } from './observability/metrics.interceptor';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RolesGuard } from './auth/roles.guard';

import { AuthController } from './auth/auth.controller';
import { TripsController } from './trips/trips.controller';
import { PaymentsController } from './payments/payments.controller';
import { DriversController } from './drivers/drivers.controller';
import { AdminController } from './admin/admin.controller';
import { ObservabilityController } from './observability/observability.controller';

@Module({
  imports: [
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
      signOptions: { expiresIn: '15m' },
    }),
    // Anti-abus : 120 requêtes / minute par IP (l'OTP est ainsi protégé du bruteforce).
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
  ],
  controllers: [
    AuthController, TripsController, PaymentsController,
    DriversController, AdminController, ObservabilityController,
  ],
  providers: [
    PrismaService, PricingService, MatchingService, RoutingService, WalletService,
    WaveService, OrangeMoneyService, TripsService, RealtimeGateway, AuthService,
    DriversService, KycService, StorageService, AdminService, MetricsService,
    // Auth par défaut, puis rôles, puis rate-limit.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Métriques + logs sur chaque requête HTTP.
    { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor },
  ],
})
export class AppModule {}
