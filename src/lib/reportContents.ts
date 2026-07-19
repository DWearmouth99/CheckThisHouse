/**
 * Canonical “what’s in the PDF” copy — keep in sync with PDFReport sections.
 * Used by marketing site, teaser modal, and teaser API research plan.
 */

export type ReportContentItem = {
  /** Short chip / checklist label */
  label: string;
  /** Longer sell line for benefit cards */
  detail: string;
};

/** Full buyer report contents (non-investor baseline + shared sections). */
export const REPORT_CONTENTS: ReportContentItem[] = [
  {
    label: 'Summary & scores',
    detail: 'Overall score out of 100, plus simple breakdowns for value, location, condition and market.',
  },
  {
    label: 'Is it a good buy?',
    detail: 'A plain-English verdict tailored to first-time buyers, movers and buy-to-let goals.',
  },
  {
    label: 'Pros & cons',
    detail: 'The main strengths and red flags so you see the deal clearly at a glance.',
  },
  {
    label: 'Property details',
    detail: 'Key facts in one place — type, beds, tenure notes and headline specs.',
  },
  {
    label: 'What is it worth?',
    detail: 'Low, fair and high value bands so you know if the asking price looks stretched.',
  },
  {
    label: 'How value could change',
    detail: 'Simple 1, 3, 5 and 10-year outlook — not just a single guess number.',
  },
  {
    label: 'Is the asking price fair?',
    detail: 'Whether the price leaves room to negotiate, plus renovation upside where it matters.',
  },
  {
    label: 'Flood, damp & structure',
    detail: 'Physical risks that hit survey bills and insurance — what to check on a viewing.',
  },
  {
    label: 'Leasehold, fire & insurance',
    detail: 'Lease issues, cladding/fire flags, ground rent concerns and whether it looks easy to insure.',
  },
  {
    label: 'Crime in the area',
    detail: 'A plain-English safety rating and neighbourhood feel before you fall for the photos.',
  },
  {
    label: 'Schools in the local area',
    detail: 'Nearby schools with distance and Ofsted-style ratings for family catchments.',
  },
  {
    label: 'Transport links',
    detail: 'Stations, buses and typical journey times for the commute and everyday travel.',
  },
  {
    label: 'Shops & amenities',
    detail: 'Shops, parks, healthcare and day-to-day conveniences nearby.',
  },
  {
    label: 'Sold prices nearby',
    detail: 'Similar homes sold recently so asking isn’t taken at face value.',
  },
  {
    label: 'Sold history',
    detail: 'What this address (and close-by homes) have sold for before, where available.',
  },
  {
    label: 'What to offer',
    detail: 'Opener, fair target and walk-away max — three figures you can actually use.',
  },
  {
    label: 'How to negotiate',
    detail: 'Simple tactics based on the weaknesses and leverage found in the research.',
  },
  {
    label: 'Viewing checklist',
    detail: 'A printable walk-round list so you know exactly what to look for on site.',
  },
  {
    label: 'Questions for the agent',
    detail: 'Smart questions that uncover survey history, works, lease details and seller motivation.',
  },
];

/** Extra sections when buyer goal is buy to let. */
export const INVESTOR_REPORT_CONTENTS: ReportContentItem[] = [
  {
    label: 'Rental yield & cashflow',
    detail: 'Estimated rent, yields and cashflow framing for buy-to-let.',
  },
  {
    label: 'ROI & stamp duty',
    detail: 'Return numbers plus stamp duty context for landlords.',
  },
  {
    label: 'Local rental market',
    detail: 'Demand, time on market and tenant signals for the area.',
  },
];

/** Short labels for hero chips / compact UI. */
export const REPORT_CONTENT_CHIPS: string[] = [
  'Overall score & verdict',
  'Pros & cons',
  'Fair value bands',
  'Price outlook (1–10yr)',
  'Flood, damp & structure',
  'Leasehold & insurance',
  'Crime in the area',
  'Schools & Ofsted',
  'Transport links',
  'Shops & amenities',
  'Sold comps nearby',
  'Offer opener & walk-away',
  'Viewing checklist',
  'Questions for the agent',
  'Investor yields*',
];

/**
 * Personalised teaser checklist — full depth, lightly tailored to the listing.
 */
export function buildFullReportTeaserPlan(opts: {
  locationHint?: string | null;
  bedrooms?: string | null;
  propertyType?: string | null;
  price?: string | null;
  tenure?: string | null;
}): string[] {
  const place = opts.locationHint || 'this area';
  const beds = opts.bedrooms ? `${opts.bedrooms}-bed ` : '';
  const type = opts.propertyType || 'home';
  const asking = opts.price || 'asking price';

  const items = [
    `Summary & scores for this ${beds}${type}`.replace(/\s+/g, ' ').trim(),
    `Is it a good buy for your goal`,
    `Pros and cons`,
    `What is it worth vs ${asking}`,
    `How value could change over time`,
    `Flood, damp and insurance watch-outs`,
    `Leasehold and fire safety flags`,
    `Crime in the area around ${place}`,
    `Schools in the local area`,
    `Transport links`,
    `Shops & amenities nearby`,
    `Sold prices nearby`,
    `What to offer (opener, fair target, walk-away)`,
    `How to negotiate`,
    `Viewing checklist + questions for the agent`,
    `Extra rental numbers if you choose buy to let`,
  ];

  if (opts.tenure && /lease/i.test(opts.tenure)) {
    items.splice(6, 0, `Leasehold checks: term left, ground rent and service charge`);
  }

  return items;
}
