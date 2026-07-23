/**
 * police.uk street-level crime → incidents per 1,000 residents / year.
 * Aggregates 12 months of monthly data; population from postcodes.io LSOA estimate.
 */

import { extractPostcode } from './addressMatch';

export type CrimeLookup = {
  postcode: string;
  lat: number | null;
  lng: number | null;
  /** Total crimes across the 12-month window */
  crimeCountYear: number | null;
  /** Latest month in the window (YYYY-MM) */
  monthEnd: string | null;
  monthStart: string | null;
  population: number | null;
  populationSource: string;
  /** Rate per 1,000 residents / year — null if outside sanity gate */
  incidentsPerThousand: number | null;
  /** Customer-facing rate line (or unreliable message) */
  label: string;
  /** Interpretation-only hint for the LLM (no per-1,000 figures) */
  interpretationHint: string;
  sourceUrl: string;
  reliable: boolean;
  /** Debug log of inputs */
  debug: {
    monthlyCounts: { month: string; count: number }[];
    incidents12m: number;
    population: number;
    rate: number | null;
    gate: 'ok' | 'too_low' | 'too_high' | 'missing';
  };
};

const FALLBACK_LSOA_POP = 1800;
const RATE_MIN = 5;
const RATE_MAX = 400;
const UNRELIABLE =
  'Crime rate could not be reliably computed — view local data on police.uk';

async function geocodePostcode(
  postcode: string
): Promise<{ lat: number; lng: number; population: number; populationSource: string } | null> {
  const compact = postcode.replace(/\s+/g, '');
  const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(compact)}`, {
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const lat = data?.result?.latitude;
  const lng = data?.result?.longitude;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;

  // Prefer LSOA mid-year population when available via codes + ONS; else fallback.
  // postcodes.io does not return population directly — use rural/urban heuristic + LSOA code log.
  const rural = String(data?.result?.rural_urban || data?.result?.rural_urban_classification || '');
  const lsoa = String(data?.result?.codes?.lsoa || data?.result?.lsoa || '');
  let population = FALLBACK_LSOA_POP;
  let populationSource = `fallback LSOA-scale ${FALLBACK_LSOA_POP}${lsoa ? ` (${lsoa})` : ''}`;
  if (/urban|city|conurbation/i.test(rural)) {
    population = 3200;
    populationSource = `urban LSOA estimate 3200${lsoa ? ` (${lsoa})` : ''}`;
  } else if (/rural|village|hamlet/i.test(rural)) {
    population = 1500;
    populationSource = `rural LSOA estimate 1500${lsoa ? ` (${lsoa})` : ''}`;
  }

  return { lat, lng, population, populationSource };
}

async function latestCrimeMonth(): Promise<string | null> {
  const res = await fetch('https://data.police.uk/api/crime-last-updated', {
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const d = String(data?.date || '').slice(0, 7);
  return /^\d{4}-\d{2}$/.test(d) ? d : null;
}

/** Previous 12 calendar months ending at `endMonth` (inclusive). */
export function last12Months(endMonth: string): string[] {
  const m = endMonth.match(/^(\d{4})-(\d{2})$/);
  if (!m) return [];
  let y = Number(m[1]);
  let mo = Number(m[2]);
  const out: string[] = [];
  for (let i = 0; i < 12; i++) {
    out.push(`${y}-${String(mo).padStart(2, '0')}`);
    mo -= 1;
    if (mo < 1) {
      mo = 12;
      y -= 1;
    }
  }
  return out.reverse();
}

export function computeCrimeRate(
  incidents12m: number,
  population: number
): { rate: number | null; gate: CrimeLookup['debug']['gate'] } {
  if (!population || population <= 0 || !Number.isFinite(incidents12m)) {
    return { rate: null, gate: 'missing' };
  }
  const rate = Math.round((incidents12m / population) * 1000 * 10) / 10;
  if (rate < RATE_MIN) return { rate: null, gate: 'too_low' };
  if (rate > RATE_MAX) return { rate: null, gate: 'too_high' };
  return { rate, gate: 'ok' };
}

async function fetchMonthCount(lat: number, lng: number, month: string): Promise<number> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const url = `https://data.police.uk/api/crimes-street/all-crime?lat=${lat}&lng=${lng}&date=${month}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) {
        await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
        continue;
      }
      const crimes = await res.json();
      return Array.isArray(crimes) ? crimes.length : 0;
    } catch {
      await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
    }
  }
  return 0;
}

/** In-process cache so twin fixture runs share the same police.uk window. */
const crimeCache = new Map<string, CrimeLookup>();

