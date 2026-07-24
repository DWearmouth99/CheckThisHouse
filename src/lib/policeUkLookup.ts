/**
 * police.uk street-level crime within the property's Census 2021 LSOA,
 * rate = 12-month total / ONS LSOA usual residents * 1000.
 *
 * Geography (matched): LSOA21 — incidents queried with police.uk poly= from the
 * LSOA boundary; population is ONS Census 2021 usual residents for the same LSOA.
 * (A 1-mile street radius would not match LSOA population — that mismatch caused
 * nonsense rates like 0.7 when a hardcoded ~1800 denominator was used.)
 */

import { extractPostcode } from './addressMatch';
import {
  emitOnsPopulationOperatorAction,
  resolveOnsLsoaPopulation,
} from './onsLsoaPopulation';

export type CrimeLookup = {
  postcode: string;
  lat: number | null;
  lng: number | null;
  lsoa21cd?: string | null;
  /** Total crimes across the 12-month window */
  crimeCountYear: number | null;
  /** Latest month in the window (YYYY-MM) */
  monthEnd: string | null;
  monthStart: string | null;
  population: number | null;
  populationSource: string;
  /** Rate per 1,000 residents / year — null if outside sanity gate or insufficient */
  incidentsPerThousand: number | null;
  /** Customer-facing rate line (or unreliable message) */
  label: string;
  /** Interpretation-only hint for the LLM (no per-1,000 figures) */
  interpretationHint: string;
  sourceUrl: string;
  reliable: boolean;
  status?: 'ok' | 'insufficient_data' | 'suppressed';
  /** Debug log of inputs */
  debug: {
    monthlyCounts: { month: string; count: number }[];
    incidents12m: number;
    population: number;
    rate: number | null;
    gate: 'ok' | 'too_low' | 'too_high' | 'missing' | 'insufficient_data';
  };
};

export type CrimeRateFromMonths = {
  status: 'ok' | 'insufficient_data' | 'suppressed';
  rate: number | null;
  total: number;
  gate: CrimeLookup['debug']['gate'];
  reliable: boolean;
  label: string;
};

const RATE_MIN = 5;
const RATE_MAX = 400;
export const CRIME_UNRELIABLE =
  'Crime rate could not be reliably computed — view local data on police.uk';

const LSOA_BOUNDARY_URL =
  'https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/LSOA_2021_EW_BSC_V4_RUC/FeatureServer/0/query';

