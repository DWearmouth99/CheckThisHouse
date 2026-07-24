/**
 * Living Here section — apply POI blocks + LLM vignette/theme lines with grounding validator.
 * LLM context contains ONLY selected POIs + settlement names from verified facts.
 */

import type { PropertyAnalysis } from '../types';
import {
  type LivingHereBlocks,
  type PoiRecord,
  formatDistanceMiles,
  livingHereFromRecorded,
  lookupLivingHerePois,
  type PoiLookupResult,
} from './poiLookup';

export interface LivingHereSection {
  foodDrink: PoiRecord[];
  walksOutdoors: PoiRecord[];
  everyday: PoiRecord[];
  /** 3–4 sentence vignette — omitted if grounding fails */
  vignette?: string;
  placesEnabled: boolean;
  /** Grounding validator decisions for tests / ops */
  groundingLog: GroundingLogEntry[];
}

export interface GroundingLogEntry {
  at: string;
  decision: 'pass' | 'fail' | 'retry' | 'drop_prose' | 'skip_llm';
  detail: string;
  unknownNames?: string[];
}

export interface LivingHereProse {
  vignette: string;
  /** theme lines keyed by venue name (exact match to POI name) */
  themeLines: Record<string, string>;
}

const FOOD_CAT_LABEL: Record<string, string> = {
  pub: 'Pub',
  cafe: 'Café',
  restaurant: 'Restaurant',
  farm_shop: 'Farm shop',
};

export function livingHereHasContent(blocks: LivingHereBlocks): boolean {
  return (
    blocks.foodDrink.length > 0 ||
    blocks.walksOutdoors.length > 0 ||
    blocks.everyday.length > 0
  );
}

export function poiAllowlist(blocks: LivingHereBlocks, settlements: string[]): Set<string> {
  const names = new Set<string>();
  for (const list of [blocks.foodDrink, blocks.walksOutdoors, blocks.everyday]) {
    for (const p of list) names.add(normName(p.name));
  }
  for (const s of settlements) {
    if (s.trim()) names.add(normName(s));
  }
  // Common geographic / filler words that appear as Proper Case but aren't venues
  for (const w of ['Saturday', 'Sunday', 'North', 'South', 'East', 'West', 'Yorkshire', 'England', 'UK']) {
    names.add(normName(w));
  }
  return names;
}

function normName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Extract candidate venue-like / proper-noun phrases from prose.
 * Heuristic: sequences of Capitalised words (2+), or "The X" patterns.
 */
export function extractCandidateNames(text: string): string[] {
  if (!text?.trim()) return [];
  const found = new Set<string>();

  // "The Copper Kettle Tearoom" style
  const thePattern = /\bThe\s+([A-Z][A-Za-z'’]+(?:\s+[A-Z][A-Za-z'’]+){0,5})/g;
  let m: RegExpExecArray | null;
  while ((m = thePattern.exec(text)) !== null) {
    found.add(`The ${m[1]}`.trim());
  }

  // Multi-word Title Case (excluding sentence starts after period is hard — take all Cap Cap+)
  const multi = /\b([A-Z][a-z'’]+(?:\s+[A-Z][a-z'’]+)+)\b/g;
  while ((m = multi.exec(text)) !== null) {
    const phrase = m[1].trim();
    // Skip month-like / day-like singles already filtered by multi-word
    if (/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$/i.test(phrase)) continue;
    found.add(phrase);
  }

  return [...found];
}

export function validateGrounding(
  prose: LivingHereProse,
  allow: Set<string>
): { ok: boolean; unknownNames: string[] } {
  const blobs = [prose.vignette, ...Object.values(prose.themeLines || {})].filter(Boolean);
  const unknown = new Set<string>();
  for (const blob of blobs) {
    for (const cand of extractCandidateNames(blob)) {
      const n = normName(cand);
      if (!n) continue;
      // Allow if any allowlist entry is contained in candidate or vice versa
      let matched = false;
      for (const a of allow) {
        if (!a) continue;
        if (n === a || n.includes(a) || a.includes(n)) {
          matched = true;
          break;
        }
        // token overlap: all significant tokens of candidate in allow phrase or reverse
        const candTokens = n.split(' ').filter((t) => t.length > 2);
        const allowTokens = a.split(' ').filter((t) => t.length > 2);
        if (
          candTokens.length >= 2 &&
          candTokens.every((t) => allowTokens.some((at) => at.includes(t) || t.includes(at)))
        ) {
          matched = true;
          break;
        }
      }
      if (!matched) unknown.add(cand);
    }
  }
  return { ok: unknown.size === 0, unknownNames: [...unknown] };
}

