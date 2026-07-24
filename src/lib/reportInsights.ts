/**
 * Interpretation layer — Class 1 (era), Class 2 (computed), Class 3 (cross-fact).
 * Safety: LLM never invents property facts; validators enforce hedges, numerals, provenance.
 */

import {
  computeComparativeStats,
  extractCompPsm,
  parseSubjectPsm,
  type ComparativeStat,
} from './comparativeStats';
import {
  formatAgeBandDisplay,
  normalizeConstructionAgeBand,
  type EpcRecord,
} from './epcLookup';
import type { CrimeLookup } from './policeUkLookup';
import type { PropertyFacts } from './propertyFacts';
import {
  buildVerifiedFactBag,
  extractProseNumerals,
  factExists,
  type VerifiedFactBag,
} from './verifiedFacts';

export type InsightClass = 1 | 2 | 3;

export type EraIssue = {
  id: string;
  issue: string;
  check: string;
  /** Confirm / deny join when EPC fabric speaks to this issue */
  fabricJoin?: string;
  confirmedByEpc?: boolean;
};

export type Insight = {
  id: string;
  insightClass: InsightClass;
  text: string;
  /** Front-page punchy line */
  headline: string;
  section?:
    | 'cover'
    | 'summary'
    | 'valuation'
    | 'risks'
    | 'area'
    | 'dueDiligence'
    | 'comps'
    | 'offer';
  /** Class 1 issue+check */
  eraIssue?: EraIssue;
  /** Class 2 */
  statId?: string;
  /** Class 3 */
  derivedFrom?: string[];
  rankScore: number;
};

export type InsightsPackage = {
  verifiedFacts: VerifiedFactBag;
  comparativeStats: ComparativeStat[];
  era: {
    ageBand: string | null;
    propertyType: string | null;
    title: string | null;
    issues: EraIssue[];
  };
  insights: Insight[];
  frontPage: Insight[];
  sectionCallouts: Partial<Record<NonNullable<Insight['section']>, Insight>>;
  validationLog: InsightValidationEntry[];
};

export type InsightValidationEntry = {
  at: string;
  decision: 'pass' | 'reject' | 'retry' | 'drop';
  insightClass?: InsightClass;
  detail: string;
  text?: string;
};

const HEDGE_RE =
  /\b(homes? of this era|typically|commonly|often|worth checking|you may find|frequently|can be|tend to|usual for)\b/i;

