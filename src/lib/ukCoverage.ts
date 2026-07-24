/**
 * UK coverage / region resolution for CheckThisHouse reports.
 *
 * Supported for purchase + generation: England, Wales, Scotland, and Northern Ireland.
 *
 * Nation-specific official datasets (HM Land Registry, GIAS, police.uk, EA flood, etc.)
 * degrade honestly via coverageGapMessage + vacuum Mode C + distance caps — never invent
 * Asking Price, Mode A offers, or absurd nearest-N distances when sources are empty.
 *
 * Border districts (TD, and historically DG): DG is entirely Scotland in ONSPD.
 * TD straddles the border — English outcodes (esp. TD15 Berwick) are allowlisted
 * from ONS Postcode Directory country codes; remaining TD → Scotland.
 */

import { extractPostcode } from './addressMatch';

export type ReportRegion = 'england' | 'wales' | 'scotland' | 'northern_ireland' | 'unknown';

export type CoverageDecision = {
  region: ReportRegion;
  /** True when a report can be purchased / generated */
  supported: boolean;
  postcode: string | null;
  /** Customer-facing gate copy */
  message: string | null;
  /** Reserved — no region is waitlisted currently */
  waitlistRegion: null;
};

/** Clear Scottish postcode areas (ONSPD country = Scotland). */
const SCOTLAND_AREAS = new Set([
  'AB',
  'DD',
  'DG',
  'EH',
  'FK',
  'G',
  'HS',
  'IV',
  'KA',
  'KW',
  'KY',
  'ML',
  'PA',
  'PH',
  'ZE',
]);

const WALES_AREAS = new Set(['CF', 'LD', 'LL', 'NP', 'SA']);

/**
 * TD outcodes that are England in ONS Postcode Directory (border exceptions).
 * Source: ONSPD country code E92000001 for these districts — primarily
 * Berwick-upon-Tweed (TD15) and a few Northumberland fringe sectors.
 * Remaining TD* → Scotland.
 */
const TD_ENGLAND_OUTCODES = new Set([
  'TD15', // Berwick-upon-Tweed
]);

function normalizePc(raw?: string | null): string | null {
  if (!raw) return null;
  const extracted = extractPostcode(raw) || raw;
  const pc = extracted.toUpperCase().replace(/\s+/g, ' ').trim();
  if (!/^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/.test(pc.replace(/\s+/g, ' '))) {
    // Allow outward-only for early typing (EH22)
    const outward = pc.replace(/\s+/g, '');
    if (/^[A-Z]{1,2}\d[A-Z\d]?$/i.test(outward)) return outward;
    return pc || null;
  }
  return pc;
}

function outwardCode(pc: string): string {
  const compact = pc.replace(/\s+/g, '').toUpperCase();
  const m = compact.match(/^([A-Z]{1,2}\d[A-Z\d]?)/);
  return m?.[1] || compact;
}

function areaCode(outward: string): string {
  const m = outward.match(/^([A-Z]{1,2})/);
  return m?.[1] || '';
}

/**
 * Resolve report region from a postcode (full or outward).
 * Uses area prefixes + ONSPD-derived TD England exceptions.
 */
export function resolveReportRegion(postcodeOrAddress?: string | null): ReportRegion {
  const pc = normalizePc(postcodeOrAddress);
  if (!pc) return 'unknown';
  const outward = outwardCode(pc);
  const area = areaCode(outward);

  if (area === 'BT') return 'northern_ireland';

  if (area === 'TD') {
    // Match TD15, TD15 1AA, etc.
    if ([...TD_ENGLAND_OUTCODES].some((o) => outward === o || outward.startsWith(o))) {
      return 'england';
    }
    return 'scotland';
  }

  if (SCOTLAND_AREAS.has(area)) return 'scotland';
  if (WALES_AREAS.has(area)) return 'wales';

  // SY straddles England/Wales — treat as England & Wales supported (Wales tax if place hints)
  if (area === 'SY') return 'england';

  if (/^[A-Z]{1,2}$/.test(area)) return 'england';
  return 'unknown';
}

export function assessReportCoverage(postcodeOrAddress?: string | null): CoverageDecision {
  const pc = normalizePc(postcodeOrAddress);
  const region = resolveReportRegion(pc);

  if (region === 'unknown' && pc) {
    // Incomplete outward during typing — don't hard-block until full postcode
    const compact = pc.replace(/\s+/g, '');
    if (compact.length < 5) {
      return { region: 'unknown', supported: true, postcode: pc, message: null, waitlistRegion: null };
    }
  }
  const supported =
    region === 'england' ||
    region === 'wales' ||
    region === 'scotland' ||
    region === 'northern_ireland';
  return {
    region,
    supported,
    postcode: pc,
    message: region === 'unknown' ? 'Enter a full UK postcode to continue.' : null,
    waitlistRegion: null,
  };
}

/** Loud pipeline refusal — never generate a PDF for unsupported regions. */
export class UnsupportedRegionError extends Error {
  readonly code = 'OUTSIDE_COVERAGE';
  readonly coverage: CoverageDecision;

  constructor(coverage: CoverageDecision) {
    super(coverage.message || `Unsupported region: ${coverage.region}`);
    this.name = 'UnsupportedRegionError';
    this.coverage = coverage;
  }
}

export function assertReportCoverage(postcodeOrAddress?: string | null): CoverageDecision {
  const decision = assessReportCoverage(postcodeOrAddress);
  if (!decision.supported && decision.waitlistRegion) {
    throw new UnsupportedRegionError(decision);
  }
  return decision;
}

/** Region-aware “source doesn’t cover here” customer copy. */
export function coverageGapMessage(
  source: 'crime' | 'epc' | 'landRegistry' | 'schools' | 'flood',
  region: ReportRegion
): string | null {
  if (region !== 'scotland' && region !== 'northern_ireland') return null;
  const where = region === 'scotland' ? 'Scotland' : 'Northern Ireland';
  switch (source) {
    case 'crime':
      return region === 'scotland'
        ? 'Police-recorded crime data for Scotland is published separately by Police Scotland and is not yet included in this report.'
        : 'Police-recorded crime data for Northern Ireland is published separately and is not yet included in this report.';
    case 'epc':
      return region === 'scotland'
        ? 'Energy Performance Certificates for Scotland are held on a separate Scottish register and are not yet included in this report.'
        : `Energy Performance Certificates for ${where} are not yet included in this report.`;
    case 'landRegistry':
      return region === 'scotland'
        ? 'Sold prices for Scotland are recorded by Registers of Scotland (not HM Land Registry) and are not yet included in this report.'
        : `Sold-price records for ${where} are not yet included in this report.`;
    case 'schools':
      return region === 'scotland'
        ? 'School data for Scotland is published by Education Scotland (not Ofsted / GIAS) and is not yet included in this report.'
        : `School inspection data for ${where} is not yet included in this report.`;
    case 'flood':
      return region === 'scotland'
        ? 'Flood maps for Scotland are published by SEPA and are not yet included in this report.'
        : `Flood-risk maps for ${where} are not yet included in this report.`;
    default:
      return null;
  }
}
