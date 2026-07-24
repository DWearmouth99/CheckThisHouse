/**
 * Living Here POI lookup — OSM Overpass + FSA hygiene + NHS ODS.
 * Optional Google Places (rating/review themes) when GOOGLE_PLACES_API_KEY is set.
 * Selection rules live in code; never invent POIs.
 */

export type PoiCategory =
  | 'pub'
  | 'cafe'
  | 'restaurant'
  | 'farm_shop'
  | 'trail'
  | 'viewpoint'
  | 'park'
  | 'wood'
  | 'nature_reserve'
  | 'supermarket'
  | 'petrol'
  | 'playground'
  | 'gym'
  | 'vet'
  | 'gp'
  | 'dentist'
  | 'pharmacy';

export type PoiSource = 'osm' | 'fsa' | 'nhs' | 'places';

export interface PoiRecord {
  name: string;
  category: PoiCategory;
  lat: number;
  lng: number;
  /** Miles, 1 decimal — always populated */
  distanceMiles: number;
  source: PoiSource;
  /** FSA hygiene rating 0–5 or descriptive */
  hygieneRating?: string;
  hygieneRatingDate?: string;
  /** Google Places — only when key present */
  rating?: number;
  reviewCount?: number;
  /** Derived theme line — never raw review text */
  reviewTheme?: string;
  /** National trail flag for walks block ordering */
  isNationalTrail?: boolean;
  fhrsId?: string;
  placesId?: string;
}

export interface LivingHereBlocks {
  foodDrink: PoiRecord[];
  walksOutdoors: PoiRecord[];
  everyday: PoiRecord[];
}

export interface PoiLookupResult {
  blocks: LivingHereBlocks;
  all: PoiRecord[];
  warnings: string[];
  placesEnabled: boolean;
}

export const POI_LIMITS = {
  foodDrink: 5,
  walksOutdoors: 6,
  everydayPerType: 1,
} as const;

/** Radii in metres */
export const POI_RADII_M = {
  food: 8000,
  everyday: 16000,
  /** Parks / woods / viewpoints fetch + display cap (~5 mi) */
  parks: 8047,
  /** How far to search for trail relation membership (long routes) */
  trails: 25000,
  /** Only fetch trail way geometry near the property (nearest access) */
  trailGeom: 12000,
} as const;

/** Walks & outdoors display/select cap (miles). National trails are exempt. */
export const WALKS_CAP_MILES = 5;

const EARTH_R_MILES = 3958.8;

export function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_R_MILES * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function formatDistanceMiles(miles: number): string {
  return `${miles.toFixed(1)} mi`;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function cleanName(n: string | undefined | null): string | null {
  if (!n) return null;
  const t = n.replace(/\s+/g, ' ').trim();
  if (!t || t.length < 2) return null;
  if (/^(yes|no|unnamed)$/i.test(t)) return null;
  return t;
}

function nearestN(items: PoiRecord[], n: number): PoiRecord[] {
  return [...items].sort((a, b) => a.distanceMiles - b.distanceMiles).slice(0, n);
}

function onePerCategory(items: PoiRecord[], cats: PoiCategory[]): PoiRecord[] {
  const out: PoiRecord[] = [];
  for (const cat of cats) {
    const best = nearestN(
      items.filter((p) => p.category === cat),
      1
    )[0];
    if (best) out.push(best);
  }
  return out.sort((a, b) => a.distanceMiles - b.distanceMiles);
}

/** In-memory cache keyed by normalised postcode */
const cache = new Map<string, PoiLookupResult>();

export function clearPoiCache(): void {
  cache.clear();
}

function normPc(pc: string): string {
  return pc.replace(/\s+/g, '').toUpperCase();
}

function operatorPlacesKey(): void {
  console.warn(`
=== OPERATOR ACTION NEEDED ===
What I need: Google Places API key (Places API (New): text search + details)
Where to get it: console.cloud.google.com → enable Places API (New) →
create key, restrict to Places API + server IP
Cost: pay-per-call, pence per report with per-address caching; monthly
free credit applies
Env var: GOOGLE_PLACES_API_KEY (server env only — never NEXT_PUBLIC_/VITE_)
What it unlocks: venue ratings, review counts, and review-theme lines
==============================
`);
}

// ─── Overpass ───────────────────────────────────────────────────────────────

interface OsmElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
  members?: Array<{ type: string; ref: number; role?: string }>;
  geometry?: Array<{ lat: number; lon: number }>;
}

