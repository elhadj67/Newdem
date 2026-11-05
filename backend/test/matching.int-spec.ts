import { PrismaService } from '../src/prisma/prisma.service';
import { MatchingService } from '../src/matching/matching.service';

/**
 * Intégration : nécessite une base PostgreSQL + PostGIS (DATABASE_URL),
 * schéma appliqué (db/schema.sql). Vérifie que le matching PostGIS retrouve
 * bien un conducteur proche, en ligne et approuvé.
 */
describe('Matching (intégration PostGIS)', () => {
  let prisma: PrismaService;
  let matching: MatchingService;
  const phone = '+221770000099';

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();
    matching = new MatchingService(prisma);

    await prisma.$executeRaw`DELETE FROM users WHERE phone = ${phone}`;
    const user = await prisma.user.create({ data: { phone, role: 'driver' } });
    const driver = await prisma.driver.create({
      data: { userId: user.id, kycStatus: 'approved', status: 'online' },
    });
    await prisma.vehicle.create({
      data: { driverId: driver.id, type: 'car', plate: 'INT-TEST-1' },
    });
    // Position à Dakar (lng, lat).
    await prisma.$executeRaw`
      UPDATE drivers SET last_location = ST_MakePoint(-17.45, 14.69)::geography
      WHERE id = ${driver.id}::uuid`;
  });

  afterAll(async () => {
    await prisma.$executeRaw`DELETE FROM users WHERE phone = ${phone}`;
    await prisma.$disconnect();
  });

  it('trouve un conducteur voiture à proximité', async () => {
    const near = await matching.findNearby('car', -17.451, 14.691, 3000, 5);
    expect(near.length).toBeGreaterThan(0);
    expect(near[0].distance_m).toBeLessThan(3000);
  });

  it('ne retourne rien hors du rayon', async () => {
    // Point très éloigné (Saint-Louis ~ 200 km) avec petit rayon.
    const near = await matching.findNearby('car', -16.49, 16.03, 1000, 5);
    expect(near.length).toBe(0);
  });
});
