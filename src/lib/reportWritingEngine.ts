/**
 * CheckThisHouse report-writing engine — Gemini JSON reports.
 * Customer-facing output must follow these rules; pipeline language never appears in the PDF.
 */

import type { LandRegistrySale } from './landRegistryLookup';

export type ReportMode = 'on_market' | 'recently_sold';

export type ReportModeContext = {
  mode: ReportMode;
  /** Cover / headline price card label */
  priceLabel: string;
  lastSoldPrice?: string;
  lastSoldDate?: string;
  lastSoldMonthYear?: string;
  hasLiveAsking: boolean;
};

const BANNED_PHRASE_RES: { re: RegExp; replacement: string }[] = [
  { re: /\boff[-\s]?grid\b/gi, replacement: 'no mains gas' },
  { re: /\bauthoritative\b/gi, replacement: '' },
  { re: /\bthe provided data\b/gi, replacement: 'public records' },
  { re: /\brecords supplied\b/gi, replacement: 'public records' },
  { re: /\bfirmly discounted\b/gi, replacement: '' },
  { re: /\bhave been discounted\b/gi, replacement: '' },
  { re: /\bdisregarded\b/gi, replacement: '' },
  { re: /\bhave been disregarded\b/gi, replacement: '' },
  { re: /\brecords for .+? have been discounted\b/gi, replacement: '' },
  { re: /\bdo not apply to this address\b/gi, replacement: '' },
  { re: /\bwrong[-\s]?address\b/gi, replacement: '' },
  { re: /\bdata pipeline\b/gi, replacement: '' },
  { re: /\bscraped\b/gi, replacement: 'listed' },
  { re: /\bas an AI\b/gi, replacement: '' },
  { re: /\bI (am|was) (an )?AI\b/gi, replacement: '' },
  { re: /\bconfidential buyer report\b/gi, replacement: 'property report' },
  { re: /\bconfidential\b/gi, replacement: '' },
];

const LOOKUPABLE_MISSING_RE =
  /\b(unknown|not specified|n\/a|none given|not available|tbc)\b/i;

/** System instruction for Gemini structured report pass (conclusions only). */
export const REPORT_WRITING_ENGINE_SYSTEM = `You are the report-writing engine for CheckThisHouse, a UK property intelligence service. You produce paid, customer-facing buyer reports as JSON. Write as a meticulous UK property professional. Write conclusions only — never your reasoning process, matching logic, or retrieval problems.

INPUT TIERS (internal — never name these tiers in customer-facing strings):
- VERIFIED FACTS blocks are ground truth. State them plainly with no hedging ("EPC rating: E", not "Likely E to G").
- LISTING & WEB RESEARCH may only be used where it does not conflict with verified facts. Attribute softly ("the agent listing states…") where material.
- If any source address/postcode does not match the subject property exactly, silently exclude it. Never mention exclusions, conflicts, discarded records, or matching logic. Forbidden in output: "records for X have been discounted", "do not apply to this address", "disregarded", "the provided data", "authoritative".

REPORT MODE (set by the pipeline — obey it):
- on_market: full report including offer strategy and negotiation. Headline price field = live asking if present, else estimated fair value wording.
- recently_sold: property sold within 12 months with no live listing. Do NOT coach a live purchase. Offer fields must explain the recent sale, what it implies for street/area value, and what a buyer should check/expect if it returns to market — not opening offers for a purchase that cannot happen.

MISSING PUBLIC-RECORD FACTS (EPC, council tax, tenure, flood category, sold history, planning, bathrooms):
- If absent from input: "Not on record — verify with {source}" once in that field only.
- Never invent speculative ranges for public-record facts ("Likely E to G", "Band F or G").
- Never invent bathroom counts. Habitable rooms ≠ bathrooms.
- Omit empty fluff; do not write "Not specified".

BANNED / REQUIRED:
- Never "off-grid". Use "no mains gas" or "oil/LPG heated" when relevant.
- Never "authoritative", "the provided data", "records supplied", "firmly discounted", "disregarded", "confidential" (unless truly required).
- Ofsted: never a bare single-word judgement without inspection year. Note single-word judgements were retired for inspections after 2024; for recent inspections describe the report-card outcome.
- Planning suffixes: /LBC = Listed Building Consent, /FUL = full, /OUT = outline, /TPO = tree preservation. Interpret correctly.
- SDLT/LBTT: use current rates and state primary residence vs additional property assumption in one clause.
- Yield: never without rent assumption ("~£1,600 pcm estimated rent → 2.85% gross yield").
- Multi-year forecasts MUST include annual growth assumption, basis (e.g. postcode-sector history), and conservative/central/optimistic — never a single certain line.
- Currency: full figure with commas on first mention in a section (£672,400); abbreviated later (£672k). Never mix in one sentence.
- Every % must be arithmetically consistent with the figures shown.
- One framing per fact everywhere; one name per local project; no near-verbatim paragraph repeats — cross-reference instead.
- Pros and cons must not contradict each other or the summary.
- Tone: confident, specific, plain English. Short sentences. Every risk gets a so-what (cost, what to ask, or who to instruct).
- Never mention AI, models, scraping, pipelines, or retrieval uncertainty. Express fact gaps only as "verify with {professional/source}".

Before finishing JSON, silently self-check mode, banned terms, no speculative public-record ranges, no duplicate paragraphs, consistent SDLT/yield/growth maths. Fix issues before returning. Do not include the checklist in the output.`;

