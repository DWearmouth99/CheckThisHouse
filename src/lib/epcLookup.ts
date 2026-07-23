/**
 * England & Wales EPC lookup.
 * 1) Official Open Data API when credentials are set:
 *    - Prefer EPC_API_BEARER (new MHCLG portal — GOV.UK One Login)
 *    - Else EPC_API_EMAIL + EPC_API_KEY (legacy Basic auth)
 * 2) Public HTML register search fallback (band + address only)
 *
 * Note: EPC rarely exposes bathroom count — never invent baths from this data.
 */

import { shortenEpcCertificateUrl } from './epcLinkFormat';

const UK_POSTCODE_RE =
  /\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i;

/** New MHCLG developer API (Bearer token from get-energy-performance-data.communities.gov.uk). */
const EPC_API_BASE_BEARER =
  'https://api.get-energy-performance-data.communities.gov.uk/api/domestic';
/** Legacy Open Data Communities host (Basic email:api_key). */
const EPC_API_BASE_BASIC = 'https://epc.opendatacommunities.org/api/v1/domestic';
const EPC_HTML_SEARCH =
  'https://find-energy-certificate.service.gov.uk/find-a-certificate/search-by-postcode';

export type EpcRecord = {
  address: string;
  postcode: string;
  currentRating: string;
  potentialRating: string;
  propertyType: string;
  builtForm: string;
  floorAreaSqm: string;
  habitableRooms: string;
  heating: string;
  mainFuel: string;
  improvements: string;
  lodgementDate: string;
  certificateUrl: string;
  source: 'api' | 'register-html';
};

export type EpcLookup = {
  postcode: string | null;
  matched: EpcRecord | null;
  candidates: EpcRecord[];
  error?: string;
};

function normalizePc(pc: string): string {
  return pc.toUpperCase().replace(/\s+/g, ' ').trim();
}

function compactPc(pc: string): string {
  return normalizePc(pc).replace(/\s+/g, '');
}

