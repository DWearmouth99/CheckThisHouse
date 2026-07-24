/**
 * Part 11B — age-band validation, FTB SDLT, mode exclusivity, Living Here filters,
 * tenure from LR, Ofcom broadband lock, walk-away £1k.
 */
import { describe, expect, it, beforeAll } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { finalizeReport } from '../src/lib/finalizeReport';
import { PDFReport } from '../src/components/PDFReport';
import {
  normalizeConstructionAgeBand,
  formatAgeBandDisplay,
  parseEpcFabricFromHtml,
} from '../src/lib/epcLookup';
import { estimateTransactionTax } from '../src/lib/ukPropertyTax';
import { sanitizeOfferStrategy } from '../src/lib/sanitizeOfferStrategy';
import { selectLivingHereBlocks, type PoiRecord } from '../src/lib/poiLookup';
import { detectListingFromResearch } from '../src/lib/listingDetect';
import { polishInsightHeadline, buildEraIssues } from '../src/lib/reportInsights';
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
const CLASS1_OFFER_FORBIDDEN = [
  'Opening offer',
  'Walk-away max',
  'Fair market target',
];

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
    .replace(/&middot;/g, '·')
    .replace(/\n+/g, '\n')
    .trim();
}

describe('Part 11B age-band whitelist', () => {
  it('rejects certificate-number segments like 0620-8409', () => {
    expect(normalizeConstructionAgeBand('0620-8409')).toBeNull();
    expect(normalizeConstructionAgeBand('7134-0620-8409-0244-2202')).toBeNull();
    expect(formatAgeBandDisplay('0620-8409')).toBe('');
  });

  it('accepts RdSAP bands and humanises with en-dash', () => {
    expect(normalizeConstructionAgeBand('England and Wales: 1930-1949')).toBe('1930-1949');
    expect(formatAgeBandDisplay('1930-1949')).toBe('1930–1949');
  });

  it('HTML parse with cert number does not populate age band', () => {
    const html = `
      <p>Certificate number: 7134-0620-8409-0244-2202</p>
      <table><tr><th>Wall</th><td>Cavity wall</td></tr></table>
    `;
    const fabric = parseEpcFabricFromHtml(html);
    expect(fabric.constructionAgeBand).toBeFalsy();
  });

  it('red-team: cert-like band → no era content anywhere in PDF', async () => {
    assertRecordedFixturesReady();
    const facts = recordedPropertyFacts();
    if (facts.epc.matched) {
      facts.epc.matched = {
        ...facts.epc.matched,
        constructionAgeBand: '0620-8409',
      };
    }
    const llm = structuredClone(V4_DEFECT_LLM_ANALYSIS) as unknown as Record<string, unknown>;
    delete (llm as { price?: string }).price;
    const out = await finalizeReport(llm, {
      buyerGoal: 'First-time Buyer',
      scrap: { bedrooms: '4', propertyType: 'Detached' },
      facts,
      lookups: {
        crime: loadRecordedCrime(),
        livingHere: loadRecordedLivingHere(),
      },
      growthAsOf: new Date('2026-07-24'),
      skipLiveLivingHere: true,
      skipLiveOfcom: true,
    });
    const era = out.eraProfile as { ageBand?: string | null; issues?: unknown[]; title?: string };
    expect(era?.ageBand).toBeFalsy();
    expect((era?.issues || []).length).toBe(0);
    const pdf = renderPdfText(out as unknown as PropertyAnalysis);
    expect(pdf).not.toMatch(/0620-8409/);
    expect(pdf).not.toMatch(/Living with a /i);
    expect(pdf).not.toMatch(/This era of house/i);
  }, 60_000);
});

describe('Part 11B insight title QA', () => {
  it('rejects fragment titles and falls back to templated headline', () => {
    const era = buildEraIssues({
      constructionAgeBand: '1930-1949',
      propertyType: 'Semi-detached house',
      wallsDescription: 'Cavity wall, as built, no insulation (assumed)',
    } as EpcRecord);
    const polished = polishInsightHeadline(
      'cavity partial — certificate confirms fabric detail',
      {
        id: 'c1-cavity',
        insightClass: 1,
        eraIssue: era.issues[0],
      },
      '1930-1949'
    );
    expect(polished).not.toMatch(/^cavity/i);
    expect(polished.length).toBeGreaterThanOrEqual(24);
    expect(polished.charAt(0)).toMatch(/[A-Z]/);
  });
});

