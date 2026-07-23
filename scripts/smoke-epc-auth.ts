/**
 * Smoke-test EPC credentials without printing secrets.
 * Run: npx tsx scripts/smoke-epc-auth.ts
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
config();

import { lookupEpc } from '../src/lib/epcLookup';

const bearer = (process.env.EPC_API_BEARER || process.env.EPC_BEARER_TOKEN || '')
  .trim()
  .replace(/^Bearer\s+/i, '');
const legacy =
  Boolean((process.env.EPC_API_EMAIL || '').trim()) &&
  Boolean((process.env.EPC_API_KEY || '').trim());

console.log('[smoke] EPC_API_BEARER set:', bearer.length > 8);
console.log('[smoke] Legacy email+key set:', legacy);

const address = 'Pentland, Cross Lane, Northallerton, DL6 3ND';
const result = await lookupEpc(address);

if (result.error && !result.candidates.length && !result.matched) {
  console.error('[smoke] FAIL:', result.error);
  process.exitCode = 1;
} else {
  console.log('[smoke] OK candidates:', result.candidates.length);
  console.log('[smoke] matched:', Boolean(result.matched));
  if (result.matched) {
    console.log(
      '[smoke] match source:',
      result.matched.source,
      'rating:',
      result.matched.currentRating || '(none)',
      'area:',
      result.matched.floorAreaSqm || '(none)'
    );
  }
  if (result.error) console.log('[smoke] note:', result.error);
}
