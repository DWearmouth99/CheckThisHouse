/**
 * Verified-fact registry for Class 3 provenance + Class 2 numeral checks.
 * Every factId must resolve to a pipeline-verified value.
 */

import type { EpcRecord } from './epcLookup';
import type { CrimeLookup } from './policeUkLookup';
import type { PropertyFacts } from './propertyFacts';

export type VerifiedFact = {
  id: string;
  label: string;
  value: string | number | boolean | null;
  /** Numerals that may appear in Class 2/3 prose citing this fact */
  numerals: string[];
  source: string;
};

export type VerifiedFactBag = Record<string, VerifiedFact>;

function numeralsFrom(value: unknown): string[] {
  const s = String(value ?? '');
  const hits = s.match(/\d+(?:\.\d+)?/g) || [];
  return [...new Set(hits)];
}

function add(
  bag: VerifiedFactBag,
  id: string,
  label: string,
  value: string | number | boolean | null | undefined,
  source: string
): void {
  if (value == null || value === '') return;
  bag[id] = {
    id,
    label,
    value,
    numerals: numeralsFrom(value),
    source,
  };
}

export function buildVerifiedFactBag(opts: {
  facts?: PropertyFacts | null;
  analysis: Record<string, unknown>;
  crime?: CrimeLookup | null;
  flood?: { bandingLabel?: string; zone?: string } | null;
  buyerGoal?: string;
}): VerifiedFactBag {
  const bag: VerifiedFactBag = {};
  const epc: EpcRecord | null = opts.facts?.epc?.matched || null;
  const lr = opts.facts?.landRegistry;

  if (epc) {
    add(bag, 'epc.currentRating', 'EPC current rating', epc.currentRating, 'EPC register');
    add(bag, 'epc.potentialRating', 'EPC potential rating', epc.potentialRating, 'EPC register');
    add(bag, 'epc.floorAreaSqm', 'EPC floor area (m²)', epc.floorAreaSqm, 'EPC register');
    add(bag, 'epc.propertyType', 'EPC property type', epc.propertyType, 'EPC register');
    add(bag, 'epc.builtForm', 'EPC built form', epc.builtForm, 'EPC register');
    add(
      bag,
      'epc.constructionAgeBand',
      'Construction age band',
      epc.constructionAgeBand,
      'EPC register'
    );
    add(bag, 'epc.walls', 'Walls description', epc.wallsDescription, 'EPC register');
    add(bag, 'epc.roof', 'Roof description', epc.roofDescription, 'EPC register');
    add(bag, 'epc.windows', 'Windows description', epc.windowsDescription, 'EPC register');
    add(bag, 'epc.floor', 'Floor description', epc.floorDescription, 'EPC register');
    add(bag, 'epc.heating', 'Main heating', epc.heating, 'EPC register');
    add(bag, 'epc.lodgementDate', 'EPC lodgement date', epc.lodgementDate, 'EPC register');
  }

  const thisSales = lr?.thisProperty || [];
  if (thisSales[0]) {
    add(bag, 'lr.lastSoldPrice', 'Last sold price', thisSales[0].amount, 'HM Land Registry');
    add(bag, 'lr.lastSoldDate', 'Last sold date', thisSales[0].date, 'HM Land Registry');
  }
  if (thisSales[1]) {
    add(bag, 'lr.priorSoldPrice', 'Prior sold price', thisSales[1].amount, 'HM Land Registry');
    add(bag, 'lr.priorSoldDate', 'Prior sold date', thisSales[1].date, 'HM Land Registry');
  }

  const me = opts.analysis.marketEvidence as { pricePerSqmOrSqft?: string } | undefined;
  add(bag, 'market.pricePerSqm', '£/sqm', me?.pricePerSqmOrSqft, 'computed');

  const growth = (opts.analysis.growthAssumptions ||
    (opts.analysis.valuation as { growthAssumptions?: unknown } | undefined)?.growthAssumptions) as
    | { centralPct?: number; basis?: string }
    | undefined;
  if (growth?.centralPct != null) {
    add(bag, 'growth.centralPct', 'Sector growth central %', growth.centralPct, 'Land Registry CAGR');
  }

  if (opts.crime?.reliable && opts.crime.incidentsPerThousand != null) {
    add(
      bag,
      'crime.rate',
      'Crime rate per 1,000',
      opts.crime.incidentsPerThousand,
      'police.uk'
    );
    add(bag, 'crime.label', 'Crime rate label', opts.crime.label, 'police.uk');
  }

  if (opts.flood?.bandingLabel) {
    add(bag, 'flood.banding', 'Flood banding', opts.flood.bandingLabel, 'EA / planning.data');
  }
  if (opts.flood?.zone) {
    add(bag, 'flood.zone', 'Flood zone', opts.flood.zone, 'EA / planning.data');
  }

  const mode = String(opts.analysis.reportMode || '');
  add(bag, 'report.mode', 'Report mode', mode, 'code');
  add(bag, 'report.price', 'Displayed price', String(opts.analysis.price || ''), 'code');
  if (opts.buyerGoal) add(bag, 'buyer.goal', 'Buyer goal', opts.buyerGoal, 'user');

  const area = opts.analysis.areaAnalysis as
    | {
        transport?: { line?: string; time?: string; type?: string }[];
        schools?: { name?: string; distance?: string }[];
      }
    | undefined;
  (area?.transport || []).forEach((t, i) => {
    add(bag, `transport.${i}.line`, 'Transport', t.line, 'NaPTAN');
    add(bag, `transport.${i}.time`, 'Transport distance', t.time, 'NaPTAN');
  });
  (area?.schools || []).forEach((s, i) => {
    add(bag, `school.${i}.name`, 'School', s.name, 'GIAS');
    add(bag, `school.${i}.distance`, 'School distance', s.distance, 'GIAS');
  });

  const loc = opts.analysis.location as { address?: string; postcode?: string; town?: string } | undefined;
  add(bag, 'location.address', 'Address', loc?.address || opts.facts?.address, 'input');
  add(bag, 'location.postcode', 'Postcode', loc?.postcode || opts.facts?.epc?.postcode, 'input');
  add(bag, 'location.town', 'Town', loc?.town, 'input');

  const works = opts.analysis.propertyWorks as
    | { planningApplications?: string; extensionsAndAlterations?: string }
    | undefined;
  add(bag, 'planning.applications', 'Planning applications', works?.planningApplications, 'council');
  add(bag, 'planning.extensions', 'Extensions / alterations', works?.extensionsAndAlterations, 'council');

  return bag;
}

export function factExists(bag: VerifiedFactBag, id: string): boolean {
  return Boolean(bag[id]);
}

/** Extract numerals from prose for integrity checks. */
export function extractProseNumerals(text: string): string[] {
  return [...new Set((String(text || '').match(/\d+(?:\.\d+)?/g) || []))];
}
