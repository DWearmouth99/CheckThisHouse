/**
 * Detect live portal listings from Phase 1 research notes (or scrap).
 * Historical sold / house-price pages must NEVER promote Mode A Asking Price.
 */

export type ListingDetection = {
  listingDetected: boolean;
  askingPrice: string | null;
  portalUrl: string | null;
  portal: string | null;
  evidence: string;
  queried: string[];
  /** Short excerpt of research used for the gate decision */
  researchSnippet?: string;
  /** Why a soft/hard gate accepted or rejected */
  gateLog?: string;
  /** Operator block when Mode A cannot be reached without a listings API */
  operatorBlock?: string | null;
};

/** Any portal host mention (for search / snippets) */
const PORTAL_URL_RE =
  /https?:\/\/(?:www\.)?(rightmove\.co\.uk|zoopla\.co\.uk|onthemarket\.com)\/[^\s)\]"'<>]+/gi;

/**
 * Live for-sale detail pages only — not house-prices archives, sold history, or search results.
 */
const LIVE_LISTING_PATH_RE =
  /(?:rightmove\.co\.uk\/properties\/\d+|zoopla\.co\.uk\/for-sale\/details\/\d+|onthemarket\.com\/details\/property\/\d+|onthemarket\.com\/details\/\d+)/i;

const ARCHIVE_OR_SOLD_PATH_RE =
  /house-prices|\/sold\/|property-for-sale\/find|new-homes|\/commercial\/|\/to-rent\/|sold-prices|houseprices/i;

const ASKING_NEAR_RE =
  /(?:asking|guide|offers?\s+over|oiro|listed\s+at|for\s+sale[^\n£]{0,40}(?:at|priced)?)[^\n£]{0,48}£\s*([\d,]+(?:\.\d+)?)/i;

const STANDALONE_ASKING_RE = /£\s*([\d,]{5,})/i;

const SOLD_CONTEXT_RE =
  /\b(sold\s+for|last\s+sold|sale\s+price|sstc|sold\s+stc|under\s+offer|completed\s+sale|histor(?:y|ical)\s+sold)\b/i;

function portalName(host: string): string {
  if (/rightmove/i.test(host)) return 'Rightmove';
  if (/zoopla/i.test(host)) return 'Zoopla';
  if (/onthemarket/i.test(host)) return 'OnTheMarket';
  return host;
}

function isLiveListingUrl(url: string): boolean {
  const u = url.trim();
  if (!u) return false;
  if (ARCHIVE_OR_SOLD_PATH_RE.test(u)) return false;
  return LIVE_LISTING_PATH_RE.test(u);
}

