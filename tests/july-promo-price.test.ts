import { describe, expect, it } from 'vitest';
import { getPriceDisplay, isJulyIntroPromoActive } from '../src/lib/stripePaywall';

describe('July intro price display', () => {
  it('shows £9.99 → £4.99 during July 2026', () => {
    const d = getPriceDisplay(new Date('2026-07-24T12:00:00+01:00'));
    expect(isJulyIntroPromoActive(new Date('2026-07-24T12:00:00+01:00'))).toBe(true);
    expect(d.priceLabel).toBe('£4.99');
    expect(d.compareAtLabel).toBe('£9.99');
    expect(d.promoCaption).toMatch(/July offer/i);
  });

  it('clears compare-at after 31 July 2026', () => {
    const d = getPriceDisplay(new Date('2026-08-01T00:00:00+01:00'));
    expect(isJulyIntroPromoActive(new Date('2026-08-01T00:00:00+01:00'))).toBe(false);
    expect(d.priceLabel).toBe('£4.99');
    expect(d.compareAtLabel).toBeNull();
    expect(d.promoCaption).toBeNull();
  });
});
