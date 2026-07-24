/**
 * Part 2 SDLT e2e + Part 3 crime fixtures A/B (Gemini finalizeReport path only).
 */
import { describe, expect, it } from 'vitest';
import { V4_DEFECT_LLM_ANALYSIS } from './fixtures/v4DefectLlmAnalysis';
import {
  finalizeReport,
  FINALIZE_REPORT_MARKER,
  buildPurchaseCostsStack,
} from '../src/lib/finalizeReport';
import type { PropertyFacts } from '../src/lib/propertyFacts';
import {
  CRIME_UNRELIABLE,
  computeCrimeRateFromMonths,
  formatCrimeRateLabel,
  last12Months,
  type CrimeLookup,
} from '../src/lib/policeUkLookup';

const BUYER_GOAL = 'homebuyer primary residence';

function emptyFacts(address: string): PropertyFacts {
  return {
    address,
    epc: { postcode: 'DL6 3ND', matched: null, candidates: [], error: 'stubbed empty' },
    landRegistry: {
      query: address,
      thisProperty: [],
      nearbySameStreet: [],
      nearbyPostcode: [],
      error: undefined,
    },
    brief: 'stubbed empty facts',
    sources: [],
  };
}

function soldFacts(address: string): PropertyFacts {
  const base = emptyFacts(address);
  return {
    ...base,
    landRegistry: {
      ...base.landRegistry,
      thisProperty: [
        {
          paon: '',
          saon: '',
          street: 'CROSS LANE',
          town: 'NORTHALLERTON',
          postcode: 'DL6 3ND',
          amount: 672_400,
          date: '2026-04-01',
          propertyType: 'Detached',
          addressLabel: 'Pentland, Cross Lane, Northallerton DL6 3ND',
        },
      ],
    },
  };
}

/** Same surfaces PDFReport reads for Purchase Costs / Crime / Comp notes. */
export function flattenPdfBoundText(analysis: Record<string, unknown>): string {
  const dd = (analysis.dueDiligence || {}) as Record<string, unknown>;
  const area = (analysis.areaAnalysis || {}) as {
    crimeSafety?: { rating?: string; description?: string };
  };
  const crime = area.crimeSafety || {};
  const verified = (analysis.verifiedCrime || {}) as { label?: string };
  const comps = Array.isArray(analysis.comparableSales)
    ? (analysis.comparableSales as { similarity?: string; note?: string }[])
    : [];

  const purchaseCostsStack = String(dd.purchaseCosts || '');
  const crimeSection = [verified.label || crime.rating || '', crime.description || '']
    .filter(Boolean)
    .join('\n');
  const compNotes = comps
    .map((c) => [c.similarity, c.note].filter(Boolean).join(' '))
    .join('\n');

  return [purchaseCostsStack, crimeSection, compNotes].join('\n');
}

export function flattenCrimeSection(analysis: Record<string, unknown>): string {
  const area = (analysis.areaAnalysis || {}) as {
    crimeSafety?: { rating?: string; description?: string };
  };
  const crime = area.crimeSafety || {};
  const verified = (analysis.verifiedCrime || {}) as { label?: string };
  return [verified.label || crime.rating || '', crime.description || ''].filter(Boolean).join('\n');
}

function countPer1000(text: string): number {
  const matches = text.match(/per\s*1,?000/gi);
  return matches ? matches.length : 0;
}

async function finalizeLikeGemini(
  llmJson: Record<string, unknown>,
  crime: CrimeLookup | null
) {
  return finalizeReport(structuredClone(llmJson) as Record<string, unknown>, {
    buyerGoal: BUYER_GOAL,
    scrap: { bedrooms: '4', price: undefined },
    facts: soldFacts('Pentland, Cross Lane, Northallerton, DL6 3ND'),
    lookups: { crime, flood: null, planning: null },
    skipLiveLivingHere: true,
  });
}

function assertSdltPurchaseCosts(purchaseCosts: string) {
  expect(purchaseCosts).toMatch(/£\s*23,620/);
  expect(purchaseCosts).not.toMatch(/£\s*21,120/);
}

