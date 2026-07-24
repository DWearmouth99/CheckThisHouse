/**
 * NaPTAN transport selection + fixed A-road lookup.
 * Data: src/data/naptan-stops.csv (see scripts/fetch-reproducibility-data.ts).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { haversineMiles } from './giasSchools';
import { DISTANCE_CAPS_MILES, emptyWithinCapMessage } from './distanceCaps';

export type NaptanStop = {
  atco: string;
  name: string;
  stopType: string;
  lat: number;
  lng: number;
  status: string;
  locality: string;
};

export type TransportRow = {
  type: string;
  line: string;
  time: string;
  miles?: number;
  atco?: string;
};

/** Config: max search radius for A-roads (miles). */
export const A_ROAD_RADIUS_MILES = DISTANCE_CAPS_MILES.aRoads;
export const BUS_RADIUS_MILES = DISTANCE_CAPS_MILES.bus;
export const STATION_RADIUS_MILES = DISTANCE_CAPS_MILES.stations;

/**
 * Fixed trunk-road waypoints (A-roads / motorways). Selection = name of any
 * waypoint within A_ROAD_RADIUS_MILES, nearest first, max 2.
 */
export const A_ROAD_WAYPOINTS: { name: string; lat: number; lng: number }[] = [
  { name: 'A19', lat: 54.4, lng: -1.35 },
  { name: 'A19', lat: 54.55, lng: -1.3 },
  { name: 'A1(M)', lat: 54.35, lng: -1.45 },
  { name: 'A1(M)', lat: 54.5, lng: -1.4 },
  { name: 'A168', lat: 54.25, lng: -1.4 },
  { name: 'A170', lat: 54.25, lng: -1.2 },
  { name: 'A66', lat: 54.5, lng: -1.35 },
  { name: 'A64', lat: 54.0, lng: -1.1 },
  { name: 'A59', lat: 54.0, lng: -1.5 },
  { name: 'M1', lat: 53.8, lng: -1.5 },
  { name: 'M62', lat: 53.75, lng: -1.4 },
  { name: 'A3', lat: 51.4, lng: -0.3 },
  { name: 'A4', lat: 51.5, lng: -0.2 },
  { name: 'A40', lat: 51.52, lng: -0.25 },
  { name: 'M25', lat: 51.4, lng: -0.4 },
];

let cache: NaptanStop[] | null = null;

function dataPath(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '../data/naptan-stops.csv');
}

