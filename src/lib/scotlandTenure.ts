/**
 * Scotland tenure defaults — Absolute Ownership for houses is the norm.
 * LLM / English portal scrap often invents "leasehold anomaly"; scrub that.
 */

import type { ReportRegion } from './ukCoverage';

const LEASEHOLD_ANOMALY_RE =
  /\b(leasehold\s+anomaly|portal\s+data\s+suggests\s+leasehold|suggests\s+leasehold|verify\s+portal\s+leasehold|legal\s+anomaly\s+regarding\s+(the\s+)?leasehold|tenure\s+anomaly|highly\s+unusual\s+for\s+scottish[^.]{0,80}leasehold)\b/gi;

function isHouseNotFlat(analysis: Record<string, unknown>): boolean {
  const type = String(analysis.propertyType || '').toLowerCase();
  if (/flat|apartment|maisonette|tenement/i.test(type)) return false;
  if (/detached|semi|terraced|bungalow|house|villa|cottage/i.test(type)) return true;
  // Specs fallback
  const specs = Array.isArray(analysis.specs) ? analysis.specs : [];
  for (const row of specs) {
    const v = String((row as { value?: string }).value || '').toLowerCase();
    if (/flat|apartment|maisonette|tenement/.test(v)) return false;
    if (/detached|semi|terraced|house|villa/.test(v)) return true;
  }
  return true; // Scottish residential default when type unknown
}

function scrubLeaseholdAnomalyText(raw: string): string {
  let s = raw.replace(LEASEHOLD_ANOMALY_RE, '').replace(/\s{2,}/g, ' ').trim();
  // Drop orphaned clauses that only existed for the anomaly
  s = s
    .replace(/\bBuyers must verify the tenure[^.]*\./gi, '')
    .replace(/\bThe legal anomaly[^.]*\./gi, '')
    .replace(/\(\s*verify[^)]*leasehold[^)]*\)/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return s;
}

function upsertSpec(
  specs: { label?: string; value?: string }[],
  label: string,
  value: string
): { label: string; value: string }[] {
  const next = specs.map((r) => ({
    label: String(r.label || '').trim(),
    value: String(r.value || '').trim(),
  }));
  const idx = next.findIndex((r) => r.label.toLowerCase() === label.toLowerCase());
  if (idx >= 0) next[idx] = { label, value };
  else next.push({ label, value });
  return next.filter((r) => r.label && r.value);
}

/**
 * For Scotland houses: lock Absolute Ownership and remove false leasehold scare copy.
 */
export function applyScotlandTenureDefaults(
  analysis: Record<string, unknown>,
  region: ReportRegion
): void {
  if (region !== 'scotland') return;
  if (!isHouseNotFlat(analysis)) return;

  // If grounded/LLM already has clear leasehold evidence for a rare Scottish lease, keep it
  const existingTenure = String(
    (analysis.dueDiligence as { tenureAndLegal?: string } | undefined)?.tenureAndLegal || ''
  );
  const specsTenure = Array.isArray(analysis.specs)
    ? (analysis.specs as { label?: string; value?: string }[]).find((r) =>
        /tenure/i.test(String(r.label || ''))
      )
    : null;
  const tenureBlob = `${existingTenure} ${specsTenure?.value || ''}`;
  if (/\bleasehold\b/i.test(tenureBlob) && !/anomaly|unusual|portal|verify portal/i.test(tenureBlob)) {
    // Explicit leasehold claim without anomaly hedging — leave for conveyancer
    return;
  }

  const dd =
    analysis.dueDiligence && typeof analysis.dueDiligence === 'object'
      ? ({ ...(analysis.dueDiligence as Record<string, unknown>) } as Record<string, unknown>)
      : {};
  dd.tenureAndLegal =
    'Absolute Ownership (Scotland) — the usual title for houses; equivalent in practice to freehold in England. Confirm the title sheet with a Scottish conveyancer.';
  analysis.dueDiligence = dd;

  analysis.specs = upsertSpec(
    Array.isArray(analysis.specs) ? (analysis.specs as { label?: string; value?: string }[]) : [],
    'Tenure',
    'Absolute Ownership'
  );

  const risk =
    analysis.riskAnalysis && typeof analysis.riskAnalysis === 'object'
      ? ({ ...(analysis.riskAnalysis as Record<string, unknown>) } as Record<string, unknown>)
      : {};
  risk.leaseholdIssues =
    'Absolute Ownership is standard for Scottish houses — no English-style leasehold ground rent typically applies. Confirm the Registers of Scotland title sheet with a conveyancer.';
  analysis.riskAnalysis = risk;

  const tones =
    analysis.riskTones && typeof analysis.riskTones === 'object'
      ? ({ ...(analysis.riskTones as Record<string, unknown>) } as Record<string, unknown>)
      : {};
  tones.leaseholdIssues = 'positive';
  analysis.riskTones = tones;

  // Scrub invented leasehold anomaly from customer prose
  for (const key of ['summary', 'buyerFit', 'executiveSummary'] as const) {
    if (typeof analysis[key] === 'string') {
      analysis[key] = scrubLeaseholdAnomalyText(analysis[key] as string);
    }
  }

  if (Array.isArray(analysis.pros)) {
    analysis.pros = (analysis.pros as { title?: string; detail?: string }[])
      .filter((p) => {
        const blob = `${p.title || ''} ${p.detail || ''}`;
        return !(
          /leasehold/i.test(blob) && /anomaly|unusual|portal|clarification|suggests/i.test(blob)
        );
      })
      .map((p) => ({
        ...p,
        title: scrubLeaseholdAnomalyText(String(p.title || '')),
        detail: scrubLeaseholdAnomalyText(String(p.detail || '')),
      }))
      .filter((p) => p.title || p.detail);
  }
  if (Array.isArray(analysis.cons)) {
    analysis.cons = (analysis.cons as { title?: string; detail?: string; category?: string }[])
      .filter((c) => {
        const blob = `${c.title || ''} ${c.detail || ''}`;
        if (/tenure anomaly|leasehold anomaly/i.test(blob)) return false;
        if (
          /leasehold/i.test(blob) &&
          /anomaly|unusual|portal|clarification|suggests/i.test(blob)
        ) {
          return false;
        }
        return true;
      })
      .map((c) => ({
        ...c,
        title: scrubLeaseholdAnomalyText(String(c.title || '')),
        detail: scrubLeaseholdAnomalyText(String(c.detail || '')),
      }))
      .filter((c) => Boolean(c.title || c.detail));
  }
}