function settlementsFromAnalysis(analysis: PropertyAnalysis): string[] {
  const addr = String(analysis.address || '');
  const parts = addr.split(',').map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  for (const p of parts) {
    if (/^[A-Z]{1,2}\d/i.test(p.replace(/\s/g, ''))) continue; // postcode
    if (/^Pentland$/i.test(p)) continue;
    out.push(p);
  }
  // Common settlement tokens
  if (/Northallerton/i.test(addr)) out.push('Northallerton');
  if (/Brompton/i.test(addr)) out.push('Brompton');
  return [...new Set(out)];
}

function buildPoiContext(blocks: LivingHereBlocks, settlements: string[]): string {
  const lines: string[] = [];
  lines.push('Settlements (verified): ' + settlements.join(', '));
  lines.push('Food & drink:');
  for (const p of blocks.foodDrink) {
    lines.push(
      `- ${p.name} (${FOOD_CAT_LABEL[p.category] || p.category}, ${formatDistanceMiles(p.distanceMiles)}` +
        (p.hygieneRating ? `, FSA ${p.hygieneRating}` : '') +
        (p.rating != null ? `, rating ${p.rating}` : '') +
        ')'
    );
  }
  lines.push('Walks & outdoors:');
  for (const p of blocks.walksOutdoors) {
    lines.push(
      `- ${p.name} (${p.category}${p.isNationalTrail ? ', national trail' : ''}, ${formatDistanceMiles(p.distanceMiles)})`
    );
  }
  lines.push('Everyday essentials:');
  for (const p of blocks.everyday) {
    lines.push(`- ${p.name} (${p.category}, ${formatDistanceMiles(p.distanceMiles)})`);
  }
  return lines.join('\n');
}

export type LivingHereLlmFn = (args: {
  poiContext: string;
  reviewSnippets?: Record<string, string[]>;
  attempt: number;
}) => Promise<LivingHereProse>;

/**
 * Generate vignette + theme lines with grounding validation (max 2 regenerations).
 */
export async function generateLivingHereWithGrounding(
  blocks: LivingHereBlocks,
  settlements: string[],
  llm: LivingHereLlmFn | null,
  opts?: { reviewSnippets?: Record<string, string[]> }
): Promise<{ prose: LivingHereProse | null; log: GroundingLogEntry[] }> {
  const log: GroundingLogEntry[] = [];
  const now = () => new Date().toISOString();

  if (!livingHereHasContent(blocks)) {
    log.push({ at: now(), decision: 'skip_llm', detail: 'all blocks empty' });
    return { prose: null, log };
  }

  if (!llm) {
    log.push({ at: now(), decision: 'skip_llm', detail: 'no LLM function — POI blocks only' });
    return { prose: null, log };
  }

  const allow = poiAllowlist(blocks, settlements);
  const poiContext = buildPoiContext(blocks, settlements);
  const maxAttempts = 3; // initial + 2 regenerations

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let prose: LivingHereProse;
    try {
      prose = await llm({
        poiContext,
        reviewSnippets: opts?.reviewSnippets,
        attempt,
      });
    } catch (e) {
      log.push({
        at: now(),
        decision: 'fail',
        detail: `LLM error: ${e instanceof Error ? e.message : String(e)}`,
      });
      break;
    }

    const { ok, unknownNames } = validateGrounding(prose, allow);
    if (ok) {
      log.push({
        at: now(),
        decision: 'pass',
        detail: `attempt ${attempt + 1}: all names grounded`,
      });
      // Only attach theme lines for venues that exist and have Places data path
      return { prose, log };
    }

    log.push({
      at: now(),
      decision: attempt < maxAttempts - 1 ? 'retry' : 'fail',
      detail: `attempt ${attempt + 1}: unknown names`,
      unknownNames,
    });
    console.warn('[livingHere] grounding fail', unknownNames);
  }

  log.push({
    at: now(),
    decision: 'drop_prose',
    detail: 'persistent grounding failure — shipping POI blocks without vignette/theme lines',
  });
  return { prose: null, log };
}

