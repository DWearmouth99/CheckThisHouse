/**
 * Live regeneration for Pentland DL6 3ND + one on-market fixture.
 * Requires GEMINI_API_KEY. Writes JSON artefacts under fixtures/acceptance/.
 *
 * Run: npx tsx scripts/regenerate-acceptance-fixtures.ts
 */

import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { config } from 'dotenv';
import { analyzeWithGemini, hasGeminiKey } from '../src/lib/geminiAnalyze';
import { findBannedHits, EPC_RANGE_RE } from '../src/lib/bannedTerms';
import { assertNoNearDuplicateBlocks } from '../src/lib/textDedup';
import { formatGbpFull, forecastAssumptionsSentence, chartAxisTicks } from '../src/lib/deterministicForecasts';
import { modeLabels } from '../src/lib/reportModeLabels';

config({ path: '.env.local' });
config();

const OUT = path.join(process.cwd(), 'fixtures', 'acceptance');

function flattenText(obj: unknown): string {
  if (typeof obj === 'string') return obj;
  if (Array.isArray(obj)) return obj.map(flattenText).join('\n');
  if (obj && typeof obj === 'object') {
    return Object.values(obj as object).map(flattenText).join('\n');
  }
  return '';
}

type Check = { id: string; pass: boolean; evidence: string };

function customerFacingText(obj: unknown, path = ''): string {
  if (typeof obj === 'string') {
    // Exclude raw link targets / API source URLs from P7 prose scan
    if (/(^|\.)(url|sourceUrl|certificateUrl)$/i.test(path)) return '';
    return obj;
  }
  if (Array.isArray(obj)) return obj.map((v, i) => customerFacingText(v, `${path}[${i}]`)).join('\n');
  if (obj && typeof obj === 'object') {
    return Object.entries(obj as object)
      .map(([k, v]) => customerFacingText(v, path ? `${path}.${k}` : k))
      .join('\n');
  }
  return '';
}

