/** Normalize and lightly validate UK addresses for address-only reports. */

const UK_POSTCODE_RE =
  /\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i;

export type AddressValidation =
  | { ok: true; address: string; postcode: string | null; locationHint: string | null; propertyKey: string }
  | { ok: false; error: string };

export function normalizeAddress(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

export function addressPropertyKey(address: string): string {
  return `address:${normalizeAddress(address).toLowerCase()}`;
}

export function isAddressPropertyKey(key: string): boolean {
  return key.toLowerCase().startsWith('address:');
}

export function validateUkAddress(raw: string): AddressValidation {
  const address = normalizeAddress(raw);
  if (!address) {
    return { ok: false, error: 'Enter a full UK address including the postcode.' };
  }
  if (address.length < 10) {
    return { ok: false, error: 'Address looks too short — include street, town and postcode.' };
  }
  const postcodeMatch = address.match(UK_POSTCODE_RE);
  if (!postcodeMatch) {
    return {
      ok: false,
      error: 'Include a valid UK postcode (for example PA2 8TR or LS8 1AB).',
    };
  }
  const postcode = postcodeMatch[1]!.toUpperCase().replace(/\s+/, ' ');
  const parts = address
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const locationHint =
    parts.length >= 2
      ? parts.slice(-2).join(', ')
      : parts.length === 1
        ? parts[0]!
        : postcode;

  return {
    ok: true,
    address,
    postcode,
    locationHint,
    propertyKey: addressPropertyKey(address),
  };
}

export function isInvalidAddress(
  result: AddressValidation
): result is { ok: false; error: string } {
  return result.ok === false;
}
