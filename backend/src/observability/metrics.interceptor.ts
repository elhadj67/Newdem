import {
  Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { MetricsService } from './metrics.service';

/** Mesure chaque requête HTTP (durée + compteur) et journalise méthode/route/statut/latence. */
@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  private readonly log = new Logger('HTTP');
  constructor(private metrics: MetricsService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<any> {
    if (ctx.getType() !== 'http') return next.handle();

    const req = ctx.switchToHttp().getRequest();
    const start = process.hrtime.bigint();

    return next.handle().pipe(
      finalize(() => {
        const res = ctx.switchToHttp().getResponse();
        const route = req.route?.path ?? req.url?.split('?')[0] ?? 'unknown';
        const labels = { method: req.method, route, status: String(res.statusCode) };
        const seconds = Number(process.hrtime.bigint() - start) / 1e9;

        this.metrics.httpDuration.observe(labels, seconds);
        this.metrics.httpTotal.inc(labels);
        this.log.log(`${req.method} ${route} ${res.statusCode} ${(seconds * 1000).toFixed(0)}ms`);
      }),
    );
  }
}