function osmCoords(el: OsmElement): { lat: number; lng: number } | null {
  if (typeof el.lat === 'number' && typeof el.lon === 'number') return { lat: el.lat, lng: el.lon };
  if (el.center && typeof el.center.lat === 'number') return { lat: el.center.lat, lng: el.center.lon };
  return null;
}

/** Nearest haversine among candidate points — used for trail access distance. */
export function nearestPointMiles(
  originLat: number,
  originLng: number,
  points: Array<{ lat: number; lng: number }>
): { lat: number; lng: number; distanceMiles: number } | null {
  if (!points.length) return null;
  let best: { lat: number; lng: number; distanceMiles: number } | null = null;
  for (const p of points) {
    const d = haversineMiles(originLat, originLng, p.lat, p.lng);
    if (!best || d < best.distanceMiles) {
      best = { lat: p.lat, lng: p.lng, distanceMiles: d };
    }
  }
  if (!best) return null;
  return { ...best, distanceMiles: round1(best.distanceMiles) };
}

function collectGeomPoints(el: OsmElement): Array<{ lat: number; lng: number }> {
  const out: Array<{ lat: number; lng: number }> = [];
  if (el.geometry?.length) {
    for (const g of el.geometry) {
      if (typeof g.lat === 'number' && typeof g.lon === 'number') {
        out.push({ lat: g.lat, lng: g.lon });
      }
    }
  }
  if (typeof el.lat === 'number' && typeof el.lon === 'number') {
    out.push({ lat: el.lat, lng: el.lon });
  }
  return out;
}

/**
 * Resolve trail access as distance to the nearest node on member-way geometry
 * near the property — NOT the relation bbox centre (`out center`).
 */
export function trailAccessFromOverpassElements(
  originLat: number,
  originLng: number,
  elements: OsmElement[]
): PoiRecord[] {
  const byWay = new Map<number, OsmElement>();
  const relations: OsmElement[] = [];
  for (const el of elements) {
    if (el.type === 'way') byWay.set(el.id, el);
    if (el.type === 'relation') relations.push(el);
  }

  const pois: PoiRecord[] = [];
  const seen = new Set<string>();

  for (const rel of relations) {
    const tags = rel.tags || {};
    const name = cleanName(tags.name);
    if (!name) continue;
    const classified = classifyOsm(tags);
    if (!classified || classified.category !== 'trail') continue;

    const points: Array<{ lat: number; lng: number }> = [];
    for (const m of rel.members || []) {
      if (m.type !== 'way') continue;
      const way = byWay.get(m.ref);
      if (!way) continue;
      points.push(...collectGeomPoints(way));
    }
    // Fallback: relation itself may carry geometry in some Overpass modes
    if (!points.length) points.push(...collectGeomPoints(rel));

    const nearest = nearestPointMiles(originLat, originLng, points);
    if (!nearest) continue;

    const key = `trail|${name.toLowerCase()}`;
    if (seen.has(key)) {
      // Keep the closer access if duplicate names
      const existing = pois.find((p) => p.name.toLowerCase() === name.toLowerCase());
      if (existing && nearest.distanceMiles < existing.distanceMiles) {
        existing.lat = nearest.lat;
        existing.lng = nearest.lng;
        existing.distanceMiles = nearest.distanceMiles;
      }
      continue;
    }
    seen.add(key);
    pois.push({
      name,
      category: 'trail',
      lat: nearest.lat,
      lng: nearest.lng,
      distanceMiles: nearest.distanceMiles,
      source: 'osm',
      isNationalTrail: classified.isNationalTrail,
    });
  }
  return pois;
}

function classifyOsm(tags: Record<string, string>): { category: PoiCategory; isNationalTrail?: boolean } | null {
  const amenity = tags.amenity || '';
  const shop = tags.shop || '';
  const leisure = tags.leisure || '';
  const tourism = tags.tourism || '';
  const natural = tags.natural || '';
  const route = tags.route || '';
  const network = (tags.network || '').toLowerCase();
  const name = (tags.name || '').toLowerCase();

  if (amenity === 'pub') return { category: 'pub' };
  if (amenity === 'cafe') return { category: 'cafe' };
  if (amenity === 'restaurant') return { category: 'restaurant' };
  if (shop === 'farm' || shop === 'farm_shop' || tags.farm_shop === 'yes') return { category: 'farm_shop' };
  if (shop === 'supermarket' || shop === 'convenience') return { category: 'supermarket' };
  if (amenity === 'fuel' || amenity === 'charging_station') return { category: 'petrol' };
  if (leisure === 'playground') return { category: 'playground' };
  if (leisure === 'fitness_centre' || amenity === 'gym') return { category: 'gym' };
  if (amenity === 'veterinary' || shop === 'pet') return { category: 'vet' };
  if (amenity === 'doctors' || amenity === 'clinic') return { category: 'gp' };
  if (amenity === 'dentist') return { category: 'dentist' };
  if (amenity === 'pharmacy') return { category: 'pharmacy' };
  if (tourism === 'viewpoint') return { category: 'viewpoint' };
  if (leisure === 'park' || leisure === 'nature_reserve') {
    return { category: leisure === 'nature_reserve' ? 'nature_reserve' : 'park' };
  }
  if (natural === 'wood' || landuseIsWood(tags)) return { category: 'wood' };
  if (route === 'hiking' || route === 'foot' || tags.type === 'route') {
    const national =
      network.includes('nwn') ||
      network.includes('national') ||
      /cleveland way|coast to coast|pennine way|hadrian/i.test(name);
    return { category: 'trail', isNationalTrail: national };
  }
  return null;
}

