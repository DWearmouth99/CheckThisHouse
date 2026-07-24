/**
 * Growth assumption pinned in code from Land Registry price-paid samples.
 *
 * Formula (postcode-sector + property-type window):
 * 1. Take LR sales in the same postcode *sector* (outward + first inward digit,
 *    e.g. DL6 3) and matching property type (Detached/Semi/Terraced/Flat),
 *    with dates in the last GROWTH_WINDOW_YEARS (default 10).
 * 2. Require ≥ MIN_SALES total and ≥ MIN_YEAR_BUCKETS distinct calendar years.
 * 3. Composition-robust CAGR:
 *    - early = median of all prices in the FIRST 3 calendar years with sales
 *    - late  = median of all prices in the LAST 3 calendar years with sales,
 *      excluding the subject property's own sale(s) from the late window
 *    - Δyears = midpoint(last 3 years) − midpoint(first 3 years) (min 1)
 *    - centralPct = ((late / early) ^ (1 / Δyears) − 1) × 100, 1dp, clamp [-2, 8]
 * 4. If the sample is too small → FALLBACK_CENTRAL_PCT (2.5).
 * 5. Band by sample size: ±1.0pp when n≥20, ±2.0pp when n<20.
 */

import type { LandRegistrySale } from './landRegistryLookup';
import type { GrowthAssumptions } from './deterministicForecasts';

export const GROWTH_WINDOW_YEARS = 10;
export const MIN_SALES = 8;
export const MIN_YEAR_BUCKETS = 3;
export const FALLBACK_CENTRAL_PCT = 2.5;
/** @deprecated use spreadForSampleSize — kept for callers that imported the old constant */
export const SPREAD_PCT = 1.0;
export const SPREAD_LARGE_N = 1.0;
export const SPREAD_SMALL_N = 2.0;
export const SPREAD_N_THRESHOLD = 20;
export const WINDOW_YEARS = 3;

export type GrowthComputeInput = {
  sales: LandRegistrySale[];
  postcode?: string | null;
  propertyType?: string | null;
  /** Subject address label — excluded from the late (last-3-years) median bucket */
  subjectAddress?: string | null;
  asOf?: Date;
};

export type GrowthComputeResult = GrowthAssumptions & {
  sampleSize: number;
  yearBuckets: number;
  usedFallback: boolean;
  sector: string;
  propertyType: string;
  spreadPct: number;
  earlyMedian?: number;
  lateMedian?: number;
  deltaYears?: number;
  /** Sales that entered the filtered sample (for diagnostics) */
  sampleSales?: { date: string; amount: number; address: string }[];
};

function sectorOf(postcode: string): string {
  const compact = postcode.replace(/\s+/g, '').toUpperCase();
  // e.g. DL63ND → DL6 3
  const m = compact.match(/^([A-Z]{1,2}\d{1,2})(\d)([A-Z]{2})$/);
  if (!m) return compact.slice(0, 4);
  return `${m[1]} ${m[2]}`;
}

function normalizeType(t?: string | null): string {
  const s = String(t || '').toLowerCase();
  if (/detach/.test(s)) return 'detached';
  if (/semi/.test(s)) return 'semi-detached';
  if (/terrace/.test(s)) return 'terraced';
  if (/flat|apartment|maisonette/.test(s)) return 'flat';
  return s || 'unknown';
}

function median(nums: number[]): number {
  const a = [...nums].sort((x, y) => x - y);
  if (!a.length) return 0;
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid]! : (a[mid - 1]! + a[mid]!) / 2;
}

function clampPct(p: number): number {
  return Math.min(8, Math.max(-2, Math.round(p * 10) / 10));
}

export function spreadForSampleSize(n: number): number {
  return n >= SPREAD_N_THRESHOLD ? SPREAD_LARGE_N : SPREAD_SMALL_N;
}

function normAddress(a: string): string {
  return a.replace(/\s+/g, ' ').trim().toLowerCase();
}

function isSubjectSale(s: LandRegistrySale, subjectAddress?: string | null): boolean {
  if (!subjectAddress) return false;
  const sub = normAddress(subjectAddress);
  const label = normAddress(s.addressLabel || '');
  if (!sub || !label) return false;
  // Match if either contains the other (LR labels vary slightly)
  return label === sub || label.includes(sub) || sub.includes(label);
}

