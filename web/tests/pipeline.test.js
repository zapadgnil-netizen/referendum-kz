const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../pipeline.js');
const data = require('../data.json');

const world = P.createWorld(data);
const START = data.meta.start;
const v0 = world.view(START, {});
const byName = (v, frag) => [...v.entities.values()].filter(e => e.name.includes(frag));
const one = (v, frag) => { const m = byName(v, frag); assert.equal(m.length, 1, `expected one entity matching ${frag}, got ${m.length}`); return m[0]; };
const rec = id => data.records.find(r => r.id === id);
const linkOf = (v, id) => v.links.get(id);

test('a record with a valid BIN links to that company with basis bin', () => {
  const r = data.records.find(x => x.source === 'procurement' && x.bin && x.bin === x.truth);
  const l = linkOf(v0, r.id);
  assert.equal(l.status, 'linked'); assert.equal(l.basis, 'bin'); assert.equal(l.entityBin, r.truth);
});

test('a mistyped BIN is ignored and the record still links by name', () => {
  const r = data.records.find(x => x.bin && !require('../engine.js').isValidBin(x.bin) && x.first_seen <= START);
  const l = linkOf(v0, r.id);
  assert.ok(l.reasons.includes('bin_invalid_ignored') || l.status !== 'linked');
  if (l.status === 'linked') { assert.equal(l.basis, 'name'); assert.equal(l.entityBin, r.truth); }
});

test('numbered sibling: a BIN-less "…Строй 2" record never lands on the other company', () => {
  const sib = one(v0, 'Алтын Дала Строй 2»').bin, main = one(v0, 'Алтын Дала Строй»').bin;
  const recs = data.records.filter(r => r.truth === sib && !r.bin && r.first_seen <= START);
  assert.ok(recs.length >= 1);
  for (const r of recs) { const l = linkOf(v0, r.id); assert.notEqual(l.entityBin, main); }
});

test('namesakes: a BIN-less record with the shared name goes to review as ambiguous', () => {
  const [a, b] = byName(v0, 'Нұр Строй');
  const r = data.records.find(x => !x.bin && x.name === 'ТОО «Нұр Строй»');
  const l = linkOf(v0, r.id);
  assert.equal(l.status, 'review'); assert.equal(l.kind, 'ambiguous');
  assert.deepEqual(new Set(l.candidates.map(c => c.bin)), new Set([a.bin, b.bin]));
});

test('legal-form twins: a record with no form marker is ambiguous between ТОО and АО', () => {
  const r = data.records.find(x => !x.bin && x.name === 'Қызыл Тау');
  assert.equal(linkOf(v0, r.id).status, 'review');
});

test('a renamed company keeps its old-name court cases through its alias history', () => {
  const e = one(v0, 'Тұран Дорстрой');
  assert.ok(e.aliases.some(a => a.includes('Бөген')));
  const old = data.records.filter(r => r.truth === e.bin && r.source === 'courts' && !r.bin);
  assert.ok(old.length >= 3);
  for (const r of old) { const l = linkOf(v0, r.id); assert.equal(l.entityBin, e.bin); assert.equal(l.basis, 'name'); }
});

test('the loan-word spelling is not linked automatically', () => {
  const r = data.records.find(x => !x.bin && x.name === 'Aq Orda Logistik LLP');
  assert.equal(linkOf(v0, r.id).status, 'review');
});

test('Altyn Dala Stroy: three confirmed indicators, one unconfirmed, score 70', () => {
  const e = one(v0, 'Алтын Дала Строй»');
  const confirmed = e.flags.filter(f => f.status === 'confirmed' && f.points > 0).map(f => f.id).sort();
  assert.deepEqual(confirmed, ['land_adjacent', 'ownership_change', 'tender_headcount']);
  assert.equal(e.flags.find(f => f.id === 'litigation').status, 'unconfirmed');
  assert.equal(e.score.total, 70); assert.equal(e.score.band, 'Elevated');
});

test('name-only evidence never adds points', () => {
  for (const e of v0.entities.values()) for (const f of e.flags) if (f.status === 'unconfirmed') assert.equal(f.points, 0);
});