function landuseIsWood(tags: Record<string, string>): boolean {
  return tags.landuse === 'forest' || tags.landuse === 'wood';
}

async function overpassPost(
  f: typeof fetch,
  endpoints: string[],
  query: string
): Promise<{ elements: OsmElement[]; error?: string }> {
  let lastErr = '';
  for (let i = 0; i < endpoints.length; i++) {
    const url = endpoints[i]!;
    try {
      if (i > 0) await new Promise((r) => setTimeout(r, 1500 * i));
      const res = await f(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'CheckThisHouse/1.0 (property-report; living-here)',
        },
        body: `data=${encodeURIComponent(query)}`,
      });
      if (!res.ok) {
        lastErr = `HTTP ${res.status}`;
        continue;
      }
      const data = (await res.json()) as { elements?: OsmElement[] };
      return { elements: data.elements || [] };
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
  }
  return { elements: [], error: lastErr };
}

export async function fetchOsmPois(
  lat: number,
  lng: number,
  opts?: { fetchImpl?: typeof fetch }
): Promise<{ pois: PoiRecord[]; warnings: string[] }> {
  const f = opts?.fetchImpl ?? fetch;
  const foodR = POI_RADII_M.food;
  const everydayR = POI_RADII_M.everyday;
  const parkR = POI_RADII_M.parks;
  const trailGeomR = POI_RADII_M.trailGeom;

  const endpoints = [
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass-api.de/api/interpreter',
  ];

  const warnings: string[] = [];

  // Amenity / park POIs — centre is fine for compact features
  const amenityQuery = `
[out:json][timeout:60];
(
  node["amenity"="pub"](around:${foodR},${lat},${lng});
  node["amenity"="cafe"](around:${foodR},${lat},${lng});
  node["amenity"="restaurant"](around:${foodR},${lat},${lng});
  node["shop"="farm"](around:${foodR},${lat},${lng});
  node["shop"="farm_shop"](around:${foodR},${lat},${lng});
  node["shop"="supermarket"](around:${everydayR},${lat},${lng});
  node["shop"="convenience"](around:${everydayR},${lat},${lng});
  node["amenity"="fuel"](around:${everydayR},${lat},${lng});
  node["leisure"="playground"](around:${everydayR},${lat},${lng});
  node["leisure"="fitness_centre"](around:${foodR},${lat},${lng});
  node["amenity"="veterinary"](around:${foodR},${lat},${lng});
  node["amenity"="doctors"](around:${everydayR},${lat},${lng});
  node["amenity"="clinic"](around:${everydayR},${lat},${lng});
  node["amenity"="dentist"](around:${everydayR},${lat},${lng});
  node["amenity"="pharmacy"](around:${everydayR},${lat},${lng});
  node["tourism"="viewpoint"](around:${parkR},${lat},${lng});
  node["leisure"="park"](around:${parkR},${lat},${lng});
  way["leisure"="park"](around:${parkR},${lat},${lng});
  node["leisure"="nature_reserve"](around:${parkR},${lat},${lng});
  way["leisure"="nature_reserve"](around:${parkR},${lat},${lng});
  way["natural"="wood"]["name"](around:${parkR},${lat},${lng});
);
out center tags;
`.trim();

  const amenityRes = await overpassPost(f, endpoints, amenityQuery);
  if (amenityRes.error && !amenityRes.elements.length) {
    warnings.push(`OSM Overpass amenities failed: ${amenityRes.error}`);
  }

  const pois: PoiRecord[] = [];
  const seen = new Set<string>();

  for (const el of amenityRes.elements) {
    const tags = el.tags || {};
    const name = cleanName(tags.name);
    if (!name) continue;
    const classified = classifyOsm(tags);
    if (!classified || classified.category === 'trail') continue;
    const coords = osmCoords(el);
    if (!coords) continue;
    const key = `${classified.category}|${name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pois.push({
      name,
      category: classified.category,
      lat: coords.lat,
      lng: coords.lng,
      distanceMiles: round1(haversineMiles(lat, lng, coords.lat, coords.lng)),
      source: 'osm',
      isNationalTrail: classified.isNationalTrail,
    });
  }

  // National trails: resolve by exact route tags (nwn), then nearest member-way
  // node near the property — never relation bbox centre (`out center`).
  await new Promise((r) => setTimeout(r, 600));
  const nationalIdsQuery = `
[out:json][timeout:25];
(
  relation["name"="Cleveland Way"]["route"="hiking"]["network"="nwn"];
  relation["name"~"^Coast to Coast Walk",i]["route"="hiking"]["network"="nwn"];
);
out ids tags;
`.trim();
  const idRes = await overpassPost(f, endpoints, nationalIdsQuery);
  const nationalRels = idRes.elements.filter(
    (e) =>
      e.type === 'relation' &&
      e.tags?.name &&
      e.tags?.type !== 'superroute' &&
      !/\//.test(e.tags.name)
  );

  for (const rel of nationalRels) {
    await new Promise((r) => setTimeout(r, 700));
    const q = `
[out:json][timeout:40];
relation(${rel.id});
way(r)(around:${trailGeomR},${lat},${lng});
out geom;
`.trim();
    const res = await overpassPost(f, endpoints, q);
    if (res.error && !res.elements.length) {
      warnings.push(`OSM trail relation ${rel.id} failed: ${res.error}`);
      continue;
    }
    const name = cleanName(rel.tags?.name);
    if (!name) continue;
    const points = res.elements
      .filter((e) => e.type === 'way')
      .flatMap((e) => collectGeomPoints(e));
    const nearest = nearestPointMiles(lat, lng, points);
    if (!nearest) continue;
    const key = `trail|${name.toLowerCase()}`;
    if (seen.has(key)) {
      const existing = pois.find((p) => p.name.toLowerCase() === name.toLowerCase());
      if (existing && nearest.distanceMiles < existing.distanceMiles) {
        existing.lat = nearest.lat;
        existing.lng = nearest.lng;
        existing.distanceMiles = nearest.distanceMiles;
      }
      continue;
    }
    seen.add(key);
    pois.push({
      name,
      category: 'trail',
      lat: nearest.lat,
      lng: nearest.lng,
      distanceMiles: nearest.distanceMiles,
      source: 'osm',
      isNationalTrail: true,
    });
  }

  // Other local hiking relations that pass nearby (compact)
  await new Promise((r) => setTimeout(r, 700));
  const localTrailQuery = `
[out:json][timeout:35];
(
  relation["route"="hiking"](around:8000,${lat},${lng});
  relation["route"="foot"]["name"](around:8000,${lat},${lng});
)->.rels;
.rels out body tags;
way(r.rels)(around:8000,${lat},${lng});
out geom;
`.trim();
  const localTrailRes = await overpassPost(f, endpoints, localTrailQuery);
  if (!localTrailRes.error || localTrailRes.elements.length) {
    const trailPois = trailAccessFromOverpassElements(lat, lng, localTrailRes.elements);
    for (const tp of trailPois) {
      if (/cleveland way|^coast to coast/i.test(tp.name)) continue;
      const key = `trail|${tp.name.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pois.push(tp);
    }
  }

  if (!pois.length && warnings.length) {
    console.error(`
=== OPERATOR ACTION NEEDED ===
What I need: OpenStreetMap Overpass API reachable (overpass-api.de or mirror)
Error: ${warnings.join('; ')}
Postcode POI food/walks/everyday OSM layer cannot be recorded without this.
==============================
`);
  }

  return { pois, warnings };
}