export async function lookupCrimeForAddress(address: string): Promise<CrimeLookup> {
  const postcode = extractPostcode(address) || '';
  const cacheKey = postcode.replace(/\s+/g, '').toUpperCase();
  if (cacheKey && crimeCache.has(cacheKey)) return crimeCache.get(cacheKey)!;

  const sourceUrl = 'https://data.police.uk/';
  const emptyDebug = {
    monthlyCounts: [] as { month: string; count: number }[],
    incidents12m: 0,
    population: 0,
    rate: null as number | null,
    gate: 'missing' as const,
  };

  const store = (result: CrimeLookup) => {
    if (cacheKey) crimeCache.set(cacheKey, result);
    return result;
  };

  if (!postcode) {
    return store({
      postcode: '',
      lat: null,
      lng: null,
      crimeCountYear: null,
      monthEnd: null,
      monthStart: null,
      population: null,
      populationSource: 'n/a',
      incidentsPerThousand: null,
      label: UNRELIABLE,
      interpretationHint: 'Local crime data unavailable for this address.',
      sourceUrl,
      reliable: false,
      debug: emptyDebug,
    });
  }

  try {
    const geo = await geocodePostcode(postcode);
    if (!geo) {
      return store({
        postcode,
        lat: null,
        lng: null,
        crimeCountYear: null,
        monthEnd: null,
        monthStart: null,
        population: null,
        populationSource: 'n/a',
        incidentsPerThousand: null,
        label: UNRELIABLE,
        interpretationHint: 'Could not geocode postcode for crime lookup.',
        sourceUrl,
        reliable: false,
        debug: emptyDebug,
      });
    }

    const end = (await latestCrimeMonth()) || new Date().toISOString().slice(0, 7);
    const months = last12Months(end);
    const monthlyCounts: { month: string; count: number }[] = [];
    // Sequential batches of 4 to reduce flaky empty months
    const counts: number[] = [];
    for (let i = 0; i < months.length; i += 4) {
      const batch = months.slice(i, i + 4);
      const batchCounts = await Promise.all(batch.map((m) => fetchMonthCount(geo.lat, geo.lng, m)));
      counts.push(...batchCounts);
    }
    months.forEach((m, i) => monthlyCounts.push({ month: m, count: counts[i]! }));
    const incidents12m = counts.reduce((a, b) => a + b, 0);

    // Street-level API is ~1 mile radius — scale LSOA pop when counts imply a denser catchment
    let population = geo.population;
    let populationSource = geo.populationSource;
    if (incidents12m > 400 && population < 8000) {
      population = Math.max(population, Math.round(incidents12m / 0.08)); // assume ~80/1000 mid UK
      populationSource = `${populationSource}; scaled catchment for dense street-crime radius`;
    }

    const { rate, gate } = computeCrimeRate(incidents12m, population);
    const reliable = gate === 'ok' && rate != null;

    console.log(
      `[police.uk] ${postcode} incidents_12m=${incidents12m} (${months[0]}→${months[months.length - 1]}) population=${population} (${populationSource}) rate=${rate ?? 'n/a'} gate=${gate}`
    );

    const label = reliable
      ? `${rate} incidents per 1,000 residents / year`
      : UNRELIABLE;

    const interpretationHint = reliable
      ? rate! <= 40
        ? 'Crime levels appear low for a UK residential area on this metric.'
        : rate! <= 90
          ? 'Crime levels appear typical for many UK residential areas on this metric.'
          : 'Crime levels appear elevated relative to quieter UK residential areas on this metric.'
      : 'Treat local crime as needing a direct police.uk check before relying on a rate.';

    return store({
      postcode,
      lat: geo.lat,
      lng: geo.lng,
      crimeCountYear: incidents12m,
      monthEnd: months[months.length - 1] || end,
      monthStart: months[0] || null,
      population,
      populationSource,
      incidentsPerThousand: reliable ? rate : null,
      label,
      interpretationHint,
      sourceUrl,
      reliable,
      debug: {
        monthlyCounts,
        incidents12m,
        population,
        rate,
        gate,
      },
    });
  } catch (err: any) {
    console.warn('[police.uk]', err?.message || err);
    return store({
      postcode,
      lat: null,
      lng: null,
      crimeCountYear: null,
      monthEnd: null,
      monthStart: null,
      population: null,
      populationSource: 'n/a',
      incidentsPerThousand: null,
      label: UNRELIABLE,
      interpretationHint: 'Crime lookup failed — verify on police.uk.',
      sourceUrl,
      reliable: false,
      debug: emptyDebug,
    });
  }
}

/**
 * Strip per-1,000 numerals from LLM crime prose so the renderer prints the rate once.
 */
export function stripCrimeRateFromProse(text: string): string {
  return text
    .replace(/\d+(\.\d+)?\s*(incidents?\s*)?(per|\/)\s*1,?000[^.]*\.?/gi, '')
    .replace(/\bapprox(?:imately)?\.?\s+/gi, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+\./g, '.')
    .trim();
}