function parseHouseToken(address: string): string | null {
  const withoutPc = address
    .replace(UK_POSTCODE_RE, '')
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const flat = withoutPc.match(/^(?:flat|apartment|apt|unit|suite)\s+([a-z0-9-]+)\b/i);
  if (flat) return flat[1]!.toUpperCase();
  const m = withoutPc.match(/^(\d+[A-Z]?)\b/i);
  if (m) return m[1]!.toUpperCase();
  // Named house e.g. "Pentland Cross Lane Northallerton"
  const named = withoutPc.match(/^([A-Za-z][A-Za-z0-9'-]{1,40})\b/);
  return named ? named[1]!.toUpperCase() : null;
}

function addressMatches(epcAddress: string, target: string): boolean {
  const house = parseHouseToken(target);
  if (!house) return false;
  const a = epcAddress.toUpperCase().replace(/\s+/g, ' ');
  const re = new RegExp(`(?:^|\\b)${house.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
  if (!re.test(a)) return false;
  // Prefer street token overlap
  const streetBits = target
    .replace(UK_POSTCODE_RE, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !/^(flat|apartment|apt|unit|suite|the)$/i.test(w))
    .slice(1, 4);
  if (streetBits.length === 0) return true;
  const al = epcAddress.toLowerCase();
  return streetBits.some((w) => al.includes(w));
}

function bearerToken(): string {
  return (process.env.EPC_API_BEARER || process.env.EPC_BEARER_TOKEN || '')
    .trim()
    .replace(/^Bearer\s+/i, '');
}

function hasEpcApiCredentials(): boolean {
  const bearer = bearerToken();
  if (bearer && !bearer.includes('REPLACE') && bearer.length > 8) return true;
  const email = (process.env.EPC_API_EMAIL || '').trim();
  const key = (process.env.EPC_API_KEY || '').trim();
  return Boolean(email && key && !key.includes('REPLACE'));
}

/** Prefer Bearer (new portal); fall back to Basic (legacy). */
function epcAuthHeader(): string {
  const bearer = bearerToken();
  if (bearer) return `Bearer ${bearer}`;
  const email = (process.env.EPC_API_EMAIL || '').trim();
  const key = (process.env.EPC_API_KEY || '').trim();
  return `Basic ${Buffer.from(`${email}:${key}`).toString('base64')}`;
}

function epcApiBase(): string {
  return bearerToken() ? EPC_API_BASE_BEARER : EPC_API_BASE_BASIC;
}

function rowFromApi(r: Record<string, unknown>, postcode: string, apiBase: string): EpcRecord {
  // New MHCLG Bearer API uses camelCase; legacy Open Data uses kebab-case.
  const lmk = String(
    r['lmk-key'] || r.lmkKey || r.lmk_key || r.certificateNumber || r.certificate_number || ''
  ).trim();
  const address = [
    r.address,
    r.address1,
    r.addressLine1,
    r.address2,
    r.addressLine2,
    r.address3,
    r.addressLine3,
    r.address4,
    r.addressLine4,
    r.postTown,
  ]
    .map((x) => String(x || '').trim())
    .filter(Boolean)
    .join(', ');
  return {
    address: address || String(r.address || '').trim(),
    postcode: String(r.postcode || postcode).trim(),
    currentRating: String(
      r['current-energy-rating'] ||
        r.currentEnergyRating ||
        r.current_energy_rating ||
        r.currentEnergyEfficiencyBand ||
        r.current_energy_efficiency_band ||
        ''
    ).trim(),
    potentialRating: String(
      r['potential-energy-rating'] ||
        r.potentialEnergyRating ||
        r.potential_energy_rating ||
        r.potentialEnergyEfficiencyBand ||
        ''
    ).trim(),
    propertyType: String(r['property-type'] || r.propertyType || r.property_type || '').trim(),
    builtForm: String(r['built-form'] || r.builtForm || r.built_form || '').trim(),
    floorAreaSqm: String(
      r['total-floor-area'] || r.totalFloorArea || r.total_floor_area || ''
    ).trim(),
    habitableRooms: String(
      r['number-habitable-rooms'] || r.numberHabitableRooms || r.number_habitable_rooms || ''
    ).trim(),
    heating: String(
      r['mainheat-description'] || r.mainheatDescription || r.mainheat_description || ''
    ).trim(),
    mainFuel: String(r['main-fuel'] || r.mainFuel || r.main_fuel || '').trim(),
    improvements: String(
      r['improvement-summary'] ||
        r.improvementSummary ||
        (Array.isArray(r.improvements)
          ? (r.improvements as unknown[])
              .map((x) =>
                typeof x === 'object' && x
                  ? String(
                      (x as { 'improvement-item'?: string; improvementItem?: string })[
                        'improvement-item'
                      ] ||
                        (x as { improvementItem?: string }).improvementItem ||
                        ''
                    )
                  : String(x)
              )
              .filter(Boolean)
              .join('; ')
          : '')
    ).trim(),
    lodgementDate: String(
      r['lodgement-date'] ||
        r.lodgementDate ||
        r.lodgement_date ||
        r.registrationDate ||
        r.registration_date ||
        ''
    ).trim(),
    certificateUrl: lmk
      ? `https://find-energy-certificate.service.gov.uk/energy-certificate/${encodeURIComponent(lmk)}`
      : 'https://find-energy-certificate.service.gov.uk/',
    source: 'api',
  };
}

async function searchEpcApi(postcode: string): Promise<EpcRecord[]> {
  const apiBase = epcApiBase();
  const url = `${apiBase}/search?postcode=${encodeURIComponent(compactPc(postcode))}`;
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      Authorization: epcAuthHeader(),
    },
    redirect: 'manual',
    signal: AbortSignal.timeout(15000),
  });
  if (res.status >= 300 && res.status < 400) {
    throw new Error(
      'EPC Open Data API redirected — set EPC_API_BEARER from https://get-energy-performance-data.communities.gov.uk/ (developer API), or legacy EPC_API_EMAIL / EPC_API_KEY.'
    );
  }
  if (res.status === 401 || res.status === 403) {
    throw new Error(
      `EPC API ${res.status} — Bearer token rejected. Paste a fresh token into EPC_API_BEARER in .env.local (no "Bearer " prefix needed).`
    );
  }
  if (!res.ok) {
    throw new Error(`EPC API HTTP ${res.status}`);
  }
  const data = await res.json();
  const rows = Array.isArray(data?.rows)
    ? data.rows
    : Array.isArray(data?.data)
      ? data.data
      : Array.isArray(data?.results)
        ? data.results
        : Array.isArray(data)
          ? data
          : [];
  return rows.map((r: Record<string, unknown>) => rowFromApi(r, postcode, apiBase));
}

