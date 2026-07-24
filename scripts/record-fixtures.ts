/**
 * Record live fixture responses for Pentland / DL6 3ND.
 * Usage: npx tsx scripts/record-fixtures.ts
 *
 * Writes raw responses under tests/fixtures/recorded/ with a fetch-date manifest.
 * Never invents data — on failure emits === OPERATOR ACTION NEEDED ===.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';
import { lookupLandRegistrySales } from '../src/lib/landRegistryLookup';
import { fetchEpcCertificatesForPostcode, lookupEpc, enrichFromCertificateHtml } from '../src/lib/epcLookup';
import { lookupCrimeForAddress } from '../src/lib/policeUkLookup';
import { selectNearestSchools, loadGiasSchools } from '../src/lib/giasSchools';
import { resolveOnsLsoaPopulation } from '../src/lib/onsLsoaPopulation';

config();
config({ path: '.env.local', override: true });

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'tests', 'fixtures', 'recorded');

const ADDRESS = 'Pentland, Cross Lane, Northallerton, DL6 3ND';
const POSTCODE = 'DL6 3ND';

type ManifestEntry = {
  source: string;
  file: string;
  ok: boolean;
  error?: string;
  fetchedAt: string;
  notes?: string;
};

function operatorAction(block: string): void {
  console.error(`
=== OPERATOR ACTION NEEDED ===
${block}
=== END OPERATOR ACTION ===
`);
}

function writeJson(file: string, data: unknown): void {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, file), JSON.stringify(data, null, 2) + '\n', 'utf8');
}

async function main(): Promise<void> {
  const fetchedAt = new Date().toISOString();
  const manifest: {
    address: string;
    postcode: string;
    fetchedAt: string;
    entries: ManifestEntry[];
  } = { address: ADDRESS, postcode: POSTCODE, fetchedAt, entries: [] };

  let failed = false;

  // --- Land Registry ---
  try {
    console.log('[record] Land Registry Price Paid…');
    const lr = await lookupLandRegistrySales(ADDRESS);
    if (lr.error && !lr.thisProperty.length && !lr.nearbySameStreet.length) {
      throw new Error(lr.error);
    }
    writeJson('land-registry-dl6-3nd.json', lr);
    manifest.entries.push({
      source: 'HM Land Registry Price Paid (SPARQL/LDA)',
      file: 'land-registry-dl6-3nd.json',
      ok: true,
      fetchedAt,
      notes: `thisProperty=${lr.thisProperty.length} sameStreet=${lr.nearbySameStreet.length} postcode=${lr.nearbyPostcode.length}`,
    });
    console.log(
      `[record] LR ok — thisProperty=${lr.thisProperty.length} sameStreet=${lr.nearbySameStreet.length}`
    );
    for (const s of lr.thisProperty.slice(0, 5)) {
      console.log(`  subject: ${s.date} £${s.amount} ${s.addressLabel}`);
    }
    for (const name of ['Monks House', 'Inglenook', 'Still Point']) {
      const hits = [...lr.nearbySameStreet, ...lr.nearbyPostcode, ...lr.thisProperty].filter((s) =>
        s.addressLabel.toLowerCase().includes(name.toLowerCase())
      );
      for (const h of hits.slice(0, 3)) {
        console.log(`  ${name}: ${h.date} £${h.amount} ${h.addressLabel}`);
      }
    }
  } catch (err: any) {
    failed = true;
    const msg = err?.message || String(err);
    manifest.entries.push({
      source: 'HM Land Registry Price Paid',
      file: 'land-registry-dl6-3nd.json',
      ok: false,
      error: msg,
      fetchedAt,
    });
    operatorAction(
      `Land Registry lookup failed for ${ADDRESS}.\nError: ${msg}\nRetry when landregistry.data.gov.uk is reachable (no API key required).`
    );
  }

  // --- EPC ---
  try {
    console.log('[record] EPC postcode batch…');
    let certs = await fetchEpcCertificatesForPostcode(POSTCODE);
    const subject = await lookupEpc(ADDRESS);
    if (!certs.length) {
      throw new Error(
        subject.error ||
          'No EPC certificates returned. Set EPC_API_BEARER in .env.local for the MHCLG API, or ensure find-energy-certificate.service.gov.uk is reachable.'
      );
    }
    // Enrich floor area / type from certificate HTML (live register pages) — no invention
    console.log(`[record] enriching ${certs.length} EPC certificate pages…`);
    const enriched = [];
    for (const c of certs) {
      try {
        enriched.push(await enrichFromCertificateHtml(c));
      } catch {
        enriched.push(c);
      }
    }
    certs = enriched;
    writeJson('epc-dl6-3nd.json', {
      postcode: POSTCODE,
      certificates: certs,
      subjectMatch: subject.matched,
      subjectError: subject.error || null,
    });
    const withArea = certs.filter((c) => c.floorAreaSqm).length;
    manifest.entries.push({
      source: 'EPC register (API or HTML)',
      file: 'epc-dl6-3nd.json',
      ok: true,
      fetchedAt,
      notes: `${certs.length} certificates (${withArea} with floor area); subject matched=${Boolean(subject.matched)}`,
    });
    console.log(
      `[record] EPC ok — ${certs.length} certs (${withArea} with area), subject=${subject.matched?.address || 'none'}`
    );
  } catch (err: any) {
    failed = true;
    const msg = err?.message || String(err);
    manifest.entries.push({
      source: 'EPC register',
      file: 'epc-dl6-3nd.json',
      ok: false,
      error: msg,
      fetchedAt,
    });
    operatorAction(
      `EPC postcode batch failed for ${POSTCODE}.\nError: ${msg}\nPrefer: set EPC_API_BEARER from https://get-energy-performance-data.communities.gov.uk/\nOr ensure HTML register search is reachable.`
    );
  }

  // --- Crime + ONS ---
  let crimeLat: number | null = null;
  let crimeLng: number | null = null;
  let lsoa21cd: string | null = null;
  try {
    console.log('[record] police.uk + ONS population…');
    const crime = await lookupCrimeForAddress(ADDRESS);
    crimeLat = crime.lat;
    crimeLng = crime.lng;
    lsoa21cd = crime.lsoa21cd || null;
    writeJson('crime-dl6-3nd.json', crime);
    manifest.entries.push({
      source: 'police.uk street crime + postcodes.io + ONS/Nomis population',
      file: 'crime-dl6-3nd.json',
      ok: true,
      fetchedAt,
      notes: `status=${crime.status} rate=${crime.incidentsPerThousand} pop=${crime.population} lsoa=${crime.lsoa21cd}`,
    });
    console.log(
      `[record] crime ok — status=${crime.status} rate=${crime.incidentsPerThousand} pop=${crime.population}`
    );

    if (lsoa21cd) {
      const ons = await resolveOnsLsoaPopulation(lsoa21cd);
      writeJson('ons-lsoa-population.json', { lsoa21cd, ons });
      manifest.entries.push({
        source: 'ONS Census 2021 usual residents (Nomis / CSV)',
        file: 'ons-lsoa-population.json',
        ok: Boolean(ons),
        error: ons ? undefined : 'population resolve returned null',
        fetchedAt,
      });
    }
  } catch (err: any) {
    failed = true;
    const msg = err?.message || String(err);
    manifest.entries.push({
      source: 'police.uk / ONS',
      file: 'crime-dl6-3nd.json',
      ok: false,
      error: msg,
      fetchedAt,
    });
    operatorAction(
      `Crime/ONS lookup failed for ${ADDRESS}.\nError: ${msg}\nRequires postcodes.io, ArcGIS LSOA boundaries, police.uk, and Nomis (no API key).`
    );
  }

  // --- GIAS / Ofsted slice (from local reproducibility CSV, itself built from live feeds) ---
  try {
    console.log('[record] GIAS/Ofsted nearest-schools slice…');
    const pool = loadGiasSchools();
    if (!pool.length) {
      throw new Error(
        'gias-schools-open.csv missing or empty. Run: npx tsx scripts/fetch-reproducibility-data.ts'
      );
    }
    if (crimeLat == null || crimeLng == null) {
      throw new Error('No coordinates from crime lookup — cannot select schools.');
    }
    const schools = selectNearestSchools(crimeLat, crimeLng, pool);
    writeJson('schools-dl6-3nd.json', {
      lat: crimeLat,
      lng: crimeLng,
      schools,
      poolSize: pool.length,
    });
    manifest.entries.push({
      source: 'GIAS open-schools CSV + Ofsted MI enrichment (local extract)',
      file: 'schools-dl6-3nd.json',
      ok: true,
      fetchedAt,
      notes: `${schools.length} selected from pool ${pool.length}`,
    });
    console.log(`[record] schools ok — ${schools.length} rows`);
  } catch (err: any) {
    failed = true;
    const msg = err?.message || String(err);
    manifest.entries.push({
      source: 'GIAS/Ofsted',
      file: 'schools-dl6-3nd.json',
      ok: false,
      error: msg,
      fetchedAt,
    });
    operatorAction(
      `GIAS/Ofsted slice failed.\nError: ${msg}\nRun: SKIP_NAPTAN=1 npx tsx scripts/fetch-reproducibility-data.ts\n(Requires Ofsted MI download; see script header.)`
    );
  }

  // --- Living Here POIs: OSM + FSA + NHS (Places optional; always emit key notice) ---
  try {
    console.log('[record] Living Here POIs (OSM Overpass + FSA + NHS ODS)…');
    if (crimeLat == null || crimeLng == null) {
      throw new Error('No coordinates — cannot fetch POIs.');
    }
    const { clearPoiCache, lookupLivingHerePois } = await import('../src/lib/poiLookup');
    clearPoiCache();
    const poi = await lookupLivingHerePois(crimeLat, crimeLng, POSTCODE, {
      skipCache: true,
      skipPlaces: true, // ship/test without Places key
    });
    writeJson('living-here-dl6-3nd.json', {
      lat: crimeLat,
      lng: crimeLng,
      postcode: POSTCODE,
      placesEnabled: false,
      blocks: poi.blocks,
      all: poi.all,
      warnings: poi.warnings,
    });
    const okBlocks =
      poi.blocks.foodDrink.length + poi.blocks.walksOutdoors.length + poi.blocks.everyday.length;
    if (okBlocks === 0) {
      throw new Error(
        `No POIs selected. warnings=${poi.warnings.join('; ') || 'none'}`
      );
    }
    manifest.entries.push({
      source: 'OSM Overpass + FSA Food Hygiene + NHS ODS',
      file: 'living-here-dl6-3nd.json',
      ok: true,
      fetchedAt,
      notes: `food=${poi.blocks.foodDrink.length} walks=${poi.blocks.walksOutdoors.length} everyday=${poi.blocks.everyday.length} all=${poi.all.length}`,
    });
    console.log(
      `[record] living-here ok — food=${poi.blocks.foodDrink.length} walks=${poi.blocks.walksOutdoors.length} everyday=${poi.blocks.everyday.length}`
    );
    operatorAction(
      `What I need: Google Places API key (Places API (New): text search + details)
Where to get it: console.cloud.google.com → enable Places API (New) →
create key, restrict to Places API + server IP
Cost: pay-per-call, pence per report with per-address caching; monthly
free credit applies
Env var: GOOGLE_PLACES_API_KEY (server env only — never NEXT_PUBLIC_/VITE_)
What it unlocks: venue ratings, review counts, and review-theme lines`
    );
  } catch (err: any) {
    failed = true;
    const msg = err?.message || String(err);
    manifest.entries.push({
      source: 'OSM / FSA / NHS Living Here',
      file: 'living-here-dl6-3nd.json',
      ok: false,
      error: msg,
      fetchedAt,
    });
    operatorAction(
      `Living Here POI recording failed for ${ADDRESS}.\nError: ${msg}\nRequires Overpass API, api.ratings.food.gov.uk, and directory.spineservices.nhs.uk (no keys). Never invent POIs.`
    );
  }

  writeJson('manifest.json', manifest);
  console.log(`[record] wrote manifest → ${path.join(outDir, 'manifest.json')}`);

  if (failed) {
    process.exitCode = 1;
    console.error('[record] incomplete — fix OPERATOR ACTION items and re-run.');
  } else {
    console.log('[record] complete — all sources recorded.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
