/**
 * Part 12 — negative claims, numeric consistency, comps rule, plumbing jargon.
 */
import { describe, expect, it, beforeAll } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { finalizeReport } from '../src/lib/finalizeReport';
import { PDFReport } from '../src/components/PDFReport';
import {
  detectNegativeClaims,
  scrubNegativeClaimsAgainstFacts,
  resolvedFactsFromAnalysis,
} from '../src/lib/negativeClaimGrounding';
import { selectCompsFromLandRegistry } from '../src/lib/selectComps';
import { findPlumbingHits, findBannedHits } from '../src/lib/bannedTerms';
import { detectListingFromResearch } from '../src/lib/listingDetect';
import { V4_DEFECT_LLM_ANALYSIS } from './fixtures/v4DefectLlmAnalysis';
import {
  assertRecordedFixturesReady,
  loadRecordedCrime,
  loadRecordedLivingHere,
  recordedPropertyFacts,
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
const FLOOD_ZONE1 = {
  riversAndSea: 'Very Low',
  surfaceWater: null as string | null,
  floodZone: '1',
  sourceUrl: 'https://www.planning.data.gov.uk/dataset/flood-risk-zone',
  fetchedAt: '2026-07-24',
  bandingLabel:
    'Rivers & sea: Very Low (Flood Zone 1 — planning.data.gov.uk, checked 24 Jul 2026). Surface water: not available from official records at the time of this report — check the GOV.UK long-term flood risk service',
  llmContext: 'Flood Zone 1',
  raw: {},
};

function loadGypsyFacts(): PropertyFacts {
  const epcRaw = JSON.parse(
    fs.readFileSync(path.join(RECORDED_DIR, 'epc-ts7-0gy.json'), 'utf8')
  ) as { postcode: string; certificates: EpcRecord[]; subjectMatch: EpcRecord };
  const lr = JSON.parse(
    fs.readFileSync(path.join(RECORDED_DIR, 'land-registry-ts7-0gy.json'), 'utf8')
  ) as LandRegistryLookup;
  return {
    address: GYPSY_ADDRESS,
    epc: {
      postcode: epcRaw.postcode,
      matched: epcRaw.subjectMatch,
      candidates: epcRaw.certificates,
    },
    landRegistry: lr,
    brief: '',
    sources: [],
  };
}

function loadGypsyCrime(): CrimeLookup {
  return JSON.parse(fs.readFileSync(path.join(RECORDED_DIR, 'crime-ts7-0gy.json'), 'utf8'));
}

function renderPdfText(analysis: PropertyAnalysis): string {
  return renderToStaticMarkup(
    React.createElement(PDFReport, { analysis, buyerGoal: 'First-Time Buyer' })
  )
    .replace(/<[^>]+>/g, '\n')
    .replace(/&amp;/g, '&')
    .replace(/\n+/g, '\n')
    .trim();
}

describe('Part 12 negative-claim validator', () => {
  it('red-team: freehold resolved + unconfirmed tenure prose → scrubbed', () => {
    const facts = { tenure: 'freehold' as const };
    const cons =
      'Unconfirmed Tenure — a leasehold title could introduce ground rents and service charges.';
    const risk = 'Tenure is not on record for this address.';
    expect(detectNegativeClaims(cons).length).toBeGreaterThan(0);
    expect(detectNegativeClaims(risk).length).toBeGreaterThan(0);
    const scrubbedCons = scrubNegativeClaimsAgainstFacts(cons, facts);
    const scrubbedRisk = scrubNegativeClaimsAgainstFacts(risk, facts);
    expect(scrubbedCons.text).toMatch(/freehold/i);
    expect(scrubbedCons.text).not.toMatch(/unconfirmed|could be leasehold/i);
    expect(scrubbedRisk.text).toMatch(/freehold/i);
    expect(scrubbedRisk.text).not.toMatch(/not on record/i);
  });

  it('Gypsy finalize: no tenure contradiction in rendered PDF', async () => {
    assertRecordedFixturesReady();
    const llm = structuredClone(V4_DEFECT_LLM_ANALYSIS) as unknown as Record<string, unknown>;
    llm.location = { address: GYPSY_ADDRESS, postcode: 'TS7 0GY', town: 'Nunthorpe' };
    llm.price = '£265,000';
    llm.cons = [
      {
        title: 'Unconfirmed Tenure',
        desc: 'A leasehold title could introduce ground rents — tenure is not on record.',
      },
    ];
    (llm.riskAnalysis as Record<string, string>).leaseholdIssues =
      'Tenure is not on record. Confirm freehold or leasehold with a conveyancer.';
    const out = await finalizeReport(llm, {
      buyerGoal: 'First-time Buyer',
      scrap: { bedrooms: '3', price: '£265,000' },
      facts: loadGypsyFacts(),
      lookups: { crime: loadGypsyCrime(), flood: FLOOD_ZONE1 },
      growthAsOf: new Date('2026-07-24'),
      skipLiveLivingHere: true,
      skipLiveOfcom: true,
    });
    const pdf = renderPdfText(out as unknown as PropertyAnalysis);
    expect(pdf).toMatch(/Freehold/i);
    expect(pdf).not.toMatch(/Unconfirmed Tenure/i);
    expect(pdf).not.toMatch(/Tenure is not on record/i);
    expect(pdf).not.toMatch(/leasehold title could/i);
    const resolved = resolvedFactsFromAnalysis(out, { estateType: 'freehold' });
    expect(resolved.tenure).toBe('freehold');
  }, 90_000);
});

describe('Part 12 comps most-recent same-street', () => {
  it('comps include the most recent same-street sale in the recorded data', () => {
    const lr = JSON.parse(
      fs.readFileSync(path.join(RECORDED_DIR, 'land-registry-ts7-0gy.json'), 'utf8')
    ) as LandRegistryLookup;
    const street = [...(lr.nearbySameStreet || [])].sort((a, b) => b.date.localeCompare(a.date));
    expect(street.length).toBeGreaterThan(0);
    const mostRecent = street[0]!;
    const comps = selectCompsFromLandRegistry(lr);
    expect(comps.some((c) => c.address === mostRecent.addressLabel && c.soldDate === mostRecent.date)).toBe(
      true
    );
  });
});

describe('Part 12 plumbing jargon + flood/broadband phrasing', () => {
  let pentlandPdf: string;
  let gypsyPdf: string;

  beforeAll(async () => {
    assertRecordedFixturesReady();
    const llmP = structuredClone(V4_DEFECT_LLM_ANALYSIS) as unknown as Record<string, unknown>;
    delete (llmP as { price?: string }).price;
    const pentland = await finalizeReport(llmP, {
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
    llmG.location = { address: GYPSY_ADDRESS, postcode: 'TS7 0GY', town: 'Nunthorpe' };
    llmG.price = '£265,000';
    const gypsy = await finalizeReport(llmG, {
      buyerGoal: 'First-time Buyer',
      scrap: { bedrooms: '3', price: '£265,000' },
      facts: loadGypsyFacts(),
      lookups: { crime: loadGypsyCrime(), flood: FLOOD_ZONE1 },
      growthAsOf: new Date('2026-07-24'),
      skipLiveLivingHere: true,
      skipLiveOfcom: true,
    });
    gypsyPdf = renderPdfText(gypsy as unknown as PropertyAnalysis);

    const outDir = path.join(process.cwd(), 'fixtures', 'evidence');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'part12-gypsy.pdf.txt'), gypsyPdf);
    fs.writeFileSync(path.join(outDir, 'part12-pentland.pdf.txt'), pentlandPdf);
    fs.writeFileSync(
      path.join(outDir, 'part12-plumbing-sweep.json'),
      JSON.stringify(
        {
          pentlandHits: findPlumbingHits(pentlandPdf),
          gypsyHits: findPlumbingHits(gypsyPdf),
          bannedPentland: findBannedHits(pentlandPdf).filter((h) =>
            /api|fetched|pipeline|https?/i.test(h)
          ),
          bannedGypsy: findBannedHits(gypsyPdf).filter((h) => /api|fetched|pipeline|https?/i.test(h)),
        },
        null,
        2
      )
    );
  }, 180_000);

  it('jargon sweep: zero plumbing hits on both fixtures', () => {
    expect(findPlumbingHits(pentlandPdf)).toEqual([]);
    expect(findPlumbingHits(gypsyPdf)).toEqual([]);
    expect(pentlandPdf).not.toMatch(/\bAPI\b/);
    expect(gypsyPdf).not.toMatch(/\bfetched\b/i);
    expect(gypsyPdf).not.toMatch(/https?:\/\//i);
  });

  it('flood and broadband use customer phrasing', () => {
    expect(gypsyPdf).toMatch(/Rivers & sea: Very Low/i);
    expect(gypsyPdf).toMatch(/Flood Zone 1/i);
    expect(gypsyPdf).toMatch(/not available from official records/i);
    expect(gypsyPdf).toMatch(/GOV\.UK long-term flood risk/i);
    expect(gypsyPdf).toMatch(/broadband checker/i);
    expect(gypsyPdf).toMatch(/Ofcom/i);
    expect(gypsyPdf).not.toMatch(/open flood-risk-zone API/i);
  });

  it('Mode C section title when no live asking (Pentland sold → Mode B; Gypsy Mode A here)', () => {
    // Mode A gypsy with scrap price uses offer title
    expect(gypsyPdf).toMatch(/What to offer & what to check/i);
  });
});

describe('Part 12 numeric cross-field (Mode C)', () => {
  it('cover range, fair card, and forecast base share one valuation struct', async () => {
    assertRecordedFixturesReady();
    const llm = structuredClone(V4_DEFECT_LLM_ANALYSIS) as unknown as Record<string, unknown>;
    llm.location = { address: GYPSY_ADDRESS, postcode: 'TS7 0GY', town: 'Nunthorpe' };
    delete (llm as { price?: string }).price;
    llm.valuation = {
      conservative: '£270,000',
      fair: '£280,000',
      optimistic: '£295,000',
      growthAssumptions: { lowPct: 1, centralPct: 2.5, highPct: 3.5, basis: 'test' },
    };
    const out = await finalizeReport(llm, {
      buyerGoal: 'First-time Buyer',
      scrap: { bedrooms: '3', propertyType: 'Semi-detached' },
      facts: loadGypsyFacts(),
      lookups: { crime: loadGypsyCrime(), flood: FLOOD_ZONE1 },
      growthAsOf: new Date('2026-07-24'),
      skipLiveLivingHere: true,
      skipLiveOfcom: true,
    });
    expect(out.hasLiveAsking).toBe(false);
    expect(out.priceLabel).toMatch(/Estimated/i);
    const val = out.valuation as { conservative: string; fair: string; optimistic: string };
    expect(out.price).toBe(val.fair);
    const milestones = out.forecastMilestones as { baseValue: number };
    expect(milestones.baseValue).toBe(280_000);
    const pdf = renderPdfText(out as unknown as PropertyAnalysis);
    expect(pdf).toMatch(/£270,000–£295,000/);
    expect(pdf).toMatch(/Fair market[\s\S]{0,80}£280,000/);
    expect(pdf).toMatch(/Base estimated value £280,000/i);
    expect(pdf).toMatch(/If it comes to market — what to check/i);
    expect(pdf).not.toMatch(/What to offer & what to check/i);
  }, 90_000);
});

describe('Part 12 listing detection post-mortem helpers', () => {
  it('exposes queried list + gate log when Phase 1 has no portal URL', () => {
    const d = detectListingFromResearch(
      'No current Rightmove or Zoopla listing found for this exact address.',
      '3a Gypsy Lane, Nunthorpe, Middlesbrough, Cleveland, TS7 0DY',
      null
    );
    expect(d.listingDetected).toBe(false);
    expect(d.queried.length).toBeGreaterThanOrEqual(3);
    expect(d.queried.some((q) => /Rightmove/i.test(q))).toBe(true);
    expect(d.gateLog).toBeTruthy();
    expect(d.operatorBlock).toMatch(/OPERATOR ACTION NEEDED/i);
    console.log('[Part12 listingDetected post-mortem sample]', JSON.stringify(d, null, 2));
  });
});

describe('Part 12 EPC age band payload (Gypsy fixture)', () => {
  it('constructionAgeBand is present on recorded certificate (not nulled by 11B)', () => {
    const epc = JSON.parse(
      fs.readFileSync(path.join(RECORDED_DIR, 'epc-ts7-0gy.json'), 'utf8')
    ) as { subjectMatch: { constructionAgeBand?: string } };
    expect(epc.subjectMatch.constructionAgeBand).toBe('1930-1949');
    console.log(
      '[Part12 EPC age band payload]',
      JSON.stringify({ constructionAgeBand: epc.subjectMatch.constructionAgeBand })
    );
  });
});
