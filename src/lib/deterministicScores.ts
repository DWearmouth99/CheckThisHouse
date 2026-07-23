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
 *
 * Component inputs (each FACT feeds at most ONE primary component):
 *   valueForMoney  ← priceVsCompsPct ONLY   ("price at ceiling" / street position)
 *   locationRating ← 0.45*crime + 0.35*transport + 0.20*schools
 *   conditionRating← EPC band only
 *   marketScore    ← planning match only (+ base 70); NOT price position
 *   riskNumeric    ← 0.40*flood + 0.35*crime + 0.25*tenure/condition proxy
 *                    Risk must NOT use priceVsCompsPct
 *   investment/rental are derived blends of the above (not new facts)
 *
 * Justification: "sold recently at street ceiling" / price vs comps feeds
 * valueForMoney only — never marketScore and never riskLevel.
 * =============================================================================
 */

export type ScoreInputs = {
  epcBand?: string | null;
  floodTone?: 'positive' | 'caution' | 'negative' | 'neutral' | string | null;
  crimePerThousand?: number | null;
  priceVsCompsPct?: number | null; /** positive = asking above comps — feeds valueForMoney ONLY */
  hasPlanningMatch?: boolean;
  transportMinutesToStation?: number | null;
  schoolOutstandingOrGood?: boolean | null;
};

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
};

function clamp(n: number, lo = 0, hi = 100) {
  return Math.min(hi, Math.max(lo, Math.round(n)));
}

function epcScore(band?: string | null): number {
  const b = String(band || '').trim().toUpperCase().charAt(0);
  const map: Record<string, number> = { A: 95, B: 88, C: 78, D: 65, E: 52, F: 38, G: 25 };
  return map[b] ?? 55;
}

function floodScore(tone?: string | null): number {
  const t = String(tone || 'neutral').toLowerCase();
  if (t === 'positive') return 90;
  if (t === 'caution') return 60;
  if (t === 'negative') return 35;
  return 70;
}

function crimeScore(perThousand?: number | null): number {
  if (perThousand == null || !Number.isFinite(perThousand)) return 65;
  if (perThousand <= 30) return 92;
  if (perThousand <= 50) return 82;
  if (perThousand <= 80) return 70;
  if (perThousand <= 120) return 55;
  return 40;
}

function valueScore(priceVsCompsPct?: number | null): number {
  if (priceVsCompsPct == null || !Number.isFinite(priceVsCompsPct)) return 65;
  if (priceVsCompsPct <= -8) return 90;
  if (priceVsCompsPct <= -3) return 80;
  if (priceVsCompsPct <= 3) return 70;
  if (priceVsCompsPct <= 8) return 55;
  return 40;
}

function transportScore(mins?: number | null): number {
  if (mins == null || !Number.isFinite(mins)) return 65;
  if (mins <= 10) return 90;
  if (mins <= 20) return 78;
  if (mins <= 35) return 65;
  return 50;
}

export function computeDeterministicScores(input: ScoreInputs): DeterministicScores {
  const conditionRating = clamp(epcScore(input.epcBand));
  const locationRating = clamp(
    0.45 * crimeScore(input.crimePerThousand) +
      0.35 * transportScore(input.transportMinutesToStation) +
      0.2 * (input.schoolOutstandingOrGood ? 85 : 60)
  );
  // Price position → valueForMoney only (P9)
  const valueForMoney = clamp(valueScore(input.priceVsCompsPct));
  // Market: planning/activity signal only — do NOT subtract priceVsCompsPct
  const marketScore = clamp(70 + (input.hasPlanningMatch ? 8 : 0));
  const investmentScore = clamp(0.4 * valueForMoney + 0.35 * locationRating + 0.25 * conditionRating);
  const rentalScore = clamp(0.5 * locationRating + 0.3 * valueForMoney + 0.2 * conditionRating);

  const flood = floodScore(input.floodTone);
  // Risk from risk-category facts only (flood, crime, condition/tenure proxy) — not price
  const riskNumeric = clamp(0.4 * flood + 0.35 * crimeScore(input.crimePerThousand) + 0.25 * conditionRating);
  const riskLevel: DeterministicScores['riskLevel'] =
    riskNumeric >= 75 ? 'Low' : riskNumeric >= 55 ? 'Medium' : 'High';

  const overall = clamp(
    0.28 * valueForMoney +
      0.28 * locationRating +
      0.22 * conditionRating +
      0.12 * marketScore +
      0.1 * riskNumeric
  );

  const growthPotential: DeterministicScores['growthPotential'] =
    overall >= 78 && valueForMoney >= 70 ? 'High' : overall >= 60 ? 'Medium' : 'Low';

  const known =
    (input.epcBand ? 1 : 0) +
    (input.crimePerThousand != null ? 1 : 0) +
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
