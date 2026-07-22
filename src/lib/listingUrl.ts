/** Allowed property listing hosts (public product + API allowlist). */
const ALLOWED_HOST_SUFFIXES = [
  // UK
  'rightmove.co.uk',
  'zoopla.co.uk',
  'onthemarket.com',
  'primelocation.com',
  'openrent.co.uk',
  // US / international
  'zillow.com',
  'realtor.com',
  'redfin.com',
  'trulia.com',
  'homes.com',
  'apartments.com',
] as const;

export const SUPPORTED_PORTALS = [
  { name: 'Rightmove', region: 'UK', listingRead: 'best' as const },
  { name: 'Zoopla', region: 'UK', listingRead: 'address-preferred' as const },
  { name: 'OnTheMarket', region: 'UK', listingRead: 'address-preferred' as const },
  { name: 'Zillow', region: 'US', listingRead: 'address-preferred' as const },
  { name: 'Realtor.com', region: 'US', listingRead: 'address-preferred' as const },
  { name: 'Redfin', region: 'US', listingRead: 'address-preferred' as const },
] as const;

function normalizeHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, '');
}

function hostAllowed(hostname: string): boolean {
  const host = normalizeHost(hostname);
  return ALLOWED_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

export type ListingUrlResult =
  | { ok: true; url: string; host: string; portal: string }
  | { ok: false; error: string };

export function validateListingUrl(raw: string): ListingUrlResult {
  const trimmed = (raw || '').trim();
  if (!trimmed) {
    return {
      ok: false,
      error: 'Paste a property listing link to continue.',
    };
  }

  let parsed: URL;
  try {
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    parsed = new URL(withProtocol);
  } catch {
    return {
      ok: false,
      error: 'That does not look like a valid web link. Check the URL and try again.',
    };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, error: 'Listing links must start with http:// or https://.' };
  }

  if (!hostAllowed(parsed.hostname)) {
    return {
      ok: false,
      error:
        'That listing site isn’t supported. Use a Rightmove link, or switch to Address lookup with the full UK address.',
    };
  }

  const host = normalizeHost(parsed.hostname);
  const portal =
    ALLOWED_HOST_SUFFIXES.find((suffix) => host === suffix || host.endsWith(`.${suffix}`)) || host;

  return {
    ok: true,
    url: parsed.toString(),
    host,
    portal,
  };
}

export function isInvalidListingUrl(
  result: ListingUrlResult
): result is { ok: false; error: string } {
  return result.ok === false;
}

export function isAllowedListingUrl(raw: string): boolean {
  return validateListingUrl(raw).ok;
}
