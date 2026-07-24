/**
 * Land Registry comparable-sale selection — code owns the list.
 *
 * Selection rule (documented + unit-tested):
 * 1. Always include prior sales of the subject address (thisProperty.slice(1+) —
 *    excluding the most recent subject sale which is the report's price signal).
 * 2. Then same-street sales (nearbySameStreet), most recent first.
 * 3. Then same-postcode (nearbyPostcode), most recent first.
 * 4. Deduplicate by address+date+price; cap at MAX_COMPS (6).
 */

import type { LandRegistryLookup, LandRegistrySale } from './landRegistryLookup';
import { formatGbpAmount } from './landRegistryLookup';

export const MAX_COMPS = 6;

export type SelectedComp = {
  address: string;
  price: string;
  soldDate: string;
  similarity: string;
  propertyType?: string;
  isSubjectPriorSale?: boolean;
};

function saleKey(s: LandRegistrySale): string {
  return `${s.addressLabel}|${s.date}|${s.amount}`;
}

function toComp(s: LandRegistrySale, similarity: string, isSubjectPriorSale = false): SelectedComp {
  return {
    address: s.addressLabel,
    price: formatGbpAmount(s.amount),
    soldDate: s.date,
    similarity,
    propertyType: s.propertyType || undefined,
    isSubjectPriorSale,
  };
}

/**
 * Pure selection from a Land Registry lookup. Sales within each bucket are
 * assumed already ordered most-recent-first by the lookup.
 */
export function selectCompsFromLandRegistry(lr: LandRegistryLookup | null | undefined): SelectedComp[] {
  if (!lr) return [];
  const out: SelectedComp[] = [];
  const seen = new Set<string>();

  const push = (s: LandRegistrySale, similarity: string, isSubjectPriorSale = false) => {
    const key = saleKey(s);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(toComp(s, similarity, isSubjectPriorSale));
  };

  // Prior sales of the subject (skip index 0 = latest subject sale)
  for (const s of (lr.thisProperty || []).slice(1)) {
    if (out.length >= MAX_COMPS) break;
    push(
      s,
      s.propertyType
        ? `This property · prior sale · ${s.propertyType} (Land Registry)`
        : 'This property · prior sale (Land Registry)',
      true
    );
  }

  for (const s of [...(lr.nearbySameStreet || [])].sort((a, b) => b.date.localeCompare(a.date))) {
    if (out.length >= MAX_COMPS) break;
    push(
      s,
      s.propertyType
        ? `Same street · ${s.propertyType} (Land Registry)`
        : 'Same street (Land Registry)'
    );
  }

  for (const s of [...(lr.nearbyPostcode || [])].sort((a, b) => b.date.localeCompare(a.date))) {
    if (out.length >= MAX_COMPS) break;
    push(
      s,
      s.propertyType
        ? `Same postcode · ${s.propertyType} (Land Registry — different street)`
        : 'Same postcode (Land Registry — different street)'
    );
  }

  return out.slice(0, MAX_COMPS);
}

/** Apply code-selected comps onto analysis (before mechanical note rewriting). */
export function applySelectedComps(
  analysis: Record<string, unknown>,
  lr: LandRegistryLookup | null | undefined
): void {
  const comps = selectCompsFromLandRegistry(lr);
  if (comps.length === 0) return;
  analysis.comparableSales = comps.map((c) => ({
    address: c.address,
    price: c.price,
    soldDate: c.soldDate,
    similarity: c.similarity,
    propertyType: c.propertyType,
    isSubjectPriorSale: c.isSubjectPriorSale,
  }));
}
