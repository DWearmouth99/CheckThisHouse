/**
 * Ideal Postcodes — UK address autocomplete (server-side only).
 * Docs: https://docs.ideal-postcodes.co.uk/docs/api/find-address/
 */

const API_BASE = 'https://api.ideal-postcodes.co.uk/v1';

export type AddressSuggestion = {
  id: string;
  suggestion: string;
};

export type ResolvedAddress = {
  formatted: string;
  line1: string;
  line2: string;
  line3: string;
  postTown: string;
  postcode: string;
  county?: string;
};

function getApiKey(): string {
  const raw = process.env.IDEAL_POSTCODES_API_KEY || '';
  return raw.trim().replace(/^["']|["']$/g, '');
}

export function hasIdealPostcodesKey(): boolean {
  const key = getApiKey();
  return key.startsWith('ak_') && key.length > 12 && !key.includes('REPLACE');
}

async function idealFetch(pathAndQuery: string): Promise<any> {
  const key = getApiKey();
  if (!hasIdealPostcodesKey()) {
    throw Object.assign(new Error('Address lookup is not configured.'), { status: 503 });
  }
  const sep = pathAndQuery.includes('?') ? '&' : '?';
  const url = `${API_BASE}${pathAndQuery}${sep}api_key=${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      body?.message ||
      body?.error ||
      `Address lookup failed (${res.status}).`;
    throw Object.assign(new Error(String(msg)), { status: res.status >= 500 ? 502 : res.status });
  }
  return body;
}

/** Step 1 — suggestions (not billed). */
export async function suggestAddresses(query: string): Promise<AddressSuggestion[]> {
  const q = query.trim();
  if (q.length < 3) return [];

  const body = await idealFetch(
    `/autocomplete/addresses?query=${encodeURIComponent(q)}&limit=8`
  );

  const hits = body?.result?.hits || body?.result?.suggestions || body?.hits || [];
  if (!Array.isArray(hits)) return [];

  return hits
    .map((h: any) => {
      const id = String(h.id || h.udprn || h.umprn || '').trim();
      const suggestion = String(h.suggestion || h.address || h.summary || '').trim();
      if (!id || !suggestion) return null;
      return { id, suggestion };
    })
    .filter(Boolean)
    .slice(0, 8) as AddressSuggestion[];
}

/** Step 2 — resolve selection (billed lookup). */
export async function resolveAddress(addressId: string): Promise<ResolvedAddress> {
  const id = addressId.trim();
  if (!id) {
    throw Object.assign(new Error('Missing address id.'), { status: 400 });
  }

  const encodedId = encodeURIComponent(id);
  const body = await idealFetch(`/autocomplete/addresses/${encodedId}/gbr`);
  const r = body?.result || body;

  const line1 = String(r.line_1 || r.line1 || '').trim();
  const line2 = String(r.line_2 || r.line2 || '').trim();
  const line3 = String(r.line_3 || r.line3 || '').trim();
  const postTown = String(r.post_town || r.postTown || r.town || '').trim();
  const postcode = String(r.postcode || '').trim().toUpperCase();
  const county = String(r.county || '').trim() || undefined;

  const parts = [line1, line2, line3, postTown, county, postcode].filter(Boolean);
  const formatted = parts.join(', ');

  if (!formatted || !postcode) {
    throw Object.assign(new Error('Could not resolve that address. Try another suggestion.'), {
      status: 502,
    });
  }

  return { formatted, line1, line2, line3, postTown, postcode, county };
}
