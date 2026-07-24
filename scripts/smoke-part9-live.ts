/**
 * Part 9 live smoke: crime + EPC + finalize (Gemini) + PDF text extract.
 * Writes fixtures/evidence/part9-live-{json,txt,html}.
 *
 * Run: npx tsx scripts/smoke-part9-live.ts
 */
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { config } from 'dotenv';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { analyzeWithGemini, hasGeminiKey } from '../src/lib/geminiAnalyze';
import { lookupCrimeForAddress } from '../src/lib/policeUkLookup';
import { fetchEpcCertificatesForPostcode } from '../src/lib/epcLookup';
import { PDFReport } from '../src/components/PDFReport';
import { formatDataCoverageFooter } from '../src/lib/dataCoverage';
import type { PropertyAnalysis } from '../src/types';

config({ path: '.env.local' });
config();

const ADDRESS = 'Pentland, Cross Lane, Northallerton, DL6 3ND';
const OUT = path.join(process.cwd(), 'fixtures', 'evidence');

function renderPdfText(analysis: PropertyAnalysis): string {
  const html = renderToStaticMarkup(
    React.createElement(PDFReport, {
      analysis,
      buyerGoal: 'First-Time Buyer',
    })
  );
  return html
    .replace(/<[^>]+>/g, '\n')
    .replace(/&amp;/g, '&')
    .replace(/&middot;/g, '·')
    .replace(/\n+/g, '\n')
    .trim();
}

async function main() {
  mkdirSync(OUT, { recursive: true });

  console.log('[smoke] probing crime…');
  const t0 = Date.now();
  const crimeProbe = await lookupCrimeForAddress(ADDRESS);
  console.log('[smoke] crime ms=', Date.now() - t0, {
    reliable: crimeProbe.reliable,
    status: crimeProbe.status,
    rate: crimeProbe.incidentsPerThousand,
    count: crimeProbe.crimeCountYear,
    pop: crimeProbe.population,
    months: `${crimeProbe.monthStart}->${crimeProbe.monthEnd}`,
    label: crimeProbe.label,
    gate: crimeProbe.debug?.gate,
  });

  console.log('[smoke] probing EPC postcode batch…');
  const t1 = Date.now();
  const epcs = await fetchEpcCertificatesForPostcode('DL6 3ND');
  console.log('[smoke] epc ms=', Date.now() - t1, 'count=', epcs.length, {
    hasCreds: Boolean(process.env.EPC_API_EMAIL || process.env.EPC_EMAIL),
    sample: epcs.slice(0, 3).map((e) => ({
      address: e.address,
      rating: e.currentRating,
      area: e.floorAreaSqm,
      source: e.source,
    })),
  });

  if (!hasGeminiKey()) {
    console.error('GEMINI_API_KEY missing — writing probe-only evidence');
    writeFileSync(
      path.join(OUT, 'part9-live-probe.json'),
      JSON.stringify({ crimeProbe, epcCount: epcs.length, epcs: epcs.slice(0, 5) }, null, 2)
    );
    process.exit(1);
  }

  console.log('[smoke] full Gemini analyze…');
  const result = await analyzeWithGemini({
    scrap: {
      address: ADDRESS,
      bedrooms: '4',
      propertyType: 'Detached',
      // no price → recently_sold / Mode B when LR sale present
    },
    manualAddress: ADDRESS,
    buyerGoal: 'homebuyer primary residence',
  });

  const analysis = result.analysis as unknown as PropertyAnalysis;
  const pdfText = renderPdfText(analysis);
  const html = renderToStaticMarkup(
    React.createElement(PDFReport, {
      analysis,
      buyerGoal: 'First-Time Buyer',
    })
  );

  const coverage = (analysis as unknown as { dataCoverage?: unknown }).dataCoverage;
  const grounding = (analysis as unknown as { proseGroundingLog?: unknown }).proseGroundingLog;
  const footer = formatDataCoverageFooter(
    coverage as Parameters<typeof formatDataCoverageFooter>[0]
  );

  const class1 = [
    'Opening Offer',
    'Walk-away',
    'Asking Price',
    'Is the asking price fair',
    'Base asking',
  ].filter((s) =>
    s === 'Asking Price' ? /\bAsking Price\b/.test(pdfText) : new RegExp(s, 'i').test(pdfText)
  );

  const summary = {
    reportMode: (analysis as unknown as { reportMode?: string }).reportMode,
    dataCoverage: coverage,
    coverageFooter: footer,
    proseGroundingLog: grounding,
    crime: {
      reliable: (analysis as unknown as { verifiedCrime?: { reliable?: boolean } }).verifiedCrime
        ?.reliable,
      rate: (analysis as unknown as { verifiedCrime?: { incidentsPerThousand?: number } })
        .verifiedCrime?.incidentsPerThousand,
    },
    compsWithSqm: (
      ((analysis as unknown as { comparableSales?: { note?: string; floorAreaSqm?: string }[] })
        .comparableSales || [])
    ).filter(
      (c) =>
        Boolean(String(c.floorAreaSqm || '').trim()) ||
        /\d+\s*sqm/i.test(String(c.note || ''))
    ).length,
    class1HitsInPdf: class1,
    pdfHasDataSources: /Data sources:/i.test(pdfText),
    pdfExcerptCoverage: pdfText.match(/Data sources:[\s\S]{0,240}/i)?.[0] || null,
  };

  writeFileSync(path.join(OUT, 'part9-live-summary.json'), JSON.stringify(summary, null, 2));
  writeFileSync(path.join(OUT, 'part9-live-analysis.json'), JSON.stringify(analysis, null, 2));
  writeFileSync(path.join(OUT, 'part9-live.pdf.txt'), pdfText);
  writeFileSync(path.join(OUT, 'part9-live.pdf.html'), html);

  console.log('[smoke] summary\n', JSON.stringify(summary, null, 2));
  console.log('[smoke] wrote', OUT);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
