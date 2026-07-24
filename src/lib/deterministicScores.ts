/**
 * Deterministic overall / component scores from verified inputs.
 * LLM may explain scores; it must not set the numbers.
 *
 * =============================================================================
 * RUBRIC WEIGHTS (P9) — operator calibration reference
 * =============================================================================
 * overall =
 *   0.28 * valueForMoney +
 *   0.28 * locationRating +
 *   0.22 * conditionRating +
 *   0.12 * marketScore +
 *   0.10 * riskNumeric
 * (renormalised over components that have real inputs — never score a vacuum)
 *
 * Component inputs (each FACT feeds at most ONE primary component):
 *   valueForMoney  ← priceVsCompsPct ONLY   ("price at ceiling" / street position)
 *   locationRating ← 0.45*crime + 0.35*transport + 0.20*schools
 *   conditionRating← EPC band, else soft conditionEstimate (extensions / listing)
 *   marketScore    ← planning match only (+ base 70); NOT price position
 *   riskNumeric    ← 0.40*flood + 0.35*crime + 0.25*tenure/condition proxy
 *                    Risk must NOT use priceVsCompsPct
 *   investment/rental are derived blends of the above (not new facts)
 *
 * Vacuum rule: a component whose inputs are entirely missing renders
 * "— insufficient data" and is excluded from the overall (overall shows
 * "based on N of 4 components").
 * =============================================================================
 */

export type ScoreInputs = {
  epcBand?: string | null;
  floodTone?: 'positive' | 'caution' | 'negative' | 'neutral' | string | null;
  crimePerThousand?: number | null;
  /** Qualitative crime from grounded web research when police.uk rate missing */
  crimeLevel?: 'low' | 'average' | 'high' | null;
  priceVsCompsPct?: number | null; /** positive = asking above comps — feeds valueForMoney ONLY */
  hasPlanningMatch?: boolean;
  transportMinutesToStation?: number | null;
  schoolOutstandingOrGood?: boolean | null;
  /**
   * Soft condition 0–100 when no EPC band (extensions / listing / typical stock).
   * Used only if epcBand is absent — never overrides a real EPC.
   */
  conditionEstimate?: number | null;
};

export type ComponentScoreStatus = 'scored' | 'insufficient';

export type DeterministicScores = {
  overall: number;
  valueForMoney: number;
  locationRating: number;
  conditionRating: number;
  investmentScore: number;
  marketScore: number;
  rentalScore: number;
  growthPotential: 'Low' | 'Medium' | 'High';
  riskLevel: 'Low' | 'Medium' | 'High';
  confidenceScore: number;
  /** Display: null → "— insufficient data" */
  valueForMoneyStatus: ComponentScoreStatus;
  locationRatingStatus: ComponentScoreStatus;
  conditionRatingStatus: ComponentScoreStatus;
  marketScoreStatus: ComponentScoreStatus;
  /** How many of the 4 primary components contributed to overall */
  scoredComponentCount: number;
  /** e.g. "based on 2 of 4 components" */
  overallBasis: string;
};

function clamp(n: number, lo = 0, hi = 100) {
  return Math.min(hi, Math.max(lo, Math.round(n)));
}

function epcScore(band?: string | null): number | null {
  const b = String(band || '').trim().toUpperCase().charAt(0);
  if (!b || !/[A-G]/.test(b)) return null;
  const map: Record<string, number> = { A: 95, B: 88, C: 78, D: 65, E: 52, F: 38, G: 25 };
  return map[b] ?? null;
}

function floodScore(tone?: string | null): number | null {
  if (tone == null || String(tone).trim() === '') return null;
  const t = String(tone).toLowerCase();
  if (t === 'positive') return 90;
  if (t === 'caution') return 60;
  if (t === 'negative') return 35;
  if (t === 'neutral') return 70;
  return 70;
}

function crimeScore(
  perThousand?: number | null,
  level?: 'low' | 'average' | 'high' | null
): number | null {
  if (perThousand != null && Number.isFinite(perThousand)) {
    if (perThousand <= 30) return 92;
    if (perThousand <= 50) return 82;
    if (perThousand <= 80) return 70;
    if (perThousand <= 120) return 55;
    return 40;
  }
  if (level === 'low') return 88;
  if (level === 'average') return 68;
  if (level === 'high') return 42;
  return null;
}

function valueScore(priceVsCompsPct?: number | null): number | null {
  if (priceVsCompsPct == null || !Number.isFinite(priceVsCompsPct)) return null;
  if (priceVsCompsPct <= -8) return 90;
  if (priceVsCompsPct <= -3) return 80;
  if (priceVsCompsPct <= 3) return 70;
  if (priceVsCompsPct <= 8) return 55;
  return 40;
}

function transportScore(mins?: number | null): number | null {
  if (mins == null || !Number.isFinite(mins)) return null;
  if (mins <= 10) return 90;
  if (mins <= 20) return 78;
  if (mins <= 35) return 65;
  return 50;
}

function schoolScore(good?: boolean | null): number | null {
  if (good == null) return null;
  return good ? 85 : 60;
}