test('other planted scenarios fire', () => {
  assert.ok(one(v0, 'Сары Арка Транс').flags.some(f => f.id === 'litigation' && f.status === 'confirmed'));
  assert.ok(one(v0, 'Ертіс Агро').flags.some(f => f.id === 'pep_link' && f.severity === 'high'));
  assert.ok(one(v0, 'Жайық Снаб').flags.some(f => f.id === 'young_large_award'));
  assert.ok(one(v0, 'Хан Тенгри Тур').flags.some(f => f.id === 'liquidation_activity'));
});

test('the large clean company scores zero', () => {
  const e = one(v0, 'Жетісу Энерго');
  assert.equal(e.score.total, 0); assert.equal(e.score.band, 'Low');
});

test('confirming the name-only court cases turns the litigation flag confirmed', () => {
  const e = one(v0, 'Алтын Дала Строй»');
  const decisions = {};
  for (const r of e.records.courts) if (r.link.basis === 'name') decisions[r.id] = { entity: e.bin };
  assert.ok(Object.keys(decisions).length >= 3);
  const v1 = world.view(START, decisions), e1 = v1.entities.get(e.bin);
  assert.equal(e1.flags.find(f => f.id === 'litigation').status, 'confirmed');
  assert.equal(e1.score.total, 95);
});

test('rejecting a link removes the record from the company and records the decision', () => {
  const e = one(v0, 'Алтын Дала Строй»'), c = e.records.courts[0];
  const v1 = world.view(START, { [c.id]: { entity: null } });
  assert.equal(v1.entities.get(e.bin).records.courts.some(r => r.id === c.id), false);
  assert.equal(v1.decided.length, 1);
});

test('review queue holds ambiguous, possible and name-only items, and nothing confirmed', () => {
  const kinds = new Set(v0.queue.map(q => q.kind));
  assert.ok(kinds.has('ambiguous') && kinds.has('name_only'));
  assert.ok(v0.queue.every(q => q.link.basis !== 'bin'));
});

test('the clock gates what exists: a future win appears only after its date', () => {
  const e = one(v0, 'Алтын Дала Строй»');
  const future = data.records.find(r => r.truth === e.bin && r.source === 'procurement' && r.first_seen > START);
  assert.equal(world.view(START, {}).entities.get(e.bin).records.procurement.some(r => r.id === future.id), false);
  assert.equal(world.view(future.first_seen, {}).entities.get(e.bin).records.procurement.some(r => r.id === future.id), true);
});

test('future registry changes become events only once their date has passed', () => {
  const e = one(v0, 'Сары Арка Транс');
  assert.equal(v0.entities.get(e.bin).events.some(x => x.type === 'owner'), false);
  const later = world.view('2026-10-22', {}).entities.get(e.bin);
  assert.ok(later.events.some(x => x.type === 'owner'));
});

test('court data goes stale and then refreshes', () => {
  assert.equal(v0.sources.find(s => s.id === 'courts').stale, true);
  assert.equal(world.view('2026-11-13', {}).sources.find(s => s.id === 'courts').stale, false);
});

test('ownership tree: chain up to an individual, and same-owner affiliates', () => {
  const e = one(v0, 'Алтын Дала Строй»');
  const o = world.ownership(v0, e.bin);
  assert.equal(o.up[o.up.length - 1].type, 'individual');
  assert.ok(o.up.length >= 2);
  const names = o.affiliates.map(a => a.name).join('|');
  assert.ok(names.includes('Алтын Дала Сервис') && names.includes('Сары Арка Транс'));
});

test('search: exact, partial, BIN, former name, namesakes, empty and invalid', () => {
  const s = q => world.search(v0, q);
  assert.equal(v0.entities.get(s('Altyn Dala Stroy LLP').results[0].bin).name, 'ТОО «Алтын Дала Строй»');
  assert.ok(s('altyn').results.length >= 3);
  assert.equal(s('Nur Stroy').results.length >= 2, true);
  const bin = one(v0, 'Жетісу Энерго').bin;
  assert.equal(s(bin).results[0].bin, bin);
  assert.equal(s(bin.slice(0, 6)).results.some(r => r.bin === bin), true);
  assert.ok(s('Bogen Dorstroy').results[0].why.includes('former name'));
  assert.ok(s('ТОО').note.length > 0 && s('').note.length > 0);
  assert.ok(s('123456789012').note.includes('not a valid BIN'));
});

