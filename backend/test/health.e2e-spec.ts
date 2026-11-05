import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * e2e : démarre l'application complète (nécessite DATABASE_URL).
 * Vérifie le health check et que les routes protégées exigent un JWT.
 */
describe('App (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health -> 200 { status: ok }', async () => {
    const res = await request(app.getHttpServer()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('GET /trips/history sans jeton -> 401', () => {
    return request(app.getHttpServer()).get('/trips/history').expect(401);
  });

  it('POST /auth/otp/request est public -> 201', () => {
    return request(app.getHttpServer())
      .post('/auth/otp/request')
      .send({ phone: '+221770000098' })
      .expect(201);
  });
});