// ─── FSA Food Hygiene ───────────────────────────────────────────────────────

interface FsaEstablishment {
  FHRSID?: number;
  BusinessName?: string;
  BusinessType?: string;
  RatingValue?: string;
  RatingDate?: string;
  Distance?: number | null;
  Geocode?: { Latitude?: string; Longitude?: string };
  geocode?: { latitude?: string; longitude?: string };
}

function fsaCoords(est: FsaEstablishment): { lat: number; lng: number } | null {
  const lat = parseFloat(est.geocode?.latitude || est.Geocode?.Latitude || '');
  const lng = parseFloat(est.geocode?.longitude || est.Geocode?.Longitude || '');
  if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  return null;
}

function fsaCategory(businessType?: string, businessName?: string): PoiCategory | null {
  const t = (businessType || '').toLowerCase();
  const n = (businessName || '').toLowerCase();
  // Name-based institutional / non-hospitality exclusions (school kitchens, hospital canteens, B&Bs)
  if (
    /school|nursery|academy|college|canteen|kitchen|care\s*home|hospital|ward|department|outpatients?|obstetric|maternity|a\s*&\s*e|b\s*&\s*b|bed\s*&\s*breakfast|guest\s*house|hotel|boarding/i.test(
      n
    )
  ) {
    return null;
  }
  if (
    /school|nursery|care home|hospital|caring|mobile caterer|distributors|manufacturers|importers|farmers\/growers/.test(
      t
    )
  ) {
    if (/farmers\/growers|farm shop/.test(t)) return 'farm_shop';
    return null;
  }
  if (/pub|bar|nightclub/.test(t)) return 'pub';
  if (/restaurant\/cafe\/canteen/.test(t)) return 'cafe';
  if (/takeaway|restaurant/.test(t)) return 'restaurant';
  // Hotels / "Other catering premises" often include B&Bs — do not treat as restaurants
  if (/hotel|other catering/.test(t)) return null;
  return null;
}

