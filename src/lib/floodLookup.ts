/**
 * Environment Agency flood risk bandings via planning.data.gov.uk flood-risk-zone
 * (EA Flood Zones used in planning). Free, no key.
 *
 * Mapping: no Zone 2/3 polygon → Flood Zone 1 (Very Low for rivers & sea).
 * Surface-water extent is not in this open dataset — we do not invent it.
 */

import { extractPostcode } from './addressMatch';

export type FloodLookup = {
  riversAndSea: string;
  surfaceWater: string | null;
  floodZone: string;
  sourceUrl: string;
  fetchedAt: string;
  bandingLabel: string;
  /** Context-only string for LLM interpretation (EA/planning.data response only) */
  llmContext: string;
  raw: Record<string, unknown>;
};

function zoneFromReference(ref: string): string | null {
  const m = String(ref).match(/\/([123])\s*$/);
  if (!m) return null;
  return m[1]!;
}

function riversBandFromZone(zone: string): string {
  if (zone === '3') return 'High';
  if (zone === '2') return 'Medium';
  return 'Very Low';
}

async function geocode(postcode: string): Promise<{ lat: number; lng: number } | null> {
  const compact = postcode.replace(/\s+/g, '');
  const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(compact)}`, {
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const lat = data?.result?.latitude;
  const lng = data?.result?.longitude;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  return { lat, lng };
}

export async function lookupFloodForAddress(address: string): Promise<FloodLookup> {
  const postcode = extractPostcode(address) || '';
  const fetchedAt = new Date().toISOString().slice(0, 10);
  const sourceUrl = 'https://www.planning.data.gov.uk/dataset/flood-risk-zone';
  const govCheck = 'https://check-long-term-flood-risk.service.gov.uk/risk';

  const emptyRaw: Record<string, unknown> = { note: 'no geocode' };
  if (!postcode) {
    return {
      riversAndSea: 'Not on record',
      surfaceWater: null,
      floodZone: 'unknown',
      sourceUrl: govCheck,
      fetchedAt,
      bandingLabel: 'Flood bandings not on record — verify on GOV.UK long-term flood risk.',
      llmContext: 'No postcode available for flood lookup.',
      raw: emptyRaw,
    };
  }

  try {
    const geo = await geocode(postcode);
    if (!geo) {
      return {
        riversAndSea: 'Not on record',
        surfaceWater: null,
        floodZone: 'unknown',
        sourceUrl: govCheck,
        fetchedAt,
        bandingLabel: 'Flood bandings not on record — verify on GOV.UK long-term flood risk.',
        llmContext: 'Geocode failed for flood lookup.',
        raw: { postcode },
      };
    }

    const url = `https://www.planning.data.gov.uk/entity.json?longitude=${geo.lng}&latitude=${geo.lat}&dataset=flood-risk-zone&limit=20`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    });
    const raw = (await res.json()) as Record<string, unknown>;
    const entities = Array.isArray(raw.entities) ? (raw.entities as { reference?: string }[]) : [];
    const zones = entities
      .map((e) => zoneFromReference(String(e.reference || '')))
      .filter((z): z is string => !!z);
    const highest = zones.includes('3') ? '3' : zones.includes('2') ? '2' : '1';
    const riversAndSea = riversBandFromZone(highest);
    // Surface water not in planning.data flood-risk-zone — do not invent
    const surfaceWater: string | null = null;

    const bandingLabel = [
      `rivers & sea: ${riversAndSea}`,
      surfaceWater ? `surface water: ${surfaceWater}` : 'surface water: not returned by open flood-risk-zone API — verify on GOV.UK',
      `(Flood Zone ${highest}; planning.data.gov.uk; fetched ${fetchedAt})`,
    ].join('; ');

    const llmContext = `VERIFIED EA/PLANNING FLOOD BANDINGS ONLY (do not invent rivers, becks, or place-names):\n${bandingLabel}\nEntity refs: ${entities
      .map((e) => e.reference)
      .filter(Boolean)
      .slice(0, 8)
      .join(', ') || 'none (Zone 1)'}`;

    console.log(`[flood] ${postcode} ${bandingLabel}`);

    return {
      riversAndSea,
      surfaceWater,
      floodZone: highest,
      sourceUrl,
      fetchedAt,
      bandingLabel,
      llmContext,
      raw: { count: raw.count, refs: entities.map((e) => e.reference), url },
    };
  } catch (err: any) {
    console.warn('[flood]', err?.message || err);
    return {
      riversAndSea: 'Not on record',
      surfaceWater: null,
      floodZone: 'unknown',
      sourceUrl: govCheck,
      fetchedAt,
      bandingLabel: 'Flood bandings not on record — verify on GOV.UK long-term flood risk.',
      llmContext: 'Flood lookup failed.',
      raw: { error: String(err?.message || err) },
    };
  }
}
