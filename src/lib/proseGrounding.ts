/**
 * Report-wide prose grounding — same rules as Living Here.
 * Allowlist = code-selected entities + verified fact numbers + settlement names.
 * Unknown proper nouns → rewrite (max 2) → drop sentence/card.
 */

import {
  extractCandidateNames,
  validateGrounding,
  type GroundingLogEntry,
  type LivingHereProse,
} from './livingHere';
import { CRIME_UNRELIABLE } from './policeUkLookup';
import {
  resolvedFactsFromAnalysis,
  scrubNegativeClaimsAgainstFacts,
  type ResolvedFacts,
} from './negativeClaimGrounding';

export type ProseGroundingLog = GroundingLogEntry & { field?: string };

function normName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Build allowlist from finalized analysis entities + verified numbers. */
export function buildReportEntityAllowlist(analysis: Record<string, unknown>): Set<string> {
  const names = new Set<string>();
  const add = (s?: string | null) => {
    if (!s?.trim()) return;
    names.add(normName(s));
  };

  const loc = (analysis.location || {}) as { address?: string; town?: string; postcode?: string };
  for (const part of String(loc.address || analysis.address || analysis.title || '').split(',')) {
    add(part);
  }
  add(loc.town);
  add('Northallerton');
  add('Ingleby Arncliffe');
  add('Yorkshire');
  add('North Yorkshire');
  add('North York Moors');
  add('North Yorkshire Moors');
  add('National Park');
  add('England');
  add('UK');
  add('A19');
  add('A1');
  add('A1(M)');
  add('SDLT');
  add('Stamp Duty');
  add('Freehold');
  add('Leasehold');
  add('Gigabit');
  add('Broadband');
  add('Ofsted');
  add('EPC');
  add('GOV.UK');
  add('VOA');

  const area = (analysis.areaAnalysis || {}) as {
    schools?: { name?: string }[];
    transport?: { line?: string }[];
  };
  for (const s of area.schools || []) add(s.name);
  for (const t of area.transport || []) {
    add(t.line);
    const miles = (t as { miles?: number; time?: string }).miles;
    const fromTime = String((t as { time?: string }).time || '').match(/([\d.]+)\s*miles?/i)?.[1];
    const m =
      typeof miles === 'number' && Number.isFinite(miles)
        ? miles.toFixed(1)
        : fromTime || null;
    if (t.line && m) {
      names.add(`dist|${String(t.line).trim()}|${m}`);
    }
  }

  const comps = (analysis.comparableSales || []) as { address?: string }[];
  for (const c of comps) {
    add(c.address);
    // first token / house name
    const first = String(c.address || '').split(',')[0];
    add(first);
  }

  const lh = analysis.livingHere as
    | {
        foodDrink?: { name?: string }[];
        walksOutdoors?: { name?: string }[];
        everyday?: { name?: string }[];
      }
    | undefined;
  for (const list of [lh?.foodDrink, lh?.walksOutdoors, lh?.everyday]) {
    for (const p of list || []) add(p.name);
  }

  // Verified fact numbers as strings (yields, crime rates, prices) — allow numeric mentions
  const verifiedCrime = analysis.verifiedCrime as { incidentsPerThousand?: number; label?: string } | undefined;
  if (verifiedCrime?.incidentsPerThousand != null) {
    add(String(verifiedCrime.incidentsPerThousand));
  }
  add(verifiedCrime?.label);

  const im = (analysis.investmentMetrics || {}) as { grossYield?: string; estimatedRent?: string };
  add(im.grossYield);
  add(im.estimatedRent);

  // Common prose fillers that look Proper-Case
  for (const w of [
    'Saturday',
    'Sunday',
    'Monday',
    'Ofsted',
    'EPC',
    'Council',
    'Tax',
    'Land',
    'Registry',
    'Primary',
    'Secondary',
    'School',
    'College',
    'Station',
    'Rail',
    'Bus',
  ]) {
    add(w);
  }

  return names;
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Title-case marketing phrases ("Substantial Floor Area") are not place names. */
function isLikelyPlaceOrOrgName(name: string): boolean {
  if (/^The\s+/i.test(name)) return true;
  return /\b(School|College|Academy|Station|Primary|Secondary|Café|Cafe|Pub|Inn|Hotel|Park|Moors|Way|Beck|Farm|Hall|Tearoom|Restaurant|Surgery|Pharmacy|Library|Church|Cathedral|Museum|Gallery|Theatre|Manor|Castle|Village|Town|City|River|Canal)\b/i.test(
    name
  );
}

function placeLikeUnknowns(names: string[]): string[] {
  return names.filter(isLikelyPlaceOrOrgName);
}

async function groundTextBlob(
  text: string,
  allow: Set<string>,
  field: string,
  log: ProseGroundingLog[],
  rewriteField?: (path: string, value: string, hits: string[]) => Promise<string>,
  resolved?: ResolvedFacts
): Promise<string> {
  if (!text?.trim()) return text;

  let working = text;
  if (resolved) {
    const scrub = scrubNegativeClaimsAgainstFacts(working, resolved);
    if (scrub.dropped.length || scrub.replaced.length) {
      log.push({
        at: new Date().toISOString(),
        decision: scrub.dropped.length ? 'drop_prose' : 'pass',
        detail: `${field}: negative-claim vs resolved fact (${[
          ...scrub.replaced.map((c) => `replaced:${c.factKey}`),
          ...scrub.dropped.map((c) => `dropped:${c.factKey}`),
        ].join(', ')})`,
        field,
      });
      working = scrub.text;
      if (!working.trim()) return '';
    }
  }

  // Align prose distances to code-selected transport/school miles
  working = syncDistanceMentions(working, allow);

  const prose: LivingHereProse = { vignette: working, themeLines: {} };
  let { unknownNames } = validateGrounding(prose, allow);
  unknownNames = placeLikeUnknowns(unknownNames);
  let ok = unknownNames.length === 0;
  if (ok) {
    log.push({
      at: new Date().toISOString(),
      decision: 'pass',
      detail: `${field}: grounded`,
      field,
    });
    return working;
  }

  let current = working;
  for (let attempt = 0; attempt < 2 && rewriteField; attempt++) {
    log.push({
      at: new Date().toISOString(),
      decision: 'retry',
      detail: `${field}: unknown names`,
      field,
      unknownNames,
    });
    try {
      current = await rewriteField(
        field,
        current,
        unknownNames.length ? unknownNames : extractCandidateNames(current)
      );
      if (resolved) {
        current = scrubNegativeClaimsAgainstFacts(current, resolved).text;
      }
      current = syncDistanceMentions(current, allow);
      ({ unknownNames } = validateGrounding({ vignette: current, themeLines: {} }, allow));
      unknownNames = placeLikeUnknowns(unknownNames);
      ok = unknownNames.length === 0;
      if (ok) {
        log.push({
          at: new Date().toISOString(),
          decision: 'pass',
          detail: `${field}: grounded after rewrite ${attempt + 1}`,
          field,
        });
        return current;
      }
    } catch (e) {
      log.push({
        at: new Date().toISOString(),
        decision: 'fail',
        detail: `${field}: rewrite error ${e instanceof Error ? e.message : String(e)}`,
        field,
      });
      break;
    }
  }

  // Drop offending sentences
  const kept = splitSentences(current).filter((sentence) => {
    if (resolved) {
      const scrub = scrubNegativeClaimsAgainstFacts(sentence, resolved);
      if (scrub.dropped.length && !scrub.text.trim()) return false;
    }
    const check = validateGrounding({ vignette: sentence, themeLines: {} }, allow);
    return placeLikeUnknowns(check.unknownNames).length === 0;
  });
  log.push({
    at: new Date().toISOString(),
    decision: 'drop_prose',
    detail: `${field}: dropped ungrounded sentences (kept ${kept.length})`,
    field,
    unknownNames,
  });
  return kept.join(' ');
}

/**
 * When prose mentions a known entity + a miles figure, force the figure to the
 * allowlist-encoded distance if present as "Name|0.5" keys — else leave as-is.
 * Primary path: replace miles near transport names using analysis distances
 * stored on the allow set as `__dist__:name::0.5`.
 */
function syncDistanceMentions(text: string, allow: Set<string>): string {
  // Pull distance map from special allow tokens
  const distMap = new Map<string, string>();
  for (const token of allow) {
    const m = token.match(/^dist\|(.+)\|(\d+\.\d+)$/);
    if (m) distMap.set(m[1]!, m[2]!);
  }
  if (distMap.size === 0) return text;

  let out = text;
  for (const [name, miles] of distMap) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(
      `(${escaped})([^0-9]{0,40}?)(\\d+(?:\\.\\d+)?)(\\s*(?:mi(?:les?)?\\.?)?)`,
      'gi'
    );
    out = out.replace(re, (_full, n: string, mid: string, _num: string, unit: string) => {
      return `${n}${mid}${miles}${unit || ' mi'}`;
    });
  }
  return out;
}

