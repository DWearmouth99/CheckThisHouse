/**
 * Provider-agnostic post-LLM finaliser.
 * Gemini and OpenAI must both return analysis only via this function.
 */

import { applyStampDutyEstimate, estimateTransactionTax, detectUkNation } from './ukPropertyTax';
import { refineRiskTones } from './refineRiskTones';
import { applyPropertyFactLocks, type PropertyFacts, type ScrapFacts } from './propertyFacts';
import {
  applyReportWritingEngine,
  detectReportMode,
  type ReportModeContext,
} from './reportWritingEngine';
import { sanitizeOfferStrategy } from './sanitizeOfferStrategy';
import { enforceReportPipeline } from './enforceReportPipeline';
import { applySelectedComps } from './selectComps';
import { computeGrowthAssumptionsFromSales } from './growthFromLandRegistry';
import { applyGiasSchools } from './giasSchools';
import { applyNaptanTransport } from './naptanTransport';
import { extractPostcode } from './addressMatch';
import {
  applyLivingHereBlocks,
  generateLivingHereWithGrounding,
  type LivingHereLlmFn,
} from './livingHere';
import {
  livingHereFromRecorded,
  lookupLivingHerePois,
  type LivingHereBlocks,
  type PoiRecord,
} from './poiLookup';
import type { CrimeLookup } from './policeUkLookup';
import type { FloodLookup } from './floodLookup';
import type { PlanningLookupResult } from './planningLookup';
import type { LandRegistrySale } from './landRegistryLookup';
import type { PropertyAnalysis } from '../types';
import {
  buildDataCoverage,
  logDataCoverage,
  type DataCoverageSource,
} from './dataCoverage';
import { groundAllReportProse } from './proseGrounding';
import { CRIME_UNRELIABLE } from './policeUkLookup';
import { assertReportCoverage, coverageGapMessage, resolveReportRegion } from './ukCoverage';
import {
  applyInsightsToAnalysis,
  buildInsightsPackage,
  type InsightsLlmFn,
} from './reportInsights';
import { lookupOfcomBroadband, ofcomNotOnRecordLine } from './ofcomLookup';
import { buildListingSearchQueries, type ListingDetection } from './listingDetect';
import {
  applyGroundedWebFacts,
  groundedCoverageFooterHint,
  scoreInputsFromGrounded,
  type GroundedWebFacts,
} from './groundedWebFacts';
import { applyDeterministicScores } from './deterministicScores';
import { applyScotlandTenureDefaults } from './scotlandTenure';

export const FINALIZE_REPORT_MARKER = 'finalizeReport';

export type FinalizeLookups = {
  crime?: CrimeLookup | null;
  flood?: FloodLookup | null;
  planning?: PlanningLookupResult | null;
  /** Prefetched Living Here POIs (recorded fixtures / tests) */
  livingHere?: {
    all?: PoiRecord[];
    blocks?: LivingHereBlocks;
    placesEnabled?: boolean;
  } | null;
};

export type FinalizeReportOpts = {
  buyerGoal: string;
  scrap?: ScrapFacts & { price?: string };
  facts?: PropertyFacts | null;
  lookups?: FinalizeLookups;
  /** Optional LLM rewrite for banned-term fields */
  rewriteField?: (path: string, value: string, hits: string[]) => Promise<string>;
  /** Optional Living Here vignette/theme LLM (temp 0 structured) */
  livingHereLlm?: LivingHereLlmFn | null;
  /** Optional insights polish LLM (temp 0) — drafts are code-owned */
  insightsLlm?: InsightsLlmFn | null;
  /** Pin growth as-of date (tests / reproducibility) */
  growthAsOf?: Date;
  /** Skip live OSM/FSA/NHS when no prefetched livingHere (tests) */
  skipLiveLivingHere?: boolean;
  /** Phase 1 / scrap listing detection (for logs + Mode A gate) */
  listingDetection?: ListingDetection | null;
  /** Skip live Ofcom call (tests) */
  skipLiveOfcom?: boolean;
  /** Grounded Phase-1 web facts (URL-backed only) for nation register gaps */
  groundedWebFacts?: GroundedWebFacts | null;
};

