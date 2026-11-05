import { canTransition, assertTransition, timestampField } from './trip-state';

describe('trip-state', () => {
  it('autorise les transitions valides', () => {
    expect(canTransition('requested', 'assigned')).toBe(true);
    expect(canTransition('accepted', 'arriving')).toBe(true);
    expect(canTransition('in_progress', 'completed')).toBe(true);
  });

  it('refuse les transitions invalides', () => {
    expect(canTransition('completed', 'in_progress')).toBe(false);
    expect(canTransition('requested', 'completed')).toBe(false);
    expect(canTransition('cancelled', 'accepted')).toBe(false);
  });

  it('lève sur une transition invalide', () => {
    expect(() => assertTransition('completed', 'requested')).toThrow();
  });

  it('mappe le bon horodatage', () => {
    expect(timestampField('completed')).toBe('completedAt');
    expect(timestampField('accepted')).toBe('acceptedAt');
    expect(timestampField('requested')).toBeNull();
  });
});