/**
 * Ground LLM prose fields in-place. Crime interpretation is dropped entirely
 * when the crime rating is suppressed / unreliable.
 */
export async function groundAllReportProse(
  analysis: Record<string, unknown>,
  opts?: {
    rewriteField?: (path: string, value: string, hits: string[]) => Promise<string>;
    estateType?: string | null;
  }
): Promise<ProseGroundingLog[]> {
  const log: ProseGroundingLog[] = [];
  const allow = buildReportEntityAllowlist(analysis);
  const resolved = resolvedFactsFromAnalysis(analysis, { estateType: opts?.estateType });

  const ground = (text: string, field: string) =>
    groundTextBlob(text, allow, field, log, opts?.rewriteField, resolved);

  // Crime: if suppressed, always drop interpretation
  const area = (analysis.areaAnalysis && typeof analysis.areaAnalysis === 'object'
    ? { ...(analysis.areaAnalysis as Record<string, unknown>) }
    : {}) as Record<string, unknown>;
  const crimeSafety = (area.crimeSafety && typeof area.crimeSafety === 'object'
    ? { ...(area.crimeSafety as Record<string, unknown>) }
    : {}) as { rating?: string; description?: string };

  const crimeSuppressed =
    !crimeSafety.rating ||
    crimeSafety.rating === CRIME_UNRELIABLE ||
    /unavailable|suppressed|not available/i.test(String(crimeSafety.rating));

  if (crimeSuppressed) {
    if (crimeSafety.description) {
      log.push({
        at: new Date().toISOString(),
        decision: 'drop_prose',
        detail: 'areaAnalysis.crimeSafety.description: dropped — crime stat suppressed',
        field: 'areaAnalysis.crimeSafety.description',
      });
    }
    crimeSafety.description = '';
    // Also strip "very low crime" style chips from amenities later
  } else if (crimeSafety.description) {
    crimeSafety.description = await ground(String(crimeSafety.description), 'areaAnalysis.crimeSafety.description');
  }
  area.crimeSafety = crimeSafety;

  if (typeof analysis.summary === 'string') {
    analysis.summary = await ground(analysis.summary, 'summary');
  }

  if (typeof analysis.buyingSuitability === 'string') {
    analysis.buyingSuitability = await ground(analysis.buyingSuitability, 'buyingSuitability');
  }

  // Pros / cons — ground body + title; negative-claim scrub included
  for (const key of ['pros', 'cons'] as const) {
    const list = analysis[key];
    if (!Array.isArray(list)) continue;
    const next: unknown[] = [];
    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      if (typeof item === 'string') {
        const grounded = await ground(item, `${key}[${i}]`);
        if (grounded.trim()) next.push(grounded);
        continue;
      }
      if (!item || typeof item !== 'object') continue;
      const card = item as { title?: string; desc?: string; text?: string; category?: string };
      const body = String(card.desc || card.text || '').trim();
      const title = String(card.title || '').trim();
      const groundedBody = body ? await ground(body, `${key}[${i}].body`) : '';
      const groundedTitle = title ? await ground(title, `${key}[${i}].title`) : '';
      if (!groundedBody.trim() && !groundedTitle.trim()) continue;
      next.push({
        ...card,
        title: groundedTitle || groundedBody.slice(0, 48),
        desc: groundedBody || groundedTitle,
        text: groundedBody || groundedTitle,
      });
    }
    analysis[key] = next;
  }

  // Risk analysis cards — structural: never leave "not on record" when fact resolved
  if (analysis.riskAnalysis && typeof analysis.riskAnalysis === 'object') {
    const risk = { ...(analysis.riskAnalysis as Record<string, unknown>) };
    for (const [rk, rv] of Object.entries(risk)) {
      if (typeof rv !== 'string' || !rv.trim()) continue;
      risk[rk] = await ground(rv, `riskAnalysis.${rk}`);
    }
    analysis.riskAnalysis = risk;
  }

  // Amenity chips — drop any chip that fails grounding (e.g. closed school names)
  if (Array.isArray(area.amenities)) {
    const kept: string[] = [];
    for (const chip of area.amenities as string[]) {
      const s = String(chip || '').trim();
      if (!s) continue;
      // Crime-related chips when crime suppressed
      if (crimeSuppressed && /crime|safe|unsafe|incident/i.test(s)) {
        log.push({
          at: new Date().toISOString(),
          decision: 'drop_prose',
          detail: `amenities: dropped crime chip under suppressed stat — ${s}`,
          field: 'areaAnalysis.amenities',
        });
        continue;
      }
      const check = validateGrounding({ vignette: s, themeLines: {} }, allow);
      const placeHits = placeLikeUnknowns(check.unknownNames);
      if (placeHits.length) {
        log.push({
          at: new Date().toISOString(),
          decision: 'drop_prose',
          detail: `amenities: dropped ungrounded chip — ${s}`,
          field: 'areaAnalysis.amenities',
          unknownNames: placeHits,
        });
        continue;
      }
      kept.push(s);
    }
    area.amenities = kept;
  }

  if (typeof area.demographics === 'string') {
    area.demographics = await groundTextBlob(
      area.demographics,
      allow,
      'areaAnalysis.demographics',
      log,
      opts?.rewriteField
    );
  }
  if (typeof area.futureOutlook === 'string') {
    area.futureOutlook = await groundTextBlob(
      area.futureOutlook,
      allow,
      'areaAnalysis.futureOutlook',
      log,
      opts?.rewriteField
    );
  }

  analysis.areaAnalysis = area;

  // Yield: if no grossYield basis, strip invented yield mentions from marketAndRental
  const im = (analysis.investmentMetrics || {}) as Record<string, unknown>;
  if (!im.grossYield && typeof analysis.marketAndRental === 'string') {
    const scrubbed = String(analysis.marketAndRental).replace(
      /\b\d+(\.\d+)?\s*%\s*(gross\s*)?yield\b/gi,
      ''
    );
    if (scrubbed !== analysis.marketAndRental) {
      log.push({
        at: new Date().toISOString(),
        decision: 'drop_prose',
        detail: 'marketAndRental: stripped basis-less yield mention',
        field: 'marketAndRental',
      });
      analysis.marketAndRental = scrubbed.replace(/\s{2,}/g, ' ').trim();
    }
  }

  analysis.proseGroundingLog = log;
  console.log(`[proseGrounding] ${log.length} decisions`);
  for (const e of log.filter((x) => x.decision !== 'pass').slice(0, 30)) {
    console.log(`[proseGrounding] ${e.decision} ${e.detail}`);
  }
  return log;
}
