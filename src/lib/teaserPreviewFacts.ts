/**
 * Free (non-AI) facts for the teaser preview — show real value before payment.
 */

import { lookupFloodForAddress } from './floodLookup';
import { formatGbpAmount, lookupLandRegistrySales } from './landRegistryLookup';
import { resolveReportRegion } from './ukCoverage';

export type TeaserPreviewFacts = {
  floodRivers: string | null;
  floodZone: string | null;
  lastSoldPrice: string | null;
  lastSoldDate: string | null;
  nearbySoldSample: { address: string; price: string; date: string }[];
  unlockedHighlights: string[];
};

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise.then((v) => v as T | null).catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

/**
 * Pull a few official free signals for the free preview modal.
 * Never invents figures — empty fields stay empty.
 */
export async function buildTeaserPreviewFacts(address: string): Promise<TeaserPreviewFacts> {
  const region = resolveReportRegion(address);
  const unlockedHighlights: string[] = [];
  let floodRivers: string | null = null;
  let floodZone: string | null = null;
  let lastSoldPrice: string | null = null;
  let lastSoldDate: string | null = null;
  const nearbySoldSample: TeaserPreviewFacts['nearbySoldSample'] = [];

  const floodP = withTimeout(lookupFloodForAddress(address), 7000);
  const lrP =
    region === 'england' || region === 'wales'
      ? withTimeout(lookupLandRegistrySales(address), 8000)
      : Promise.resolve(null);

  const [flood, lr] = await Promise.all([floodP, lrP]);

  if (flood && flood.riversAndSea && !/not on record|unknown/i.test(flood.riversAndSea)) {
    floodRivers = flood.riversAndSea;
    floodZone = flood.floodZone && flood.floodZone !== 'unknown' ? flood.floodZone : null;
    unlockedHighlights.push(
      floodZone && floodZone !== '1'
        ? `Flood (rivers & sea): ${floodRivers} — Zone ${floodZone}`
        : `Flood (rivers & sea): ${floodRivers}`
    );
  }

  if (lr?.thisProperty?.length) {
    const latest = lr.thisProperty[0]!;
    lastSoldPrice = formatGbpAmount(latest.amount);
    lastSoldDate = latest.date || null;
    unlockedHighlights.push(
      lastSoldDate
        ? `This property last sold for ${lastSoldPrice} (${lastSoldDate})`
        : `This property last sold for ${lastSoldPrice}`
    );
  }

  if (lr) {
    const nearby = (lr.nearbySameStreet?.length ? lr.nearbySameStreet : lr.nearbyPostcode || []).slice(
      0,
      3
    );
    for (const s of nearby) {
      nearbySoldSample.push({
        address: s.addressLabel || 'Nearby sale',
        price: formatGbpAmount(s.amount),
        date: s.date || '—',
      });
    }
    if (nearbySoldSample.length) {
      unlockedHighlights.push(
        `${nearbySoldSample.length} recent nearby sold${nearbySoldSample.length === 1 ? '' : 's'} from Land Registry`
      );
    }
  }

  if (region === 'scotland') {
    unlockedHighlights.push(
      'Scottish sources: Registers of Scotland solds, Scottish EPC and local planning where public'
    );
  } else if (region === 'northern_ireland') {
    unlockedHighlights.push('Northern Ireland public sources for solds, schools and area context where available');
  }

  return {
    floodRivers,
    floodZone,
    lastSoldPrice,
    lastSoldDate,
    nearbySoldSample,
    unlockedHighlights,
  };
}
