// Dead-key scanner for zhDict in src/lib/i18n-zh.ts.
//
// A key is ALIVE when the component corpus references it in any of these
// encodings (keys are English source strings, so the corpus is the truth):
//   1. RAW  — the raw source bytes of the key appear in the corpus
//             (identical escaping context, e.g. both plain `"Foo"`).
//   2. VALUE — the parsed string value of the key equals the parsed value of
//             some string literal in the corpus. This is the encoding-proof
//             check: `"\"Foo\""` in the dict and `'"Foo"'` in a component
//             parse to the same string but share no bytes.
//   3. TEMPLATE — the key is composed at runtime inside t(`...`) template
//             literals (static chunks in order, every ${hole} fillable from
//             a string literal in the corpus), e.g. t(`${preset.label} settings`)
//             producing "Proof print settings".
// Keys that only match after quote/backslash normalization are reported as
// NEAR-MISS: their translation silently fails at runtime because the dict
// key bytes differ from the usage — align them, never delete them.
//
// Pure Node by design: the previous execSync+grep version passed patterns
// through the shell, and cmd.exe's OEM codepage mangled non-ASCII arguments
// on Windows, producing false "dead" keys. All searching happens in memory.
//
// Usage:
//   node scripts/dead-i18n-keys.cjs [out.json] [--remove]
//     out.json   write the dead-key list as JSON
//     --remove   additionally delete the dead entries from i18n-zh.ts
//                (near-miss keys are never removed)
const fs = require('fs');
const path = require('path');

const zhPath = path.join(__dirname, '..', 'src', 'lib', 'i18n-zh.ts');
const srcRoot = path.join(__dirname, '..', 'src');

// ---------------------------------------------------------------- dict keys
const zhSrc = fs.readFileSync(zhPath, 'utf8');
const entries = [];
for (const m of zhSrc.matchAll(/^  (["'])((?:[^\\]|\\.)*?)\1:/gm)) {
  entries.push({ raw: m[2], value: unescapeLiteral(m[2]) });
}
if (entries.length === 0) throw new Error('no keys parsed from ' + zhPath);

// ------------------------------------------------------------------- corpus
const corpusFiles = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (e.name !== '__tests__') walk(p); }
    else if (/\.(tsx?|html|css)$/.test(e.name)) corpusFiles.push(p);
  }
})(srcRoot);
const scanned = corpusFiles
  .map((f) => f.replace(/\\/g, '/'))
  .filter((f) => !f.includes('i18n-zh') && !f.includes('i18n.ts'))
  .map((f) => fs.readFileSync(f, 'utf8'));
const corpus = scanned.join('\n');

// Parsed values of every string literal in the corpus (single- and
// double-quoted, one line at most — enough for label/description data).
const literalValues = new Set();
for (const c of scanned) {
  for (const m of c.matchAll(/'((?:[^'\\\n]|\\.)*)'/g)) literalValues.add(unescapeLiteral(m[1]));
  for (const m of c.matchAll(/"((?:[^"\\\n]|\\.)*)"/g)) literalValues.add(unescapeLiteral(m[1]));
}

// Static chunk lists of every t(`...`) template call.
const templates = [];
for (const c of scanned) {
  for (const m of c.matchAll(/\bt\(\s*`([^`]*)`\s*\)/g)) {
    templates.push(m[1].split(/\$\{[^}]*\}/));
  }
}

// ------------------------------------------------------------------ helpers
function unescapeLiteral(s) {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && i + 1 < s.length) {
      const c = s[i + 1];
      if (c === 'n') { out += '\n'; i++; continue; }
      if (c === 't') { out += '\t'; i++; continue; }
      if (c === 'u') {
        const hex = s.slice(i + 2, i + 6);
        if (/^[0-9a-fA-F]{4}$/.test(hex)) { out += String.fromCharCode(parseInt(hex, 16)); i += 5; continue; }
      }
      out += c; i++; continue;
    }
    out += s[i];
  }
  return out;
}

const normalize = (s) =>
  s.replace(/[“”„]/g, '"').replace(/[‘’]/g, "'").replace(/\\/g, '');
const normalizedCorpus = normalize(corpus);

/** value starts with chunks[0], ends with chunks[last], holes are known literals */
function matchesTemplate(value) {
  for (const chunks of templates) {
    if (chunks.length < 2) continue;
    if (!value.startsWith(chunks[0]) || !value.endsWith(chunks[chunks.length - 1])) continue;
    let pos = chunks[0].length;
    const holes = [];
    let ok = true;
    for (let i = 1; i < chunks.length; i++) {
      const at = value.indexOf(chunks[i], pos);
      if (at < 0) { ok = false; break; }
      holes.push(value.slice(pos, at));
      pos = at + chunks[i].length;
    }
    if (ok && holes.every((h) => literalValues.has(h))) return chunks;
  }
  return null;
}

// ----------------------------------------------------------------- classify
const dead = [];
const nearMiss = [];
for (const e of entries) {
  if (corpus.includes(e.raw)) continue; // RAW
  if (literalValues.has(e.value)) continue; // VALUE
  if (matchesTemplate(e.value)) continue; // TEMPLATE
  if (normalizedCorpus.includes(normalize(e.value))) nearMiss.push(e); // NEAR-MISS
  else dead.push(e); // DEAD
}

console.log('files scanned:', scanned.length, '| dict keys:', entries.length);
console.log('dead:', dead.length, '| near-miss (align, keep):', nearMiss.length);
for (const e of nearMiss) console.log('  NEAR-MISS:', JSON.stringify(e.value.slice(0, 100)));
const out = process.argv[2] && process.argv[2] !== '--remove' ? process.argv[2] : null;
if (out) fs.writeFileSync(out, JSON.stringify(dead.map((e) => e.raw), null, 1));
if (process.argv.includes('--remove') && dead.length > 0) {
  const deadRaw = new Set(dead.map((e) => e.raw));
  const lines = zhSrc.split('\n');
  let removed = 0;
  const kept = lines.filter((l) => {
    const m = l.match(/^  (["'])((?:[^\\]|\\.)*?)\1:/);
    if (m && deadRaw.has(m[2])) { removed++; return false; }
    return true;
  });
  fs.writeFileSync(zhPath, kept.join('\n'));
  console.log('removed lines:', removed);
}
