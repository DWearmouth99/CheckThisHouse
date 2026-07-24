/**
 * Part 13 — region gate, vacuum mode, distance caps, score integrity.
 */
import { describe, expect, it, beforeAll } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'fs';
import path from 'path';
import {
  assessReportCoverage,
  assertReportCoverage,
  resolveReportRegion,
  coverageGapMessage,
} from '../src/lib/ukCoverage';
import { finalizeReport } from '../src/lib/finalizeReport';
import { PDFReport } from '../src/components/PDFReport';
import { selectNearestSchools, SCHOOL_RADIUS_MILES } from '../src/lib/giasSchools';
import {
  selectTransport,
  BUS_RADIUS_MILES,
  STATION_RADIUS_MILES,
  loadNaptanStops,
  __clearNaptanCacheForTests,
} from '../src/lib/naptanTransport';
import { computeDeterministicScores } from '../src/lib/deterministicScores';
import { detectListingFromResearch } from '../src/lib/listingDetect';
import { detectReportMode } from '../src/lib/reportWritingEngine';
import { assessListingPaymentGate } from '../src/lib/listingPaymentGate';
import { V4_DEFECT_LLM_ANALYSIS } from './fixtures/v4DefectLlmAnalysis';
import {
  assertRecordedFixturesReady,
  loadRecordedCrime,
  recordedPropertyFacts,
  PENTLAND_ADDRESS,
} from './helpers/loadRecorded';
import type { PropertyAnalysis } from '../src/types';
import type { PropertyFacts } from '../src/lib/propertyFacts';

const DALKEITH = '3 Hawk Crescent, Dalkeith EH22 2RB';
/** Approx coords for EH22 2RB (Dalkeith) */
const DALKEITH_LAT = 55.892;
const DALKEITH_LNG = -3.058;

const CLASS1_OFFER_FORBIDDEN = ['Opening offer', 'Walk-away max'];

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

function parseGbp(raw?: string | null): number | null {
  if (!raw) return null;
  const m = String(raw).match(/£\s*([\d,]+)/);
  if (!m) return null;
  const n = parseInt(m[1]!.replace(/,/g, ''), 10);
  return Number.isFinite(n) ? n : null;
}

