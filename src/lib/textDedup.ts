/**
 * Cross-section text deduplication — keep first occurrence, stub later copies.
 */

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s£.%]/g, '')
    .trim();
}

/** Dice coefficient on word bigrams for similarity. */
export function textSimilarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const bigrams = (s: string) => {
    const words = s.split(' ');
    const set = new Set<string>();
    for (let i = 0; i < words.length - 1; i++) set.add(`${words[i]} ${words[i + 1]}`);
    if (words.length === 1) set.add(words[0]!);
    return set;
  };
  const A = bigrams(na);
  const B = bigrams(nb);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return (2 * inter) / (A.size + B.size);
}

export type TextBlock = { path: string; text: string };

export function collectLongTextBlocks(
  value: unknown,
  path = '',
  minLen = 120
): TextBlock[] {
  const out: TextBlock[] = [];
  if (typeof value === 'string' && value.trim().length >= minLen) {
    out.push({ path, text: value });
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => {
      if (v && typeof v === 'object' && 'desc' in (v as object)) {
        out.push(...collectLongTextBlocks((v as any).desc, `${path}[${i}].desc`, minLen));
      } else {
        out.push(...collectLongTextBlocks(v, `${path}[${i}]`, minLen));
      }
    });
    return out;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      // Skip internal verified mirrors and short checklist arrays
      if (k === 'verifiedCrime' || k === 'forecastMilestones' || k === 'sources') continue;
      if (Array.isArray(v) && v.every((x) => typeof x === 'string' && x.length < 120)) continue;
      out.push(...collectLongTextBlocks(v, path ? `${path}.${k}` : k, minLen));
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
 * If two long blocks are >0.9 similar, replace the later with a cross-reference.
 */
export function dedupeAnalysisText(
  analysis: Record<string, unknown>,
  threshold = 0.9
): { analysis: Record<string, unknown>; replacements: string[] } {
  const blocks = collectLongTextBlocks(analysis);
  const replacements: string[] = [];
  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      const a = blocks[i]!;
      const b = blocks[j]!;
      if (textSimilarity(a.text, b.text) > threshold) {
        const stub = `See earlier analysis (${a.path.replace(/\.\w+$/, '') || 'above'}).`;
        setPath(analysis, b.path, stub);
        replacements.push(`${b.path} → stub (dup of ${a.path})`);
        blocks[j] = { ...b, text: stub };
      }
    }
  }
  return { analysis, replacements };
}

export function assertNoNearDuplicateBlocks(
  analysis: Record<string, unknown>,
  threshold = 0.9
): { ok: boolean; pairs: string[] } {
  const blocks = collectLongTextBlocks(analysis);
  const pairs: string[] = [];
  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      const sim = textSimilarity(blocks[i]!.text, blocks[j]!.text);
      if (sim > threshold && blocks[i]!.text.length > 120 && blocks[j]!.text.length > 120) {
        pairs.push(`${blocks[i]!.path} ~ ${blocks[j]!.path} (${sim.toFixed(2)})`);
      }
    }
  }
  return { ok: pairs.length === 0, pairs };
}
