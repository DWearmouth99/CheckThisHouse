/**
 * DfE GIAS (Get Information About Schools) — code selects nearest schools.
 * Data: src/data/gias-schools-open.csv (see scripts/fetch-reproducibility-data.ts).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { formatOfstedRatingCell } from './notOnRecordRules';
import { DISTANCE_CAPS_MILES, emptyWithinCapMessage } from './distanceCaps';

/** Max radius for "local" schools (miles). Beyond → omit. */
export const SCHOOL_RADIUS_MILES = DISTANCE_CAPS_MILES.schools;

export type GiasSchool = {
  urn: string;
  name: string;
  phase: string;
  status: string;
  lat: number;
  lng: number;
  ofsted: string;
  ofstedDate?: string;
  /** Newer than ofstedDate (report-card / ungraded) when present */
  ofstedNewerDate?: string;
  postcode: string;
};

export type SelectedSchool = {
  name: string;
  distance: string;
  /** Display cell — already formatted for PDF (Rule A) */
  rating: string;
  urn: string;
  phase: string;
  miles: number;
  ofsted: string;
  ofstedDate: string;
  ofstedNewerDate: string;
};

let cache: GiasSchool[] | null = null;

function dataPath(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '../data/gias-schools-open.csv');
}

export function emitGiasOperatorAction(): void {
  console.warn(`
=== OPERATOR ACTION NEEDED ===
Schools selection requires the DfE GIAS open-schools extract.

1. Run: npx tsx scripts/fetch-reproducibility-data.ts
   (pulls https://dfe-digital.github.io/gias-data/schools.json and writes
    src/data/gias-schools-open.csv — open Primary/Secondary with coordinates)
2. Ofsted grade + date come from Ofsted MI "latest inspections" (fetch script
   downloads it). Modern Edubase bulk no longer includes OfstedLastInsp.

Without this file, areaAnalysis.schools is left empty (never LLM-invented).
=== END OPERATOR ACTION ===
`);
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') inQ = false;
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

export function loadGiasSchools(): GiasSchool[] {
  if (cache) return cache;
  const p = dataPath();
  if (!fs.existsSync(p)) {
    emitGiasOperatorAction();
    cache = [];
    return cache;
  }
  const text = fs.readFileSync(p, 'utf8');
  const lines = text.trim().split(/\r?\n/);
  const header = parseCsvLine(lines[0] || '').map((h) => h.toLowerCase());
  const idx = (name: string) => header.findIndex((h) => h === name);
  const iUrn = idx('urn');
  const iName = idx('name');
  const iPhase = idx('phase');
  const iStatus = idx('status');
  const iLat = idx('lat');
  const iLng = idx('lng');
  const iOfsted = idx('ofsted') >= 0 ? idx('ofsted') : idx('ofstedrating (name)');
  // Slim extract uses ofstedDate; raw/legacy edubase uses OfstedLastInsp
  const iDate =
    idx('ofsteddate') >= 0
      ? idx('ofsteddate')
      : idx('ofstedlastinsp') >= 0
        ? idx('ofstedlastinsp')
        : -1;
  const iNewer = idx('ofstednewerdate');
  const iPc = idx('postcode');
  const rows: GiasSchool[] = [];
  for (const line of lines.slice(1)) {
    const cols = parseCsvLine(line);
    if (cols.length < 6) continue;
    const lat = Number(cols[iLat >= 0 ? iLat : 4]);
    const lng = Number(cols[iLng >= 0 ? iLng : 5]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    rows.push({
      urn: cols[iUrn >= 0 ? iUrn : 0] || '',
      name: cols[iName >= 0 ? iName : 1] || '',
      phase: cols[iPhase >= 0 ? iPhase : 2] || '',
      status: cols[iStatus >= 0 ? iStatus : 3] || '',
      lat,
      lng,
      ofsted: cols[iOfsted >= 0 ? iOfsted : 6] || '',
      ofstedDate: iDate >= 0 ? cols[iDate] || '' : '',
      ofstedNewerDate: iNewer >= 0 ? cols[iNewer] || '' : '',
      postcode: cols[iPc >= 0 ? iPc : cols.length - 1] || '',
    });
  }
  cache = rows;
  console.log(`[gias] loaded ${rows.length} open schools from ${path.basename(p)}`);
  return rows;
}

export function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function isPrimary(phase: string): boolean {
  return /primary|middle deemed primary/i.test(phase);
}

function isSecondary(phase: string): boolean {
  return /secondary|middle deemed secondary|all-through/i.test(phase);
}

/**
 * Selection rule: open schools only within SCHOOL_RADIUS_MILES; nearest 2 primaries
 * + nearest 2 secondaries by haversine; sorted by distance; deduped; max 4.
 * Distances at 1dp miles. Empty → caller shows within-cap message.
 */
export function selectNearestSchools(
  lat: number,
  lng: number,
  schools?: GiasSchool[]
): SelectedSchool[] {
  const pool = (schools || loadGiasSchools()).filter((s) => /open/i.test(s.status));
  if (!pool.length) return [];

  const withDist = pool
    .map((s) => ({
      ...s,
      miles: haversineMiles(lat, lng, s.lat, s.lng),
    }))
    .filter((s) => s.miles <= SCHOOL_RADIUS_MILES);

  const primaries = withDist
    .filter((s) => isPrimary(s.phase))
    .sort((a, b) => a.miles - b.miles || a.name.localeCompare(b.name))
    .slice(0, 2);
  const secondaries = withDist
    .filter((s) => isSecondary(s.phase) && !primaries.some((p) => p.urn === s.urn))
    .sort((a, b) => a.miles - b.miles || a.name.localeCompare(b.name))
    .slice(0, 2);

  const selected = [...primaries, ...secondaries]
    .sort((a, b) => a.miles - b.miles || a.name.localeCompare(b.name))
    .slice(0, 4);

  for (const s of selected) {
    console.log(
      `[gias] select ${s.phase}: ${s.name} ${s.miles.toFixed(1)} mi (URN ${s.urn}, Ofsted=${s.ofsted || 'n/a'}${s.ofstedDate ? ` @ ${s.ofstedDate}` : ''})`
    );
  }

  return selected.map((s) => {
    const rating = formatOfstedRatingCell({
      grade: s.ofsted,
      inspectionDate: s.ofstedDate,
      newerInspectionDate: s.ofstedNewerDate,
    });
    return {
      name: s.name,
      distance: `${s.miles.toFixed(1)} miles`,
      rating,
      urn: s.urn,
      phase: s.phase,
      miles: Math.round(s.miles * 10) / 10,
      ofsted: s.ofsted || '',
      ofstedDate: s.ofstedDate || '',
      ofstedNewerDate: s.ofstedNewerDate || '',
    };
  });
}

/** Overwrite areaAnalysis.schools from GIAS selection. */
export function applyGiasSchools(
  analysis: Record<string, unknown>,
  lat: number | null | undefined,
  lng: number | null | undefined
): void {
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    console.warn('[gias] no property coordinates — schools not selected');
    return;
  }
  const selected = selectNearestSchools(lat, lng);
  const area =
    analysis.areaAnalysis && typeof analysis.areaAnalysis === 'object'
      ? ({ ...(analysis.areaAnalysis as Record<string, unknown>) } as Record<string, unknown>)
      : {};
  area.schools = selected.map((s) => ({
    name: s.name,
    distance: s.distance,
    rating: s.rating,
    ofsted: s.ofsted,
    ofstedDate: s.ofstedDate,
    ofstedNewerDate: s.ofstedNewerDate,
  }));
  if (!selected.length) {
    area.schoolsEmptyMessage = emptyWithinCapMessage('schools', SCHOOL_RADIUS_MILES);
    console.log(`[gias] ${area.schoolsEmptyMessage}`);
  } else {
    delete area.schoolsEmptyMessage;
  }
  analysis.verifiedSchools = selected;
  analysis.areaAnalysis = area;
}
