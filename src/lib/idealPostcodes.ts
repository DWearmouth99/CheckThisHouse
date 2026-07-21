/**
 * Ideal Postcodes — UK address autocomplete + postcode lookup (server-side only).
 * Docs: https://docs.ideal-postcodes.co.uk/docs/api/find-address/
 * Postcode: GET /v1/postcodes/{postcode} returns every premise at that postcode.
 */

const API_BASE = 'https://api.ideal-postcodes.co.uk/v1';

/** Full UK postcode (outward + inward), spaced or compact. */
const FULL_POSTCODE_RE =
  /\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i;

/** Compact form only, e.g. EH222RB / nd222rb */
const COMPACT_POSTCODE_RE = /^([A-Z]{1,2}\d[A-Z\d]?)(\d[A-Z]{2})$/i;

/** Official UK postcode areas (outward letter part). */
const UK_POSTCODE_AREAS = new Set(
  [
    'AB', 'AL', 'B', 'BA', 'BB', 'BD', 'BH', 'BL', 'BN', 'BR', 'BS', 'BT', 'CA', 'CB', 'CF', 'CH',
    'CM', 'CO', 'CR', 'CT', 'CV', 'CW', 'DA', 'DD', 'DE', 'DG', 'DH', 'DL', 'DN', 'DT', 'DY', 'E',
    'EC', 'EH', 'EN', 'EX', 'FK', 'FY', 'G', 'GL', 'GU', 'HA', 'HD', 'HG', 'HP', 'HR', 'HS', 'HU',
    'HX', 'IG', 'IP', 'IV', 'JE', 'KA', 'KT', 'KW', 'KY', 'L', 'LA', 'LD', 'LE', 'LL', 'LN', 'LS',
    'LU', 'M', 'ME', 'MK', 'ML', 'N', 'NE', 'NG', 'NN', 'NP', 'NR', 'NW', 'OL', 'OX', 'PA', 'PE',
    'PH', 'PL', 'PO', 'PR', 'RG', 'RH', 'RM', 'S', 'SA', 'SE', 'SG', 'SK', 'SL', 'SM', 'SN', 'SO',
    'SP', 'SR', 'SS', 'ST', 'SW', 'SY', 'TA', 'TD', 'TF', 'TN', 'TQ', 'TR', 'TS', 'TW', 'UB', 'W',
    'WA', 'WC', 'WD', 'WF', 'WN', 'WR', 'WS', 'WV', 'YO', 'ZE',
  ].map((a) => a.toUpperCase())
);

export type AddressSuggestion = {
  id: string;
  suggestion: string;
  /** When set (postcode lookup), client can use this without a second paid resolve. */
  formatted?: string;
};

export type SuggestResult = {
  suggestions: AddressSuggestion[];
  source: 'postcode' | 'autocomplete';
  /** True when we returned the full premise list for a complete postcode. */
  completeList: boolean;
  /** Human-readable hint when the query looks wrong or empty. */
  notice?: string;
  /** Alternate postcodes to try (typos / Ideal suggestions). */
  didYouMean?: string[];
};

export type ResolvedAddress = {
  formatted: string;
  line1: string;
  line2: string;
  line3: string;
  postTown: string;
  postcode: string;
  county?: string;
};