export function buildReportWritingRequirements(mode: ReportMode): string {
  if (mode === 'recently_sold') {
    return `REPORT MODE: recently_sold
- price / headline: use last sold price from verified Land Registry facts
- Do NOT output offerStrategy, opening offers, walk-away figures, or negotiation step lists — the schema omits them
- buyingSuitability: frame as research for owners, remortgage, or future listing — not "make an offer now"
- agentQuestions: valuers / agents / conveyancers for a return-to-market scenario`;
  }
  return `REPORT MODE: on_market
- Include commercially realistic offerStrategy (opener, fair target, walk-away) and negotiation tips grounded in evidence
- If there is a live asking price, treat price as asking; if address-only with no asking, price should be estimated value band language from comps — never invent a fake listing ask
- Propose growthAssumptions (lowPct/centralPct/highPct + basis) only — do NOT invent forecast1y/10y milestone £ figures (computed in code)
- Do NOT invent numeric scores (computed in code)`;
}

function parseIsoDate(raw: string): Date | null {
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(d.getTime()) ? d : null;
}

function formatMonthYear(d: Date): string {
  return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

function formatGbp(n: number): string {
  return `£${Math.round(n).toLocaleString('en-GB')}`;
}

/**
 * Mode A = on market / no recent sale (or live asking present).
 * Mode B = sold within 12 months and no live asking.
 */
export function detectReportMode(opts: {
  liveAsking?: string | null;
  thisPropertySales?: LandRegistrySale[];
  reportDate?: Date;
}): ReportModeContext {
  const hasLiveAsking = Boolean(opts.liveAsking && /£|\d/.test(opts.liveAsking) && !/unknown|estimat|n\/a/i.test(opts.liveAsking));
  const sales = [...(opts.thisPropertySales || [])].sort((a, b) => b.date.localeCompare(a.date));
  const latest = sales[0];
  const latestDate = latest ? parseIsoDate(latest.date) : null;
  const now = opts.reportDate || new Date();
  const months12 = 365.25 * 24 * 3600 * 1000;
  const recentlySold =
    !hasLiveAsking &&
    latestDate != null &&
    now.getTime() - latestDate.getTime() <= months12 &&
    now.getTime() >= latestDate.getTime();

  if (recentlySold && latest && latestDate) {
    return {
      mode: 'recently_sold',
      priceLabel: `Last Sold Price (${formatMonthYear(latestDate)})`,
      lastSoldPrice: formatGbp(latest.amount),
      lastSoldDate: latest.date,
      lastSoldMonthYear: formatMonthYear(latestDate),
      hasLiveAsking: false,
    };
  }

  return {
    mode: 'on_market',
    priceLabel: hasLiveAsking ? 'Asking price' : 'Estimated value',
    hasLiveAsking,
  };
}

function scrubString(input: string): string {
  let s = input;
  for (const { re, replacement } of BANNED_PHRASE_RES) {
    s = s.replace(re, replacement);
  }
  // Collapse whitespace left by removals
  s = s.replace(/[ \t]{2,}/g, ' ').replace(/\s+\./g, '.').replace(/\s+,/g, ',').trim();
  return s;
}

function scrubValue(value: unknown): unknown {
  if (typeof value === 'string') return scrubString(value);
  if (Array.isArray(value)) return value.map(scrubValue);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = scrubValue(v);
    }
    return out;
  }
  return value;
}

function isMissingPublicFact(raw: unknown): boolean {
  if (raw == null) return true;
  const s = String(raw).trim();
  if (!s) return true;
  return LOOKUPABLE_MISSING_RE.test(s) && !/not on record/i.test(s);
}

