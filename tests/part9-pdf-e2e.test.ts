/**
 * Part 9 — PDF-level e2e (Mode B), dataCoverage footer, prose grounding, NaPTAN Yarm.
 */
import { describe, expect, it, beforeAll } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { finalizeReport } from '../src/lib/finalizeReport';
import { PDFReport } from '../src/components/PDFReport';
import { selectTransport, loadNaptanStops, __clearNaptanCacheForTests } from '../src/lib/naptanTransport';
import { haversineMiles } from '../src/lib/giasSchools';
import { formatDataCoverageFooter } from '../src/lib/dataCoverage';
import { V4_DEFECT_LLM_ANALYSIS } from './fixtures/v4DefectLlmAnalysis';
import {
  assertRecordedFixturesReady,
  loadRecordedCrime,
  loadRecordedLivingHere,
  recordedPropertyFacts,
  PENTLAND_ADDRESS,
  REALITY,
} from './helpers/loadRecorded';
import type { PropertyAnalysis } from '../src/types';

const CLASS1_MODE_B_FORBIDDEN = [
  'Opening Offer',
  'Walk-away',
  'Asking Price',
  'Is the asking price fair',
  'Base asking',
];

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

describe('Part 9 PDF-level Mode B e2e (recorded)', () => {
  let analysis: Record<string, unknown>;
  let pdfText: string;

  beforeAll(async () => {
    assertRecordedFixturesReady();
    // Force sold mode: no live asking, recent LR sale present in recorded facts
    const llm = structuredClone(V4_DEFECT_LLM_ANALYSIS) as unknown as Record<string, unknown>;
    delete (llm as { price?: string }).price;
    analysis = await finalizeReport(llm, {
      buyerGoal: 'homebuyer primary residence',
      scrap: { bedrooms: '4', propertyType: 'Detached' }, // no scrap.price → sold mode
      facts: recordedPropertyFacts(),
      lookups: {
        crime: loadRecordedCrime(),
        flood: null,
        planning: null,
        livingHere: loadRecordedLivingHere(),
      },
      growthAsOf: new Date('2026-07-23'),
      skipLiveLivingHere: true,
    });
    pdfText = renderPdfText(analysis as unknown as PropertyAnalysis);
    // eslint-disable-next-line no-console
    console.log('[Part9] reportMode=', analysis.reportMode);
    // eslint-disable-next-line no-console
    console.log('[Part9] proseGroundingLog:\n' + JSON.stringify(analysis.proseGroundingLog, null, 2));
    // eslint-disable-next-line no-console
    console.log('[Part9] dataCoverage:\n' + JSON.stringify(analysis.dataCoverage, null, 2));
  }, 120_000);

  it('SOLD mode PDF has zero Class 1 offer strings; Section 8 is Recently Sold panel', () => {
    expect(analysis.reportMode).toBe('recently_sold');
    expect(analysis.offerStrategy).toBeUndefined();
    expect(analysis.recentlySoldPanel).toBeTruthy();

    for (const forbidden of CLASS1_MODE_B_FORBIDDEN) {
      // Exact Class 1 labels/phrases (not incidental lowercase "asking price" in narrative)
      if (forbidden === 'Asking Price') {
        expect(pdfText).not.toMatch(/\bAsking Price\b/);
        expect(analysis.priceLabel).not.toMatch(/Asking Price/i);
      } else {
        expect(pdfText).not.toMatch(new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
      }
    }
    expect(pdfText).toMatch(/Recently Sold\s*[—\-]\s*What This Means/i);
    expect(pdfText).not.toMatch(/Opening offer/i);
    // Offer shell must not render N/A placeholder cards
    expect(pdfText).not.toMatch(/Opening offer[\s\S]{0,80}N\/A/i);
    // eslint-disable-next-line no-console
    console.log(
      '[Part9] Section 8 excerpt:\n' +
        pdfText.slice(
          Math.max(0, pdfText.search(/Recently Sold/i)),
          Math.max(0, pdfText.search(/Recently Sold/i)) + 800
        )
    );
  });

  it('no rendered spec value equals its own field label', () => {
    const specs = (analysis.specs || []) as { label: string; value: string }[];
    for (const s of specs) {
      expect(String(s.value || '').trim().toLowerCase()).not.toBe(
        String(s.label || '').trim().toLowerCase()
      );
    }
    expect(pdfText).not.toMatch(/Main heating\s*Main heating/i);
  });

  it('dataCoverage footer line is present in rendered PDF', () => {
    const coverage = analysis.dataCoverage as {
      summaryLine: string;
      ok: number;
      total: number;
    };
    expect(coverage).toBeTruthy();
    expect(coverage.total).toBeGreaterThan(0);
    const line = formatDataCoverageFooter(coverage as never);
    expect(line).toMatch(/\d+ of \d+ official sources returned data/);
    expect(pdfText).toMatch(/Data sources:/i);
    expect(pdfText).toMatch(/official sources returned data/i);
  });

  it('pins subject prior for Mode B context', () => {
    const facts = recordedPropertyFacts();
    const prior = facts.landRegistry.thisProperty.find((s) => s.date === REALITY.subjectPriorDate);
    expect(prior?.amount).toBe(REALITY.subjectPriorAmount);
    expect(PENTLAND_ADDRESS).toMatch(/DL6 3ND/);
  });
});

describe('Part 9 NaPTAN — Yarm nearer than Battersby', () => {
  it('Yarm Rail Station is in extract and nearer than Battersby from Pentland', () => {
    __clearNaptanCacheForTests();
    const lat = 54.400483;
    const lng = -1.311641;
    const stops = loadNaptanStops();
    const yarm = stops.find(
      (s) => /^yarm rail station$/i.test(s.name) && /^(RLY|RSE|RPL)/i.test(s.stopType)
    );
    expect(yarm).toBeTruthy();
    const yarmMi = haversineMiles(lat, lng, yarm!.lat, yarm!.lng);
    expect(yarmMi).toBeLessThan(7.5);

    const selected = selectTransport(lat, lng, stops);
    const rail = selected.filter((r) => r.type === 'Rail').map((r) => r.line);
    // eslint-disable-next-line no-console
    console.log('[Part9] rail selected:', rail.join(' | '), 'Yarm mi=', yarmMi.toFixed(2));
    expect(rail.some((n) => /yarm/i.test(n))).toBe(true);
    expect(rail.some((n) => /battersby/i.test(n))).toBe(false);
  });
});

describe('Part 9 prose grounding — suppressed crime drops interpretation', () => {
  it('drops crime description when rating is unreliable', async () => {
    const { groundAllReportProse } = await import('../src/lib/proseGrounding');
    const { CRIME_UNRELIABLE } = await import('../src/lib/policeUkLookup');
    const analysis: Record<string, unknown> = {
      address: PENTLAND_ADDRESS,
      areaAnalysis: {
        schools: [{ name: 'Osmotherley Primary School' }],
        transport: [{ line: 'Northallerton Rail Station' }],
        amenities: ['Very low crime area', 'Osmotherley Primary School'],
        crimeSafety: {
          rating: CRIME_UNRELIABLE,
          description: 'This is a very low crime neighbourhood with excellent safety.',
        },
      },
      summary: 'A quiet home near Osmotherley Primary School.',
      pros: [{ text: 'Close to Osmotherley Primary School.' }],
      cons: [{ text: 'Far from The Copper Kettle Tearoom.' }],
    };
    const log = await groundAllReportProse(analysis);
    const crime = (analysis.areaAnalysis as { crimeSafety: { description: string } }).crimeSafety;
    expect(crime.description).toBe('');
    expect(log.some((e) => /crime stat suppressed/i.test(e.detail))).toBe(true);
    const amenities = (analysis.areaAnalysis as { amenities: string[] }).amenities;
    expect(amenities.some((a) => /crime/i.test(a))).toBe(false);
    // Invented venue dropped from cons
    const cons = analysis.cons as { text: string }[];
    expect(cons.every((c) => !/Copper Kettle/i.test(c.text || ''))).toBe(true);
    // eslint-disable-next-line no-console
    console.log('[Part9] grounding drop log:\n' + JSON.stringify(log.filter((e) => e.decision !== 'pass'), null, 2));
  });
});
