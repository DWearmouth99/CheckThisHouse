/**
 * Part 1 — unit regression suite against library helpers (CURRENT production code).
 * Part 1B adds e2e PDF-bound tests in part1b-e2e-pipeline.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { estimateTransactionTax } from '../src/lib/ukPropertyTax';
import { computeCrimeRate, computeCrimeRateFromMonths, last12Months } from '../src/lib/policeUkLookup';
import {
  applyDeterministicForecasts,
  computeForecastMilestones,
  formatGbpNearest1k,
} from '../src/lib/deterministicForecasts';
import { computeDeterministicScores } from '../src/lib/deterministicScores';
import { BANNED_TERMS, findBannedHits } from '../src/lib/bannedTerms';

/** Required display rule for milestone labels (nearest £1k). */
function formatNearest1k(n: number): string {
  return formatGbpNearest1k(n);
}

function sdltPrimaryResidence(price: number): number {
  const est = estimateTransactionTax({
    price,
    nation: 'england_ni',
    buyerGoal: 'homebuyer primary residence',
  });
  if (!est) throw new Error(`No SDLT estimate for £${price}`);
  return Math.round(est.total);
}

describe('1. SDLT unit (England primary residence)', () => {
  it('sdlt(595000) === 19750', () => {
    expect(sdltPrimaryResidence(595_000)).toBe(19_750);
  });

  it('sdlt(672400) === 23620', () => {
    expect(sdltPrimaryResidence(672_400)).toBe(23_620);
  });
});

describe('2. Crime rate unit', () => {
  it('12 mocked months → rate === sum(counts) / population * 1000', () => {
    const months = last12Months('2025-12');
    expect(months).toHaveLength(12);
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
    const counts = months.map((m) => countsByMonth[m] ?? 0);
    const sum = counts.reduce((a, b) => a + b, 0);
    const population = 1500;
    const expected = Math.round((sum / population) * 1000 * 10) / 10;
    const { rate, gate } = computeCrimeRate(sum, population);
    expect(gate).toBe('ok');
    expect(rate).toBe(expected);
    expect(rate).toBe(20);
  });

  it('refuses to return an annualised rate when only ONE month of data is available', () => {
    const singleMonth = [{ month: '2025-06', count: 10 }];
    const population = 1800;
    const out = computeCrimeRateFromMonths(singleMonth, population);
    expect(out.rate).toBeNull();
    expect(out.status).toBe('insufficient_data');
    expect(out.reliable).toBe(false);
    expect(/insufficient/i.test(out.label)).toBe(true);
  });

  it('sanity gate: rate < 5 or > 400 → suppressed / unreliable, never a printed number', () => {
    const low = computeCrimeRate(2, 1800);
    expect(low.rate).toBeNull();
    expect(low.gate).toBe('too_low');
    const high = computeCrimeRate(900, 1800);
    expect(high.rate).toBeNull();
    expect(high.gate).toBe('too_high');
    expect(low.rate == null && high.rate == null).toBe(true);
  });
});

describe('3. Forecast consistency unit', () => {
  const milestones = computeForecastMilestones(672_400, {
    lowPct: 1,
    centralPct: 3,
    highPct: 4,
    basis: 'test basis',
  });

  const analysis: Record<string, unknown> = {
    price: '£672,400',
    valuation: {
      growthAssumptions: {
        lowPct: 1,
        centralPct: 3,
        highPct: 4,
        basis: 'test basis',
      },
    },
  };
  applyDeterministicForecasts(analysis);
  const fm = analysis.forecastMilestones as {
    forecast1y: number;
    forecast3y: number;
    forecast5y: number;
    forecast10y: number;
  };
  const valuation = analysis.valuation as {
    forecast1y: string;
    forecast3y: string;
    forecast5y: string;
    forecast10y: string;
  };

  it('card values === chart point labels (same data object, same formatter)', () => {
    const horizons = [
      ['1y', fm.forecast1y, valuation.forecast1y],
      ['3y', fm.forecast3y, valuation.forecast3y],
      ['5y', fm.forecast5y, valuation.forecast5y],
      ['10y', fm.forecast10y, valuation.forecast10y],
    ] as const;

    for (const [label, plotted, card] of horizons) {
      expect(card, `${label} card`).toBe(formatGbpNearest1k(plotted));
      expect(plotted, `${label} matches computeForecastMilestones`).toBe(
        milestones[`forecast${label}` as 'forecast1y']
      );
    }
  });

  it('display formatting rounds milestone labels to the nearest £1k', () => {
    const samples = [
      milestones.forecast1y,
      milestones.forecast3y,
      milestones.forecast5y,
      milestones.forecast10y,
    ];
    for (const n of samples) {
      const productionLabel = formatGbpNearest1k(n);
      const requiredLabel = formatNearest1k(n);
      expect(
        productionLabel,
        `milestone ${n}: production label "${productionLabel}" must equal nearest-£1k "${requiredLabel}"`
      ).toBe(requiredLabel);
    }
  });
});

describe('4. Scoring determinism unit', () => {
  it('calling scoring twice with the same fixture input returns deeply identical results', () => {
    const input = {
      epcBand: 'D',
      floodTone: 'positive' as const,
      crimePerThousand: 46.2,
      priceVsCompsPct: 8,
      hasPlanningMatch: false,
      transportMinutesToStation: 20,
      schoolOutstandingOrGood: true,
    };
    const a = computeDeterministicScores(input);
    const b = computeDeterministicScores(input);
    expect(a).toEqual(b);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('5. Banned terms unit', () => {
  it('every BANNED_TERMS entry is present and non-empty', () => {
    expect(BANNED_TERMS.length).toBeGreaterThan(0);
    for (const term of BANNED_TERMS) {
      expect(typeof term).toBe('string');
      expect(term.trim().length).toBeGreaterThan(0);
      expect(findBannedHits(`prefix ${term} suffix`)).toContain(term);
    }
  });

  it('includes the exact phrase "Reason for price difference not established"', () => {
    const phrase = 'Reason for price difference not established';
    const normalized = BANNED_TERMS.map((t) => t.toLowerCase());
    expect(normalized).toContain(phrase.toLowerCase());
    expect(findBannedHits(`Comp note: ${phrase}.`)).toEqual(
      expect.arrayContaining([expect.stringMatching(/reason for price difference not established/i)])
    );
  });
});
