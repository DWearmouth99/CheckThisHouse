/**
 * Negative-claim validator — prose must not deny facts that are already resolved.
 * Grounding already blocks inventing entities; this blocks denying verified facts.
 */

export type ResolvedFactKey = 'tenure' | 'epc' | 'flood' | 'crime' | 'soldHistory' | 'broadband';

export type NegativeClaim = {
  phrase: string;
  factKey: ResolvedFactKey | null;
  sentence: string;
};

export type ResolvedFacts = {
  tenure?: 'freehold' | 'leasehold' | null;
  epcBand?: string | null;
  floodZone?: string | null;
  floodRivers?: string | null;
  crimeReliable?: boolean;
  hasSoldHistory?: boolean;
  broadbandKnown?: boolean;
};

const ABSENCE_RE =
  /\b(not on record|unconfirmed|unknown|unverified|not (?:yet )?confirmed|could not be verified|requires? verification|not available from (?:official )?records)\b/i;

const TENURE_UNCERTAIN_RE =
  /\b(unconfirmed tenure|tenure is not|tenure (?:remains? )?unknown|could be leasehold|leasehold title could|freehold\/leasehold|confirm (?:freehold|tenure))\b/i;

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function inferFactKey(sentence: string): ResolvedFactKey | null {
  const s = sentence.toLowerCase();
  if (/tenure|freehold|leasehold|ground rent|title\b/.test(s)) return 'tenure';
  if (/\bepc\b|energy (?:rating|band|certificate)/.test(s)) return 'epc';
  // Surface-water "not available" is a partial gap, not a denial of Zone 1 / rivers & sea
  if (/surface water/.test(s) && /not available|not on record|not returned/.test(s)) return null;
  if (/flood zone|rivers?\s*&\s*sea|flood risk/.test(s)) return 'flood';
  if (/\bcrime\b|incidents? per|police\.uk/.test(s)) return 'crime';
  if (/sold history|last sold|land registry sale|price paid/.test(s)) return 'soldHistory';
  if (/broadband|ofcom|gigabit|fibre|mobile coverage/.test(s)) return 'broadband';
  return null;
}

/** Detect absence/uncertainty claims that assert a fact is unresolved. */
export function detectNegativeClaims(text: string): NegativeClaim[] {
  if (!text?.trim()) return [];
  const out: NegativeClaim[] = [];
  for (const sentence of splitSentences(text)) {
    const absence = sentence.match(ABSENCE_RE)?.[1];
    const tenureUncertain = TENURE_UNCERTAIN_RE.test(sentence);
    if (!absence && !tenureUncertain) continue;
    out.push({
      phrase: absence || 'unconfirmed tenure',
      factKey: inferFactKey(sentence),
      sentence,
    });
  }
  return out;
}

export function isFactResolved(facts: ResolvedFacts, key: ResolvedFactKey | null): boolean {
  if (!key) return false;
  switch (key) {
    case 'tenure':
      return facts.tenure === 'freehold' || facts.tenure === 'leasehold';
    case 'epc':
      return Boolean(facts.epcBand && /^[A-G]$/i.test(facts.epcBand));
    case 'flood':
      return Boolean(facts.floodZone && facts.floodZone !== 'unknown');
    case 'crime':
      return facts.crimeReliable === true;
    case 'soldHistory':
      return facts.hasSoldHistory === true;
    case 'broadband':
      return facts.broadbandKnown === true;
    default:
      return false;
  }
}

export function factStatement(facts: ResolvedFacts, key: ResolvedFactKey): string {
  switch (key) {
    case 'tenure':
      return facts.tenure === 'freehold'
        ? 'Tenure is freehold (HM Land Registry Price Paid).'
        : 'Tenure is leasehold (HM Land Registry Price Paid) — confirm term and ground rent with a conveyancer.';
    case 'epc':
      return `EPC band ${facts.epcBand} is on the register.`;
    case 'flood':
      return `Flood Zone ${facts.floodZone}${facts.floodRivers ? ` — rivers & sea ${facts.floodRivers}` : ''} (official records).`;
    case 'crime':
      return 'Local crime figures from police.uk are included in this report.';
    case 'soldHistory':
      return 'Land Registry Price Paid sales for this address are included in this report.';
    case 'broadband':
      return 'Broadband notes for this postcode are included under due diligence.';
    default:
      return '';
  }
}

