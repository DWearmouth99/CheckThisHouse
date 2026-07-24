/**
 * Post-LLM enforcement for D1–D9 / P1–P9 — deterministic numbers, filters, bans, dedup.
 */

import { enforceBannedTerms } from './bannedTerms';
import { buildMechanicalComps } from './compBasis';
import {
  applyDeterministicForecasts,
  applyDeterministicYield,
  percentGrowth,
  type ForecastMilestones,
} from './deterministicForecasts';
import { applyDeterministicScores, type ScoreInputs } from './deterministicScores';
import { dedupeAnalysisText } from './textDedup';
import type { ReportModeContext } from './reportWritingEngine';
import {
  CRIME_UNRELIABLE,
  crimeInterpretationLeaksRate,
  stripCrimeRateFromProse,
  type CrimeLookup,
} from './policeUkLookup';
import type { EpcLookup } from './epcLookup';
import type { LandRegistryLookup } from './landRegistryLookup';
import { formatGbpAmount } from './landRegistryLookup';
import type { FloodLookup } from './floodLookup';
import { resolveSpecsRows } from './notOnRecordRules';
import { scrubEpcUrlsInText } from './epcLinkFormat';

export type EnforceOpts = {
  modeCtx: ReportModeContext;
  scrapPrice?: string;
  crime?: CrimeLookup | null;
  epc?: EpcLookup | null;
  landRegistry?: LandRegistryLookup | null;
  flood?: FloodLookup | null;
  /** Verified exact-address planning hits (not LLM prose) */
  hasVerifiedPlanning?: boolean;
  /** For nation-aware empty EPC copy */
  reportRegion?: string | null;
  rewriteField?: (path: string, value: string, hits: string[]) => Promise<string>;
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

function applySoldMode(analysis: Record<string, unknown>, modeCtx: ReportModeContext): void {
  analysis.reportMode = modeCtx.mode;
  analysis.priceLabel = modeCtx.priceLabel;
  if (modeCtx.mode !== 'recently_sold') return;

  if (modeCtx.lastSoldPrice) analysis.price = modeCtx.lastSoldPrice;

  delete analysis.offerStrategy;

  const when = modeCtx.lastSoldMonthYear || 'the last 12 months';
  const sold = modeCtx.lastSoldPrice || 'the recent Land Registry sale';
  analysis.recentlySoldPanel = {
    headline: 'Recently sold — what this means',
    lastSoldLabel: modeCtx.priceLabel,
    lastSoldPrice: sold,
    lastSoldDate: modeCtx.lastSoldDate || '',
    bullets: [
      `This property completed around ${when} at ${sold}. It is not currently available to purchase.`,
      `Treat ${sold} as the strongest recent signal for this exact address when judging street and area values.`,
      'If it returns to market, re-check EPC, planning, survey condition and fresh same-street solds before setting any offer band.',
      'Ask how the previous sale was marketed, whether works completed after completion, and whether any survey issues surfaced.',
      'Budget for stamp duty/LBTT (and ADS if relevant), solicitor, survey and moving costs on top of any future purchase price.',
      'For remortgage or sale planning, instruct a local agent or valuer with this report and the Land Registry sale history.',
    ],
  };

  const suitability = String(analysis.buyingSuitability || '');
  if (!/recent(ly)? sold|not (currently )?on the market|last sold/i.test(suitability)) {
    analysis.buyingSuitability = [
      `This home recently sold (${when}${modeCtx.lastSoldPrice ? ` for ${modeCtx.lastSoldPrice}` : ''}) and is not a live purchase opportunity.`,
      suitability ||
        'Use this report for neighbourhood, risk and value context if you are researching the street, remortgaging, or watching for a return to market.',
    ]
      .filter(Boolean)
      .join(' ');
  }

  const me =
    analysis.marketEvidence && typeof analysis.marketEvidence === 'object'
      ? ({ ...(analysis.marketEvidence as Record<string, unknown>) } as Record<string, unknown>)
      : {};
  delete me.negotiationLevers;
  analysis.marketEvidence = me;
}

function applyCrimeFactSync(analysis: Record<string, unknown>, crime?: CrimeLookup | null): void {
  const area =
    analysis.areaAnalysis && typeof analysis.areaAnalysis === 'object'
      ? ({ ...(analysis.areaAnalysis as Record<string, unknown>) } as Record<string, unknown>)
      : {};
  const existing = (area.crimeSafety && typeof area.crimeSafety === 'object'
    ? { ...(area.crimeSafety as Record<string, unknown>) }
    : {}) as Record<string, unknown>;

  // Missing lookup → safe suppression (never leave unvalidated LLM rates)
  if (!crime) {
    console.warn(
      '[enforceReportPipeline] crime lookup missing — suppressing LLM crime figures'
    );
    analysis.verifiedCrime = {
      incidentsPerThousand: null,
      label: CRIME_UNRELIABLE,
      reliable: false,
    };
    existing.rating = CRIME_UNRELIABLE;
    existing.description =
      'Local crime data was unavailable for this address — verify on police.uk.';
    delete existing.incidentsPerThousand;
    area.crimeSafety = existing;
    analysis.areaAnalysis = area;
    return;
  }

  analysis.verifiedCrime = {
    incidentsPerThousand: crime.incidentsPerThousand,
    crimeCountYear: crime.crimeCountYear,
    monthStart: crime.monthStart,
    monthEnd: crime.monthEnd,
    population: crime.population,
    populationSource: crime.populationSource,
    label: crime.label,
    reliable: crime.reliable,
    sourceUrl: crime.sourceUrl,
    debug: crime.debug,
    lsoa21cd: crime.lsoa21cd,
  };

  // Stat once from data object; description = interpretation only (scrubbed below)
  existing.rating = crime.label;
  existing.description = String(existing.description || crime.interpretationHint || '');
  existing.incidentsPerThousand = crime.incidentsPerThousand;
  area.crimeSafety = existing;
  analysis.areaAnalysis = area;
}

/**
 * Rate renders once from verifiedCrime / crimeSafety.rating.
 * Interpretation is regenerated up to 2 times if it leaks per-1,000 / the numeric rate;
 * on failure the sentence is dropped and the stat stands alone.
 */
async function scrubCrimeInterpretation(
  analysis: Record<string, unknown>,
  crime: CrimeLookup | null | undefined,
  rewriteField?: EnforceOpts['rewriteField']
): Promise<void> {
  if (!crime) return;
  const area =
    analysis.areaAnalysis && typeof analysis.areaAnalysis === 'object'
      ? ({ ...(analysis.areaAnalysis as Record<string, unknown>) } as Record<string, unknown>)
      : {};
  const existing = (area.crimeSafety && typeof area.crimeSafety === 'object'
    ? { ...(area.crimeSafety as Record<string, unknown>) }
    : {}) as Record<string, unknown>;

  let desc = stripCrimeRateFromProse(
    String(existing.description || crime.interpretationHint || '')
  );
  const rate = crime.incidentsPerThousand;

  for (let attempt = 0; attempt < 2 && crimeInterpretationLeaksRate(desc, rate); attempt++) {
    if (rewriteField) {
      try {
        desc = stripCrimeRateFromProse(
          await rewriteField('areaAnalysis.crimeSafety.description', desc, [
            'per 1,000',
            'per 1000',
            rate != null ? String(rate) : 'rate numeral',
          ])
        );
      } catch {
        desc = stripCrimeRateFromProse(desc);
      }
    } else {
      desc = stripCrimeRateFromProse(desc);
      break;
    }
  }

  const remnantOnly = !desc || desc.length < 12 || /^(about|approximately)\.?$/i.test(desc);
  if (crimeInterpretationLeaksRate(desc, rate) || remnantOnly) {
    // Prefer clean hint; if that also leaks, drop interpretation entirely
    const hint = stripCrimeRateFromProse(crime.interpretationHint || '');
    desc = crimeInterpretationLeaksRate(hint, rate) || !hint ? '' : hint;
  }

  existing.rating = crime.label;
  existing.description = desc;
  area.crimeSafety = existing;
  analysis.areaAnalysis = area;
}

function applyFloodFact(analysis: Record<string, unknown>, flood?: FloodLookup | null): void {
  if (!flood) {
    console.warn(
      '[enforceReportPipeline] flood lookup missing — suppressing unverified LLM flood bandings'
    );
    const risk =
      analysis.riskAnalysis && typeof analysis.riskAnalysis === 'object'
        ? ({ ...(analysis.riskAnalysis as Record<string, unknown>) } as Record<string, unknown>)
        : {};
    risk.floodRisk =
      'Flood risk could not be verified from Environment Agency / planning.data — check GOV.UK flood maps.';
    analysis.riskAnalysis = risk;
    analysis.verifiedFlood = { reliable: false };
    return;
  }
  analysis.verifiedFlood = {
    riversAndSea: flood.riversAndSea,
    surfaceWater: flood.surfaceWater,
    floodZone: flood.floodZone,
    sourceUrl: flood.sourceUrl,
    fetchedAt: flood.fetchedAt,
    llmContext: flood.llmContext,
    // bandingLabel kept only on riskAnalysis.floodRisk to avoid D7 duplicate
  };
  const risk =
    analysis.riskAnalysis && typeof analysis.riskAnalysis === 'object'
      ? ({ ...(analysis.riskAnalysis as Record<string, unknown>) } as Record<string, unknown>)
      : {};
  const prior = String(risk.floodRisk || '');
  const interpretation = prior
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => !/River Wiske|Cod Beck|broader regional models/i.test(s))
    .filter((s) => !/rivers\s*&\s*sea|surface water|Flood Zone/i.test(s))
    .slice(0, 1)
    .join(' ');
  risk.floodRisk = [flood.bandingLabel, interpretation].filter(Boolean).join(' ');
  analysis.riskAnalysis = risk;

  const tones =
    analysis.riskTones && typeof analysis.riskTones === 'object'
      ? ({ ...(analysis.riskTones as Record<string, unknown>) } as Record<string, unknown>)
      : {};
  const band = flood.riversAndSea.toLowerCase();
  if (band.includes('very low') || band === 'low') tones.floodRisk = 'positive';
  else if (band.includes('medium')) tones.floodRisk = 'caution';
  else if (band.includes('high')) tones.floodRisk = 'negative';
  analysis.riskTones = tones;
}

