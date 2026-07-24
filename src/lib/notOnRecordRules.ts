/**
 * Suppression + Ofsted rating rendering (Part 5).
 *
 * Rule A — suppression applies ONLY to null/unresolved values. A resolved value
 *          must always render (never blank/"—"/over-suppress).
 * Rule B — if two schema fields describe the same fact, resolve to one before
 *          render — never show both.
 * Rule C — unresolved fields are omitted, EXCEPT buyer-critical allowlist facts
 *          which render "Not on record — verify with {named source}".
 */

/** Rule C allowlist — buyer-critical facts that must surface even when unresolved. */
export const BUYER_CRITICAL_UNRESOLVED_ALLOWLIST = [
  'floor area',
  'council tax band',
  'epc',
  'bathrooms',
] as const;

/** @deprecated alias — prefer BUYER_CRITICAL_UNRESOLVED_ALLOWLIST */
export const NOT_ON_RECORD_ALLOWLIST = new Set<string>([
  ...BUYER_CRITICAL_UNRESOLVED_ALLOWLIST,
  // label variants matched via includes()
  'floor area (epc)',
  'epc rating',
  'epc lodged',
  'council tax',
  'council tax & parking',
  'baths',
  'bathrooms / toilets',
]);

const DUPLICATE_FACT_GROUPS: string[][] = [
  ['bedrooms', 'bedrooms / rooms', 'beds', 'habitable rooms'],
  ['bathrooms', 'baths', 'bathrooms / toilets'],
  ['property type', 'type', 'dwelling type'],
  ['floor area', 'total floor area', 'floor area (epc)', 'size'],
  ['epc', 'epc rating', 'energy rating'],
];

/** Single-word Ofsted grades (retired for inspections from Sep 2024). */
const SINGLE_WORD_GRADES =
  /^(outstanding|good|requires\s*improvement|inadequate|satisfactory|excellent)$/i;

/** Ofsted retired single-word judgements for state-school inspections from Sep 2024. */
export const OFSTED_GRADE_RETIREMENT = new Date('2024-09-01');

function normLabel(s: string): string {
  return String(s || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Match a normalised label to a duplicate-fact alias.
 * Avoids `.includes('size')` collapsing "Garden size" into floor area.
 */
function matchesFactAlias(groupKey: string, alias: string): boolean {
  if (groupKey === alias) return true;
  if (alias.includes(' ')) {
    return groupKey.includes(alias);
  }
  // Single-word: leading token / slash form only (epc rating, bedrooms/rooms).
  // Do not match as a trailing token ("garden size" ≠ floor-area "size").
  return (
    groupKey.startsWith(alias + ' ') ||
    groupKey.startsWith(alias + '/') ||
    groupKey.startsWith(alias + ' /')
  );
}

export function isUnresolvedValue(value: string): boolean {
  return /not on record|^unknown$|^n\/?a$|^—$|^-$|not specified/i.test(String(value || '').trim());
}

function isAllowlisted(label: string): boolean {
  const n = normLabel(label);
  if (NOT_ON_RECORD_ALLOWLIST.has(n)) return true;
  for (const a of BUYER_CRITICAL_UNRESOLVED_ALLOWLIST) {
    if (n === a || n.includes(a)) return true;
  }
  for (const a of NOT_ON_RECORD_ALLOWLIST) {
    if (a.includes(' ') ? n.includes(a) : n === a || n.startsWith(a + ' ') || n.startsWith(a + '/')) {
      return true;
    }
  }
  return false;
}

/**
 * Rule B + C: collapse duplicate-fact specs to one row; drop unresolved
 * non-allowlisted rows; allowlisted unresolved → "Not on record — verify with {source}".
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
      if (group.some((g) => matchesFactAlias(groupKey, g))) {
        groupKey = group[0]!;
        break;
      }
    }
    const existing = byNorm.get(groupKey);
    if (!existing) {
      byNorm.set(groupKey, row);
      continue;
    }
    // Prefer resolved over unresolved (Rule B)
    if (isUnresolvedValue(existing.value) && !isUnresolvedValue(row.value)) {
      byNorm.set(groupKey, row);
    } else if (!isUnresolvedValue(existing.value) && isUnresolvedValue(row.value)) {
      // keep existing
    } else if (row.value.length > existing.value.length) {
      byNorm.set(groupKey, row);
    }
  }

  const out: { label: string; value: string }[] = [];
  for (const row of byNorm.values()) {
    if (isUnresolvedValue(row.value)) {
      if (!isAllowlisted(row.label)) continue; // Rule C: omit
      const source = /epc|floor|energy/i.test(row.label)
        ? 'the EPC register'
        : /council tax/i.test(row.label)
          ? 'the local council'
          : /bath/i.test(row.label)
            ? 'a viewing or the listing'
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

/**
 * Parse inspection dates from GIAS/Edubase forms: DD-MM-YYYY, YYYY-MM-DD, DD/MM/YYYY.
 */
export function parseOfstedInspectionDate(raw?: string | null): Date | null {
  const s = String(raw || '').trim();
  if (!s) return null;
  const dmy = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmy) {
    const d = new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
    return Number.isFinite(d.getTime()) ? d : null;
  }
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return Number.isFinite(d.getTime()) ? d : null;
  }
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t) : null;
}