export type FinalReport = Record<string, unknown> & {
  /** Marker so tests can assert both providers exit via finalizeReport */
  finalizedBy: typeof FINALIZE_REPORT_MARKER;
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

function formatGbp(n: number): string {
  return `£${Math.round(n).toLocaleString('en-GB')}`;
}

/**
 * Build dueDiligence.purchaseCosts in code — LLM value is discarded.
 * Template (England primary residence): SDLT £{n} (primary residence, standard rates); …
 */
export function buildPurchaseCostsStack(
  analysis: Record<string, unknown>,
  buyerGoal: string
): string {
  const location = (analysis.location || {}) as {
    postcode?: string;
    town?: string;
    address?: string;
  };
  const price =
    parseMoney(typeof analysis.price === 'string' ? analysis.price : undefined) ||
    parseMoney(
      typeof (analysis.valuation as { fair?: string } | undefined)?.fair === 'string'
        ? (analysis.valuation as { fair: string }).fair
        : undefined
    );

  if (!price) {
    return 'Confirm SDLT/LBTT with a solicitor; conveyancing ~£1,800; survey ~£650–£1,100.';
  }

  const nation = detectUkNation(
    location.postcode,
    [location.town, location.address].filter(Boolean).join(' ')
  );
  const estimate = estimateTransactionTax({ price, nation, buyerGoal });
  if (!estimate) {
    return 'Confirm transaction tax with a solicitor; conveyancing ~£1,800; survey ~£650–£1,100.';
  }

  const taxLabel =
    estimate.nation === 'scotland' ? 'LBTT' : estimate.nation === 'wales' ? 'LTT' : 'SDLT';
  const ftb = /first[-\s]?time/i.test(buyerGoal);
  const investor = /buy-to-let|investor/i.test(buyerGoal);
  if (estimate.nation === 'england_ni' && !investor) {
    if (ftb) {
      return `SDLT ${formatGbp(estimate.total)} (first-time buyer relief); conveyancing ~£1,800; survey ~£650–£1,100.`;
    }
    return `SDLT ${formatGbp(estimate.total)} (primary residence, standard rates); conveyancing ~£1,800; survey ~£650–£1,100.`;
  }
  return `${taxLabel} ${formatGbp(estimate.total)} (${estimate.nation.replace('_', '/')}); conveyancing ~£1,800; survey ~£650–£1,100.`;
}

function applyPurchaseCostsTemplate(analysis: Record<string, unknown>, buyerGoal: string): void {
  const dd =
    analysis.dueDiligence && typeof analysis.dueDiligence === 'object'
      ? ({ ...(analysis.dueDiligence as Record<string, unknown>) } as Record<string, unknown>)
      : {};
  // Discard any LLM purchaseCosts — code owns this field
  dd.purchaseCosts = buildPurchaseCostsStack(analysis, buyerGoal);
  analysis.dueDiligence = dd;
}

function backfillPlanningWorks(
  analysis: Record<string, unknown>,
  planning?: PlanningLookupResult | null
): void {
  if (!planning || planning.matchedToProperty.length === 0) return;
  const pw = (analysis.propertyWorks && typeof analysis.propertyWorks === 'object'
    ? { ...(analysis.propertyWorks as Record<string, string>) }
    : {}) as Record<string, string>;
  const thin =
    !pw.planningApplications ||
    /no (structured )?planning|none found|no data|not summarised|not found/i.test(
      `${pw.extensionsAndAlterations || ''} ${pw.planningApplications || ''}`
    );
  if (!thin) return;

  const ext = planning.matchedToProperty.filter((a) =>
    /extension|loft|alteration|conservatory|outbuilding|garage|conversion/i.test(a.proposal)
  );
  pw.extensionsAndAlterations =
    ext.length > 0
      ? ext.map((a) => `${a.proposal} (${a.reference}, ${a.status})`).join('; ')
      : planning.matchedToProperty.map((a) => `${a.proposal} (${a.reference})`).join('; ');
  pw.planningApplications = planning.matchedToProperty
    .map(
      (a) =>
        `${a.reference}: ${a.proposal} — ${a.status}${a.received ? ` (received ${a.received})` : ''} [${planning.council}]`
    )
    .join(' | ');
  if (!pw.certainty || /low until|manually confirm/i.test(pw.certainty)) {
    pw.certainty = `Planning refs listed were matched to this address on the ${planning.council} portal. Confirm build quality and building control with a surveyor.`;
  }
  if (!pw.valueImpact || /confirm any completed/i.test(pw.valueImpact)) {
    pw.valueImpact =
      ext.length > 0
        ? 'Council records show extension/alteration applications at this address — fair value and forecasts should reflect the improved dwelling versus unextended street comps, pending survey confirmation that works were completed as approved.'
        : 'Council planning history exists for this address; weigh decided applications when comparing to unextended comps.';
  }
  analysis.propertyWorks = pw;
}

function resolveModeCtx(
  analysis: Record<string, unknown>,
  scrapPrice?: string,
  facts?: PropertyFacts | null
): ReportModeContext {
  // Live asking = listing scrap only. Never use LLM analysis.price — that often
  // echoes the last sold figure ("£672,400 (Last Sold April 2026)") and falsely
  // flips Mode B → on_market.
  return detectReportMode({
    liveAsking: scrapPrice || null,
    thisPropertySales: facts?.landRegistry.thisProperty as LandRegistrySale[] | undefined,
  });
}

async function resolveSubjectCoords(
  analysis: Record<string, unknown>,
  crime?: { lat?: number | null; lng?: number | null } | null
): Promise<{ lat: number; lng: number } | null> {
  if (crime?.lat != null && crime?.lng != null) {
    return { lat: crime.lat, lng: crime.lng };
  }
  const loc = (analysis.location || {}) as { postcode?: string; address?: string };
  const pc =
    extractPostcode(loc.postcode || '') ||
    extractPostcode(loc.address || '') ||
    extractPostcode(String(analysis.title || ''));
  if (!pc) return null;
  try {
    const compact = pc.replace(/\s+/g, '');
    const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(compact)}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const lat = data?.result?.latitude;
    const lng = data?.result?.longitude;
    if (typeof lat === 'number' && typeof lng === 'number') return { lat, lng };
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Single enforcement exit for every AI provider.
 */
export async function finalizeReport(
  rawLlmJson: Record<string, unknown>,
  opts: FinalizeReportOpts
): Promise<FinalReport> {
  const analysis = { ...rawLlmJson } as Record<string, unknown>;
  const scrap = opts.scrap || {};
  const facts = opts.facts || null;
  const lookups = opts.lookups || {};
  const warnings: string[] = [];

  const subjectAddr =
    facts?.address ||
    String((analysis.location as { address?: string } | undefined)?.address || '') ||
    String((analysis.location as { postcode?: string } | undefined)?.postcode || '') ||
    String(analysis.title || '');
  assertReportCoverage(subjectAddr);

  // Required-lookup mechanism: missing → warn + degrade to safe output (not raw LLM)
  if (lookups.crime == null) {
    warnings.push('crime lookup missing — will apply safe suppression in enforceReportPipeline');
    console.warn('[finalizeReport]', warnings[warnings.length - 1]);
  }
  if (lookups.flood == null) {
    warnings.push('flood lookup missing — will apply safe suppression in enforceReportPipeline');
    console.warn('[finalizeReport]', warnings[warnings.length - 1]);
  }

  backfillPlanningWorks(analysis, lookups.planning);
  applyStampDutyEstimate(analysis, opts.buyerGoal);
  applyPurchaseCostsTemplate(analysis, opts.buyerGoal);
  refineRiskTones(analysis);

  if (facts) {
    applyPropertyFactLocks(analysis, facts, {
      bedrooms: scrap.bedrooms,
      bathrooms: scrap.bathrooms,
      propertyType: scrap.propertyType,
      price: scrap.price,
    });
    // Code-owned comps (same-street → postcode; max 6; include subject priors)
    applySelectedComps(analysis, facts.landRegistry);
    // Pin growth from LR sector+type — LLM rates discarded
    const lr = facts.landRegistry;
    const allSales = [
      ...(lr.thisProperty || []),
      ...(lr.nearbySameStreet || []),
      ...(lr.nearbyPostcode || []),
    ];
    const growth = computeGrowthAssumptionsFromSales({
      sales: allSales,
      postcode: lr.postcode,
      propertyType:
        String(analysis.propertyType || scrap.propertyType || lr.thisProperty[0]?.propertyType || ''),
      subjectAddress:
        lr.thisProperty[0]?.addressLabel ||
        facts.address ||
        String((analysis.location as { address?: string } | undefined)?.address || ''),
      asOf: opts.growthAsOf,
    });
    const valuation = {
      ...((analysis.valuation as object) || {}),
      growthAssumptions: {
        lowPct: growth.lowPct,
        centralPct: growth.centralPct,
        highPct: growth.highPct,
        basis: growth.basis,
      },
    };
    analysis.valuation = valuation;
    analysis.growthAssumptions = valuation.growthAssumptions;
    console.log(
      `[growth] central=${growth.centralPct}% fallback=${growth.usedFallback} basis=${growth.basis}`
    );
    applyPurchaseCostsTemplate(analysis, opts.buyerGoal);
  }

  // Schools + transport from GIAS / NaPTAN (not LLM)
  const coords = await resolveSubjectCoords(analysis, lookups.crime);
  if (coords) {
    applyGiasSchools(analysis, coords.lat, coords.lng);
    applyNaptanTransport(analysis, coords.lat, coords.lng);
  } else {
    warnings.push('subject coordinates missing — schools/transport not selected');
    console.warn('[finalizeReport]', warnings[warnings.length - 1]);
  }

  // Prefer nation-aware empty copy when E&W-only datasets return nothing
  {
    const region = resolveReportRegion(subjectAddr);
    const area =
      analysis.areaAnalysis && typeof analysis.areaAnalysis === 'object'
        ? ({ ...(analysis.areaAnalysis as Record<string, unknown>) } as Record<string, unknown>)
        : {};
    const schools = area.schools as unknown[] | undefined;
    if (!schools?.length) {
      const gap = coverageGapMessage('schools', region);
      // Prefer short customer copy; long nation essays stay in logs via dataCoverage
      area.schoolsEmptyMessage =
        region === 'scotland' || region === 'northern_ireland'
          ? 'No nearby school details found for this address.'
          : gap || area.schoolsEmptyMessage;
    }
    analysis.areaAnalysis = area;
    analysis.reportRegion = region;
  }

  const modeCtx = resolveModeCtx(analysis, scrap.price, facts);

  // Persist mode flags for PDF + e2e (Mode A offer shell only when live asking)
  analysis.hasLiveAsking = modeCtx.hasLiveAsking;
  analysis.priceLabel = modeCtx.priceLabel;
  analysis.reportMode = modeCtx.mode;
  if (opts.listingDetection) {
    analysis.listingDetected = opts.listingDetection;
  } else {
    const addr =
      facts?.address ||
      String((analysis.location as { address?: string } | undefined)?.address || '') ||
      String(analysis.title || '');
    analysis.listingDetected = {
      listingDetected: modeCtx.hasLiveAsking,
      askingPrice: modeCtx.hasLiveAsking ? String(scrap.price || '') : null,
      portalUrl: null,
      portal: modeCtx.hasLiveAsking ? 'listing scrap' : null,
      evidence: modeCtx.hasLiveAsking
        ? `scrap.price=${scrap.price}`
        : 'no scrap.price — Estimated value mode',
      queried: buildListingSearchQueries(addr),
    };
  }

  if (modeCtx.mode === 'on_market' && modeCtx.hasLiveAsking) {
    const valuation = analysis.valuation as
      | { fair?: string; conservative?: string; optimistic?: string }
      | undefined;
    const asking = String(scrap.price || analysis.price || '');
    const existing = analysis.offerStrategy as
      | {
          lowOffer?: string;
          fairOffer?: string;
          premiumOffer?: string;
          negotiationTips?: string[];
        }
      | undefined;
    // Seed missing legs so sanitize can derive opener/fair/walk-away from asking
    const seeded = {
      lowOffer: existing?.lowOffer || '',
      fairOffer: existing?.fairOffer || '',
      premiumOffer: existing?.premiumOffer || '',
      negotiationTips: Array.isArray(existing?.negotiationTips)
        ? existing!.negotiationTips!
        : [
            'Open below asking only with comps evidence in hand.',
            'Use survey findings and time-on-market as levers.',
            'Confirm chain position before stretching to walk-away.',
          ],
    };
    // sanitizeOfferStrategy needs at least one parseable leg — supply asking as fair seed
    if (!seeded.fairOffer) seeded.fairOffer = asking;
    analysis.offerStrategy = sanitizeOfferStrategy(seeded, {
      asking,
      fairValue: valuation?.fair,
      conservative: valuation?.conservative,
      optimistic: valuation?.optimistic,
    });
    // Keep headline price aligned with live asking for Mode A
    if (scrap.price?.trim()) analysis.price = scrap.price.trim();
  } else {
    // Mode B (recently sold) and Mode C (estimated value) — no offer shell
    delete analysis.offerStrategy;
  }

  applyReportWritingEngine(analysis, {
    modeCtx,
    scrapBathrooms: scrap.bathrooms,
    scrapBedrooms: scrap.bedrooms,
    hasVerifiedEpc: Boolean(facts?.epc.matched),
    hasVerifiedSoldHistory: Boolean(facts?.landRegistry.thisProperty.length),
  });

  // Always re-apply purchase costs after writing engine (discard any LLM remnant)
  applyPurchaseCostsTemplate(analysis, opts.buyerGoal);

  const { warnings: enforceWarnings } = await enforceReportPipeline(analysis, {
    modeCtx,
    scrapPrice: scrap.price,
    crime: lookups.crime ?? null,
    epc: facts?.epc ?? null,
    landRegistry: facts?.landRegistry ?? null,
    flood: lookups.flood ?? null,
    hasVerifiedPlanning: Boolean(lookups.planning?.matchedToProperty?.length),
    reportRegion: resolveReportRegion(subjectAddr),
    rewriteField: opts.rewriteField,
  });

  // Re-assert schools/transport + purchase costs after enforcement (comps notes stay mechanical)
  if (coords) {
    applyGiasSchools(analysis, coords.lat, coords.lng);
    applyNaptanTransport(analysis, coords.lat, coords.lng);
  }
  {
    const region = resolveReportRegion(subjectAddr);
    const area =
      analysis.areaAnalysis && typeof analysis.areaAnalysis === 'object'
        ? ({ ...(analysis.areaAnalysis as Record<string, unknown>) } as Record<string, unknown>)
        : {};
    const schools = area.schools as unknown[] | undefined;
    if (!schools?.length) {
      const gap = coverageGapMessage('schools', region);
      // Prefer short customer copy; long nation essays stay in logs via dataCoverage
      area.schoolsEmptyMessage =
        region === 'scotland' || region === 'northern_ireland'
          ? 'No nearby school details found for this address.'
          : gap || area.schoolsEmptyMessage;
    }
    analysis.areaAnalysis = area;
    analysis.reportRegion = region;
  }
  applyPurchaseCostsTemplate(analysis, opts.buyerGoal);

  // Re-assert mode exclusivity after enforcement (LLM / Mode B panel must not resurrect offers)
  if (!(modeCtx.mode === 'on_market' && modeCtx.hasLiveAsking)) {
    delete analysis.offerStrategy;
  }
  analysis.hasLiveAsking = modeCtx.hasLiveAsking;

  // 10.8c Ofcom broadband — code-owned; LLM placeholder discarded
  await applyOfcomBroadband(analysis, facts, opts, warnings);

  // Living Here — code-selected POIs; LLM vignette only via livingHereLlm + grounding validator
  await applyLivingHereFinalize(analysis, coords, opts, lookups, warnings);

  // Interpretation layer — Class 1/2/3 insights (code selection; optional LLM polish)
  const insightsPkg = await buildInsightsPackage(analysis, {
    facts,
    crime: lookups.crime ?? null,
    flood: lookups.flood
      ? { bandingLabel: lookups.flood.bandingLabel, zone: lookups.flood.floodZone }
      : null,
    buyerGoal: opts.buyerGoal,
    insightsLlm: opts.insightsLlm,
    rewriteInsight: opts.rewriteField
      ? (text, reason) => opts.rewriteField!('insights', text, [reason])
      : undefined,
  });
  applyInsightsToAnalysis(analysis, insightsPkg);
  warnings.push(
    ...insightsPkg.validationLog
      .filter((e) => e.decision === 'drop' || e.decision === 'reject')
      .map((e) => `insights: ${e.detail}`)
  );

  // Ground all LLM prose against code-selected entities
  const proseLog = await groundAllReportProse(analysis, {
    rewriteField: opts.rewriteField,
    estateType: facts?.landRegistry?.thisProperty?.find((s) => s.estateType)?.estateType || null,
  });
  warnings.push(
    ...proseLog
      .filter((e) => e.decision === 'drop_prose')
      .map((e) => `proseGrounding: ${e.detail}`)
  );

  // URL-backed web research fills for nation register gaps (after empty guards)
  const regionForGround = resolveReportRegion(subjectAddr);
  applyGroundedWebFacts(analysis, opts.groundedWebFacts, regionForGround);
  applyScotlandTenureDefaults(analysis, regionForGround);

  // Recompute scores using official + grounded EPC/crime/comps/schools/transport
  {
    const scoreInput = scoreInputsFromGrounded(analysis, opts.groundedWebFacts, {
      epcBand: facts?.epc?.matched?.currentRating || opts.groundedWebFacts?.epc?.band || null,
      floodTone: (analysis.riskTones as { floodRisk?: string } | undefined)?.floodRisk || null,
      crimePerThousand: lookups.crime?.incidentsPerThousand ?? null,
      hasPlanningMatch: Boolean(
        lookups.planning?.matchedToProperty?.length || opts.groundedWebFacts?.planning
      ),
    });
    applyDeterministicScores(analysis, scoreInput);

    // Soft condition copy when we scored an estimate without an EPC band
    if (
      !scoreInput.epcBand &&
      scoreInput.conditionEstimate != null &&
      scoreInput.conditionEstimate > 0
    ) {
      const dd =
        analysis.dueDiligence && typeof analysis.dueDiligence === 'object'
          ? ({ ...(analysis.dueDiligence as Record<string, unknown>) } as Record<string, unknown>)
          : {};
      const cur = String(dd.epcAndEnergy || '');
      if (
        !cur ||
        /no (scottish )?epc|not yet included|request from vendor|gov\.uk find an energy/i.test(cur)
      ) {
        const lead =
          regionForGround === 'scotland'
            ? 'Estimated from public Scottish records'
            : 'Estimated from public records';
        dd.epcAndEnergy = `${lead}: no EPC certificate linked. Condition score is an estimate (~${scoreInput.conditionEstimate}/100) from planning/listing cues — confirm via Home Report / EPC register before relying on energy costs.`;
        analysis.dueDiligence = dd;
      }
    }
  }

  // Mode exclusivity — grounded solds must never resurrect offers / Asking Price
  if (!(modeCtx.mode === 'on_market' && modeCtx.hasLiveAsking)) {
    delete analysis.offerStrategy;
    analysis.hasLiveAsking = false;
    if (!/asking/i.test(String(modeCtx.priceLabel))) {
      analysis.priceLabel = modeCtx.priceLabel;
    }
  }

  // Data coverage telemetry (customer footer stays short)
  const coverageSources = collectDataCoverage(analysis, lookups, facts, warnings);
  const dataCoverage = buildDataCoverage(coverageSources);
  const groundedHint = groundedCoverageFooterHint(opts.groundedWebFacts);
  if (groundedHint) {
    dataCoverage.failedLine = '';
    dataCoverage.summaryLine = groundedHint;
  } else if (regionForGround === 'scotland' || regionForGround === 'northern_ireland') {
    // Avoid littering every page with long nation-gap essays
    const failed = coverageSources.filter((s) => s.status === 'failed' || s.status === 'suppressed');
    if (failed.length) {
      dataCoverage.failedLine = '';
      dataCoverage.summaryLine = `${dataCoverage.ok} of ${dataCoverage.total} linked registers returned data — gaps shown as estimates where public web records supported them.`;
    }
  }
  analysis.dataCoverage = dataCoverage;
  logDataCoverage(dataCoverage);

  analysis.finalizedBy = FINALIZE_REPORT_MARKER;
  analysis.finalizeWarnings = [...warnings, ...enforceWarnings];

  console.log(`[finalizeReport] complete (warnings=${(analysis.finalizeWarnings as string[]).length})`);
  return analysis as FinalReport;
}

function collectDataCoverage(
  analysis: Record<string, unknown>,
  lookups: FinalizeLookups,
  facts: PropertyFacts | null,
  warnings: string[]
): DataCoverageSource[] {
  const warnHas = (re: RegExp) => warnings.some((w) => re.test(w));
  const sources: DataCoverageSource[] = [];
  const region = resolveReportRegion(
    facts?.address ||
      String((analysis.location as { postcode?: string } | undefined)?.postcode || '') ||
      String((analysis.location as { address?: string } | undefined)?.address || '')
  );

  const lrOk = Boolean(facts?.landRegistry?.thisProperty?.length || facts?.landRegistry?.nearbySameStreet?.length);
  sources.push({
    id: 'landRegistry',
    label: 'HM Land Registry',
    status: lrOk ? 'ok' : facts?.landRegistry ? 'failed' : 'skipped',
    detail: lrOk
      ? undefined
      : coverageGapMessage('landRegistry', region) || 'no sales returned',
  });

  const epcOk = Boolean(facts?.epc?.matched);
  sources.push({
    id: 'epc',
    label: 'EPC register',
    status: epcOk ? 'ok' : facts?.epc ? 'failed' : 'skipped',
    detail: epcOk
      ? undefined
      : coverageGapMessage('epc', region) || facts?.epc?.error || 'no subject match',
  });

  const crime = lookups.crime;
  if (crime == null) {
    sources.push({
      id: 'crime',
      label: 'police.uk',
      status: 'failed',
      detail: coverageGapMessage('crime', region) || 'unavailable at generation',
    });
  } else if (crime.reliable && crime.status === 'ok') {
    sources.push({ id: 'crime', label: 'police.uk', status: 'ok' });
  } else {
    sources.push({
      id: 'crime',
      label: 'police.uk',
      status: 'suppressed',
      detail:
        coverageGapMessage('crime', region) ||
        (crime.label === CRIME_UNRELIABLE ? 'unavailable at generation' : crime.status),
    });
  }

  if (lookups.flood == null) {
    sources.push({
      id: 'flood',
      label: 'Flood risk',
      status: warnHas(/flood/i) ? 'failed' : 'skipped',
      detail: coverageGapMessage('flood', region) || 'unavailable at generation',
    });
  } else {
    sources.push({ id: 'flood', label: 'Flood risk', status: 'ok' });
  }

  if (lookups.planning == null) {
    sources.push({ id: 'planning', label: 'Planning portal', status: 'skipped' });
  } else if (lookups.planning.matchedToProperty?.length) {
    sources.push({ id: 'planning', label: 'Planning portal', status: 'ok' });
  } else {
    sources.push({
      id: 'planning',
      label: 'Planning portal',
      status: 'suppressed',
      detail: 'no matched applications',
    });
  }

  const schools = (analysis.areaAnalysis as { schools?: unknown[] } | undefined)?.schools;
  sources.push({
    id: 'schools',
    label: 'GIAS / Ofsted',
    status: schools?.length ? 'ok' : 'failed',
    detail: schools?.length
      ? undefined
      : region === 'scotland' || region === 'northern_ireland'
        ? 'no nearby school details found'
        : coverageGapMessage('schools', region) ||
          (analysis.areaAnalysis as { schoolsEmptyMessage?: string } | undefined)?.schoolsEmptyMessage ||
          'no schools selected',
  });

  const transport = (analysis.areaAnalysis as { transport?: unknown[] } | undefined)?.transport;
  sources.push({
    id: 'naptan',
    label: 'NaPTAN',
    status: transport?.length ? 'ok' : 'failed',
    detail: transport?.length ? undefined : 'no stops selected',
  });

  const lh = analysis.livingHere as { foodDrink?: unknown[]; walksOutdoors?: unknown[]; everyday?: unknown[] } | undefined;
  const lhCount =
    (lh?.foodDrink?.length || 0) + (lh?.walksOutdoors?.length || 0) + (lh?.everyday?.length || 0);
  sources.push({
    id: 'livingHere',
    label: 'Living Here POIs',
    status: lhCount > 0 ? 'ok' : warnHas(/Living Here|OSM|Overpass|FSA/i) ? 'failed' : 'skipped',
    detail: lhCount > 0 ? undefined : 'no POIs',
  });

  const comps = (analysis.comparableSales || []) as {
    note?: string;
    floorAreaSqm?: string;
  }[];
  const epcCompHit = comps.some(
    (c) =>
      Boolean(String(c.floorAreaSqm || '').trim()) ||
      /\d+\s*sqm/i.test(String(c.note || ''))
  );
  sources.push({
    id: 'compsEpc',
    label: 'Comps EPC match',
    status: comps.length === 0 ? 'skipped' : epcCompHit ? 'ok' : 'suppressed',
    detail: epcCompHit ? undefined : comps.length ? 'no floor-area EPC matches' : undefined,
  });

  return sources;
}

async function applyOfcomBroadband(
  analysis: Record<string, unknown>,
  facts: PropertyFacts | null,
  opts: FinalizeReportOpts,
  warnings: string[]
): Promise<void> {
  const loc = (analysis.location || {}) as { postcode?: string; address?: string };
  const pc =
    extractPostcode(loc.postcode || '') ||
    extractPostcode(loc.address || '') ||
    extractPostcode(facts?.address || '') ||
    facts?.landRegistry?.postcode ||
    null;

  const dd =
    analysis.dueDiligence && typeof analysis.dueDiligence === 'object'
      ? ({ ...(analysis.dueDiligence as Record<string, unknown>) } as Record<string, unknown>)
      : {};

  if (!pc || opts.skipLiveOfcom) {
    dd.broadbandAndMobile = ofcomNotOnRecordLine();
    analysis.dueDiligence = dd;
    return;
  }

  try {
    const ofcom = await lookupOfcomBroadband(pc);
    if (ofcom) {
      dd.broadbandAndMobile = ofcom.summary;
      if (ofcom.error) warnings.push(`ofcom: ${ofcom.error}`);
    } else {
      dd.broadbandAndMobile = ofcomNotOnRecordLine();
    }
  } catch (e) {
    dd.broadbandAndMobile = ofcomNotOnRecordLine();
    warnings.push(`ofcom: ${e instanceof Error ? e.message : String(e)}`);
  }
  analysis.dueDiligence = dd;
}

async function applyLivingHereFinalize(
  analysis: Record<string, unknown>,
  coords: { lat: number; lng: number } | null,
  opts: FinalizeReportOpts,
  lookups: FinalizeLookups,
  warnings: string[]
): Promise<void> {
  const postcode =
    extractPostcode(String((analysis.location as { postcode?: string } | undefined)?.postcode || '')) ||
    extractPostcode(String(analysis.address || analysis.title || '')) ||
    '';

  let blocks: LivingHereBlocks | null = null;
  let placesEnabled = false;

  if (lookups.livingHere) {
    blocks = livingHereFromRecorded(lookups.livingHere);
    placesEnabled = Boolean(lookups.livingHere.placesEnabled);
  } else if (coords && postcode && !opts.skipLiveLivingHere) {
    try {
      const result = await lookupLivingHerePois(coords.lat, coords.lng, postcode, {
        skipPlaces: !process.env.GOOGLE_PLACES_API_KEY,
      });
      blocks = result.blocks;
      placesEnabled = result.placesEnabled;
      warnings.push(...result.warnings);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      warnings.push(`Living Here POI lookup failed: ${msg}`);
      console.warn('[finalizeReport] livingHere', msg);
    }
  } else if (!lookups.livingHere) {
    warnings.push('Living Here skipped — no prefetched POIs and live lookup disabled/unavailable');
  }

  if (!blocks) return;

  const { prose, log } = await generateLivingHereWithGrounding(
    blocks,
    settlementsFromAddress(String(analysis.address || analysis.title || '')),
    opts.livingHereLlm ?? null
  );

  applyLivingHereBlocks(analysis as PropertyAnalysis, blocks, {
    placesEnabled,
    vignette: prose?.vignette,
    themeLines: prose?.themeLines,
    groundingLog: log,
  });
}

function settlementsFromAddress(addr: string): string[] {
  const parts = addr.split(',').map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  for (const p of parts) {
    if (/^[A-Z]{1,2}\d/i.test(p.replace(/\s/g, ''))) continue;
    if (/^Pentland$/i.test(p)) continue;
    out.push(p);
  }
  if (/Northallerton/i.test(addr)) out.push('Northallerton');
  return [...new Set(out)];
}
