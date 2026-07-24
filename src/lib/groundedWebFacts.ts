/**
 * Grounded web-research facts — URL-backed fills for thin official registers.
 * Customer text is estimate-labelled; URLs stay internal (never PDF litter).
 */

import type { ReportRegion } from './ukCoverage';
import type { ScoreInputs } from './deterministicScores';

export type GroundedSold = {
  price: string;
  date?: string;
  note?: string;
  url: string;
};

export type GroundedComp = {
  address: string;
  price: string;
  date?: string;
  url: string;
};

export type GroundedProperty = {
  bedrooms?: number;
  bathrooms?: number;
  receptions?: number;
  propertyType?: string;
  tenure?: string;
  floorAreaSqm?: number;
  url: string;
};

export type GroundedEpc = { band: string; summary?: string; url: string };
export type GroundedCouncilTax = { band: string; summary?: string; url: string };
export type GroundedCrime = {
  level: 'low' | 'average' | 'high';
  summary: string;
  url: string;
};
export type GroundedProse = { summary: string; url: string };
export type GroundedBroadband = { summary: string; url: string };
export type GroundedCondition = {
  level: 'good' | 'average' | 'poor';
  summary: string;
  url: string;
};
export type GroundedSchool = {
  name: string;
  distance?: string;
  rating?: string;
  url: string;
};

export type GroundedWebFacts = {
  property: GroundedProperty | null;
  soldHistory: GroundedSold[];
  comps: GroundedComp[];
  epc: GroundedEpc | null;
  councilTax: GroundedCouncilTax | null;
  crime: GroundedCrime | null;
  flood: GroundedProse | null;
  schools: GroundedSchool[];
  planning: GroundedProse | null;
  broadband: GroundedBroadband | null;
  condition: GroundedCondition | null;
  acceptedCount: number;
  rawParsed: boolean;
};

const EMPTY: GroundedWebFacts = {
  property: null,
  soldHistory: [],
  comps: [],
  epc: null,
  councilTax: null,
  crime: null,
  flood: null,
  schools: [],
  planning: null,
  broadband: null,
  condition: null,
  acceptedCount: 0,
  rawParsed: false,
};

function isHttps(url: unknown): url is string {
  return typeof url === 'string' && /^https:\/\//i.test(url.trim());
}

function cleanText(raw: unknown, max = 280): string {
  return String(raw || '')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function epcBand(raw: unknown): string | null {
  const m = String(raw || '')
    .trim()
    .toUpperCase()
    .match(/\b([A-G])\b/);
  return m?.[1] || null;
}

function parseCount(raw: unknown, max = 20): number | undefined {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0 && raw <= max) {
    return Math.round(raw);
  }
  const m = String(raw || '').match(/(\d{1,2})/);
  if (!m) return undefined;
  const n = parseInt(m[1]!, 10);
  return n > 0 && n <= max ? n : undefined;
}

function crimeLevel(raw: unknown): 'low' | 'average' | 'high' | null {
  const s = String(raw || '').toLowerCase();
  if (/^(low|very\s*low|safe)/.test(s) || /\blow\b/.test(s)) return 'low';
  if (/^(high|very\s*high|elevated)/.test(s) || /\bhigh\b/.test(s)) return 'high';
  if (/average|medium|moderate|typical|mid/.test(s)) return 'average';
  return null;
}

function conditionLevel(raw: unknown): 'good' | 'average' | 'poor' | null {
  const s = String(raw || '').toLowerCase();
  if (/^(good|excellent|very\s*good|modern|recently\s*refurbished)/.test(s) || /\b(good|excellent)\b/.test(s))
    return 'good';
  if (/^(poor|dated|needs\s*work|dilapidated)/.test(s) || /\b(poor|dated)\b/.test(s)) return 'poor';
  if (/average|fair|typical|ok|okay|moderate/.test(s)) return 'average';
  return null;
}

function estimateLead(region: ReportRegion): string {
  if (region === 'scotland') return 'Estimated from public Scottish web records';
  if (region === 'northern_ireland') return 'Estimated from public Northern Ireland web records';
  return 'Estimated from public web records';
}

