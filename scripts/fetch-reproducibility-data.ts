/**
 * Slim GIAS + NaPTAN extracts for reproducibility data.
 * Usage: npx tsx scripts/fetch-reproducibility-data.ts
 *
 * GIAS source: archived DfE JSON mirror (urn, name, phase, status, lat, lng).
 * Ofsted grade + inspection date: Ofsted MI "latest inspections" CSV
 * (modern Edubase bulk no longer ships OfstedRating / OfstedLastInsp).
 * NaPTAN: DfT open API by ATCO area code.
 *
 * Env: SKIP_NAPTAN=1 — refresh GIAS/Ofsted only.
 *      OFSTED_MI_CSV=/path — use a local MI file instead of downloading.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'src', 'data');

/** Pinned Ofsted MI asset — bump when refreshing reproducibility data. */
const OFSTED_MI_URL =
  'https://assets.publishing.service.gov.uk/media/6a54efeba6586e258d371d9c/Management_information_-_state-funded_schools_-_latest_inspections_as_at_30_June_2026.csv';

const OEIF_GRADE: Record<string, string> = {
  '1': 'Outstanding',
  '2': 'Good',
  '3': 'Requires improvement',
  '4': 'Inadequate',
};

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

function cleanCell(v: string | undefined): string {
  const s = String(v || '')
    .replace(/^"|"$/g, '')
    .trim();
  if (!s || /^null$/i.test(s)) return '';
  return s;
}

function putOfsted(
  map: Map<string, { grade: string; date: string; newerDate: string }>,
  urn: string,
  grade: string,
  date: string,
  newerDate = ''
): void {
  if (!urn) return;
  if (!grade && !date && !newerDate) return;
  const existing = map.get(urn);
  if (!existing) {
    map.set(urn, { grade, date, newerDate });
    return;
  }
  const next = {
    grade: grade || existing.grade,
    date: date || existing.date,
    newerDate: newerDate || existing.newerDate,
  };
  if ((grade && date) || newerDate) map.set(urn, next);
  else if (!existing.grade || !existing.date) map.set(urn, next);
}

/** Parse Ofsted MI / legacy edubase into URN → { grade, date, newerDate }. */
function loadOfstedByUrnFromText(
  text: string,
  label: string
): Map<string, { grade: string; date: string; newerDate: string }> {
  const map = new Map<string, { grade: string; date: string; newerDate: string }>();
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return map;
  const header = parseCsvLine(lines[0]!).map((h) => h.replace(/"/g, '').trim());
  const idx = (name: string) => header.findIndex((h) => h.toLowerCase() === name.toLowerCase());

  // Legacy edubase columns (removed from modern GIAS bulk)
  const iLegacyGrade = idx('OfstedRating (name)');
  const iLegacyDate = idx('OfstedLastInsp');
  if (iLegacyGrade >= 0 || iLegacyDate >= 0) {
    const iUrn = idx('URN');
    for (const line of lines.slice(1)) {
      const cols = parseCsvLine(line);
      putOfsted(
        map,
        cleanCell(cols[iUrn]),
        cleanCell(cols[iLegacyGrade]),
        cleanCell(cols[iLegacyDate])
      );
    }
    console.log(`[fetch] Ofsted map from ${label} (edubase columns): ${map.size} URNs`);
    return map;
  }

  // Ofsted MI "latest inspections"
  const iUrn = idx('URN');
  const iOeif = idx('Latest OEIF overall effectiveness');
  const iOeifDate = idx('Inspection start date of latest OEIF graded inspection');
  const iFullDate = idx('Inspection start date');
  const iUngraded = idx('Ungraded inspection overall outcome');
  const iUngradedDate = idx('Date of latest ungraded inspection');
  const iPredOeif = idx('URN at time of latest OEIF graded inspection');
  if (iUrn < 0) {
    console.warn(`[fetch] ${label}: no URN column — skipping`);
    return map;
  }

  const parseD = (raw: string): number => {
    const s = raw.trim();
    if (!s) return 0;
    const dmy = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (dmy) return new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1])).getTime();
    const t = Date.parse(s);
    return Number.isFinite(t) ? t : 0;
  };

  for (const line of lines.slice(1)) {
    const cols = parseCsvLine(line);
    const urn = cleanCell(cols[iUrn]);
    let grade = OEIF_GRADE[cleanCell(cols[iOeif])] || '';
    let date = cleanCell(cols[iOeifDate]);
    if (!grade) {
      const ungraded = cleanCell(cols[iUngraded]);
      const m = ungraded.match(
        /\b(outstanding|good|requires\s+improvement|inadequate)\b/i
      );
      if (m) {
        grade = m[1]!.replace(/\b\w/g, (c) => c.toUpperCase()).replace(
          /Requires Improvement/i,
          'Requires improvement'
        );
        date = date || cleanCell(cols[iUngradedDate]);
      }
    }
    const gradedTs = parseD(date);
    const candidates = [cleanCell(cols[iFullDate]), cleanCell(cols[iUngradedDate])].filter(Boolean);
    let newerDate = '';
    let newerTs = 0;
    for (const c of candidates) {
      const ts = parseD(c);
      if (!ts) continue;
      if (gradedTs && ts <= gradedTs) continue;
      if (ts > newerTs) {
        newerTs = ts;
        newerDate = c;
      }
    }
    putOfsted(map, urn, grade, date, newerDate);
    putOfsted(map, cleanCell(cols[iPredOeif]), grade, date, newerDate);
  }
  console.log(`[fetch] Ofsted map from ${label} (MI): ${map.size} URNs`);
  return map;
}