export function emitNaptanOperatorAction(): void {
  console.warn(`
=== OPERATOR ACTION NEEDED ===
Transport selection requires a NaPTAN extract.

1. Run: npx tsx scripts/fetch-reproducibility-data.ts
   (pulls DfT NaPTAN API https://naptan.api.dft.gov.uk/v1/access-nodes
    for configured ATCO area codes → src/data/naptan-stops.csv)
2. Or download national NaPTAN CSV from https://beta-naptan.dft.gov.uk/
   and place a slimmed active-stops CSV at src/data/naptan-stops.csv with columns:
   atco,name,stopType,lat,lng,status,locality

Without this file, areaAnalysis.transport contains A-road hits only (if any).
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

export function loadNaptanStops(): NaptanStop[] {
  if (cache) return cache;
  const p = dataPath();
  if (!fs.existsSync(p)) {
    emitNaptanOperatorAction();
    cache = [];
    return cache;
  }
  const text = fs.readFileSync(p, 'utf8');
  const lines = text.trim().split(/\r?\n/);
  const rows: NaptanStop[] = [];
  for (const line of lines.slice(1)) {
    const cols = parseCsvLine(line);
    if (cols.length < 5) continue;
    const lat = Number(cols[3]);
    const lng = Number(cols[4]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    rows.push({
      atco: cols[0] || '',
      name: cols[1] || '',
      stopType: cols[2] || '',
      lat,
      lng,
      status: cols[5] || 'active',
      locality: cols[6] || '',
    });
  }
  cache = rows;
  console.log(`[naptan] loaded ${rows.length} stops from ${path.basename(p)}`);
  return rows;
}

/** Test helper — clear in-memory stop cache after regenerating CSV. */
export function __clearNaptanCacheForTests(): void {
  cache = null;
}

function isRail(stop: NaptanStop): boolean {
  return /^(RLY|RSE|RPL|MET)$/i.test(stop.stopType) || /rail station/i.test(stop.name);
}

function isBus(stop: NaptanStop): boolean {
  return /^(BCT|BST|BCE|BCS|BCQ)$/i.test(stop.stopType);
}

function stationDisplayName(name: string): string {
  return name.replace(/\s*\(.*?\)\s*$/, '').trim();
}

/**
 * Selection: nearest 2 distinct rail stations within STATION_RADIUS_MILES +
 * nearest bus stop within BUS_RADIUS_MILES; plus A-roads from fixed waypoints
 * within A_ROAD_RADIUS_MILES (max 2). Beyond-cap candidates are omitted.
 */
export function selectTransport(
  lat: number,
  lng: number,
  stops?: NaptanStop[]
): TransportRow[] {
  const pool = (stops || loadNaptanStops()).filter((s) => /active/i.test(s.status));
  const rows: TransportRow[] = [];

  const rail = pool
    .filter(isRail)
    .map((s) => ({ ...s, miles: haversineMiles(lat, lng, s.lat, s.lng), display: stationDisplayName(s.name) }))
    .filter((s) => s.miles <= STATION_RADIUS_MILES)
    .sort((a, b) => a.miles - b.miles || a.display.localeCompare(b.display));

  const seenStations = new Set<string>();
  for (const s of rail) {
    const key = s.display.toLowerCase();
    if (seenStations.has(key)) continue;
    seenStations.add(key);
    rows.push({
      type: 'Rail',
      line: s.display,
      time: `${s.miles.toFixed(1)} miles`,
      miles: Math.round(s.miles * 10) / 10,
      atco: s.atco,
    });
    console.log(`[naptan] rail: ${s.display} ${s.miles.toFixed(1)} mi (${s.atco})`);
    if (rows.filter((r) => r.type === 'Rail').length >= 2) break;
  }

  const bus = pool
    .filter(isBus)
    .map((s) => ({ ...s, miles: haversineMiles(lat, lng, s.lat, s.lng) }))
    .filter((s) => s.miles <= BUS_RADIUS_MILES)
    .sort((a, b) => a.miles - b.miles || a.name.localeCompare(b.name));
  if (bus[0]) {
    const s = bus[0];
    rows.push({
      type: 'Bus',
      line: s.name,
      time: `${s.miles.toFixed(1)} miles`,
      miles: Math.round(s.miles * 10) / 10,
      atco: s.atco,
    });
    console.log(`[naptan] bus: ${s.name} ${s.miles.toFixed(1)} mi (${s.atco})`);
  }

  const roadHits = A_ROAD_WAYPOINTS.map((w) => ({
    ...w,
    miles: haversineMiles(lat, lng, w.lat, w.lng),
  }))
    .filter((w) => w.miles <= A_ROAD_RADIUS_MILES)
    .sort((a, b) => a.miles - b.miles);
  const seenRoads = new Set<string>();
  for (const w of roadHits) {
    if (seenRoads.has(w.name)) continue;
    seenRoads.add(w.name);
    rows.push({
      type: 'Road',
      line: w.name,
      time: `${w.miles.toFixed(1)} miles`,
      miles: Math.round(w.miles * 10) / 10,
    });
    console.log(`[roads] ${w.name} ${w.miles.toFixed(1)} mi`);
    if (seenRoads.size >= 2) break;
  }

  return rows;
}

export function applyNaptanTransport(
  analysis: Record<string, unknown>,
  lat: number | null | undefined,
  lng: number | null | undefined
): void {
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    console.warn('[naptan] no property coordinates — transport not selected');
    return;
  }
  const selected = selectTransport(lat, lng);
  const area =
    analysis.areaAnalysis && typeof analysis.areaAnalysis === 'object'
      ? ({ ...(analysis.areaAnalysis as Record<string, unknown>) } as Record<string, unknown>)
      : {};
  area.transport = selected.map((r) => ({
    type: r.type,
    line: r.line,
    time: r.time,
  }));
  if (!selected.length) {
    area.transportEmptyMessage = emptyWithinCapMessage('transport links', STATION_RADIUS_MILES);
    console.log(`[naptan] ${area.transportEmptyMessage}`);
  } else {
    delete area.transportEmptyMessage;
  }
  analysis.verifiedTransport = selected;
  analysis.areaAnalysis = area;
}
