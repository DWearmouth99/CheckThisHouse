/**
 * UK-wide council planning lookup for extensions / applications.
 *
 * Strategy (no manual per-council code):
 * 1. Resolve postcode → local authority via postcodes.io (free)
 * 2. Match authority to a planning portal URL from the UK portal directory
 *    (community list + Scottish overrides in data/planning-portals.json)
 * 3. Run a generic Idox Public Access / OnlinePlanning simple search
 * 4. If the portal isn’t Idox-compatible, return null and let AI web search continue
 */

import { readFileSync } from "fs";
import path from "path";
import bundledPortals from "../data/planning-portals.json";

export type PlanningApplication = {
  reference: string;
  address: string;
  proposal: string;
  status: string;
  received?: string;
  validated?: string;
  detailsUrl: string;
};

export type PlanningLookupResult = {
  council: string;
  portalUrl: string;
  searchQuery: string;
  applications: PlanningApplication[];
  matchedToProperty: PlanningApplication[];
  nearbyOnStreet: PlanningApplication[];
  error?: string;
};

type PortalRow = { name: string; url: string; tags?: string };

type ResolvedPortal = {
  council: string;
  origin: string;
  /** e.g. /online-applications or /OnlinePlanning */
  appBase: string;
  portalUrl: string;
};

const UA = "Mozilla/5.0 (compatible; CheckThisHouse/1.0; +https://checkthishouse.co.uk)";
const UK_POSTCODE_RE =
  /\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i;

type CookieJar = Map<string, string>;

function storeCookies(jar: CookieJar, res: Response) {
  const raw =
    typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  for (const c of raw) {
    const [kv] = c.split(";");
    const i = kv.indexOf("=");
    if (i > 0) jar.set(kv.slice(0, i), kv.slice(i + 1));
  }
}

function cookieHeader(jar: CookieJar): string {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractPostcode(address: string): string | null {
  const m = address.match(UK_POSTCODE_RE);
  if (!m) return null;
  return m[1]!.toUpperCase().replace(/\s+/, " ");
}

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(city|county|borough|council|of|the|royal|district|metropolitan|unitary)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function loadPortalDirectory(): PortalRow[] {
  // Prefer on-disk file (easy to refresh) then bundled JSON from the build.
  try {
    const file = path.join(process.cwd(), "src", "data", "planning-portals.json");
    const raw = readFileSync(file, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length) return parsed as PortalRow[];
  } catch {
    // fall through
  }
  if (Array.isArray(bundledPortals) && bundledPortals.length) {
    return bundledPortals as PortalRow[];
  }
  return [];
}

let portalCache: PortalRow[] | null = null;
function getPortals(): PortalRow[] {
  if (!portalCache) portalCache = loadPortalDirectory();
  return portalCache;
}

/** True if this portal URL looks like Idox Public Access / OnlinePlanning (scrapable). */
export function isIdoxStylePortal(url: string): boolean {
  if (/Northgate|OcellaWeb|GeneralSearch\.aspx|plansearch|ApplicationSearchServlet|civica|weekly-lists|swiftlg|swift\/apas/i.test(url)) {
    return false;
  }
  return /online-applications|OnlinePlanning|idoxpa|\/publicaccess|newplanningaccess|newpublicaccess|PlanningData-live|\/wam\/|idoxwam/i.test(
    url
  );
}

function parseIdoxPortal(council: string, searchUrl: string): ResolvedPortal | null {
  try {
    const u = new URL(searchUrl);
    const pathMatch = u.pathname.match(/^(.*?)\/(?:search\.do).*$/i);
    let appBase = (pathMatch?.[1] || "").replace(/\/$/, "");
    if (!appBase) {
      // e.g. /publicaccess/search.do already captured; or root search.do
      const parts = u.pathname.split("/").filter(Boolean);
      if (parts.length >= 1 && /search\.do/i.test(parts[parts.length - 1] || "")) {
        appBase = "/" + parts.slice(0, -1).join("/");
      }
    }
    if (!appBase) appBase = "";
    return {
      council,
      origin: u.origin,
      appBase,
      portalUrl: `${u.origin}${appBase || ""}`,
    };
  } catch {
    return null;
  }
}

function scoreNameMatch(district: string, portalName: string): number {
  const a = normalizeName(district);
  const b = normalizeName(portalName);
  if (!a || !b) return 0;
  if (a === b) return 100;
  if (a.includes(b) || b.includes(a)) return 80;
  const aw = new Set(a.split(" "));
  const bw = b.split(" ");
  const overlap = bw.filter((w) => aw.has(w)).length;
  if (overlap > 0) return 40 + overlap * 15;
  return 0;
}

function matchPortalForCouncil(district: string): PortalRow | null {
  const portals = getPortals();
  let best: PortalRow | null = null;
  let bestScore = 0;
  for (const p of portals) {
    const score = scoreNameMatch(district, p.name);
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return bestScore >= 40 ? best : null;
}

async function resolveCouncilFromPostcode(
  postcode: string
): Promise<{ district: string; country: string } | null> {
  try {
    const compact = postcode.replace(/\s+/g, "");
    const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(compact)}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    const body = await res.json();
    const district = body?.result?.admin_district;
    if (!district) return null;
    return {
      district: String(district),
      country: String(body?.result?.country || ""),
    };
  } catch {
    return null;
  }
}

/** Try common Idox URL patterns when the directory has no match. */
async function discoverIdoxPortal(district: string): Promise<ResolvedPortal | null> {
  const slug = district
    .toLowerCase()
    .replace(/\b(county|city|council|borough|of|the|royal)\b/g, " ")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
  if (slug.length < 3) return null;

  const candidates = [
    `https://publicaccess.${slug}.gov.uk/online-applications/search.do?action=simple&searchType=Application`,
    `https://pa.${slug}.gov.uk/online-applications/search.do?action=simple&searchType=Application`,
    `https://planning.${slug}.gov.uk/online-applications/search.do?action=simple&searchType=Application`,
    `https://planning-applications.${slug}.gov.uk/OnlinePlanning/search.do?action=simple&searchType=Application`,
    `https://idoxpa.${slug}.gov.uk/online-applications/search.do?action=simple&searchType=Application`,
  ];

  for (const url of candidates) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "text/html" },
        signal: AbortSignal.timeout(6000),
        redirect: "follow",
      });
      if (!res.ok) continue;
      const html = await res.text();
      if (/name="_csrf"|simpleSearchString|searchCriteria/i.test(html)) {
        return parseIdoxPortal(district, url);
      }
    } catch {
      // try next
    }
  }
  return null;
}

