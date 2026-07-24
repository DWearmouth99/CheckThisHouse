/**
 * HM Land Registry Price Paid Data — free Linked Data / SPARQL.
 * England & Wales only (no Scotland/NI coverage in this dataset).
 */

const UK_POSTCODE_RE =
  /\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i;

const SPARQL_ENDPOINT = 'https://landregistry.data.gov.uk/landregistry/query';
const LDA_ENDPOINT = 'https://landregistry.data.gov.uk/data/ppi/transaction-record.json';

export type LandRegistrySale = {
  paon: string;
  saon: string;
  street: string;
  town: string;
  postcode: string;
  amount: number;
  date: string;
  propertyType: string;
  /** Price Paid estate type when present (freehold / leasehold) */
  estateType?: string;
  newBuild?: boolean;
  /** Display address for PDF / AI */
  addressLabel: string;
};

export type LandRegistryLookup = {
  postcode: string | null;
  thisProperty: LandRegistrySale[];
  /** Same street, different door — best comps */
  nearbySameStreet: LandRegistrySale[];
  /** Other streets at the postcode — weaker comps */
  nearbyPostcode: LandRegistrySale[];
  /** @deprecated use nearbySameStreet / nearbyPostcode */
  nearby: LandRegistrySale[];
  error?: string;
  sourceUrl: string;
};

function lit(binding: Record<string, { value?: string } | undefined>, key: string): string {
  return String(binding[key]?.value || '').trim();
}

function formatGbp(n: number): string {
  return `£${Math.round(n).toLocaleString('en-GB')}`;
}

function parseHouseToken(address: string): { number: string; streetHint: string } | null {
  const withoutPc = address
    .replace(UK_POSTCODE_RE, '')
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // Flat / Apartment / Unit first
  const flat = withoutPc.match(
    /^(?:flat|apartment|apt|unit|suite)\s+([a-z0-9-]+)\s+(.+)$/i
  );
  if (flat) {
    return {
      number: flat[1]!.toUpperCase(),
      streetHint: flat[2]!.toLowerCase().slice(0, 40),
    };
  }
  const m = withoutPc.match(/^(\d+[A-Z]?)\s+(.+)$/i);
  if (m) {
    return { number: m[1]!.toUpperCase(), streetHint: m[2]!.toLowerCase().slice(0, 40) };
  }
  // Named house: "Pentland Cross Lane Northallerton"
  const named = withoutPc.match(/^([A-Za-z][A-Za-z0-9' -]{1,40}?)\s+(.+)$/);
  if (named) {
    return {
      number: named[1]!.toUpperCase().replace(/\s+/g, ' ').trim(),
      streetHint: named[2]!.toLowerCase().slice(0, 50),
    };
  }
  return null;
}

function normalizePc(pc: string): string {
  return pc.toUpperCase().replace(/\s+/g, ' ').trim();
}

function saleLabel(s: LandRegistrySale): string {
  return [s.saon, s.paon, s.street, s.town, s.postcode].filter(Boolean).join(', ');
}

function sameStreet(sale: LandRegistrySale, target: string): boolean {
  const parsed = parseHouseToken(target);
  if (!parsed) return false;
  const street = sale.street.toLowerCase();
  const hint = parsed.streetHint
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z0-9]/g, ''))
    .filter((w) => w.length > 2 && !/^(flat|apartment|apt|unit|suite|the)$/i.test(w))
    .slice(0, 3);
  if (hint.length === 0) return false;
  // Require the primary street name token (first significant word)
  return hint.slice(0, 2).every((w) => street.includes(w));
}

