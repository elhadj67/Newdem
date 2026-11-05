import * as crypto from 'crypto';

describe('WaveService.verifySignature', () => {
  const SECRET = 'whsec_test_123';
  let WaveService: any;

  beforeAll(() => {
    process.env.WAVE_WEBHOOK_SECRET = SECRET;
    // Import après avoir posé l'env (le service lit l'env à la construction).
    WaveService = require('./wave.service').WaveService;
  });

  const sign = (body: Buffer) =>
    crypto.createHmac('sha256', SECRET).update(body).digest('hex');

  it('accepte une signature valide', () => {
    const svc = new WaveService();
    const body = Buffer.from(JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed' }));
    expect(svc.verifySignature(body, sign(body))).toBe(true);
  });

  it('rejette une signature falsifiée', () => {
    const svc = new WaveService();
    const body = Buffer.from('{"id":"evt_2"}');
    expect(svc.verifySignature(body, 'deadbeef')).toBe(false);
  });

  it('rejette une signature vide', () => {
    const svc = new WaveService();
    expect(svc.verifySignature(Buffer.from('x'), '')).toBe(false);
  });
});
