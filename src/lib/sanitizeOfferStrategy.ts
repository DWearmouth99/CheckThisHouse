/**
 * Keep offer bands commercially realistic vs asking / fair value.
 * AI sometimes invents extreme lowballs or overbids — clamp before PDF / UI.
 */

function parseMoney(raw?: string): number | null {
  if (!raw) return null;
  const pound = raw.match(/£\s*([\d,]+(?:\.\d+)?)/);
  if (pound) {
    const n = parseFloat(pound[1].replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  const digits = raw.replace(/[^0-9.]/g, "");
  if (!digits) return null;
  const n = parseFloat(digits);
  return Number.isFinite(n) ? n : null;
}

function formatOfferGbp(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "—";
  // Walk-away / offer bands: nearest £1,000 (commercial UK convention)
  const rounded = Math.round(n / 1000) * 1000;
  return `£${rounded.toLocaleString("en-GB")}`;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export type OfferStrategyShape = {
  lowOffer: string;
  fairOffer: string;
  premiumOffer: string;
  negotiationTips: string[];
};

/**
 * Returns a corrected offerStrategy. Does not invent tips — only adjusts £ figures.
 */
export function sanitizeOfferStrategy(
  offer: OfferStrategyShape | null | undefined,
  opts: { asking?: string; fairValue?: string; conservative?: string; optimistic?: string }
): OfferStrategyShape | null | undefined {
  if (!offer || typeof offer !== "object") return offer;

  const asking = parseMoney(opts.asking);
  const fairVal = parseMoney(opts.fairValue);
  const cons = parseMoney(opts.conservative);
  const opt = parseMoney(opts.optimistic);

  let low = parseMoney(offer.lowOffer);
  let fair = parseMoney(offer.fairOffer);
  let prem = parseMoney(offer.premiumOffer);

  // Prefer asking as the negotiation anchor; fall back to fair valuation.
  const anchor = asking || fairVal;
  if (!anchor || (!low && !fair && !prem)) {
    return offer;
  }

  // Seed missing legs from anchor if needed
  if (!fair) fair = fairVal || asking || anchor;
  if (!low) low = Math.round(anchor * 0.96);
  if (!prem) prem = Math.round(anchor * 1.01);

  if (asking && fairVal) {
    const stretch = asking / fairVal;

    if (stretch > 1.06) {
      // Clearly overpriced vs our fair band — negotiate toward fair, don't chase asking.
      const targetFair = fairVal;
      const targetLow = Math.round(fairVal * 0.96);
      const targetPrem = Math.round(Math.min(asking, fairVal * 1.03));
      low = clamp(low!, targetLow * 0.98, targetFair);
      fair = clamp(fair!, targetFair * 0.98, targetPrem);
      prem = clamp(prem!, fair, Math.min(asking, Math.round(fairVal * 1.05)));
    } else if (stretch < 0.95) {
      // Asking looks cheap vs fair — don't lowball the seller into walking away.
      low = clamp(low!, Math.round(asking * 0.98), asking);
      fair = clamp(fair!, asking, Math.round(Math.min(fairVal, asking * 1.03)));
      prem = clamp(prem!, fair, Math.round(Math.min(fairVal, asking * 1.05)));
    } else {
      // Asking roughly in line with fair value — tight, realistic UK negotiation band.
      low = clamp(low!, Math.round(asking * 0.94), Math.round(asking * 0.97));
      fair = clamp(fair!, Math.round(asking * 0.97), asking);
      prem = clamp(prem!, asking, Math.round(asking * 1.03));
    }
  } else if (asking) {
    low = clamp(low!, Math.round(asking * 0.94), Math.round(asking * 0.97));
    fair = clamp(fair!, Math.round(asking * 0.97), asking);
    prem = clamp(prem!, asking, Math.round(asking * 1.03));
  } else if (fairVal) {
    low = clamp(low!, Math.round(fairVal * 0.94), Math.round(fairVal * 0.97));
    fair = clamp(fair!, Math.round(fairVal * 0.97), fairVal);
    prem = clamp(prem!, fairVal, Math.round(fairVal * 1.03));
  }

  // Hard safety rails vs asking (when known)
  if (asking) {
    // Never open more than ~8% below asking unless already corrected for overpricing above
    const floor = Math.round(asking * 0.9);
    if (low! < floor) low = floor;
    // Never set walk-away more than ~5% over asking
    const ceiling = Math.round(asking * 1.05);
    if (prem! > ceiling) prem = ceiling;
  }

  // Respect valuation envelope when present — but never override a live asking band
  // (stale LLM fair/conservative must not yank offers away from the listing ask)
  if (!asking) {
    if (cons && low! < cons * 0.95) low = Math.round(cons * 0.95);
    if (opt && prem! > opt * 1.02) prem = Math.round(opt * 1.02);
  } else if (fairVal && Math.abs(asking - fairVal) / fairVal <= 0.15) {
    if (cons && low! < cons * 0.95) low = Math.round(cons * 0.95);
    if (opt && prem! > opt * 1.02) prem = Math.round(opt * 1.02);
  }

  // Enforce ordering: opener ≤ fair ≤ walk-away
  if (fair! < low!) fair = low!;
  if (prem! < fair!) prem = fair!;

  return {
    ...offer,
    lowOffer: formatOfferGbp(low!),
    fairOffer: formatOfferGbp(fair!),
    premiumOffer: formatOfferGbp(prem!),
    negotiationTips: Array.isArray(offer.negotiationTips) ? offer.negotiationTips : [],
  };
}
