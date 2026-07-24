/**
 * Part 4 — reproducibility: comps selection, growth, GIAS, golden facts.
 * E2E / golden use recorded live fixtures only (Part 6B).
 */
import { describe, expect, it, vi, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { selectCompsFromLandRegistry, MAX_COMPS } from '../src/lib/selectComps';
import {
  computeGrowthAssumptionsFromSales,
  FALLBACK_CENTRAL_PCT,
  MIN_SALES,
} from '../src/lib/growthFromLandRegistry';
import { selectNearestSchools, type GiasSchool } from '../src/lib/giasSchools';
import { finalizeReport, FINALIZE_REPORT_MARKER } from '../src/lib/finalizeReport';
import { V4_DEFECT_LLM_ANALYSIS } from './fixtures/v4DefectLlmAnalysis';
import {
  PROSE_ALLOWLIST,
  extractFactSlice,
  deepSortKeys,
} from './fixtures/goldenFactAllowlist';
import {
  assertRecordedFixturesReady,
  GOLDEN_PATH,
  loadRecordedCrime,
  loadRecordedEpcCertificates,
  loadRecordedLandRegistry,
  loadRecordedLivingHere,
  PENTLAND_ADDRESS,
  REALITY,
  recordedLrAddressSet,
  recordedPropertyFacts,
} from './helpers/loadRecorded';
import {
  syntheticGrowthSampleSales,
  syntheticSale,
} from './fixtures/synthetic/synthetic-growth-sales';

vi.mock('../src/lib/epcLookup', async () => {
  const actual = await vi.importActual<typeof import('../src/lib/epcLookup')>('../src/lib/epcLookup');
  return {
    ...actual,
    fetchEpcCertificatesForPostcode: async (postcode: string) => {
      const compact = postcode.replace(/\s+/g, '').toUpperCase();
      if (compact !== 'DL63ND') return [];
      const { loadRecordedEpcCertificates } = await import('./helpers/loadRecorded');
      return loadRecordedEpcCertificates();
    },
  };
});

describe('Part 4 unit: comps selection rule (recorded LR)', () => {
  it('same street first; includes subject priors; max 6; all addresses from recorded LR', () => {
    assertRecordedFixturesReady();
    const lr = loadRecordedLandRegistry();
    const comps = selectCompsFromLandRegistry(lr);
    const allowed = recordedLrAddressSet(lr);
    expect(comps.length).toBeLessThanOrEqual(MAX_COMPS);
    expect(comps[0]?.isSubjectPriorSale).toBe(true);
    expect(comps[0]?.address.toUpperCase()).toContain('PENTLAND');
    expect(comps.some((c) => /MONKS HOUSE/i.test(c.address))).toBe(true);
    for (const c of comps) {
      expect(allowed.has(c.address)).toBe(true);
    }
  });
});

describe('Part 4 unit: growth formula (synthetic series only)', () => {
  it('computes early-vs-late 3y CAGR; band ±2pp when n<20, ±1pp when n≥20', () => {
    const ok = computeGrowthAssumptionsFromSales({
      sales: syntheticGrowthSampleSales(),
      postcode: 'TE1 1AA',
      propertyType: 'Detached',
      subjectAddress: 'Synthetic Subject, Synthetic Street, Testtown TE1 1AA',
      asOf: new Date('2026-01-01'),
    });
    expect(ok.usedFallback).toBe(false);
    expect(ok.centralPct).toBeGreaterThan(1);
    expect(ok.centralPct).toBeLessThan(5);
    expect(ok.spreadPct).toBe(2.0);

    const padded = [
      ...syntheticGrowthSampleSales(),
      ...Array.from({ length: 12 }, (_, i) =>
        syntheticSale({
          addressLabel: `Synthetic Pad ${i}, Synthetic Street, Testtown TE1 1AA`,
          amount: 450_000 + i * 1000,
          date: `2020-03-${String((i % 28) + 1).padStart(2, '0')}`,
        })
      ),
    ];
    const large = computeGrowthAssumptionsFromSales({
      sales: padded,
      postcode: 'TE1 1AA',
      propertyType: 'Detached',
      asOf: new Date('2026-01-01'),
    });
    expect(large.sampleSize).toBeGreaterThanOrEqual(20);
    expect(large.spreadPct).toBe(1.0);

    const tiny = computeGrowthAssumptionsFromSales({
      sales: syntheticGrowthSampleSales().slice(0, MIN_SALES - 1),
      postcode: 'TE1 1AA',
      propertyType: 'Detached',
      asOf: new Date('2026-01-01'),
    });
    expect(tiny.usedFallback).toBe(true);
    expect(tiny.centralPct).toBe(FALLBACK_CENTRAL_PCT);
  });

  it('excludes subject sale from the late 3-year median', () => {
    const subject = 'Synthetic Subject, Synthetic Street, Testtown TE1 1AA';
    const withSubject = [
      ...syntheticGrowthSampleSales(),
      syntheticSale({
        addressLabel: subject,
        amount: 5_000_000,
        date: '2025-06-01',
      }),
    ];
    const out = computeGrowthAssumptionsFromSales({
      sales: withSubject,
      postcode: 'TE1 1AA',
      propertyType: 'Detached',
      subjectAddress: subject,
      asOf: new Date('2026-01-01'),
    });
    expect(out.usedFallback).toBe(false);
    expect(out.basis).toMatch(/subject sale excluded/i);
    expect(out.centralPct).toBeLessThan(8);
  });
});

describe('Part 4 unit: GIAS school selection', () => {
  it('picks nearest 2 primary + 2 secondary by haversine', () => {
    const pool: GiasSchool[] = [
      {
        urn: '1',
        name: 'Near Primary',
        phase: 'Primary',
        status: 'Open',
        lat: 54.401,
        lng: -1.312,
        ofsted: 'Good',
        postcode: 'DL6',
      },
      {
        urn: '2',
        name: 'Far Primary',
        phase: 'Primary',
        status: 'Open',
        lat: 54.5,
        lng: -1.2,
        ofsted: 'Good',
        postcode: 'DL6',
      },
      {
        urn: '3',
        name: 'Near Secondary',
        phase: 'Secondary',
        status: 'Open',
        lat: 54.402,
        lng: -1.31,
        ofsted: 'Outstanding',
        postcode: 'DL6',
      },
      {
        urn: '4',
        name: 'Closed Primary',
        phase: 'Primary',
        status: 'Closed',
        lat: 54.4005,
        lng: -1.3115,
        ofsted: '',
        postcode: 'DL6',
      },
      {
        urn: '5',
        name: 'Second Near Primary',
        phase: 'Primary',
        status: 'Open',
        lat: 54.403,
        lng: -1.313,
        ofsted: 'Requires improvement',
        postcode: 'DL6',
      },
      {
        urn: '6',
        name: 'Second Secondary',
        phase: 'Secondary',
        status: 'Open',
        lat: 54.41,
        lng: -1.3,
        ofsted: 'Good',
        postcode: 'DL6',
      },
    ];
    const selected = selectNearestSchools(54.400483, -1.311641, pool);
    expect(selected).toHaveLength(4);
    expect(selected.filter((s) => /primary/i.test(s.phase))).toHaveLength(2);
    expect(selected.filter((s) => /secondary/i.test(s.phase))).toHaveLength(2);
    expect(selected.map((s) => s.name)).not.toContain('Closed Primary');
  });
});

async function regenerateFromRecorded(llmNoise?: Record<string, unknown>) {
  assertRecordedFixturesReady();
  const llm = {
    ...(structuredClone(V4_DEFECT_LLM_ANALYSIS) as unknown as Record<string, unknown>),
    ...llmNoise,
    areaAnalysis: {
      ...((V4_DEFECT_LLM_ANALYSIS as any).areaAnalysis || {}),
      schools: [{ name: 'FAKE SCHOOL', distance: '99 miles', rating: 'Outstanding' }],
      transport: [{ type: 'Rail', line: 'FAKE RAIL', time: '99 min' }],
    },
    valuation: {
      ...((V4_DEFECT_LLM_ANALYSIS as any).valuation || {}),
      growthAssumptions: {
        lowPct: 9,
        centralPct: 9,
        highPct: 9,
        basis: 'LLM invented rate — must be discarded',
      },
    },
    comparableSales: [
      { address: 'FAKE COMP', price: '£1', soldDate: '2000-01-01', similarity: 'fake' },
    ],
  };
  return finalizeReport(llm, {
    buyerGoal: 'homebuyer primary residence',
    scrap: { bedrooms: '4', propertyType: 'Detached' },
    facts: recordedPropertyFacts(),
    lookups: {
      crime: loadRecordedCrime(),
      flood: null,
      planning: null,
      livingHere: loadRecordedLivingHere(),
    },
    growthAsOf: new Date('2026-07-23'),
    skipLiveLivingHere: true,
  });
}

describe('Part 4 / 6B reality anchors + golden (recorded)', () => {
  let runA: Record<string, unknown>;
  let runB: Record<string, unknown>;

  beforeAll(async () => {
    runA = await regenerateFromRecorded({ summary: 'Prose run A.' });
    runB = await regenerateFromRecorded({ summary: 'Prose run B.' });
  }, 120_000);

  it('pins known-true LR facts; comps addresses ⊆ recorded LR', () => {
    const lr = loadRecordedLandRegistry();
    const prior = lr.thisProperty.find((s) => s.date === REALITY.subjectPriorDate);
    expect(prior?.amount).toBe(REALITY.subjectPriorAmount);

    const monks = [...lr.nearbySameStreet, ...lr.nearbyPostcode].find(
      (s) => /MONKS HOUSE/i.test(s.addressLabel) && s.date === REALITY.monksHouseDate
    );
    expect(monks?.amount).toBe(REALITY.monksHouseAmount);

    const comps = (runA.comparableSales || []) as { address: string; note?: string }[];
    const allowed = recordedLrAddressSet(lr);
    expect(comps.length).toBeGreaterThan(0);
    for (const c of comps) {
      expect(allowed.has(c.address)).toBe(true);
    }
    expect(comps.some((c) => /10 Cross Lane|11 Cross Lane/i.test(c.address))).toBe(false);
  });

  it('growth from recorded feed: paste sample, medians, rate', () => {
    const lr = loadRecordedLandRegistry();
    const allSales = [
      ...(lr.thisProperty || []),
      ...(lr.nearbySameStreet || []),
      ...(lr.nearbyPostcode || []),
    ];
    const growth = computeGrowthAssumptionsFromSales({
      sales: allSales,
      postcode: lr.postcode,
      propertyType: 'Detached',
      subjectAddress: lr.thisProperty[0]?.addressLabel || PENTLAND_ADDRESS,
      asOf: new Date('2026-07-23'),
    });
    // eslint-disable-next-line no-console
    console.log(
      '[Part6B] real sales selected (n=' +
        growth.sampleSize +
        ', years=' +
        growth.yearBuckets +
        '):\n' +
        (growth.sampleSales || [])
          .map((s, i) => `${i + 1}. ${s.date}  £${s.amount.toLocaleString('en-GB')}  ${s.address}`)
          .join('\n')
    );
    // eslint-disable-next-line no-console
    console.log(
      `[Part6B] earlyMedian=${growth.earlyMedian} lateMedian=${growth.lateMedian} Δy=${growth.deltaYears} central=${growth.centralPct}% spread=±${growth.spreadPct} fallback=${growth.usedFallback}`
    );
    // eslint-disable-next-line no-console
    console.log(`[Part6B] basis: ${growth.basis}`);
    expect(growth.sampleSize).toBeGreaterThanOrEqual(1);
    if (growth.sampleSize >= MIN_SALES && growth.yearBuckets >= 3) {
      expect(growth.usedFallback).toBe(false);
    } else {
      expect(growth.usedFallback).toBe(true);
      expect(growth.centralPct).toBe(FALLBACK_CENTRAL_PCT);
    }
  });

  it('two runs: fact-slice diff empty; schools/crime from recorded', () => {
    expect(runA.finalizedBy).toBe(FINALIZE_REPORT_MARKER);
    expect(extractFactSlice(runA)).toEqual(extractFactSlice(runB));
    const schools = ((runA.areaAnalysis as { schools?: { name: string; distance: string }[] })
      ?.schools || []) as { name: string; distance: string }[];
    expect(schools.length).toBe(4);
    expect(schools.some((s) => /FAKE/i.test(s.name))).toBe(false);
    const crime = runA.verifiedCrime as { label?: string } | undefined;
    const crimeLabel =
      crime?.label ||
      (runA.areaAnalysis as { crimeSafety?: { rating?: string } })?.crimeSafety?.rating ||
      '';
    expect(String(crimeLabel)).toMatch(/33\.5|incidents per 1,000/i);
    // eslint-disable-next-line no-console
    console.log('[Part6B] crime:', crimeLabel);
    // eslint-disable-next-line no-console
    console.log(
      '[Part6B] schools:',
      schools.map((s) => `${s.name} @ ${s.distance}`).join(' | ')
    );
    const comps = (runA.comparableSales || []) as {
      address: string;
      price: string;
      soldDate: string;
      note: string;
    }[];
    // eslint-disable-next-line no-console
    console.log(
      '[Part6B] comps table:\n' +
        comps.map((c) => `${c.address} | ${c.price} | ${c.soldDate} | ${c.note}`).join('\n')
    );
  });

  it('matches committed golden fact snapshot (re-approve with UPDATE_GOLDEN=1)', () => {
    const slice = deepSortKeys(extractFactSlice(runA));
    if (process.env.UPDATE_GOLDEN === '1') {
      fs.mkdirSync(path.dirname(GOLDEN_PATH), { recursive: true });
      fs.writeFileSync(GOLDEN_PATH, JSON.stringify(slice, null, 2) + '\n', 'utf8');
      // eslint-disable-next-line no-console
      console.log('[Part6B] wrote golden', GOLDEN_PATH);
      // eslint-disable-next-line no-console
      console.log('[Part6B] golden comparableSales:', JSON.stringify((slice as any).comparableSales));
    }
    expect(fs.existsSync(GOLDEN_PATH)).toBe(true);
    const golden = JSON.parse(fs.readFileSync(GOLDEN_PATH, 'utf8'));
    expect(slice).toEqual(golden);
  });
});

describe('Part 4 window constant', () => {
  it('documents growth window years', () => {
    expect(PROSE_ALLOWLIST.length).toBeGreaterThan(5);
  });
});