async function geocodePostcode(
  postcode: string
): Promise<{ lat: number; lng: number; lsoa21cd: string } | null> {
  const compact = postcode.replace(/\s+/g, '');
  const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(compact)}`, {
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const lat = data?.result?.latitude;
  const lng = data?.result?.longitude;
  const lsoa21cd = String(data?.result?.codes?.lsoa || data?.result?.lsoa || '')
    .trim()
    .toUpperCase();
  if (typeof lat !== 'number' || typeof lng !== 'number' || !/^E\d{8}$/.test(lsoa21cd)) {
    return null;
  }
  return { lat, lng, lsoa21cd };
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

/**
 * Requires exactly 12 monthly rows; sums counts; rate = total / population * 1000.
 * Fewer than 12 months → insufficient_data (never a rate).
 */
export function computeCrimeRateFromMonths(
  monthlyData: { month: string; count: number }[],
  population: number
): CrimeRateFromMonths {
  if (!Array.isArray(monthlyData) || monthlyData.length !== 12) {
    return {
      status: 'insufficient_data',
      rate: null,
      total: 0,
      gate: 'insufficient_data',
      reliable: false,
      label: 'insufficient_data',
    };
  }
  if (!population || population <= 0 || !Number.isFinite(population)) {
    return {
      status: 'insufficient_data',
      rate: null,
      total: 0,
      gate: 'insufficient_data',
      reliable: false,
      label: 'insufficient_data',
    };
  }
  const total = monthlyData.reduce((a, m) => a + (Number(m.count) || 0), 0);
  const { rate, gate } = computeCrimeRate(total, population);
  if (gate !== 'ok' || rate == null) {
    return {
      status: 'suppressed',
      rate: null,
      total,
      gate,
      reliable: false,
      label: gate,
    };
  }
  return {
    status: 'ok',
    rate,
    total,
    gate: 'ok',
    reliable: true,
    label: 'ok',
  };
}

const MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** e.g. 2025-12 → "Dec 2025" */
export function formatCrimeMonthLabel(monthEnd: string): string {
  const m = monthEnd.match(/^(\d{4})-(\d{2})$/);
  if (!m) return monthEnd;
  const mon = MONTH_SHORT[Number(m[2]) - 1];
  return mon ? `${mon} ${m[1]}` : monthEnd;
}

/** Single customer-facing rate line from the data object. */
export function formatCrimeRateLabel(rate: number, monthEnd: string): string {
  const incidentWord = rate === 1 ? 'incident' : 'incidents';
  return `${rate} ${incidentWord} per 1,000 residents (12 months to ${formatCrimeMonthLabel(monthEnd)}, police.uk)`;
}

export function formatRecordedCrimes(count: number): string {
  return count === 1 ? '1 recorded crime' : `${count} recorded crimes`;
}

function interpretationForRate(rate: number, crimeCountYear: number): string {
  const recorded = formatRecordedCrimes(crimeCountYear);
  if (rate <= 40) {
    return `${recorded} in this LSOA over 12 months — levels appear low for a UK residential area on this metric.`;
  }
  if (rate <= 90) {
    return `${recorded} in this LSOA over 12 months — levels appear typical for many UK residential areas on this metric.`;
  }
  return `${recorded} in this LSOA over 12 months — levels appear elevated relative to quieter UK residential areas on this metric.`;
}

/** Simplify ring to ≤ maxPts for police.uk poly URL limits. */
function simplifyRing(ring: [number, number][], maxPts = 40): [number, number][] {
  if (ring.length <= maxPts) return ring;
  const step = Math.ceil(ring.length / (maxPts - 1));
  const out: [number, number][] = [];
  for (let i = 0; i < ring.length; i += step) out.push(ring[i]!);
  const first = ring[0]!;
  const last = out[out.length - 1]!;
  if (first[0] !== last[0] || first[1] !== last[1]) out.push(first);
  return out;
}

async function fetchLsoaPolygon(lsoa21cd: string): Promise<[number, number][] | null> {
  const params = new URLSearchParams({
    where: `LSOA21CD='${lsoa21cd}'`,
    outFields: 'LSOA21CD',
    returnGeometry: 'true',
    outSR: '4326',
    f: 'geojson',
  });
  const res = await fetch(`${LSOA_BOUNDARY_URL}?${params}`, {
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const geom = data?.features?.[0]?.geometry;
  if (!geom) return null;
  let ring: number[][] | null = null;
  if (geom.type === 'Polygon') ring = geom.coordinates?.[0] || null;
  else if (geom.type === 'MultiPolygon') ring = geom.coordinates?.[0]?.[0] || null;
  if (!ring || ring.length < 3) return null;
  // GeoJSON is [lng, lat]; police.uk poly wants lat,lng
  const latLng = ring.map((c) => [c[1], c[0]] as [number, number]);
  return simplifyRing(latLng);
}

async function fetchMonthCountInPoly(
  poly: [number, number][],
  month: string
): Promise<number | null> {
  const polyParam = poly.map(([lat, lng]) => `${lat},${lng}`).join(':');
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const url = `https://data.police.uk/api/crimes-street/all-crime?poly=${encodeURIComponent(polyParam)}&date=${month}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(25000) });
      if (res.status === 429 || res.status >= 500 || !res.ok) {
        await new Promise((r) => setTimeout(r, 400 * Math.pow(2, attempt)));
        continue;
      }
      const crimes = await res.json();
      return Array.isArray(crimes) ? crimes.length : 0;
    } catch {
      await new Promise((r) => setTimeout(r, 400 * Math.pow(2, attempt)));
    }
  }
  return null;
}

/** In-process cache so twin fixture runs share the same police.uk window. */
const crimeCache = new Map<string, CrimeLookup>();

function emptyDebug(): CrimeLookup['debug'] {
  return {
    monthlyCounts: [],
    incidents12m: 0,
    population: 0,
    rate: null,
    gate: 'missing',
  };
}

function unreliableResult(
  partial: Partial<CrimeLookup> & { postcode: string }
): CrimeLookup {
  return {
    lat: null,
    lng: null,
    crimeCountYear: null,
    monthEnd: null,
    monthStart: null,
    population: null,
    populationSource: 'n/a',
    incidentsPerThousand: null,
    label: CRIME_UNRELIABLE,
    interpretationHint: 'Local crime data unavailable for this address.',
    sourceUrl: 'https://data.police.uk/',
    reliable: false,
    status: 'insufficient_data',
    debug: emptyDebug(),
    ...partial,
  };
}

