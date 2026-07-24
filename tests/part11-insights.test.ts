/**
 * Part 11 — Interpretation layer: Class 1/2/3 validators, era gating, both fixtures.
 */
import { describe, expect, it, beforeAll } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { finalizeReport } from '../src/lib/finalizeReport';
import { PDFReport } from '../src/components/PDFReport';
import {
  validateClass1Text,
  validateClass2Text,
  validateClass3Insight,
  buildInsightsPackage,
  rankInsights,
  type Insight,
} from '../src/lib/reportInsights';
import { buildVerifiedFactBag } from '../src/lib/verifiedFacts';
import type { ComparativeStat } from '../src/lib/comparativeStats';
import { V4_DEFECT_LLM_ANALYSIS } from './fixtures/v4DefectLlmAnalysis';
import {
  assertRecordedFixturesReady,
  loadRecordedCrime,
  loadRecordedLivingHere,
  recordedPropertyFacts,
  PENTLAND_ADDRESS,
  RECORDED_DIR,
} from './helpers/loadRecorded';
import type { PropertyAnalysis } from '../src/types';
import type { PropertyFacts } from '../src/lib/propertyFacts';
import type { EpcLookup, EpcRecord } from '../src/lib/epcLookup';
import type { LandRegistryLookup } from '../src/lib/landRegistryLookup';
import type { CrimeLookup } from '../src/lib/policeUkLookup';
import fs from 'fs';
import path from 'path';

const GYPSY_ADDRESS = '3A Gypsy Lane, Nunthorpe, Middlesbrough, TS7 0GY';

function loadGypsyFacts(): PropertyFacts {
  const epcRaw = JSON.parse(
    fs.readFileSync(path.join(RECORDED_DIR, 'epc-ts7-0gy.json'), 'utf8')
  ) as {
    postcode: string;
    certificates: EpcRecord[];
    subjectMatch: EpcRecord;
  };
  const lr = JSON.parse(
    fs.readFileSync(path.join(RECORDED_DIR, 'land-registry-ts7-0gy.json'), 'utf8')
  ) as LandRegistryLookup;
  const epc: EpcLookup = {
    postcode: epcRaw.postcode,
    matched: epcRaw.subjectMatch,
    candidates: epcRaw.certificates,
  };
  return {
    address: GYPSY_ADDRESS,
    epc,
    landRegistry: lr,
    brief: '',
    sources: [],
  };
}

function loadGypsyCrime(): CrimeLookup {
  return JSON.parse(
    fs.readFileSync(path.join(RECORDED_DIR, 'crime-ts7-0gy.json'), 'utf8')
  ) as CrimeLookup;
}

function renderPdfText(analysis: PropertyAnalysis): string {
  const html = renderToStaticMarkup(
    React.createElement(PDFReport, {
      analysis,
      buyerGoal: 'First-Time Buyer',
    })
  );
  return html
    .replace(/<[^>]+>/g, '\n')
    .replace(/&amp;/g, '&')
    .replace(/\n+/g, '\n')
    .trim();
}

const FLOOD_ZONE1 = {
  riversAndSea: 'Very Low',
  surfaceWater: null,
  floodZone: '1',
  sourceUrl: 'https://www.planning.data.gov.uk/dataset/flood-risk-zone',
  fetchedAt: '2026-07-24',
  bandingLabel: 'rivers & sea: Very Low; Flood Zone 1',
  llmContext: 'Flood Zone 1',
  raw: {},
};