function applyEpcNoMatchGuard(
  analysis: Record<string, unknown>,
  epc?: EpcLookup | null,
  region?: string | null
): void {
  if (epc?.matched) return;
  const dd =
    analysis.dueDiligence && typeof analysis.dueDiligence === 'object'
      ? ({ ...(analysis.dueDiligence as Record<string, unknown>) } as Record<string, unknown>)
      : {};
  dd.epcAndEnergy =
    region === 'scotland'
      ? 'No Scottish EPC linked for this address — request the Home Report / Energy Performance Certificate from the seller and check the Scottish EPC register.'
      : region === 'northern_ireland'
        ? 'No EPC linked for this address — request the certificate from the seller and check the NI EPC register.'
        : 'No EPC on register — request from vendor. Verify on gov.uk Find an energy certificate.';
  analysis.dueDiligence = dd;

  if (Array.isArray(analysis.specs)) {
    analysis.specs = (analysis.specs as { label?: string; value?: string }[]).filter((row) => {
      const label = String(row.label || '');
      const value = String(row.value || '');
      if (/EPC/i.test(label) && !epc?.matched) return false;
      if (/EPC[^.]{0,40}\b[A-G]\s*(to|–|-|—)\s*[A-G]\b/i.test(value)) return false;
      return true;
    });
  }
}

