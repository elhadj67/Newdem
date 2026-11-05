import { Injectable } from '@nestjs/common';
import { Registry, collectDefaultMetrics, Counter, Histogram } from 'prom-client';

/** Registre de métriques Prometheus (HTTP + métier + process). */
@Injectable()
export class MetricsService {
  readonly registry = new Registry();
  readonly httpDuration: Histogram<string>;
  readonly httpTotal: Counter<string>;
  readonly tripsRequested: Counter<string>;
  readonly payments: Counter<string>;

  constructor() {
    collectDefaultMetrics({ register: this.registry });

    this.httpDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'Durée des requêtes HTTP',
      labelNames: ['method', 'route', 'status'],
      buckets: [0.05, 0.1, 0.3, 0.5, 1, 2, 5],
      registers: [this.registry],
    });
    this.httpTotal = new Counter({
      name: 'http_requests_total',
      help: 'Nombre de requêtes HTTP',
      labelNames: ['method', 'route', 'status'],
      registers: [this.registry],
    });
    this.tripsRequested = new Counter({
      name: 'newdem_trips_requested_total',
      help: 'Courses demandées',
      labelNames: ['vehicle_type'],
      registers: [this.registry],
    });
    this.payments = new Counter({
      name: 'newdem_payments_total',
      help: 'Paiements traités',
      labelNames: ['provider', 'status'],
      registers: [this.registry],
    });
  }
}