function mean(nums: number[]): number {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function computeGrowthAssumptionsFromSales(input: GrowthComputeInput): GrowthComputeResult {
  const asOf = input.asOf || new Date();
  const sector = input.postcode ? sectorOf(input.postcode) : '';
  const wantType = normalizeType(input.propertyType);
  const cutoff = new Date(asOf);
  cutoff.setFullYear(cutoff.getFullYear() - GROWTH_WINDOW_YEARS);

  const filtered = (input.sales || []).filter((s) => {
    const d = new Date(s.date);
    if (!Number.isFinite(d.getTime()) || d < cutoff) return false;
    if (sector) {
      const saleSector = sectorOf(s.postcode || '');
      if (saleSector !== sector) return false;
    }
    if (wantType !== 'unknown') {
      if (normalizeType(s.propertyType) !== wantType) return false;
    }
    return Number.isFinite(s.amount) && s.amount > 0;
  });

  const sampleSales = filtered
    .map((s) => ({ date: s.date, amount: s.amount, address: s.addressLabel }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.amount - b.amount);

  const byYear = new Map<number, LandRegistrySale[]>();
  for (const s of filtered) {
    const y = new Date(s.date).getFullYear();
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y)!.push(s);
  }
  const years = [...byYear.keys()].sort((a, b) => a - b);
  const sampleSize = filtered.length;
  const yearBuckets = years.length;
  const spread = spreadForSampleSize(sampleSize);

  if (sampleSize < MIN_SALES || yearBuckets < MIN_YEAR_BUCKETS) {
    const central = FALLBACK_CENTRAL_PCT;
    return {
      lowPct: clampPct(central - spread),
      centralPct: central,
      highPct: clampPct(central + spread),
      basis: `Fallback ${central}% a year — fewer than ${MIN_SALES} ${wantType || 'local'} sales in sector ${sector || 'n/a'} over ${GROWTH_WINDOW_YEARS} years (n=${sampleSize}, years=${yearBuckets})`,
      sampleSize,
      yearBuckets,
      usedFallback: true,
      sector,
      propertyType: wantType,
      spreadPct: spread,
      sampleSales,
    };
  }

  const firstYears = years.slice(0, WINDOW_YEARS);
  const lastYears = years.slice(-WINDOW_YEARS);

  const earlyPrices = firstYears.flatMap((y) => (byYear.get(y) || []).map((s) => s.amount));
  const lateSales = lastYears.flatMap((y) => byYear.get(y) || []);
  const latePricesExSubject = lateSales
    .filter((s) => !isSubjectSale(s, input.subjectAddress))
    .map((s) => s.amount);

  // If excluding subject empties the late window, fall back to including it (with a note)
  const latePrices = latePricesExSubject.length > 0 ? latePricesExSubject : lateSales.map((s) => s.amount);
  const excludedSubject = latePricesExSubject.length < lateSales.length;

  const early = median(earlyPrices);
  const late = median(latePrices);
  const deltaYears = Math.max(1, mean(lastYears) - mean(firstYears));
  const ratio = early > 0 ? late / early : 0;
  const central =
    ratio > 0 && Number.isFinite(ratio)
      ? clampPct((Math.pow(ratio, 1 / deltaYears) - 1) * 100)
      : FALLBACK_CENTRAL_PCT;

  const y0 = firstYears[0]!;
  const y1 = lastYears[lastYears.length - 1]!;
  const subjectNote = excludedSubject ? '; subject sale excluded from late window' : '';

  return {
    lowPct: clampPct(central - spread),
    centralPct: central,
    highPct: clampPct(central + spread),
    basis: `CAGR of ${WINDOW_YEARS}y early vs late median ${wantType} prices in ${sector} (${y0}–${firstYears[firstYears.length - 1]}→${lastYears[0]}–${y1}, n=${sampleSize}, ±${spread}pp, Land Registry Price Paid${subjectNote})`,
    sampleSize,
    yearBuckets,
    usedFallback: false,
    sector,
    propertyType: wantType,
    spreadPct: spread,
    earlyMedian: Math.round(early),
    lateMedian: Math.round(late),
    deltaYears: Math.round(deltaYears * 10) / 10,
    sampleSales,
  };
}