describe('Part 11 insight validators (red-team)', () => {
  it('Class 3 citing nonexistent factId → reject', () => {
    const bag = buildVerifiedFactBag({
      analysis: { reportMode: 'on_market', price: '£250,000' },
      facts: null,
    });
    const v = validateClass3Insight(
      'Neighbour dormer implies extension value.',
      ['planning.applications', 'epc.floorAreaSqm'],
      bag
    );
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/unknown factId/i);
    console.log('[Part11 RED-TEAM Class3]', v);
  });

  it('Class 3 with bad factId drops after retries in buildInsightsPackage path', async () => {
    const analysis: Record<string, unknown> = {
      address: PENTLAND_ADDRESS,
      location: { address: PENTLAND_ADDRESS, postcode: 'DL6 3ND', town: 'Northallerton' },
      reportMode: 'recently_sold',
      price: '£672,400',
    };
    let attempts = 0;
    const pkg = await buildInsightsPackage(analysis, {
      facts: recordedPropertyFacts(),
      crime: loadRecordedCrime(),
      flood: FLOOD_ZONE1,
      buyerGoal: 'First-time Buyer',
      insightsLlm: async () => {
        attempts += 1;
        return {
          insights: [
            {
              id: 'evil',
              insightClass: 3,
              text: 'Secret tunnel under the Moors.',
              headline: 'Secret tunnel',
              derivedFrom: ['nonexistent.fact'],
              section: 'summary',
            },
          ],
        };
      },
      rewriteInsight: async (text) => {
        attempts += 1;
        return text;
      },
    });
    expect(pkg.insights.every((i) => i.id !== 'evil')).toBe(true);
    expect(pkg.validationLog.some((e) => /unknown factId/i.test(e.detail))).toBe(true);
    console.log('[Part11 RED-TEAM drop log]', JSON.stringify(pkg.validationLog.filter((e) => e.decision !== 'pass'), null, 2));
    expect(attempts).toBeGreaterThanOrEqual(1);
  });

  it('Class 1 unhedged property assertion without EPC citation → reject', () => {
    const epc = recordedPropertyFacts().epc.matched;
    const v = validateClass1Text(
      'The property has uninsulated walls and will need expensive works.',
      epc
    );
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/unhedged/i);
    console.log('[Part11 RED-TEAM Class1]', v);
  });

  it('Class 2 numeral mismatch → reject', () => {
    const stat: ComparativeStat = {
      id: 'floorAreaPercentile',
      value: 85,
      displayValue: '85',
      comparator: 'semi-detached',
      basis: 'test',
      sampleSize: 10,
    };
    const v = validateClass2Text('Larger than about 61% of similar homes.', stat);
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/numeral mismatch/i);
    console.log('[Part11 RED-TEAM Class2]', v);
  });

  it('era gating: no age band → no Class 1 / no era section', async () => {
    const facts = recordedPropertyFacts();
    const stripped = {
      ...facts,
      epc: {
        ...facts.epc,
        matched: facts.epc.matched
          ? { ...facts.epc.matched, constructionAgeBand: '' }
          : null,
      },
    };
    const analysis = structuredClone(V4_DEFECT_LLM_ANALYSIS) as unknown as Record<string, unknown>;
    delete (analysis as { price?: string }).price;
    const out = await finalizeReport(analysis, {
      buyerGoal: 'First-time Buyer',
      scrap: { bedrooms: '4', propertyType: 'Detached' },
      facts: stripped,
      lookups: { crime: loadRecordedCrime(), flood: FLOOD_ZONE1, livingHere: loadRecordedLivingHere() },
      growthAsOf: new Date('2026-07-24'),
      skipLiveLivingHere: true,
      skipLiveOfcom: true,
    });
    expect((out.eraProfile as { ageBand: string | null }).ageBand).toBeFalsy();
    expect(((out.eraProfile as { issues: unknown[] }).issues || []).length).toBe(0);
    expect(
      ((out.insights as Insight[]) || []).every((i) => i.insightClass !== 1)
    ).toBe(true);
    const pdf = renderPdfText(out as unknown as PropertyAnalysis);
    expect(pdf).not.toMatch(/Living with a /i);
    expect(pdf).not.toMatch(/This era of house/i);
  }, 60_000);
});

