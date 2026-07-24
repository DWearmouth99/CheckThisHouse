/**
 * Class 2 — code-computed comparative stats.
 * LLM may narrate only; numerals must match these structs.
 */

import type { EpcRecord } from './epcLookup';
import type { CrimeLookup } from './policeUkLookup';

export type ComparativeStat = {
  id: string;
  value: number;
  /** Display string that must appear (or whose core numeral must appear) in narration */
  displayValue: string;
  comparator: string;
  basis: string;
  sampleSize: number;
  unit?: string;
};

/** Rough England & Wales detached / semi floor-area percentiles from open EPC summaries (static). */
const FLOOR_AREA_PERCENTILES: Record<string, { p50: number; p75: number; p90: number; n: number }> = {
  detached: { p50: 118, p75: 150, p90: 200, n: 120000 },
  'semi-detached': { p50: 88, p75: 105, p90: 130, n: 180000 },
  terraced: { p50: 78, p75: 95, p90: 115, n: 200000 },
  flat: { p50: 55, p75: 70, p90: 90, n: 150000 },
  bungalow: { p50: 85, p75: 105, p90: 130, n: 40000 },
  default: { p50: 90, p75: 115, p90: 150, n: 500000 },
};

/** Modal / common EPC band by era (illustrative national open-data summary). */
const ERA_MODAL_EPC: Record<string, { modal: string; topQuarter: string }> = {
  'pre-1900': { modal: 'E', topQuarter: 'D' },
  '1900-1929': { modal: 'E', topQuarter: 'D' },
  '1930-1949': { modal: 'D', topQuarter: 'C' },
  '1950-1966': { modal: 'D', topQuarter: 'C' },
  '1967-1975': { modal: 'D', topQuarter: 'C' },
  '1976-1982': { modal: 'D', topQuarter: 'C' },
  '1983-1990': { modal: 'D', topQuarter: 'C' },
  '1991-1995': { modal: 'C', topQuarter: 'B' },
  '1996-2002': { modal: 'C', topQuarter: 'B' },
  '2003-2006': { modal: 'C', topQuarter: 'B' },
  '2007-2011': { modal: 'B', topQuarter: 'A' },
  '2012-onwards': { modal: 'B', topQuarter: 'A' },
  default: { modal: 'D', topQuarter: 'C' },
};

/** England & Wales police.uk-style rate medians (incidents / 1,000 / year) — static reference. */
export const CRIME_NATIONAL_MEDIAN = 78;
export const CRIME_NORTH_EAST_MEDIAN = 95;

function typeKey(propertyType: string): string {
  const t = propertyType.toLowerCase();
  if (/semi/i.test(t)) return 'semi-detached';
  if (/terrace|mid-terrace|end-terrace/i.test(t)) return 'terraced';
  if (/bungalow/i.test(t)) return 'bungalow';
  if (/flat|apartment|maisonette/i.test(t)) return 'flat';
  if (/detached/i.test(t)) return 'detached';
  return 'default';
}

function eraKey(ageBand: string): string {
  const s = ageBand.toLowerCase().replace(/\s+/g, '');
  if (/before.?1900|pre.?1900|1850|1880|1890/i.test(s)) return 'pre-1900';
  if (/1900|1910|1920|1929/i.test(s)) return '1900-1929';
  if (/1930|1940|1949/i.test(s)) return '1930-1949';
  if (/1950|1960|1966/i.test(s)) return '1950-1966';
  if (/1967|1970|1975/i.test(s)) return '1967-1975';
  if (/1976|1980|1982/i.test(s)) return '1976-1982';
  if (/1983|1985|1990/i.test(s)) return '1983-1990';
  if (/1991|1995/i.test(s)) return '1991-1995';
  if (/1996|2002/i.test(s)) return '1996-2002';
  if (/2003|2006/i.test(s)) return '2003-2006';
  if (/2007|2011/i.test(s)) return '2007-2011';
  if (/2012|2018|2020|2021|onwards/i.test(s)) return '2012-onwards';
  return 'default';
}

/** Approximate percentile from p50/p75/p90 anchors. */
export function approxPercentile(area: number, dist: { p50: number; p75: number; p90: number }): number {
  if (area <= dist.p50) return Math.max(5, Math.round((area / dist.p50) * 50));
  if (area <= dist.p75) {
    return Math.round(50 + ((area - dist.p50) / (dist.p75 - dist.p50)) * 25);
  }
  if (area <= dist.p90) {
    return Math.round(75 + ((area - dist.p75) / (dist.p90 - dist.p75)) * 15);
  }
  return Math.min(99, Math.round(90 + Math.min(9, ((area - dist.p90) / dist.p90) * 20)));
}

