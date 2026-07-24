/**
 * Nation-aware Phase 1 research guidance — aggressive web harvest when
 * official registers are thin (Scotland/NI) or for past-listing attributes.
 */

import type { ReportRegion } from './ukCoverage';

export function nationResearchSourceGuide(region: ReportRegion): string {
  if (region === 'scotland') {
    return `NATION: Scotland. Official England/Wales registers (HM Land Registry Price Paid, police.uk, Ofsted/GIAS, EA flood, English EPC) will often be EMPTY — you MUST search aggressively and return every attributable fact you find.

SEARCH HARD FOR (use multiple queries; dig into past listings):
- Past Rightmove / Zoopla / OnTheMarket listings for this EXACT address (sold / SSTC / archived) — bedrooms, bathrooms, reception rooms, property type, tenure (Absolute Ownership for most Scottish houses — do NOT invent leasehold), floor area, EPC band if shown, last asking or sold price
- Registers of Scotland / ScotLIS / ros.gov.uk / Scottish house price search — subject solds + nearby street solds
- Scottish EPC register (scottishepcregister.org.uk) — search the exact address hard
- Ofcom / ThinkBroadband / ISP pages for broadband at this postcode
- Police Scotland / local news / council reports on crime levels for this town or neighbourhood
- Education Scotland / Parentzone / school pages near the postcode
- Scottish Assessors Association (saa.gov.uk) council tax band
- SEPA flood maps for this postcode
- Local Scottish council planning portal for this door number — extensions imply condition cues
- Estate agent pages, propertyData-style archives, StreetCheck-style area pages when they cite sources

Be thorough: if a past listing shows "3 bedrooms", capture it. If an article says crime is low for Midlothian, capture it with level. Prefer MORE grounded facts over leaving fields empty.
Do NOT invent numbers with no supporting page. Historical solds are NOT a live asking price. Do NOT claim leasehold for a Scottish house without a title page.`;
  }
  if (region === 'northern_ireland') {
    return `NATION: Northern Ireland. GB England registers may be empty — search aggressively:
- Past Rightmove / Zoopla listings for exact address (beds, baths, type, tenure, EPC, prices)
- LPS / NI house price sources for solds + nearby comps
- NI EPC register; PSNI / local news for crime context; Education Authority NI schools
- Local council planning; flood maps where published
Capture every attributable fact. Do NOT invent. Historical solds ≠ live asking.`;
  }
  return `NATION: England & Wales. Prefer official registers first (HM Land Registry, EPC, police.uk, Ofsted, EA flood). ALSO search past Rightmove/Zoopla listings for bedrooms/bathrooms/type when listing scrap is thin. Capture nearby solds and area crime context from reputable pages.`;
}

/** Instruct Phase 1 to emit a machine-parseable grounded block (URLs required). */
export const GROUNDED_FACTS_JSON_INSTRUCTION = `
After the research brief, append EXACTLY one fenced JSON block in this form (no commentary inside the fence).
FILL AS MANY FIELDS AS YOU CAN when a supporting https page exists — empty reports are a failure mode.

\`\`\`grounded-facts
{
  "property": {
    "bedrooms": 3,
    "bathrooms": 1,
    "receptions": 2,
    "propertyType": "Semi-detached house",
    "tenure": "Absolute Ownership",
    "floorAreaSqm": 95,
    "url": "https://www.rightmove.co.uk/..."
  },
  "soldHistory": [{"price":"£250,000","date":"2020-03","note":"subject or nearby","url":"https://..."}],
  "comps": [{"address":"...","price":"£...","date":"...","url":"https://..."}],
  "epc": {"band":"C","summary":"optional one-line","url":"https://..."},
  "councilTax": {"band":"E","summary":"optional","url":"https://..."},
  "crime": {"level":"low","summary":"one or two sentences on local crime context","url":"https://..."},
  "flood": {"summary":"one sentence flood context","url":"https://..."},
  "schools": [{"name":"...","distance":"0.4 miles","rating":"Good / Positive","url":"https://..."}],
  "planning": {"summary":"exact-address planning only","url":"https://..."},
  "broadband": {"summary":"fibre/superfast availability for this postcode","url":"https://..."},
  "condition": {"level":"good","summary":"recent extensions / listing condition cues","url":"https://..."}
}
\`\`\`

RULES:
- Include a field ONLY when you found a real public page with an https URL supporting it.
- property.* needs one url (past listing or EPC page) that shows those attributes.
- Scotland houses: tenure is almost always Absolute Ownership — do NOT invent English leasehold unless a title page says leasehold.
- crime.level must be one of: low | average | high (from article/stat tone) plus summary + url.
- condition.level must be one of: good | average | poor when listing/Home Report/planning cues support it.
- broadband: Ofcom checker, ThinkBroadband, ISP pages, or listing broadband claims with URL.
- soldHistory = historical solds only (NOT live asking). Max 6 soldHistory, 6 comps, 4 schools.
- Omit / null / [] when truly not found — never invent bedroom counts or EPC letters without a page.
`;
