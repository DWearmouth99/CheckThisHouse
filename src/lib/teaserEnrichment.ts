/**
 * Lightweight free facts for the paywall teaser (no Gemini).
 * Flood + Land Registry only — keep snappy for the preview modal.
 */

import { lookupFloodForAddress } from './floodLookup';
import { formatGbpAmount, lookupLandRegistrySales } from './landRegistryLookup';

export type TeaserPreviewFacts = {
  floodRivers: string | null;
  floodLabel: string | null;
  lastSoldPrice: string | null;
  lastSoldDate: string | null;
  nearbySoldSample: { address: string; price: string; date: string }[];
  unlockedBullets: string[];
};

const EMPTY: TeaserPreviewFacts = {
  floodRivers: null,
  floodLabel: null,
  lastSoldPrice: null,
  lastSoldDate: stringDate(null),
  nearbySoldSample: [],
  unlockedBullets: [],
};

function stringDate(_n: null): string | null {
  return null;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    p.then((v) => v as T | null).catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

function formatSoldDate(raw?: string | null): string | null {
  if (!raw) return null;
  const d = new Date(raw.slice(0, 10) + 'T12:00:00Z');
  if (!Number.isFinite(d.getTime())) return raw.slice(0, 7);
  return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

/**
 * Enrich a teaser with free public-register snippets the customer can see before paying.
 */
export async function enrichTeaserPreview(address: string): Promise<TeaserPreviewFacts> {
  if (!address?.trim()) return { ...EMPTY, lastSoldDate: null };

  const [flood, lr] = await Promise.all([
    withTimeout(lookupFloodForAddress(address), 7000),
    withTimeout(lookupLandRegistrySales(address), 8000),
  ]);

  const bullets: string[] = [];
  let floodRivers: string | null = null;
  let floodLabel: string | null = null;
  if (flood && flood.riversAndSea && flood.riversAndSea !== 'Not on record') {
    floodRivers = flood.riversAndSea;
    floodLabel = flood.bandingLabel?.split('.')[0] || `Rivers & sea: ${flood.riversAndSea}`;
    bullets.push(`Flood (rivers & sea): ${flood.riversAndSea}`);
  }

  let lastSoldPrice: string | null = null;
  let lastSoldDate: string | null = null;
  if (lr?.thisProperty?.length) {
    const latest = lr.thisProperty[0]!;
    lastSoldPrice = formatGbpAmount(latest.amount);
    lastSoldDate = formatSoldDate(latest.date);
    bullets.push(
      `Last sold${lastSoldDate ? ` ${lastSoldDate}` : ''}: ${lastSoldPrice} (Land Registry)`
    );
  }

  const nearbySoldSample = (lr?.nearby || [])
    .slice(0, 3)
    .map((s) => ({
      address: s.addressLabel || [s.paon, s.street].filter(Boolean).join(' '),
      price: formatGbpAmount(s.amount),
      date: formatSoldDate(s.date) || '—',
    }))
    .filter((s) => s.address && s.price);

  if (nearbySoldSample.length && !lastSoldPrice) {
    bullets.push(`${nearbySoldSample.length} recent solds nearby from Land Registry`);
  } else if (nearbySoldSample.length) {
    bullets.push(`${nearbySoldSample.length} nearby solds ready for the full comps table`);
  }

  if (!bullets.length) {
    bullets.push('We’ll pull sold history, flood, schools, crime and value bands into your full PDF');
  }

  return {
    floodRivers,
    floodLabel,
    lastSoldPrice,
    lastSoldDate,
    nearbySoldSample,
    unlockedBullets: bullets.slice(0, 5),
  };
}
