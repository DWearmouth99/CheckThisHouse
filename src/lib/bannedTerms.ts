/**
 * Banned customer-facing terms — enforced in code (scan → field rewrite → substitution).
 */

export const BANNED_TERMS = [
  'off-grid',
  'off grid',
  'authoritative',
  'disregarded',
  'firmly discounted',
  'the provided data',
  'records supplied',
  'do not apply to this address',
  'have been discounted',
  'have been disregarded',
  'not established',
  'reason for price difference not established',
  // Plumbing / internal mechanics (customer PDF must never show these)
  'endpoint',
  'fetched',
  'parser',
  'pipeline',
  'payload',
  'open data feed',
  'open flood-risk-zone api',
  'flood-risk-zone api',
] as const;

/** Standalone plumbing tokens scanned case-insensitively as whole words / URL shapes. */
export const PLUMBING_JARGON_RES: RegExp[] = [
  /\bAPI\b/,
  /\bendpoint\b/i,
  /\bfetched\b/i,
  /\bparser\b/i,
  /\bpipeline\b/i,
  /\bpayload\b/i,
  /\bopen data feed\b/i,
  /https?:\/\/[^\s)\]"'<>]+/i,
];

export function findPlumbingHits(text: string): string[] {
  const hits: string[] = [];
  for (const re of PLUMBING_JARGON_RES) {
    if (re.test(text)) hits.push(re.source);
  }
  return hits;
}

/** Prefer grammar-preserving substitutions only as last resort after rewrite retries. */
export const BANNED_SUBSTITUTIONS: { re: RegExp; replacement: string }[] = [
  { re: /\boff[-\s]?grid\b/gi, replacement: 'oil/LPG heating (no mains gas)' },
  { re: /\bauthoritative\b/gi, replacement: '' },
  { re: /\bdisregarded\b/gi, replacement: '' },
  { re: /\bfirmly discounted\b/gi, replacement: '' },
  { re: /\bhave been discounted\b/gi, replacement: '' },
  { re: /\bhave been disregarded\b/gi, replacement: '' },
  { re: /\bthe provided data\b/gi, replacement: 'public records' },
  { re: /\brecords supplied\b/gi, replacement: 'public records' },
  { re: /\breason for price difference not established\.?/gi, replacement: '' },
  { re: /\bnot established\b/gi, replacement: '' },
  { re: /\bnot returned by open flood-risk-zone API[^.]*\.?/gi, replacement: 'not available from official records — check the GOV.UK long-term flood risk service.' },
  { re: /\bfetched\s+\d{4}-\d{2}-\d{2}/gi, replacement: '' },
  { re: /\bopen flood-risk-zone API\b/gi, replacement: 'official flood records' },
  { re: /https?:\/\/checker\.ofcom\.org\.uk[^\s)\]"'<>]*/gi, replacement: "Ofcom's broadband checker" },
  { re: /https?:\/\/[^\s)\]"'<>]+/gi, replacement: '' },
];

/** Forbidden speculative EPC letter ranges in customer text. */
export const EPC_RANGE_RE =
  /EPC[^.]{0,40}\b[A-G]\s*(to|–|-|—)\s*[A-G]\b/i;

export function findBannedHits(text: string): string[] {
  const lower = text.toLowerCase();
  const termHits = BANNED_TERMS.filter((t) => lower.includes(t.toLowerCase()));
  return [...termHits, ...findPlumbingHits(text)];
}

export function applyBannedSubstitutions(text: string): string {
  let s = text;
  for (const { re, replacement } of BANNED_SUBSTITUTIONS) {
    s = s.replace(re, replacement);
  }
  return s.replace(/[ \t]{2,}/g, ' ').replace(/\s+\./g, '.').trim();
}

export type TextHit = { path: string; hits: string[]; value: string };

export function scanObjectForBannedTerms(
  value: unknown,
  path = ''
): TextHit[] {
  const out: TextHit[] = [];
  if (typeof value === 'string') {
    const hits = findBannedHits(value);
    if (hits.length || EPC_RANGE_RE.test(value) || /\bnot specified\b/i.test(value)) {
      const all = [
        ...hits,
        ...(EPC_RANGE_RE.test(value) ? ['EPC_RANGE'] : []),
        ...(/\bnot specified\b/i.test(value) ? ['not specified'] : []),
      ];
      if (all.length) out.push({ path, hits: all, value });
    }
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => out.push(...scanObjectForBannedTerms(v, `${path}[${i}]`)));
    return out;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out.push(...scanObjectForBannedTerms(v, path ? `${path}.${k}` : k));
    }
  }
  return out;
}

function setPath(obj: Record<string, unknown>, path: string, next: string): void {
  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
  let cur: any = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i]!;
    if (cur[p] == null) return;
    cur = cur[p];
  }
  const last = parts[parts.length - 1]!;
  if (cur && typeof cur === 'object') cur[last] = next;
}

/**
 * Enforce banned terms. Optional rewriteFn rewrites a single field (max 2 retries).
 * Falls back to substitution map and logs a warning.
 */
export async function enforceBannedTerms(
  analysis: Record<string, unknown>,
  rewriteFn?: (path: string, value: string, hits: string[]) => Promise<string>
): Promise<{ cleaned: Record<string, unknown>; warnings: string[] }> {
  const warnings: string[] = [];
  let working = analysis;

  for (let pass = 0; pass < 3; pass++) {
    const hits = scanObjectForBannedTerms(working);
    if (hits.length === 0) return { cleaned: working, warnings };

    for (const hit of hits) {
      let next = hit.value;
      if (rewriteFn && pass < 2) {
        try {
          next = await rewriteFn(hit.path, hit.value, hit.hits);
        } catch (err: any) {
          warnings.push(`rewrite failed ${hit.path}: ${err?.message || err}`);
        }
      }
      if (findBannedHits(next).length || EPC_RANGE_RE.test(next) || /\bnot specified\b/i.test(next)) {
        next = applyBannedSubstitutions(next)
          .replace(EPC_RANGE_RE, 'EPC rating not confirmed on the register')
          .replace(/\bnot specified\b/gi, '');
        warnings.push(`substitution applied at ${hit.path} for [${hit.hits.join(', ')}]`);
      }
      setPath(working, hit.path, next.trim());
    }
  }

  // Final hard substitution pass
  const leftover = scanObjectForBannedTerms(working);
  for (const hit of leftover) {
    const next = applyBannedSubstitutions(hit.value)
      .replace(EPC_RANGE_RE, 'EPC rating not confirmed on the register')
      .replace(/\bnot specified\b/gi, '')
      .trim();
    setPath(working, hit.path, next);
    warnings.push(`final scrub at ${hit.path}`);
  }

  return { cleaned: working, warnings };
}
