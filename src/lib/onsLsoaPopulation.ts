/**
 * ONS population for a Census 2021 LSOA (usual residents).
 * Prefer optional local CSV; otherwise Nomis Census 2021 API for that LSOA code.
 * Never invents or hardcodes a denominator.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export type OnsLsoaPopulation = {
  lsoa21cd: string;
  population: number;
  source: string;
  midYearOrCensus: string;
};

const memoryCache = new Map<string, OnsLsoaPopulation | null>();
let csvIndex: Map<string, OnsLsoaPopulation> | null | undefined;

function csvPathCandidates(): string[] {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return [
    path.resolve(here, '../data/ons-lsoa-population.csv'),
    path.resolve(process.cwd(), 'src/data/ons-lsoa-population.csv'),
    path.resolve(process.cwd(), 'data/ons-lsoa-population.csv'),
  ];
}

function loadCsvIndex(): Map<string, OnsLsoaPopulation> | null {
  if (csvIndex !== undefined) return csvIndex;
  for (const p of csvPathCandidates()) {
    try {
      if (!fs.existsSync(p)) continue;
      const text = fs.readFileSync(p, 'utf8');
      const lines = text.trim().split(/\r?\n/);
      if (lines.length < 2) continue;
      const header = lines[0]!.toLowerCase().split(',').map((h) => h.trim().replace(/"/g, ''));
      const iCode = header.findIndex((h) => /lsoa/.test(h) && /cd|code/.test(h));
      const iPop = header.findIndex((h) => /population|usual.?residents|all.?ages|obs_value/.test(h));
      const iYear = header.findIndex((h) => /year|mid|census/.test(h));
      if (iCode < 0 || iPop < 0) continue;
      const map = new Map<string, OnsLsoaPopulation>();
      for (const line of lines.slice(1)) {
        const cols = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
        const code = (cols[iCode] || '').toUpperCase();
        const pop = Number(cols[iPop]);
        if (!/^E\d{8}$/i.test(code) || !Number.isFinite(pop) || pop <= 0) continue;
        map.set(code, {
          lsoa21cd: code,
          population: Math.round(pop),
          source: `ONS LSOA population CSV (${path.basename(p)})`,
          midYearOrCensus: iYear >= 0 ? cols[iYear] || 'csv' : 'csv',
        });
      }
      if (map.size > 0) {
        csvIndex = map;
        console.log(`[ons-lsoa] loaded ${map.size} LSOA populations from ${p}`);
        return csvIndex;
      }
    } catch (err: any) {
      console.warn('[ons-lsoa] CSV read failed:', err?.message || err);
    }
  }
  csvIndex = null;
  return null;
}

/**
 * Resolve usual-resident population for an LSOA21CD.
 * Returns null when unmatched — caller must suppress the crime rate.
 */
export async function resolveOnsLsoaPopulation(
  lsoa21cd: string
): Promise<OnsLsoaPopulation | null> {
  const code = String(lsoa21cd || '')
    .trim()
    .toUpperCase();
  if (!/^E\d{8}$/.test(code)) return null;
  if (memoryCache.has(code)) return memoryCache.get(code)!;

  const fromCsv = loadCsvIndex()?.get(code);
  if (fromCsv) {
    memoryCache.set(code, fromCsv);
    return fromCsv;
  }

  try {
    // Nomis Census 2021 — usual residents (total) for a single LSOA
    const url =
      `https://www.nomisweb.co.uk/api/v01/dataset/NM_2021_1.data.csv` +
      `?geography=${encodeURIComponent(code)}&measures=20100` +
      `&select=GEOGRAPHY_CODE,C2021_RESTYPE_3_CODE,OBS_VALUE`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) {
      memoryCache.set(code, null);
      return null;
    }
    const text = await res.text();
    const lines = text.trim().split(/\r?\n/);
    for (const line of lines.slice(1)) {
      const cols = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
      // Prefer Total: All usual residents (code 0)
      const geo = cols[0];
      const restype = cols[1];
      const obs = Number(cols[2]);
      if (
        geo?.toUpperCase() === code &&
        (restype === '0' || restype === '') &&
        Number.isFinite(obs) &&
        obs > 0
      ) {
        const hit: OnsLsoaPopulation = {
          lsoa21cd: code,
          population: Math.round(obs),
          source: `ONS Census 2021 usual residents via Nomis (${code})`,
          midYearOrCensus: 'Census 2021',
        };
        memoryCache.set(code, hit);
        return hit;
      }
    }
    // Fallback: first positive OBS_VALUE for this geography
    for (const line of lines.slice(1)) {
      const cols = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
      const geo = cols[0];
      const obs = Number(cols[cols.length - 1]);
      if (geo?.toUpperCase() === code && Number.isFinite(obs) && obs > 0) {
        const hit: OnsLsoaPopulation = {
          lsoa21cd: code,
          population: Math.round(obs),
          source: `ONS Census 2021 usual residents via Nomis (${code})`,
          midYearOrCensus: 'Census 2021',
        };
        memoryCache.set(code, hit);
        return hit;
      }
    }
  } catch (err: any) {
    console.warn('[ons-lsoa] Nomis fetch failed:', err?.message || err);
  }

  memoryCache.set(code, null);
  return null;
}

export function emitOnsPopulationOperatorAction(): void {
  console.warn(`
=== OPERATOR ACTION NEEDED ===
Crime rates need an ONS LSOA population denominator (Census 2021 usual residents).

Automatic path: Nomis API NM_2021_1 is queried at runtime per LSOA (no download).
Optional offline cache: place a CSV at src/data/ons-lsoa-population.csv with columns:
  lsoa21cd,population,mid_year
Bulk source: ONS "Lower layer Super Output Area population estimates" or Census 2021
TS001 via Nomis / ons.gov.uk (Open Government Licence).

Without a matched LSOA population the crime section suppresses to
"could not be reliably computed" — never a guessed denominator.
=== END OPERATOR ACTION ===
`);
}
