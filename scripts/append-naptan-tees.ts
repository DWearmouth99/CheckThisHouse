/**
 * Append Stockton (077) + National Rail (910) NaPTAN stops so Yarm can enter nearest-2.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dest = path.join(root, 'src', 'data', 'naptan-stops.csv');

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') inQ = false;
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

function csvEscape(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function fetchArea(area: string): Promise<string[]> {
  const url = `https://naptan.api.dft.gov.uk/v1/access-nodes?dataFormat=csv&atcoAreaCodes=${area}`;
  console.log('[naptan-append] fetching', area);
  const res = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!res.ok) throw new Error(`NaPTAN ${area} HTTP ${res.status}`);
  const text = await res.text();
  const lines = text.split(/\r?\n/).filter(Boolean);
  const header = parseCsvLine(lines[0]!);
  const idx = (name: string) => header.findIndex((h) => h === name);
  const iAtco = idx('ATCOCode');
  const iName = idx('CommonName');
  const iType = idx('StopType');
  const iLat = idx('Latitude');
  const iLng = idx('Longitude');
  const iStatus = idx('Status');
  const iLoc = idx('LocalityName');
  const rows: string[] = [];
  for (const line of lines.slice(1)) {
    const cols = parseCsvLine(line);
    const status = (cols[iStatus] || '').toLowerCase();
    if (status && status !== 'active') continue;
    const stopType = cols[iType] || '';
    if (!/^(RLY|RSE|RPL|MET|BST|BCE|BCS|BCQ|BCT)$/i.test(stopType)) continue;
    const lat = Number(cols[iLat]);
    const lng = Number(cols[iLng]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const atco = cols[iAtco] || '';
    if (!atco) continue;
    rows.push(
      [
        csvEscape(atco),
        csvEscape(cols[iName] || ''),
        csvEscape(stopType),
        String(lat),
        String(lng),
        'active',
        csvEscape(cols[iLoc] || ''),
      ].join(',')
    );
  }
  console.log(`[naptan-append] area ${area}: ${rows.length} rows`);
  return rows;
}

async function main() {
  if (!fs.existsSync(dest)) {
    console.error('Missing', dest);
    process.exit(1);
  }
  const existing = fs.readFileSync(dest, 'utf8');
  const seen = new Set(
    existing
      .split(/\r?\n/)
      .slice(1)
      .map((l) => l.split(',')[0])
      .filter(Boolean)
  );
  const added: string[] = [];
  for (const area of ['077', '910']) {
    try {
      const rows = await fetchArea(area);
      for (const row of rows) {
        const atco = row.split(',')[0];
        if (!atco || seen.has(atco)) continue;
        seen.add(atco);
        added.push(row);
      }
    } catch (e) {
      console.warn('[naptan-append]', e instanceof Error ? e.message : e);
    }
  }
  if (!added.length) {
    console.log('[naptan-append] nothing new');
    return;
  }
  fs.appendFileSync(dest, '\n' + added.join('\n') + '\n', 'utf8');
  console.log(`[naptan-append] appended ${added.length} stops`);
  const yarm = added.filter((r) => /yarm/i.test(r));
  console.log('[naptan-append] Yarm hits:', yarm.slice(0, 5));
}

main();