const UNHEDGED_PROPERTY_ASSERT_RE =
  /\b(the property has|this (home|house|property) has|this (home|house|property)'s walls are|uninsulated walls without|definitely has)\b/i;

export function validateClass1Text(
  text: string,
  epc: EpcRecord | null | undefined
): { ok: boolean; reason?: string } {
  if (!text?.trim()) return { ok: false, reason: 'empty' };
  const assertsProperty = UNHEDGED_PROPERTY_ASSERT_RE.test(text);
  if (assertsProperty) {
    // Allowed only when citing exact EPC fabric wording
    const walls = epc?.wallsDescription || '';
    const floor = epc?.floorDescription || '';
    const roof = epc?.roofDescription || '';
    const citesFabric =
      (walls && text.toLowerCase().includes(walls.toLowerCase().slice(0, 24))) ||
      (floor && text.toLowerCase().includes(floor.toLowerCase().slice(0, 24))) ||
      (roof && text.toLowerCase().includes(roof.toLowerCase().slice(0, 24))) ||
      /\b(certificate (confirms|records)|recorded as)\b/i.test(text);
    if (!citesFabric) {
      return { ok: false, reason: 'unhedged property assertion without EPC citation' };
    }
  }
  if (!HEDGE_RE.test(text) && !/\b(certificate (confirms|records)|recorded as)\b/i.test(text)) {
    return { ok: false, reason: 'missing era-typical hedge framing' };
  }
  return { ok: true };
}

export function validateClass2Text(
  text: string,
  stat: ComparativeStat
): { ok: boolean; reason?: string } {
  if (!text?.trim()) return { ok: false, reason: 'empty' };
  const nums = extractProseNumerals(text);
  const need = String(stat.displayValue);
  const core = need.replace(/[^\d.]/g, '');
  if (!nums.includes(core) && !text.includes(need)) {
    return {
      ok: false,
      reason: `numeral mismatch — expected ${need}, found [${nums.join(', ')}]`,
    };
  }
  return { ok: true };
}

export function validateClass3Insight(
  text: string,
  derivedFrom: string[],
  bag: VerifiedFactBag
): { ok: boolean; reason?: string } {
  if (!text?.trim()) return { ok: false, reason: 'empty' };
  if (!derivedFrom?.length) return { ok: false, reason: 'missing derivedFrom' };
  for (const id of derivedFrom) {
    if (!factExists(bag, id)) {
      return { ok: false, reason: `unknown factId: ${id}` };
    }
  }
  const nums = extractProseNumerals(text);
  if (nums.length === 0) return { ok: true };
  const allowed = new Set<string>();
  for (const id of derivedFrom) {
    for (const n of bag[id]?.numerals || []) allowed.add(n);
  }
  // Also allow short year fragments from dates already in bag
  for (const id of derivedFrom) {
    const v = String(bag[id]?.value ?? '');
    for (const y of v.match(/\d{4}/g) || []) allowed.add(y);
  }
  for (const n of nums) {
    if (!allowed.has(n)) {
      return { ok: false, reason: `numeral ${n} not in cited facts` };
    }
  }
  return { ok: true };
}

type EraTemplate = { id: string; issue: string; check: string; fabricKey?: keyof EpcRecord };

const ERA_TEMPLATES: Record<string, EraTemplate[]> = {
  '1930-1949': [
    {
      id: 'cavity-walls',
      issue: 'Homes of this era commonly have cavity walls that were uninsulated when built unless later filled.',
      check: 'Ask for evidence of cavity-wall insulation and check the EPC walls wording.',
      fabricKey: 'wallsDescription',
    },
    {
      id: 'suspended-floors',
      issue: '1930s–40s houses typically have suspended timber ground floors that need underfloor ventilation.',
      check: 'Look for airbricks and any signs of damp or musty voids on a survey.',
      fabricKey: 'floorDescription',
    },
    {
      id: 'drainage',
      issue: 'Original clay drainage of this era is often nearing end of life.',
      check: 'Budget for a drainage CCTV survey before exchange.',
    },
    {
      id: 'bay-single-skin',
      issue: 'Bay windows of this period are often single-skin and colder than the main walls.',
      check: 'Feel for cold spots and ask the surveyor to comment on bay construction.',
    },
  ],
  'pre-1900': [
    {
      id: 'solid-walls',
      issue: 'Victorian solid walls typically need breathable materials — cement renders can trap moisture.',
      check: 'Confirm wall construction and any render type with your surveyor.',
      fabricKey: 'wallsDescription',
    },
    {
      id: 'lime-repointing',
      issue: 'Homes of this era commonly need lime mortar repointing rather than hard cement.',
      check: 'Check pointing condition on exposed elevations.',
    },
    {
      id: 'chimney',
      issue: 'Chimney flaunching and pots of this age often need attention.',
      check: 'Have the surveyor inspect stack condition from ground and loft.',
    },
  ],
  '1967-1975': [
    {
      id: 'flat-roof',
      issue: '1960s–70s homes often include flat-roof extensions with shorter service lives than pitched roofs.',
      check: 'Ask for roof covering age and any guarantees.',
      fabricKey: 'roofDescription',
    },
    {
      id: 'wall-ties',
      issue: 'Cavity wall-tie corrosion is a known issue for homes of this era in exposed areas.',
      check: 'Request a wall-tie inspection if the survey flags it.',
      fabricKey: 'wallsDescription',
    },
    {
      id: 'asbestos',
      issue: 'Textured coatings of this period can contain asbestos — worth checking before disturbance.',
      check: 'Do not scrape Artex-style finishes until tested.',
    },
  ],
  '1950-1966': [
    {
      id: 'cavity-partial',
      issue: 'Post-war cavity walls of this era were typically built with little or partial insulation.',
      check: 'Read the EPC walls line and confirm any later insulation.',
      fabricKey: 'wallsDescription',
    },
    {
      id: 'suspended-floors',
      issue: 'Suspended timber floors are common — underfloor ventilation matters for damp control.',
      check: 'Check airbricks are clear on a walk-round.',
      fabricKey: 'floorDescription',
    },
  ],
  '2012-onwards': [
    {
      id: 'nhbc',
      issue: 'Post-2000 / new-build homes often carry NHBC or similar warranty windows that are worth confirming.',
      check: 'Ask for warranty documents and remaining cover period.',
    },
    {
      id: 'timber-frame',
      issue: 'Timber-frame construction of this period can raise insurer questions — worth checking the build type.',
      check: 'Confirm construction method for buildings insurance.',
    },
  ],
};

function normalizeEraBucket(ageBand: string): string {
  const s = ageBand.toLowerCase();
  if (/before.?1900|pre.?1900|1850|1880|1890|victorian/i.test(s)) return 'pre-1900';
  if (/1930|1940|1949/i.test(s)) return '1930-1949';
  if (/1950|1960|1966/i.test(s)) return '1950-1966';
  if (/1967|1970|1975/i.test(s)) return '1967-1975';
  if (/1976|1982|1983|1990/i.test(s)) return '1967-1975';
  if (/2007|2011|2012|2018|2020|onwards|2003|2006/i.test(s)) return '2012-onwards';
  if (/1900|1910|1920|1929/i.test(s)) return 'pre-1900';
  return '1950-1966';
}

function fabricJoinFor(template: EraTemplate, epc: EpcRecord): string | undefined {
  if (!template.fabricKey) return undefined;
  const raw = String(epc[template.fabricKey] || '').trim();
  if (!raw) return undefined;
  const lower = raw.toLowerCase();
  if (/no insulation|uninsulated|as built/i.test(lower) && /wall|floor|roof/i.test(template.id + template.issue)) {
    return `Typical for the era — and this certificate records: "${raw}".`;
  }
  if (/insulated|double glazed|150 mm|200 mm|filled/i.test(lower)) {
    return `Homes of this era often differ — this certificate records: "${raw}".`;
  }
  return `This certificate records: "${raw}".`;
}

export function buildEraIssues(epc: EpcRecord | null | undefined): {
  ageBand: string | null;
  propertyType: string | null;
  title: string | null;
  issues: EraIssue[];
} {
  const ageBand = normalizeConstructionAgeBand(epc?.constructionAgeBand) || null;
  const propertyType = epc?.propertyType?.trim() || null;
  if (!ageBand) {
    return { ageBand: null, propertyType, title: null, issues: [] };
  }
  const bucket = normalizeEraBucket(ageBand);
  const templates = ERA_TEMPLATES[bucket] || ERA_TEMPLATES['1950-1966']!;
  const shortType = propertyType
    ? propertyType.replace(/\s+house$/i, '').toLowerCase()
    : 'home';
  const title = `Living with a ${formatAgeBandDisplay(ageBand)} ${shortType}`;
  const issues: EraIssue[] = templates.map((t) => {
    const join = epc ? fabricJoinFor(t, epc) : undefined;
    return {
      id: t.id,
      issue: t.issue,
      check: t.check,
      fabricJoin: join,
      confirmedByEpc: Boolean(join && /certificate records/i.test(join)),
    };
  });
  return { ageBand, propertyType, title, issues };
}

function shortTypeLabel(propertyType: string | null | undefined): string {
  if (!propertyType) return 'home';
  return propertyType.replace(/\s+house$/i, '').toLowerCase();
}

function headlineCase(s: string): string {
  return s
    .split(/\s+/)
    .map((w) => (w.length <= 2 ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(' ');
}

/** Front-page / callout titles — reject fragments; fall back to templated titles. */
export function polishInsightHeadline(
  headline: string,
  insight: { id: string; insightClass: InsightClass; eraIssue?: EraIssue; statId?: string; derivedFrom?: string[] },
  eraAgeBand?: string | null
): string {
  const raw = String(headline || '').replace(/\s+/g, ' ').trim();
  const ok =
    raw.length >= 24 &&
    !/^[a-z]/.test(raw) &&
    !/—\s*$/.test(raw) &&
    !/^\w+(\s+\w+){0,2}\s*—/.test(raw.replace(/certificate.*/, '')) &&
    !/^(cavity|suspended|drainage|bay|flat|wall|oil|growth|crime|epc)\b/i.test(raw);

  if (ok && !/\bpartial\s*—/i.test(raw) && raw.split(' ').length >= 4) {
    return raw.slice(0, 120);
  }

  // Code-templated fallbacks from insight identity
  if (insight.insightClass === 1 && insight.eraIssue) {
    const band = formatAgeBandDisplay(eraAgeBand) || 'this era';
    if (insight.eraIssue.confirmedByEpc) {
      return `Certificate confirms a typical ${band} fabric detail — worth checking`;
    }
    return `What is typical for a ${band} home — and what to check`;
  }
  if (insight.statId === 'floorAreaPercentile') return 'How this floor area compares locally';
  if (insight.statId === 'psmVsComps') return '£/sqm versus nearby sold comps';
  if (insight.statId === 'crimeVsNational') return 'Local crime rate versus the national median';
  if (insight.statId === 'epcVsEra') return 'EPC band in context for this construction era';
  if (insight.statId === 'growthVsSector') return 'Growth since last sale versus the sector';
  if (insight.id.includes('oil')) return 'Oil heating — tank access and running costs';
  if (insight.id.includes('suspended')) return 'Suspended floors and damp — what to check';
  if (insight.id.includes('quick-resale')) return 'Back on the market soon after purchase — ask why';
  if (insight.id.includes('station')) return 'Station proximity and first-time buyer costs';
  if (insight.id.includes('extension')) return 'Local extension precedent worth noting';
  return headlineCase(insight.id.replace(/^c\d-/, '').replace(/-/g, ' ')).slice(0, 80);
}

function buildClass1Insights(era: ReturnType<typeof buildEraIssues>): Insight[] {
  if (!era.ageBand || !era.issues.length) return [];
  return era.issues.map((issue, i) => {
    const text = [issue.issue, issue.fabricJoin, `Check: ${issue.check}`].filter(Boolean).join(' ');
    const draft = {
      id: `c1-${issue.id}`,
      insightClass: 1 as const,
      eraIssue: issue,
      derivedFrom: undefined as string[] | undefined,
      statId: undefined as string | undefined,
    };
    const headline = polishInsightHeadline(
      issue.fabricJoin
        ? `${issue.id.replace(/-/g, ' ')} — certificate ${issue.confirmedByEpc ? 'confirms' : 'notes'} fabric detail`
        : `${issue.id.replace(/-/g, ' ')} — typical for ${era.ageBand}`,
      draft,
      era.ageBand
    );
    return {
      id: draft.id,
      insightClass: 1 as const,
      text,
      headline,
      section: 'dueDiligence' as const,
      eraIssue: issue,
      rankScore: (issue.confirmedByEpc ? 80 : 50) - i,
    };
  });
}

function buildClass2Insights(stats: ComparativeStat[], epc: EpcRecord | null): Insight[] {
  const out: Insight[] = [];
  for (const stat of stats) {
    let text = '';
    let draftHeadline = '';
    let section: Insight['section'] = 'summary';
    if (stat.id === 'floorAreaPercentile') {
      text = `At ${epc?.floorAreaSqm || '?'} m², this home is larger than about ${stat.displayValue}% of ${stat.comparator}.`;
      draftHeadline = `Larger than ~${stat.displayValue}% of similar homes`;
      section = 'summary';
    } else if (stat.id === 'psmVsComps') {
      const dir = Number(stat.value) >= 0 ? 'premium' : 'discount';
      text = `On £/sqm, you are looking at a ${Math.abs(Number(stat.value))}% ${dir} versus the ${stat.comparator}.`;
      draftHeadline = `${Math.abs(Number(stat.value))}% £/sqm ${dir} vs comps`;
      section = 'valuation';
    } else if (stat.id === 'epcVsEra') {
      text = `An EPC ${stat.displayValue} sits against ${stat.comparator} for this construction age.`;
      draftHeadline = `EPC ${stat.displayValue} in context for this era`;
      section = 'dueDiligence';
    } else if (stat.id === 'crimeVsNational') {
      text = `Local crime is ${stat.displayValue} per 1,000 residents versus a ${stat.comparator}.`;
      draftHeadline = `Crime ${stat.displayValue}/1,000 vs national median`;
      section = 'area';
    } else if (stat.id === 'growthVsSector') {
      text = `Growth since the last sale was ${stat.displayValue}% versus the ${stat.comparator}.`;
      draftHeadline = `Growth ${stat.displayValue}% vs sector`;
      section = 'valuation';
    } else {
      continue;
    }
    const v = validateClass2Text(text, stat);
    if (!v.ok) continue;
    const draft = {
      id: `c2-${stat.id}`,
      insightClass: 2 as const,
      statId: stat.id,
    };
    out.push({
      id: draft.id,
      insightClass: 2,
      text,
      headline: polishInsightHeadline(draftHeadline, draft, epc?.constructionAgeBand),
      section,
      statId: stat.id,
      rankScore: 40,
    });
  }
  return out;
}

function buildClass3Insights(
  bag: VerifiedFactBag,
  analysis: Record<string, unknown>,
  buyerGoal?: string
): Insight[] {
  const out: Insight[] = [];
  const push = (partial: Omit<Insight, 'rankScore'> & { rankScore?: number }) => {
    const v = validateClass3Insight(partial.text, partial.derivedFrom || [], bag);
    if (!v.ok) return;
    out.push({
      ...partial,
      rankScore: partial.rankScore ?? 90 + (partial.derivedFrom?.length || 0),
    });
  };

  const floor = String(bag['epc.floor']?.value || '');
  const flood = String(bag['flood.banding']?.value || '');
  const floodZone = String(bag['flood.zone']?.value || '');
  if (
    /suspended/i.test(floor) &&
    (/zone\s*1|very low/i.test(flood) || floodZone === '1')
  ) {
    push({
      id: 'c3-suspended-flood1',
      insightClass: 3,
      derivedFrom: bag['flood.zone']
        ? ['epc.floor', 'flood.zone']
        : ['epc.floor', 'flood.banding'],
      text: `With a suspended floor on the EPC ("${floor}") and ${flood || `Flood Zone ${floodZone}`}, prioritise underfloor ventilation and damp checks — Flood Zone 1 is not a free pass on timber voids.`,
      headline: 'Suspended floors + Flood Zone 1 → check ventilation',
      section: 'risks',
    });
  }

  const lastDate = String(bag['lr.lastSoldDate']?.value || '');
  const mode = String(bag['report.mode']?.value || '');
  if (lastDate && mode === 'on_market') {
    const months =
      (Date.now() - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24 * 30.4);
    if (months >= 0 && months <= 18) {
      push({
        id: 'c3-quick-resale',
        insightClass: 3,
        derivedFrom: ['lr.lastSoldDate', 'report.mode'],
        text: `Last sold ${lastDate} and now on the market again — ask why, and note any work done since may not yet have planning or building-control paperwork.`,
        headline: 'Recent purchase back on the market — ask why',
        section: 'offer',
      });
    }
  }

  const planning = String(bag['planning.applications']?.value || '');
  const area = Number(bag['epc.floorAreaSqm']?.value);
  if (/dormer|extension|loft/i.test(planning) && Number.isFinite(area) && area > 0) {
    push({
      id: 'c3-extension-precedent',
      insightClass: 3,
      derivedFrom: ['planning.applications', 'epc.floorAreaSqm'],
      text: `Neighbour / same-street planning mentions works (${planning.slice(0, 80)}) while this certificate records ${area} m² — treat that as extension precedent to discuss with a planner, not a guarantee.`,
      headline: 'Local extension precedent worth noting',
      section: 'dueDiligence',
    });
  }

  const transport0 = String(bag['transport.0.time']?.value || '');
  const transportLine = String(bag['transport.0.line']?.value || '');
  const mi = Number((transport0.match(/([\d.]+)/) || [])[1]);
  const ftb = /first|ftb/i.test(buyerGoal || '');
  if (ftb && Number.isFinite(mi) && mi > 0 && mi < 0.5 && /rail|station|train/i.test(transportLine)) {
    push({
      id: 'c3-station-ftb',
      insightClass: 3,
      derivedFrom: ['transport.0.time', 'transport.0.line', 'buyer.goal'],
      text: `${transportLine} is about ${mi} mi away — as a first-time buyer, factor the commuting-cost saving against any price premium for station proximity.`,
      headline: `Station under 0.5 mi — commute-cost angle`,
      section: 'area',
    });
  }

  // Rural oil heating implication
  const heating = String(bag['epc.heating']?.value || '');
  if (/\boil\b/i.test(heating)) {
    push({
      id: 'c3-oil-heating',
      insightClass: 3,
      derivedFrom: ['epc.heating'],
      text: `Main heating is recorded as "${heating}" — budget for tank compliance, delivery access and running-cost volatility versus mains gas.`,
      headline: 'Oil heating — tank and running-cost checks',
      section: 'dueDiligence',
    });
  }

  void analysis;
  return out;
}

export function rankInsights(insights: Insight[]): Insight[] {
  return [...insights].sort((a, b) => {
    const classRank = (c: InsightClass) => (c === 3 ? 3 : c === 1 ? 2 : 1);
    const ca = classRank(a.insightClass);
    const cb = classRank(b.insightClass);
    if (cb !== ca) return cb - ca;
    // Prefer confirmed Class 1
    const conf = (x: Insight) => (x.eraIssue?.confirmedByEpc ? 1 : 0);
    if (conf(b) !== conf(a)) return conf(b) - conf(a);
    const factsA = xlen(a.derivedFrom);
    const factsB = xlen(b.derivedFrom);
    if (factsB !== factsA) return factsB - factsA;
    if (b.rankScore !== a.rankScore) return b.rankScore - a.rankScore;
    return a.id.localeCompare(b.id);
  });
}

function xlen(a?: string[]): number {
  return a?.length || 0;
}

export function selectFrontPage(ranked: Insight[], n = 3): Insight[] {
  const seen = new Set<string>();
  const out: Insight[] = [];
  for (const ins of ranked) {
    if (out.length >= n) break;
    const key = ins.headline.slice(0, 40);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ins);
  }
  return out;
}

export function selectSectionCallouts(ranked: Insight[]): InsightsPackage['sectionCallouts'] {
  const out: InsightsPackage['sectionCallouts'] = {};
  for (const ins of ranked) {
    const sec = ins.section;
    if (!sec || sec === 'cover') continue;
    if (out[sec]) continue;
    out[sec] = ins;
  }
  return out;
}

export type InsightsLlmFn = (input: {
  verifiedFacts: VerifiedFactBag;
  comparativeStats: ComparativeStat[];
  era: InsightsPackage['era'];
  draftInsights: Insight[];
}) => Promise<{ insights?: Partial<Insight>[] }>;

/**
 * Build the full insights package (deterministic selection). Optional LLM may
 * rewrite text; validators reject bad prose (max 2 retries then drop).
 */
export async function buildInsightsPackage(
  analysis: Record<string, unknown>,
  opts: {
    facts?: PropertyFacts | null;
    crime?: CrimeLookup | null;
    flood?: { bandingLabel?: string; zone?: string } | null;
    buyerGoal?: string;
    insightsLlm?: InsightsLlmFn | null;
    rewriteInsight?: (text: string, reason: string) => Promise<string>;
  }
): Promise<InsightsPackage> {
  const log: InsightValidationEntry[] = [];
  const epc = opts.facts?.epc?.matched || null;
  const bag = buildVerifiedFactBag({
    facts: opts.facts,
    analysis,
    crime: opts.crime,
    flood: opts.flood,
    buyerGoal: opts.buyerGoal,
  });

  const me = analysis.marketEvidence as { pricePerSqmOrSqft?: string } | undefined;
  const comps = (analysis.comparableSales || []) as { note?: string }[];
  const subjectPsm = parseSubjectPsm(me?.pricePerSqmOrSqft);
  const compsPsm = extractCompPsm(comps.map((c) => String(c.note || '')));
  const pc = String(
    (analysis.location as { postcode?: string } | undefined)?.postcode ||
      opts.facts?.epc?.postcode ||
      ''
  );
  const postcodeArea = pc.replace(/\s+/g, '').slice(0, 2) || null;

  // Growth since last sale if two LR prices exist
  let growthSince: number | null = null;
  const lr = opts.facts?.landRegistry?.thisProperty || [];
  if (lr.length >= 2 && lr[0] && lr[1] && lr[0].amount && lr[1].amount) {
    const years =
      (new Date(lr[0].date).getTime() - new Date(lr[1].date).getTime()) /
      (1000 * 60 * 60 * 24 * 365.25);
    if (years > 0.5) {
      growthSince =
        Math.round((Math.pow(lr[0].amount / lr[1].amount, 1 / years) - 1) * 1000) / 10;
    }
  }
  const sectorGrowth =
    (
      (analysis.growthAssumptions ||
        (analysis.valuation as { growthAssumptions?: { centralPct?: number } })?.growthAssumptions) as
        | { centralPct?: number }
        | undefined
    )?.centralPct ?? null;

  const comparativeStats = computeComparativeStats({
    epc,
    postcodeArea,
    subjectPsm,
    compsPsm,
    crime: opts.crime,
    growthSinceLastSalePct: growthSince,
    sectorGrowthPct: sectorGrowth,
  });

  const era = buildEraIssues(epc);
  let insights = [
    ...buildClass1Insights(era),
    ...buildClass2Insights(comparativeStats, epc),
    ...buildClass3Insights(bag, analysis, opts.buyerGoal),
  ];

  // Validate Class 1 texts
  insights = insights.filter((ins) => {
    if (ins.insightClass !== 1) return true;
    const v = validateClass1Text(ins.text, epc);
    if (!v.ok) {
      log.push({
        at: new Date().toISOString(),
        decision: 'drop',
        insightClass: 1,
        detail: v.reason || 'class1 fail',
        text: ins.text,
      });
      return false;
    }
    log.push({
      at: new Date().toISOString(),
      decision: 'pass',
      insightClass: 1,
      detail: `class1 ok: ${ins.id}`,
    });
    return true;
  });

  // Optional LLM polish — must still pass validators
  if (opts.insightsLlm) {
    try {
      const llm = await opts.insightsLlm({
        verifiedFacts: bag,
        comparativeStats,
        era,
        draftInsights: insights,
      });
      if (Array.isArray(llm.insights)) {
        const polished: Insight[] = [];
        for (const raw of llm.insights) {
          const base = insights.find((i) => i.id === raw.id) || null;
          let text = String(raw.text || base?.text || '');
          let ok = false;
          let reason = '';
          for (let attempt = 0; attempt < 3; attempt++) {
            if (base?.insightClass === 1 || raw.insightClass === 1) {
              const v = validateClass1Text(text, epc);
              ok = v.ok;
              reason = v.reason || '';
            } else if (base?.insightClass === 2 || raw.insightClass === 2) {
              const stat = comparativeStats.find((s) => s.id === (raw.statId || base?.statId));
              if (!stat) {
                ok = false;
                reason = 'missing stat';
              } else {
                const v = validateClass2Text(text, stat);
                ok = v.ok;
                reason = v.reason || '';
              }
            } else {
              const derived = (raw.derivedFrom || base?.derivedFrom || []) as string[];
              const v = validateClass3Insight(text, derived, bag);
              ok = v.ok;
              reason = v.reason || '';
            }
            if (ok) break;
            log.push({
              at: new Date().toISOString(),
              decision: attempt < 2 ? 'retry' : 'drop',
              insightClass: (raw.insightClass || base?.insightClass) as InsightClass,
              detail: reason,
              text,
            });
            if (attempt < 2 && opts.rewriteInsight) {
              text = await opts.rewriteInsight(text, reason);
            }
          }
          if (!ok) continue;
          polished.push({
            id: String(raw.id || base?.id || `llm-${polished.length}`),
            insightClass: (raw.insightClass || base?.insightClass || 3) as InsightClass,
            text,
            headline: String(raw.headline || base?.headline || text.slice(0, 80)),
            section: (raw.section || base?.section || 'summary') as Insight['section'],
            eraIssue: base?.eraIssue,
            statId: raw.statId || base?.statId,
            derivedFrom: (raw.derivedFrom || base?.derivedFrom) as string[] | undefined,
            rankScore: base?.rankScore ?? 50,
          });
        }
        if (polished.length) insights = polished;
      }
    } catch (e) {
      log.push({
        at: new Date().toISOString(),
        decision: 'reject',
        detail: `insightsLlm error: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }

  const ranked = rankInsights(insights);
  const frontPage = selectFrontPage(ranked, 3);
  const sectionCallouts = selectSectionCallouts(ranked);

  return {
    verifiedFacts: bag,
    comparativeStats,
    era,
    insights: ranked,
    frontPage,
    sectionCallouts,
    validationLog: log,
  };
}

/** Attach insights onto the analysis object for PDF + golden. */
export function applyInsightsToAnalysis(
  analysis: Record<string, unknown>,
  pkg: InsightsPackage
): void {
  analysis.verifiedFacts = pkg.verifiedFacts;
  analysis.comparativeStats = pkg.comparativeStats;
  analysis.eraProfile = {
    ageBand: pkg.era.ageBand,
    propertyType: pkg.era.propertyType,
    title: pkg.era.title,
    issues: pkg.era.issues,
  };
  analysis.insights = pkg.insights.map((i) => ({
    id: i.id,
    insightClass: i.insightClass,
    text: i.text,
    headline: i.headline,
    section: i.section,
    derivedFrom: i.derivedFrom,
    statId: i.statId,
    rankScore: i.rankScore,
  }));
  analysis.frontPageInsights = pkg.frontPage.map((i) => ({
    id: i.id,
    insightClass: i.insightClass,
    headline: i.headline,
    text: i.text,
    derivedFrom: i.derivedFrom,
    statId: i.statId,
  }));
  analysis.sectionCallouts = Object.fromEntries(
    Object.entries(pkg.sectionCallouts).map(([k, v]) => [
      k,
      v
        ? {
            id: v.id,
            insightClass: v.insightClass,
            headline: v.headline,
            text: v.text,
          }
        : null,
    ])
  );
  analysis.insightsValidationLog = pkg.validationLog;
}

export { shortTypeLabel };
