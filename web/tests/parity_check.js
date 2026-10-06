// Usage: node web/tests/parity_check.js corpus.json   (corpus written by tests/test_js_parity.py)
const fs = require('fs');
const E = require('../engine.js');
const c = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const bad = [];
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

for (const [input, want] of c.match_key) { const got = E.matchKey(input); if (got !== want) bad.push(['match_key', input, want, got]); }
for (const [input, want] of c.parse) {
  const p = E.parseCompanyName(input); const got = { form: p.form, core: p.core, key: p.key };
  if (!eq(got, want)) bad.push(['parse', input, want, got]);
}
for (const [input, want] of c.bins) {
  const got = { normalize: E.normalizeBin(input), valid: E.isValidBin(input), kind: E.classifyBin(input) };
  if (!eq(got, want)) bad.push(['bin', input, want, got]);
}
for (const [prefix, want] of c.check_digit) { const got = E.checkDigit(prefix); if (got !== want) bad.push(['check_digit', prefix, want, got]); }
for (const [a, b, want] of c.ratio) { const got = E.ratio(a, b); if (Math.abs(got - want) > 1e-12) bad.push(['ratio', a, b, want, got]); }
for (const [a, b, want] of c.score) {
  const r = E.score(a, b);
  if (r.decision !== want.decision || Math.abs(r.score - want.score) > 1e-12 || !eq(r.reasons, want.reasons)) bad.push(['score', a, b, want, r]);
}
const n = c.match_key.length + c.parse.length + c.bins.length + c.check_digit.length + c.ratio.length + c.score.length;
if (bad.length) { console.log(JSON.stringify(bad.slice(0, 8), null, 1)); console.error(`${bad.length} of ${n} cases differ`); process.exit(1); }
console.log(`parity ok: ${n} cases`);