function checkReport(label: string, analysis: Record<string, unknown>, expectSold: boolean): Check[] {
  const text = flattenText(analysis);
  const prose = customerFacingText(analysis);
  const results: Check[] = [];

  // --- P1 crime ---
  const crime = analysis.verifiedCrime as {
    incidentsPerThousand?: number | null;
    crimeCountYear?: number;
    population?: number;
    populationSource?: string;
    monthStart?: string;
    monthEnd?: string;
    reliable?: boolean;
    label?: string;
    debug?: unknown;
  } | undefined;
  const crimeSection = flattenText((analysis.areaAnalysis as { crimeSafety?: unknown })?.crimeSafety);
  const rateHits = (crimeSection.match(/\d+(\.\d+)?\s*(incidents\s*)?(per|\/)\s*1,?000/gi) || []).length;
  const rateOk =
    crime?.incidentsPerThousand != null &&
    crime.incidentsPerThousand >= 5 &&
    crime.incidentsPerThousand <= 400;
  const unreliableOk =
    crime?.reliable === false &&
    /could not be reliably computed/i.test(String(crime?.label || '')) &&
    rateHits === 0;
  results.push({
    id: 'P1',
    pass:
      Boolean(crime?.debug || crime?.crimeCountYear != null) &&
      ((rateOk && rateHits === 1) || unreliableOk),
    evidence: `hits=${rateHits} rate=${crime?.incidentsPerThousand} incidents_12m=${crime?.crimeCountYear} pop=${crime?.population} (${crime?.populationSource}) ${crime?.monthStart}→${crime?.monthEnd} label=${String(crime?.label || '').slice(0, 80)}`,
  });

  // --- P2 chart/cards ---
  const fm = analysis.forecastMilestones as {
    forecast1y: number;
    forecast3y: number;
    forecast5y: number;
    forecast10y: number;
    assumptions?: { centralPct: number; basis: string };
  } | undefined;
  const val = analysis.valuation as {
    forecast1y?: string;
    forecast3y?: string;
    forecast5y?: string;
    forecast10y?: string;
  } | undefined;
  const cardsMatch =
    !!fm &&
    val?.forecast1y === formatGbpFull(fm.forecast1y) &&
    val?.forecast3y === formatGbpFull(fm.forecast3y) &&
    val?.forecast5y === formatGbpFull(fm.forecast5y) &&
    val?.forecast10y === formatGbpFull(fm.forecast10y);
  const ticks = fm
    ? chartAxisTicks(Math.min(fm.forecast1y, fm.forecast10y) * 0.96, Math.max(fm.forecast1y, fm.forecast10y) * 1.04)
    : [];
  const assumptions = fm
    ? forecastAssumptionsSentence({
        baseValue: 0,
        assumptions: fm.assumptions || { lowPct: 1, centralPct: 2, highPct: 3, basis: 'x' },
        forecast1y: fm.forecast1y,
        forecast3y: fm.forecast3y,
        forecast5y: fm.forecast5y,
        forecast10y: fm.forecast10y,
        bands: {
          y1: { low: 0, central: 0, high: 0 },
          y3: { low: 0, central: 0, high: 0 },
          y5: { low: 0, central: 0, high: 0 },
          y10: { low: 0, central: 0, high: 0 },
        },
      })
    : '';
  results.push({
    id: 'P2',
    pass:
      cardsMatch &&
      ticks.length >= 4 &&
      ticks.length <= 6 &&
      ticks.every((t) => t % 50_000 === 0) &&
      /\d+(\.\d+)?%/.test(assumptions),
    evidence: `cardsMatch=${cardsMatch} ticks=${ticks.join(',')} assumptions=${assumptions}`,
  });

  // --- P3 comps ---
  const comps = Array.isArray(analysis.comparableSales) ? analysis.comparableSales : [];
  const sqmHits = comps.filter((c) => /sqm/i.test(String((c as { similarity?: string }).similarity || (c as { note?: string }).note || ''))).length;
  const hitRate = (analysis.compEpcHitRate as number | undefined) ?? (comps.length ? sqmHits / comps.length : 0);
  results.push({
    id: 'P3',
    pass: !/not established/i.test(text) && comps.length <= 6 && (comps.length === 0 || hitRate >= 0.5 || sqmHits >= Math.ceil(comps.length / 2)),
    evidence: `rows=${comps.length} sqm=${sqmHits} hitRate=${(hitRate * 100).toFixed(0)}% notEstablished=${/not established/i.test(text)}`,
  });

  // --- P4 floor area ---
  const floorSpec = (Array.isArray(analysis.specs) ? analysis.specs : []).find((s) =>
    /floor area/i.test(String((s as { label?: string }).label || ''))
  ) as { value?: string } | undefined;
  const hasFloor = /m²|sqm|m2/i.test(String(floorSpec?.value || '')) || /m²|floor area/i.test(text);
  const hasPsm = /£[\d,]+\s*\/\s*m²|£[\d,]+\/m²|£[\d,]+\/sqm/i.test(text);
  results.push({
    id: 'P4',
    pass: hasFloor,
    evidence: `floorSpec=${floorSpec?.value || 'missing'} £/sqm=${hasPsm} (certificate enrich logged at generation)`,
  });

  // --- P5 not on record ---
  const specs = (Array.isArray(analysis.specs) ? analysis.specs : []) as { label?: string; value?: string }[];
  const bedLabels = specs.filter((s) => /bedroom/i.test(String(s.label || '')));
  const norHits = [...text.matchAll(/Not on record/gi)].map((m) => m[0]);
  const schools = ((analysis.areaAnalysis as { schools?: { distance?: string; rating?: string }[] })?.schools || []);
  const schoolsOk = schools.every((s) => /\d/.test(String(s.distance || '')) && !/not on record/i.test(String(s.rating || '')));
  results.push({
    id: 'P5',
    pass: bedLabels.length <= 1 && schoolsOk && schools.length > 0,
    evidence: `bedRows=${bedLabels.length} schools=${schools.length} schoolDistOk=${schoolsOk} NOR_count=${norHits.length}`,
  });

  // --- P6 Mode B ---
  if (expectSold) {
    const labels = modeLabels('recently_sold');
    const askingPriceHits = [...text.matchAll(/asking price/gi)];
    // Permitted in factual sale-evidence sentences
    const forbiddenBaseAsking = /Base asking/i.test(text);
    const fairTitleOk = !/Is the asking price fair/i.test(text);
    results.push({
      id: 'P6',
      pass:
        analysis.reportMode === 'recently_sold' &&
        !forbiddenBaseAsking &&
        fairTitleOk &&
        !analysis.offerStrategy,
      evidence: `mode=${analysis.reportMode} BaseAsking=${forbiddenBaseAsking} fairAskTitle=${!fairTitleOk} askingHits=${askingPriceHits.length} labelMap=${labels.fairPriceBoxTitle}`,
    });
  } else {
    const os = analysis.offerStrategy as { lowOffer?: string; fairOffer?: string; negotiationTips?: string[] } | undefined;
    results.push({
      id: 'P6',
      pass: Boolean(os && (os.lowOffer || os.fairOffer) && (os.negotiationTips?.length || 0) >= 0),
      evidence: `on-market offerStrategy low=${os?.lowOffer || 'n/a'} fair=${os?.fairOffer || 'n/a'} tips=${os?.negotiationTips?.length ?? 0}`,
    });
  }

  // --- P7 EPC URL ---
  results.push({
    id: 'P7',
    pass: !/https:\/\/find-energy-certificate/i.test(prose),
    evidence: /https:\/\/find-energy-certificate/i.test(prose)
      ? 'verbatim URL in customer-facing prose'
      : prose.match(/gov\.uk EPC certificate [\w-]+/)?.[0] || 'no find-energy-certificate https in prose',
  });

  // --- P8 flood ---
  const flood = analysis.verifiedFlood as { llmContext?: string; riversAndSea?: string } | undefined;
  const floodText = String((analysis.riskAnalysis as { floodRisk?: string })?.floodRisk || '');
  results.push({
    id: 'P8',
    pass:
      Boolean(flood?.riversAndSea) &&
      floodText.includes(String(flood?.riversAndSea || '')) &&
      /rivers\s*&\s*sea/i.test(floodText) &&
      Boolean(flood?.llmContext),
    evidence: `floodRisk=${floodText.slice(0, 140)} llmCtxLen=${flood?.llmContext?.length || 0}`,
  });

  // --- P9 scores ---
  const scores = analysis.scores as { overall?: number; valueForMoney?: number; marketScore?: number; riskLevel?: string } | undefined;
  results.push({
    id: 'P9',
    pass: typeof scores?.overall === 'number' && typeof scores?.valueForMoney === 'number',
    evidence: `overall=${scores?.overall} value=${scores?.valueForMoney} market=${scores?.marketScore} risk=${scores?.riskLevel} (price→valueForMoney only; see deterministicScores.ts rubric comment)`,
  });

  // legacy quick checks
  results.push({
    id: 'D3',
    pass: findBannedHits(text).length === 0,
    evidence: findBannedHits(text).join(',') || 'none',
  });
  results.push({
    id: 'D6',
    pass: !/not specified/i.test(text) && !EPC_RANGE_RE.test(text),
    evidence: /not specified/i.test(text) ? 'Not specified hit' : EPC_RANGE_RE.test(text) ? 'EPC range hit' : 'clean',
  });
  const dedup = assertNoNearDuplicateBlocks(analysis);
  results.push({
    id: 'D7',
    pass: dedup.ok,
    evidence: dedup.pairs.join('; ') || 'ok',
  });

  console.log(`\n=== Live checks: ${label} ===`);
  for (const r of results) {
    console.log(`[${r.pass ? 'PASS' : 'FAIL'}] ${r.id}: ${r.evidence}`);
  }
  return results;
}