describe('Part 11B FTB SDLT', () => {
  it('England FTB at £275k → £0 with relief', () => {
    const est = estimateTransactionTax({
      price: 275_000,
      nation: 'england_ni',
      buyerGoal: 'First-time Buyer',
    });
    expect(est?.total).toBe(0);
    expect(est?.summary).toMatch(/first-time buyer relief/i);
  });

  it('Gypsy FTB purchase costs stack shows £0', async () => {
    assertRecordedFixturesReady();
    const llm = structuredClone(V4_DEFECT_LLM_ANALYSIS) as unknown as Record<string, unknown>;
    llm.location = { address: GYPSY_ADDRESS, postcode: 'TS7 0GY', town: 'Nunthorpe' };
    llm.price = '£265,000';
    const out = await finalizeReport(llm, {
      buyerGoal: 'First-time Buyer',
      scrap: { bedrooms: '3', propertyType: 'Semi-detached', price: '£265,000' },
      facts: loadGypsyFacts(),
      lookups: { crime: loadGypsyCrime() },
      growthAsOf: new Date('2026-07-24'),
      skipLiveLivingHere: true,
      skipLiveOfcom: true,
    });
    const costs = String(
      (out.dueDiligence as { purchaseCosts?: string } | undefined)?.purchaseCosts || ''
    );
    expect(costs).toMatch(/SDLT £0/);
    expect(costs).toMatch(/first-time buyer relief/i);
    expect(costs).not.toMatch(/£3,750/);
  });
});

describe('Part 11B walk-away £1k rounding', () => {
  it('rounds premium/walk-away to nearest £1,000', () => {
    const out = sanitizeOfferStrategy(
      {
        lowOffer: '£270,000',
        fairOffer: '£275,000',
        premiumOffer: '£283,250',
        negotiationTips: [],
      },
      { asking: '£275,000', fairValue: '£275,000' }
    );
    expect(out?.premiumOffer).toMatch(/^£\d{3},000$/);
    expect(out?.premiumOffer).not.toMatch(/250/);
  });
});

