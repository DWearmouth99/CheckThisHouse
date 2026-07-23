/**
 * Comparable sale notes — built mechanically from EPC + Land Registry (no LLM speculation).
 */

import { lookupEpcForAddressCached, type EpcRecord } from './epcLookup';
import { formatGbpFull } from './deterministicForecasts';

export type CompBasis = 'size' | 'date' | 'planning' | 'listing' | 'unknown';

export type ComparableSaleEnforced = {
  address: string;
  price: string;
  soldDate: string;
  similarity: string;
  basis: CompBasis;
  note: string;
  floorAreaSqm?: string;
  propertyType?: string;
  isSubjectPriorSale?: boolean;
};

function parseMoney(raw?: string | null): number | null {
  if (!raw) return null;
  const pound = String(raw).match(/£\s*([\d,]+(?:\.\d+)?)/);
  if (pound) {
    const n = parseFloat(pound[1]!.replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  const n = parseFloat(String(raw).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function formatSoldMonth(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})/);
  if (!m) return iso || '—';
  const d = new Date(Number(m[1]), Number(m[2]) - 1, 1);
  return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

function mechanicalNote(opts: {
  floorAreaSqm?: string;
  propertyType?: string;
  soldDate: string;
  price: string;
  subjectFloorArea?: string | null;
}): string {
  const when = formatSoldMonth(opts.soldDate);
  const type = (opts.propertyType || '').trim();
  const area = (opts.floorAreaSqm || '').trim();
  const priceN = parseMoney(opts.price);
  const areaN = area ? parseFloat(area) : NaN;
  let note = '';
  if (area && type) note = `${area} sqm ${type}, sold ${when}`;
  else if (area) note = `${area} sqm, sold ${when}`;
  else if (type) note = `${type}, sold ${when}`;
  else note = `Sold ${when}`;

  if (priceN && Number.isFinite(areaN) && areaN > 0) {
    const psm = Math.round(priceN / areaN);
    note += ` (£${psm.toLocaleString('en-GB')}/sqm)`;
  }
  return note;
}

/**
 * Build up to 6 comps: most recent first; always keep subject prior sales + closest-by-size.
 */
export async function buildMechanicalComps(opts: {
  comps: unknown;
  subjectAddress?: string;
  subjectFloorAreaSqm?: string | null;
  subjectPriorSales?: { address: string; price: string; soldDate: string }[];
}): Promise<{ comps: ComparableSaleEnforced[]; epcHitRate: number }> {
  const raw = Array.isArray(opts.comps) ? opts.comps : [];
  const rows: ComparableSaleEnforced[] = [];

  for (const c of raw) {
    const row = (c && typeof c === 'object' ? c : {}) as Record<string, unknown>;
    const address = String(row.address || '—');
    const price = String(row.price || '—');
    const soldDate = String(row.soldDate || '—');
    let epc: EpcRecord | null = null;
    try {
      epc = await lookupEpcForAddressCached(address);
    } catch {
      epc = null;
    }
    const floorAreaSqm = epc?.floorAreaSqm || '';
    const propertyType = epc?.propertyType || String(row.propertyType || '') || '';
    const note = mechanicalNote({
      floorAreaSqm,
      propertyType,
      soldDate,
      price,
      subjectFloorArea: opts.subjectFloorAreaSqm,
    });
    rows.push({
      address,
      price,
      soldDate,
      similarity: note,
      basis: floorAreaSqm ? 'size' : 'date',
      note,
      floorAreaSqm: floorAreaSqm || undefined,
      propertyType: propertyType || undefined,
      isSubjectPriorSale: false,
    });
  }

  // Inject subject prior sales if provided
  for (const s of opts.subjectPriorSales || []) {
    if (rows.some((r) => r.soldDate === s.soldDate && r.price === s.price)) continue;
    rows.push({
      address: s.address,
      price: s.price,
      soldDate: s.soldDate,
      similarity: mechanicalNote({
        floorAreaSqm: opts.subjectFloorAreaSqm || '',
        propertyType: 'This property',
        soldDate: s.soldDate,
        price: s.price,
      }),
      basis: opts.subjectFloorAreaSqm ? 'size' : 'date',
      note: '',
      floorAreaSqm: opts.subjectFloorAreaSqm || undefined,
      isSubjectPriorSale: true,
    });
  }

  // Sort most recent first
  rows.sort((a, b) => String(b.soldDate).localeCompare(String(a.soldDate)));

  const subjectArea = opts.subjectFloorAreaSqm ? parseFloat(opts.subjectFloorAreaSqm) : NaN;
  let closestBySize: ComparableSaleEnforced | null = null;
  if (Number.isFinite(subjectArea)) {
    let best = Infinity;
    for (const r of rows) {
      if (r.isSubjectPriorSale) continue;
      const a = r.floorAreaSqm ? parseFloat(r.floorAreaSqm) : NaN;
      if (!Number.isFinite(a)) continue;
      const d = Math.abs(a - subjectArea);
      if (d < best) {
        best = d;
        closestBySize = r;
      }
    }
  }

  const selected: ComparableSaleEnforced[] = [];
  const pushUnique = (r: ComparableSaleEnforced) => {
    if (selected.some((x) => x.address === r.address && x.soldDate === r.soldDate)) return;
    if (selected.length >= 6) return;
    selected.push(r);
  };

  for (const r of rows.filter((x) => x.isSubjectPriorSale)) pushUnique(r);
  if (closestBySize) pushUnique(closestBySize);
  for (const r of rows) pushUnique(r);

  const withSqm = selected.filter((r) => r.floorAreaSqm).length;
  const epcHitRate = selected.length ? withSqm / selected.length : 0;
  console.log(
    `[comps] mechanical notes: ${selected.length} rows, EPC floor-area hit rate ${(epcHitRate * 100).toFixed(0)}%`
  );

  return { comps: selected.slice(0, 6), epcHitRate };
}

/** @deprecated — use buildMechanicalComps */
export function enforceComparableNotes(comps: unknown): ComparableSaleEnforced[] {
  if (!Array.isArray(comps)) return [];
  return comps.slice(0, 6).map((c) => {
    const row = (c && typeof c === 'object' ? c : {}) as Record<string, unknown>;
    return {
      address: String(row.address || '—'),
      price: String(row.price || '—'),
      soldDate: String(row.soldDate || '—'),
      similarity: String(row.similarity || row.note || `Sold ${row.soldDate || '—'}`),
      basis: 'date' as CompBasis,
      note: String(row.note || ''),
    };
  });
}

export { formatGbpFull };
