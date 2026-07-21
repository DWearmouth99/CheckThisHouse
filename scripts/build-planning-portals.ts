import { readFileSync, writeFileSync } from 'fs';

const raw = readFileSync('src/data/planning-portals.csv', 'utf8');
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

const map = new Map<string, (typeof rows)[0]>();
for (const r of rows) map.set(r.name.toLowerCase(), r);
const out = [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
writeFileSync('src/data/planning-portals.json', JSON.stringify(out, null, 2));
console.log('portals', out.length);