function parseMoney(raw?: string | null): number | null {
  if (!raw) return null;
  const m = String(raw).match(/£\s*([\d,]+(?:\.\d+)?)/);
  if (m) {
    const n = parseFloat(m[1]!.replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  const n = parseFloat(String(raw).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function extractGroundedWebFacts(researchNotes: string): GroundedWebFacts {
  const notes = researchNotes || '';
  const fence =
    notes.match(/```grounded-facts\s*([\s\S]*?)```/i) ||
    notes.match(/```json\s*(\{[\s\S]*?"(soldHistory|property|comps)"[\s\S]*?\})\s*```/i) ||
    notes.match(/###\s*GROUNDED_FACTS_JSON\s*(\{[\s\S]*?\})(?:\n|$)/i);
  if (!fence?.[1]) return { ...EMPTY };

  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(fence[1].trim()) as Record<string, unknown>;
  } catch {
    console.warn('[groundedWebFacts] JSON parse failed');
    return { ...EMPTY, rawParsed: false };
  }

  let property: GroundedProperty | null = null;
  if (raw.property && typeof raw.property === 'object') {
    const o = raw.property as Record<string, unknown>;
    if (isHttps(o.url)) {
      const bedrooms = parseCount(o.bedrooms, 15);
      const bathrooms = parseCount(o.bathrooms, 10);
      const receptions = parseCount(o.receptions, 10);
      const propertyType = cleanText(o.propertyType, 60) || undefined;
      const tenure = cleanText(o.tenure, 40) || undefined;
      const floorAreaSqm = parseCount(o.floorAreaSqm, 500);
      if (bedrooms || bathrooms || propertyType || tenure || floorAreaSqm) {
        property = {
          bedrooms,
          bathrooms,
          receptions,
          propertyType,
          tenure,
          floorAreaSqm,
          url: o.url.trim(),
        };
      }
    }
  }

  const soldHistory: GroundedSold[] = [];
  for (const row of Array.isArray(raw.soldHistory) ? raw.soldHistory : []) {
    const o = row as Record<string, unknown>;
    if (!isHttps(o.url)) continue;
    const price = cleanText(o.price, 40);
    if (!/£|\d/.test(price)) continue;
    soldHistory.push({
      price,
      date: cleanText(o.date, 32) || undefined,
      note: cleanText(o.note, 80) || undefined,
      url: o.url.trim(),
    });
    if (soldHistory.length >= 6) break;
  }

  const comps: GroundedComp[] = [];
  for (const row of Array.isArray(raw.comps) ? raw.comps : []) {
    const o = row as Record<string, unknown>;
    if (!isHttps(o.url)) continue;
    const address = cleanText(o.address, 120);
    const price = cleanText(o.price, 40);
    if (!address || !/£|\d/.test(price)) continue;
    comps.push({
      address,
      price,
      date: cleanText(o.date, 32) || undefined,
      url: o.url.trim(),
    });
    if (comps.length >= 6) break;
  }

  let epc: GroundedEpc | null = null;
  if (raw.epc && typeof raw.epc === 'object') {
    const o = raw.epc as Record<string, unknown>;
    const band = epcBand(o.band);
    if (band && isHttps(o.url)) {
      epc = { band, summary: cleanText(o.summary, 160) || undefined, url: o.url.trim() };
    }
  }

  let councilTax: GroundedCouncilTax | null = null;
  if (raw.councilTax && typeof raw.councilTax === 'object') {
    const o = raw.councilTax as Record<string, unknown>;
    const band = cleanText(o.band, 8).toUpperCase();
    if (/^[A-H]$/i.test(band) && isHttps(o.url)) {
      councilTax = {
        band,
        summary: cleanText(o.summary, 120) || undefined,
        url: o.url.trim(),
      };
    }
  }

  let crime: GroundedCrime | null = null;
  if (raw.crime && typeof raw.crime === 'object') {
    const o = raw.crime as Record<string, unknown>;
    const summary = cleanText(o.summary, 360);
    const level =
      crimeLevel(o.level) ||
      crimeLevel(summary) ||
      null;
    if (summary.length > 16 && isHttps(o.url) && level) {
      crime = { level, summary, url: o.url.trim() };
    } else if (summary.length > 16 && isHttps(o.url)) {
      crime = { level: 'average', summary, url: o.url.trim() };
    }
  }

  let flood: GroundedProse | null = null;
  if (raw.flood && typeof raw.flood === 'object') {
    const o = raw.flood as Record<string, unknown>;
    const summary = cleanText(o.summary, 240);
    if (summary.length > 12 && isHttps(o.url)) flood = { summary, url: o.url.trim() };
  }

  let planning: GroundedProse | null = null;
  if (raw.planning && typeof raw.planning === 'object') {
    const o = raw.planning as Record<string, unknown>;
    const summary = cleanText(o.summary, 320);
    if (summary.length > 12 && isHttps(o.url)) planning = { summary, url: o.url.trim() };
  }

  let broadband: GroundedBroadband | null = null;
  if (raw.broadband && typeof raw.broadband === 'object') {
    const o = raw.broadband as Record<string, unknown>;
    const summary = cleanText(o.summary, 280);
    if (summary.length > 12 && isHttps(o.url)) broadband = { summary, url: o.url.trim() };
  }

  let condition: GroundedCondition | null = null;
  if (raw.condition && typeof raw.condition === 'object') {
    const o = raw.condition as Record<string, unknown>;
    const summary = cleanText(o.summary, 280);
    const level = conditionLevel(o.level) || conditionLevel(summary);
    if (summary.length > 12 && isHttps(o.url) && level) {
      condition = { level, summary, url: o.url.trim() };
    }
  }

  const schools: GroundedSchool[] = [];
  for (const row of Array.isArray(raw.schools) ? raw.schools : []) {
    const o = row as Record<string, unknown>;
    if (!isHttps(o.url)) continue;
    const name = cleanText(o.name, 100);
    if (!name || name.length < 3) continue;
    schools.push({
      name,
      distance: cleanText(o.distance, 24) || undefined,
      rating: cleanText(o.rating, 80) || undefined,
      url: o.url.trim(),
    });
    if (schools.length >= 4) break;
  }

  const acceptedCount =
    soldHistory.length +
    comps.length +
    schools.length +
    (property ? 1 : 0) +
    (epc ? 1 : 0) +
    (councilTax ? 1 : 0) +
    (crime ? 1 : 0) +
    (flood ? 1 : 0) +
    (planning ? 1 : 0) +
    (broadband ? 1 : 0) +
    (condition ? 1 : 0);

  console.log(
    `[groundedWebFacts] accepted=${acceptedCount} beds=${property?.bedrooms ?? '—'} epc=${epc?.band || '—'} comps=${comps.length} crime=${crime?.level || '—'} bb=${broadband ? 'y' : 'n'} cond=${condition?.level || '—'} schools=${schools.length}`
  );

  return {
    property,
    soldHistory,
    comps,
    epc,
    councilTax,
    crime,
    flood,
    schools,
    planning,
    broadband,
    condition,
    acceptedCount,
    rawParsed: true,
  };
}

function isEmptyish(raw: unknown): boolean {
  const s = String(raw || '').trim();
  if (!s) return true;
  return /not on record|no epc on register|unavailable|check the epc|verify with|n\/a|unknown|not available|no school rows|no structured|confirm at viewing|confirm with/i.test(
    s
  );
}

function upsertSpec(
  specs: { label?: string; value?: string }[],
  label: string,
  value: string
): { label: string; value: string }[] {
  const next = specs.map((r) => ({
    label: String(r.label || '').trim(),
    value: String(r.value || '').trim(),
  }));
  const idx = next.findIndex((r) => r.label.toLowerCase() === label.toLowerCase());
  if (idx >= 0) {
    if (isEmptyish(next[idx]!.value)) next[idx] = { label, value };
  } else {
    next.push({ label, value });
  }
  return next.filter((r) => r.label && r.value);
}

/**
 * Fill empty customer-facing fields from grounded research.
 * Does NOT set live asking / offer strategy / Mode A.
 */
export function applyGroundedWebFacts(
  analysis: Record<string, unknown>,
  facts: GroundedWebFacts | null | undefined,
  region: ReportRegion
): void {
  if (!facts || facts.acceptedCount === 0) return;
  const lead = estimateLead(region);
  const applied: string[] = [];

  // Property attributes from past listings
  if (facts.property) {
    const p = facts.property;
    if (p.bedrooms != null && isEmptyish(analysis.bedrooms)) {
      analysis.bedrooms = String(p.bedrooms);
      applied.push(`beds:${p.bedrooms}`);
    }
    if (p.bathrooms != null && isEmptyish(analysis.bathrooms)) {
      analysis.bathrooms = String(p.bathrooms);
      applied.push(`baths:${p.bathrooms}`);
    }
    if (p.propertyType && isEmptyish(analysis.propertyType)) {
      analysis.propertyType = p.propertyType;
      applied.push('type');
    }
    let specs = Array.isArray(analysis.specs)
      ? ([...(analysis.specs as { label?: string; value?: string }[])] as {
          label?: string;
          value?: string;
        }[])
      : [];
    if (p.bedrooms != null) specs = upsertSpec(specs, 'Bedrooms', `${p.bedrooms} (from past listing)`);
    if (p.bathrooms != null) specs = upsertSpec(specs, 'Bathrooms', `${p.bathrooms} (from past listing)`);
    if (p.receptions != null) specs = upsertSpec(specs, 'Receptions', `${p.receptions} (from past listing)`);
    if (p.propertyType) specs = upsertSpec(specs, 'Property type', `${p.propertyType} (from past listing)`);
    if (p.tenure) specs = upsertSpec(specs, 'Tenure', `${p.tenure} (from past listing)`);
    if (p.floorAreaSqm) specs = upsertSpec(specs, 'Floor area', `${p.floorAreaSqm} m² (from past listing)`);
    analysis.specs = specs;

    if (p.tenure) {
      const dd =
        analysis.dueDiligence && typeof analysis.dueDiligence === 'object'
          ? ({ ...(analysis.dueDiligence as Record<string, unknown>) } as Record<string, unknown>)
          : {};
      if (isEmptyish(dd.tenureAndLegal)) {
        dd.tenureAndLegal = `${lead}: ${p.tenure}. Confirm title with a conveyancer.`;
        analysis.dueDiligence = dd;
      }
    }
  }

  if (facts.epc) {
    const dd =
      analysis.dueDiligence && typeof analysis.dueDiligence === 'object'
        ? ({ ...(analysis.dueDiligence as Record<string, unknown>) } as Record<string, unknown>)
        : {};
    if (isEmptyish(dd.epcAndEnergy)) {
      const extra = facts.epc.summary ? ` ${facts.epc.summary}` : '';
      dd.epcAndEnergy = `${lead}: EPC band ${facts.epc.band}.${extra} Confirm on the official EPC register before relying on this.`.trim();
      analysis.dueDiligence = dd;
      applied.push(`epc:${facts.epc.band}`);
    }
    let specs = Array.isArray(analysis.specs)
      ? ([...(analysis.specs as { label?: string; value?: string }[])] as {
          label?: string;
          value?: string;
        }[])
      : [];
    specs = upsertSpec(specs, 'EPC', `Band ${facts.epc.band} (estimate)`);
    analysis.specs = specs;
  }

  if (facts.councilTax) {
    const dd =
      analysis.dueDiligence && typeof analysis.dueDiligence === 'object'
        ? ({ ...(analysis.dueDiligence as Record<string, unknown>) } as Record<string, unknown>)
        : {};
    if (isEmptyish(dd.councilTaxAndParking)) {
      dd.councilTaxAndParking = `${lead}: council tax band ${facts.councilTax.band}. Confirm with the local authority.`;
      analysis.dueDiligence = dd;
      applied.push(`councilTax:${facts.councilTax.band}`);
    }
  }

  if (facts.crime) {
    const area =
      analysis.areaAnalysis && typeof analysis.areaAnalysis === 'object'
        ? ({ ...(analysis.areaAnalysis as Record<string, unknown>) } as Record<string, unknown>)
        : {};
    const crimeSafety =
      area.crimeSafety && typeof area.crimeSafety === 'object'
        ? ({ ...(area.crimeSafety as Record<string, unknown>) } as Record<string, unknown>)
        : {};
    if (
      isEmptyish(crimeSafety.description) ||
      /unavailable|verify on police/i.test(String(crimeSafety.description || ''))
    ) {
      const levelLabel =
        facts.crime.level === 'low' ? 'Low' : facts.crime.level === 'high' ? 'Higher Risk' : 'Average';
      crimeSafety.rating = levelLabel;
      crimeSafety.description = `${facts.crime.summary} (${lead.toLowerCase()}.)`;
      area.crimeSafety = crimeSafety;
      analysis.areaAnalysis = area;
      applied.push(`crime:${facts.crime.level}`);
    }
  }

  if (facts.flood) {
    const risk =
      analysis.riskAnalysis && typeof analysis.riskAnalysis === 'object'
        ? ({ ...(analysis.riskAnalysis as Record<string, unknown>) } as Record<string, unknown>)
        : {};
    if (
      isEmptyish(risk.floodRisk) ||
      /could not be verified|environment agency|not on record/i.test(String(risk.floodRisk || ''))
    ) {
      risk.floodRisk = `${facts.flood.summary} (${lead.toLowerCase()} — confirm on the official flood map.)`;
      analysis.riskAnalysis = risk;
      const tones =
        analysis.riskTones && typeof analysis.riskTones === 'object'
          ? ({ ...(analysis.riskTones as Record<string, unknown>) } as Record<string, unknown>)
          : {};
      const t = facts.flood.summary.toLowerCase();
      tones.floodRisk = /high|significant|flood.?risk/i.test(t)
        ? 'caution'
        : /low|minimal|unlikely/i.test(t)
          ? 'positive'
          : 'neutral';
      analysis.riskTones = tones;
      applied.push('flood');
    }
  }

  if (facts.planning) {
    const pw =
      analysis.propertyWorks && typeof analysis.propertyWorks === 'object'
        ? ({ ...(analysis.propertyWorks as Record<string, unknown>) } as Record<string, unknown>)
        : {};
    if (
      isEmptyish(pw.planningApplications) ||
      /no structured|not summarised|none matched/i.test(String(pw.planningApplications || ''))
    ) {
      pw.planningApplications = `${facts.planning.summary} (${lead.toLowerCase()}.)`;
      analysis.propertyWorks = pw;
      applied.push('planning');
    }
  }

  if (facts.broadband) {
    const dd =
      analysis.dueDiligence && typeof analysis.dueDiligence === 'object'
        ? ({ ...(analysis.dueDiligence as Record<string, unknown>) } as Record<string, unknown>)
        : {};
    if (
      isEmptyish(dd.broadbandAndMobile) ||
      /not available from official|ofcom's broadband checker|confirm broadband availability/i.test(
        String(dd.broadbandAndMobile || '')
      )
    ) {
      dd.broadbandAndMobile = `${facts.broadband.summary} (${lead.toLowerCase()} — confirm exact premise speeds on Ofcom's broadband checker.)`;
      analysis.dueDiligence = dd;
      applied.push('broadband');
    }
  }

  if (facts.condition) {
    const dd =
      analysis.dueDiligence && typeof analysis.dueDiligence === 'object'
        ? ({ ...(analysis.dueDiligence as Record<string, unknown>) } as Record<string, unknown>)
        : {};
    if (
      isEmptyish(dd.epcAndEnergy) ||
      /no epc on register|scottish register and are not yet|request from vendor|home report/i.test(
        String(dd.epcAndEnergy || '')
      )
    ) {
      // Don't overwrite a real EPC band fill — only when still a gap message
      if (!facts.epc) {
        dd.epcAndEnergy = `${lead}: no EPC certificate linked. Condition estimate from public sources — ${facts.condition.summary} Confirm via Home Report / Scottish EPC register.`;
        analysis.dueDiligence = dd;
        applied.push(`condition:${facts.condition.level}`);
      }
    }
  }

  if (facts.schools.length) {
    const area =
      analysis.areaAnalysis && typeof analysis.areaAnalysis === 'object'
        ? ({ ...(analysis.areaAnalysis as Record<string, unknown>) } as Record<string, unknown>)
        : {};
    const existing = Array.isArray(area.schools) ? (area.schools as unknown[]) : [];
    if (existing.length === 0) {
      area.schools = facts.schools.map((s) => ({
        name: s.name,
        distance: s.distance || '—',
        rating: s.rating || 'Public school info (estimate)',
      }));
      delete area.schoolsEmptyMessage;
      analysis.areaAnalysis = area;
      applied.push(`schools:${facts.schools.length}`);
    }
  }

  if (facts.soldHistory.length) {
    const existing = Array.isArray(analysis.soldHistory) ? (analysis.soldHistory as unknown[]) : [];
    if (existing.length === 0) {
      analysis.soldHistory = facts.soldHistory.map((s) => ({
        year: (s.date || '').slice(0, 4) || s.date || '—',
        price: s.price,
        source: 'Public web records (estimate)',
        description: s.note || 'Historical sold price from public web records',
      }));
      applied.push(`soldHistory:${facts.soldHistory.length}`);
    }
  }

  if (facts.comps.length) {
    const existing = Array.isArray(analysis.comparableSales)
      ? (analysis.comparableSales as unknown[])
      : [];
    if (existing.length === 0) {
      analysis.comparableSales = facts.comps.map((c) => ({
        address: c.address,
        price: c.price,
        soldDate: c.date || '—',
        similarity: 'Nearby sale from public web records (estimate — confirm before offering)',
      }));
      applied.push(`comps:${facts.comps.length}`);
    }
  }

  if (facts.soldHistory.length || facts.comps.length) {
    const me =
      analysis.marketEvidence && typeof analysis.marketEvidence === 'object'
        ? ({ ...(analysis.marketEvidence as Record<string, unknown>) } as Record<string, unknown>)
        : {};
    if (
      isEmptyish(me.askingVsSoldEvidence) ||
      /land registry|no live asking/i.test(String(me.askingVsSoldEvidence || ''))
    ) {
      const tip = facts.soldHistory[0]
        ? `Recent public web sold signal around ${facts.soldHistory[0].price}${facts.soldHistory[0].date ? ` (${facts.soldHistory[0].date})` : ''}.`
        : 'Nearby solds from public web records are listed in this report.';
      me.askingVsSoldEvidence = `${tip} ${lead} — confirm on the official register before negotiating.`;
      analysis.marketEvidence = me;
    }
  }

  analysis.groundedWebFacts = {
    acceptedCount: facts.acceptedCount,
    applied,
    region,
    urls: [
      facts.property?.url,
      ...facts.soldHistory.map((s) => s.url),
      ...facts.comps.map((c) => c.url),
      ...facts.schools.map((s) => s.url),
      facts.epc?.url,
      facts.councilTax?.url,
      facts.crime?.url,
      facts.flood?.url,
      facts.planning?.url,
      facts.broadband?.url,
      facts.condition?.url,
    ].filter(Boolean),
  };

  if (applied.length) {
    console.log(`[groundedWebFacts] applied to PDF fields: ${applied.join(', ')}`);
  }
}

/** Build score inputs from official + grounded research so Value/Location/Condition can score. */
export function scoreInputsFromGrounded(
  analysis: Record<string, unknown>,
  facts: GroundedWebFacts | null | undefined,
  base: Partial<ScoreInputs> = {}
): ScoreInputs {
  const epcBand =
    base.epcBand ||
    facts?.epc?.band ||
    null;

  let crimePerThousand = base.crimePerThousand ?? null;
  let crimeLevel: ScoreInputs['crimeLevel'] = base.crimeLevel ?? null;
  if (crimePerThousand == null && facts?.crime?.level) {
    crimeLevel = facts.crime.level;
  }

  // Transport: nearest rail miles → walk-minute proxy
  let transportMinutesToStation = base.transportMinutesToStation ?? null;
  if (transportMinutesToStation == null) {
    const rows = (analysis.verifiedTransport ||
      (analysis.areaAnalysis as { transport?: { type?: string; miles?: number; time?: string }[] } | undefined)
        ?.transport ||
      []) as { type?: string; miles?: number; time?: string }[];
    const rail = rows
      .filter((r) => /rail/i.test(String(r.type || '')))
      .map((r) => {
        if (typeof r.miles === 'number') return r.miles;
        const m = String(r.time || '').match(/([\d.]+)\s*miles?/i);
        return m ? parseFloat(m[1]!) : NaN;
      })
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b)[0];
    if (rail != null && Number.isFinite(rail)) {
      transportMinutesToStation = Math.round(rail * 12); // ~5 mph walk
    }
  }

  let schoolOutstandingOrGood = base.schoolOutstandingOrGood ?? null;
  if (schoolOutstandingOrGood == null && facts?.schools?.length) {
    schoolOutstandingOrGood = facts.schools.some((s) =>
      /good|positive|outstanding|excellent|very good/i.test(String(s.rating || ''))
    )
      ? true
      : facts.schools.length > 0
        ? false
        : null;
    // If ratings unknown but schools found, still give a mild location signal
    if (schoolOutstandingOrGood === false && facts.schools.every((s) => !s.rating || /estimate|public/i.test(s.rating))) {
      schoolOutstandingOrGood = true; // presence of named local schools is a soft positive
    }
  }

  let priceVsCompsPct = base.priceVsCompsPct ?? null;
  if (priceVsCompsPct == null) {
    const subject =
      parseMoney(String(analysis.price || '')) ||
      parseMoney(String((analysis.valuation as { fair?: string } | undefined)?.fair || '')) ||
      (facts?.soldHistory[0] ? parseMoney(facts.soldHistory[0].price) : null);
    const compPrices = [
      ...(Array.isArray(analysis.comparableSales) ? analysis.comparableSales : []),
      ...(facts?.comps || []),
    ]
      .map((c) => parseMoney(String((c as { price?: string }).price || '')))
      .filter((n): n is number => n != null && n > 50_000);
    if (subject != null && compPrices.length > 0) {
      const avg = compPrices.reduce((a, b) => a + b, 0) / compPrices.length;
      if (avg > 0) priceVsCompsPct = ((subject - avg) / avg) * 100;
    }
  }

  let floodTone = base.floodTone ?? null;
  if (!floodTone && facts?.flood?.summary) {
    const t = facts.flood.summary.toLowerCase();
    floodTone = /high|significant/i.test(t)
      ? 'caution'
      : /low|minimal|unlikely/i.test(t)
        ? 'positive'
        : 'neutral';
  }

  let conditionEstimate = base.conditionEstimate ?? null;
  if (conditionEstimate == null && !epcBand) {
    if (facts?.condition?.level === 'good') conditionEstimate = 78;
    else if (facts?.condition?.level === 'average') conditionEstimate = 62;
    else if (facts?.condition?.level === 'poor') conditionEstimate = 40;
    else {
      // Soft proxy: recent approved extensions → better-than-average condition estimate
      const pw = [
        String((analysis.propertyWorks as { extensionsAndAlterations?: string } | undefined)?.extensionsAndAlterations || ''),
        String((analysis.propertyWorks as { planningApplications?: string } | undefined)?.planningApplications || ''),
        String(facts?.planning?.summary || ''),
      ].join(' ');
      if (/extension/i.test(pw) && /20(1[8-9]|2[0-6])/i.test(pw)) {
        conditionEstimate = 74;
      } else if (/extension|refurbished|modernised|renovated/i.test(pw)) {
        conditionEstimate = 68;
      }
    }
  }

  return {
    epcBand,
    floodTone,
    crimePerThousand,
    crimeLevel,
    priceVsCompsPct,
    hasPlanningMatch: base.hasPlanningMatch ?? Boolean(facts?.planning),
    transportMinutesToStation,
    schoolOutstandingOrGood,
    conditionEstimate,
  };
}

export function groundedCoverageFooterHint(facts?: GroundedWebFacts | null): string {
  if (!facts || facts.acceptedCount === 0) return '';
  return 'Some figures are estimates from public web records where official nation registers were not linked — confirm before offering.';
}