/** Apply selected POIs onto analysis.livingHere */
export function applyLivingHereBlocks(
  analysis: PropertyAnalysis,
  blocks: LivingHereBlocks,
  opts?: {
    placesEnabled?: boolean;
    vignette?: string;
    themeLines?: Record<string, string>;
    groundingLog?: GroundingLogEntry[];
  }
): void {
  if (!livingHereHasContent(blocks)) {
    delete (analysis as { livingHere?: LivingHereSection }).livingHere;
    return;
  }

  const foodDrink = blocks.foodDrink.map((p) => {
    const copy = { ...p };
    const theme = opts?.themeLines?.[p.name];
    if (theme && opts?.placesEnabled) copy.reviewTheme = theme;
    // Strip ephemeral snippets
    delete (copy as { _reviewSnippets?: unknown })._reviewSnippets;
    return copy;
  });

  const section: LivingHereSection = {
    foodDrink,
    walksOutdoors: blocks.walksOutdoors.map((p) => ({ ...p })),
    everyday: blocks.everyday.map((p) => ({ ...p })),
    placesEnabled: Boolean(opts?.placesEnabled),
    groundingLog: opts?.groundingLog || [],
  };
  if (opts?.vignette?.trim()) section.vignette = opts.vignette.trim();

  (analysis as PropertyAnalysis & { livingHere: LivingHereSection }).livingHere = section;
}

export async function applyLivingHereFromLookup(
  analysis: PropertyAnalysis,
  lat: number,
  lng: number,
  postcode: string,
  opts?: {
    lookup?: PoiLookupResult;
    llm?: LivingHereLlmFn | null;
    skipPlaces?: boolean;
  }
): Promise<void> {
  const result =
    opts?.lookup ??
    (await lookupLivingHerePois(lat, lng, postcode, { skipPlaces: opts?.skipPlaces ?? true }));

  const settlements = settlementsFromAnalysis(analysis);
  const reviewSnippets: Record<string, string[]> = {};
  for (const p of result.blocks.foodDrink) {
    const snips = (p as PoiRecord & { _reviewSnippets?: string[] })._reviewSnippets;
    if (snips?.length) reviewSnippets[p.name] = snips;
  }

  const { prose, log } = await generateLivingHereWithGrounding(
    result.blocks,
    settlements,
    opts?.llm === undefined ? null : opts.llm,
    { reviewSnippets }
  );

  applyLivingHereBlocks(analysis, result.blocks, {
    placesEnabled: result.placesEnabled,
    vignette: prose?.vignette,
    themeLines: prose?.themeLines,
    groundingLog: log,
  });
}

export function applyLivingHereFromRecorded(
  analysis: PropertyAnalysis,
  recorded: { all?: PoiRecord[]; blocks?: LivingHereBlocks },
  opts?: {
    llm?: LivingHereLlmFn | null;
    placesEnabled?: boolean;
  }
): Promise<void> | void {
  const blocks = livingHereFromRecorded(recorded);
  const settlements = settlementsFromAnalysis(analysis);

  const run = async () => {
    const { prose, log } = await generateLivingHereWithGrounding(
      blocks,
      settlements,
      opts?.llm === undefined ? null : opts.llm
    );
    applyLivingHereBlocks(analysis, blocks, {
      placesEnabled: Boolean(opts?.placesEnabled),
      vignette: prose?.vignette,
      themeLines: prose?.themeLines,
      groundingLog: log,
    });
  };

  if (opts?.llm) return run();
  applyLivingHereBlocks(analysis, blocks, {
    placesEnabled: Boolean(opts?.placesEnabled),
    groundingLog: [
      {
        at: new Date().toISOString(),
        decision: 'skip_llm',
        detail: 'recorded fixtures — POI blocks only (no vignette unless llm provided)',
      },
    ],
  });
}

/** Default Gemini structured Living Here call — used by finalize when key present */
export function livingHereGeminiPrompt(poiContext: string, hasReviewSnippets: boolean): string {
  return `You write lifestyle prose for a UK property report section "Living Here".

RULES:
- You may ONLY mention venues and places listed below. Do not invent pubs, cafés, shops, trails, or landmarks.
- Write a 3–4 sentence vignette titled conceptually "A Saturday morning here" (do not include the title in the text) weaving in real POIs from the list.
- ${hasReviewSnippets ? 'For each food/drink venue that has review snippets in the user message, distill ONE short theme line (praise pattern, not a quote). Never paste verbatim review text.' : 'Do not invent ratings or review themes. Leave themeLines empty.'}
- Temperature conceptually 0: factual, grounded, no hype.

POI LIST:
${poiContext}

Respond with JSON only:
{"vignette":"...","themeLines":{"Exact Venue Name":"theme line"}}`;
}
