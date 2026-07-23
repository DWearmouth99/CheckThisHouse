/**
 * Address / postcode matching — drop wrong-property records BEFORE any LLM sees them.
 */

const UK_POSTCODE_RE =
  /\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i;

export function extractPostcode(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = String(text).match(UK_POSTCODE_RE);
  if (!m) return null;
  return normalizePostcode(m[1]!);
}

/** Compact uppercase postcode without spaces for equality. */
export function normalizePostcode(pc: string): string {
  return pc.toUpperCase().replace(/\s+/g, '').trim();
}

export function postcodesEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return normalizePostcode(a) === normalizePostcode(b);
}

export function recordMatchesSubject(opts: {
  subjectPostcode: string | null;
  subjectUprn?: string | null;
  recordPostcode?: string | null;
  recordAddress?: string | null;
  recordUprn?: string | null;
}): boolean {
  if (opts.subjectUprn && opts.recordUprn) {
    return String(opts.subjectUprn).trim() === String(opts.recordUprn).trim();
  }
  const recordPc =
    extractPostcode(opts.recordPostcode || '') || extractPostcode(opts.recordAddress || '');
  if (!opts.subjectPostcode || !recordPc) return false;
  return postcodesEqual(opts.subjectPostcode, recordPc);
}

export type DropLog = {
  source: string;
  reason: string;
  preview: string;
};

/**
 * Filter list to subject postcode only. Logs drops server-side; never returns mismatched rows.
 */
export function filterRecordsBySubjectPostcode<T>(opts: {
  source: string;
  subjectPostcode: string | null;
  subjectUprn?: string | null;
  records: T[];
  getPostcode: (r: T) => string | null | undefined;
  getAddress?: (r: T) => string | null | undefined;
  getUprn?: (r: T) => string | null | undefined;
  drops?: DropLog[];
}): T[] {
  const kept: T[] = [];
  for (const r of opts.records) {
    const ok = recordMatchesSubject({
      subjectPostcode: opts.subjectPostcode,
      subjectUprn: opts.subjectUprn,
      recordPostcode: opts.getPostcode(r),
      recordAddress: opts.getAddress?.(r),
      recordUprn: opts.getUprn?.(r),
    });
    if (ok) {
      kept.push(r);
    } else {
      const preview = JSON.stringify(r).slice(0, 180);
      const entry: DropLog = {
        source: opts.source,
        reason: `postcode/UPRN mismatch vs subject ${opts.subjectPostcode || '(none)'}`,
        preview,
      };
      opts.drops?.push(entry);
      console.warn(`[addressMatch] DROP ${opts.source}: ${entry.reason} :: ${preview}`);
    }
  }
  return kept;
}

/** Assert a string (e.g. LLM payload) contains no foreign postcode areas from a denylist. */
export function assertPayloadHasNoForeignTokens(
  payload: string,
  forbiddenSubstrings: string[]
): { ok: boolean; hits: string[] } {
  const lower = payload.toLowerCase();
  const hits = forbiddenSubstrings.filter((t) => t && lower.includes(t.toLowerCase()));
  return { ok: hits.length === 0, hits };
}
