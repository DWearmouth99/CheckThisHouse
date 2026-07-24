/**
 * Grounded web-facts unit tests (URL gate + customer estimate fills + scores).
 */
import { describe, expect, it } from 'vitest';
import {
  applyGroundedWebFacts,
  extractGroundedWebFacts,
  scoreInputsFromGrounded,
} from '../src/lib/groundedWebFacts';
import { computeDeterministicScores } from '../src/lib/deterministicScores';
import { detectReportMode } from '../src/lib/reportWritingEngine';
import { applyScotlandTenureDefaults } from '../src/lib/scotlandTenure';

const SAMPLE_NOTES = `
Brief: Scottish address research.
Sold via ScotLIS around £333,000 in 2018. Past Rightmove listing: 3 beds, 1 bath.
\`\`\`grounded-facts
{
  "property": {
    "bedrooms": 3,
    "bathrooms": 1,
    "receptions": 2,
    "propertyType": "Semi-detached house",
    "tenure": "Absolute Ownership",
    "floorAreaSqm": 95,
    "url": "https://www.rightmove.co.uk/house-prices/detail.html?example"
  },
  "soldHistory": [{"price":"£333,000","date":"2018-06","note":"subject sale","url":"https://ros.gov.uk/example"}],
  "comps": [{"address":"5 Hawk Crescent","price":"£340,000","date":"2021","url":"https://ros.gov.uk/comp"}],
  "epc": {"band":"C","summary":"Certificate on Scottish register","url":"https://scottishepcregister.org.uk/x"},
  "councilTax": {"band":"E","url":"https://saa.gov.uk/x"},
  "crime": {"level":"low","summary":"Local division reports are mid-range to low for Midlothian.","url":"https://www.scotland.police.uk/x"},
  "flood": {"summary":"SEPA maps show low river flooding likelihood nearby.","url":"https://map.sepa.org.uk/x"},
  "schools": [{"name":"St David's Primary","distance":"0.3 miles","rating":"Positive","url":"https://education.gov.scot/x"}],
  "planning": {"summary":"Two extensions approved in 2020 at this door number.","url":"https://planning.midlothian.gov.uk/x"},
  "broadband": {"summary":"Superfast fibre indicated for EH22 postcodes with typical downloads above 70 Mbps.","url":"https://checker.ofcom.org.uk/en-gb/broadband-coverage"},
  "condition": {"level":"good","summary":"2020 extensions and modern estate stock suggest good overall condition.","url":"https://planning.midlothian.gov.uk/x"}
}
\`\`\`
`;

