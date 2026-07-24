/**
 * One-shot: record Living Here POIs for Pentland into tests/fixtures/recorded/
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { clearPoiCache, lookupLivingHerePois } from '../src/lib/poiLookup';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const recorded = path.join(root, 'tests', 'fixtures', 'recorded');
const crime = JSON.parse(fs.readFileSync(path.join(recorded, 'crime-dl6-3nd.json'), 'utf8'));
const lat = crime.lat as number;
const lng = crime.lng as number;
const POSTCODE = 'DL6 3ND';

console.log('[record-living-here] coords', lat, lng);
clearPoiCache();
const poi = await lookupLivingHerePois(lat, lng, POSTCODE, { skipCache: true, skipPlaces: true });

const out = {
  lat,
  lng,
  postcode: POSTCODE,
  placesEnabled: false,
  blocks: poi.blocks,
  all: poi.all,
  warnings: poi.warnings,
};
fs.writeFileSync(path.join(recorded, 'living-here-dl6-3nd.json'), JSON.stringify(out, null, 2) + '\n');

console.log(
  'food',
  poi.blocks.foodDrink.map((p) => `${p.name} ${p.distanceMiles} FSA=${p.hygieneRating ?? '-'}`)
);
console.log(
  'walks',
  poi.blocks.walksOutdoors.map((p) => `${p.name} ${p.distanceMiles}`)
);
console.log(
  'everyday',
  poi.blocks.everyday.map((p) => `${p.name} ${p.category} ${p.distanceMiles}`)
);
console.log('all', poi.all.length, 'warnings', poi.warnings);

const ok =
  poi.blocks.foodDrink.length + poi.blocks.walksOutdoors.length + poi.blocks.everyday.length > 0;
const manifest = JSON.parse(fs.readFileSync(path.join(recorded, 'manifest.json'), 'utf8'));
manifest.entries = manifest.entries.filter((e: { file: string }) => e.file !== 'living-here-dl6-3nd.json');
manifest.entries.push({
  source: 'OSM Overpass + FSA Food Hygiene + NHS ODS',
  file: 'living-here-dl6-3nd.json',
  ok,
  fetchedAt: new Date().toISOString(),
  notes: `food=${poi.blocks.foodDrink.length} walks=${poi.blocks.walksOutdoors.length} everyday=${poi.blocks.everyday.length} all=${poi.all.length}`,
  ...(ok ? {} : { error: poi.warnings.join('; ') || 'no POIs' }),
});
fs.writeFileSync(path.join(recorded, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log('[record-living-here] ok=', ok);
if (!ok) process.exitCode = 1;