function getApiKey(): string {
  const raw = process.env.IDEAL_POSTCODES_API_KEY || '';
  return raw.trim().replace(/^["']|["']$/g, '');
}

export function hasIdealPostcodesKey(): boolean {
  const key = getApiKey();
  return key.startsWith('ak_') && key.length > 12 && !key.includes('REPLACE');
}

async function idealFetch(
  pathAndQuery: string,
  opts?: { allowNotFound?: boolean }
): Promise<any> {
  const key = getApiKey();
  if (!hasIdealPostcodesKey()) {
    throw Object.assign(new Error('Address lookup is not configured.'), { status: 503 });
  }
  const sep = pathAndQuery.includes('?') ? '&' : '?';
  const url = `${API_BASE}${pathAndQuery}${sep}api_key=${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(12000),
  });
  const body = await res.json().catch(() => ({}));
  if (res.status === 404 && opts?.allowNotFound) {
    return { __notFound: true, ...body };
  }
  if (!res.ok) {
    const msg =
      body?.message ||
      body?.error ||
      `Address lookup failed (${res.status}).`;
    throw Object.assign(new Error(String(msg)), { status: res.status >= 500 ? 502 : res.status });
  }
  return body;
}

function normalizePostcode(pc: string): string {
  const compact = pc.toUpperCase().replace(/\s+/g, '');
  if (compact.length >= 5) {
    return `${compact.slice(0, -3)} ${compact.slice(-3)}`;
  }
  return pc.toUpperCase().replace(/\s+/g, ' ').trim();
}

function compactPostcode(pc: string): string {
  return pc.toUpperCase().replace(/\s+/g, '');
}

/** Split "EH22 2RB" / "eh222rb" → { area: "EH", district: "22", inward: "2RB", spaced: "EH22 2RB" } */
function parsePostcodeParts(raw: string): {
  area: string;
  district: string;
  inward: string;
  spaced: string;
  compact: string;
} | null {
  const spacedMatch = raw.trim().match(FULL_POSTCODE_RE);
  const compact =
    spacedMatch
      ? compactPostcode(spacedMatch[1]!)
      : compactPostcode(raw.trim()).match(COMPACT_POSTCODE_RE)
        ? compactPostcode(raw.trim())
        : null;
  if (!compact) return null;
  const m = compact.match(COMPACT_POSTCODE_RE);
  if (!m) return null;
  const outward = m[1]!.toUpperCase();
  const inward = m[2]!.toUpperCase();
  const areaMatch = outward.match(/^([A-Z]{1,2})(\d[A-Z\d]?)$/i);
  if (!areaMatch) return null;
  return {
    area: areaMatch[1]!.toUpperCase(),
    district: areaMatch[2]!.toUpperCase(),
    inward,
    spaced: `${outward} ${inward}`,
    compact,
  };
}

function formatPremise(r: Record<string, unknown>): string {
  const line1 = String(r.line_1 || r.line1 || '').trim();
  const line2 = String(r.line_2 || r.line2 || '').trim();
  const line3 = String(r.line_3 || r.line3 || '').trim();
  const postTown = String(r.post_town || r.postTown || r.town || '').trim();
  const postcode = String(r.postcode || '').trim().toUpperCase();
  const county = String(r.county || '').trim();
  return [line1, line2, line3, postTown, county, postcode].filter(Boolean).join(', ');
}

function premiseToSuggestion(r: Record<string, unknown>): AddressSuggestion | null {
  const udprn = r.udprn != null ? String(r.udprn).trim() : '';
  const umprn = r.umprn != null ? String(r.umprn).trim() : '';
  const id = umprn ? `umprn:${umprn}` : udprn ? `udprn:${udprn}` : '';
  const formatted = formatPremise(r);
  if (!id || !formatted) return null;
  const line1 = String(r.line_1 || r.line1 || '').trim();
  const postTown = String(r.post_town || r.postTown || '').trim();
  const postcode = String(r.postcode || '').trim().toUpperCase();
  const suggestion = [line1, postTown, postcode].filter(Boolean).join(', ') || formatted;
  return { id, suggestion, formatted };
}

function extractHouseFilter(query: string, postcode: string): string | null {
  const rest = query
    .replace(new RegExp(postcode.replace(/\s+/g, '\\s*'), 'i'), ' ')
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!rest) return null;
  const m = rest.match(/^(\d+[A-Za-z]?)\b/i) || rest.match(/\b(\d+[A-Za-z]?)\b/);
  return m ? m[1]!.toUpperCase() : null;
}

function matchesHouseFilter(suggestion: AddressSuggestion, house: string): boolean {
  const h = house.toUpperCase();
  const text = `${suggestion.suggestion} ${suggestion.formatted || ''}`.toUpperCase();
  if (new RegExp(`(^|[,\\s])${h}\\s`).test(` ${text}`)) return true;
  if (text.startsWith(`${h} `) || text.startsWith(`${h},`)) return true;
  return false;
}

function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + cost
      );
    }
  }
  return dp[m]![n]!;
}

/** Nearby valid area codes (typo help) — free autocomplete probes only. */
function nearbyAreas(area: string, maxDist: number): string[] {
  const out: { area: string; d: number }[] = [];
  for (const candidate of UK_POSTCODE_AREAS) {
    if (candidate === area) continue;
    const d = editDistance(area, candidate);
    if (d > 0 && d <= maxDist) out.push({ area: candidate, d });
  }
  out.sort((a, b) => a.d - b.d || a.area.localeCompare(b.area));
  return out.map((x) => x.area);
}

async function lookupAllAtPostcode(postcode: string): Promise<{
  applications: AddressSuggestion[];
  notFound?: boolean;
  idealSuggestions?: string[];
}> {
  const compact = compactPostcode(postcode);
  const first = await idealFetch(`/postcodes/${encodeURIComponent(compact)}?page=0`, {
    allowNotFound: true,
  });

  if (first?.__notFound) {
    const idealSuggestions = Array.isArray(first.suggestions)
      ? first.suggestions.map((s: string) => normalizePostcode(String(s))).filter(Boolean)
      : [];
    return { applications: [], notFound: true, idealSuggestions };
  }

  const all: AddressSuggestion[] = [];
  const seen = new Set<string>();
  const ingest = (rows: unknown[]) => {
    for (const row of rows) {
      const s = premiseToSuggestion(row as Record<string, unknown>);
      if (!s || seen.has(s.id)) continue;
      seen.add(s.id);
      all.push(s);
    }
  };

  const rows0 = first?.result || first?.hits || [];
  if (Array.isArray(rows0)) ingest(rows0);

  if (Array.isArray(rows0) && rows0.length >= 100) {
    for (let page = 1; page < 20; page++) {
      const body = await idealFetch(`/postcodes/${encodeURIComponent(compact)}?page=${page}`);
      const rows = body?.result || body?.hits || [];
      if (!Array.isArray(rows) || rows.length === 0) break;
      ingest(rows);
      if (rows.length < 100) break;
    }
  }

  all.sort((a, b) => {
    const na = parseInt((a.suggestion.match(/^(\d+)/) || [])[1] || '999999', 10);
    const nb = parseInt((b.suggestion.match(/^(\d+)/) || [])[1] || '999999', 10);
    if (na !== nb) return na - nb;
    return a.suggestion.localeCompare(b.suggestion, 'en-GB');
  });

  return { applications: all };
}

async function autocompleteSuggest(query: string): Promise<AddressSuggestion[]> {
  const body = await idealFetch(
    `/autocomplete/addresses?query=${encodeURIComponent(query)}&limit=20`
  );
  const hits = body?.result?.hits || body?.result?.suggestions || body?.hits || [];
  if (!Array.isArray(hits)) return [];

  return hits
    .map((h: any) => {
      const id = String(h.id || h.udprn || h.umprn || '').trim();
      const suggestion = String(h.suggestion || h.address || h.summary || '').trim();
      if (!id || !suggestion) return null;
      return { id, suggestion } as AddressSuggestion;
    })
    .filter(Boolean) as AddressSuggestion[];
}

/** Extra area guesses for invalid codes that aren’t a single-letter typo (e.g. ND → EH). */
const AREA_CONFUSIONS: Record<string, string[]> = {
  ND: ['EH', 'NE', 'DH', 'NG', 'TD'],
  HN: ['EH', 'DH', 'HA'],
  HE: ['EH', 'NE', 'PE'],
  NH: ['EH', 'NE', 'NG'],
  ED: ['EH', 'EC', 'EX', 'TD'],
};

/** Confirm nearby postcodes via Ideal (404s are free; hits cost one lookup each). */
async function findDidYouMean(
  parts: {
    area: string;
    district: string;
    inward: string;
  },
  idealSuggestions: string[]
): Promise<string[]> {
  const candidates: string[] = [];
  const seen = new Set<string>();
  const push = (pc: string) => {
    const n = normalizePostcode(pc);
    if (!n || seen.has(n)) return;
    seen.add(n);
    candidates.push(n);
  };

  for (const s of idealSuggestions) push(s);

  const areaValid = UK_POSTCODE_AREAS.has(parts.area);
  if (!areaValid) {
    for (const area of AREA_CONFUSIONS[parts.area] || []) {
      push(`${area}${parts.district}${parts.inward}`);
    }
    // Single-letter / length typos only (edit distance 1)
    for (const area of nearbyAreas(parts.area, 1)) {
      push(`${area}${parts.district}${parts.inward}`);
    }
  }

  const scored: { pc: string; score: number }[] = [];
  for (const pc of candidates.slice(0, 20)) {
    try {
      const looked = await lookupAllAtPostcode(pc);
      if (!looked.notFound && looked.applications.length > 0) {
        scored.push({ pc, score: looked.applications.length });
      }
    } catch {
      // ignore probe failures
    }
  }

  scored.sort((a, b) => b.score - a.score || a.pc.localeCompare(b.pc));
  return scored.slice(0, 5).map((s) => s.pc);
}

/**
 * Step 1 — suggestions.
 * Complete postcode → full premise list (postcode lookup).
 * Otherwise → autocomplete (free; capped at 20).
 */
export async function suggestAddresses(query: string): Promise<SuggestResult> {
  const q = query.trim();
  if (q.length < 3) {
    return { suggestions: [], source: 'autocomplete', completeList: false };
  }

  const parts = parsePostcodeParts(q);
  if (parts) {
    const postcode = parts.spaced;
    const areaValid = UK_POSTCODE_AREAS.has(parts.area);
    const looked = await lookupAllAtPostcode(postcode);

    if (!looked.notFound && looked.applications.length > 0) {
      let list = looked.applications;
      const house = extractHouseFilter(q, postcode);
      if (house) {
        const filtered = list.filter((s) => matchesHouseFilter(s, house));
        if (filtered.length > 0) list = filtered;
      }
      return {
        suggestions: list,
        source: 'postcode',
        completeList: true,
      };
    }

    // Invalid / unknown postcode — don't show fuzzy unrelated autocomplete hits
    let suggestions: AddressSuggestion[] = [];
    if (areaValid) {
      suggestions = await autocompleteSuggest(postcode);
      if (suggestions.length === 0) {
        suggestions = await autocompleteSuggest(q);
      }
    }

    const didYouMean = await findDidYouMean(parts, looked.idealSuggestions || []);
    const notice =
      suggestions.length === 0
        ? didYouMean.length > 0
          ? `No addresses for ${postcode}. That isn’t a known Royal Mail postcode — did you mean one of these?`
          : `No addresses for ${postcode}. Check for a typo, or try your house number and street name.`
        : undefined;

    return {
      suggestions,
      source: 'autocomplete',
      completeList: false,
      notice,
      didYouMean: didYouMean.length ? didYouMean : undefined,
    };
  }

  const suggestions = await autocompleteSuggest(q);
  return { suggestions, source: 'autocomplete', completeList: false };
}

function resolvedFromPremise(r: Record<string, unknown>): ResolvedAddress {
  const line1 = String(r.line_1 || r.line1 || '').trim();
  const line2 = String(r.line_2 || r.line2 || '').trim();
  const line3 = String(r.line_3 || r.line3 || '').trim();
  const postTown = String(r.post_town || r.postTown || r.town || '').trim();
  const postcode = String(r.postcode || '').trim().toUpperCase();
  const county = String(r.county || '').trim() || undefined;
  const formatted = [line1, line2, line3, postTown, county, postcode].filter(Boolean).join(', ');
  if (!formatted || !postcode) {
    throw Object.assign(new Error('Could not resolve that address. Try another suggestion.'), {
      status: 502,
    });
  }
  return { formatted, line1, line2, line3, postTown, postcode, county };
}

/** Step 2 — resolve selection (billed lookup for autocomplete / udprn ids). */
export async function resolveAddress(addressId: string): Promise<ResolvedAddress> {
  const id = addressId.trim();
  if (!id) {
    throw Object.assign(new Error('Missing address id.'), { status: 400 });
  }

  if (id.startsWith('udprn:')) {
    const udprn = id.slice('udprn:'.length);
    const body = await idealFetch(`/udprn/${encodeURIComponent(udprn)}`);
    return resolvedFromPremise((body?.result || body) as Record<string, unknown>);
  }

  if (id.startsWith('umprn:')) {
    const umprn = id.slice('umprn:'.length);
    const body = await idealFetch(`/umprn/${encodeURIComponent(umprn)}`);
    return resolvedFromPremise((body?.result || body) as Record<string, unknown>);
  }

  const encodedId = encodeURIComponent(id);
  const body = await idealFetch(`/autocomplete/addresses/${encodedId}/gbr`);
  return resolvedFromPremise((body?.result || body) as Record<string, unknown>);
}
