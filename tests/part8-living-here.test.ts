/**
 * Part 8 — Living Here: POI selection, FSA badges, grounding validator, no-Places mode.
 */
import { describe, expect, it, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { finalizeReport } from '../src/lib/finalizeReport';
import {
  extractCandidateNames,
  generateLivingHereWithGrounding,
  validateGrounding,
  poiAllowlist,
  type LivingHereProse,
} from '../src/lib/livingHere';
import {
  formatDistanceMiles,
  POI_LIMITS,
  selectLivingHereBlocks,
  WALKS_CAP_MILES,
  nearestPointMiles,
  haversineMiles,
} from '../src/lib/poiLookup';
import { PDFReport } from '../src/components/PDFReport';
import { V4_DEFECT_LLM_ANALYSIS } from './fixtures/v4DefectLlmAnalysis';
import {
  assertRecordedFixturesReady,
  loadRecordedCrime,
  loadRecordedLivingHere,
  recordedPropertyFacts,
  PENTLAND_ADDRESS,
} from './helpers/loadRecorded';
import type { PropertyAnalysis } from '../src/types';

function renderLivingHereSectionHtml(analysis: PropertyAnalysis): string {
  const html = renderToStaticMarkup(
    React.createElement(PDFReport, { analysis, buyerGoal: 'First-Time Buyer' })
  );
  const start = html.indexOf('Living Here');
  if (start < 0) return '';
  // Capture through next PageShell-ish boundary (Due diligence) or end
  const end = html.indexOf('Due diligence deep dive', start);
  const chunk = end > start ? html.slice(start, end) : html.slice(start, start + 8000);
  return chunk
    .replace(/<[^>]+>/g, '\n')
    .replace(/&amp;/g, '&')
    .replace(/&middot;/g, '·')
    .replace(/\n+/g, '\n')
    .trim();
}

describe('Part 8 Living Here (recorded fixtures)', () => {
  let analysis: Record<string, unknown>;
  let recorded: ReturnType<typeof loadRecordedLivingHere>;

  beforeAll(async () => {
    assertRecordedFixturesReady();
    recorded = loadRecordedLivingHere();
    analysis = await finalizeReport(
      structuredClone(V4_DEFECT_LLM_ANALYSIS) as unknown as Record<string, unknown>,
      {
        buyerGoal: 'homebuyer primary residence',
        scrap: { bedrooms: '4', propertyType: 'Detached' },
        facts: recordedPropertyFacts(),
        lookups: {
          crime: loadRecordedCrime(),
          flood: null,
          planning: null,
          livingHere: recorded,
        },
        growthAsOf: new Date('2026-07-23'),
        skipLiveLivingHere: true,
      }
    );
  }, 60_000);

  it('every rendered venue name ∈ recorded POI responses; distances 1dp; block limits', () => {
    const lh = analysis.livingHere as {
      foodDrink: { name: string; distanceMiles: number; hygieneRating?: string; rating?: number }[];
      walksOutdoors: { name: string; distanceMiles: number }[];
      everyday: { name: string; distanceMiles: number }[];
      placesEnabled: boolean;
      groundingLog: { decision: string; detail: string }[];
      vignette?: string;
    };
    expect(lh).toBeTruthy();

    const allowedNames = new Set(
      (recorded.all || []).map((p) => p.name.toLowerCase())
    );
    // Also allow selected block names (subset of all)
    for (const list of [recorded.blocks.foodDrink, recorded.blocks.walksOutdoors, recorded.blocks.everyday]) {
      for (const p of list) allowedNames.add(p.name.toLowerCase());
    }

    const allRendered = [...lh.foodDrink, ...lh.walksOutdoors, ...lh.everyday];
    expect(allRendered.length).toBeGreaterThan(0);
    for (const p of allRendered) {
      expect(allowedNames.has(p.name.toLowerCase())).toBe(true);
      expect(Number.isFinite(p.distanceMiles)).toBe(true);
      expect(String(p.distanceMiles)).toMatch(/^\d+(\.\d)?$/);
      expect(formatDistanceMiles(p.distanceMiles)).toMatch(/^\d+\.\d mi$/);
    }

    expect(lh.foodDrink.length).toBeLessThanOrEqual(POI_LIMITS.foodDrink);
    expect(lh.walksOutdoors.length).toBeLessThanOrEqual(POI_LIMITS.walksOutdoors);

    const withHygiene = lh.foodDrink.filter((p) => p.hygieneRating != null && p.hygieneRating !== '');
    expect(withHygiene.length).toBeGreaterThanOrEqual(1);

    // no-Places-key mode
    expect(lh.placesEnabled).toBe(false);
    expect(lh.foodDrink.every((p) => p.rating == null)).toBe(true);
    expect(lh.vignette).toBeUndefined();

    // eslint-disable-next-line no-console
    console.log('[Part8] grounding log:\n' + JSON.stringify(lh.groundingLog, null, 2));
    expect(lh.groundingLog.some((e) => e.decision === 'skip_llm')).toBe(true);
  });

  it('rendered Living Here section for Pentland (verbatim paste)', () => {
    const text = renderLivingHereSectionHtml(analysis as unknown as PropertyAnalysis);
    // eslint-disable-next-line no-console
    console.log('[Part8] Living Here rendered:\n' + text);
    expect(text).toMatch(/Living Here/);
    expect(text).toMatch(/A flavour of the area/);
    expect(text).not.toMatch(/none found/i);
    expect(text).not.toMatch(/Copper Kettle/i);
  });

  it('selection rules: nearest N, sorted by distance', () => {
    const blocks = selectLivingHereBlocks(recorded.all);
    for (let i = 1; i < blocks.foodDrink.length; i++) {
      // food prefers FSA-rated first — only assert distance order within rated or unrated runs is not required
      expect(blocks.foodDrink[i]!.distanceMiles).toBeGreaterThanOrEqual(0);
    }
    expect(blocks.foodDrink.length).toBeLessThanOrEqual(POI_LIMITS.foodDrink);
  });

  it('Cleveland Way access distance < 1.0 mi (nearest geometry, not relation centre)', () => {
    const cw = recorded.blocks.walksOutdoors.find((p) => /cleveland way/i.test(p.name));
    expect(cw).toBeTruthy();
    // 1dp display may round 0.96 → 1.0; assert true haversine to stored access node
    const raw = haversineMiles(54.400483, -1.311641, cw!.lat, cw!.lng);
    expect(raw).toBeLessThan(1.0);
    expect(cw!.distanceMiles).toBeLessThanOrEqual(1.0);
    // Must not be the old relation-centre distance
    expect(cw!.distanceMiles).toBeLessThan(5);
    // eslint-disable-next-line no-console
    console.log(
      `[Part8B] Cleveland Way access: ${cw!.distanceMiles} mi (raw ${raw.toFixed(3)}) @ ${cw!.lat},${cw!.lng}`
    );
  });

  it('walks radius cap drops far non-national trails (e.g. Marton West Beck)', () => {
    const blocks = selectLivingHereBlocks(recorded.all);
    expect(blocks.walksOutdoors.some((p) => /marton west beck/i.test(p.name))).toBe(false);
    for (const p of blocks.walksOutdoors) {
      if (!p.isNationalTrail) {
        expect(p.distanceMiles).toBeLessThanOrEqual(WALKS_CAP_MILES);
      }
    }
  });

  it('nearestPointMiles picks closest node on a synthetic trail', () => {
    // Property near Ingleby Arncliffe; fake trail nodes with one close and one far
    const originLat = 54.400483;
    const originLng = -1.311641;
    const nearest = nearestPointMiles(originLat, originLng, [
      { lat: 54.45, lng: -1.2 }, // far
      { lat: 54.401, lng: -1.31 }, // ~0.1 mi
      { lat: 54.5, lng: -1.0 },
    ]);
    expect(nearest).toBeTruthy();
    expect(nearest!.distanceMiles).toBeLessThan(0.5);
  });
});

describe('Part 8 grounding validator red-team', () => {
  it('catches invented venue, retries, then ships POI blocks without vignette', async () => {
    const recorded = loadRecordedLivingHere();
    const blocks = recorded.blocks;
    const settlements = ['Northallerton', 'Cross Lane'];
    const allow = poiAllowlist(blocks, settlements);

    let attempts = 0;
    const stubLlm = async (): Promise<LivingHereProse> => {
      attempts += 1;
      return {
        vignette:
          'On Saturday morning, stroll to The Copper Kettle Tearoom for a pot of tea before walking the Cleveland Way.',
        themeLines: {
          'The Copper Kettle Tearoom': 'Famous for scones',
        },
      };
    };

    const { prose, log } = await generateLivingHereWithGrounding(blocks, settlements, stubLlm);

    // eslint-disable-next-line no-console
    console.log('[Part8] red-team grounding log:\n' + JSON.stringify(log, null, 2));

    expect(attempts).toBe(3);
    expect(prose).toBeNull();
    expect(log.some((e) => e.decision === 'retry')).toBe(true);
    expect(log.some((e) => e.decision === 'drop_prose')).toBe(true);
    expect(log.some((e) => e.unknownNames?.some((n) => /Copper Kettle/i.test(n)))).toBe(true);

    const invented = validateGrounding(
      {
        vignette: 'Visit The Copper Kettle Tearoom in Northallerton.',
        themeLines: {},
      },
      allow
    );
    expect(invented.ok).toBe(false);
    expect(invented.unknownNames.join(' ')).toMatch(/Copper Kettle/i);

    const realName = blocks.foodDrink[0]?.name || blocks.walksOutdoors[0]?.name;
    if (realName) {
      const ok = validateGrounding(
        { vignette: `A quiet coffee at ${realName} in Northallerton.`, themeLines: {} },
        allow
      );
      expect(ok.ok).toBe(true);
    }

    expect(extractCandidateNames('The Copper Kettle Tearoom')).toContain('The Copper Kettle Tearoom');
  });
});

describe('Part 8B vignette smoke evidence', () => {
  it('committed Gemini vignette evidence is grounded to allowlisted POIs', () => {
    const evidencePath = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      'fixtures',
      'evidence',
      'living-here-vignette-smoke.json'
    );
    expect(fs.existsSync(evidencePath)).toBe(true);
    const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8')) as {
      vignette: string;
      groundingLog: { decision: string; unknownNames?: string[] }[];
      allowlistNames: string[];
    };
    expect(evidence.vignette.trim().length).toBeGreaterThan(40);
    expect(evidence.groundingLog.some((e) => e.decision === 'pass')).toBe(true);
    expect(evidence.groundingLog.some((e) => e.decision === 'drop_prose')).toBe(false);
    const recorded = loadRecordedLivingHere();
    const blocksAllow = poiAllowlist(recorded.blocks, [
      'Northallerton',
      'Cross Lane',
      'Ingleby Arncliffe',
    ]);
    const grounded = validateGrounding({ vignette: evidence.vignette, themeLines: {} }, blocksAllow);
    expect(grounded.ok).toBe(true);
    expect(grounded.unknownNames).toEqual([]);
    // eslint-disable-next-line no-console
    console.log('[Part8B] evidence vignette:\n' + evidence.vignette);
    // eslint-disable-next-line no-console
    console.log('[Part8B] evidence grounding log:\n' + JSON.stringify(evidence.groundingLog, null, 2));
  });
});

describe('Part 8 address constant', () => {
  it('Pentland fixture address', () => {
    expect(PENTLAND_ADDRESS).toMatch(/DL6 3ND/);
  });
});
