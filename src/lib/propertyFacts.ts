/**
 * Authoritative property facts layer (EPC + Land Registry) + post-AI locks.
 * AI may narrate; it must not invent beds/baths/solds when facts are missing.
 */

import { lookupEpc, formatEpcBrief, epcSources, formatAgeBandDisplay, normalizeConstructionAgeBand, type EpcLookup } from './epcLookup';
import {
  lookupLandRegistrySales,
  formatLandRegistryBrief,
  landRegistrySources,
  formatGbpAmount,
  type LandRegistryLookup,
} from './landRegistryLookup';
import { shortenEpcCertificateUrl } from './epcLinkFormat';
import { applySelectedComps } from './selectComps';

export type ScrapFacts = {
  bedrooms?: string;
  bathrooms?: string;
  propertyType?: string;
  price?: string;
};

export type PropertyFacts = {
  address: string;
  epc: EpcLookup;
  landRegistry: LandRegistryLookup;
  brief: string;
  sources: { title: string; url: string }[];
};

export async function gatherPropertyFacts(address: string): Promise<PropertyFacts> {
  const cleaned = address.replace(/\s+/g, ' ').trim();
  const [epc, landRegistry] = await Promise.all([
    lookupEpc(cleaned),
    lookupLandRegistrySales(cleaned),
  ]);

  const brief = [formatEpcBrief(epc), '', formatLandRegistryBrief(landRegistry)].join('\n');
  const sources = [...epcSources(epc), ...landRegistrySources(landRegistry)];

  return { address: cleaned, epc, landRegistry, brief, sources };
}

function unknownBaths(): string {
  return 'Not on record — verify with a viewing or the listing';
}

function unknownBeds(): string {
  return 'Not on record — verify with a viewing or the listing';
}

function yearFromDate(iso: string): string {
  const y = iso.slice(0, 4);
  return /^\d{4}$/.test(y) ? y : iso || '—';
}

/**
 * Overwrite analysis fields with scrape + register facts so the PDF can't ship invented specs/solds.
 */