function parseMoney(raw?: string | null): number | null {
  if (!raw) return null;
  const m = String(raw).replace(/,/g, '').match(/£?\s*([\d]+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
}

export function computeComparativeStats(opts: {
  epc?: EpcRecord | null;
  postcodeArea?: string | null;
  subjectPsm?: number | null;
  compsPsm?: number[];
  crime?: CrimeLookup | null;
  growthSinceLastSalePct?: number | null;
  sectorGrowthPct?: number | null;
}): ComparativeStat[] {
  const stats: ComparativeStat[] = [];
  const epc = opts.epc;
  const area = Number(epc?.floorAreaSqm);
  const type = typeKey(epc?.propertyType || '');
  const dist = FLOOR_AREA_PERCENTILES[type] || FLOOR_AREA_PERCENTILES.default!;
  const region = (opts.postcodeArea || 'England & Wales').toUpperCase();

  if (Number.isFinite(area) && area > 0) {
    const pct = approxPercentile(area, dist);
    stats.push({
      id: 'floorAreaPercentile',
      value: pct,
      displayValue: String(pct),
      comparator: `${type.replace(/-/g, ' ')} homes (${region} EPC open-data summary)`,
      basis: `TOTAL_FLOOR_AREA vs type distribution (n≈${dist.n})`,
      sampleSize: dist.n,
      unit: 'percentile',
    });
  }

  if (opts.subjectPsm != null && opts.compsPsm && opts.compsPsm.length >= 2) {
    const median =
      [...opts.compsPsm].sort((a, b) => a - b)[Math.floor(opts.compsPsm.length / 2)] || 0;
    if (median > 0) {
      const premiumPct = Math.round(((opts.subjectPsm - median) / median) * 1000) / 10;
      stats.push({
        id: 'psmVsComps',
        value: premiumPct,
        displayValue: String(premiumPct),
        comparator: 'street / sector comps £/sqm median',
        basis: `Subject £/sqm vs ${opts.compsPsm.length} matched comps`,
        sampleSize: opts.compsPsm.length,
        unit: 'percent',
      });
    }
  }

  if (epc?.currentRating && epc.constructionAgeBand) {
    const era = ERA_MODAL_EPC[eraKey(epc.constructionAgeBand)] || ERA_MODAL_EPC.default!;
    const band = epc.currentRating.toUpperCase();
    const rank = 'ABCDEFG'.indexOf(band);
    const modalRank = 'ABCDEFG'.indexOf(era.modal);
    // Encode: 1 = at/better than modal for era; used in narration templates
    stats.push({
      id: 'epcVsEra',
      value: rank >= 0 && modalRank >= 0 ? modalRank - rank : 0,
      displayValue: band,
      comparator: `most common ${era.modal} for this era; top quarter ~${era.topQuarter}`,
      basis: `EPC band ${band} vs era modal ${era.modal}`,
      sampleSize: 1,
      unit: 'band',
    });
  }

  if (opts.crime?.reliable && opts.crime.incidentsPerThousand != null) {
    const rate = opts.crime.incidentsPerThousand;
    const vsNational = Math.round(((rate - CRIME_NATIONAL_MEDIAN) / CRIME_NATIONAL_MEDIAN) * 1000) / 10;
    stats.push({
      id: 'crimeVsNational',
      value: vsNational,
      displayValue: String(rate),
      comparator: `national median ${CRIME_NATIONAL_MEDIAN} per 1,000`,
      basis: 'police.uk rate vs static national median',
      sampleSize: 1,
      unit: 'rate',
    });
  }

  if (opts.growthSinceLastSalePct != null && opts.sectorGrowthPct != null) {
    const delta =
      Math.round((opts.growthSinceLastSalePct - opts.sectorGrowthPct) * 10) / 10;
    stats.push({
      id: 'growthVsSector',
      value: delta,
      displayValue: String(opts.growthSinceLastSalePct),
      comparator: `sector average ${opts.sectorGrowthPct}% over same period`,
      basis: 'Subject sale-to-sale growth vs sector CAGR',
      sampleSize: 1,
      unit: 'percent',
    });
  }

  return stats;
}

/** Pull £/sqm figures from mechanical comp notes. */
export function extractCompPsm(notes: string[]): number[] {
  const out: number[] = [];
  for (const n of notes) {
    const m = String(n).match(/£([\d,]+)\s*\/\s*sqm/i);
    if (m) out.push(Number(m[1]!.replace(/,/g, '')));
  }
  return out;
}

export function parseSubjectPsm(raw?: string | null): number | null {
  if (!raw) return null;
  const m = String(raw).replace(/,/g, '').match(/([\d]+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
}

export { parseMoney };