function notOnRecord(source: string): string {
  return `Not on record — verify with ${source}`;
}

/**
 * Post-AI enforcement of the report-writing engine (Gemini path).
 */
export function applyReportWritingEngine(
  analysis: Record<string, unknown>,
  opts: {
    modeCtx: ReportModeContext;
    scrapBathrooms?: string;
    scrapBedrooms?: string;
    hasVerifiedEpc?: boolean;
    hasVerifiedSoldHistory?: boolean;
  }
): void {
  const { modeCtx } = opts;

  analysis.reportMode = modeCtx.mode;
  analysis.priceLabel = modeCtx.priceLabel;

  if (modeCtx.mode === 'recently_sold' && modeCtx.lastSoldPrice) {
    analysis.price = modeCtx.lastSoldPrice;
  }

  // Public-record missing → Not on record (never naked Unknown / Not specified)
  if (!opts.scrapBathrooms?.trim() || isMissingPublicFact(analysis.bathrooms)) {
    if (!opts.scrapBathrooms?.trim()) {
      analysis.bathrooms = notOnRecord('a viewing or the listing');
    }
  }
  if (!opts.scrapBedrooms?.trim() && isMissingPublicFact(analysis.bedrooms)) {
    analysis.bedrooms = notOnRecord('a viewing or the listing');
  }

  const dd =
    analysis.dueDiligence && typeof analysis.dueDiligence === 'object'
      ? ({ ...(analysis.dueDiligence as Record<string, unknown>) } as Record<string, unknown>)
      : {};
  if (!opts.hasVerifiedEpc && isMissingPublicFact(dd.epcAndEnergy)) {
    dd.epcAndEnergy = notOnRecord('the EPC register (find-energy-certificate.service.gov.uk)');
  }
  if (isMissingPublicFact(dd.councilTaxAndParking)) {
    dd.councilTaxAndParking = notOnRecord('the local authority / VOA council tax pages');
  }
  analysis.dueDiligence = dd;

  if (modeCtx.mode === 'recently_sold') {
    // offerStrategy must not exist — enforceReportPipeline owns Mode B panel
    delete analysis.offerStrategy;
  }

  // Confidence badge rule: hide when headline facts are missing/estimated
  const bathsMissing = /not on record|unknown|confirm/i.test(String(analysis.bathrooms || ''));
  const epcMissing = /not on record|unknown|confirm|check the epc/i.test(
    String((analysis.dueDiligence as { epcAndEnergy?: string } | undefined)?.epcAndEnergy || '')
  );
  const priceEstimated =
    modeCtx.mode === 'on_market' && !modeCtx.hasLiveAsking;
  const hideConfidence = bathsMissing || epcMissing || priceEstimated || !opts.hasVerifiedSoldHistory;
  analysis.showConfidence = !hideConfidence;
  if (hideConfidence && analysis.scores && typeof analysis.scores === 'object') {
    const scores = { ...(analysis.scores as Record<string, unknown>) };
    // Keep number for schema consumers but flag PDF to omit
    analysis.scores = scores;
  }

  // Specs: drop empty / Not specified rows; normalise bathroom row
  if (Array.isArray(analysis.specs)) {
    analysis.specs = (analysis.specs as { label?: string; value?: string }[])
      .map((row) => ({
        label: String(row.label || '').trim(),
        value: scrubString(String(row.value || '').trim()),
      }))
      .filter((row) => row.label && row.value && !/^not specified$/i.test(row.value) && row.value !== 'N/A');
  }

  // Deep scrub banned customer-facing language
  const scrubbed = scrubValue(analysis) as Record<string, unknown>;
  Object.keys(analysis).forEach((k) => delete analysis[k]);
  Object.assign(analysis, scrubbed);

  // Re-apply mode metadata after scrub
  analysis.reportMode = modeCtx.mode;
  analysis.priceLabel = modeCtx.priceLabel;
  analysis.showConfidence = !hideConfidence;
}

/** Round money for chart axes (£650k steps style). */
export function roundChartAxisGbp(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n >= 1_000_000) return Math.round(n / 50_000) * 50_000;
  if (n >= 200_000) return Math.round(n / 25_000) * 25_000;
  if (n >= 50_000) return Math.round(n / 10_000) * 10_000;
  return Math.round(n / 5_000) * 5_000;
}

export function formatChartAxisLabel(n: number): string {
  const rounded = roundChartAxisGbp(n);
  if (rounded >= 1_000_000) {
    const m = rounded / 1_000_000;
    return `£${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)}m`;
  }
  return `£${Math.round(rounded / 1000)}k`;
}
