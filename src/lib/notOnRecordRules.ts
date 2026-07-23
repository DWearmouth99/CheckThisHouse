/**
 * P5 — suppress "Not on record" leaks; collapse duplicate schema facts; school distances.
 */

export const NOT_ON_RECORD_ALLOWLIST = new Set([
  'floor area',
  'floor area (epc)',
  'epc',
  'epc rating',
  'epc lodged',
  'council tax',
  'council tax band',
  'council tax & parking',
]);

const DUPLICATE_FACT_GROUPS: string[][] = [
  ['bedrooms', 'bedrooms / rooms', 'beds', 'habitable rooms'],
  ['bathrooms', 'baths', 'bathrooms / toilets'],
  ['property type', 'type', 'dwelling type'],
  ['floor area', 'total floor area', 'floor area (epc)', 'size'],
  ['epc', 'epc rating', 'energy rating'],
];

function normLabel(s: string): string {
  return String(s || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function isUnresolved(value: string): boolean {
  return /not on record|^unknown$|^n\/?a$|^—$|^-$|not specified/i.test(String(value || '').trim());
}

function isAllowlisted(label: string): boolean {
  const n = normLabel(label);
  if (NOT_ON_RECORD_ALLOWLIST.has(n)) return true;
  for (const a of NOT_ON_RECORD_ALLOWLIST) {
    if (n.includes(a)) return true;
  }
  return false;
}

/**
 * Collapse duplicate-fact specs to one row; drop unresolved non-allowlisted rows;
 * allowlisted unresolved → "Not on record — verify with {source}".
 */
export function resolveSpecsRows(
  specs: { label?: string; value?: string }[] | undefined
): { label: string; value: string }[] {
  const rows = (specs || [])
    .map((s) => ({ label: String(s.label || '').trim(), value: String(s.value || '').trim() }))
    .filter((s) => s.label);

  const byNorm = new Map<string, { label: string; value: string }>();
  for (const row of rows) {
    let groupKey = normLabel(row.label);
    for (const group of DUPLICATE_FACT_GROUPS) {
      if (group.some((g) => groupKey === g || groupKey.includes(g))) {
        groupKey = group[0]!;
        break;
      }
    }
    const existing = byNorm.get(groupKey);
    if (!existing) {
      byNorm.set(groupKey, row);
      continue;
    }
    // Prefer resolved over unresolved
    if (isUnresolved(existing.value) && !isUnresolved(row.value)) {
      byNorm.set(groupKey, row);
    } else if (!isUnresolved(existing.value) && isUnresolved(row.value)) {
      // keep existing
    } else if (row.value.length > existing.value.length) {
      byNorm.set(groupKey, row);
    }
  }

  const out: { label: string; value: string }[] = [];
  for (const row of byNorm.values()) {
    if (isUnresolved(row.value)) {
      if (!isAllowlisted(row.label)) continue;
      const source = /epc|floor|energy/i.test(row.label)
        ? 'the EPC register'
        : /council tax/i.test(row.label)
          ? 'the local council'
          : 'the listing or a viewing';
      out.push({
        label: row.label,
        value: `Not on record — verify with ${source}`,
      });
      continue;
    }
    out.push(row);
  }
  return out;
}

/** Rating/status cells must never show "Not on record" — blank instead. */
export function ratingOrBlank(value?: string | null): string {
  const v = String(value || '').trim();
  if (!v || isUnresolved(v)) return '';
  return v;
}

export function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function parseExistingDistanceMiles(raw: string): number | null {
  const s = String(raw || '');
  if (isUnresolved(s)) return null;
  const mi = s.match(/([\d.]+)\s*(mi|mile|miles)\b/i);
  if (mi) return parseFloat(mi[1]!);
  const km = s.match(/([\d.]+)\s*km\b/i);
  if (km) return parseFloat(km[1]!) * 0.621371;
  const bare = s.match(/^([\d.]+)\s*$/);
  if (bare) return parseFloat(bare[1]!);
  return null;
}

async function geocodeQuery(q: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=gb&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'CheckThisHouse/1.0 (property reports; contact@checkthishouse.co.uk)',
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || !data[0]) return null;
    const lat = parseFloat(data[0].lat);
    const lng = parseFloat(data[0].lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}

export type SchoolRow = {
  name: string;
  distance: string;
  rating: string;
  lat?: number;
  lng?: number;
};

/**
 * Ensure every school has a numeric distance (miles). Prefer existing parseable
 * distance; else haversine from subject ↔ school coords (geocoded if needed).
 * Drop rows that still have no distance. Blank unresolved ratings.
 */
export async function enforceSchoolDistances(
  schools: SchoolRow[] | undefined,
  subject: { lat: number; lng: number; town?: string; postcode?: string } | null
): Promise<SchoolRow[]> {
  const list = Array.isArray(schools) ? schools : [];
  const out: SchoolRow[] = [];

  for (const s of list) {
    const name = String(s.name || '').trim();
    if (!name) continue;
    const rating = ratingOrBlank(s.rating);

    let miles = parseExistingDistanceMiles(String(s.distance || ''));
    if (miles == null && subject) {
      let slat = typeof s.lat === 'number' ? s.lat : NaN;
      let slng = typeof s.lng === 'number' ? s.lng : NaN;
      if (!Number.isFinite(slat) || !Number.isFinite(slng)) {
        const q = [name, subject.town, subject.postcode, 'UK'].filter(Boolean).join(', ');
        const geo = await geocodeQuery(q);
        if (geo) {
          slat = geo.lat;
          slng = geo.lng;
        }
      }
      if (Number.isFinite(slat) && Number.isFinite(slng)) {
        miles = haversineMiles(subject.lat, subject.lng, slat, slng);
      }
    }

    if (miles == null || !Number.isFinite(miles)) {
      console.warn(`[schools] drop "${name}" — no computable distance`);
      continue;
    }

    out.push({
      name,
      distance: `${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi`,
      rating,
      lat: s.lat,
      lng: s.lng,
    });
  }

  return out.slice(0, 10);
}
