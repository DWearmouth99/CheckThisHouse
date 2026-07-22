import { isInvalidAddress, validateUkAddress } from './ukAddress';

/**
 * Detect whether a listing display address looks specific enough to research
 * the right property (door / flat + full UK postcode).
 */
const PREMISE_RE =
  /^(?:(?:flat|apartment|apt|unit|suite)\s+[\w-]+|(?:\d+[A-Za-z]?))\b/i;

export function hasLikelyPremise(address: string): boolean {
  const first = address
    .split(',')
    .map((s) => s.trim())
    .find(Boolean);
  if (!first) return false;
  return PREMISE_RE.test(first);
}

export function listingNeedsAddressConfirm(address: string | null | undefined): boolean {
  const raw = (address || '').trim();
  if (!raw) return true;
  const check = validateUkAddress(raw);
  if (isInvalidAddress(check)) return true;
  if (!hasLikelyPremise(check.address)) return true;
  return false;
}