async function resolvePortalForAddress(
  address: string,
  postcode: string | null
): Promise<ResolvedPortal | null> {
  if (!postcode) return null;
  const council = await resolveCouncilFromPostcode(postcode);
  if (!council) return null;

  const row = matchPortalForCouncil(council.district);
  if (row && isIdoxStylePortal(row.url)) {
    const parsed = parseIdoxPortal(row.name, row.url);
    if (parsed) return parsed;
  }

  // Directory miss or non-Idox URL — try common host patterns
  return discoverIdoxPortal(council.district);
}

function parseHouseAndStreet(address: string): { number: string; street: string } | null {
  const withoutPc = address.replace(UK_POSTCODE_RE, "").replace(/,/g, " ").replace(/\s+/g, " ").trim();
  const m = withoutPc.match(/^(\d+[A-Z]?)\s+(.+)$/i);
  if (!m) return null;
  const number = m[1]!.toUpperCase();
  const streetWords = m[2]!
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const suffixIdx = streetWords.findIndex((w) =>
    /^(street|st|road|rd|avenue|ave|lane|ln|drive|dr|crescent|cres|close|court|ct|way|place|pl|terrace|gardens|grove|view|park|row|square|sq|mews|walk|path|hill|gate)$/i.test(
      w
    )
  );
  const street =
    suffixIdx >= 0
      ? streetWords.slice(0, suffixIdx + 1).join(" ")
      : streetWords.slice(0, Math.min(3, streetWords.length)).join(" ");
  if (!street) return null;
  return { number, street };
}

