/**
 * Ofcom Connected Nations broadband coverage (optional API key).
 * Without OFCOM_API_KEY / OFCOM_SUBSCRIPTION_KEY, returns an explicit
 * "Not on record" summary pointing at the public checker.
 */

export type OfcomBroadbandLookup = {
  postcode: string;
  summary: string;
  maxDownloadMbps?: number | null;
  fibreAvailable?: boolean | null;
  sourceUrl: string;
  error?: string;
};

const OFCOM_CHECKER = 'https://checker.ofcom.org.uk/en-gb/broadband-coverage';

function compactPc(pc: string): string {
  return pc.toUpperCase().replace(/\s+/g, '').trim();
}

function ofcomKey(): string | null {
  return (
    process.env.OFCOM_API_KEY?.trim() ||
    process.env.OFCOM_SUBSCRIPTION_KEY?.trim() ||
    null
  );
}

function summariseAvailability(rows: unknown[]): {
  summary: string;
  maxDownloadMbps: number | null;
  fibreAvailable: boolean | null;
} {
  let maxDl: number | null = null;
  let fibre: boolean | null = null;

  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const dl = Number(
      r.MaxDownload ||
        r.maxDownload ||
        r.MaxPredictedDown ||
        r.maxPredictedDown ||
        r.DownloadSpeed ||
        r.downloadSpeed
    );
    if (Number.isFinite(dl) && (maxDl == null || dl > maxDl)) maxDl = dl;

    const tech = String(
      r.Technology || r.technology || r.BBTechnology || r.BroadbandTechnology || ''
    ).toLowerCase();
    if (/fttp|full\s*fibre|fibre\s*to\s*the\s*premises|gfast|fttc/i.test(tech)) {
      fibre = true;
    }
  }

  if (rows.length === 0) {
    return {
      summary: ofcomNotOnRecordLine(),
      maxDownloadMbps: null,
      fibreAvailable: null,
    };
  }

  const parts: string[] = [];
  if (maxDl != null && maxDl > 0) {
    parts.push(`up to ~${Math.round(maxDl)} Mbps download (Ofcom postcode coverage)`);
  }
  if (fibre === true) parts.push('fibre options indicated at postcode');

  const summary =
    parts.length > 0
      ? `${parts.join('; ')}. Confirm exact premise on Ofcom checker.`
      : `Ofcom returned coverage rows for this postcode — confirm speeds for this premise at ${OFCOM_CHECKER}`;

  return { summary, maxDownloadMbps: maxDl, fibreAvailable: fibre };
}

/**
 * Look up Ofcom broadband coverage for a postcode.
 */
export async function lookupOfcomBroadband(
  postcode: string
): Promise<OfcomBroadbandLookup | null> {
  const pc = compactPc(postcode);
  if (!pc) return null;
  const key = ofcomKey();
  const sourceUrl = OFCOM_CHECKER;

  if (!key) {
    return {
      postcode: pc,
      summary: ofcomNotOnRecordLine(),
      sourceUrl,
      error: 'OFCOM_API_KEY not configured — operator: add Ofcom Connected Nations key or accept checker-only wording',
    };
  }

  const urls = [
    `https://api-proxy.ofcom.org.uk/broadband/coverage/${encodeURIComponent(pc)}`,
    `https://api.ofcom.org.uk/broadband/coverage/${encodeURIComponent(pc)}`,
  ];

  let lastErr = '';
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'Ocp-Apim-Subscription-Key': key,
        },
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) {
        lastErr = `HTTP ${res.status}`;
        continue;
      }
      const data = (await res.json()) as
        | { Availability?: unknown[] }
        | unknown[];
      const rows = Array.isArray((data as { Availability?: unknown[] }).Availability)
        ? (data as { Availability: unknown[] }).Availability
        : Array.isArray(data)
          ? data
          : [];
      const { summary, maxDownloadMbps, fibreAvailable } = summariseAvailability(rows);
      return {
        postcode: pc,
        summary,
        maxDownloadMbps,
        fibreAvailable,
        sourceUrl,
      };
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
  }

  return {
    postcode: pc,
    summary: ofcomNotOnRecordLine(),
    sourceUrl,
    error: lastErr || 'Ofcom coverage unavailable',
  };
}

export function ofcomNotOnRecordLine(): string {
  return `Not available from official records at the time of this report — check availability on Ofcom's broadband checker.`;
}