export function computeDeterministicScores(input: ScoreInputs): DeterministicScores {
  const fromEpc = epcScore(input.epcBand);
  const fromEstimate =
    fromEpc == null &&
    input.conditionEstimate != null &&
    Number.isFinite(input.conditionEstimate)
      ? clamp(input.conditionEstimate)
      : null;
  const conditionRaw = fromEpc ?? fromEstimate;
  const conditionRatingStatus: ComponentScoreStatus =
    conditionRaw == null ? 'insufficient' : 'scored';
  const conditionRating = conditionRaw == null ? 0 : clamp(conditionRaw);

  const crime = crimeScore(input.crimePerThousand, input.crimeLevel);
  const transport = transportScore(input.transportMinutesToStation);
  const school = schoolScore(input.schoolOutstandingOrGood);
  const locationParts = [
    crime != null ? { w: 0.45, v: crime } : null,
    transport != null ? { w: 0.35, v: transport } : null,
    school != null ? { w: 0.2, v: school } : null,
  ].filter(Boolean) as { w: number; v: number }[];
  const locationRatingStatus: ComponentScoreStatus =
    locationParts.length === 0 ? 'insufficient' : 'scored';
  let locationRating = 0;
  if (locationParts.length) {
    const wSum = locationParts.reduce((a, p) => a + p.w, 0);
    locationRating = clamp(locationParts.reduce((a, p) => a + (p.w / wSum) * p.v, 0));
  }

  const valueRaw = valueScore(input.priceVsCompsPct);
  const valueForMoneyStatus: ComponentScoreStatus = valueRaw == null ? 'insufficient' : 'scored';
  const valueForMoney = valueRaw == null ? 0 : clamp(valueRaw);

  // Market: planning match is a known boolean once lookup runs — always scoreable
  const marketScoreStatus: ComponentScoreStatus = 'scored';
  const marketScore = clamp(70 + (input.hasPlanningMatch ? 8 : 0));

  const investmentScore = clamp(
    0.4 * (valueForMoneyStatus === 'scored' ? valueForMoney : 55) +
      0.35 * (locationRatingStatus === 'scored' ? locationRating : 55) +
      0.25 * (conditionRatingStatus === 'scored' ? conditionRating : 55)
  );
  const rentalScore = clamp(
    0.5 * (locationRatingStatus === 'scored' ? locationRating : 55) +
      0.3 * (valueForMoneyStatus === 'scored' ? valueForMoney : 55) +
      0.2 * (conditionRatingStatus === 'scored' ? conditionRating : 55)
  );

  const flood = floodScore(input.floodTone);
  const riskParts = [
    flood != null ? { w: 0.4, v: flood } : null,
    crime != null ? { w: 0.35, v: crime } : null,
    conditionRaw != null ? { w: 0.25, v: conditionRating } : null,
  ].filter(Boolean) as { w: number; v: number }[];
  let riskNumeric = 55;
  if (riskParts.length) {
    const wSum = riskParts.reduce((a, p) => a + p.w, 0);
    riskNumeric = clamp(riskParts.reduce((a, p) => a + (p.w / wSum) * p.v, 0));
  }
  const riskLevel: DeterministicScores['riskLevel'] =
    riskParts.length === 0
      ? 'Medium'
      : riskNumeric >= 75
        ? 'Low'
        : riskNumeric >= 55
          ? 'Medium'
          : 'High';

  // Overall from the 4 primary components that have data — renormalise weights
  const overallParts: { w: number; v: number }[] = [];
  if (valueForMoneyStatus === 'scored') overallParts.push({ w: 0.28, v: valueForMoney });
  if (locationRatingStatus === 'scored') overallParts.push({ w: 0.28, v: locationRating });
  if (conditionRatingStatus === 'scored') overallParts.push({ w: 0.22, v: conditionRating });
  if (marketScoreStatus === 'scored') overallParts.push({ w: 0.12, v: marketScore });
  // Risk only contributes when we have risk inputs
  if (riskParts.length) overallParts.push({ w: 0.1, v: riskNumeric });

  const scoredComponentCount = [
    valueForMoneyStatus,
    locationRatingStatus,
    conditionRatingStatus,
    marketScoreStatus,
  ].filter((s) => s === 'scored').length;

  let overall = 0;
  if (overallParts.length) {
    const wSum = overallParts.reduce((a, p) => a + p.w, 0);
    overall = clamp(overallParts.reduce((a, p) => a + (p.w / wSum) * p.v, 0));
  }

  const growthPotential: DeterministicScores['growthPotential'] =
    scoredComponentCount === 0
      ? 'Low'
      : overall >= 78 && valueForMoneyStatus === 'scored' && valueForMoney >= 70
        ? 'High'
        : overall >= 60
          ? 'Medium'
          : 'Low';

  const known =
    (input.epcBand || input.conditionEstimate != null ? 1 : 0) +
    (input.crimePerThousand != null || input.crimeLevel ? 1 : 0) +
    (input.priceVsCompsPct != null ? 1 : 0) +
    (input.floodTone ? 1 : 0);
  const confidenceScore = clamp(45 + known * 12);

  return {
    overall,
    valueForMoney,
    locationRating,
    conditionRating,
    investmentScore,
    marketScore,
    rentalScore,
    growthPotential,
    riskLevel,
    confidenceScore,
    valueForMoneyStatus,
    locationRatingStatus,
    conditionRatingStatus,
    marketScoreStatus,
    scoredComponentCount,
    overallBasis: `based on ${scoredComponentCount} of 4 components`,
  };
}

export function applyDeterministicScores(
  analysis: Record<string, unknown>,
  input: ScoreInputs
): DeterministicScores {
  const scores = computeDeterministicScores(input);
  analysis.scores = { ...scores };
  return scores;
}