test('compare summary has the headline numbers', () => {
  const e = one(v0, 'Алтын Дала Строй»'), s = world.summary(v0, e.bin);
  assert.equal(s.employees, 2); assert.ok(s.wins12 >= 10); assert.equal(s.score.total, 70);
});

test('matcher QA on the whole corpus: no false merges, high recall', () => {
  const q = world.qa();
  assert.equal(q.rows.wrong.length, 0, JSON.stringify(q.rows.wrong.map(x => [x.record.id, x.record.name])));
  assert.ok(q.precision >= 0.99); assert.ok(q.recall >= 0.9);
  assert.equal(q.byBasis.bin.bad, 0);
});

test('every view is deterministic', () => {
  const a = JSON.stringify([...world.view(START, {}).entities.values()].map(e => [e.bin, e.score]));
  const b = JSON.stringify([...P.createWorld(data).view(START, {}).entities.values()].map(e => [e.bin, e.score]));
  assert.equal(a, b);
});

// ---- threshold boundaries, on a tiny hand-built world ------------------------------------------
const E = require('../engine.js');
function mini({ employees = 2, wins = 0, winsOlderThanYear = 0, cases = 0, caseBin = true, registered = '2015-01-01' }) {
  const bin = (() => { for (let i = 0; ; i++) { const p = '991340' + String(10000 + i).padStart(5, '0'); const d = E.checkDigit(p); if (d !== null) return p + d; } })();
  const snap = { date: '2026-03-01', name: 'ТОО «Тест Дала»', status: 'active', employees, owner: { type: 'individual', label: 'x' }, region: 'District 1', address: 'x', board: [] };
  const records = [];
  for (let i = 0; i < wins; i++) records.push({ id: `T-${i}`, source: 'procurement', name: 'ТОО «Тест Дала»', bin, date: '2026-05-01', first_seen: '2026-05-03', amount_m: 10, customer: 'c', contract: `C-${i}`, truth: bin });
  for (let i = 0; i < winsOlderThanYear; i++) records.push({ id: `OLD-${i}`, source: 'procurement', name: 'ТОО «Тест Дала»', bin, date: '2025-01-01', first_seen: '2025-01-03', amount_m: 10, customer: 'c', contract: `C-OLD-${i}`, truth: bin });
  for (let i = 0; i < cases; i++) records.push({ id: `CASE-${i}`, source: 'courts', name: 'ТОО «Тест Дала»', bin: caseBin ? bin : null, date: '2026-04-01', first_seen: '2026-04-06', role: 'defendant', kind: 'x', amount_m: 1, court: 'c', truth: bin });
  const d = { meta: data.meta, sources: data.sources, officials: data.officials, registry: [{ bin, registered, snapshots: [snap] }], records };
  return P.createWorld(d).view('2026-10-06', {}).entities.get(bin);
}
const ids = e => e.flags.filter(f => f.points > 0 || f.status === 'unconfirmed').map(f => f.id + (f.status === 'unconfirmed' ? '?' : ''));

test('headcount flag: needs 10 wins in 12 months and at most 5 employees (exact boundaries)', () => {
  assert.deepEqual(ids(mini({ employees: 5, wins: 10 })), ['tender_headcount']);
  assert.deepEqual(ids(mini({ employees: 5, wins: 9 })), []);
  assert.deepEqual(ids(mini({ employees: 6, wins: 10 })), []);
  assert.deepEqual(ids(mini({ employees: 5, wins: 9, winsOlderThanYear: 5 })), []);  // wins outside the 12-month window do not count
});

test('litigation flag: needs 3 confirmed defendant cases in 12 months (exact boundary)', () => {
  assert.deepEqual(ids(mini({ cases: 3 })), ['litigation']);
  assert.deepEqual(ids(mini({ cases: 2 })), []);
});

test('litigation by name only is unconfirmed and worth zero points', () => {
  const e = mini({ cases: 3, caseBin: false });
  assert.deepEqual(ids(e), ['litigation?']); assert.equal(e.score.total, 0); assert.equal(e.score.pendingIfConfirmed, 25);
});

test('a company with no records is Low with no indicators', () => {
  const e = mini({}); assert.equal(e.score.total, 0); assert.deepEqual(ids(e), []);
});