describe('Part 11B mode exclusivity (PDF)', () => {
  let modeA: Record<string, unknown>;
  let modeC: Record<string, unknown>;
  let modeAPdf: string;
  let modeCPdf: string;

  beforeAll(async () => {
    assertRecordedFixturesReady();
    const facts = loadGypsyFacts();
    const crime = loadGypsyCrime();

    const llmA = structuredClone(V4_DEFECT_LLM_ANALYSIS) as unknown as Record<string, unknown>;
    llmA.location = { address: GYPSY_ADDRESS, postcode: 'TS7 0GY', town: 'Nunthorpe' };
    llmA.price = '£265,000';
    modeA = await finalizeReport(llmA, {
      buyerGoal: 'First-time Buyer',
      scrap: { bedrooms: '3', propertyType: 'Semi-detached', price: '£265,000' },
      facts,
      lookups: { crime },
      growthAsOf: new Date('2026-07-24'),
      skipLiveLivingHere: true,
      skipLiveOfcom: true,
    });
    modeAPdf = renderPdfText(modeA as unknown as PropertyAnalysis);

    const llmC = structuredClone(V4_DEFECT_LLM_ANALYSIS) as unknown as Record<string, unknown>;
    llmC.location = { address: GYPSY_ADDRESS, postcode: 'TS7 0GY', town: 'Nunthorpe' };
    delete (llmC as { price?: string }).price;
    modeC = await finalizeReport(llmC, {
      buyerGoal: 'First-time Buyer',
      scrap: { bedrooms: '3', propertyType: 'Semi-detached' }, // no price → Mode C
      facts,
      lookups: { crime },
      growthAsOf: new Date('2026-07-24'),
      skipLiveLivingHere: true,
      skipLiveOfcom: true,
    });
    modeCPdf = renderPdfText(modeC as unknown as PropertyAnalysis);

    const outDir = path.join(process.cwd(), 'fixtures', 'evidence');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'part11b-gypsy-modeA.pdf.txt'), modeAPdf);
    fs.writeFileSync(path.join(outDir, 'part11b-gypsy-modeC.pdf.txt'), modeCPdf);
    fs.writeFileSync(
      path.join(outDir, 'part11b-listingDetected.json'),
      JSON.stringify(
        {
          modeA: {
            hasLiveAsking: modeA.hasLiveAsking,
            priceLabel: modeA.priceLabel,
            listingDetected: modeA.listingDetected,
            offerStrategy: modeA.offerStrategy,
          },
          modeC: {
            hasLiveAsking: modeC.hasLiveAsking,
            priceLabel: modeC.priceLabel,
            listingDetected: modeC.listingDetected,
            offerStrategy: modeC.offerStrategy,
          },
        },
        null,
        2
      )
    );
  }, 180_000);

  it('Mode A (live asking): offer shell present; Asking price label', () => {
    expect(modeA.hasLiveAsking).toBe(true);
    expect(modeA.priceLabel).toMatch(/Asking/i);
    expect(modeA.offerStrategy).toBeTruthy();
    const os = modeA.offerStrategy as {
      lowOffer?: string;
      fairOffer?: string;
      premiumOffer?: string;
    };
    // Bands must track live asking (~£265k), not stale LLM fair (~£672k)
    expect(os.fairOffer).toMatch(/26[0-9],000/);
    expect(os.premiumOffer).toMatch(/26[0-9],000|27[0-9],000/);
    expect(os.lowOffer).toMatch(/25[0-9],000|26[0-9],000/);
    expect(modeAPdf).toMatch(/Opening offer/i);
    expect(modeAPdf).toMatch(/Walk-away max/i);
  });

  it('Mode C (estimated value): no Mode A offer shell in PDF', () => {
    expect(modeC.hasLiveAsking).toBe(false);
    expect(modeC.priceLabel).toMatch(/Estimated/i);
    expect(modeC.offerStrategy).toBeUndefined();
    for (const forbidden of CLASS1_OFFER_FORBIDDEN) {
      expect(modeCPdf).not.toMatch(new RegExp(forbidden, 'i'));
    }
    expect(modeCPdf).toMatch(/Estimated value/i);
  });

  it('Pentland Mode B PDF still has no Opening Offer (mutual exclusivity)', async () => {
    const llm = structuredClone(V4_DEFECT_LLM_ANALYSIS) as unknown as Record<string, unknown>;
    delete (llm as { price?: string }).price;
    const out = await finalizeReport(llm, {
      buyerGoal: 'homebuyer primary residence',
      scrap: { bedrooms: '4', propertyType: 'Detached' },
      facts: recordedPropertyFacts(),
      lookups: {
        crime: loadRecordedCrime(),
        livingHere: loadRecordedLivingHere(),
      },
      growthAsOf: new Date('2026-07-24'),
      skipLiveLivingHere: true,
      skipLiveOfcom: true,
    });
    const pdf = renderPdfText(out as unknown as PropertyAnalysis);
    expect(out.reportMode).toBe('recently_sold');
    expect(pdf).not.toMatch(/Opening offer/i);
    expect(pdf).not.toMatch(/Walk-away max/i);
  });
});

describe('Part 11B Living Here filters', () => {
  it('drops school kitchen, B&B, hospital departments', () => {
    const pois: PoiRecord[] = [
      {
        name: 'Arete at Nunthorpe Academy',
        category: 'cafe',
        lat: 0,
        lng: 0,
        distanceMiles: 0.3,
        source: 'fsa',
      },
      {
        name: 'Brass Castle',
        category: 'restaurant',
        lat: 0,
        lng: 0,
        distanceMiles: 0.4,
        source: 'fsa',
      },
      {
        name: 'Department of Obstetrics',
        category: 'gp',
        lat: 0,
        lng: 0,
        distanceMiles: 0.5,
        source: 'nhs',
      },
      {
        name: 'Outpatients Pharmacy',
        category: 'pharmacy',
        lat: 0,
        lng: 0,
        distanceMiles: 0.5,
        source: 'nhs',
      },
      {
        name: 'The Village Café',
        category: 'cafe',
        lat: 0,
        lng: 0,
        distanceMiles: 0.2,
        source: 'fsa',
      },
      {
        name: 'Nunthorpe Medical Centre',
        category: 'gp',
        lat: 0,
        lng: 0,
        distanceMiles: 0.6,
        source: 'nhs',
      },
    ];
    const blocks = selectLivingHereBlocks(pois);
    const names = [
      ...blocks.foodDrink.map((p) => p.name),
      ...blocks.everyday.map((p) => p.name),
    ].join(' | ');
    expect(names).not.toMatch(/Arete|Brass Castle|Obstetrics|Outpatients/i);
    expect(names).toMatch(/Village Café|Medical Centre/i);
  });
});

