import {
  Controller, Get, Res, ServiceUnavailableException,
} from '@nestjs/common';
import { Response } from 'express';
import { MetricsService } from './metrics.service';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../auth/auth.decorators';

@Controller()
export class ObservabilityController {
  constructor(private metrics: MetricsService, private prisma: PrismaService) {}

  /** Exposition Prometheus (à scraper ; restreindre l'accès réseau en prod). */
  @Public()
  @Get('metrics')
  async metricsEndpoint(@Res() res: Response) {
    res.set('Content-Type', this.metrics.registry.contentType);
    res.send(await this.metrics.registry.metrics());
  }

  /** Liveness + vérification de la base (readiness). */
  @Public()
  @Get('health')
  async health() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', db: 'up' };
    } catch {
      throw new ServiceUnavailableException({ status: 'error', db: 'down' });
    }
  }
}
