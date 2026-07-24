/**
 * Part 7 — forecast £1k display, yield basis, Ofsted newer-inspection, floor-area provenance.
 */
import { describe, expect, it } from 'vitest';
import {
  applyDeterministicYield,
  computeGrossYield,
  formatGbpNearest1k,
} from '../src/lib/deterministicForecasts';
import { formatOfstedRatingCell, renderSchoolRatingForDisplay } from '../src/lib/notOnRecordRules';
import { applyPropertyFactLocks } from '../src/lib/propertyFacts';
import type { PropertyFacts } from '../src/lib/propertyFacts';
import { loadRecordedEpcSubject } from './helpers/loadRecorded';

describe('Part 7: forecast display nearest £1k', () => {
  it('formatGbpNearest1k rounds 692572 → £693,000', () => {
    expect(formatGbpNearest1k(692_572)).toBe('£693,000');
    expect(formatGbpNearest1k(860_729)).toBe('£861,000');
  });
});

describe('Part 7: yield basis', () => {
  it('renders est. £rent pcm (source) → yield% gross when rentEstimate exists', () => {
    const out = computeGrossYield({
      monthlyRent: 1600,
      rentSource: 'local asking rents',
      propertyValue: 672_400,
    });
    expect(out).not.toBeNull();
    expect(out!.label).toBe('est. £1,600 pcm (local asking rents) → 2.86% gross');
  });

  it('omits yield entirely when no rent source', () => {
    expect(
      computeGrossYield({
        monthlyRent: 1600,
        rentSource: null,
        propertyValue: 672_400,
      })
    ).toBeNull();

    const analysis: Record<string, unknown> = {
      price: '£672,400',
      investmentMetrics: { estimatedRent: '£1,600', grossYield: '3.5%' },
    };
    applyDeterministicYield(analysis);
    const im = analysis.investmentMetrics as Record<string, unknown>;
    expect(im.grossYield).toBeUndefined();
    expect(im.grossYieldBasis).toBeUndefined();
  });

  it('applyDeterministicYield with rentEstimate object writes full basis string', () => {
    const analysis: Record<string, unknown> = {
      price: '£672,400',
      investmentMetrics: {
        rentEstimate: { monthlyPcm: 1600, source: 'Zoopla area median' },
      },
    };
    applyDeterministicYield(analysis);
    const im = analysis.investmentMetrics as { grossYield?: string };
    expect(im.grossYield).toMatch(/^est\. £1,600 pcm \(Zoopla area median\) → .+% gross$/);
  });
});

describe('Part 7: Ofsted newer-inspection rule', () => {
  it('graded + newer report-card → "Good (Jan 2022) · report card Mar 2026"', () => {
    expect(
      formatOfstedRatingCell({
        grade: 'Good',
        inspectionDate: '13/01/2022',
        newerInspectionDate: '24/03/2026',
      })
    ).toBe('Good (Jan 2022) · report card Mar 2026');
  });

  it('fixture school with newer ungraded inspection never hides the newer date', () => {
    const cell = renderSchoolRatingForDisplay({
      ofsted: 'Good',
      ofstedDate: '13-01-2022',
      ofstedNewerDate: '24-03-2026',
    });
    expect(cell).toContain('Good');
    expect(cell).toContain('2022');
    expect(cell).toMatch(/report card Mar 2026/);
  });
});

describe('Part 7: floor area provenance', () => {
  it('subject floor area renders as "{n} sqm · EPC register"', () => {
    const epc = loadRecordedEpcSubject();
    expect(epc.matched?.floorAreaSqm).toBeTruthy();
    const analysis: Record<string, unknown> = {
      bedrooms: '4',
      bathrooms: '',
      propertyType: 'Detached',
      specs: [],
      location: { address: 'Pentland, Cross Lane, Northallerton, DL6 3ND' },
    };
    const facts: PropertyFacts = {
      address: 'Pentland, Cross Lane, Northallerton, DL6 3ND',
      epc,
      landRegistry: {
        postcode: 'DL6 3ND',
        thisProperty: [],
        nearbySameStreet: [],
        nearbyPostcode: [],
        nearby: [],
        sourceUrl: 'x',
      },
      brief: 'test',
      sources: [],
    };
    applyPropertyFactLocks(analysis, facts, {});
    const specs = analysis.specs as { label: string; value: string }[];
    const floor = specs.find((s) => /floor area/i.test(s.label));
    expect(floor?.value).toBe(`${epc.matched!.floorAreaSqm} sqm · EPC register`);
  });
});