function normalizeAddrKey(address: string): string {
  return address
    .toLowerCase()
    .replace(UK_POSTCODE_RE, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesProperty(appAddress: string, target: string): boolean {
  const parsed = parseHouseAndStreet(target);
  if (!parsed) {
    const t = normalizeAddrKey(target);
    const a = normalizeAddrKey(appAddress);
    return a.includes(t) || t.includes(a);
  }
  const a = normalizeAddrKey(appAddress);
  const numRe = new RegExp(`^${parsed.number}\\b`);
  if (!numRe.test(a)) return false;
  return a.includes(parsed.street);
}

function sameStreetDifferentHouse(appAddress: string, target: string): boolean {
  const parsed = parseHouseAndStreet(target);
  if (!parsed) return false;
  const a = normalizeAddrKey(appAddress);
  if (!a.includes(parsed.street)) return false;
  const numRe = new RegExp(`^${parsed.number}\\b`);
  return !numRe.test(a);
}

function buildSearchQueries(address: string, postcode: string | null): string[] {
  const parsed = parseHouseAndStreet(address);
  const queries: string[] = [];
  if (parsed) queries.push(`${parsed.number} ${parsed.street}`);
  if (postcode) queries.push(postcode);
  const first = address.split(",")[0]?.trim();
  if (first && !queries.includes(first)) queries.push(first);
  return [...new Set(queries.filter(Boolean))];
}

function parseIdoxResults(html: string, origin: string): PlanningApplication[] {
  const apps: PlanningApplication[] = [];
  const blocks = html.split(/<li\s+class="searchresult"/i).slice(1);

  for (const block of blocks) {
    const chunk = block.split(/<\/li>/i)[0] || block;
    let proposal =
      decodeHtml(
        (chunk.match(/class="summaryLinkTextClamp"[^>]*>([\s\S]*?)<\/div>/i) || [])[1] || ""
      ) || "";
    if (!proposal) {
      // Durham / classic Idox: proposal is the link text
      proposal = decodeHtml(
        (chunk.match(
          /<a[^>]+href="[^"]*applicationDetails\.do[^"]*"[^>]*>\s*([\s\S]*?)\s*<\/a>/i
        ) || [])[1] || ""
      );
    }
    const address = decodeHtml((chunk.match(/<p\s+class="address"[^>]*>([\s\S]*?)<\/p>/i) || [])[1] || "");
    const reference = decodeHtml(
      (chunk.match(/Ref\.?\s*No:?\s*<\/?[^>]*>?\s*([0-9A-Z/]+)/i) ||
        chunk.match(/Ref\.?\s*No:\s*([0-9A-Z/]+)/i) ||
        [])[1] || ""
    );
    const status = decodeHtml(
      (chunk.match(/badge-status[\s\S]*?class="value"[^>]*>([\s\S]*?)<\/div>/i) ||
        chunk.match(/Status:\s*([^|<\n]+)/i) ||
        [])[1] || ""
    );
    const received = decodeHtml((chunk.match(/Received:\s*([^|<\n]+)/i) || [])[1] || "") || undefined;
    const validated = decodeHtml((chunk.match(/Validated:\s*([^|<\n]+)/i) || [])[1] || "") || undefined;
    const href = (chunk.match(/<a[^>]+href="([^"]*applicationDetails\.do[^"]*)"/i) || [])[1] || "";
    const detailsUrl = href
      ? href.startsWith("http")
        ? decodeHtml(href)
        : `${origin}${href.startsWith("/") ? "" : "/"}${decodeHtml(href)}`
      : origin;

    if (!reference && !proposal) continue;
    apps.push({
      reference: reference || "Unknown",
      address: address || "Unknown",
      proposal: proposal || "No description",
      status: status || "Unknown",
      received,
      validated,
      detailsUrl,
    });
  }

  return apps;
}

async function searchIdoxPortal(
  portal: ResolvedPortal,
  searchQuery: string
): Promise<{ applications: PlanningApplication[]; error?: string }> {
  const jar: CookieJar = new Map();
  const searchPageUrl = `${portal.origin}${portal.appBase}/search.do?action=simple&searchType=Application`;

  try {
    const searchPage = await fetch(searchPageUrl, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      signal: AbortSignal.timeout(15000),
    });
    storeCookies(jar, searchPage);
    const searchHtml = await searchPage.text();
    const csrf = (searchHtml.match(/name="_csrf"\s+value="([^"]+)"/) || [])[1];
    if (!csrf) {
      return {
        applications: [],
        error: `Could not open simple search on ${portal.council} planning portal (not a supported Idox form).`,
      };
    }

    const body = new URLSearchParams({
      _csrf: csrf,
      searchType: "Application",
      "searchCriteria.caseStatus": "",
      "searchCriteria.simpleSearchString": searchQuery,
      "searchCriteria.simpleSearch": "true",
    });

    const results = await fetch(
      `${portal.origin}${portal.appBase}/simpleSearchResults.do?action=firstPage`,
      {
        method: "POST",
        headers: {
          "User-Agent": UA,
          Accept: "text/html",
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: cookieHeader(jar),
          Referer: searchPageUrl,
        },
        body,
        redirect: "follow",
        signal: AbortSignal.timeout(20000),
      }
    );
    storeCookies(jar, results);
    const html = await results.text();

    if (!results.ok) {
      return {
        applications: [],
        error: `${portal.council} planning search returned HTTP ${results.status}.`,
      };
    }

    return { applications: parseIdoxResults(html, portal.origin) };
  } catch (err: any) {
    return {
      applications: [],
      error: `Planning portal lookup failed: ${err?.message || String(err)}`,
    };
  }
}

function formatAppLine(app: PlanningApplication): string {
  const dates = [app.received && `Received ${app.received}`, app.validated && `Validated ${app.validated}`]
    .filter(Boolean)
    .join("; ");
  return `- ${app.reference} | ${app.status} | ${app.proposal} | ${app.address}${dates ? ` | ${dates}` : ""} | ${app.detailsUrl}`;
}

/**
 * Look up planning applications for an address via the local council portal when supported.
 */
export async function lookupPlanningApplications(
  address: string
): Promise<PlanningLookupResult | null> {
  const cleaned = address.replace(/\s+/g, " ").trim();
  if (!cleaned || cleaned.length < 6) return null;

  const postcode = extractPostcode(cleaned);
  const portal = await resolvePortalForAddress(cleaned, postcode);
  if (!portal) {
    return null;
  }

  const queries = buildSearchQueries(cleaned, postcode);
  const byRef = new Map<string, PlanningApplication>();
  let usedQuery = queries[0] || cleaned;
  let lastError: string | undefined;
  let bestMatched: PlanningApplication[] = [];

  for (const q of queries) {
    const result = await searchIdoxPortal(portal, q);
    if (result.error) lastError = result.error;
    if (result.applications.length === 0) continue;

    for (const app of result.applications) {
      const key = app.reference.toUpperCase();
      if (!byRef.has(key)) byRef.set(key, app);
    }

    const matched = result.applications.filter((a) => matchesProperty(a.address, cleaned));
    if (matched.length > 0) {
      bestMatched = matched;
      usedQuery = q;
      // Keep scanning other queries briefly? Stop once we have property hits.
      break;
    }
    usedQuery = q;
  }

  let applications = [...byRef.values()];
  const matchedToProperty =
    bestMatched.length > 0
      ? bestMatched
      : applications.filter((a) => matchesProperty(a.address, cleaned));
  const nearbyOnStreet = applications.filter((a) => sameStreetDifferentHouse(a.address, cleaned));

  return {
    council: portal.council,
    portalUrl: portal.portalUrl,
    searchQuery: usedQuery,
    applications,
    matchedToProperty,
    nearbyOnStreet,
    error: applications.length === 0 ? lastError : undefined,
  };
}

/** Dense text block for the AI research / valuation prompts. */
export function formatPlanningBrief(result: PlanningLookupResult): string {
  const lines: string[] = [
    `AUTHORITATIVE COUNCIL PLANNING RECORDS (scraped directly from ${result.council} portal — treat as ground truth; do NOT claim "no extensions" or "no planning data" if records below evidence works):`,
    `Portal: ${result.portalUrl}`,
    `Search used: "${result.searchQuery}"`,
  ];

  if (result.error && result.matchedToProperty.length === 0 && result.applications.length === 0) {
    lines.push(`Lookup note: ${result.error}`);
  }

  if (result.matchedToProperty.length > 0) {
    lines.push(`Applications matching this exact property (${result.matchedToProperty.length}):`);
    for (const app of result.matchedToProperty.slice(0, 12)) {
      lines.push(formatAppLine(app));
    }
    const extensionLike = result.matchedToProperty.filter((a) =>
      /extension|loft|alteration|conservatory|outbuilding|garage|conversion|dwellinghouse/i.test(
        a.proposal
      )
    );
    if (extensionLike.length > 0) {
      lines.push(
        `EXTENSION / WORKS SIGNAL: ${extensionLike.length} application(s) describe extensions or alterations at this address. Populate propertyWorks.extensionsAndAlterations and planningApplications from these refs. Factor completed/approved works into valuation bands.`
      );
    }
  } else if (result.applications.length > 0) {
    lines.push(
      `No exact house-number match in portal results for this address. Nearby / street hits (do not attribute to this property unless address matches):`
    );
    for (const app of result.applications.slice(0, 8)) {
      lines.push(formatAppLine(app));
    }
  } else {
    lines.push(
      `No planning applications returned for this search on the ${result.council} portal. You may still note that the portal was checked (${result.portalUrl}).`
    );
  }

  if (result.nearbyOnStreet.length > 0 && result.matchedToProperty.length > 0) {
    lines.push(`Other applications on the same street (context only):`);
    for (const app of result.nearbyOnStreet.slice(0, 5)) {
      lines.push(formatAppLine(app));
    }
  }

  return lines.join("\n");
}

export function planningSources(
  result: PlanningLookupResult
): { title: string; url: string }[] {
  const sources: { title: string; url: string }[] = [
    { title: `${result.council} planning portal`, url: result.portalUrl },
  ];
  for (const app of result.matchedToProperty.slice(0, 5)) {
    sources.push({
      title: `Planning ${app.reference}`,
      url: app.detailsUrl,
    });
  }
  return sources;
}