function applyGrowthSinceLastSale(
  analysis: Record<string, unknown>,
  landRegistry?: LandRegistryLookup | null
): void {
  const sales = landRegistry?.thisProperty || [];
  if (sales.length < 2) return;
  const latest = sales[0]!;
  const prior = sales[1]!;
  const pct = percentGrowth(prior.amount, latest.amount);
  analysis.growthSinceLastSale = {
    fromPrice: formatGbpAmount(prior.amount),
    toPrice: formatGbpAmount(latest.amount),
    fromDate: prior.date,
    toDate: latest.date,
    percent: pct,
    label: `${pct >= 0 ? '+' : ''}${pct}% from ${formatGbpAmount(prior.amount)} (${prior.date}) to ${formatGbpAmount(latest.amount)} (${latest.date})`,
  };
}

function scrubUrlsEverywhere(analysis: Record<string, unknown>): void {
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) {
        if (typeof node[i] === 'string') node[i] = scrubEpcUrlsInText(node[i] as string);
        else walk(node[i]);
      }
      return;
    }
    if (node && typeof node === 'object') {
      const o = node as Record<string, unknown>;
      for (const k of Object.keys(o)) {
        if (typeof o[k] === 'string') o[k] = scrubEpcUrlsInText(o[k] as string);
        else walk(o[k]);
      }
    }
  };
  walk(analysis);
}