describe('Part 13.1 region detection + coverage gate', () => {
  it('resolves Scotland / NI / E&W / TD border (ONS-derived TD15 England)', () => {
    expect(resolveReportRegion('EH22 2RB')).toBe('scotland');
    expect(resolveReportRegion('G1 1AA')).toBe('scotland');
    expect(resolveReportRegion('DG1 1AA')).toBe('scotland');
    expect(resolveReportRegion('TD1 1AA')).toBe('scotland');
    expect(resolveReportRegion('TD15 1AA')).toBe('england');
    expect(resolveReportRegion('BT1 1AA')).toBe('northern_ireland');
    expect(resolveReportRegion('DL6 3ND')).toBe('england');
    expect(resolveReportRegion('CF10 1AA')).toBe('wales');
  });

  it('assessReportCoverage allows Scotland and Northern Ireland', () => {
    const sc = assessReportCoverage(DALKEITH);
    expect(sc.supported).toBe(true);
    expect(sc.region).toBe('scotland');
    expect(sc.waitlistRegion).toBeNull();

    const ni = assessReportCoverage('12 Example Street, Belfast BT1 1AA');
    expect(ni.supported).toBe(true);
    expect(ni.region).toBe('northern_ireland');
    expect(ni.waitlistRegion).toBeNull();

    const ew = assessReportCoverage(PENTLAND_ADDRESS);
    expect(ew.supported).toBe(true);
  });

  it('payment gate allows Scotland and Northern Ireland addresses', () => {
    expect(
      assessListingPaymentGate({
        mode: 'address',
        address: DALKEITH,
      }).ok
    ).toBe(true);
    expect(
      assessListingPaymentGate({
        mode: 'address',
        address: '12 Example Street, Belfast BT1 1AA',
      }).ok
    ).toBe(true);
  });

  it('pipeline allows EH22 2RB — Mode C vacuum, not OUTSIDE_COVERAGE', async () => {
    expect(() => assertReportCoverage('EH22 2RB')).not.toThrow();
    const llm = structuredClone(V4_DEFECT_LLM_ANALYSIS) as unknown as Record<string, unknown>;
    llm.location = {
      address: DALKEITH,
      postcode: 'EH22 2RB',
      town: 'Dalkeith',
    };
    llm.title = DALKEITH;
    delete (llm as { price?: string }).price;
    llm.comparableSales = [];
    llm.offerStrategy = {
      lowOffer: '£320,000',
      fairOffer: '£333,000',
      premiumOffer: '£343,000',
      negotiationTips: ['Open below asking'],
    };

    const out = await finalizeReport(llm, {
      buyerGoal: 'First-time Buyer',
      scrap: { bedrooms: '3', propertyType: 'Semi-detached' },
      facts: {
        address: DALKEITH,
        epc: { postcode: 'EH22 2RB', matched: null, candidates: [] },
        landRegistry: {
          postcode: 'EH22 2RB',
          thisProperty: [],
          nearbySameStreet: [],
          nearbyPostcode: [],
          nearby: [],
          sourceUrl: '',
        },
        brief: '',
        sources: [],
      },
      lookups: { crime: null },
      listingDetection: {
        listingDetected: false,
        askingPrice: null,
        portalUrl: null,
        portal: null,
        evidence: 'no portal URL',
        queried: [],
      },
      skipLiveLivingHere: true,
      skipLiveOfcom: true,
    });

    expect(out.reportRegion).toBe('scotland');
    expect(out.hasLiveAsking).toBe(false);
    expect(out.offerStrategy).toBeUndefined();
    expect(String(out.priceLabel)).toMatch(/Estimated/i);
    const pdf = renderPdfText(out as unknown as PropertyAnalysis);
    expect(pdf).not.toMatch(/Opening offer/i);
    expect(pdf).toMatch(/No nearby school details found|Education Scotland|Estimated/i);
    const coverage = out.dataCoverage as { failedLine?: string; summaryLine?: string };
    // Customer footer stays short (no long nation-gap essays)
    expect(coverage.failedLine || '').toBe('');
    expect(String(coverage.summaryLine || '')).toMatch(/estimate|registers returned data|web records/i);
  }, 180_000);

  it('pipeline allows BT Northern Ireland (no OUTSIDE_COVERAGE)', () => {
    expect(() => assertReportCoverage('BT1 1AA')).not.toThrow();
    const d = assessReportCoverage('BT1 1AA');
    expect(d.supported).toBe(true);
    expect(d.region).toBe('northern_ireland');
  });
});

