/**
 * Prose fields excluded from golden fact comparison.
 * Keep this allowlist small — if in doubt, a field is a fact.
 *
 * Re-approve golden snapshot (from recorded fixtures):
 *   npm run data:record-fixtures
 *   UPDATE_GOLDEN=1 npx vitest run tests/part4-reproducibility.test.ts
 */
export const PROSE_ALLOWLIST = [
  'summary',
  'buyingSuitability',
  'pros',
  'cons',
  'viewingChecks',
  'agentQuestions',
  'finalizeWarnings',
  // Nested prose under due diligence / risk / market narration
  'dueDiligence.broadbandAndMobile',
  'dueDiligence.tenureAndLegal',
  'dueDiligence.councilTaxAndParking',
  'dueDiligence.environmentalOther',
  'dueDiligence.ownershipAndChain',
  'dueDiligence.recommendedNextSteps',
  'dueDiligence.epcAndEnergy',
  'riskAnalysis.subsidence',
  'riskAnalysis.planningDevelopments',
  'riskAnalysis.leaseholdIssues',
  'riskAnalysis.fireSafety',
  'riskAnalysis.insuranceRisk',
  'marketAndRental',
  'locationIntelligence',
  'advanced',
  'marketEvidence.competingSupply',
  'marketEvidence.askingVsSoldEvidence',
  'investmentMetrics.growthReasoning',
  'investmentMetrics.netYield',
  'investmentMetrics.roi',
  'investmentMetrics.cashflow',
  'investmentMetrics.irr',
  'investmentMetrics.breakEven',
  'areaAnalysis.demographics',
  'areaAnalysis.amenities',
  'areaAnalysis.futureOutlook',
  'areaAnalysis.crimeSafety.description',
  'propertyWorks.certainty',
  'propertyWorks.valueImpact',
  'propertyWorks.extensionsAndAlterations',
  'propertyWorks.planningApplications',
  'recentlySoldPanel',
  'sources',
  // Living Here — vignette / themes / validator log are prose; POI facts stay in golden
  'livingHere.vignette',
  'livingHere.groundingLog',
  'proseGroundingLog',
  'listingDetected',
  'listingDetected.queried',
  'listingDetected.researchSnippet',
  'listingDetected.gateLog',
  'listingDetected.operatorBlock',
] as const;

function pathAllowed(path: string): boolean {
  if (/\.reviewTheme$/.test(path)) return true;
  // Insight prose may vary with LLM polish; selection/ids/stats stay as facts
  if (
    /^(insights|frontPageInsights|sectionCallouts|eraProfile\.issues)/.test(path) &&
    /\.(text|headline|issue|check|fabricJoin)$/.test(path)
  ) {
    return true;
  }
  if (path === 'insightsValidationLog' || path.startsWith('insightsValidationLog.')) return true;
  return PROSE_ALLOWLIST.some(
    (a) => path === a || path.startsWith(a + '.') || path.startsWith(a + '[')
  );
}

/** Strip prose allowlist paths from a deep clone. */
export function extractFactSlice(input: Record<string, unknown>): Record<string, unknown> {
  const clone = structuredClone(input) as Record<string, unknown>;

  const walk = (node: unknown, path: string): unknown => {
    if (pathAllowed(path)) return undefined;
    if (Array.isArray(node)) {
      return node
        .map((item, i) => walk(item, `${path}[${i}]`))
        .filter((x) => x !== undefined);
    }
    if (node && typeof node === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        const childPath = path ? `${path}.${k}` : k;
        if (pathAllowed(childPath)) continue;
        const next = walk(v, childPath);
        if (next !== undefined) out[k] = next;
      }
      return out;
    }
    return node;
  };

  return walk(clone, '') as Record<string, unknown>;
}

export function deepSortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(deepSortKeys);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as object).sort()) {
      out[k] = deepSortKeys((value as Record<string, unknown>)[k]);
    }
    return out;
  }
  return value;
}