export function applyPropertyFactLocks(
  analysis: Record<string, unknown>,
  facts: PropertyFacts,
  scrap: ScrapFacts
): void {
  const epc = facts.epc.matched;
  const lrThis = facts.landRegistry.thisProperty;

  // --- Specs: scrape wins, else EPC type / rooms, else unknown (never keep naked invented baths) ---
  if (scrap.bedrooms?.trim()) {
    analysis.bedrooms = scrap.bedrooms.trim();
  } else if (epc?.habitableRooms) {
    analysis.bedrooms = `${epc.habitableRooms} habitable rooms (EPC — confirm bedroom count on viewing)`;
  } else {
    analysis.bedrooms = unknownBeds();
  }

  if (scrap.bathrooms?.trim()) {
    analysis.bathrooms = scrap.bathrooms.trim();
  } else {
    analysis.bathrooms = unknownBaths();
  }

  if (scrap.propertyType?.trim()) {
    analysis.propertyType = scrap.propertyType.trim();
  } else if (epc?.propertyType) {
    analysis.propertyType = [epc.propertyType, epc.builtForm].filter(Boolean).join(' / ');
  } else if (lrThis[0]?.propertyType) {
    analysis.propertyType = lrThis[0].propertyType;
  }

  if (scrap.price?.trim()) {
    analysis.price = scrap.price.trim();
  }

  // --- specs[] enrichment ---
  const specs = Array.isArray(analysis.specs)
    ? ([...analysis.specs] as { label?: string; value?: string }[])
    : [];
  const upsert = (label: string, value: string) => {
    if (!value) return;
    const i = specs.findIndex((s) => String(s.label || '').toLowerCase() === label.toLowerCase());
    if (i >= 0) specs[i] = { label, value };
    else specs.push({ label, value });
  };
  if (epc) {
    // Scrub invalid age bands (e.g. cert-number fragments) before they reach specs/insights
    if (epc.constructionAgeBand && !normalizeConstructionAgeBand(epc.constructionAgeBand)) {
      epc.constructionAgeBand = '';
    } else if (epc.constructionAgeBand) {
      epc.constructionAgeBand = normalizeConstructionAgeBand(epc.constructionAgeBand) || '';
    }
  }
  if (epc?.currentRating) {
    upsert(
      'EPC rating',
      epc.potentialRating ? `${epc.currentRating} (potential ${epc.potentialRating})` : epc.currentRating
    );
  }
  if (epc?.floorAreaSqm) upsert('Floor area', `${epc.floorAreaSqm} sqm · EPC register`);
  if (epc?.constructionAgeBand) {
    upsert('Construction age', formatAgeBandDisplay(epc.constructionAgeBand));
  }
  if (epc?.wallsDescription) upsert('Walls (EPC)', epc.wallsDescription);
  if (epc?.roofDescription) upsert('Roof (EPC)', epc.roofDescription);
  if (epc?.windowsDescription) upsert('Windows (EPC)', epc.windowsDescription);
  if (epc?.floorDescription) upsert('Floor (EPC)', epc.floorDescription);
  if (epc?.heating || epc?.mainFuel) {
    const heat = [epc.heating, epc.mainFuel]
      .filter(Boolean)
      .map((s) => String(s).replace(/\s+/g, ' ').trim())
      .filter((s) => s && !/^main heating$/i.test(s))
      .join(' / ');
    if (heat) upsert('Main heating', heat);
  }
  if (epc?.improvements) upsert('EPC improvements', epc.improvements);
  if (epc?.lodgementDate) upsert('EPC lodged', epc.lodgementDate);
  upsert('Bathrooms', String(analysis.bathrooms));
  upsert('Bedrooms / rooms', String(analysis.bedrooms));
  analysis.specs = specs;

  // --- due diligence EPC ---
  const dd =
    analysis.dueDiligence && typeof analysis.dueDiligence === 'object'
      ? ({ ...(analysis.dueDiligence as Record<string, unknown>) } as Record<string, unknown>)
      : {};
  if (epc) {
    dd.epcAndEnergy = [
      `EPC band ${epc.currentRating || 'unknown'}`,
      epc.potentialRating ? `potential ${epc.potentialRating}` : null,
      epc.constructionAgeBand
        ? `age band ${formatAgeBandDisplay(epc.constructionAgeBand)}`
        : null,
      epc.floorAreaSqm ? `${epc.floorAreaSqm} m²` : null,
      epc.wallsDescription ? `walls: ${epc.wallsDescription}` : null,
      epc.heating && !/^main heating$/i.test(String(epc.heating).trim())
        ? `heating: ${epc.heating}`
        : null,
      epc.certificateUrl
        ? `View EPC certificate on gov.uk (${shortenEpcCertificateUrl(epc.certificateUrl)})`
        : null,
    ]
      .filter(Boolean)
      .join(' — ');
    if (epc.certificateUrl) dd.epcCertificateUrl = epc.certificateUrl;
  } else if (!dd.epcAndEnergy || /check the epc register/i.test(String(dd.epcAndEnergy))) {
    dd.epcAndEnergy =
      'No EPC on register — request from vendor. Verify on gov.uk Find an energy certificate.';
  }

  // --- tenure from Land Registry Price Paid estateType (10.8b) ---
  const estate = lrThis.find((s) => s.estateType)?.estateType;
  if (estate === 'freehold' || estate === 'leasehold') {
    const label = estate.charAt(0).toUpperCase() + estate.slice(1);
    dd.tenureAndLegal =
      estate === 'freehold'
        ? `Freehold (HM Land Registry Price Paid). Confirm title restrictions with a conveyancer.`
        : `Leasehold (HM Land Registry Price Paid). Confirm remaining term, ground rent and service charge with a conveyancer.`;
    upsert('Tenure', label);

    // Structural lock — risk/leasehold card must not say "not on record" when tenure is known
    const risk =
      analysis.riskAnalysis && typeof analysis.riskAnalysis === 'object'
        ? ({ ...(analysis.riskAnalysis as Record<string, unknown>) } as Record<string, unknown>)
        : {};
    risk.leaseholdIssues =
      estate === 'freehold'
        ? 'Freehold title (HM Land Registry Price Paid) — no leasehold ground rent or service charge applies. Confirm any title restrictions with a conveyancer.'
        : 'Leasehold (HM Land Registry Price Paid) — confirm remaining term, ground rent and service charge with a conveyancer before offering.';
    analysis.riskAnalysis = risk;
    const tones =
      analysis.riskTones && typeof analysis.riskTones === 'object'
        ? ({ ...(analysis.riskTones as Record<string, unknown>) } as Record<string, unknown>)
        : {};
    tones.leaseholdIssues = estate === 'freehold' ? 'positive' : 'caution';
    analysis.riskTones = tones;
  } else if (
    !dd.tenureAndLegal ||
    /confirm freehold|not on record|verify with a conveyancer/i.test(String(dd.tenureAndLegal))
  ) {
    dd.tenureAndLegal =
      'Not on record — confirm freehold/leasehold, remaining term and title restrictions with a conveyancer.';
  }

  analysis.dueDiligence = dd;

  // --- sold history for this property from LR ---
  if (lrThis.length > 0) {
    analysis.soldHistory = lrThis.slice(0, 10).map((s) => ({
      year: yearFromDate(s.date),
      price: formatGbpAmount(s.amount),
      source: 'HM Land Registry Price Paid',
      description: `${s.addressLabel}${s.propertyType ? ` — ${s.propertyType}` : ''}`,
    }));
  } else {
    // Don't leave invented this-address history — clear thin/fake entries if we have no LR match
    const existing = Array.isArray(analysis.soldHistory) ? analysis.soldHistory : [];
    if (existing.length === 0) {
      analysis.soldHistory = [
        {
          year: '—',
          price: 'Not found',
          source: 'HM Land Registry Price Paid',
          description:
            'Not on record — verify with HM Land Registry Price Paid for this exact address.',
        },
      ];
    }
  }

  // --- comps from LR: same street → postcode; max 6; include subject priors ---
  applySelectedComps(analysis, facts.landRegistry);

  // --- market evidence nudge when we have LR this-property sales ---
  const me =
    analysis.marketEvidence && typeof analysis.marketEvidence === 'object'
      ? ({ ...(analysis.marketEvidence as Record<string, unknown>) } as Record<string, unknown>)
      : {};
  if (lrThis.length > 0) {
    const latest = lrThis[0]!;
    const prior = lrThis.length > 1 ? lrThis[1] : null;
    me.askingVsSoldEvidence = [
      `Land Registry: this property last sold for ${formatGbpAmount(latest.amount)} on ${latest.date}`,
      prior ? `previous LR sale ${formatGbpAmount(prior.amount)} on ${prior.date}` : null,
      scrap.price ? `current asking context: ${scrap.price}` : 'no live asking price on record for this run',
    ]
      .filter(Boolean)
      .join(' — ');
  }
  if (epc?.floorAreaSqm && (scrap.price || lrThis[0])) {
    const priceNum = Number(String(scrap.price || '').replace(/[^\d.]/g, ''));
    const area = Number(epc.floorAreaSqm);
    if (Number.isFinite(priceNum) && priceNum > 0 && Number.isFinite(area) && area > 0) {
      const perSqm = Math.round(priceNum / area);
      me.pricePerSqmOrSqft = `About £${perSqm.toLocaleString('en-GB')}/m² using asking ${scrap.price} ÷ EPC floor area ${epc.floorAreaSqm} m² (indicative only).`;
    } else if (lrThis[0] && Number.isFinite(area) && area > 0) {
      const perSqm = Math.round(lrThis[0].amount / area);
      me.pricePerSqmOrSqft = `About £${perSqm.toLocaleString('en-GB')}/m² using last LR sale ${formatGbpAmount(lrThis[0].amount)} ÷ EPC floor area ${epc.floorAreaSqm} m² (indicative only).`;
    }
  }
  analysis.marketEvidence = me;
}