export async function lookupCrimeForAddress(address: string): Promise<CrimeLookup> {
  const postcode = extractPostcode(address) || '';
  const cacheKey = postcode.replace(/\s+/g, '').toUpperCase();
  if (cacheKey && crimeCache.has(cacheKey)) return crimeCache.get(cacheKey)!;

  const sourceUrl = 'https://data.police.uk/';
  const store = (result: CrimeLookup) => {
    if (cacheKey) crimeCache.set(cacheKey, result);
    return result;
  };

  if (!postcode) {
    return store(
      unreliableResult({
        postcode: '',
        interpretationHint: 'Local crime data unavailable for this address.',
      })
    );
  }

  try {
    const geo = await geocodePostcode(postcode);
    if (!geo) {
      return store(
        unreliableResult({
          postcode,
          interpretationHint: 'Could not geocode postcode for crime lookup.',
        })
      );
    }

    const ons = await resolveOnsLsoaPopulation(geo.lsoa21cd);
    if (!ons) {
      emitOnsPopulationOperatorAction();
      return store(
        unreliableResult({
          postcode,
          lat: geo.lat,
          lng: geo.lng,
          lsoa21cd: geo.lsoa21cd,
          population: null,
          populationSource: 'unresolved',
          interpretationHint: 'ONS LSOA population could not be resolved for this postcode.',
          debug: { ...emptyDebug(), gate: 'insufficient_data' },
        })
      );
    }

    const poly = await fetchLsoaPolygon(geo.lsoa21cd);
    if (!poly) {
      return store(
        unreliableResult({
          postcode,
          lat: geo.lat,
          lng: geo.lng,
          lsoa21cd: geo.lsoa21cd,
          population: ons.population,
          populationSource: ons.source,
          interpretationHint: 'Could not load LSOA boundary for police.uk polygon query.',
          debug: { ...emptyDebug(), population: ons.population, gate: 'insufficient_data' },
        })
      );
    }

    const end = (await latestCrimeMonth()) || new Date().toISOString().slice(0, 7);
    const months = last12Months(end);
    if (months.length !== 12) {
      return store(
        unreliableResult({
          postcode,
          lat: geo.lat,
          lng: geo.lng,
          lsoa21cd: geo.lsoa21cd,
          population: ons.population,
          populationSource: ons.source,
          interpretationHint: 'Could not build a complete 12-month crime window.',
        })
      );
    }

    const monthlyCounts: { month: string; count: number }[] = [];
    for (const month of months) {
      const count = await fetchMonthCountInPoly(poly, month);
      if (count == null) {
        console.warn(`[police.uk] ${postcode} month=${month} fetch failed — insufficient_data`);
        return store(
          unreliableResult({
            postcode,
            lat: geo.lat,
            lng: geo.lng,
            lsoa21cd: geo.lsoa21cd,
            population: ons.population,
            populationSource: ons.source,
            monthEnd: months[months.length - 1] || end,
            monthStart: months[0] || null,
            interpretationHint: 'Incomplete police.uk monthly series — verify on police.uk.',
            debug: {
              monthlyCounts,
              incidents12m: 0,
              population: ons.population,
              rate: null,
              gate: 'insufficient_data',
            },
          })
        );
      }
      monthlyCounts.push({ month, count });
      console.log(`[police.uk] ${postcode} ${month}: ${count} crimes (LSOA ${geo.lsoa21cd})`);
    }

    const computed = computeCrimeRateFromMonths(monthlyCounts, ons.population);
    const reliable = computed.status === 'ok' && computed.rate != null;
    const monthEnd = months[months.length - 1]!;
    const monthStart = months[0]!;

    console.log(
      `[police.uk] ${postcode} LSOA=${geo.lsoa21cd} incidents_12m=${computed.total} (${monthStart}→${monthEnd}) population=${ons.population} (${ons.source}) rate=${computed.rate ?? 'n/a'} status=${computed.status} gate=${computed.gate}`
    );

    const label = reliable
      ? formatCrimeRateLabel(computed.rate!, monthEnd)
      : CRIME_UNRELIABLE;

    const interpretationHint = reliable
      ? interpretationForRate(computed.rate!, computed.total)
      : 'Treat local crime as needing a direct police.uk check before relying on a rate.';

    return store({
      postcode,
      lat: geo.lat,
      lng: geo.lng,
      lsoa21cd: geo.lsoa21cd,
      crimeCountYear: computed.total,
      monthEnd,
      monthStart,
      population: ons.population,
      populationSource: ons.source,
      incidentsPerThousand: reliable ? computed.rate : null,
      label,
      interpretationHint,
      sourceUrl,
      reliable,
      status: computed.status,
      debug: {
        monthlyCounts,
        incidents12m: computed.total,
        population: ons.population,
        rate: computed.rate,
        gate: computed.gate,
      },
    });
  } catch (err: any) {
    console.warn('[police.uk]', err?.message || err);
    return store(
      unreliableResult({
        postcode,
        interpretationHint: 'Crime lookup failed — verify on police.uk.',
      })
    );
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

/** True when interpretation still embeds a per-1,000 figure or the numeric rate. */
export function crimeInterpretationLeaksRate(text: string, rate: number | null): boolean {
  if (!text) return false;
  if (/per\s*1,?000/i.test(text)) return true;
  if (rate != null && new RegExp(`(?<!\\d)${String(rate).replace('.', '\\.')}(?!\\d)`).test(text)) {
    return true;
  }
  return false;
}