function formatMonYyyy(d: Date): string {
  return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

export type OfstedRatingInput = {
  /** Single-word grade or empty */
  grade?: string | null;
  /** Date of the latest graded (OEIF) judgement */
  inspectionDate?: string | null;
  /**
   * Newer inspection than the graded judgement (report-card / ungraded visit).
   * When present and after inspectionDate → append " · report card {Mon YYYY}".
   */
  newerInspectionDate?: string | null;
  /** Explicit flag from linked data that this is a post-retirement report-card inspection */
  postRetirementNoGrade?: boolean;
};

/**
 * School rating cell (Rule A): resolved grades always render; never "—" / "Not on record".
 *
 * - grade + date → "{rating} ({Mon YYYY})"
 * - grade + older date + newer report-card → "{rating} ({Mon YYYY}) · report card {Mon YYYY}"
 * - grade, no date → "{rating}"
 * - post-retirement inspection without single-word grade → "See Ofsted report ({Mon YYYY})"
 * - genuinely no inspection → "Not yet inspected"
 */
export function formatOfstedRatingCell(input: OfstedRatingInput | string | null | undefined): string {
  if (typeof input === 'string' || input == null) {
    return formatOfstedRatingCell({ grade: input });
  }
  const rawGrade = String(input.grade || '').trim();
  const date = parseOfstedInspectionDate(input.inspectionDate);
  const newer = parseOfstedInspectionDate(input.newerInspectionDate);
  const gradeLooksUnresolved =
    !rawGrade ||
    /not on record|^unknown$|^n\/?a$|^—$|^-$|not specified/i.test(rawGrade);
  const hasSingleWord = !gradeLooksUnresolved && SINGLE_WORD_GRADES.test(rawGrade);
  const postRetirement =
    input.postRetirementNoGrade === true ||
    (date != null && date >= OFSTED_GRADE_RETIREMENT && !hasSingleWord && !newer);

  if (postRetirement && date && !hasSingleWord) {
    return `See Ofsted report (${formatMonYyyy(date)})`;
  }
  if (hasSingleWord || (!gradeLooksUnresolved && rawGrade)) {
    const display = hasSingleWord
      ? rawGrade
          .toLowerCase()
          .replace(/\b\w/g, (c) => c.toUpperCase())
          .replace(/Requires Improvement/i, 'Requires improvement')
      : rawGrade.replace(/\s+/g, ' ');
    let cell = date ? `${display} (${formatMonYyyy(date)})` : display;
    // Newer inspection than the graded judgement must not be hidden
    if (newer && (!date || newer.getTime() > date.getTime())) {
      cell += ` · report card ${formatMonYyyy(newer)}`;
    }
    return cell;
  }
  if (newer) {
    return `See Ofsted report (${formatMonYyyy(newer)})`;
  }
  return 'Not yet inspected';
}

/**
 * Rule A helper: a school object WITH a resolved rating must never render as "—".
 */
export function renderSchoolRatingForDisplay(school: {
  rating?: string | null;
  ofsted?: string | null;
  ofstedDate?: string | null;
  ofstedNewerDate?: string | null;
  inspectionDate?: string | null;
  newerInspectionDate?: string | null;
}): string {
  if (
    school.ofsted != null ||
    school.ofstedDate != null ||
    school.inspectionDate != null ||
    school.ofstedNewerDate != null ||
    school.newerInspectionDate != null
  ) {
    return formatOfstedRatingCell({
      grade: school.ofsted ?? '',
      inspectionDate: school.ofstedDate || school.inspectionDate,
      newerInspectionDate: school.ofstedNewerDate || school.newerInspectionDate,
    });
  }
  const existing = String(school.rating || '').trim();
  if (
    /^see ofsted report\b/i.test(existing) ||
    /^not yet inspected$/i.test(existing) ||
    /· report card /i.test(existing)
  ) {
    return existing;
  }
  if (existing && !/^(—|-)$/i.test(existing) && !isUnresolvedValue(existing)) {
    return existing;
  }
  return formatOfstedRatingCell({
    grade: existing,
    inspectionDate: school.inspectionDate,
    newerInspectionDate: school.newerInspectionDate,
  });
}

/** @deprecated Prefer formatOfstedRatingCell — blanking caused v4 "—" bug. */
export function ratingOrBlank(value?: string | null): string {
  const v = String(value || '').trim();
  if (!v || isUnresolvedValue(v)) return '';
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
  if (isUnresolvedValue(s)) return null;
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
  ofsted?: string;
  ofstedDate?: string;
  ofstedNewerDate?: string;
};

/**
 * Ensure every school has a numeric distance (miles). Prefer existing parseable
 * distance; else haversine from subject ↔ school coords (geocoded if needed).
 * Drop rows that still have no distance. Format Ofsted cells via Rule A.
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
    const rating = renderSchoolRatingForDisplay(s);

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
      ofsted: s.ofsted,
      ofstedDate: s.ofstedDate,
      ofstedNewerDate: s.ofstedNewerDate,
    });
  }

  return out.slice(0, 10);
}

/** Plain-text schools table for tests / logs. */
export function formatSchoolsTableText(
  schools: {
    name?: string;
    distance?: string;
    rating?: string;
    ofsted?: string;
    ofstedDate?: string;
    ofstedNewerDate?: string;
  }[]
): string {
  const rows = (schools || []).map((s) => {
    const rating = renderSchoolRatingForDisplay(s);
    return `${s.name || '—'} | ${s.distance || ''} | ${rating}`;
  });
  return ['School | Dist. | Rating', ...rows].join('\n');
}