function buildScoreInputs(analysis: Record<string, unknown>, opts: EnforceOpts): ScoreInputs {
  const epcBand = opts.epc?.matched?.currentRating || null;
  const riskTones = (analysis.riskTones || {}) as Record<string, string>;
  const price = parseMoney(String(analysis.price || opts.scrapPrice || ''));

  // Prefer Land Registry nearby prices (stable) over LLM/mechanical table rows
  const lrNearby =
    opts.landRegistry?.nearbySameStreet?.length
      ? opts.landRegistry.nearbySameStreet
      : opts.landRegistry?.nearbyPostcode || [];
  const lrPrices = lrNearby.map((s) => s.amount).filter((n) => Number.isFinite(n) && n > 0);
  const comps = Array.isArray(analysis.comparableSales) ? analysis.comparableSales : [];
  const compPrices =
    lrPrices.length > 0
      ? lrPrices
      : comps
          .map((c) => parseMoney(String((c as { price?: string }).price || '')))
          .filter((n): n is number => n != null);
  const avgComp =
    compPrices.length > 0 ? compPrices.reduce((a, b) => a + b, 0) / compPrices.length : null;
  const priceVsCompsPct =
    price != null && avgComp != null && avgComp > 0 ? ((price - avgComp) / avgComp) * 100 : null;

  // Prefer verified registers; transport/schools from finalize-selected entities when present.
  const transportRows = (
    (analysis.verifiedTransport as { type?: string; miles?: number; time?: string }[] | undefined) ||
    (analysis.areaAnalysis as { transport?: { type?: string; miles?: number; time?: string }[] } | undefined)
      ?.transport ||
    []
  );
  const railMiles = transportRows
    .filter((r) => /rail/i.test(String(r.type || '')))
    .map((r) => {
      if (typeof r.miles === 'number') return r.miles;
      const m = String(r.time || '').match(/([\d.]+)\s*miles?/i);
      return m ? parseFloat(m[1]!) : NaN;
    })
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b)[0];
  const schools = (
    (analysis.areaAnalysis as { schools?: { rating?: string }[] } | undefined)?.schools || []
  );
  const schoolOutstandingOrGood =
    schools.length === 0
      ? null
      : schools.some((s) => /good|outstanding|positive|excellent/i.test(String(s.rating || '')));

  return {
    epcBand,
    floodTone: riskTones.floodRisk || null,
    crimePerThousand: opts.crime?.incidentsPerThousand ?? null,
    priceVsCompsPct,
    hasPlanningMatch: Boolean(opts.hasVerifiedPlanning),
    transportMinutesToStation:
      railMiles != null && Number.isFinite(railMiles) ? Math.round(railMiles * 12) : null,
    schoolOutstandingOrGood,
  };
}

function collapseDuplicatePlanning(analysis: Record<string, unknown>): void {
  const pw = analysis.propertyWorks as Record<string, string> | undefined;
  const risk = analysis.riskAnalysis as Record<string, string> | undefined;
  if (!pw || !risk) return;
  const canonical = [pw.extensionsAndAlterations, pw.planningApplications]
    .filter(Boolean)
    .join(' ');
  if (canonical.length > 80 && risk.planningDevelopments) {
    risk.planningDevelopments =
      'See Extensions, Planning & Works for exact-address planning history.';
    analysis.riskAnalysis = risk;
  }
}

/**
 * Full post-generation enforcement. Call after fact locks / stamp duty.
 */
