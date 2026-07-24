/**
 * Authoritative UK transaction-tax estimates for reports.
 * Rates as of mid-2026 reference data — always label estimates as advisory.
 *
 * Scotland ADS: 8% of purchase price for additional dwellings on/after 5 Dec 2024
 * (was 6% before that date). Source: Revenue Scotland.
 */

import { resolveReportRegion } from './ukCoverage';

export type UkNation = 'scotland' | 'england_ni' | 'wales' | 'unknown';

export type BuyerGoalLike = string;

function parseMoney(raw?: string): number | null {
  if (!raw) return null;
  const pound = raw.match(/£\s*([\d,]+(?:\.\d+)?)/);
  if (pound) {
    const n = parseFloat(pound[1]!.replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  const digits = raw.replace(/[^0-9.]/g, '');
  if (!digits) return null;
  const n = parseFloat(digits);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function formatGbp(n: number): string {
  return `£${Math.round(n).toLocaleString('en-GB')}`;
}

function bandedTax(price: number, bands: { upTo: number; rate: number }[]): number {
  let tax = 0;
  let prev = 0;
  for (const band of bands) {
    const slice = Math.max(0, Math.min(price, band.upTo) - prev);
    tax += slice * band.rate;
    prev = band.upTo;
    if (price <= band.upTo) break;
  }
  return tax;
}

export function detectUkNation(postcode?: string, placeText?: string): UkNation {
  const region = resolveReportRegion(postcode);
  if (region === 'scotland') return 'scotland';
  if (region === 'wales') return 'wales';
  if (region === 'northern_ireland' || region === 'england') return 'england_ni';

  const place = (placeText || '').toLowerCase();
  if (
    /\b(scotland|edinburgh|glasgow|aberdeen|dundee|inverness|fife|lothian|highland|stirling|perth|dalkeith)\b/.test(
      place
    )
  ) {
    return 'scotland';
  }
  if (/\b(wales|cardiff|swansea|newport|wrexham)\b/.test(place)) return 'wales';
  if (/\b(england|london|manchester|birmingham|leeds|liverpool|bristol)\b/.test(place)) {
    return 'england_ni';
  }
  return 'unknown';
}

function isFirstTimeBuyer(goal: BuyerGoalLike): boolean {
  return /first[-\s]?time/i.test(goal || '');
}

function likelyAdditionalDwelling(goal: BuyerGoalLike): boolean {
  const g = (goal || '').toLowerCase();
  return (
    g.includes('buy-to-let') ||
    g.includes('buy to let') ||
    g.includes('investor')
  );
}

/** Scotland residential LBTT (standard). */
function scotlandLbtt(price: number, firstTimeBuyer: boolean): number {
  const nil = firstTimeBuyer ? 175_000 : 145_000;
  const bands = [
    { upTo: nil, rate: 0 },
    { upTo: 250_000, rate: 0.02 },
    { upTo: 325_000, rate: 0.05 },
    { upTo: 750_000, rate: 0.1 },
    { upTo: Number.POSITIVE_INFINITY, rate: 0.12 },
  ];
  return bandedTax(price, bands);
}

/** Scotland ADS — 8% of whole price from 5 Dec 2024 when price ≥ £40,000. */
const SCOTLAND_ADS_RATE = 0.08;
const SCOTLAND_ADS_THRESHOLD = 40_000;

function scotlandAds(price: number): number {
  if (price < SCOTLAND_ADS_THRESHOLD) return 0;
  return price * SCOTLAND_ADS_RATE;
}

/** England & NI SDLT from 1 Apr 2025 (standard residential). */
function englandSdlt(price: number, additional: boolean): number {
  if (additional) {
    return bandedTax(price, [
      { upTo: 125_000, rate: 0.05 },
      { upTo: 250_000, rate: 0.07 },
      { upTo: 925_000, rate: 0.1 },
      { upTo: 1_500_000, rate: 0.15 },
      { upTo: Number.POSITIVE_INFINITY, rate: 0.17 },
    ]);
  }
  return bandedTax(price, [
    { upTo: 125_000, rate: 0 },
    { upTo: 250_000, rate: 0.02 },
    { upTo: 925_000, rate: 0.05 },
    { upTo: 1_500_000, rate: 0.1 },
    { upTo: Number.POSITIVE_INFINITY, rate: 0.12 },
  ]);
}

/**
 * England & NI First-Time Buyers’ Relief (from 1 Apr 2025):
 * 0% to £300k, 5% £300k–£500k; unavailable above £500k (standard rates apply).
 */
function englandSdltFtb(price: number): { total: number; reliefApplied: boolean } {
  if (price > 500_000) {
    return { total: englandSdlt(price, false), reliefApplied: false };
  }
  const total = bandedTax(price, [
    { upTo: 300_000, rate: 0 },
    { upTo: 500_000, rate: 0.05 },
    { upTo: Number.POSITIVE_INFINITY, rate: 0.05 },
  ]);
  return { total, reliefApplied: true };
}

/** Wales LTT residential (simplified current schedule). */
function walesLtt(price: number, additional: boolean): number {
  if (additional) {
    return bandedTax(price, [
      { upTo: 180_000, rate: 0.04 },
      { upTo: 250_000, rate: 0.075 },
      { upTo: 400_000, rate: 0.09 },
      { upTo: 750_000, rate: 0.115 },
      { upTo: 1_500_000, rate: 0.14 },
      { upTo: Number.POSITIVE_INFINITY, rate: 0.16 },
    ]);
  }
  return bandedTax(price, [
    { upTo: 225_000, rate: 0 },
    { upTo: 400_000, rate: 0.06 },
    { upTo: 750_000, rate: 0.075 },
    { upTo: 1_500_000, rate: 0.1 },
    { upTo: Number.POSITIVE_INFINITY, rate: 0.12 },
  ]);
}

export type TaxEstimate = {
  nation: UkNation;
  summary: string;
  total: number;
};

export function estimateTransactionTax(opts: {
  price: number;
  nation: UkNation;
  buyerGoal: BuyerGoalLike;
}): TaxEstimate | null {
  const { price, nation, buyerGoal } = opts;
  if (!Number.isFinite(price) || price <= 0 || nation === 'unknown') return null;

  const ftb = isFirstTimeBuyer(buyerGoal);
  const additional = likelyAdditionalDwelling(buyerGoal);

  if (nation === 'scotland') {
    const lbtt = scotlandLbtt(price, ftb && !additional);
    if (additional) {
      const ads = scotlandAds(price);
      const total = lbtt + ads;
      return {
        nation,
        total,
        summary: `Est. LBTT ${formatGbp(lbtt)} + ADS 8% (${formatGbp(ads)}) = ${formatGbp(total)} (Scotland; ADS is 8% of the full price for additional dwellings on/after 5 Dec 2024 — was 6% before). Confirm with a solicitor.`,
      };
    }
    return {
      nation,
      total: lbtt,
      summary: `Est. LBTT ${formatGbp(lbtt)} (Scotland${ftb ? ', first-time buyer nil-rate to £175k' : ''}). No ADS assumed (main residence / not an additional dwelling). Confirm with a solicitor.`,
    };
  }

  if (nation === 'england_ni') {
    if (ftb && !additional) {
      const { total, reliefApplied } = englandSdltFtb(price);
      return {
        nation,
        total,
        summary: reliefApplied
          ? `Est. SDLT ${formatGbp(total)} (England/NI, first-time buyer relief). Confirm with a solicitor.`
          : `Est. SDLT ${formatGbp(total)} (England/NI; first-time buyer relief unavailable above £500k — standard rates). Confirm with a solicitor.`,
      };
    }
    const total = englandSdlt(price, additional);
    return {
      nation,
      total,
      summary: `Est. SDLT ${formatGbp(total)} (England/NI${additional ? ', higher rates for additional dwelling' : ''}). Confirm with a solicitor.`,
    };
  }

  if (nation === 'wales') {
    const total = walesLtt(price, additional);
    return {
      nation,
      total,
      summary: `Est. LTT ${formatGbp(total)} (Wales${additional ? ', higher residential rates' : ''}). Confirm with a solicitor.`,
    };
  }

  return null;
}

/** Prompt block so the model does not invent outdated ADS/SDLT rates. */
export const UK_PROPERTY_TAX_RULES_PROMPT = `
UK PROPERTY TRANSACTION TAX RULES (must follow — do not use outdated rates):
- Scotland uses LBTT (not SDLT). Residential bands: 0% to £145k (FTB nil-rate to £175k), 2% to £250k, 5% to £325k, 10% to £750k, 12% above.
- Scotland Additional Dwelling Supplement (ADS) is 8% of the FULL purchase price for additional dwellings when the price is £40,000 or more, for transactions on or after 5 December 2024. Do NOT quote 6% ADS — that rate ended on 4 December 2024.
- England & Northern Ireland use SDLT. Wales uses LTT. Never apply English SDLT bands to a Scottish postcode (EH, G, AB, DD, etc.).
- In investmentMetrics.stampDuty, state the nation, show LBTT/SDLT/LTT and ADS separately when relevant, and label as an estimate.
`.trim();

/**
 * Overwrite AI stampDuty with a calculated estimate when nation + price are known.
 */
export function applyStampDutyEstimate(
  analysis: Record<string, unknown>,
  buyerGoal: BuyerGoalLike
): void {
  const location = (analysis.location || {}) as {
    postcode?: string;
    town?: string;
    address?: string;
  };
  const price =
    parseMoney(typeof analysis.price === 'string' ? analysis.price : undefined) ||
    parseMoney(
      typeof (analysis.valuation as { fair?: string } | undefined)?.fair === 'string'
        ? (analysis.valuation as { fair: string }).fair
        : undefined
    );

  if (!price) return;

  const nation = detectUkNation(
    location.postcode,
    [location.town, location.address, typeof analysis.title === 'string' ? analysis.title : '']
      .filter(Boolean)
      .join(' ')
  );

  const estimate = estimateTransactionTax({ price, nation, buyerGoal });
  if (!estimate) return;

  const metrics =
    analysis.investmentMetrics && typeof analysis.investmentMetrics === 'object'
      ? ({ ...(analysis.investmentMetrics as Record<string, unknown>) } as Record<string, unknown>)
      : {};
  metrics.stampDuty = estimate.summary;
  analysis.investmentMetrics = metrics;
}