describe('Part 13.2 vacuum mode + score integrity', () => {
  let vacuum: Record<string, unknown>;
  let vacuumPdf: string;

  beforeAll(async () => {
    assertRecordedFixturesReady();
    const emptyFacts: PropertyFacts = {
      address: '12 New Build Close, Northallerton DL6 1AA',
      epc: { postcode: 'DL6 1AA', matched: null, candidates: [] },
      landRegistry: {
        postcode: 'DL6 1AA',
        thisProperty: [],
        nearbySameStreet: [],
        nearbyPostcode: [],
        nearby: [],
        sourceUrl: '',
      },
      brief: '',
      sources: [],
    };
    const llm = structuredClone(V4_DEFECT_LLM_ANALYSIS) as unknown as Record<string, unknown>;
    llm.location = {
      address: emptyFacts.address,
      postcode: 'DL6 1AA',
      town: 'Northallerton',
    };
    // Poison: LLM invents Asking Price + offer strategy + conflicting valuations
    llm.price = '£333,000';
    llm.priceLabel = 'Asking Price';
    llm.offerStrategy = {
      lowOffer: '£320,000',
      fairOffer: '£333,000',
      premiumOffer: '£343,000',
      negotiationTips: ['Open below asking'],
    };
    (llm.valuation as { fair: string; conservative: string; optimistic: string }).fair = '£410,000';
    (llm.valuation as { fair: string; conservative: string; optimistic: string }).conservative =
      '£390,000';
    (llm.valuation as { fair: string; conservative: string; optimistic: string }).optimistic =
      '£430,000';
    // Clear LLM comps so value-for-money cannot score from phantom streets
    llm.comparableSales = [];
    llm.soldHistory = [];

    vacuum = await finalizeReport(llm, {
      buyerGoal: 'First-time Buyer',
      scrap: { bedrooms: '3', propertyType: 'Detached' }, // no scrap.price → vacuum Mode C
      facts: emptyFacts,
      lookups: { crime: null },
      listingDetection: {
        listingDetected: false,
        askingPrice: null,
        portalUrl: null,
        portal: null,
        evidence: 'no portal URL',
        queried: [],
      },
      growthAsOf: new Date('2026-07-24'),
      skipLiveLivingHere: true,
      skipLiveOfcom: true,
    });
    vacuumPdf = renderPdfText(vacuum as unknown as PropertyAnalysis);

    const outDir = path.join(process.cwd(), 'fixtures', 'evidence');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'part13-vacuum.pdf.txt'), vacuumPdf);
    fs.writeFileSync(
      path.join(outDir, 'part13-vacuum.json'),
      JSON.stringify(
        {
          hasLiveAsking: vacuum.hasLiveAsking,
          priceLabel: vacuum.priceLabel,
          price: vacuum.price,
          valuation: vacuum.valuation,
          offerStrategy: vacuum.offerStrategy,
          scores: vacuum.scores,
        },
        null,
        2
      )
    );
  }, 180_000);

  it('empty-LR + no listing → Mode C framing, never Asking Price, never offer strategy', () => {
    expect(vacuum.hasLiveAsking).toBe(false);
    expect(String(vacuum.priceLabel)).toMatch(/Estimated/i);
    expect(String(vacuum.priceLabel)).not.toMatch(/Asking/i);
    expect(vacuum.offerStrategy).toBeUndefined();
    // Cover / offer shell — not incidental prose ("no live asking price", "Asking vs solds")
    expect(vacuumPdf).not.toMatch(/Opening offer/i);
    expect(vacuumPdf).not.toMatch(/Walk-away max/i);
    expect(vacuumPdf).toMatch(/Estimated value/i);
    // Cover price card must not use the Asking Price label
    expect(vacuumPdf).not.toMatch(/Asking Price\s*\n/i);
  });

  it('single valuation struct: headline price matches fair; cover/offer not dual-anchored', () => {
    const val = vacuum.valuation as { fair?: string; conservative?: string; optimistic?: string };
    const fair = parseGbp(val.fair);
    const price = parseGbp(String(vacuum.price || ''));
    expect(fair).toBeTruthy();
    expect(price).toBe(fair);
    // Cover uses range from same struct when Mode C
    expect(vacuumPdf).toMatch(/Estimated value/i);
    expect(vacuumPdf).not.toMatch(/£343,000/);
  });

  it('score vacuum: missing inputs → insufficient data; overall based on N of 4', () => {
    const scores = vacuum.scores as {
      conditionRatingStatus: string;
      valueForMoneyStatus: string;
      locationRatingStatus: string;
      overallBasis: string;
      scoredComponentCount: number;
      conditionRating: number;
    };
    expect(scores.conditionRatingStatus).toBe('insufficient');
    // No subject EPC + no reliable price-vs-comps when LR empty and comps cleared
    expect(scores.valueForMoneyStatus).toBe('insufficient');
    expect(scores.overallBasis).toMatch(/based on \d of 4 components/);
    expect(scores.scoredComponentCount).toBeLessThan(4);
    expect(vacuumPdf).toMatch(/insufficient data/i);
  });

  it('unit: computeDeterministicScores never invents Condition 55 from empty EPC', () => {
    const s = computeDeterministicScores({});
    expect(s.conditionRatingStatus).toBe('insufficient');
    expect(s.locationRatingStatus).toBe('insufficient');
    expect(s.valueForMoneyStatus).toBe('insufficient');
    expect(s.overallBasis).toBe('based on 1 of 4 components'); // market only
  });

  it('rejects house-prices archive URLs as live listings (no Asking Price)', () => {
    const d = detectListingFromResearch(
      `Rightmove history https://www.rightmove.co.uk/house-prices/detail.html?country=england&locationIdentifier=POSTCODE%5E123 sold for £333,000 in 2018.`,
      '3 Hawk Crescent, Dalkeith EH22 2RB',
      null
    );
    expect(d.listingDetected).toBe(false);
    expect(d.askingPrice).toBeNull();
    expect(d.gateLog).toMatch(/archive|sold/i);
  });

  it('research £ without portal URL does not become listingDetected', () => {
    const d = detectListingFromResearch(
      'Rightmove shows asking price £333,000 for sale near Hawk Crescent Dalkeith.',
      DALKEITH,
      null
    );
    expect(d.listingDetected).toBe(false);
    const mode = detectReportMode({ liveAsking: null, thisPropertySales: [] });
    expect(mode.hasLiveAsking).toBe(false);
    expect(mode.priceLabel).toMatch(/Estimated/i);
  });
});