export async function enforceReportPipeline(
  analysis: Record<string, unknown>,
  opts: EnforceOpts
): Promise<{
  analysis: Record<string, unknown>;
  warnings: string[];
  milestones: ForecastMilestones;
}> {
  const warnings: string[] = [];

  applySoldMode(analysis, opts.modeCtx);
  applyCrimeFactSync(analysis, opts.crime);
  await scrubCrimeInterpretation(analysis, opts.crime, opts.rewriteField);
  applyFloodFact(analysis, opts.flood);
  applyEpcNoMatchGuard(analysis, opts.epc, opts.reportRegion);
  applyGrowthSinceLastSale(analysis, opts.landRegistry);

  const milestones = applyDeterministicForecasts(analysis, opts.scrapPrice);
  applyDeterministicYield(analysis);

  // Mechanical comps notes (EPC floor area) — selection already code-owned
  const subjectFloor = opts.epc?.matched?.floorAreaSqm || null;
  const subjectAddress =
    String(
      (analysis.location as { address?: string } | undefined)?.address ||
        opts.landRegistry?.thisProperty?.[0]?.addressLabel ||
        ''
    ) || undefined;
  const priorSales = (opts.landRegistry?.thisProperty || []).slice(1, 4).map((s) => ({
    address: s.addressLabel,
    price: formatGbpAmount(s.amount),
    soldDate: s.date,
  }));
  try {
    const { comps, epcHitRate } = await buildMechanicalComps({
      comps: analysis.comparableSales,
      subjectAddress,
      subjectFloorAreaSqm: subjectFloor,
      subjectPriorSales: priorSales,
      postcode: opts.epc?.postcode || opts.landRegistry?.postcode || null,
    });
    analysis.comparableSales = comps;
    analysis.compEpcHitRate = epcHitRate;
  } catch (err: any) {
    warnings.push(`comps: ${err?.message || err}`);
  }

  // Schools / transport selected in finalizeReport from GIAS / NaPTAN — do not
  // re-geocode LLM school names here.

  // P5 specs resolution
  if (Array.isArray(analysis.specs)) {
    analysis.specs = resolveSpecsRows(analysis.specs as { label?: string; value?: string }[]);
  }

  const scores = applyDeterministicScores(analysis, buildScoreInputs(analysis, opts));
  analysis.scores = scores;

  collapseDuplicatePlanning(analysis);

  const { replacements } = dedupeAnalysisText(analysis);
  if (replacements.length) {
    warnings.push(...replacements.map((r) => `dedupe: ${r}`));
  }

  applySoldMode(analysis, opts.modeCtx);
  applyCrimeFactSync(analysis, opts.crime);
  applyFloodFact(analysis, opts.flood);
  applyDeterministicScores(analysis, buildScoreInputs(analysis, opts));
  applyDeterministicForecasts(analysis, opts.scrapPrice);

  scrubUrlsEverywhere(analysis);

  const { warnings: banWarnings } = await enforceBannedTerms(analysis, opts.rewriteField);
  warnings.push(...banWarnings);

  if (opts.modeCtx.mode === 'recently_sold') {
    delete analysis.offerStrategy;
    analysis.reportMode = 'recently_sold';
    analysis.priceLabel = opts.modeCtx.priceLabel;
  } else if (opts.modeCtx.mode === 'on_market' && !opts.modeCtx.hasLiveAsking) {
    delete analysis.offerStrategy;
    analysis.reportMode = 'on_market';
    analysis.priceLabel = opts.modeCtx.priceLabel || 'Estimated value';
    analysis.hasLiveAsking = false;
  } else {
    analysis.hasLiveAsking = opts.modeCtx.hasLiveAsking;
  }

  if (Array.isArray(analysis.specs)) {
    analysis.specs = resolveSpecsRows(
      (analysis.specs as { label?: string; value?: string }[]).filter(
        (row) =>
          row.label &&
          row.value &&
          !/^not specified$/i.test(String(row.value)) &&
          String(row.value).trim() !== '—' &&
          String(row.value).trim() !== 'N/A'
      )
    );
  }

  // Final crime apply + interpretation scrub after banned-term rewrite
  applyCrimeFactSync(analysis, opts.crime);
  await scrubCrimeInterpretation(analysis, opts.crime, opts.rewriteField);

  return { analysis, warnings, milestones };
}
