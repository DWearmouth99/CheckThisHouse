/**
 * Live Gemini smoke: Living Here vignette from recorded POI context.
 * Usage: npx tsx scripts/smoke-living-here-vignette.ts
 *
 * Writes tests/fixtures/evidence/living-here-vignette-smoke.json
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import {
  generateLivingHereWithGrounding,
  livingHereGeminiPrompt,
  poiAllowlist,
} from '../src/lib/livingHere';
import { livingHereFromRecorded } from '../src/lib/poiLookup';

config();
config({ path: '.env.local', override: true });

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const recordedPath = path.join(root, 'tests', 'fixtures', 'recorded', 'living-here-dl6-3nd.json');
const evidenceDir = path.join(root, 'tests', 'fixtures', 'evidence');
const evidencePath = path.join(evidenceDir, 'living-here-vignette-smoke.json');

async function main(): Promise<void> {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key || key === 'MY_GEMINI_API_KEY') {
    console.error('GEMINI_API_KEY missing — cannot run vignette smoke.');
    process.exitCode = 1;
    return;
  }

  const recorded = JSON.parse(fs.readFileSync(recordedPath, 'utf8')) as {
    blocks?: Parameters<typeof livingHereFromRecorded>[0]['blocks'];
    all?: Parameters<typeof livingHereFromRecorded>[0]['all'];
  };
  const blocks = livingHereFromRecorded(recorded);
  const settlements = ['Northallerton', 'Cross Lane', 'Ingleby Arncliffe'];
  const allow = poiAllowlist(blocks, settlements);

  const model = process.env.GEMINI_MODEL || 'gemini-3.1-pro-preview';
  const ai = new GoogleGenAI({ apiKey: key });

  const llm = async ({
    poiContext,
    attempt,
  }: {
    poiContext: string;
    reviewSnippets?: Record<string, string[]>;
    attempt: number;
  }) => {
    const resp = await ai.models.generateContent({
      model,
      contents: `${livingHereGeminiPrompt(poiContext, false)}\n(Attempt ${attempt + 1})`,
      config: {
        temperature: 0,
        responseMimeType: 'application/json',
      },
    });
    const raw = (resp.text || '{}').trim();
    const parsed = JSON.parse(raw.replace(/^```json\s*|\s*```$/g, '')) as {
      vignette?: string;
      themeLines?: Record<string, string>;
    };
    return {
      vignette: String(parsed.vignette || '').trim(),
      themeLines: parsed.themeLines || {},
    };
  };

  const { prose, log } = await generateLivingHereWithGrounding(blocks, settlements, llm);

  const evidence = {
    ranAt: new Date().toISOString(),
    model,
    address: 'Pentland, Cross Lane, Northallerton, DL6 3ND',
    vignette: prose?.vignette || '',
    themeLines: prose?.themeLines || {},
    groundingLog: log,
    allowlistNames: [...allow],
    poiNames: {
      foodDrink: blocks.foodDrink.map((p) => p.name),
      walksOutdoors: blocks.walksOutdoors.map((p) => p.name),
      everyday: blocks.everyday.map((p) => p.name),
    },
  };

  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + '\n', 'utf8');

  console.log('=== VIGNETTE ===');
  console.log(evidence.vignette || '(none — grounding dropped prose)');
  console.log('=== VALIDATOR LOG ===');
  console.log(JSON.stringify(log, null, 2));
  console.log('=== wrote', evidencePath);

  if (!prose?.vignette || !log.some((e) => e.decision === 'pass')) {
    process.exitCode = 1;
    console.error('Vignette smoke failed grounding — not committing as evidence.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