describe('Part 11B tenure 10.8b + Ofcom 10.8c', () => {
  it('locks Freehold from LR estateType on Gypsy fixture', async () => {
    assertRecordedFixturesReady();
    const llm = structuredClone(V4_DEFECT_LLM_ANALYSIS) as unknown as Record<string, unknown>;
    llm.location = { address: GYPSY_ADDRESS, postcode: 'TS7 0GY', town: 'Nunthorpe' };
    llm.price = '£265,000';
    const out = await finalizeReport(llm, {
      buyerGoal: 'First-time Buyer',
      scrap: { bedrooms: '3', price: '£265,000' },
      facts: loadGypsyFacts(),
      lookups: { crime: loadGypsyCrime() },
      growthAsOf: new Date('2026-07-24'),
      skipLiveLivingHere: true,
      skipLiveOfcom: true,
    });
    const tenure = String(
      (out.dueDiligence as { tenureAndLegal?: string } | undefined)?.tenureAndLegal || ''
    );
    expect(tenure).toMatch(/Freehold/i);
    expect(tenure).toMatch(/Land Registry/i);
    expect(tenure).not.toMatch(/^Not on record/i);
  });

  it('Ofcom skipped → explicit Not on record checker line (not LLM Confirm fluff)', async () => {
    assertRecordedFixturesReady();
    const llm = structuredClone(V4_DEFECT_LLM_ANALYSIS) as unknown as Record<string, unknown>;
    llm.location = { address: GYPSY_ADDRESS, postcode: 'TS7 0GY', town: 'Nunthorpe' };
    const out = await finalizeReport(llm, {
      buyerGoal: 'First-time Buyer',
      scrap: { bedrooms: '3', price: '£265,000' },
      facts: loadGypsyFacts(),
      lookups: { crime: loadGypsyCrime() },
      growthAsOf: new Date('2026-07-24'),
      skipLiveLivingHere: true,
      skipLiveOfcom: true,
    });
    const bb = String(
      (out.dueDiligence as { broadbandAndMobile?: string } | undefined)?.broadbandAndMobile || ''
    );
    expect(bb).toMatch(/Not available from official records/i);
    expect(bb).toMatch(/Ofcom's broadband checker/i);
    expect(bb).not.toMatch(/https?:\/\//i);
    expect(bb).not.toMatch(/^Confirm broadband availability/i);
  });
});

describe('Part 11B listingDetected parser', () => {
  it('extracts Rightmove URL + asking from research notes', () => {
    const d = detectListingFromResearch(
      `Found live listing https://www.rightmove.co.uk/properties/123456789 asking price £275,000 on Gypsy Lane.`,
      GYPSY_ADDRESS,
      null
    );
    expect(d.listingDetected).toBe(true);
    expect(d.portal).toBe('Rightmove');
    expect(d.askingPrice).toMatch(/275/);
    expect(d.queried.length).toBeGreaterThan(0);
    console.log('[Part11B listingDetected sample]', JSON.stringify(d, null, 2));
  });

  it('returns not-found with queried list when notes lack portal URL', () => {
    const d = detectListingFromResearch(
      'No current portal listing found in research.',
      GYPSY_ADDRESS,
      null
    );
    expect(d.listingDetected).toBe(false);
    expect(d.queried.some((q) => /rightmove/i.test(q))).toBe(true);
    console.log('[Part11B listingDetected not-found]', JSON.stringify(d, null, 2));
  });
});
