// One-shot: identify zhDict keys belonging to the pruned image-handoff
// certificate chain and verified unreferenced outside the i18n files.
const fs = require('fs');
const { execSync } = require('child_process');

const src = fs.readFileSync('src/lib/i18n-zh.ts', 'utf8');
const keys = [...src.matchAll(/^  "((?:[^"\\]|\\.)*)":/gm)].map(m => m[1]);
const markers = /Reseal|Closeout Certificate|Disposition Certificate|Destruction Log|Custody|Retention Schedule|Retrieval|Archive Manifest|Package Seal|Records Destruction|Remediation/i;
const candidates = keys.filter(k => markers.test(k));

const dead = [];
for (const k of candidates) {
  let hits = [];
  try {
    const out = execSync(`grep -rlF ${JSON.stringify(k)} src --include=*.ts --include=*.tsx`, { encoding: 'utf8' }).trim();
    hits = out.split('\n').filter(Boolean).filter(f => !f.includes('i18n-zh'));
  } catch { /* no hits at all */ }
  if (hits.length === 0) dead.push(k);
}
console.log('total keys:', keys.length, '| chain candidates:', candidates.length, '| verified dead:', dead.length);
fs.writeFileSync(process.argv[2] ?? '/tmp/dead-keys.json', JSON.stringify(dead, null, 1));
if (candidates.length !== dead.length) {
  const alive = candidates.filter(k => !dead.includes(k));
  console.log('STILL REFERENCED (kept):', JSON.stringify(alive));
}
if (process.argv[3] === '--remove') {
  const deadSet = new Set(dead);
  const lines = fs.readFileSync('src/lib/i18n-zh.ts', 'utf8').split('\n');
  let removed = 0;
  const kept = lines.filter(l => {
    const m = l.match(/^  "((?:[^"\\]|\\.)*)":/);
    if (m && deadSet.has(m[1])) { removed++; return false; }
    return true;
  });
  fs.writeFileSync('src/lib/i18n-zh.ts', kept.join('\n'));
  console.log('removed lines:', removed);
}

