/**
 * Infer / correct risk tones from evidence when the model leaves them neutral
 * or contradicts clear upside (e.g. approved extension that adds value).
 */

type Tone = "positive" | "caution" | "negative" | "neutral";

type RiskTones = {
  floodRisk: Tone;
  subsidence: Tone;
  planningDevelopments: Tone;
  leaseholdIssues: Tone;
  fireSafety: Tone;
  insuranceRisk: Tone;
};

function asTone(v: unknown): Tone {
  if (v === "positive" || v === "caution" || v === "negative" || v === "neutral") return v;
  return "neutral";
}

export function refineRiskTones(
  analysis: Record<string, unknown>
): void {
  const tonesRaw = (analysis.riskTones || {}) as Record<string, unknown>;
  const risk = (analysis.riskAnalysis || {}) as Record<string, string>;
  const works = (analysis.propertyWorks || {}) as Record<string, string>;

  const tones: RiskTones = {
    floodRisk: asTone(tonesRaw.floodRisk),
    subsidence: asTone(tonesRaw.subsidence),
    planningDevelopments: asTone(tonesRaw.planningDevelopments),
    leaseholdIssues: asTone(tonesRaw.leaseholdIssues),
    fireSafety: asTone(tonesRaw.fireSafety),
    insuranceRisk: asTone(tonesRaw.insuranceRisk),
  };

  const planningBlob = [
    risk.planningDevelopments,
    works.extensionsAndAlterations,
    works.valueImpact,
    works.planningApplications,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const valueAddingWorks =
    /\b(extension|loft|approved|granted|permitted|adds?\s+value|valuation\s+premium|completed|improved|larger|value[-\s]?add)\b/.test(
      planningBlob
    ) && !/\b(refused|enforcement|unauthorised|illegal|non[-\s]?compliant)\b/.test(planningBlob);

  if (valueAddingWorks && (tones.planningDevelopments === "neutral" || tones.planningDevelopments === "caution")) {
    tones.planningDevelopments = "positive";
  }

  const freeholdClean =
    /\b(freehold|no\s+leasehold|no\s+(known\s+)?(lease|ground\s+rent)\s+issues?)\b/i.test(
      risk.leaseholdIssues || ""
    );
  if (freeholdClean && tones.leaseholdIssues === "neutral") {
    tones.leaseholdIssues = "positive";
  }

  const lowFlood = /\b(low|minimal|negligible|no\s+(known\s+)?flood|very\s+low)\b/i.test(
    risk.floodRisk || ""
  );
  if (lowFlood && tones.floodRisk === "neutral") {
    tones.floodRisk = "positive";
  }

  analysis.riskTones = tones;
}