/** Fixture A: 12 recorded months + known population → exact rate string. */
function fixtureACrimeLookup(): { lookup: CrimeLookup; expectedLabel: string } {
  const monthEnd = '2025-12';
  const months = last12Months(monthEnd);
  const countsByMonth: Record<string, number> = {
    '2025-01': 2,
    '2025-02': 1,
    '2025-03': 3,
    '2025-04': 0,
    '2025-05': 4,
    '2025-06': 2,
    '2025-07': 5,
    '2025-08': 1,
    '2025-09': 3,
    '2025-10': 2,
    '2025-11': 4,
    '2025-12': 3,
  };
  const monthlyCounts = months.map((m) => ({ month: m, count: countsByMonth[m] ?? 0 }));
  const population = 1500;
  const computed = computeCrimeRateFromMonths(monthlyCounts, population);
  expect(computed.status).toBe('ok');
  expect(computed.rate).toBe(20);
  const expectedLabel = formatCrimeRateLabel(computed.rate!, monthEnd);
  const lookup: CrimeLookup = {
    postcode: 'DL6 3ND',
    lat: 54.4,
    lng: -1.31,
    lsoa21cd: 'E01027627',
    crimeCountYear: computed.total,
    monthEnd,
    monthStart: months[0]!,
    population,
    populationSource: 'test fixture ONS LSOA population 1500',
    incidentsPerThousand: computed.rate,
    label: expectedLabel,
    interpretationHint:
      '30 recorded crimes in this LSOA over 12 months — levels appear low for a UK residential area on this metric.',
    sourceUrl: 'https://data.police.uk/',
    reliable: true,
    status: 'ok',
    debug: {
      monthlyCounts,
      incidents12m: computed.total,
      population,
      rate: computed.rate,
      gate: 'ok',
    },
  };
  return { lookup, expectedLabel };
}

describe('e2e Part 2: finalizeReport + SDLT (Gemini only)', () => {
  it(
    'Gemini path → finalizeReport marker + SDLT £23,620 in purchaseCosts',
    async () => {
      const analysis = await finalizeLikeGemini(
        V4_DEFECT_LLM_ANALYSIS as unknown as Record<string, unknown>,
        null
      );
      const purchaseCosts = String(
        (analysis.dueDiligence as { purchaseCosts?: string })?.purchaseCosts || ''
      );
      expect(analysis.finalizedBy).toBe(FINALIZE_REPORT_MARKER);
      assertSdltPurchaseCosts(purchaseCosts);
      console.log('[Part2 Gemini] purchaseCosts:', purchaseCosts);
    },
    30_000
  );
  it('buildPurchaseCostsStack discards LLM £21,120 for Pentland price', () => {
    const stack = buildPurchaseCostsStack(
      V4_DEFECT_LLM_ANALYSIS as unknown as Record<string, unknown>,
      BUYER_GOAL
    );
    expect(stack).toBe(
      'SDLT £23,620 (primary residence, standard rates); conveyancing ~£1,800; survey ~£650–£1,100.'
    );
  });
});

describe('e2e Part 3: crime rate with data-present fixtures', () => {
  it('fixture A: 12 months + population → exact expected rate string (fails if computation wrong)', async () => {
    const { lookup, expectedLabel } = fixtureACrimeLookup();
    const llm = structuredClone(V4_DEFECT_LLM_ANALYSIS) as unknown as Record<string, unknown>;
    // Poison LLM prose with a wrong rate — must not survive into PDF-bound text as a second figure
    const area = llm.areaAnalysis as { crimeSafety: { rating: string; description: string } };
    area.crimeSafety = {
      rating: '0.7 per 1,000',
      description: 'About 0.7 incidents per 1,000 residents — very quiet.',
    };

    const analysis = await finalizeLikeGemini(llm, lookup);
    const crimeSection = flattenCrimeSection(analysis);
    const fullText = flattenPdfBoundText(analysis);

    expect(crimeSection).toContain(expectedLabel);
    expect(fullText).toContain(expectedLabel);
    expect(fullText).not.toMatch(/0\.7\s*(incidents\s*)?(per|\/)\s*1,?000/i);
    expect(countPer1000(fullText)).toBe(1);

    console.log('[Part3 Fixture A] crime section:\n', crimeSection);
  });

  it('fixture B: null lookup → suppression sentence and no per-1,000 figure', async () => {
    const llm = structuredClone(V4_DEFECT_LLM_ANALYSIS) as unknown as Record<string, unknown>;
    const analysis = await finalizeLikeGemini(llm, null);
    const crimeSection = flattenCrimeSection(analysis);
    const fullText = flattenPdfBoundText(analysis);

    expect(crimeSection).toContain(CRIME_UNRELIABLE);
    expect(fullText).not.toMatch(/\d+(\.\d+)?\s*(incidents?\s*)?(per|\/)\s*1,?000/i);
    expect(countPer1000(fullText)).toBe(0);

    console.log('[Part3 Fixture B] crime section:\n', crimeSection);
  });
});