function houseStreetTokens(address: string): { house: string; street: string; postcode: string } {
  const a = address.replace(/\s+/g, ' ').trim();
  const pc = a.match(/\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i)?.[1] || '';
  const withoutPc = a.replace(/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i, '').replace(/,/g, ' ').trim();
  const m = withoutPc.match(/^(\d+[A-Z]?|[A-Za-z][A-Za-z0-9' -]{0,24})\s+(.+)$/i);
  return {
    house: (m?.[1] || withoutPc.split(/\s+/)[0] || '').trim(),
    street: (m?.[2] || '').split(/\s+/).slice(0, 3).join(' ').trim(),
    postcode: pc,
  };
}

export function buildListingSearchQueries(address: string): string[] {
  const a = address.replace(/\s+/g, ' ').trim();
  if (!a) return [];
  const { house, street, postcode } = houseStreetTokens(a);
  const short = [house, street].filter(Boolean).join(' ').trim() || a;
  const q = [
    `"${a}" site:rightmove.co.uk`,
    `"${a}" site:zoopla.co.uk`,
    `"${a}" site:onthemarket.com`,
    `"${short}" Rightmove`,
    `"${short}" for sale`,
    postcode ? `"${house}" "${street}" ${postcode} for sale` : `"${short}" Zoopla for sale`,
  ];
  return [...new Set(q.filter(Boolean))];
}

function snippetAroundPortals(notes: string): string {
  const idx = notes.search(/rightmove|zoopla|onthemarket|for sale|asking/i);
  if (idx < 0) return notes.slice(0, 280).replace(/\s+/g, ' ').trim();
  return notes.slice(Math.max(0, idx - 80), idx + 200).replace(/\s+/g, ' ').trim();
}

function askingFromWindow(window: string): string | null {
  if (SOLD_CONTEXT_RE.test(window) && !/\b(for\s+sale|asking|offers?\s+over|oiro)\b/i.test(window)) {
    return null;
  }
  const m = window.match(ASKING_NEAR_RE) || window.match(STANDALONE_ASKING_RE);
  return m?.[1] ? `£${m[1]}` : null;
}

/**
 * Parse Phase 1 research notes for portal listing URLs and asking prices.
 */
export function detectListingFromResearch(
  researchNotes: string,
  address: string,
  scrapPrice?: string | null
): ListingDetection {
  const queried = buildListingSearchQueries(address);
  const operatorBlock =
    '=== OPERATOR ACTION NEEDED ===\nWhat I need: a UK listings API (Rightmove/Zoopla/PropertyData) or a pasted listing URL.\nWhy: Gemini Google Search did not return a live for-sale portal URL for this address — Mode A (live asking) cannot be entered safely from web research alone.\nNearest workaround: paste the Rightmove/Zoopla link, or set LISTINGS_API_KEY when available.';

  if (scrapPrice && /£|\d/.test(scrapPrice) && !/estimat|last\s*sold/i.test(scrapPrice)) {
    return {
      listingDetected: true,
      askingPrice: scrapPrice.trim(),
      portalUrl: null,
      portal: 'listing scrap',
      evidence: `scrap.price=${scrapPrice.trim()}`,
      queried,
      gateLog: 'accepted: scrap.price short-circuit',
      operatorBlock: null,
    };
  }

  const notes = researchNotes || '';
  const researchSnippet = snippetAroundPortals(notes);
  const urls = [...notes.matchAll(PORTAL_URL_RE)].map((m) => m[0]!);
  const uniqueUrls = [...new Set(urls)].slice(0, 8);
  const liveUrls = uniqueUrls.filter(isLiveListingUrl);
  const portalMention = /rightmove|zoopla|onthemarket/i.test(notes);

  if (liveUrls.length === 0) {
    const hadArchiveOnly = uniqueUrls.length > 0 && uniqueUrls.every((u) => !isLiveListingUrl(u));
    return {
      listingDetected: false,
      askingPrice: null,
      portalUrl: null,
      portal: null,
      evidence: hadArchiveOnly
        ? 'portal archive/sold URL only — not a live listing'
        : portalMention
          ? 'portal mentioned in research but gate rejected (no live listing URL)'
          : 'no portal URL in Phase 1 research notes',
      queried,
      researchSnippet,
      gateLog: hadArchiveOnly
        ? `rejected: archive/sold portal URL only (${uniqueUrls[0]})`
        : portalMention
          ? 'rejected: portal mentioned but no live for-sale URL'
          : 'rejected: search returned no portal URL',
      operatorBlock,
    };
  }

  const first = liveUrls[0]!;
  const host = first.match(/(rightmove\.co\.uk|zoopla\.co\.uk|onthemarket\.com)/i)?.[1] || '';
  let asking: string | null = null;
  for (const url of liveUrls) {
    const idx = notes.indexOf(url);
    const window = notes.slice(Math.max(0, idx - 160), idx + url.length + 220);
    asking = askingFromWindow(window);
    if (asking) break;
  }
  // Soft asking only if live URL exists AND notes clearly talk about for-sale (not sold-only)
  if (!asking) {
    const soft = notes.match(ASKING_NEAR_RE)?.[1];
    if (soft && /\b(for\s+sale|asking|offers?\s+over|oiro|guide\s+price)\b/i.test(notes)) {
      asking = `£${soft}`;
    }
  }

  return {
    listingDetected: true,
    askingPrice: asking,
    portalUrl: first,
    portal: portalName(host),
    evidence: `url=${first}${asking ? ` asking=${asking}` : ' (no asking parsed)'}`,
    queried,
    researchSnippet,
    gateLog: 'accepted: live for-sale portal URL in research notes',
    operatorBlock: null,
  };
}

export function logListingDetection(d: ListingDetection): void {
  console.log(
    `[listingDetected] detected=${d.listingDetected} portal=${d.portal || '—'} asking=${d.askingPrice || '—'} evidence=${d.evidence}`
  );
  console.log(`[listingDetected] queried=${JSON.stringify(d.queried)}`);
  if (d.gateLog) console.log(`[listingDetected] gate=${d.gateLog}`);
  if (d.researchSnippet) console.log(`[listingDetected] snippet=${d.researchSnippet.slice(0, 240)}`);
  if (d.operatorBlock) console.error(d.operatorBlock);
}
