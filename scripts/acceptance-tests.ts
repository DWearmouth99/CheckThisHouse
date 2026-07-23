/**
 * Acceptance tests for D1–D9 report pipeline defects.
 * Run: npx tsx scripts/acceptance-tests.ts
 *
 * Full live regeneration (requires GEMINI_API_KEY):
 *   npx tsx scripts/regenerate-acceptance-fixtures.ts
 */

import { enforceBannedTerms, BANNED_TERMS, EPC_RANGE_RE, findBannedHits } from '../src/lib/bannedTerms';
import {
  computeForecastMilestones,
  chartAxisTicks,
  applyDeterministicForecasts,
  formatGbpFull,
  forecastAssumptionsSentence,
} from '../src/lib/deterministicForecasts';
import { computeDeterministicScores } from '../src/lib/deterministicScores';
import { estimateTransactionTax } from '../src/lib/ukPropertyTax';
import { detectReportMode } from '../src/lib/reportWritingEngine';
import { enforceReportPipeline } from '../src/lib/enforceReportPipeline';
import { filterRecordsBySubjectPostcode, assertPayloadHasNoForeignTokens } from '../src/lib/addressMatch';
import { assertNoNearDuplicateBlocks } from '../src/lib/textDedup';
import { buildMechanicalComps } from '../src/lib/compBasis';
import { computeCrimeRate, last12Months } from '../src/lib/policeUkLookup';
import { resolveSpecsRows, ratingOrBlank, haversineMiles } from '../src/lib/notOnRecordRules';
import { modeLabels } from '../src/lib/reportModeLabels';
import { scrubEpcUrlsInText } from '../src/lib/epcLinkFormat';
import { buildGeminiResponseSchema } from '../src/lib/geminiAnalyze';
import type { LandRegistrySale } from '../src/lib/landRegistryLookup';

type Row = { id: string; test: string; pass: boolean; evidence: string };

const rows: Row[] = [];

function assert(id: string, test: string, pass: boolean, evidence: string) {
  rows.push({ id, test, pass, evidence });
  const mark = pass ? 'PASS' : 'FAIL';
  console.log(`[${mark}] ${id}: ${test}`);
  if (!pass) console.log(`       evidence: ${evidence}`);
}

function flattenText(obj: unknown): string {
  if (typeof obj === 'string') return obj;
  if (Array.isArray(obj)) return obj.map(flattenText).join('\n');
  if (obj && typeof obj === 'object') {
    return Object.values(obj as object).map(flattenText).join('\n');
  }
  return '';
}