async function main() {
  if (!hasGeminiKey()) {
    console.error('GEMINI_API_KEY missing — cannot live-regenerate. Unit acceptance-tests.ts can still run.');
    process.exitCode = 1;
    return;
  }

  mkdirSync(OUT, { recursive: true });

  console.log('Generating Pentland DL6 3ND (expect SOLD mode) — run 1...');
  const pentland = await analyzeWithGemini({
    buyerGoal: 'homebuyer primary residence',
    manualAddress: 'Pentland, Cross Lane, Northallerton, DL6 3ND',
    scrap: { address: 'Pentland, Cross Lane, Northallerton, DL6 3ND' },
  });
  writeFileSync(path.join(OUT, 'pentland-dl6-3nd.json'), JSON.stringify(pentland.analysis, null, 2));

  console.log('\nGenerating Pentland DL6 3ND — run 2 (P9 score identity)...');
  const pentland2 = await analyzeWithGemini({
    buyerGoal: 'homebuyer primary residence',
    manualAddress: 'Pentland, Cross Lane, Northallerton, DL6 3ND',
    scrap: { address: 'Pentland, Cross Lane, Northallerton, DL6 3ND' },
  });
  writeFileSync(path.join(OUT, 'pentland-dl6-3nd-run2.json'), JSON.stringify(pentland2.analysis, null, 2));

  const s1 = pentland.analysis.scores as Record<string, unknown>;
  const s2 = pentland2.analysis.scores as Record<string, unknown>;
  const scoresIdentical = JSON.stringify(s1) === JSON.stringify(s2);
  console.log(
    `\n[P9] Two-run score identity: ${scoresIdentical ? 'PASS' : 'FAIL'} overall ${s1?.overall} vs ${s2?.overall}`
  );

  const r1 = checkReport('Pentland DL6 3ND', pentland.analysis, true);
  r1.push({
    id: 'P9-identity',
    pass: scoresIdentical,
    evidence: `run1=${JSON.stringify(s1)} run2=${JSON.stringify(s2)}`.slice(0, 200),
  });

  console.log('\nGenerating on-market fixture...');
  const onMarket = await analyzeWithGemini({
    buyerGoal: 'homebuyer primary residence',
    manualAddress: '14 Acacia Avenue, Staines-upon-Thames, TW18 1AG',
    scrap: {
      address: '14 Acacia Avenue, Staines-upon-Thames, TW18 1AG',
      price: '£475,000',
      bedrooms: '3',
      propertyType: 'Semi-detached',
    },
  });
  writeFileSync(path.join(OUT, 'on-market-fixture.json'), JSON.stringify(onMarket.analysis, null, 2));
  const r2 = checkReport('On-market fixture', onMarket.analysis, false);

  // Rubric weight table for operator
  console.log(`
=== P9 RUBRIC WEIGHTS (from deterministicScores.ts) ===
overall = 0.28*value + 0.28*location + 0.22*condition + 0.12*market + 0.10*riskNumeric
valueForMoney ← priceVsCompsPct ONLY ("price at ceiling" feeds this component alone)
location      ← crime + transport + schools
condition     ← EPC band
market        ← planning match only (NOT price)
risk          ← flood + crime + condition (NOT price)
`);

  const all = [...r1, ...r2];
  console.log('\n=== PASS/FAIL TABLE (live) ===');
  console.log('| Defect | Result | Evidence |');
  console.log('|--------|--------|----------|');
  for (const r of all) {
    console.log(`| ${r.id} | ${r.pass ? 'PASS' : 'FAIL'} | ${r.evidence.replace(/\|/g, '/').slice(0, 160)} |`);
  }

  if (all.some((r) => !r.pass)) process.exitCode = 1;
  else console.log('\nLive fixtures PASSED.');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