async function loadOfstedEnrichment(): Promise<
  Map<string, { grade: string; date: string; newerDate: string }>
> {
  const map = new Map<string, { grade: string; date: string; newerDate: string }>();

  const edubaseLocal = path.join(root, 'gias-probe.txt');
  if (fs.existsSync(edubaseLocal)) {
    const legacy = loadOfstedByUrnFromText(fs.readFileSync(edubaseLocal, 'utf8'), 'gias-probe.txt');
    for (const [k, v] of legacy) putOfsted(map, k, v.grade, v.date, v.newerDate);
  }

  const localMi =
    process.env.OFSTED_MI_CSV ||
    path.join(root, 'ofsted-mi-latest.csv');
  let miText = '';
  if (fs.existsSync(localMi)) {
    console.log('[fetch] using local Ofsted MI', localMi);
    miText = fs.readFileSync(localMi, 'utf8');
  } else {
    console.log('[fetch] Ofsted MI', OFSTED_MI_URL);
    const res = await fetch(OFSTED_MI_URL);
    if (!res.ok) throw new Error(`Ofsted MI HTTP ${res.status}`);
    miText = await res.text();
    fs.writeFileSync(localMi, miText, 'utf8');
  }
  const fromMi = loadOfstedByUrnFromText(miText, path.basename(localMi));
  for (const [k, v] of fromMi) putOfsted(map, k, v.grade, v.date, v.newerDate);

  return map;
}

async function fetchGias(): Promise<void> {
  // DfE digital JSON mirror for lat/lng; Ofsted MI for grade + inspection date.
  const url = 'https://dfe-digital.github.io/gias-data/schools.json';
  console.log('[fetch] GIAS JSON', url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GIAS HTTP ${res.status}`);
  const schools = (await res.json()) as {
    urn?: string | number;
    name?: string;
    phase_of_education?: string;
    status?: string;
    latitude?: number;
    longitude?: number;
    postcode?: string;
  }[];

  const ofstedByUrn = await loadOfstedEnrichment();

  const out: string[] = ['urn,name,phase,status,lat,lng,ofsted,ofstedDate,ofstedNewerDate,postcode'];
  let kept = 0;
  let withDate = 0;
  let withNewer = 0;
  for (const s of schools) {
    if (String(s.status || '') !== 'Open') continue;
    const phase = String(s.phase_of_education || '');
    if (!/primary|secondary|middle|all-through/i.test(phase)) continue;
    const lat = Number(s.latitude);
    const lng = Number(s.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const urn = String(s.urn || '');
    const enrich = ofstedByUrn.get(urn);
    if (enrich?.date) withDate++;
    if (enrich?.newerDate) withNewer++;
    out.push(
      [
        urn,
        csvEscape(String(s.name || '')),
        csvEscape(phase),
        'Open',
        lat.toFixed(6),
        lng.toFixed(6),
        csvEscape(enrich?.grade || ''),
        csvEscape(enrich?.date || ''),
        csvEscape(enrich?.newerDate || ''),
        csvEscape(String(s.postcode || '')),
      ].join(',')
    );
    kept++;
  }
  fs.mkdirSync(dataDir, { recursive: true });
  const dest = path.join(dataDir, 'gias-schools-open.csv');
  fs.writeFileSync(dest, out.join('\n') + '\n', 'utf8');
  console.log(
    `[fetch] wrote ${kept} open schools (${withDate} with ofstedDate, ${withNewer} with newer) → ${dest}`
  );
}

async function fetchNaptanAreas(): Promise<void> {
  // Broader coverage: Yorkshire + Tees + NE rail corridors + London sample for on-market fixtures
  const areas = ['320', '329', '450', '110', '250', '490', '940', '077', '910'];
  const out: string[] = ['atco,name,stopType,lat,lng,status,locality'];
  const seen = new Set<string>();
  for (const area of areas) {
    const url = `https://naptan.api.dft.gov.uk/v1/access-nodes?dataFormat=csv&atcoAreaCodes=${area}`;
    console.log('[fetch] NaPTAN', area);
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[fetch] NaPTAN ${area} HTTP ${res.status}`);
      continue;
    }
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
      if (!atco || seen.has(atco)) continue;
      // Prefer rail station access points + one bus stop class; drop duplicate rail entrances later in selector
      seen.add(atco);
      out.push(
        [
          atco,
          csvEscape(cols[iName] || ''),
          stopType,
          String(lat),
          String(lng),
          'active',
          csvEscape(cols[iLoc] || ''),
        ].join(',')
      );
    }
  }
  const dest = path.join(dataDir, 'naptan-stops.csv');
  fs.writeFileSync(dest, out.join('\n') + '\n', 'utf8');
  console.log(`[fetch] wrote ${seen.size} NaPTAN stops → ${dest}`);
}

async function main() {
  fs.mkdirSync(dataDir, { recursive: true });
  await fetchGias();
  if (process.env.SKIP_NAPTAN === '1') {
    console.log('[fetch] SKIP_NAPTAN=1 — leaving naptan-stops.csv unchanged');
  } else {
    await fetchNaptanAreas();
  }
  console.log('[fetch] done');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