async function searchEpcHtml(postcode: string): Promise<EpcRecord[]> {
  const url = `${EPC_HTML_SEARCH}?postcode=${encodeURIComponent(normalizePc(postcode))}`;
  const res = await fetch(url, {
    headers: {
      Accept: 'text/html',
      'User-Agent': 'Mozilla/5.0 (compatible; CheckThisHouse/1.0; +https://checkthishouse.co.uk)',
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`EPC register HTML HTTP ${res.status}`);
  const html = await res.text();
  const records: EpcRecord[] = [];
  // Rows typically: <a href="/energy-certificate/...">ADDRESS</a> ... band letter
  const rowRe =
    /href="(\/energy-certificate\/[^"]+)"[^>]*>([^<]+)<\/a>[\s\S]*?(?:<(?:td|span)[^>]*>)\s*([A-G])\s*</gi;
  let m: RegExpExecArray | null;
  const seen = new Set<string>();
  while ((m = rowRe.exec(html)) !== null) {
    const path = m[1]!;
    const address = m[2]!.replace(/\s+/g, ' ').trim();
    const band = m[3]!.toUpperCase();
    const key = `${address}|${band}`;
    if (!address || seen.has(key)) continue;
    seen.add(key);
    records.push({
      address,
      postcode: normalizePc(postcode),
      currentRating: band,
      potentialRating: '',
      propertyType: '',
      builtForm: '',
      floorAreaSqm: '',
      habitableRooms: '',
      heating: '',
      mainFuel: '',
      improvements: '',
      lodgementDate: '',
      certificateUrl: `https://find-energy-certificate.service.gov.uk${path}`,
      source: 'register-html',
    });
  }
  // Broader fallback parser if regex missed
  if (records.length === 0) {
    const linkRe = /href="(\/energy-certificate\/[^"]+)"[^>]*>([^<]{5,120})<\/a>/gi;
    while ((m = linkRe.exec(html)) !== null) {
      const path = m[1]!;
      const address = m[2]!.replace(/\s+/g, ' ').trim();
      if (!address || seen.has(address)) continue;
      seen.add(address);
      records.push({
        address,
        postcode: normalizePc(postcode),
        currentRating: '',
        potentialRating: '',
        propertyType: '',
        builtForm: '',
        floorAreaSqm: '',
        habitableRooms: '',
        heating: '',
        mainFuel: '',
        improvements: '',
        lodgementDate: '',
        certificateUrl: `https://find-energy-certificate.service.gov.uk${path}`,
        source: 'register-html',
      });
    }
  }
  return records;
}

export async function lookupEpc(address: string): Promise<EpcLookup> {
  const pcMatch = address.match(UK_POSTCODE_RE);
  const postcode = pcMatch ? normalizePc(pcMatch[1]!) : null;
  if (!postcode) {
    return { postcode: null, matched: null, candidates: [], error: 'No postcode for EPC lookup.' };
  }

  let candidates: EpcRecord[] = [];
  let error: string | undefined;

  if (hasEpcApiCredentials()) {
    try {
      candidates = await searchEpcApi(postcode);
    } catch (err: any) {
      error = err?.message || 'EPC API failed.';
    }
  }

  if (candidates.length === 0) {
    try {
      candidates = await searchEpcHtml(postcode);
      if (!candidates.length && !error) {
        error = 'No EPC certificates found for this postcode on the public register.';
      }
    } catch (err: any) {
      error = error || err?.message || 'EPC register lookup failed.';
    }
  }

  const matched =
    candidates.find((c) => addressMatches(c.address, address)) ||
    candidates.find((c) => addressMatches(`${c.address} ${c.postcode}`, address)) ||
    null;

  // P4: search API often omits TOTAL_FLOOR_AREA — enrich from the public certificate page
  let enriched = matched;
  if (matched) {
    enriched = await enrichFromCertificateHtml(matched);
    if (enriched.floorAreaSqm) {
      console.log(
        `[epc] floor area from certificate page: ${enriched.floorAreaSqm} m² (source field present)`
      );
    } else {
      console.log(
        `[epc] TOTAL_FLOOR_AREA absent after certificate page enrich for ${matched.certificateUrl} (field missing from source HTML)`
      );
    }
  }

  return { postcode, matched: enriched, candidates: candidates.slice(0, 40), error };
}

/**
 * Fetch gov.uk certificate HTML and fill missing fields (floor area, heating, type).
 * Distinguishes "not fetched" (no URL) from "missing on page".
 */