export async function fetchFsaHygiene(
  postcode: string,
  lat: number,
  lng: number,
  opts?: { fetchImpl?: typeof fetch }
): Promise<{
  byName: Map<string, { rating: string; date?: string; fhrsId?: string; lat: number; lng: number }>;
  pois: PoiRecord[];
  warnings: string[];
}> {
  const f = opts?.fetchImpl ?? fetch;
  const warnings: string[] = [];
  const byName = new Map<
    string,
    { rating: string; date?: string; fhrsId?: string; lat: number; lng: number }
  >();
  const pois: PoiRecord[] = [];

  const urls = [
    `https://api.ratings.food.gov.uk/Establishments?latitude=${lat}&longitude=${lng}&maxDistanceLimit=5&pageSize=150&pageNumber=1`,
    `https://api.ratings.food.gov.uk/Establishments?address=${encodeURIComponent(postcode)}&pageSize=150&pageNumber=1`,
  ];

  try {
    const seenIds = new Set<string>();
    for (const url of urls) {
      const res = await f(url, {
        headers: { 'x-api-version': '2', Accept: 'application/json' },
      });
      if (!res.ok) {
        if (url === urls[0]) throw new Error(`HTTP ${res.status}`);
        continue;
      }
      const data = (await res.json()) as { establishments?: FsaEstablishment[] };
      for (const est of data.establishments || []) {
        const name = cleanName(est.BusinessName);
        if (!name) continue;
        const id = est.FHRSID != null ? String(est.FHRSID) : name.toLowerCase();
        if (seenIds.has(id)) continue;
        seenIds.add(id);
        const coords = fsaCoords(est);
        if (!coords) continue;
        const elat = coords.lat;
        const elng = coords.lng;
        const dist =
          typeof est.Distance === 'number' && Number.isFinite(est.Distance)
            ? est.Distance
            : haversineMiles(lat, lng, elat, elng);
        if (dist > 6) continue;
        const rating = String(est.RatingValue || '').trim();
        if (!rating || rating === 'Exempt' || /^awaiting/i.test(rating)) continue;
        byName.set(name.toLowerCase(), {
          rating,
          date: est.RatingDate,
          fhrsId: est.FHRSID != null ? String(est.FHRSID) : undefined,
          lat: elat,
          lng: elng,
        });
        const cat = fsaCategory(est.BusinessType, name);
        if (cat) {
          pois.push({
            name,
            category: cat,
            lat: elat,
            lng: elng,
            distanceMiles: round1(dist),
            source: 'fsa',
            hygieneRating: rating,
            hygieneRatingDate: est.RatingDate,
            fhrsId: est.FHRSID != null ? String(est.FHRSID) : undefined,
          });
        }
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    warnings.push(`FSA hygiene failed: ${msg}`);
    console.error(`
=== OPERATOR ACTION NEEDED ===
What I need: FSA Food Hygiene Ratings API (api.ratings.food.gov.uk)
Error: ${msg}
Hygiene badges cannot be attached without this.
==============================
`);
  }
  return { byName, pois, warnings };
}

function namesFuzzyMatch(a: string, b: string): boolean {
  const na = a.toLowerCase().replace(/[^a-z0-9]/g, '');
  const nb = b.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  return false;
}

export function attachFsaHygiene(pois: PoiRecord[], fsaByName: Map<string, { rating: string; date?: string; fhrsId?: string; lat: number; lng: number }>): void {
  const foodCats = new Set<PoiCategory>(['pub', 'cafe', 'restaurant', 'farm_shop']);
  for (const poi of pois) {
    if (!foodCats.has(poi.category)) continue;
    const direct = fsaByName.get(poi.name.toLowerCase());
    if (direct) {
      poi.hygieneRating = direct.rating;
      poi.hygieneRatingDate = direct.date;
      poi.fhrsId = direct.fhrsId;
      continue;
    }
    for (const [fname, data] of fsaByName) {
      if (namesFuzzyMatch(poi.name, fname) && haversineMiles(poi.lat, poi.lng, data.lat, data.lng) < 0.3) {
        poi.hygieneRating = data.rating;
        poi.hygieneRatingDate = data.date;
        poi.fhrsId = data.fhrsId;
        break;
      }
    }
  }
}

// ─── NHS ODS (Organisation Data Service) ────────────────────────────────────

const NHS_ROLES: { role: string; category: PoiCategory }[] = [
  { role: 'RO177', category: 'gp' },
  { role: 'RO107', category: 'dentist' },
  { role: 'RO182', category: 'pharmacy' },
];

interface OdsOrg {
  Name?: string;
  GeoLoc?: { Location?: { Latitude?: string; Longitude?: string } };
  PostCode?: string;
}

async function geocodePostcode(
  pc: string,
  f: typeof fetch
): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await f(`https://api.postcodes.io/postcodes/${encodeURIComponent(pc)}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { result?: { latitude?: number; longitude?: number } };
    if (data.result?.latitude != null && data.result?.longitude != null) {
      return { lat: data.result.latitude, lng: data.result.longitude };
    }
  } catch {
    /* ignore */
  }
  return null;
}

export async function fetchNhsServices(
  postcode: string,
  lat: number,
  lng: number,
  opts?: { fetchImpl?: typeof fetch; settlementHint?: string }
): Promise<{ pois: PoiRecord[]; warnings: string[] }> {
  const f = opts?.fetchImpl ?? fetch;
  const warnings: string[] = [];
  const pois: PoiRecord[] = [];
  const settlement =
    opts?.settlementHint ||
    (postcode.toUpperCase().startsWith('DL6') ? 'Northallerton' : '');

  for (const { role, category } of NHS_ROLES) {
    try {
      const candidates: PoiRecord[] = [];
      const queries = [
        `https://directory.spineservices.nhs.uk/ORD/2-0-0/organisations?PostCode=${encodeURIComponent(postcode.replace(/\s+/g, ''))}&Roles=${role}&Status=Active&Limit=25`,
      ];
      if (settlement) {
        queries.push(
          `https://directory.spineservices.nhs.uk/ORD/2-0-0/organisations?Name=${encodeURIComponent(settlement)}&Roles=${role}&Status=Active&Limit=25`
        );
      }

      for (const url of queries) {
        const res = await f(url, { headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error(`HTTP ${res.status} role=${role}`);
        const data = (await res.json()) as { Organisations?: OdsOrg[] };
        for (const org of data.Organisations || []) {
          const name = cleanName(org.Name);
          if (!name) continue;
          // Skip out-of-hours / non patient-facing / hospital departments mis-tagged as GP/pharmacy
          if (
            /\bOOH\b|PRESCRIBING COST|NATIONAL BOOKING|hospital|ward|department|outpatients?|obstetric|maternity|a\s*&\s*e|acute|trust hq/i.test(
              name
            )
          ) {
            continue;
          }
          let olat = parseFloat(org.GeoLoc?.Location?.Latitude || '');
          let olng = parseFloat(org.GeoLoc?.Location?.Longitude || '');
          if (!Number.isFinite(olat) || !Number.isFinite(olng)) {
            if (org.PostCode) {
              const geo = await geocodePostcode(org.PostCode, f);
              if (!geo) continue;
              olat = geo.lat;
              olng = geo.lng;
            } else continue;
          }
          const dist = round1(haversineMiles(lat, lng, olat, olng));
          if (dist > 12) continue;
          candidates.push({
            name,
            category,
            lat: olat,
            lng: olng,
            distanceMiles: dist,
            source: 'nhs',
          });
        }
      }

      // Prefer closer organisations
      candidates.sort((a, b) => a.distanceMiles - b.distanceMiles);
      const best = candidates[0];
      if (best) pois.push(best);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      warnings.push(`NHS ODS ${category} failed: ${msg}`);
    }
  }

  if (pois.length === 0 && warnings.length) {
    console.error(`
=== OPERATOR ACTION NEEDED ===
What I need: NHS Organisation Data Service (directory.spineservices.nhs.uk)
Error: ${warnings.join('; ')}
Nearest GP / dentist / pharmacy from NHS cannot be recorded without this.
OSM amenity tags may still populate everyday healthcare if available.
==============================
`);
  }
  return { pois, warnings };
}

// ─── Optional Google Places ─────────────────────────────────────────────────

export async function enrichWithGooglePlaces(
  foodPois: PoiRecord[],
  opts?: { fetchImpl?: typeof fetch; apiKey?: string }
): Promise<{ warnings: string[] }> {
  const key = opts?.apiKey ?? process.env.GOOGLE_PLACES_API_KEY;
  const warnings: string[] = [];
  if (!key) {
    operatorPlacesKey();
    return { warnings: ['GOOGLE_PLACES_API_KEY not set — ratings/themes omitted'] };
  }
  const f = opts?.fetchImpl ?? fetch;
  for (const poi of foodPois.slice(0, POI_LIMITS.foodDrink)) {
    try {
      const searchUrl = 'https://places.googleapis.com/v1/places:searchText';
      const res = await f(searchUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': key,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.rating,places.userRatingCount,places.reviews',
        },
        body: JSON.stringify({
          textQuery: `${poi.name} near ${poi.lat},${poi.lng}`,
          maxResultCount: 1,
          locationBias: {
            circle: { center: { latitude: poi.lat, longitude: poi.lng }, radius: 500 },
          },
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as {
        places?: Array<{
          id?: string;
          rating?: number;
          userRatingCount?: number;
          reviews?: Array<{ text?: { text?: string } }>;
        }>;
      };
      const place = data.places?.[0];
      if (!place) continue;
      poi.placesId = place.id;
      if (typeof place.rating === 'number') poi.rating = place.rating;
      if (typeof place.userRatingCount === 'number') poi.reviewCount = place.userRatingCount;
      // Raw reviews are NOT persisted — theme line is filled later by LLM distill
      if (place.reviews?.length) {
        (poi as PoiRecord & { _reviewSnippets?: string[] })._reviewSnippets = place.reviews
          .map((r) => r.text?.text)
          .filter((t): t is string => Boolean(t))
          .slice(0, 3);
      }
    } catch (e) {
      warnings.push(`Places enrich ${poi.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { warnings };
}

// ─── Selection ──────────────────────────────────────────────────────────────

export function selectLivingHereBlocks(all: PoiRecord[]): LivingHereBlocks {
  const foodCats: PoiCategory[] = ['pub', 'cafe', 'restaurant', 'farm_shop'];
  const foodPool = all.filter(
    (p) =>
      foodCats.includes(p.category) &&
      !/nursery|school|academy|college|canteen|kitchen|care\s*home|hospital|ward|department|outpatients?|obstetric|maternity|b\s*&\s*b|bed\s*&\s*breakfast|guest\s*house|hotel|boarding|brass\s*castle/i.test(
        p.name
      )
  );
  // Prefer FSA-rated venues among the nearest candidates (rated first, then by distance)
  const nearestFood = nearestN(foodPool, 15);
  const rated = nearestFood
    .filter((p) => p.hygieneRating)
    .sort((a, b) => a.distanceMiles - b.distanceMiles);
  const unrated = nearestFood
    .filter((p) => !p.hygieneRating)
    .sort((a, b) => a.distanceMiles - b.distanceMiles);
  const foodDrink = [...rated, ...unrated].slice(0, POI_LIMITS.foodDrink);

  const withinWalksCap = (p: PoiRecord) =>
    p.isNationalTrail === true || p.distanceMiles <= WALKS_CAP_MILES;

  const trails = nearestN(
    all.filter((p) => p.category === 'trail' && withinWalksCap(p)),
    3
  ).sort((a, b) => {
    if (a.isNationalTrail && !b.isNationalTrail) return -1;
    if (!a.isNationalTrail && b.isNationalTrail) return 1;
    return a.distanceMiles - b.distanceMiles;
  });
  const outdoors = nearestN(
    all.filter(
      (p) =>
        ['park', 'wood', 'nature_reserve', 'viewpoint'].includes(p.category) && withinWalksCap(p)
    ),
    POI_LIMITS.walksOutdoors - trails.length
  );
  const walksOutdoors = [...trails, ...outdoors].slice(0, POI_LIMITS.walksOutdoors);

  const everydayPool = all.filter(
    (p) =>
      !['gp', 'dentist', 'pharmacy'].includes(p.category) ||
      !/hospital|ward|department|outpatients?|obstetric|maternity|a\s*&\s*e/i.test(p.name)
  );
  const everyday = onePerCategory(everydayPool, [
    'supermarket',
    'gp',
    'dentist',
    'pharmacy',
    'petrol',
    'playground',
  ]);

  return { foodDrink, walksOutdoors, everyday };
}

export function mergeNhsPrefer(osm: PoiRecord[], nhs: PoiRecord[]): PoiRecord[] {
  const out = [...osm];
  for (const n of nhs) {
    const idx = out.findIndex((p) => p.category === n.category);
    if (idx >= 0) {
      // Prefer NHS for healthcare
      if (['gp', 'dentist', 'pharmacy'].includes(n.category)) out[idx] = n;
    } else {
      out.push(n);
    }
  }
  return out;
}

/** Full lookup — used live and by record-fixtures */
export async function lookupLivingHerePois(
  lat: number,
  lng: number,
  postcode: string,
  opts?: {
    fetchImpl?: typeof fetch;
    skipCache?: boolean;
    skipPlaces?: boolean;
    prefetched?: { osm?: PoiRecord[]; fsaByName?: ReturnType<typeof Map.prototype.get> extends never ? never : Map<string, { rating: string; date?: string; fhrsId?: string; lat: number; lng: number }>; nhs?: PoiRecord[] };
  }
): Promise<PoiLookupResult> {
  const key = normPc(postcode);
  if (!opts?.skipCache && cache.has(key)) return cache.get(key)!;

  const warnings: string[] = [];
  let osmPois: PoiRecord[] = opts?.prefetched?.osm ?? [];
  let nhsPois: PoiRecord[] = opts?.prefetched?.nhs ?? [];

  if (!opts?.prefetched?.osm) {
    const osm = await fetchOsmPois(lat, lng, { fetchImpl: opts?.fetchImpl });
    osmPois = osm.pois;
    warnings.push(...osm.warnings);
  }
  if (!opts?.prefetched?.nhs) {
    const nhs = await fetchNhsServices(postcode, lat, lng, { fetchImpl: opts?.fetchImpl });
    nhsPois = nhs.pois;
    warnings.push(...nhs.warnings);
  }

  let all = mergeNhsPrefer(osmPois, nhsPois);

  const fsa =
    opts?.prefetched?.fsaByName != null
      ? {
          byName: opts.prefetched.fsaByName,
          pois: [] as PoiRecord[],
          warnings: [] as string[],
        }
      : await fetchFsaHygiene(postcode, lat, lng, { fetchImpl: opts?.fetchImpl });
  warnings.push(...fsa.warnings);
  // Merge FSA venues (real establishments) — fill gaps when OSM is thin/rate-limited
  for (const fp of fsa.pois) {
    const dup = all.some(
      (p) =>
        namesFuzzyMatch(p.name, fp.name) && haversineMiles(p.lat, p.lng, fp.lat, fp.lng) < 0.25
    );
    if (!dup) all.push(fp);
  }
  attachFsaHygiene(all, fsa.byName);

  const blocks = selectLivingHereBlocks(all);
  let placesEnabled = false;

  if (!opts?.skipPlaces && process.env.GOOGLE_PLACES_API_KEY) {
    const places = await enrichWithGooglePlaces(blocks.foodDrink, { fetchImpl: opts?.fetchImpl });
    warnings.push(...places.warnings);
    placesEnabled = true;
  } else if (!opts?.skipPlaces) {
    operatorPlacesKey();
    warnings.push('GOOGLE_PLACES_API_KEY not set — OSM+FSA only');
  }

  const result: PoiLookupResult = {
    blocks,
    all,
    warnings,
    placesEnabled,
  };
  if (!opts?.skipCache) cache.set(key, result);
  return result;
}

/** Rebuild blocks from a recorded fixture payload — always re-select from `all` when present so caps apply. */
export function livingHereFromRecorded(payload: {
  all?: PoiRecord[];
  blocks?: LivingHereBlocks;
}): LivingHereBlocks {
  if (payload.all?.length) return selectLivingHereBlocks(payload.all);
  if (payload.blocks) return payload.blocks;
  return { foodDrink: [], walksOutdoors: [], everyday: [] };
}
