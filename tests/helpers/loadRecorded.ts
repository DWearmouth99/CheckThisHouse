/**
 * Load recorded live fixtures (tests/fixtures/recorded/).
 * E2E / golden paths must use these — never invent LR/EPC/crime rows here.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { LandRegistryLookup } from '../../src/lib/landRegistryLookup';
import type { CrimeLookup } from '../../src/lib/policeUkLookup';
import type { EpcRecord, EpcLookup } from '../../src/lib/epcLookup';
import type { PropertyFacts } from '../../src/lib/propertyFacts';
import type { SelectedSchool } from '../../src/lib/giasSchools';

const fixturesRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures');
export const RECORDED_DIR = path.join(fixturesRoot, 'recorded');
export const SYNTHETIC_DIR = path.join(fixturesRoot, 'synthetic');
export const GOLDEN_PATH = path.join(fixturesRoot, 'golden', 'pentland-facts.json');

export const PENTLAND_ADDRESS = 'Pentland, Cross Lane, Northallerton, DL6 3ND';
export const PENTLAND_POSTCODE = 'DL6 3ND';

/** Reality anchors — must match recorded LR (Part 6B). */
export const REALITY = {
  subjectPriorAmount: 485_000,
  subjectPriorDate: '2006-04-07',
  monksHouseAmount: 310_000,
  monksHouseDate: '2025-07-31',
} as const;

function readJson<T>(file: string): T {
  const p = path.join(RECORDED_DIR, file);
  if (!fs.existsSync(p)) {
    throw new Error(
      `Missing recorded fixture ${p}. Run: npm run data:record-fixtures`
    );
  }
  return JSON.parse(fs.readFileSync(p, 'utf8')) as T;
}

export function loadRecordedManifest(): {
  address: string;
  postcode: string;
  fetchedAt: string;
  entries: { source: string; file: string; ok: boolean; error?: string }[];
} {
  return readJson('manifest.json');
}

export function loadRecordedLandRegistry(): LandRegistryLookup {
  return readJson('land-registry-dl6-3nd.json');
}

export function loadRecordedEpcCertificates(): EpcRecord[] {
  const raw = readJson<{ certificates: EpcRecord[] }>('epc-dl6-3nd.json');
  return raw.certificates || [];
}

export function loadRecordedEpcSubject(): EpcLookup {
  const raw = readJson<{
    postcode: string;
    certificates: EpcRecord[];
    subjectMatch: EpcRecord | null;
    subjectError: string | null;
  }>('epc-dl6-3nd.json');
  return {
    postcode: raw.postcode,
    matched: raw.subjectMatch,
    candidates: raw.certificates || [],
    error: raw.subjectError || undefined,
  };
}

export function loadRecordedCrime(): CrimeLookup {
  return readJson('crime-dl6-3nd.json');
}

export function loadRecordedSchools(): {
  lat: number;
  lng: number;
  schools: SelectedSchool[];
  poolSize: number;
} {
  return readJson('schools-dl6-3nd.json');
}

export function loadRecordedLivingHere(): {
  lat: number;
  lng: number;
  postcode: string;
  placesEnabled: boolean;
  blocks: {
    foodDrink: import('../../src/lib/poiLookup').PoiRecord[];
    walksOutdoors: import('../../src/lib/poiLookup').PoiRecord[];
    everyday: import('../../src/lib/poiLookup').PoiRecord[];
  };
  all: import('../../src/lib/poiLookup').PoiRecord[];
  warnings?: string[];
} {
  return readJson('living-here-dl6-3nd.json');
}

/** All address labels that appear in the recorded LR response. */
export function recordedLrAddressSet(lr?: LandRegistryLookup): Set<string> {
  const data = lr || loadRecordedLandRegistry();
  const labels = [
    ...(data.thisProperty || []),
    ...(data.nearbySameStreet || []),
    ...(data.nearbyPostcode || []),
    ...(data.nearby || []),
  ].map((s) => s.addressLabel);
  return new Set(labels);
}

export function recordedPropertyFacts(): PropertyFacts {
  const lr = loadRecordedLandRegistry();
  const epc = loadRecordedEpcSubject();
  return {
    address: PENTLAND_ADDRESS,
    epc,
    landRegistry: lr,
    brief: `recorded ${loadRecordedManifest().fetchedAt}`,
    sources: [],
  };
}

/** Assert recorded manifest is complete before e2e. */
export function assertRecordedFixturesReady(): void {
  const m = loadRecordedManifest();
  const bad = m.entries.filter((e) => !e.ok);
  if (bad.length) {
    throw new Error(
      `Recorded fixtures incomplete: ${bad.map((b) => b.file).join(', ')}. Re-run npm run data:record-fixtures`
    );
  }
}