describe('grounded web facts', () => {
  it('rejects facts without https URLs', () => {
    const notes = `\`\`\`grounded-facts
{"epc":{"band":"B","url":"http://insecure.example"},"soldHistory":[{"price":"£1","url":"not-a-url"}]}
\`\`\``;
    const f = extractGroundedWebFacts(notes);
    expect(f.epc).toBeNull();
    expect(f.soldHistory).toHaveLength(0);
    expect(f.acceptedCount).toBe(0);
  });

  it('parses URL-backed Scottish block including property beds', () => {
    const f = extractGroundedWebFacts(SAMPLE_NOTES);
    expect(f.rawParsed).toBe(true);
    expect(f.property?.bedrooms).toBe(3);
    expect(f.property?.bathrooms).toBe(1);
    expect(f.epc?.band).toBe('C');
    expect(f.crime?.level).toBe('low');
    expect(f.broadband?.summary).toMatch(/Superfast/i);
    expect(f.condition?.level).toBe('good');
    expect(f.soldHistory[0]?.price).toMatch(/333/);
    expect(f.schools[0]?.name).toMatch(/St David's/);
    expect(f.acceptedCount).toBeGreaterThan(6);
  });

  it('fills empty analysis with beds, crime, comps, broadband — estimate language, no URLs', () => {
    const analysis: Record<string, unknown> = {
      bedrooms: '',
      bathrooms: '',
      dueDiligence: {
        epcAndEnergy: 'No EPC on register — request from vendor.',
        councilTaxAndParking: 'Not on record — verify with the local authority',
        broadbandAndMobile:
          "Not available from official records at the time of this report — check availability on Ofcom's broadband checker.",
      },
      areaAnalysis: {
        schools: [],
        crimeSafety: { rating: 'Unavailable', description: '' },
      },
      riskAnalysis: { floodRisk: 'Flood risk could not be verified from Environment Agency' },
      soldHistory: [],
      comparableSales: [],
      specs: [],
    };
    const f = extractGroundedWebFacts(SAMPLE_NOTES);
    applyGroundedWebFacts(analysis, f, 'scotland');

    expect(analysis.bedrooms).toBe('3');
    expect(analysis.bathrooms).toBe('1');
    expect(analysis.propertyType).toMatch(/Semi-detached/i);

    const specs = analysis.specs as { label: string; value: string }[];
    expect(specs.some((s) => /Bedrooms/i.test(s.label) && /3/.test(s.value))).toBe(true);

    const dd = analysis.dueDiligence as {
      epcAndEnergy: string;
      councilTaxAndParking: string;
      broadbandAndMobile: string;
    };
    expect(dd.epcAndEnergy).toMatch(/Estimated from public Scottish web records/i);
    expect(dd.epcAndEnergy).toMatch(/EPC band C/i);
    expect(dd.epcAndEnergy).not.toMatch(/https?:\/\//i);
    expect(dd.councilTaxAndParking).toMatch(/band E/i);
    expect(dd.broadbandAndMobile).toMatch(/Superfast/i);
    expect(dd.broadbandAndMobile).not.toMatch(/https?:\/\//i);

    const area = analysis.areaAnalysis as {
      schools: { name: string }[];
      crimeSafety: { description: string; rating: string };
      schoolsEmptyMessage?: string;
    };
    expect(area.schools.length).toBe(1);
    expect(area.schoolsEmptyMessage).toBeUndefined();
    expect(area.crimeSafety.rating).toMatch(/Low/i);
    expect(area.crimeSafety.description).toMatch(/Midlothian/i);
    expect(area.crimeSafety.description).not.toMatch(/https?:\/\//i);

    const sold = analysis.soldHistory as { price: string; source: string }[];
    expect(sold[0]?.price).toMatch(/333/);
    expect(sold[0]?.source).toMatch(/estimate/i);

    const comps = analysis.comparableSales as { address: string }[];
    expect(comps[0]?.address).toMatch(/Hawk/);

    // Vacuum: grounded solds must not become live asking
    const mode = detectReportMode({ liveAsking: null, thisPropertySales: [] });
    expect(mode.hasLiveAsking).toBe(false);
    expect(mode.priceLabel).toMatch(/Estimated/i);
  });

  it('scores Value, Location, Condition from grounded facts (not only Market)', () => {
    const analysis: Record<string, unknown> = {
      price: '',
      valuation: {},
      comparableSales: [],
      soldHistory: [],
      areaAnalysis: {},
      riskTones: {},
    };
    const f = extractGroundedWebFacts(SAMPLE_NOTES);
    applyGroundedWebFacts(analysis, f, 'scotland');
    const input = scoreInputsFromGrounded(analysis, f, {
      hasPlanningMatch: false,
    });
    expect(input.epcBand).toBe('C');
    expect(input.crimeLevel).toBe('low');
    expect(input.schoolOutstandingOrGood).toBe(true);
    expect(input.priceVsCompsPct).not.toBeNull();
    expect(input.floodTone).toBe('positive');

    const scores = computeDeterministicScores(input);
    expect(scores.conditionRatingStatus).toBe('scored');
    expect(scores.locationRatingStatus).toBe('scored');
    expect(scores.valueForMoneyStatus).toBe('scored');
    expect(scores.scoredComponentCount).toBeGreaterThanOrEqual(3);
    expect(scores.overallBasis).not.toMatch(/based on 1 of 4/);
  });

  it('condition estimate from recent extensions when no EPC', () => {
    const analysis: Record<string, unknown> = {
      propertyWorks: {
        extensionsAndAlterations: 'Two storey extension approved 2020',
        planningApplications: '20/00123/DPP extension 2020',
      },
    };
    const input = scoreInputsFromGrounded(analysis, null, {});
    expect(input.epcBand).toBeNull();
    expect(input.conditionEstimate).toBe(74);
    const scores = computeDeterministicScores(input);
    expect(scores.conditionRatingStatus).toBe('scored');
    expect(scores.conditionRating).toBe(74);
  });

  it('scrubs false Scottish leasehold anomaly to Absolute Ownership', () => {
    const analysis: Record<string, unknown> = {
      propertyType: 'Detached house',
      summary:
        'Buyers must verify the tenure, as portal data suggests leasehold, which is highly unusual for Scottish residential property.',
      cons: [
        {
          title: 'Tenure Anomaly',
          detail: 'Portal data suggests leasehold, which requires urgent legal clarification in Scotland.',
        },
      ],
      dueDiligence: {
        tenureAndLegal: 'Absolute Ownership (verify portal leasehold anomaly)',
      },
      specs: [{ label: 'Tenure', value: 'Absolute Ownership (verify portal leasehold anomaly)' }],
      riskAnalysis: { leaseholdIssues: 'Portal suggests leasehold — unusual in Scotland.' },
      riskTones: { leaseholdIssues: 'caution' },
    };
    applyScotlandTenureDefaults(analysis, 'scotland');
    expect(String(analysis.summary)).not.toMatch(/leasehold/i);
    expect((analysis.cons as unknown[]).length).toBe(0);
    expect((analysis.dueDiligence as { tenureAndLegal: string }).tenureAndLegal).toMatch(
      /Absolute Ownership/i
    );
    expect((analysis.dueDiligence as { tenureAndLegal: string }).tenureAndLegal).not.toMatch(
      /anomaly/i
    );
    expect((analysis.riskAnalysis as { leaseholdIssues: string }).leaseholdIssues).toMatch(
      /Absolute Ownership/i
    );
    expect((analysis.riskTones as { leaseholdIssues: string }).leaseholdIssues).toBe('positive');
  });

  it('does not overwrite already-good verified fields', () => {
    const analysis: Record<string, unknown> = {
      bedrooms: '4',
      dueDiligence: { epcAndEnergy: 'EPC band D — 212 m² — oil heating.' },
      areaAnalysis: {
        schools: [{ name: 'Osmotherley Primary', distance: '2.3 miles', rating: 'Good' }],
      },
      soldHistory: [{ year: '2026', price: '£672,400', source: 'HM Land Registry' }],
    };
    applyGroundedWebFacts(analysis, extractGroundedWebFacts(SAMPLE_NOTES), 'scotland');
    expect(analysis.bedrooms).toBe('4');
    expect((analysis.dueDiligence as { epcAndEnergy: string }).epcAndEnergy).toMatch(/band D/i);
    expect((analysis.areaAnalysis as { schools: unknown[] }).schools).toHaveLength(1);
    expect((analysis.areaAnalysis as { schools: { name: string }[] }).schools[0]!.name).toMatch(
      /Osmotherley/
    );
  });

  it('crimeLevel alone scores location when police.uk rate missing', () => {
    const scores = computeDeterministicScores({ crimeLevel: 'average' });
    expect(scores.locationRatingStatus).toBe('scored');
    expect(scores.locationRating).toBeGreaterThan(50);
  });
});
