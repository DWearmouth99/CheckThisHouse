/**
 * Part 5 — Ofsted rating cells + suppression Rules A/B/C.
 * E2E / golden use recorded fixtures (Part 6B).
 */
import { describe, expect, it, beforeAll, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  BUYER_CRITICAL_UNRESOLVED_ALLOWLIST,
  formatOfstedRatingCell,
  formatSchoolsTableText,
  renderSchoolRatingForDisplay,
  resolveSpecsRows,
} from '../src/lib/notOnRecordRules';
import { finalizeReport } from '../src/lib/finalizeReport';
import { extractFactSlice, deepSortKeys } from './fixtures/goldenFactAllowlist';
import { V4_DEFECT_LLM_ANALYSIS } from './fixtures/v4DefectLlmAnalysis';
import {
  assertRecordedFixturesReady,
  GOLDEN_PATH,
  loadRecordedCrime,
  loadRecordedLivingHere,
  recordedPropertyFacts,
} from './helpers/loadRecorded';

vi.mock('../src/lib/epcLookup', async () => {
  const actual = await vi.importActual<typeof import('../src/lib/epcLookup')>('../src/lib/epcLookup');
  return {
    ...actual,
    fetchEpcCertificatesForPostcode: async (postcode: string) => {
      const compact = postcode.replace(/\s+/g, '').toUpperCase();
      if (compact !== 'DL63ND') return [];
      const { loadRecordedEpcCertificates } = await import('./helpers/loadRecorded');
      return loadRecordedEpcCertificates();
    },
  };
});

describe('Part 5 Rule A: resolved Ofsted ratings must render', () => {
  it('v4 bug shape: school WITH rating must never render as "—"', () => {
    const school = { name: 'Osmotherley Primary School', distance: '2.3 miles', rating: 'Good' };
    const cell = renderSchoolRatingForDisplay(school);
    expect(cell).toBe('Good');
    expect(cell).not.toBe('—');
    expect(cell).not.toMatch(/not on record/i);
  });

  it('formats grade+date, grade-only, not-yet-inspected, post-retirement', () => {
    expect(formatOfstedRatingCell({ grade: 'Good', inspectionDate: '15-03-2019' })).toBe(
      'Good (Mar 2019)'
    );
    expect(formatOfstedRatingCell({ grade: 'Outstanding' })).toBe('Outstanding');
    expect(formatOfstedRatingCell({ grade: '' })).toBe('Not yet inspected');
    expect(formatOfstedRatingCell({ grade: 'Not on record' })).toBe('Not yet inspected');
    expect(
      formatOfstedRatingCell({
        grade: '',
        inspectionDate: '2024-11-12',
        postRetirementNoGrade: true,
      })
    ).toBe('See Ofsted report (Nov 2024)');
    expect(
      formatOfstedRatingCell({
        grade: 'Report card only',
        inspectionDate: '2025-01-20',
      })
    ).toBe('See Ofsted report (Jan 2025)');
  });
});

describe('Part 5 Rule B: duplicate schema fields resolve to one', () => {
  it('Bedrooms: 4 + Bedrooms/rooms: Not on record → single resolved row', () => {
    const out = resolveSpecsRows([
      { label: 'Bedrooms', value: '4' },
      { label: 'Bedrooms/rooms', value: 'Not on record' },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.value).toBe('4');
  });
});

describe('Part 5 Rule C: buyer-critical allowlist', () => {
  it('allowlist is floor area, council tax band, EPC, bathrooms', () => {
    expect([...BUYER_CRITICAL_UNRESOLVED_ALLOWLIST].sort()).toEqual(
      ['bathrooms', 'council tax band', 'epc', 'floor area'].sort()
    );
  });

  it('unresolved allowlisted → Not on record — verify with {source}; others omitted', () => {
    const out = resolveSpecsRows([
      { label: 'Bathrooms', value: 'Not on record' },
      { label: 'Floor area', value: 'Unknown' },
      { label: 'EPC rating', value: '—' },
      { label: 'Council tax band', value: 'N/A' },
      { label: 'Garden size', value: 'Not on record' },
    ]);
    const labels = out.map((r) => r.label.toLowerCase());
    expect(labels.some((l) => l.includes('bath'))).toBe(true);
    expect(labels.some((l) => l.includes('floor'))).toBe(true);
    expect(labels.some((l) => l.includes('epc'))).toBe(true);
    expect(labels.some((l) => l.includes('council'))).toBe(true);
    expect(labels.some((l) => l.includes('garden'))).toBe(false);
  });

  it('Garden size must not collapse into Floor area (v4-style false duplicate)', () => {
    const out = resolveSpecsRows([
      { label: 'Floor area', value: 'Unknown' },
      { label: 'Garden size', value: 'Not on record' },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.label).toMatch(/floor/i);
  });
});

describe('Part 5 acceptance: Pentland schools + golden (recorded)', () => {
  let analysis: Record<string, unknown>;

  beforeAll(async () => {
    assertRecordedFixturesReady();
    analysis = await finalizeReport(
      structuredClone(V4_DEFECT_LLM_ANALYSIS) as unknown as Record<string, unknown>,
      {
        buyerGoal: 'homebuyer primary residence',
        scrap: { bedrooms: '4', propertyType: 'Detached' },
        facts: recordedPropertyFacts(),
        lookups: {
          crime: loadRecordedCrime(),
          flood: null,
          planning: null,
          livingHere: loadRecordedLivingHere(),
        },
        growthAsOf: new Date('2026-07-23'),
        skipLiveLivingHere: true,
      }
    );
  }, 60_000);

  it('schools table: 4 rows, rating or Not yet inspected, zero em-dashes / Not on record', () => {
    const schools = ((analysis.areaAnalysis as { schools?: { name: string; distance: string; rating: string }[] })
      ?.schools || []) as { name: string; distance: string; rating: string; ofsted?: string }[];
    expect(schools.length).toBe(4);
    const table = formatSchoolsTableText(schools);
    // eslint-disable-next-line no-console
    console.log('[Part5] schools table:\n' + table);
    for (const s of schools) {
      const cell = renderSchoolRatingForDisplay(s);
      expect(cell).not.toBe('—');
      expect(cell).not.toMatch(/not on record/i);
    }
  });

  it('golden snapshot matches recorded-backed run', () => {
    const slice = deepSortKeys(extractFactSlice(analysis));
    if (process.env.UPDATE_GOLDEN === '1') {
      fs.mkdirSync(path.dirname(GOLDEN_PATH), { recursive: true });
      fs.writeFileSync(GOLDEN_PATH, JSON.stringify(slice, null, 2) + '\n', 'utf8');
    }
    expect(fs.existsSync(GOLDEN_PATH)).toBe(true);
    const golden = JSON.parse(fs.readFileSync(GOLDEN_PATH, 'utf8'));
    expect(slice).toEqual(golden);
  });
});