function matchesThisProperty(sale: LandRegistrySale, target: string): boolean {
  const parsed = parseHouseToken(target);
  if (!parsed) return false;
  const paon = sale.paon.toUpperCase().replace(/\s+/g, ' ').trim();
  const saon = sale.saon.toUpperCase().replace(/\s+/g, ' ').trim();
  const num = parsed.number.replace(/\s+/g, ' ').trim();
  const houseHit =
    paon === num ||
    saon === num ||
    paon.replace(/\s+/g, '') === num.replace(/\s+/g, '') ||
    new RegExp(
      `(?:^|\\b)${num.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
      'i'
    ).test(`${sale.saon} ${sale.paon}`);
  if (!houseHit) return false;
  return sameStreet(sale, target);
}

async function sparqlSales(postcode: string): Promise<LandRegistrySale[]> {
  const pc = normalizePc(postcode);
  const query = `
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
PREFIX lrppi: <http://landregistry.data.gov.uk/def/ppi/>
PREFIX lrcommon: <http://landregistry.data.gov.uk/def/common/>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT ?paon ?saon ?street ?town ?postcode ?amount ?date ?propertyType ?estateType ?newBuild
WHERE {
  VALUES ?postcode {"${pc}"^^xsd:string}
  ?addr lrcommon:postcode ?postcode .
  ?transx lrppi:propertyAddress ?addr ;
          lrppi:pricePaid ?amount ;
          lrppi:transactionDate ?date .
  OPTIONAL { ?addr lrcommon:paon ?paon }
  OPTIONAL { ?addr lrcommon:saon ?saon }
  OPTIONAL { ?addr lrcommon:street ?street }
  OPTIONAL { ?addr lrcommon:town ?town }
  OPTIONAL { ?transx lrppi:propertyType/skos:prefLabel ?propertyType }
  OPTIONAL { ?transx lrppi:estateType/skos:prefLabel ?estateType }
  OPTIONAL { ?transx lrppi:newBuild ?newBuild }
}
ORDER BY DESC(?date)
LIMIT 80
`.trim();

  const res = await fetch(SPARQL_ENDPOINT, {
    method: 'POST',
    headers: {
      Accept: 'application/sparql-results+json',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    },
    body: `query=${encodeURIComponent(query)}`,
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    throw new Error(`Land Registry SPARQL HTTP ${res.status}`);
  }
  const data = await res.json();
  const bindings = Array.isArray(data?.results?.bindings) ? data.results.bindings : [];
  const sales: LandRegistrySale[] = [];
  for (const b of bindings) {
    const amount = Number(lit(b, 'amount'));
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const estateRaw = lit(b, 'estateType');
    const newBuildRaw = lit(b, 'newBuild');
    const sale: LandRegistrySale = {
      paon: lit(b, 'paon'),
      saon: lit(b, 'saon'),
      street: lit(b, 'street'),
      town: lit(b, 'town'),
      postcode: lit(b, 'postcode') || pc,
      amount,
      date: lit(b, 'date'),
      propertyType: lit(b, 'propertyType'),
      estateType: normaliseEstateType(estateRaw) || undefined,
      newBuild:
        /true|yes|1/i.test(newBuildRaw) ? true : /false|no|0/i.test(newBuildRaw) ? false : undefined,
      addressLabel: '',
    };
    sale.addressLabel = saleLabel(sale);
    sales.push(sale);
  }
  return sales;
}

function normaliseEstateType(raw?: string): string | null {
  if (!raw?.trim()) return null;
  const s = raw.replace(/^.*\//, '').trim().toLowerCase();
  if (/freehold/.test(s)) return 'freehold';
  if (/leasehold/.test(s)) return 'leasehold';
  return null;
}

/** Fallback Linked Data API (same dataset, different transport). */
async function ldaSales(postcode: string): Promise<LandRegistrySale[]> {
  const pc = normalizePc(postcode);
  const url = `${LDA_ENDPOINT}?propertyAddress.postcode=${encodeURIComponent(pc)}&_pageSize=80&_sort=-transactionDate`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Land Registry LDA HTTP ${res.status}`);
  const data = await res.json();
  const items = Array.isArray(data?.items) ? data.items : [];
  const sales: LandRegistrySale[] = [];
  for (const item of items) {
    const addr = item?.propertyAddress || {};
    const amount = Number(item?.pricePaid);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const estateRaw = String(
      item?.estateType?.prefLabel || item?.estateType || item?.estate_type || ''
    );
    const sale: LandRegistrySale = {
      paon: String(addr.paon || '').trim(),
      saon: String(addr.saon || '').trim(),
      street: String(addr.street || '').trim(),
      town: String(addr.town || '').trim(),
      postcode: String(addr.postcode || pc).trim(),
      amount,
      date: String(item?.transactionDate || '').slice(0, 10),
      propertyType: String(item?.propertyType || '').replace(/^.*\//, ''),
      estateType: normaliseEstateType(estateRaw) || undefined,
      newBuild:
        typeof item?.newBuild === 'boolean'
          ? item.newBuild
          : /true|yes/i.test(String(item?.newBuild || ''))
            ? true
            : undefined,
      addressLabel: '',
    };
    sale.addressLabel = saleLabel(sale);
    sales.push(sale);
  }
  return sales;
}

export async function lookupLandRegistrySales(address: string): Promise<LandRegistryLookup> {
  const pcMatch = address.match(UK_POSTCODE_RE);
  const postcode = pcMatch ? normalizePc(pcMatch[1]!) : null;
  const sourceUrl = 'https://landregistry.data.gov.uk/';
  if (!postcode) {
    return {
      postcode: null,
      thisProperty: [],
      nearbySameStreet: [],
      nearbyPostcode: [],
      nearby: [],
      error: 'No postcode for Land Registry lookup.',
      sourceUrl,
    };
  }

  let sales: LandRegistrySale[] = [];
  let error: string | undefined;
  try {
    sales = await sparqlSales(postcode);
  } catch (err: any) {
    try {
      sales = await ldaSales(postcode);
    } catch (err2: any) {
      error = err2?.message || err?.message || 'Land Registry lookup failed.';
      return {
        postcode,
        thisProperty: [],
        nearbySameStreet: [],
        nearbyPostcode: [],
        nearby: [],
        error,
        sourceUrl,
      };
    }
  }

  const thisProperty = sales.filter((s) => matchesThisProperty(s, address));
  const nearbySameStreet = sales
    .filter((s) => !matchesThisProperty(s, address) && sameStreet(s, address))
    .slice(0, 20);
  const nearbyPostcode = sales
    .filter((s) => !matchesThisProperty(s, address) && !sameStreet(s, address))
    .slice(0, 20);
  const nearby = nearbySameStreet.length > 0 ? nearbySameStreet : nearbyPostcode;

  return {
    postcode,
    thisProperty,
    nearbySameStreet,
    nearbyPostcode,
    nearby,
    sourceUrl,
    error:
      sales.length === 0
        ? 'No Price Paid sales returned for this postcode (England & Wales Land Registry only).'
        : undefined,
  };
}

export function formatLandRegistryBrief(result: LandRegistryLookup): string {
  const lines: string[] = [
    'VERIFIED FACTS — HM LAND REGISTRY PRICE PAID (England & Wales). Treat matched sales as ground truth for solds.',
    `Source: ${result.sourceUrl}`,
  ];
  if (result.error && result.thisProperty.length === 0 && result.nearby.length === 0) {
    lines.push(`Lookup note: ${result.error}`);
    return lines.join('\n');
  }
  if (result.thisProperty.length > 0) {
    lines.push(`Sales matching this exact property (${result.thisProperty.length}):`);
    for (const s of result.thisProperty.slice(0, 12)) {
      lines.push(
        `- ${s.addressLabel}: ${formatGbp(s.amount)} on ${s.date}${s.propertyType ? ` (${s.propertyType})` : ''}`
      );
    }
  } else {
    lines.push(
      'No exact house-number match in Price Paid for this property. Leave this-address sold history as not on record — do not invent it.'
    );
  }
  if (result.nearbySameStreet.length > 0) {
    lines.push(`Other recent sales on the same street (comps):`);
    for (const s of result.nearbySameStreet.slice(0, 15)) {
      lines.push(
        `- ${s.addressLabel}: ${formatGbp(s.amount)} on ${s.date}${s.propertyType ? ` (${s.propertyType})` : ''}`
      );
    }
  } else if (result.nearbyPostcode.length > 0) {
    lines.push(`Other sales at this postcode (weaker comps — different streets):`);
    for (const s of result.nearbyPostcode.slice(0, 12)) {
      lines.push(
        `- ${s.addressLabel}: ${formatGbp(s.amount)} on ${s.date}${s.propertyType ? ` (${s.propertyType})` : ''}`
      );
    }
  }
  return lines.join('\n');
}

export function landRegistrySources(result: LandRegistryLookup): { title: string; url: string }[] {
  return [{ title: 'HM Land Registry Price Paid Data', url: result.sourceUrl }];
}

export function formatGbpAmount(n: number): string {
  return formatGbp(n);
}