describe('Part 11 both fixtures — front page + era', () => {
  let pentland: Record<string, unknown>;
  let gypsy: Record<string, unknown>;
  let pentlandPdf: string;
  let gypsyPdf: string;

  beforeAll(async () => {
    assertRecordedFixturesReady();

    const llmP = structuredClone(V4_DEFECT_LLM_ANALYSIS) as unknown as Record<string, unknown>;
    delete (llmP as { price?: string }).price;
    pentland = await finalizeReport(llmP, {
      buyerGoal: 'First-time Buyer',
      scrap: { bedrooms: '4', propertyType: 'Detached' },
      facts: recordedPropertyFacts(),
      lookups: {
        crime: loadRecordedCrime(),
        flood: FLOOD_ZONE1,
        livingHere: loadRecordedLivingHere(),
      },
      growthAsOf: new Date('2026-07-24'),
      skipLiveLivingHere: true,
      skipLiveOfcom: true,
    });
    pentlandPdf = renderPdfText(pentland as unknown as PropertyAnalysis);

    const llmG = structuredClone(V4_DEFECT_LLM_ANALYSIS) as unknown as Record<string, unknown>;
    llmG.location = {
      address: GYPSY_ADDRESS,
      postcode: 'TS7 0GY',
      town: 'Nunthorpe',
    };
    llmG.title = '3A Gypsy Lane';
    llmG.price = '£265,000';
    llmG.propertyType = 'Semi-detached house';
    gypsy = await finalizeReport(llmG, {
      buyerGoal: 'First-time Buyer',
      scrap: { bedrooms: '3', propertyType: 'Semi-detached', price: '£265,000' },
      facts: loadGypsyFacts(),
      lookups: { crime: loadGypsyCrime(), flood: FLOOD_ZONE1 },
      growthAsOf: new Date('2026-07-24'),
      skipLiveLivingHere: true,
      skipLiveOfcom: true,
    });
    gypsyPdf = renderPdfText(gypsy as unknown as PropertyAnalysis);

    // Write evidence extracts
    const outDir = path.join(process.cwd(), 'fixtures', 'evidence');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'part11-pentland.pdf.txt'), pentlandPdf);
    fs.writeFileSync(path.join(outDir, 'part11-gypsy.pdf.txt'), gypsyPdf);
    fs.writeFileSync(
      path.join(outDir, 'part11-insights-summary.json'),
      JSON.stringify(
        {
          pentland: {
            frontPage: pentland.frontPageInsights,
            eraTitle: (pentland.eraProfile as { title?: string })?.title,
            insightIds: ((pentland.insights as Insight[]) || []).map((i) => i.id),
          },
          gypsy: {
            frontPage: gypsy.frontPageInsights,
            eraTitle: (gypsy.eraProfile as { title?: string })?.title,
            insightIds: ((gypsy.insights as Insight[]) || []).map((i) => i.id),
          },
        },
        null,
        2
      )
    );
  }, 180_000);

  it('Pentland: ≥3 front-page insights + era section', () => {
    const fp = (pentland.frontPageInsights as unknown[]) || [];
    expect(fp.length).toBeGreaterThanOrEqual(3);
    expect((pentland.eraProfile as { ageBand?: string }).ageBand).toMatch(/1950/);
    expect(pentlandPdf).toMatch(/Three things worth knowing/i);
    expect(pentlandPdf).toMatch(/Living with a 1950[–-]1966/i);
    console.log('[Part11 Pentland front]', JSON.stringify(fp, null, 2));
  });

  it('Gypsy Lane: ≥3 front-page insights + 1930s era section', () => {
    const fp = (gypsy.frontPageInsights as unknown[]) || [];
    expect(fp.length).toBeGreaterThanOrEqual(3);
    expect((gypsy.eraProfile as { ageBand?: string }).ageBand).toMatch(/1930/);
    expect(gypsyPdf).toMatch(/Three things worth knowing/i);
    expect(gypsyPdf).toMatch(/Living with a 1930[–-]1949/i);
    console.log('[Part11 Gypsy front]', JSON.stringify(fp, null, 2));
  });

  it('determinism: insight selection identical across two runs', async () => {
    const run = async () => {
      const llm = structuredClone(V4_DEFECT_LLM_ANALYSIS) as unknown as Record<string, unknown>;
      delete (llm as { price?: string }).price;
      const out = await finalizeReport(llm, {
        buyerGoal: 'First-time Buyer',
        scrap: { bedrooms: '4', propertyType: 'Detached' },
        facts: recordedPropertyFacts(),
        lookups: {
          crime: loadRecordedCrime(),
          flood: FLOOD_ZONE1,
          livingHere: loadRecordedLivingHere(),
        },
        growthAsOf: new Date('2026-07-24'),
        skipLiveLivingHere: true,
        skipLiveOfcom: true,
      });
      return ((out.insights as Insight[]) || []).map((i) => i.id);
    };
    const a = await run();
    const b = await run();
    expect(a).toEqual(b);
    console.log('[Part11 determinism ids]', a.join(', '));
  });

  it('ranking prefers Class 3 then confirmed Class 1 then Class 2', () => {
    const ranked = rankInsights([
      { id: 'c2', insightClass: 2, text: 't', headline: 'h', rankScore: 99 },
      {
        id: 'c1',
        insightClass: 1,
        text: 't',
        headline: 'h',
        rankScore: 10,
        eraIssue: {
          id: 'x',
          issue: 'i',
          check: 'c',
          confirmedByEpc: true,
        },
      },
      {
        id: 'c3',
        insightClass: 3,
        text: 't',
        headline: 'h',
        rankScore: 1,
        derivedFrom: ['a', 'b'],
      },
    ]);
    expect(ranked.map((r) => r.id)).toEqual(['c3', 'c1', 'c2']);
  });
});
