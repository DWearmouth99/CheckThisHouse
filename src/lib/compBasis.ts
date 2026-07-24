/**
 * Comparable sale notes — built mechanically from EPC + Land Registry (no LLM).
 *
 * Templates (Part 6):
 * - EPC match:  "{floor_area} sqm {property_type}, sold {Mon YYYY} (£{psm}/sqm)"
 * - No match:   "{LR property type}, sold {Mon YYYY}"
 * - Subject:    "This property's previous sale — {Mon YYYY}"
 *
 * "Reason for price difference not established" cannot be emitted — it is in
 * bannedTerms and no code path in this builder produces it.
 */

import {
  enrichFromCertificateHtml,
  fetchEpcCertificatesForPostcode,
  matchCompToEpcCertificates,
  type EpcMatchDecision,
  type EpcRecord,
} from './epcLookup';
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

const UK_POSTCODE_RE =
  /\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i;

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

export function formatSoldMonth(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})/);
  if (!m) return iso || '—';
  const d = new Date(Number(m[1]), Number(m[2]) - 1, 1);
  return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

/**
 * Mechanical note — only the three templates. Never emits banned phrases.
 */
export function buildMechanicalCompNote(opts: {
  isSubjectPriorSale?: boolean;
  floorAreaSqm?: string | null;
  /** EPC property type when matched; else LR type for no-match template */
  propertyType?: string | null;
  soldDate: string;
  price: string;
}): string {
  const when = formatSoldMonth(opts.soldDate);
  if (opts.isSubjectPriorSale) {
    return `This property's previous sale — ${when}`;
  }

  const area = String(opts.floorAreaSqm || '').trim();
  const type = String(opts.propertyType || '').trim();
  const priceN = parseMoney(opts.price);
  const areaN = area ? parseFloat(area) : NaN;

  if (area && Number.isFinite(areaN) && areaN > 0 && type) {
    const psm = Math.round((priceN || 0) / areaN);
    if (priceN && priceN > 0) {
      return `${area} sqm ${type}, sold ${when} (£${psm.toLocaleString('en-GB')}/sqm)`;
    }
    return `${area} sqm ${type}, sold ${when}`;
  }

  if (type) return `${type}, sold ${when}`;
  return `sold ${when}`;
}

function extractPostcode(...candidates: (string | null | undefined)[]): string | null {
  for (const c of candidates) {
    const m = String(c || '').match(UK_POSTCODE_RE);
    if (m) return m[1]!.toUpperCase().replace(/\s+/g, ' ').trim();
  }
  return null;
}

/**
 * Enrich already-selected comps (max 6 from selectComps) with EPC floor-area notes.
 * One postcode EPC fetch; match each comp by normalised first address line.
 */
export async function buildMechanicalComps(opts: {
  comps: unknown;
  subjectAddress?: string;
  subjectFloorAreaSqm?: string | null;
  /** @deprecated selection owns priors — ignored except for postcode fallback */
  subjectPriorSales?: { address: string; price: string; soldDate: string }[];
  /** Subject / sector postcode when comp address labels omit it */
  postcode?: string | null;
  /** Injected certificates (tests) — skips network */
  epcCertificates?: EpcRecord[] | null;
}): Promise<{
  comps: ComparableSaleEnforced[];
  epcHitRate: number;
  matchDecisions: EpcMatchDecision[];
}> {
  const raw = Array.isArray(opts.comps) ? opts.comps.slice(0, 6) : [];
  const postcode =
    opts.postcode ||
    extractPostcode(
      opts.subjectAddress,
      ...raw.map((c) => String((c as { address?: string })?.address || '')),
      ...(opts.subjectPriorSales || []).map((s) => s.address)
    );

  let certificates: EpcRecord[] = opts.epcCertificates || [];
  if (!opts.epcCertificates && postcode) {
    try {
      certificates = await fetchEpcCertificatesForPostcode(postcode);
    } catch (err: any) {
      console.warn('[comps] EPC postcode fetch failed:', err?.message || err);
      certificates = [];
    }
  }

  const matchDecisions: EpcMatchDecision[] = [];
  const rows: ComparableSaleEnforced[] = [];

  for (const c of raw) {
    const row = (c && typeof c === 'object' ? c : {}) as Record<string, unknown>;
    const address = String(row.address || '—');
    const price = String(row.price || '—');
    const soldDate = String(row.soldDate || '—');
    const isSubjectPriorSale = Boolean(row.isSubjectPriorSale);
    const lrType = String(row.propertyType || '').trim();

    let floorAreaSqm = '';
    let propertyType = lrType;
    let basis: CompBasis = 'date';

    if (isSubjectPriorSale) {
      matchDecisions.push({
        compAddress: address,
        matched: false,
        reason: 'subject prior sale — EPC match skipped (dedicated note template)',
      });
      console.log(`[comps/epc] SKIP-SUBJECT ${address} → subject prior sale template`);
    } else {
      const { cert: matchedRaw, decision } = matchCompToEpcCertificates(address, certificates);
      matchDecisions.push(decision);
      let cert = matchedRaw;
      // Search API often omits TOTAL_FLOOR_AREA — enrich from certificate HTML (same as subject)
      if (cert && !cert.floorAreaSqm) {
        try {
          cert = await enrichFromCertificateHtml(cert);
        } catch (err: any) {
          console.warn(
            `[comps/epc] enrich failed for ${address}:`,
            err?.message || err
          );
        }
      }
      if (cert?.floorAreaSqm) {
        floorAreaSqm = String(cert.floorAreaSqm).trim();
        propertyType = (cert.propertyType || lrType || 'property').trim();
        basis = 'size';
      } else if (cert && !cert.floorAreaSqm) {
        // Matched but no floor area — treat as no-match for £/sqm template
        propertyType = (cert.propertyType || lrType).trim();
        console.log(
          `[comps/epc] MATCH-NO-AREA ${address} → cert "${cert.address}" lacks floor area`
        );
      }
    }

    const note = buildMechanicalCompNote({
      isSubjectPriorSale,
      floorAreaSqm: isSubjectPriorSale ? null : floorAreaSqm,
      propertyType: isSubjectPriorSale ? null : propertyType,
      soldDate,
      price,
    });

    rows.push({
      address,
      price,
      soldDate,
      similarity: note,
      basis,
      note,
      floorAreaSqm: floorAreaSqm || undefined,
      propertyType: propertyType || undefined,
      isSubjectPriorSale,
    });
  }

  const matchable = rows.filter((r) => !r.isSubjectPriorSale);
  const withSqm = matchable.filter((r) => r.floorAreaSqm).length;
  const epcHitRate = matchable.length ? withSqm / matchable.length : 0;
  console.log(
    `[comps] mechanical notes: ${rows.length} rows, EPC floor-area hit rate ${(epcHitRate * 100).toFixed(0)}%`
  );

  return { comps: rows, epcHitRate, matchDecisions };
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
      similarity: String(row.similarity || row.note || `sold ${row.soldDate || '—'}`),
      basis: 'date' as CompBasis,
      note: String(row.note || ''),
    };
  });
}

export { formatGbpFull };
