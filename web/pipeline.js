/* Ashyq Dala pipeline: resolves records to companies, derives risk flags, ownership, events and search.
 * Pure functions of (data, clock, analyst decisions). Uses Engine (engine.js) for every matching decision.
 * Thresholds and point weights are placeholders for this MVP, not calibrated values. */
(function (root) {
  'use strict';
  const Engine = (typeof require !== 'undefined') ? require('./engine.js') : root.Engine;

  // ---- dates ---------------------------------------------------------------------------------
  const DAY = 86400000;
  const toMs = iso => Date.parse(iso + 'T00:00:00Z');
  const addDays = (iso, n) => new Date(toMs(iso) + n * DAY).toISOString().slice(0, 10);
  const daysBetween = (a, b) => Math.round((toMs(b) - toMs(a)) / DAY);

  const STALE_AFTER_DAYS = 30;
  const WINDOW_DAYS = 365;
  const bandOf = total => (total >= 50 ? 'Elevated' : total >= 25 ? 'Moderate' : 'Low');
  const isConfirmed = link => link.basis === 'bin' || link.basis === 'analyst';

  function lastRefresh(source, clock) {
    const r = source.refresh;
    if (r.type === 'daily') return addDays(clock, -1);
    if (r.type === 'weekly') { const n = Math.floor(daysBetween(r.anchor, clock) / 7); return n < 0 ? r.anchor : addDays(r.anchor, n * 7); }
    const past = r.dates.filter(d => d <= clock);
    return past.length ? past[past.length - 1] : r.dates[0];
  }

  function createWorld(data) {
    const regByBin = new Map(data.registry.map(e => [e.bin, e]));
    const officials = new Map(data.officials.map(o => [o.id, o]));
    const linkCache = new Map();

    // ---- entities at a point in time -----------------------------------------------------------
    function entitiesAt(clock) {
      const out = new Map();
      for (const reg of data.registry) {
        const snaps = reg.snapshots.filter(s => s.date <= clock);
        if (!snaps.length) continue;
        const aliases = [...new Set(snaps.map(s => s.name))];
        out.set(reg.bin, { bin: reg.bin, registered: reg.registered, snaps, cur: snaps[snaps.length - 1], aliases });
      }
      return out;
    }

    // ---- linking -------------------------------------------------------------------------------
    function rawLinks(clock, entities) {
      if (linkCache.has(clock)) return linkCache.get(clock);
      const links = new Map();
      for (const r of data.records) {
        if (r.first_seen > clock) continue;
        links.set(r.id, linkRecord(r, entities));
      }
      linkCache.set(clock, links);
      return links;
    }

    function linkRecord(r, entities) {
      const rec = { name: r.name, bin: r.bin };
      const candidates = [];
      for (const en of entities.values()) {
        let best = null;
        for (const alias of en.aliases) {
          const res = Engine.score(rec, { name: alias, bin: en.bin });
          if (!best || res.score > best.score) best = res;
          if (res.reasons.includes('bin_exact')) break;
        }
        candidates.push({ bin: en.bin, score: best.score, decision: best.decision, reasons: best.reasons });
      }
      const byScore = (a, b) => b.score - a.score;
      const matches = candidates.filter(c => c.decision === 'match').sort(byScore);
      if (matches.length === 1) {
        const m = matches[0];
        return { recordId: r.id, status: 'linked', entityBin: m.bin, basis: m.reasons.includes('bin_exact') ? 'bin' : 'name',
                 score: m.score, reasons: m.reasons, candidates: matches };
      }
      if (matches.length > 1) return { recordId: r.id, status: 'review', kind: 'ambiguous', candidates: matches, reasons: [] };
      const reviews = candidates.filter(c => c.decision === 'review').sort(byScore);
      if (reviews.length) return { recordId: r.id, status: 'review', kind: reviews.length > 1 ? 'ambiguous' : 'possible', candidates: reviews, reasons: reviews[0].reasons };
      const invalid = rec.bin && !Engine.isValidBin(rec.bin);
      return { recordId: r.id, status: 'unlinked', candidates: [], reasons: invalid ? ['bin_invalid_ignored'] : [] };
    }

    function applyDecisions(links, decisions, entities) {
      const out = new Map();
      for (const [id, link] of links) {
        const d = decisions && decisions[id];
        if (!d) { out.set(id, link); continue; }
        if (d.entity === null) out.set(id, { ...link, status: 'rejected', decided: true, basis: null });
        else if (entities.has(d.entity)) out.set(id, { recordId: id, status: 'linked', entityBin: d.entity, basis: 'analyst', score: 1, reasons: ['analyst_confirmed'], candidates: link.candidates, decided: true });
        else out.set(id, link);
      }
      return out;
    }

    // ---- sources -------------------------------------------------------------------------------
    function sourcesAt(clock) {
      return data.sources.map(s => {
        const last = lastRefresh(s, clock), age = daysBetween(last, clock);
        return { id: s.id, label: s.label, lastRefreshed: last, ageDays: age, stale: age > STALE_AFTER_DAYS };
      });
    }

    // ---- owners / names ------------------------------------------------------------------------
    function nameOf(bin, entities) { const e = entities.get(bin); return e ? e.cur.name : regByBin.has(bin) ? '(not yet registered)' : bin; }
    function ownerLabel(owner, entities) { return owner.type === 'company' ? nameOf(owner.bin, entities) : owner.label; }
    const sameOwner = (a, b) => a.type === b.type && a.bin === b.bin;

    // ---- risk flags ----------------------------------------------------------------------------
    function flagsFor(en, recs, clock, sources, entities) {
      const flags = [], since = addDays(clock, -WINDOW_DAYS);
      const inWindow = r => r.date >= since && r.date <= clock;
      const wins = recs.procurement, cases = recs.courts, parcels = recs.cadastre;
      const confWins = wins.filter(r => isConfirmed(r.link)), nameWins = wins.filter(r => !isConfirmed(r.link));
      const w12 = confWins.filter(inWindow), n12 = nameWins.filter(inWindow);
      const emp = en.cur.employees;
      const total12 = w12.reduce((s, r) => s + r.amount_m, 0);

      if (emp <= 5 && w12.length >= 10) {
        flags.push({ id: 'tender_headcount', severity: 'high', status: 'confirmed', points: 30,
          title: 'Many tender wins, very few employees',
          text: `Won ${w12.length} confirmed state tenders worth ${total12.toLocaleString('en-US')} M KZT in the last 12 months, but the registry reports ${emp} employees.` + (n12.length ? ` ${n12.length} more wins match by name only and are not counted.` : ''),
          evidence: w12.map(r => r.id), checkNext: 'Ask who performs the work: subcontractors, or a different group company.',
          falsePositive: 'A new or asset-light firm can legitimately subcontract most of the work.' });
      } else if (emp <= 5 && w12.length + n12.length >= 10) {
        flags.push({ id: 'tender_headcount', severity: 'high', status: 'unconfirmed', points: 0, pointsIfConfirmed: 30,
          title: 'Possibly many tender wins, very few employees',
          text: `Only ${w12.length} wins are confirmed by BIN; ${n12.length} more match by name only. If they are the same company this would be ${w12.length + n12.length} wins against ${emp} employees.`,
          evidence: [...w12, ...n12].map(r => r.id), checkNext: 'Confirm the unconfirmed records in the review queue.', falsePositive: 'A same-named company would produce the same match.' });
      }

      const bigWins = confWins.filter(r => r.contract);
      for (const p of parcels.filter(p => isConfirmed(p.link) && p.near_contract && p.distance_m <= 500)) {
        const win = bigWins.find(w => w.contract === p.near_contract);
        if (!win) continue;
        flags.push({ id: 'land_adjacent', severity: 'medium', status: 'confirmed', points: 20,
          title: 'Owns land next to a project it was awarded',
          text: `Holds a ${p.area_ha} ha parcel ${p.distance_m} m from the site of contract ${p.near_contract} (${win.amount_m} M KZT, awarded ${win.date}).`,
          evidence: [p.id, win.id], checkNext: 'Check when the parcel was acquired relative to the tender notice.',
          falsePositive: 'Local contractors often hold land near where they work.' });
        break;
      }

      for (let i = 1; i < en.snaps.length; i++) {
        const prev = en.snaps[i - 1], s = en.snaps[i];
        if (sameOwner(prev.owner, s.owner)) continue;
        const after = confWins.filter(w => w.amount_m >= 100 && w.date >= s.date && daysBetween(s.date, w.date) <= 60).sort((a, b) => b.amount_m - a.amount_m)[0];
        if (!after) continue;
        flags.push({ id: 'ownership_change', severity: 'medium', status: 'confirmed', points: 20,
          title: 'Owner changed shortly before a large contract',
          text: `The registry owner changed from ${ownerLabel(prev.owner, entities)} to ${ownerLabel(s.owner, entities)} on ${s.date}, ${daysBetween(s.date, after.date)} days before the award of ${after.contract} (${after.amount_m} M KZT). The portal shows only the current owner; our archive holds both versions.`,
          evidence: [`snapshot ${prev.date}`, `snapshot ${s.date}`, after.id], checkNext: 'Find out why ownership moved and who benefits from the new structure.',
          falsePositive: 'Group restructurings are common and often unrelated to contracts.' });
        break;
      }

      const def12 = cases.filter(c => c.role === 'defendant' && inWindow(c));
      const confCases = def12.filter(c => isConfirmed(c.link)), nameCases = def12.filter(c => !isConfirmed(c.link));
      if (confCases.length >= 3) {
        flags.push({ id: 'litigation', severity: 'medium', status: 'confirmed', points: 25,
          title: 'Repeated litigation as defendant',
          text: `${confCases.length} confirmed court cases as defendant in the last 12 months` + (nameCases.length ? `, plus ${nameCases.length} that match by name only.` : '.'),
          evidence: confCases.map(c => c.id), checkNext: 'Read the case types: a pattern of payment disputes matters more than one-offs.',
          falsePositive: 'Large operators are sued more often simply because they have more counterparties.' });
      } else if (confCases.length + nameCases.length >= 3) {
        flags.push({ id: 'litigation', severity: 'medium', status: 'unconfirmed', points: 0, pointsIfConfirmed: 25,
          title: 'Possible repeated litigation',
          text: `${confCases.length + nameCases.length} court cases name a company spelled like this one, but ${nameCases.length} of them carry no BIN, so we cannot say they are the same company.`,
          evidence: [...confCases, ...nameCases].map(c => c.id), checkNext: 'Confirm the cases in the review queue. Until then they do not affect the score.',
          falsePositive: 'A same-named company would produce the same match.' });
      }

      for (const m of en.cur.board.filter(b => b.official_id)) {
        const o = officials.get(m.official_id);
        const customer = o.district > 0 ? `District ${o.district} administration (example)` : 'Regional roads department (example)';
        const linked = confWins.filter(w => w.customer === customer);
        if (linked.length) {
          flags.push({ id: 'pep_link', severity: 'high', status: 'confirmed', points: 30,
            title: 'Public official on the board and contracts from their area',
            text: `${o.label} (${o.role}) sits on the board, and the company won ${linked.length} contract${linked.length > 1 ? 's' : ''} from ${customer}.`,
            evidence: linked.map(r => r.id), checkNext: 'Check whether the official had any role in awarding those contracts.',
            falsePositive: 'Officials may sit on boards lawfully; the indicator is the overlap with awards from their own area. The PEP list in this demo is synthetic.' });
        } else {
          flags.push({ id: 'pep_link', severity: 'medium', status: 'confirmed', points: 10,
            title: 'Public official on the board', text: `${o.label} (${o.role}) sits on the board. No contracts from their area were found.`,
            evidence: [], checkNext: 'Check for dealings with their administration outside the data we hold.', falsePositive: 'The PEP list in this demo is synthetic.' });
        }
      }

      const regDate = en.registered;
      for (const w of confWins) {
        if (w.amount_m >= 500 && daysBetween(regDate, w.date) <= 365 && daysBetween(regDate, w.date) >= 0) {
          flags.push({ id: 'young_large_award', severity: 'medium', status: 'confirmed', points: 25,
            title: 'New company, very large award',
            text: `Registered ${regDate}, ${daysBetween(regDate, w.date)} days before winning ${w.contract} worth ${w.amount_m} M KZT.`,
            evidence: [w.id], checkNext: 'Look at who owns it and whether the company has any track record.',
            falsePositive: 'Special-purpose companies are often created for a single project.' });
          break;
        }
      }

      for (const s of en.snaps.filter(x => x.status !== 'active')) {
        const after = confWins.filter(w => w.date > s.date);
        if (s.status === 'liquidating' && after.length) {
          flags.push({ id: 'liquidation_activity', severity: 'high', status: 'confirmed', points: 25,
            title: 'Winning contracts while in liquidation',
            text: `Status changed to "liquidating" on ${s.date}, yet ${after.length} contract${after.length > 1 ? 's were' : ' was'} awarded afterwards.`,
            evidence: after.map(r => r.id), checkNext: 'Ask whether the contracts can be performed and who is responsible.', falsePositive: 'Liquidating companies sometimes complete existing obligations.' });
          break;
        }
        if (s.status === 'reorganizing') {
          flags.push({ id: 'reorganizing', severity: 'medium', status: 'confirmed', points: 10,
            title: 'Company is being reorganised', text: `Status changed to "reorganizing" on ${s.date}.`,
            evidence: [`snapshot ${s.date}`], checkNext: 'Check what the reorganisation means for existing contracts.', falsePositive: 'Reorganisation can be routine.' });
        }
      }

      const stale = sources.filter(s => s.stale);
      if (stale.length) {
        flags.push({ id: 'freshness', severity: 'info', status: 'confirmed', points: 0, title: 'Some data is out of date',
          text: stale.map(s => `${s.label} last refreshed ${s.ageDays} days ago`).join('; ') + '.',
          evidence: stale.map(s => s.id), checkNext: 'Treat anything from these sources as possibly changed.', falsePositive: '' });
      }
      const order = { high: 0, medium: 1, info: 2 };
      flags.sort((a, b) => (a.status === b.status ? 0 : a.status === 'confirmed' ? -1 : 1) || order[a.severity] - order[b.severity] || b.points - a.points);
      const total = Math.min(100, flags.filter(f => f.status === 'confirmed').reduce((s, f) => s + f.points, 0));
      const pending = flags.filter(f => f.status === 'unconfirmed').reduce((s, f) => s + (f.pointsIfConfirmed || 0), 0);
      return { flags, score: { total, band: bandOf(total), pendingIfConfirmed: pending, bandIfConfirmed: bandOf(Math.min(100, total + pending)) } };
    }

    // ---- events (what monitoring watches) ------------------------------------------------------
    function eventsFor(en, recs, entities) {
      const ev = [];
      const conf = l => (isConfirmed(l) ? 'confirmed' : 'possible');
      for (const r of recs.procurement) ev.push({ id: `win:${r.id}`, date: r.first_seen, type: 'win', confidence: conf(r.link), text: `Tender win: ${r.amount_m} M KZT, contract ${r.contract}, ${r.customer}.`, ref: r.id });
      for (const r of recs.courts) ev.push({ id: `case:${r.id}`, date: r.first_seen, type: 'case', confidence: conf(r.link), text: `Court case as ${r.role} (${r.kind}, ${r.amount_m} M KZT).`, ref: r.id });
      for (const r of recs.cadastre) ev.push({ id: `parcel:${r.id}`, date: r.first_seen, type: 'parcel', confidence: conf(r.link), text: `Land record: ${r.area_ha} ha${r.encumbrance ? ', ' + r.encumbrance : ''}.`, ref: r.id });
      for (let i = 1; i < en.snaps.length; i++) {
        const a = en.snaps[i - 1], b = en.snaps[i], d = b.date, base = { date: d, confidence: 'confirmed' };
        if (!sameOwner(a.owner, b.owner)) ev.push({ ...base, id: `owner:${d}`, type: 'owner', text: `Owner changed from ${ownerLabel(a.owner, entities)} to ${ownerLabel(b.owner, entities)}.` });
        if (a.status !== b.status) ev.push({ ...base, id: `status:${d}`, type: 'status', text: `Status changed from ${a.status} to ${b.status}.` });
        if (a.name !== b.name) ev.push({ ...base, id: `name:${d}`, type: 'name', text: `Renamed from ${a.name} to ${b.name}.` });
        if (a.employees !== b.employees) ev.push({ ...base, id: `staff:${d}`, type: 'staff', text: `Employees changed from ${a.employees} to ${b.employees}.` });
      }
      return ev.sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : x.id < y.id ? -1 : 1));
    }

    // ---- the view ------------------------------------------------------------------------------
    function view(clock, decisions) {
      const entities = entitiesAt(clock);
      const raw = rawLinks(clock, entities);
      const links = applyDecisions(raw, decisions || {}, entities);
      const sources = sourcesAt(clock);
      const recById = new Map(data.records.map(r => [r.id, r]));
      const byEntity = new Map([...entities.keys()].map(b => [b, { procurement: [], courts: [], cadastre: [] }]));
      for (const [id, link] of links) {
        if (link.status !== 'linked') continue;
        byEntity.get(link.entityBin)[recById.get(id).source].push({ ...recById.get(id), link });
      }
      const entityViews = new Map();
      for (const [bin, en] of entities) {
        const recs = byEntity.get(bin);
        for (const k of Object.keys(recs)) recs[k].sort((a, b) => (a.date < b.date ? 1 : -1));
        const { flags, score } = flagsFor(en, recs, clock, sources, entities);
        entityViews.set(bin, { bin, name: en.cur.name, registered: en.registered, cur: en.cur, snaps: en.snaps, aliases: en.aliases,
          records: recs, flags, score, events: eventsFor(en, recs, entities) });
      }
      const queue = [];
      for (const [id, link] of links) {
        const r = recById.get(id);
        if (link.status === 'review') queue.push({ record: r, link, kind: link.kind });
        else if (link.status === 'linked' && link.basis === 'name') queue.push({ record: r, link, kind: 'name_only' });
      }
      const decided = [...links.values()].filter(l => l.decided).map(l => ({ record: recById.get(l.recordId), link: l }));
      return { clock, entities: entityViews, links, queue, decided, sources, ownerLabel: o => ownerLabel(o, entities), nameOf: b => nameOf(b, entities) };
    }

    // ---- ownership -----------------------------------------------------------------------------
    function ownership(v, bin) {
      const e = v.entities.get(bin);
      const up = [], seen = new Set([bin]);
      let owner = e.cur.owner;
      while (owner && up.length < 5) {
        if (owner.type === 'individual') { up.push({ type: 'individual', label: owner.label }); break; }
        if (seen.has(owner.bin)) break;
        seen.add(owner.bin);
        const oe = v.entities.get(owner.bin);
        up.push({ type: 'company', bin: owner.bin, name: oe ? oe.name : owner.bin });
        owner = oe ? oe.cur.owner : null;
      }
      const children = b => [...v.entities.values()].filter(x => x.cur.owner.type === 'company' && x.cur.owner.bin === b).map(x => x.bin);
      const down = (b, depth, path) => children(b).filter(c => !path.has(c)).map(c => ({ bin: c, name: v.entities.get(c).name, children: depth < 2 ? down(c, depth + 1, new Set([...path, c])) : [] }));
      const parent = e.cur.owner.type === 'company' ? e.cur.owner.bin : null;
      const siblings = parent ? children(parent).filter(c => c !== bin).map(c => ({ bin: c, name: v.entities.get(c).name })) : [];
      return { up, subsidiaries: down(bin, 0, new Set([bin])), affiliates: siblings };
    }

    // ---- search --------------------------------------------------------------------------------
    function search(v, query) {
      const q = (query || '').trim();
      if (!q) return { results: [], note: 'Type a company name or a 12-digit BIN.' };
      const digits = q.replace(/[\s-]/g, '');
      if (/^[0-9]+$/.test(digits)) {
        if (digits.length < 4) return { results: [], note: 'Type at least 4 digits of a BIN.' };
        const hits = [...v.entities.values()].filter(e => e.bin.startsWith(digits));
        const exact = digits.length === 12;
        return { results: hits.map(e => ({ bin: e.bin, score: 100, why: exact ? 'BIN exact' : 'BIN starts with ' + digits })),
                 note: hits.length ? '' : (exact && Engine.isValidBin(digits) ? 'No company with this BIN is in the registry data.' : exact ? 'This is not a valid BIN: the check digit does not match.' : 'No BIN starts with these digits.') };
      }
      const core = Engine.parseCompanyName(q).core;
      const qKey = Engine.matchKey(core);
      if (!qKey) return { results: [], note: 'Type part of the company name, not only the legal form.' };
      const qTokens = qKey.split(' ');
      const results = [];
      for (const e of v.entities.values()) {
        let best = null;
        for (const alias of e.aliases) {
          const key = Engine.parseCompanyName(alias).key, tokens = key.split(' ');
          let score = 0, why = '';
          if (key === qKey) { score = 100; why = 'Same name'; }
          else if (qTokens.every(t => tokens.some(x => x.startsWith(t)))) { score = 80 + 10 * (qTokens.length / tokens.length); why = 'Name contains your words'; }
          else { const r = Engine.ratio(qKey, key); if (r >= 0.7) { score = r * 70; why = 'Similar spelling'; } }
          if (score && (!best || score > best.score)) best = { score, why: why + (alias !== e.cur.name ? ' (former name)' : '') };
        }
        if (best) results.push({ bin: e.bin, ...best });
      }
      results.sort((a, b) => b.score - a.score || v.entities.get(a.bin).name.localeCompare(v.entities.get(b.bin).name));
      return { results, note: results.length ? '' : 'No company matches. Try fewer words or a different spelling.' };
    }

    // ---- summary used by compare ---------------------------------------------------------------
    function summary(v, bin) {
      const e = v.entities.get(bin), since = addDays(v.clock, -WINDOW_DAYS);
      const conf = rs => rs.filter(r => isConfirmed(r.link));
      const w = conf(e.records.procurement).filter(r => r.date >= since);
      return { name: e.name, bin, status: e.cur.status, employees: e.cur.employees, registered: e.registered, region: e.cur.region,
        owner: v.ownerLabel(e.cur.owner), score: e.score, flags: e.flags.filter(f => f.status === 'confirmed' && f.severity !== 'info'),
        unconfirmed: e.flags.filter(f => f.status === 'unconfirmed'), wins12: w.length, winsTotal12: w.reduce((s, r) => s + r.amount_m, 0),
        cases12: conf(e.records.courts).filter(r => r.date >= since).length, parcels: conf(e.records.cadastre).length };
    }

    // ---- matcher quality against the hidden truth ----------------------------------------------
    function qa() {
      const clock = data.meta.end, entities = entitiesAt(clock), links = rawLinks(clock, entities);
      const rows = { correct: [], wrong: [], review: [], unlinked: [] };
      const byBasis = { bin: { ok: 0, bad: 0 }, name: { ok: 0, bad: 0 } };
      for (const r of data.records) {
        const link = links.get(r.id);
        if (!link) continue;
        if (link.status === 'linked') {
          const ok = link.entityBin === r.truth;
          (ok ? rows.correct : rows.wrong).push({ record: r, link });
          byBasis[link.basis][ok ? 'ok' : 'bad']++;
        } else if (link.status === 'review') rows.review.push({ record: r, link, truthInCandidates: link.candidates.some(c => c.bin === r.truth) });
        else rows.unlinked.push({ record: r, link });
      }
      const linked = rows.correct.length + rows.wrong.length, total = linked + rows.review.length + rows.unlinked.length;
      return { total, linked, precision: linked ? rows.correct.length / linked : 1, recall: total ? rows.correct.length / total : 1, rows, byBasis };
    }

    return { view, ownership, search, summary, qa, regByBin, officials, entitiesAt };
  }

  const Pipeline = { createWorld, addDays, daysBetween, isConfirmed, bandOf, STALE_AFTER_DAYS };
  if (typeof module !== 'undefined' && module.exports) module.exports = Pipeline; else root.Pipeline = Pipeline;
})(typeof self !== 'undefined' ? self : this);