describe('Part 13.3 distance sanity caps', () => {
  it('Dalkeith coords → zero GIAS school rows within 10 mi (no Northumberland absurdities)', () => {
    const selected = selectNearestSchools(DALKEITH_LAT, DALKEITH_LNG);
    expect(SCHOOL_RADIUS_MILES).toBe(10);
    expect(selected.length).toBe(0);
    for (const s of selected) {
      expect(s.miles).toBeLessThanOrEqual(SCHOOL_RADIUS_MILES);
    }
  });

  it('bus stops beyond 2 mi and stations beyond 30 mi are omitted', () => {
    __clearNaptanCacheForTests();
    const selected = selectTransport(DALKEITH_LAT, DALKEITH_LNG, loadNaptanStops());
    for (const row of selected) {
      if (row.type === 'Bus') expect(row.miles!).toBeLessThanOrEqual(BUS_RADIUS_MILES);
      if (row.type === 'Rail') expect(row.miles!).toBeLessThanOrEqual(STATION_RADIUS_MILES);
    }
    // Far-away English extract must not invent a 100+ mi bus stop
    const bus = selected.filter((r) => r.type === 'Bus');
    expect(bus.every((b) => (b.miles ?? 999) <= BUS_RADIUS_MILES)).toBe(true);
  });

  it('Pentland still selects local schools within cap', () => {
    const selected = selectNearestSchools(54.400483, -1.311641);
    expect(selected.length).toBeGreaterThan(0);
    expect(selected.every((s) => s.miles <= SCHOOL_RADIUS_MILES)).toBe(true);
  });
});

describe('Part 13.4 coverage-aware messages', () => {
  it('Scotland crime/EPC/LR/schools gap copy names the alternate publisher', () => {
    expect(coverageGapMessage('crime', 'scotland')).toMatch(/Police Scotland/i);
    expect(coverageGapMessage('epc', 'scotland')).toMatch(/Scottish register/i);
    expect(coverageGapMessage('landRegistry', 'scotland')).toMatch(/Registers of Scotland/i);
    expect(coverageGapMessage('schools', 'scotland')).toMatch(/Education Scotland/i);
    expect(coverageGapMessage('crime', 'england')).toBeNull();
  });
});

describe('Part 13 PDF one-struct valuation (all recorded fixtures via Pentland Mode B)', () => {
  it('cover / valuation / forecast share one money base', async () => {
    assertRecordedFixturesReady();
    const llm = structuredClone(V4_DEFECT_LLM_ANALYSIS) as unknown as Record<string, unknown>;
    delete (llm as { price?: string }).price;
    const out = await finalizeReport(llm, {
      buyerGoal: 'homebuyer primary residence',
      scrap: { bedrooms: '4', propertyType: 'Detached' },
      facts: recordedPropertyFacts(),
      lookups: { crime: loadRecordedCrime() },
      growthAsOf: new Date('2026-07-24'),
      skipLiveLivingHere: true,
      skipLiveOfcom: true,
    });
    const val = out.valuation as { fair?: string };
    const milestones = out.forecastMilestones as { baseValue?: number };
    const price = parseGbp(String(out.price || ''));
    const fair = parseGbp(val.fair);
    // Mode B: price is last sold; forecast base should align with that sold / valuation path
    expect(price).toBeTruthy();
    expect(milestones.baseValue).toBeTruthy();
    expect(Math.abs((milestones.baseValue || 0) - (price || 0))).toBeLessThan(1500);
    if (fair && out.hasLiveAsking) {
      expect(price).toBe(fair);
    }
    const pdf = renderPdfText(out as unknown as PropertyAnalysis);
    expect(out.hasLiveAsking).toBe(false);
    expect(String(out.priceLabel || '')).not.toMatch(/Asking/i);
    expect(pdf).not.toMatch(/Opening offer/i);
  }, 120_000);
});
