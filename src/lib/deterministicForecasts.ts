/**
 * Deterministic valuation milestones, yield, and chart axes — LLM never emits milestone £.
 */

export type GrowthAssumptions = {
  lowPct: number;
  centralPct: number;
  highPct: number;
  /** Human-readable basis, e.g. "10-year average for this postcode sector" */
  basis: string;
};

export type ForecastMilestones = {
  baseValue: number;
  assumptions: GrowthAssumptions;
  /** Central path used for the chart + default cards */
  forecast1y: number;
  forecast3y: number;
  forecast5y: number;
  forecast10y: number;
  /** Optional bands at each horizon */
  bands: {
    y1: { low: number; central: number; high: number };
    y3: { low: number; central: number; high: number };
    y5: { low: number; central: number; high: number };
    y10: { low: number; central: number; high: number };
  };
};

function parseMoney(raw?: string | null): number | null {
  if (!raw) return null;
  const pound = String(raw).match(/£\s*([\d,]+(?:\.\d+)?)/);
  if (pound) {
    const n = parseFloat(pound[1]!.replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  const n = parseFloat(String(raw).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function formatGbpFull(n: number): string {
  return `£${Math.round(n).toLocaleString('en-GB')}`;
}

export function compound(base: number, annualPct: number, years: number): number {
  return base * Math.pow(1 + annualPct / 100, years);
}

export function computeForecastMilestones(
  baseValue: number,
  assumptions: GrowthAssumptions
): ForecastMilestones {
  const clampPct = (p: number) => Math.min(8, Math.max(-2, p));
  const low = clampPct(assumptions.lowPct);
  const central = clampPct(assumptions.centralPct);
  const high = clampPct(assumptions.highPct);
  const a = { ...assumptions, lowPct: low, centralPct: central, highPct: high };

  const band = (years: number) => ({
    low: Math.round(compound(baseValue, low, years)),
    central: Math.round(compound(baseValue, central, years)),
    high: Math.round(compound(baseValue, high, years)),
  });

  const y1 = band(1);
  const y3 = band(3);
  const y5 = band(5);
  const y10 = band(10);

  return {
    baseValue: Math.round(baseValue),
    assumptions: a,
    forecast1y: y1.central,
    forecast3y: y3.central,
    forecast5y: y5.central,
    forecast10y: y10.central,
    bands: { y1, y3, y5, y10 },
  };
}

export function parseGrowthAssumptions(raw: unknown): GrowthAssumptions {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const num = (v: unknown, fallback: number) => {
    const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
    return Number.isFinite(n) ? n : fallback;
  };
  return {
    lowPct: num(o.lowPct ?? o.growthLowPct, 1.0),
    centralPct: num(o.centralPct ?? o.growthCentralPct, 2.0),
    highPct: num(o.highPct ?? o.growthHighPct, 3.0),
    basis: String(o.basis || 'Assumed long-run local house-price growth — verify with a local agent').trim(),
  };
}

export function resolveBaseValue(analysis: Record<string, unknown>, scrapPrice?: string): number {
  const valuation = analysis.valuation as Record<string, string> | undefined;
  return (
    parseMoney(scrapPrice) ||
    parseMoney(String(analysis.price || '')) ||
    parseMoney(valuation?.fair) ||
    parseMoney(valuation?.conservative) ||
    300_000
  );
}

/** Apply computed milestones onto analysis.valuation (overwrites LLM forecast strings). */
export function applyDeterministicForecasts(
  analysis: Record<string, unknown>,
  scrapPrice?: string
): ForecastMilestones {
  const assumptions = parseGrowthAssumptions(
    (analysis as { growthAssumptions?: unknown }).growthAssumptions ||
      (analysis.valuation as { growthAssumptions?: unknown } | undefined)?.growthAssumptions
  );
  const base = resolveBaseValue(analysis, scrapPrice);
  const milestones = computeForecastMilestones(base, assumptions);
  const valuation = {
    ...((analysis.valuation as object) || {}),
    forecast1y: formatGbpFull(milestones.forecast1y),
    forecast3y: formatGbpFull(milestones.forecast3y),
    forecast5y: formatGbpFull(milestones.forecast5y),
    forecast10y: formatGbpFull(milestones.forecast10y),
    growthAssumptions: milestones.assumptions,
  };
  analysis.valuation = valuation;
  analysis.forecastMilestones = milestones;
  return milestones;
}

export function computeGrossYield(opts: {
  annualRent?: number | null;
  monthlyRent?: number | null;
  propertyValue: number;
}): { grossYieldPct: number; rentMonthly: number; label: string } | null {
  const monthly =
    opts.monthlyRent ??
    (opts.annualRent != null && Number.isFinite(opts.annualRent) ? opts.annualRent / 12 : null);
  if (monthly == null || !Number.isFinite(monthly) || monthly <= 0 || opts.propertyValue <= 0) {
    return null;
  }
  const annual = monthly * 12;
  const pct = (annual / opts.propertyValue) * 100;
  return {
    grossYieldPct: Math.round(pct * 100) / 100,
    rentMonthly: Math.round(monthly),
    label: `~${formatGbpFull(monthly)} pcm estimated rent → ${pct.toFixed(2)}% gross yield`,
  };
}

export function applyDeterministicYield(analysis: Record<string, unknown>): void {
  const im = (analysis.investmentMetrics || {}) as Record<string, unknown>;
  const rentRaw = String(im.estimatedRent || '');
  const monthly = parseMoney(rentRaw);
  const value = resolveBaseValue(analysis);
  const computed = computeGrossYield({ monthlyRent: monthly, propertyValue: value });
  if (computed) {
    im.grossYield = `${computed.grossYieldPct.toFixed(2)}%`;
    im.grossYieldBasis = computed.label;
    analysis.investmentMetrics = im;
  }
}

/** Chart axis ticks: 4–6 ticks at £50k or £100k steps spanning the data range. */
export function chartAxisTicks(min: number, max: number): number[] {
  const padMin = Math.min(min, max) * 0.98;
  const padMax = Math.max(min, max) * 1.02;
  const span = Math.max(padMax - padMin, 50_000);
  const step = span > 500_000 ? 100_000 : 50_000;
  let start = Math.floor(padMin / step) * step;
  let end = Math.ceil(padMax / step) * step;
  // Grow range until we have 4–6 ticks
  let ticks: number[] = [];
  for (let guard = 0; guard < 8; guard++) {
    ticks = [];
    for (let t = start; t <= end + 1; t += step) ticks.push(t);
    if (ticks.length < 4) {
      start -= step;
      end += step;
      continue;
    }
    if (ticks.length > 6) {
      // widen step
      const wide = step * 2;
      start = Math.floor(padMin / wide) * wide;
      end = Math.ceil(padMax / wide) * wide;
      ticks = [];
      for (let t = start; t <= end + 1; t += wide) ticks.push(t);
      if (ticks.length > 6) {
        // sample evenly to 5
        const out = [ticks[0]!];
        const mid = Math.floor(ticks.length / 2);
        out.push(ticks[Math.floor(mid / 2)]!, ticks[mid]!, ticks[Math.floor((mid + ticks.length) / 2)]!, ticks[ticks.length - 1]!);
        return [...new Set(out)].sort((a, b) => a - b);
      }
      return ticks;
    }
    return ticks;
  }
  return ticks.length ? ticks : [start, end];
}

export function forecastAssumptionsSentence(m: ForecastMilestones): string {
  const pct = m.assumptions.centralPct;
  const basis = m.assumptions.basis || 'local market assumptions';
  return `Assumes ${pct}% a year (${basis}); this is a forecast, not a promise.`;
}

export function roundToStep(n: number, step = 25_000): number {
  return Math.round(n / step) * step;
}

export function percentGrowth(from: number, to: number): number {
  if (!from || from <= 0) return 0;
  return Math.round(((to - from) / from) * 1000) / 10;
}
