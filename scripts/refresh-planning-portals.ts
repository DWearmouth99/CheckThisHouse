/**
 * Refresh the UK planning-portal directory from the community Idox list,
 * then merge Scottish / local overrides and rebuild JSON.
 *
 * Run: npm.cmd run planning:portals
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';

const REMOTE =
  'https://raw.githubusercontent.com/adrianshort/uk_planning_scraper/master/lib/uk_planning_scraper/authorities.csv';
const CSV_PATH = 'src/data/planning-portals.csv';
const JSON_PATH = 'src/data/planning-portals.json';
const OVERRIDES_PATH = 'src/data/planning-portal-overrides.csv';

function parseCsv(raw: string): { name: string; url: string; tags: string }[] {
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const rows: { name: string; url: string; tags: string }[] = [];
  for (const line of lines.slice(1)) {
    const first = line.indexOf(',');
    const last = line.lastIndexOf(',');
    if (first < 0) continue;
    const name = line.slice(0, first).trim();
    let url = '';
    let tags = '';
    if (last > first) {
      const maybeTags = line.slice(last + 1).trim();
      if (!/^https?:/i.test(maybeTags) && maybeTags.length < 120) {
        url = line.slice(first + 1, last).trim();
        tags = maybeTags;
      } else {
        url = line.slice(first + 1).trim();
      }
    } else {
      url = line.slice(first + 1).trim();
    }
    if (!name || !url || !/^https?:/i.test(url)) continue;
    rows.push({ name, url, tags });
  }
  return rows;
}

const remote = await (await fetch(REMOTE)).text();
const overrides = existsSync(OVERRIDES_PATH)
  ? parseCsv(readFileSync(OVERRIDES_PATH, 'utf8'))
  : [];
const base = parseCsv(remote);

const map = new Map<string, { name: string; url: string; tags: string }>();
for (const r of base) map.set(r.name.toLowerCase(), r);
for (const r of overrides) map.set(r.name.toLowerCase(), r); // overrides win

const out = [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
const csv =
  'authority_name,url,tags\n' +
  out.map((r) => `${r.name},${r.url},${r.tags || ''}`).join('\n') +
  '\n';

writeFileSync(CSV_PATH, csv);
writeFileSync(JSON_PATH, JSON.stringify(out, null, 2));
console.log(`Wrote ${out.length} portals → ${JSON_PATH}`);