/**
 * Drop or replace sentences that deny a resolved fact.
 * Returns cleaned text + whether any contradiction was removed.
 */
export function scrubNegativeClaimsAgainstFacts(
  text: string,
  facts: ResolvedFacts
): { text: string; dropped: NegativeClaim[]; replaced: NegativeClaim[] } {
  const dropped: NegativeClaim[] = [];
  const replaced: NegativeClaim[] = [];
  if (!text?.trim()) return { text, dropped, replaced };

  const kept: string[] = [];
  for (const sentence of splitSentences(text)) {
    const claims = detectNegativeClaims(sentence);
    const contradicting = claims.filter((c) => isFactResolved(facts, c.factKey));
    if (contradicting.length === 0) {
      kept.push(sentence);
      continue;
    }
    const key = contradicting[0]!.factKey!;
    // Single-purpose cards about absence → replace with the fact; mixed sentences → drop
    if (
      /tenure|leasehold|freehold|epc|flood|crime|broadband|sold/i.test(sentence) &&
      sentence.length < 220
    ) {
      replaced.push(...contradicting);
      kept.push(factStatement(facts, key));
    } else {
      dropped.push(...contradicting);
    }
  }
  return {
    text: kept.join(' ').replace(/\s+/g, ' ').trim(),
    dropped,
    replaced,
  };
}

/** Build resolved-facts snapshot from finalized analysis + optional LR estate. */
export function resolvedFactsFromAnalysis(
  analysis: Record<string, unknown>,
  opts?: { estateType?: string | null }
): ResolvedFacts {
  const specs = (analysis.specs || []) as { label?: string; value?: string }[];
  const tenureSpec = specs.find((s) => /^tenure$/i.test(String(s.label || '')));
  const dd = (analysis.dueDiligence || {}) as { tenureAndLegal?: string; epcAndEnergy?: string };
  let tenure: ResolvedFacts['tenure'] = null;
  const estate = (opts?.estateType || '').toLowerCase();
  if (estate === 'freehold' || estate === 'leasehold') tenure = estate;
  else if (/freehold/i.test(String(tenureSpec?.value || '')) || /freehold/i.test(String(dd.tenureAndLegal || ''))) {
    tenure = 'freehold';
  } else if (/leasehold/i.test(String(tenureSpec?.value || '')) || /leasehold/i.test(String(dd.tenureAndLegal || ''))) {
    tenure = 'leasehold';
  }

  const epcMatch = String(dd.epcAndEnergy || '').match(/\bEPC band\s+([A-G])\b/i);
  const flood = analysis.verifiedFlood as { floodZone?: string; riversAndSea?: string } | undefined;
  const crime = analysis.verifiedCrime as { incidentsPerThousand?: number | null } | undefined;
  const sold = (analysis.soldHistory || []) as { price?: string }[];
  const hasSold = sold.some((s) => /£/.test(String(s.price || '')) && !/not found|not on record/i.test(String(s.price || '')));
  const bb = String((dd as { broadbandAndMobile?: string }).broadbandAndMobile || '');
  const broadbandKnown =
    Boolean(bb) && !/not on record|not available/i.test(bb) && !/verify broadband/i.test(bb);

  return {
    tenure,
    epcBand: epcMatch?.[1]?.toUpperCase() || null,
    floodZone: flood?.floodZone || null,
    floodRivers: flood?.riversAndSea || null,
    crimeReliable: crime?.incidentsPerThousand != null,
    hasSoldHistory: hasSold,
    broadbandKnown,
  };
}
