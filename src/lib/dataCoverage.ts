/**
 * Per-source data coverage for live lookups — surfaced in logs + PDF footer.
 */

export type DataCoverageStatus = 'ok' | 'failed' | 'suppressed' | 'skipped';

export type DataCoverageSource = {
  id: string;
  label: string;
  status: DataCoverageStatus;
  detail?: string;
};

export type DataCoverage = {
  sources: DataCoverageSource[];
  ok: number;
  total: number;
  /** e.g. "3 of 5 official sources returned data" */
  summaryLine: string;
  /** e.g. "police.uk: unavailable at generation" */
  failedLine: string;
};

export function buildDataCoverage(sources: DataCoverageSource[]): DataCoverage {
  const countable = sources.filter((s) => s.status !== 'skipped');
  const ok = countable.filter((s) => s.status === 'ok').length;
  const total = countable.length;
  const failed = countable.filter((s) => s.status === 'failed' || s.status === 'suppressed');
  const summaryLine = `${ok} of ${total} official sources returned data`;
  const failedLine = failed.length
    ? failed
        .map((s) => `${s.label}: ${s.detail || (s.status === 'suppressed' ? 'suppressed' : 'unavailable at generation')}`)
        .join('; ')
    : '';
  return { sources, ok, total, summaryLine, failedLine };
}

export function formatDataCoverageFooter(coverage?: DataCoverage | null): string {
  if (!coverage || coverage.total === 0) return '';
  if (coverage.failedLine) {
    return `${coverage.summaryLine} (${coverage.failedLine})`;
  }
  return coverage.summaryLine;
}

export function logDataCoverage(coverage: DataCoverage): void {
  console.log(`[dataCoverage] ${coverage.summaryLine}`);
  for (const s of coverage.sources) {
    console.log(
      `[dataCoverage] ${s.id}=${s.status}${s.detail ? ` (${s.detail})` : ''}`
    );
  }
}
