import { PricingService } from './pricing.service';

// PrismaService mocké : renvoie un barème fixe, aucune base requise.
function mockPrisma(pricing: any) {
  return { pricing: { findFirst: jest.fn().mockResolvedValue(pricing) } } as any;
}

const CAR = { baseFare: 500, perKm: 300, perMin: 25, minimumFare: 1000, commissionPct: 0.18 };
const MOTO = { baseFare: 250, perKm: 150, perMin: 15, minimumFare: 500, commissionPct: 0.18 };

describe('PricingService', () => {
  it('calcule le tarif voiture et arrondit à 100 FCFA', async () => {
    const svc = new PricingService(mockPrisma(CAR));
    const q = await svc.quote('car', 6.2, 22);
    // 500 + 6.2*300 + 22*25 = 2910 -> arrondi 2900
    expect(q.fare).toBe(2900);
    expect(q.commissionPct).toBe(0.18);
  });

  it('applique la course minimum sur un trajet très court', async () => {
    const svc = new PricingService(mockPrisma(MOTO));
    const q = await svc.quote('moto', 0.5, 2);
    // 250 + 0.5*150 + 2*15 = 355 -> < minimum 500 -> 500
    expect(q.fare).toBe(500);
  });

  it('calcule la commission', () => {
    const svc = new PricingService(mockPrisma(CAR));
    expect(svc.commissionOf(2900, 0.18)).toBe(522);
  });

  it("lève une erreur si aucun barème actif n'existe", async () => {
    const svc = new PricingService(mockPrisma(null));
    await expect(svc.quote('car', 5, 15)).rejects.toThrow();
  });
});