async function run() {
  // --- D1 Mode B ---
  const sales: LandRegistrySale[] = [
    {
      paon: '1',
      saon: '',
      street: 'PENTLAND',
      town: 'NORTHALLERTON',
      postcode: 'DL6 3ND',
      amount: 595000,
      date: '2026-04-15',
      propertyType: 'Detached',
      addressLabel: '1 Pentland, Northallerton DL6 3ND',
    },
  ];
  const mode = detectReportMode({
    liveAsking: null,
    thisPropertySales: sales,
    reportDate: new Date('2026-07-22'),
  });
  assert(
    'D1',
    'detectReportMode → recently_sold when sale < 12 months and no live asking',
    mode.mode === 'recently_sold' && /Last Sold Price/i.test(mode.priceLabel),
    `mode=${mode.mode} label=${mode.priceLabel}`
  );

  const soldSchema = buildGeminiResponseSchema('recently_sold') as {
    properties: Record<string, unknown>;
    required: string[];
  };
  assert(
    'D1',
    'SOLD schema omits offerStrategy (not generate-then-hide)',
    !('offerStrategy' in soldSchema.properties) && !soldSchema.required.includes('offerStrategy'),
    `keys=${Object.keys(soldSchema.properties).includes('offerStrategy')}`
  );

  const soldAnalysis: Record<string, unknown> = {
    price: '£595,000',
    summary: 'A recently sold detached home.',
    offerStrategy: {
      lowOffer: 'Opening Offer £500k',
      fairOffer: '£595k',
      premiumOffer: 'Walk-away £620k',
      negotiationTips: ['How to Negotiate step 1', 'step 2'],
    },
    valuation: { conservative: '£580k', fair: '£595k', optimistic: '£610k', growthAssumptions: { lowPct: 1, centralPct: 2, highPct: 3, basis: 'test' } },
    scores: {},
    specs: [],
  };
  await enforceReportPipeline(soldAnalysis, { modeCtx: mode, scrapPrice: undefined });
  const soldText = flattenText(soldAnalysis);
  assert(
    'D1',
    'After enforce: has Last Sold Price; no Opening Offer / Walk-away / How to Negotiate; no Asking Price; no offerStrategy',
    /Last Sold Price/i.test(String(soldAnalysis.priceLabel || '')) &&
      !soldAnalysis.offerStrategy &&
      !/Opening Offer/i.test(soldText) &&
      !/Walk-away/i.test(soldText) &&
      !/How to Negotiate/i.test(soldText) &&
      !/Asking Price/i.test(String(soldAnalysis.priceLabel || '')),
    `label=${soldAnalysis.priceLabel} offerStrategy=${Boolean(soldAnalysis.offerStrategy)} panel=${Boolean(soldAnalysis.recentlySoldPanel)}`
  );

  // --- D2 address filter ---
  const apps = [
    { address: '12 Pentland Drive, Huntington, York YO32 9QF', reference: '19/01242/FUL' },
    { address: '1 Pentland, Northallerton DL6 3ND', reference: '22/00111/FUL' },
  ];
  const drops: { source: string; reason: string; preview: string }[] = [];
  const kept = filterRecordsBySubjectPostcode({
    source: 'test.planning',
    subjectPostcode: 'DL6 3ND',
    records: apps,
    getPostcode: (a) => a.address,
    getAddress: (a) => a.address,
    drops,
  });
  assert(
    'D2',
    'Wrong-postcode York planning dropped; DL6 kept',
    kept.length === 1 && kept[0]!.reference === '22/00111/FUL' && drops.length === 1,
    `kept=${kept.map((k) => k.reference).join(',')} drops=${drops.length}`
  );

  const payload = `Subject DL6 3ND. Planning: 22/00111/FUL at 1 Pentland.`;
  const badPayload = `${payload} Also 19/01242/FUL Huntington YO32 York Pentland Drive`;
  const ok = assertPayloadHasNoForeignTokens(payload, [
    'YO32',
    'York',
    'Pentland Drive',
    '19/01242',
    '25/00196',
    'Huntington',
  ]);
  const bad = assertPayloadHasNoForeignTokens(badPayload, [
    'YO32',
    'York',
    'Pentland Drive',
    '19/01242',
    '25/00196',
    'Huntington',
  ]);
  assert('D2', 'Payload assert rejects foreign tokens', ok.ok && !bad.ok, `ok=${ok.ok} badHits=${bad.hits.join(',')}`);

  // --- D3 banned terms ---
  const synthetic: Record<string, unknown> = {
    summary: 'This off-grid home is authoritative. Records supplied were disregarded. Firmly discounted. The provided data says baths Not specified. EPC rating likely D to F.',
  };
  const { cleaned } = await enforceBannedTerms(synthetic);
  const cleanedText = flattenText(cleaned);
  const remaining = BANNED_TERMS.filter((t) => cleanedText.toLowerCase().includes(t.toLowerCase()));
  assert(
    'D3',
    'Banned terms + EPC range + Not specified scrubbed from synthetic response',
    remaining.length === 0 && !EPC_RANGE_RE.test(cleanedText) && !/not specified/i.test(cleanedText),
    `remaining=${remaining.join('|')} text=${cleanedText.slice(0, 200)}`
  );

  // --- D4 forecasts + SDLT + axes ---
  const milestones = computeForecastMilestones(595000, {
    lowPct: 1,
    centralPct: 2,
    highPct: 3,
    basis: 'test',
  });
  const analysisForecast: Record<string, unknown> = {
    price: '£595,000',
    valuation: {
      conservative: '£580,000',
      fair: '£595,000',
      optimistic: '£610,000',
      growthAssumptions: { lowPct: 1, centralPct: 2, highPct: 3, basis: 'test' },
    },
  };
  applyDeterministicForecasts(analysisForecast);
  const v = analysisForecast.valuation as { forecast1y: string; forecast10y: string };
  const fm = analysisForecast.forecastMilestones as {
    forecast1y: number;
    forecast10y: number;
  };
  assert(
    'D4',
    'Cards values === chart plotted values (same forecastMilestones object)',
    fm.forecast1y === milestones.forecast1y &&
      fm.forecast10y === milestones.forecast10y &&
      v.forecast1y.includes(String(milestones.forecast1y).slice(0, 3)),
    `1y=${fm.forecast1y} 10y=${fm.forecast10y} card1y=${v.forecast1y}`
  );

  const sdlt595 = estimateTransactionTax({
    price: 595_000,
    nation: 'england_ni',
    buyerGoal: 'homebuyer primary residence',
  });
  const sdlt672 = estimateTransactionTax({
    price: 672_400,
    nation: 'england_ni',
    buyerGoal: 'homebuyer primary residence',
  });
  assert(
    'D4',
    'SDLT £595,000 → £19,750 and £672,400 → £23,620 (primary residence)',
    sdlt595?.total === 19750 && sdlt672?.total === 23620,
    `595→${sdlt595?.total} 672→${sdlt672?.total}`
  );

  const ticks = chartAxisTicks(600_000, 850_000);
  assert(
    'P2',
    'Axis ticks 4–6 and every tick divisible by 50,000',
    ticks.length >= 4 &&
      ticks.length <= 6 &&
      ticks.every((t) => t % 50_000 === 0),
    `ticks=${ticks.join(',')} count=${ticks.length}`
  );

  const cardLabels = [
    formatGbpFull(milestones.forecast1y),
    formatGbpFull(milestones.forecast3y),
    formatGbpFull(milestones.forecast5y),
    formatGbpFull(milestones.forecast10y),
  ];
  const chartLabels = [
    formatGbpFull(fm.forecast1y),
    formatGbpFull(fm.forecast3y),
    formatGbpFull(fm.forecast5y),
    formatGbpFull(fm.forecast10y),
  ];
  assert(
    'P2',
    'Cards values === chart point labels (string equality after formatting)',
    cardLabels.every((c, i) => c === chartLabels[i]),
    `cards=${cardLabels.join('/')} chart=${chartLabels.join('/')}`
  );
  assert(
    'P2',
    'Assumptions sentence has numeric percentage',
    /\d+(\.\d+)?%\s+a year/i.test(forecastAssumptionsSentence(milestones)),
    forecastAssumptionsSentence(milestones)
  );

  // --- D5 / P9 scores deterministic ---
  const scoreInput = {
    epcBand: 'E',
    floodTone: 'positive' as const,
    crimePerThousand: 46.2,
    priceVsCompsPct: 12, // at ceiling → value only
    hasPlanningMatch: true,
    transportMinutesToStation: 15,
    schoolOutstandingOrGood: true,
  };
  const s1 = computeDeterministicScores(scoreInput);
  const s2 = computeDeterministicScores(scoreInput);
  assert(
    'P9',
    'Identical scores across two runs on same fixture inputs',
    JSON.stringify(s1) === JSON.stringify(s2),
    `overall=${s1.overall}`
  );
  const sNoPrice = computeDeterministicScores({ ...scoreInput, priceVsCompsPct: null });
  assert(
    'P9',
    'priceVsCompsPct feeds valueForMoney only (market+risk unchanged when price removed)',
    s1.marketScore === sNoPrice.marketScore &&
      s1.riskLevel === sNoPrice.riskLevel &&
      s1.valueForMoney !== sNoPrice.valueForMoney,
    `value ${s1.valueForMoney}→${sNoPrice.valueForMoney} market=${s1.marketScore} risk=${s1.riskLevel}`
  );

  // --- D6 EPC range / Not specified ---
  assert(
    'D6',
    'EPC range regex matches forbidden output',
    EPC_RANGE_RE.test('EPC rating Estimated D to F'),
    'regex self-check'
  );
  const noEpc: Record<string, unknown> = {
    dueDiligence: { epcAndEnergy: 'Estimated D to F' },
    specs: [{ label: 'Baths', value: 'Not specified' }],
  };
  await enforceReportPipeline(noEpc, {
    modeCtx: { mode: 'on_market', priceLabel: 'Asking price', hasLiveAsking: true },
    epc: { postcode: 'DL6 3ND', matched: null, candidates: [] },
  });
  const noEpcText = flattenText(noEpc);
  assert(
    'D6',
    'No EPC match → no lettered range; no Not specified in output',
    !EPC_RANGE_RE.test(noEpcText) && !/not specified/i.test(noEpcText),
    noEpcText.slice(0, 220)
  );

  // --- D7 dedup ---
  const dup: Record<string, unknown> = {
    propertyWorks: {
      extensionsAndAlterations:
        'Large rear extension approved in 2019 with loft conversion completed to a high standard including ensuite bathrooms and open-plan living.',
    },
    riskAnalysis: {
      planningDevelopments:
        'Large rear extension approved in 2019 with loft conversion completed to a high standard including ensuite bathrooms and open-plan living.',
    },
  };
  await enforceReportPipeline(dup, {
    modeCtx: { mode: 'on_market', priceLabel: 'Asking price', hasLiveAsking: true },
  });
  const dedupCheck = assertNoNearDuplicateBlocks(dup);
  assert(
    'D7',
    'No two rendered text blocks >120 chars with similarity >0.9',
    dedupCheck.ok,
    dedupCheck.pairs.join(' | ') || 'no pairs'
  );

  // --- P1 crime rate computation + single print ---
  const months = last12Months('2025-12');
  assert('P1', 'last12Months returns 12 months ending at endMonth', months.length === 12 && months[11] === '2025-12', months.join(','));
  const { rate, gate } = computeCrimeRate(120, 1800);
  assert(
    'P1',
    'computeCrimeRate(120, 1800) → 66.7 within gate',
    rate === 66.7 && gate === 'ok',
    `rate=${rate} gate=${gate}`
  );
  const low = computeCrimeRate(2, 1800);
  assert('P1', 'Sanity gate too_low when rate < 5', low.gate === 'too_low' && low.rate == null, `gate=${low.gate}`);
  const high = computeCrimeRate(900, 1800);
  assert('P1', 'Sanity gate too_high when rate > 400', high.gate === 'too_high' && high.rate == null, `gate=${high.gate}`);

  const withCrime: Record<string, unknown> = {
    areaAnalysis: {
      crimeSafety: {
        rating: 'Low',
        description: 'Approx 0.7 incidents per 1,000 residents recorded locally near parks.',
      },
    },
  };
  await enforceReportPipeline(withCrime, {
    modeCtx: { mode: 'on_market', priceLabel: 'Asking price', hasLiveAsking: true },
    crime: {
      postcode: 'DL6 3ND',
      lat: 54.3,
      lng: -1.4,
      crimeCountYear: 84,
      monthStart: '2025-01',
      monthEnd: '2025-12',
      population: 1800,
      populationSource: 'test',
      incidentsPerThousand: 46.7,
      label: '46.7 incidents per 1,000 residents / year',
      interpretationHint: 'Crime levels appear typical for many UK residential areas on this metric.',
      sourceUrl: 'https://data.police.uk/',
      reliable: true,
      debug: {
        monthlyCounts: [],
        incidents12m: 84,
        population: 1800,
        rate: 46.7,
        gate: 'ok',
      },
    },
  });
  const crimeBlob = flattenText(withCrime.areaAnalysis);
  const perThousandHits = crimeBlob.match(/\d+(\.\d+)?\s*(incidents\s*)?(per|\/)\s*1,?000/gi) || [];
  assert(
    'P1',
    'Exactly one per-1,000 figure; description stripped of rate',
    perThousandHits.length === 1 &&
      !/0\.7/.test(crimeBlob) &&
      /typical for many UK/i.test(
        String((withCrime.areaAnalysis as { crimeSafety?: { description?: string } }).crimeSafety?.description || '')
      ),
    `hits=${perThousandHits.length} blob=${crimeBlob.slice(0, 200)}`
  );

  // --- P5 not-on-record ---
  const specsResolved = resolveSpecsRows([
    { label: 'Bedrooms', value: '4' },
    { label: 'Bedrooms / rooms', value: 'Not on record' },
    { label: 'Garden', value: 'Not on record' },
    { label: 'Floor area', value: 'Not on record' },
  ]);
  assert(
    'P5',
    'Duplicate bedroom rows collapsed; garden dropped; floor area allowlisted',
    specsResolved.length === 2 &&
      specsResolved.some((r) => /bedroom/i.test(r.label) && r.value === '4') &&
      specsResolved.some((r) => /floor area/i.test(r.label) && /Not on record — verify/i.test(r.value)) &&
      !specsResolved.some((r) => /garden/i.test(r.label)),
    JSON.stringify(specsResolved)
  );
  assert('P5', 'ratingOrBlank blanks Not on record', ratingOrBlank('Not on record') === '', 'blank');
  assert(
    'P5',
    'haversineMiles known distance ~69 mi London–Birmingham-ish sanity',
    Math.abs(haversineMiles(51.5, -0.12, 52.48, -1.9) - 100) < 30,
    String(haversineMiles(51.5, -0.12, 52.48, -1.9))
  );

  // --- P6 mode labels ---
  const soldLabels = modeLabels('recently_sold');
  assert(
    'P6',
    'SOLD mode label map: Base last sold + Was the sale price fair',
    /last sold price/i.test(soldLabels.chartBaseCaption('£672,400')) &&
      /Was the sale price fair/i.test(soldLabels.fairPriceBoxTitle) &&
      !/Base asking/i.test(soldLabels.chartBaseCaption('£672,400')),
    soldLabels.chartBaseCaption('£672,400')
  );

  // --- P7 EPC URL shorten ---
  const fullUrl =
    'https://find-energy-certificate.service.gov.uk/energy-certificate/2140-3052-0206-9665-0204';
  assert(
    'P7',
    'scrubEpcUrlsInText removes https://find-energy-certificate verbatim',
    !scrubEpcUrlsInText(`Source: ${fullUrl}`).includes('https://find-energy-certificate') &&
      /gov\.uk EPC certificate 2140-3052-0206-9665-0204/.test(scrubEpcUrlsInText(`Source: ${fullUrl}`)),
    scrubEpcUrlsInText(`Source: ${fullUrl}`)
  );

  // --- P3 mechanical comps (no network EPC — empty notes still no "not established") ---
  const { comps: mech } = await buildMechanicalComps({
    comps: [
      {
        address: 'Somewhere Else DL6 3ND',
        price: '£400,000',
        soldDate: '2024-01-01',
        similarity: 'Reason for price difference not established.',
      },
    ],
    subjectFloorAreaSqm: '212',
  });
  assert(
    'P3',
    'Mechanical comps retire "not established"; max 6 rows',
    mech.length <= 6 && !mech.some((c) => /not established/i.test(c.similarity + c.note)),
    JSON.stringify(mech).slice(0, 200)
  );

  // Summary table
  console.log('\n=== ACCEPTANCE TABLE ===');
  console.log('| Defect | Acceptance test | Result | Evidence |');
  console.log('|--------|-----------------|--------|----------|');
  for (const r of rows) {
    console.log(
      `| ${r.id} | ${r.test.replace(/\|/g, '/')} | ${r.pass ? 'PASS' : 'FAIL'} | ${r.evidence.replace(/\|/g, '/').slice(0, 120)} |`
    );
  }
  const failed = rows.filter((r) => !r.pass);
  console.log(`\n${rows.length - failed.length}/${rows.length} assertions PASS`);
  if (failed.length) {
    process.exitCode = 1;
    console.error('FAILED:', failed.map((f) => f.id).join(', '));
  }
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
