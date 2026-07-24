/**
 * Part 6 — comps EPC matching + mechanical notes.
 * Pure unit tests use synthetic- fixtures; e2e/reality anchors use recorded/.
 */
import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  buildMechanicalComps,
  buildMechanicalCompNote,
  formatSoldMonth,
} from '../src/lib/compBasis';
import {
  epcAddressMatchesComp,
  houseIdentityKey,
  normalizeAddressLine,
  firstAddressLine,
  matchCompToEpcCertificates,
  pickMostRecentlyLodged,
  type EpcRecord,
} from '../src/lib/epcLookup';
import { selectCompsFromLandRegistry, MAX_COMPS } from '../src/lib/selectComps';
import { findBannedHits } from '../src/lib/bannedTerms';
import {
  assertRecordedFixturesReady,
  loadRecordedEpcCertificates,
  loadRecordedLandRegistry,
  REALITY,
  recordedLrAddressSet,
} from './helpers/loadRecorded';

const syntheticEpcPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures/synthetic/synthetic-epc-dl6-3nd.json'
);
const SYNTHETIC_EPC = JSON.parse(fs.readFileSync(syntheticEpcPath, 'utf8')) as EpcRecord[];

const NOTE_MATCH_RE =
  /^\d+(?:\.\d+)? sqm .+, sold \w{3,4} \d{4} \(£[\d,]+\/sqm\)$/;
const NOTE_NO_MATCH_RE = /^.+, sold \w{3,4} \d{4}$/;
const NOTE_SUBJECT_RE = /^This property's previous sale — \w{3,4} \d{4}$/;

describe('Part 6 unit: address normalisation / match (synthetic EPC)', () => {
  it('normalises LR PAON vs EPC first line for named houses', () => {
    expect(normalizeAddressLine(firstAddressLine('MONKS HOUSE, CROSS LANE'))).toBe('MONKS HOUSE');
    expect(houseIdentityKey('MONKS HOUSE')).toBe('MONKS HOUSE');
    expect(
      epcAddressMatchesComp('Monks House, Cross Lane', 'MONKS HOUSE, CROSS LANE, NORTHALLERTON DL6 3ND')
    ).toBe(true);
  });

  it('picks most recently lodged when multiple certs match', () => {
    const { cert, decision } = matchCompToEpcCertificates(
      'Monks House, Cross Lane, Northallerton DL6 3ND',
      SYNTHETIC_EPC
    );
    expect(decision.matched).toBe(true);
    expect(cert?.floorAreaSqm).toBe('158');
    expect(
      pickMostRecentlyLodged(SYNTHETIC_EPC.filter((c) => /monks/i.test(c.address)))?.floorAreaSqm
    ).toBe('158');
  });
});

describe('Part 6 unit: mechanical notes templates (synthetic)', () => {
  it('hit rate ≥ 50%; notes match templates; £/sqm exact; banned phrase impossible', async () => {
    const comps = [
      {
        address: 'Monks House, Cross Lane, Northallerton DL6 3ND',
        price: '£474,000',
        soldDate: '2024-03-01',
        propertyType: 'Detached',
      },
      {
        address: 'Inglenook Cottage, Cross Lane, Northallerton DL6 3ND',
        price: '£310,000',
        soldDate: '2023-08-01',
        propertyType: 'Semi-Detached',
      },
      {
        address: 'Still Point, Cross Lane, Northallerton DL6 3ND',
        price: '£360,000',
        soldDate: '2022-11-01',
        propertyType: 'Detached',
      },
      {
        address: '99 No Match Road, Northallerton DL6 3ND',
        price: '£200,000',
        soldDate: '2021-01-01',
        propertyType: 'Terraced',
      },
      {
        address: 'Pentland, Cross Lane, Northallerton DL6 3ND',
        price: '£420,000',
        soldDate: '2015-06-01',
        propertyType: 'Detached',
        isSubjectPriorSale: true,
      },
    ];

    const { comps: out, epcHitRate } = await buildMechanicalComps({
      comps,
      postcode: 'DL6 3ND',
      epcCertificates: SYNTHETIC_EPC,
    });

    expect(epcHitRate).toBeGreaterThanOrEqual(0.5);
    const monks = out.find((c) => /monks/i.test(c.address))!;
    expect(monks.note).toBe('158 sqm House, sold Mar 2024 (£3,000/sqm)');
    expect(Math.round(474_000 / 158)).toBe(3000);

    for (const c of out) {
      if (c.isSubjectPriorSale) expect(c.note).toMatch(NOTE_SUBJECT_RE);
      else if (c.floorAreaSqm) expect(c.note).toMatch(NOTE_MATCH_RE);
      else expect(c.note).toMatch(NOTE_NO_MATCH_RE);
    }

    const fullText = out.map((c) => `${c.similarity}\n${c.note}`).join('\n');
    expect(findBannedHits(fullText)).toEqual([]);
    expect(
      buildMechanicalCompNote({
        floorAreaSqm: '100',
        propertyType: 'House',
        soldDate: '2020-01-01',
        price: '£100,000',
      })
    ).not.toMatch(/not established/i);
  });

  it('formatSoldMonth', () => {
    expect(formatSoldMonth('2024-03-01')).toMatch(/Mar 2024/);
  });
});

describe('Part 6B: recorded LR selection + reality anchors', () => {
  it('max-6 / subject-prior / Monks House from recorded; no invented addresses', () => {
    assertRecordedFixturesReady();
    const lr = loadRecordedLandRegistry();
    const comps = selectCompsFromLandRegistry(lr);
    const allowed = recordedLrAddressSet(lr);

    expect(comps.length).toBeLessThanOrEqual(MAX_COMPS);
    expect(comps[0]?.isSubjectPriorSale).toBe(true);

    const prior = lr.thisProperty.find((s) => s.date === REALITY.subjectPriorDate);
    expect(prior?.amount).toBe(REALITY.subjectPriorAmount);

    const monksSale = lr.nearbySameStreet.find(
      (s) => /MONKS HOUSE/i.test(s.addressLabel) && s.date === REALITY.monksHouseDate
    );
    expect(monksSale?.amount).toBe(REALITY.monksHouseAmount);
    expect(comps.some((c) => /MONKS HOUSE/i.test(c.address))).toBe(true);

    for (const c of comps) {
      expect(allowed.has(c.address)).toBe(true);
      expect(c.address).not.toMatch(/^(10|11) Cross Lane/i);
    }
  });

  it('mechanical notes against recorded EPC batch', async () => {
    const lr = loadRecordedLandRegistry();
    const selected = selectCompsFromLandRegistry(lr);
    const certs = loadRecordedEpcCertificates();
    const { comps, epcHitRate, matchDecisions } = await buildMechanicalComps({
      comps: selected,
      postcode: 'DL6 3ND',
      epcCertificates: certs,
    });
    // eslint-disable-next-line no-console
    console.log(
      '[Part6B] match decisions:\n' +
        matchDecisions
          .map((d) => `  ${d.matched ? 'MATCH' : 'NO-MATCH'}: ${d.compAddress} — ${d.reason}`)
          .join('\n')
    );
    // eslint-disable-next-line no-console
    console.log(
      '[Part6B] comps notes:\n' +
        comps.map((c) => `${c.address} | ${c.price} | ${c.note}`).join('\n')
    );
    // eslint-disable-next-line no-console
    console.log(`[Part6B] EPC hit rate ${(epcHitRate * 100).toFixed(0)}%`);
    expect(comps.length).toBeGreaterThan(0);
    expect(comps.every((c) => !/not established/i.test(c.note))).toBe(true);
  });
});