export async function enrichFromCertificateHtml(record: EpcRecord): Promise<EpcRecord> {
  if (!record.certificateUrl || !/energy-certificate\//i.test(record.certificateUrl)) {
    return { ...record, floorAreaSqm: record.floorAreaSqm || '' };
  }
  if (record.floorAreaSqm && record.heating && record.propertyType) return record;
  try {
    const res = await fetch(record.certificateUrl, {
      headers: {
        Accept: 'text/html',
        'User-Agent': 'Mozilla/5.0 (compatible; CheckThisHouse/1.0; +https://checkthishouse.co.uk)',
      },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) {
      console.warn(`[epc] certificate HTML HTTP ${res.status} for ${record.certificateUrl}`);
      return record;
    }
    const html = await res.text();
    const floor =
      html.match(/([\d.]+)\s*square metres/i)?.[1] ||
      html.match(/total floor area[\s\S]{0,120}?([\d.]+)/i)?.[1] ||
      '';
    const heating =
      html.match(/Main heating[\s\S]{0,200}?<dd[^>]*>\s*([^<]+)/i)?.[1]?.trim() ||
      html.match(/main heating[^<]{0,40}/i)?.[0] ||
      '';
    const propType =
      html.match(/Property type[\s\S]{0,120}?<dd[^>]*>\s*([^<]+)/i)?.[1]?.trim() || '';
    const potential =
      html.match(/Potential rating[\s\S]{0,80}?\b([A-G])\b/i)?.[1]?.toUpperCase() || '';

    return {
      ...record,
      floorAreaSqm: record.floorAreaSqm || (floor ? String(Number(floor)) : ''),
      heating: record.heating || heating.replace(/\s+/g, ' ').trim(),
      propertyType: record.propertyType || propType,
      potentialRating: record.potentialRating || potential,
    };
  } catch (err: any) {
    console.warn('[epc] certificate enrich failed:', err?.message || err);
    return record;
  }
}

/** Cached postcode→EPC candidates for comps (P3). */
const epcPostcodeCache = new Map<string, EpcRecord[]>();

export async function lookupEpcForAddressCached(address: string): Promise<EpcRecord | null> {
  const pcMatch = address.match(UK_POSTCODE_RE);
  const postcode = pcMatch ? normalizePc(pcMatch[1]!) : null;
  if (!postcode) return null;
  let candidates = epcPostcodeCache.get(compactPc(postcode));
  if (!candidates) {
    const lookup = await lookupEpc(address);
    candidates = lookup.candidates;
    epcPostcodeCache.set(compactPc(postcode), candidates);
    if (lookup.matched) return lookup.matched;
  }
  const hit =
    candidates.find((c) => addressMatches(c.address, address)) ||
    candidates.find((c) => addressMatches(`${c.address} ${c.postcode}`, address)) ||
    null;
  if (hit && !hit.floorAreaSqm) return enrichFromCertificateHtml(hit);
  return hit;
}

export function formatEpcBrief(result: EpcLookup): string {
  const lines: string[] = [
    'VERIFIED FACTS — EPC REGISTER (England & Wales). Treat matched certificate fields as ground truth for energy/type/floor area. Habitable rooms are NOT bathroom count.',
  ];
  if (result.error && !result.matched && result.candidates.length === 0) {
    lines.push(`Lookup note: ${result.error}`);
    return lines.join('\n');
  }
  if (result.matched) {
    const e = result.matched;
    lines.push(`Matched certificate for this property (${e.source}):`);
    lines.push(`- Address on certificate: ${e.address}`);
    if (e.currentRating) lines.push(`- Current EPC band: ${e.currentRating}${e.potentialRating ? ` (potential ${e.potentialRating})` : ''}`);
    if (e.propertyType) lines.push(`- Property type: ${e.propertyType}${e.builtForm ? ` / ${e.builtForm}` : ''}`);
    if (e.floorAreaSqm) lines.push(`- Total floor area: ${e.floorAreaSqm} m²`);
    if (e.habitableRooms) lines.push(`- Habitable rooms: ${e.habitableRooms} (not bathroom count)`);
    if (e.heating) lines.push(`- Main heating: ${e.heating}`);
    if (e.mainFuel) lines.push(`- Main fuel: ${e.mainFuel}`);
    if (e.improvements) lines.push(`- Costed improvements (certificate): ${e.improvements}`);
    if (e.lodgementDate) lines.push(`- Lodgement date: ${e.lodgementDate}`);
    lines.push(`- Certificate: ${e.certificateUrl}`);
  } else {
    lines.push(
      'No EPC on register — request from vendor. Do NOT invent a lettered rating or range (e.g. D to F). Leave energy fields as not on record.'
    );
  }
  return lines.join('\n');
}

export function epcSources(result: EpcLookup): { title: string; url: string }[] {
  if (result.matched?.certificateUrl) {
    return [
      {
        title: `View EPC certificate on gov.uk (${shortenEpcCertificateUrl(result.matched.certificateUrl)})`,
        url: result.matched.certificateUrl,
      },
    ];
  }
  return [{ title: 'View EPC certificates on gov.uk', url: 'https://www.gov.uk/find-energy-certificate' }];
}
