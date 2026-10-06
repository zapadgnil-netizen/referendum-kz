/* Ashyq Dala MVP front end. Everything runs in the browser on synthetic data; the matcher is Engine, the
 * linking/flags/search are Pipeline. State that matters (watchlist, analyst decisions, clock) is kept in
 * localStorage when available and in memory otherwise. */
(function () {
  'use strict';
  const DATA = JSON.parse(document.getElementById('data').textContent);
  const world = Pipeline.createWorld(DATA);
  const P = Pipeline, E = Engine;

  // ---- state ---------------------------------------------------------------------------------
  const KEY = 'ashyqdala.mvp.v1';
  const DEFAULTS = { watch: {}, read: {}, decisions: {}, clock: DATA.meta.start, recent: [], query: '',
    rules: { win: true, case: true, parcel: true, owner: true, status: true, name: true, staff: false } };
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
  const S = Object.assign({}, DEFAULTS, load());
  S.rules = Object.assign({}, DEFAULTS.rules, S.rules);
  if (!(S.clock >= DATA.meta.start && S.clock <= DATA.meta.end)) S.clock = DATA.meta.start;
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* storage may be unavailable */ } };
  const ui = { sort: {}, open: { tender_headcount: true }, assume: false, flash: null, keepFlash: false, filters: {}, copy: null, cmpOpen: false };

  let cache = null;
  function V() {
    const key = S.clock + '|' + JSON.stringify(S.decisions);
    if (!cache || cache.key !== key) cache = { key, v: world.view(S.clock, S.decisions) };
    return cache.v;
  }

  // ---- helpers -------------------------------------------------------------------------------
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = n => Number(n).toLocaleString('en-US');
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fdate = iso => { const [y, m, d] = iso.split('-').map(Number); return `${d} ${MONTHS[m - 1]} ${y}`; };
  const lbl = (cls, text) => `<span class="lbl ${cls}">${esc(text)}</span>`;
  const bandLbl = s => lbl(s.band === 'Elevated' ? 'red' : s.band === 'Moderate' ? 'orange' : 'green', s.band.toUpperCase());
  const sevLbl = s => s === 'high' ? lbl('red', 'HIGH') : s === 'medium' ? lbl('orange', 'MEDIUM') : lbl('grey', 'NOTICE');
  const basisLbl = l => l.basis === 'bin' ? lbl('green', 'BIN') : l.basis === 'analyst' ? lbl('navy', 'Analyst') : lbl('dash', 'Name only');
  const statusLbl = s => lbl(s === 'active' ? 'green' : s === 'liquidating' ? 'red' : 'orange', s);
  const link = (hash, text) => `<a href="#${hash}">${esc(text)}</a>`;
  const companyLink = (v, bin, tab) => { const e = v.entities.get(bin); return link('company.' + bin + (tab ? '.' + tab : ''), e ? e.name : bin); };
  const SOURCE = Object.fromEntries(DATA.sources.map(s => [s.id, s.label]));
  const EVENT_LABEL = { win: 'Tender win', case: 'Court case', parcel: 'Land record', owner: 'Owner change', status: 'Status change', name: 'Name change', staff: 'Staff change' };
  const RULE_LABEL = { win: 'Tender wins', case: 'Court cases', parcel: 'Land records', owner: 'Owner changes', status: 'Status changes', name: 'Name changes', staff: 'Staff changes' };

  function table(id, cols, rows, opts = {}) {
    const st = ui.sort[id] || opts.defaultSort || null;
    let data = rows.slice();
    if (st) {
      const c = cols.find(x => x.key === st.col);
      if (c && c.sort) data.sort((a, b) => {
        const x = c.sort(a), y = c.sort(b);
        const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
        return st.dir === 'desc' ? -r : r;
      });
    }
    const head = cols.map(c => {
      if (!c.sort) return `<th class="${c.cls || ''}">${c.label}</th>`;
      const on = st && st.col === c.key, arrow = on ? (st.dir === 'asc' ? ' ▲' : ' ▼') : '';
      return `<th class="${c.cls || ''}" aria-sort="${on ? (st.dir === 'asc' ? 'ascending' : 'descending') : 'none'}"><a href="#" data-act="sort" data-table="${id}" data-col="${c.key}" title="Sort by ${esc(c.label)}">${c.label}${arrow}</a></th>`;
    }).join('');
    const body = data.length ? data.map(r => `<tr${opts.rowClass ? ` class="${opts.rowClass(r)}"` : ''}>${cols.map(c => `<td class="${c.cls || ''}">${c.html(r)}</td>`).join('')}</tr>`).join('')
      : `<tr><td class="empty" colspan="${cols.length}">${opts.empty || 'Nothing to show.'}</td></tr>`;
    return `<div class="scroll"><table class="${opts.wide === false ? '' : 'wide'}"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
  }

  // ---- routing -------------------------------------------------------------------------------
  const route = () => { const p = (location.hash || '#home').slice(1).split('.'); return { page: p[0] || 'home', args: p.slice(1) }; };
  const go = (...parts) => { const h = parts.join('.'); if (location.hash === '#' + h) render(); else location.hash = h; };

  // ---- derived data --------------------------------------------------------------------------
  const entityList = v => [...v.entities.values()].sort((a, b) => a.name.localeCompare(b.name) || a.bin.localeCompare(b.bin));
  const district = e => e.cur.region;
  function alertsFor(v) {
    const out = [];
    for (const [bin, since] of Object.entries(S.watch)) {
      const e = v.entities.get(bin);
      if (!e) continue;
      for (const ev of e.events) if (ev.date > since && ev.date <= S.clock && S.rules[ev.type]) out.push({ ...ev, key: bin + ':' + ev.id, bin, company: e.name });
    }
    return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.key < b.key ? -1 : 1));
  }
  const unreadCount = v => alertsFor(v).filter(a => !S.read[a.key]).length;
  const watchBtn = (bin, small) => S.watch[bin]
    ? `<button type="button" class="btn" data-act="unwatch" data-bin="${bin}" title="Stop watching this company">${small ? 'Unwatch' : 'On watchlist ✓ (remove)'}</button>`
    : `<button type="button" class="btn" data-act="watch" data-bin="${bin}" title="Get alerts about this company">${small ? 'Watch' : 'Add to watchlist'}</button>`;

  function summaryText(v, e) {
    const conf = e.flags.filter(f => f.status === 'confirmed' && f.severity !== 'info'), unc = e.flags.filter(f => f.status === 'unconfirmed');
    const lines = [`${e.name} (BIN ${e.bin}): risk ${e.score.total}/100, ${e.score.band}. As of ${fdate(S.clock)}.`, ''];
    lines.push(conf.length ? 'Confirmed indicators:' : 'No confirmed indicators.');
    conf.forEach(f => lines.push(`- ${f.title}. ${f.text}`));
    if (unc.length) { lines.push('', 'Not confirmed (name match only, not counted):'); unc.forEach(f => lines.push(`- ${f.title}. ${f.text}`)); }
    const stale = v.sources.filter(s => s.stale);
    lines.push('', 'Coverage: registry, procurement, courts, land cadastre. PEP and sanctions lists are not connected.');
    if (stale.length) lines.push('Out of date: ' + stale.map(s => `${s.label} (${s.ageDays} days)`).join(', ') + '.');
    lines.push('', 'Demo data: every company, number and case is invented.');
    return lines.join('\n');
  }

  // ---- chrome --------------------------------------------------------------------------------
  function renderChrome(v, r) {
    const unread = unreadCount(v), queue = v.queue.length, watching = Object.keys(S.watch).length;
    const item = (page, label, extra) => `<li><a href="#${page}" ${r.page === page ? 'aria-current="page"' : ''}>${label}${extra || ''}</a></li>`;
    $('nav').innerHTML = `<h3>Search</h3><ul>${item('home', 'Home')}${item('search', 'Search results')}</ul>
      <h3>My work</h3><ul>${item('watchlist', 'Watchlist', watching ? ` (${watching})` : '') .replace('</a></li>', (unread ? ` <span class="new">${unread} new</span>` : '') + '</a></li>')}
      ${item('queue', 'Review queue', ` (${queue})`)}${item('compare', 'Compare')}</ul>
      <h3>Information</h3><ul>${item('qa', 'Matcher quality')}${item('help', 'Help and method')}</ul>
      <p class="side-note">Demo with invented data. Press <b>/</b> to search.</p>`;
    const courts = v.sources.find(s => s.id === 'courts');
    $('strip').innerHTML = `<span><b>Data as of ${fdate(S.clock)}</b> (demo clock)</span>
      ${courts.stale ? `<span>${lbl('orange', 'Court records ' + courts.ageDays + ' days old')}</span>` : ''}<span class="grow"></span>
      <span>Move the clock:</span>
      <button type="button" class="btn" data-act="clock" data-days="7"${S.clock >= DATA.meta.end ? ' disabled' : ''}>+1 week</button>
      <button type="button" class="btn" data-act="clock" data-days="30"${S.clock >= DATA.meta.end ? ' disabled' : ''}>+1 month</button>
      <button type="button" class="btn" data-act="clock" data-days="0"${S.clock === DATA.meta.start ? ' disabled' : ''}>Reset</button>`;
    const f = $('flash');
    f.hidden = !ui.flash; f.className = 'flash' + (ui.flash && ui.flash.warn ? ' warn' : ''); f.innerHTML = ui.flash ? ui.flash.html : '';
    $('foot').innerHTML = `Demo data: every company, BIN, amount, case and official is invented. Record linking is done by the same matcher the project tests; risk thresholds and weights are placeholders. Not legal or investment advice.
      <br>Registry data last refreshed ${fdate(v.sources.find(s => s.id === 'registry').lastRefreshed)}. <a href="#help">Help and method</a> | <a href="#qa">Matcher quality</a>`;
    const names = $('names');
    if (!names.dataset.clock || names.dataset.clock !== S.clock) {
      names.dataset.clock = S.clock;
      names.innerHTML = [...new Set(entityList(v).map(e => E.parseCompanyName(e.name).core))].map(n => `<option value="${esc(n)}"></option>`).join('');
    }
  }

  // ---- pages: home and search ----------------------------------------------------------------
  const binByFragment = (v, frag) => entityList(v).find(e => e.name.includes(frag))?.bin;

  function pageHome(v) {
    const top = entityList(v).filter(e => e.score.total > 0).sort((a, b) => b.score.total - a.score.total).slice(0, 6);
    const examples = [
      ['Altyn Dala Stroy', 'Many tender wins, two employees, land next to a project it won.'],
      ['Nur Stroy', 'Two different companies share this name. The matcher will not guess which one a record means.'],
      ['Bogen Dorstroy', 'A renamed company: the old name still finds it, and old court cases follow it.'],
      ['Aq Orda Logistik', 'A spelling the matcher is not sure about. It goes to a person instead of being merged.'],
      [binByFragment(v, 'Жетісу Энерго'), 'Search by BIN: a large company with a clean record.'],
    ];
    const watching = Object.keys(S.watch).length, unread = unreadCount(v);
    return `<div class="hero"><h1>Know who you are dealing with</h1>
        <p class="lead">Type a Kazakh company name or BIN. Ashyq Dala joins the registry, state procurement, court records and land cadastre, tells you what the records show, and says how sure it is.</p>
        <form id="homeform" class="row"><label for="hq"><b>Company name or BIN:</b></label>
          <input type="text" id="hq" list="names" value="${esc(S.query)}" spellcheck="false" autocomplete="off"><button class="btn go" type="submit">Search</button></form>
        ${S.recent.length ? `<div class="facts">Recent: ${S.recent.map(q => `<a href="#" data-act="example" data-q="${esc(q)}">${esc(q)}</a>`).join(' | ')}</div>` : ''}</div>
      <div class="grid2">
        <fieldset><legend>Try a search</legend><ul class="stack" style="list-style:none;padding:0">
          ${examples.map(([q, why]) => `<li><a href="#" data-act="example" data-q="${esc(q)}"><b>${esc(q)}</b></a><br><span class="muted">${esc(why)}</span></li>`).join('')}</ul></fieldset>
        <fieldset><legend>Highest risk right now</legend>${table('home-top', [
          { key: 'n', label: 'Company', html: e => companyLink(v, e.bin) }, { key: 's', label: 'Risk', cls: 'num', html: e => `${e.score.total} ${bandLbl(e.score)}` }], top, { wide: false })}</fieldset>
      </div>
      <div class="grid2">
        <fieldset><legend>Your work</legend><ul class="stack" style="padding-left:18px">
          <li><a href="#watchlist">Watchlist</a>: ${watching ? `${watching} compan${watching > 1 ? 'ies' : 'y'}, ${unread} new alert${unread === 1 ? '' : 's'}` : 'nothing watched yet. Open a report and choose Add to watchlist.'}</li>
          <li><a href="#queue">Review queue</a>: ${v.queue.length} record${v.queue.length === 1 ? '' : 's'} waiting for a person to decide.</li>
          <li><a href="#compare">Compare</a> two companies side by side.</li></ul></fieldset>
        <fieldset><legend>How it works</legend><ol class="steps">
          <li>Records arrive from four sources, spelled in Russian, Kazakh or Latin.</li>
          <li>The matcher links each record to a company. A valid BIN decides; otherwise it compares names and asks a person when unsure.</li>
          <li>Risk indicators are worked out from confirmed links only.</li>
          <li>Watch a company and the clock tells you when something new arrives.</li></ol></fieldset>
      </div>`;
  }

  function pageSearch(v) {
    const res = world.search(v, S.query);
    const keys = res.results.map(r => E.parseCompanyName(v.entities.get(r.bin).name).key);
    const namesakes = keys.length !== new Set(keys).size;
    const cols = [
      { key: 'n', label: 'Company', sort: r => v.entities.get(r.bin).name, html: r => `<b>${companyLink(v, r.bin)}</b>` },
      { key: 'b', label: 'BIN', html: r => `<span class="mono">${r.bin}</span>` },
      { key: 'd', label: 'District', sort: r => district(v.entities.get(r.bin)), html: r => esc(district(v.entities.get(r.bin))) },
      { key: 'w', label: 'Why it matched', sort: r => r.score, html: r => esc(r.why) },
      { key: 'r', label: 'Risk', cls: 'num', sort: r => v.entities.get(r.bin).score.total, html: r => { const e = v.entities.get(r.bin); return `${e.score.total} ${bandLbl(e.score)}`; } },
      { key: 'a', label: '', html: r => `${link('company.' + r.bin, 'Open report')} ${watchBtn(r.bin, true)}` },
    ];
    return `<div class="crumbs">You are here: <a href="#home">Home</a> &rsaquo; Search results</div>
      <h1>Search results${S.query ? ` for “${esc(S.query)}”` : ''}</h1>
      ${res.note ? `<div class="note">${esc(res.note)}</div>` : `<p>${res.results.length} compan${res.results.length === 1 ? 'y' : 'ies'} found. Click a column heading to sort.</p>`}
      ${namesakes ? `<div class="note"><b>Several companies share this name.</b> They are different legal entities with different BINs. Check the BIN before you rely on a report.</div>` : ''}
      ${res.results.length ? table('search', cols, res.results, { defaultSort: { col: 'w', dir: 'desc' } }) : ''}`;
  }

  // ---- company report ------------------------------------------------------------------------
  const TABS = [['summary', 'Summary'], ['risk', 'Risk indicators'], ['ownership', 'Ownership'], ['contracts', 'Contracts'],
    ['courts', 'Courts'], ['land', 'Land'], ['history', 'History'], ['records', 'Records'], ['sources', 'Sources']];

  function pageCompany(v, args) {
    const e = v.entities.get(args[0]), tab = TABS.some(t => t[0] === args[1]) ? args[1] : 'summary';
    if (!e) return `<h1>Company not found</h1><div class="note">No company with BIN ${esc(args[0] || '')} exists in the data at ${fdate(S.clock)}. It may not be registered yet at this date on the demo clock. <a href="#search">Back to search</a>.</div>`;
    const counts = { risk: e.flags.filter(f => f.severity !== 'info' || f.status === 'confirmed').length, contracts: e.records.procurement.length, courts: e.records.courts.length, land: e.records.cadastre.length };
    const tabs = TABS.map(([id, label]) => `<li><a href="#company.${e.bin}.${id}" ${id === tab ? 'aria-current="page"' : ''}>${label}${counts[id] !== undefined ? ` (${counts[id]})` : ''}</a></li>`).join('');
    const body = { summary: tabSummary, risk: tabRisk, ownership: tabOwnership, contracts: tabContracts, courts: tabCourts, land: tabLand, history: tabHistory, records: tabRecords, sources: tabSources }[tab](v, e);
    return `<div class="crumbs">You are here: <a href="#home">Home</a> &rsaquo; <a href="#search">Search results</a> &rsaquo; ${esc(e.name)}</div>
      <div class="stack"><h1>${esc(e.name)}</h1>
      <div class="facts">BIN <span class="mono">${e.bin}</span> | ${statusLbl(e.cur.status)} | ${esc(district(e))} | registered ${fdate(e.registered)} | data as of ${fdate(S.clock)}</div>
      <div class="row">${watchBtn(e.bin)} <button type="button" class="btn" data-act="copy" data-bin="${e.bin}">Copy summary</button> <a href="#compare.${e.bin}">Compare with another company</a></div>
      ${ui.copy === e.bin ? `<div><p class="facts">Select the text and copy it (Ctrl+C):</p><textarea class="copybox" id="copybox" readonly>${esc(summaryText(v, e))}</textarea></div>` : ''}</div>
      <ul class="tabs" role="navigation" aria-label="Report sections">${tabs}</ul><div class="tabbody">${body}</div>`;
  }

  function tabSummary(v, e) {
    const s = e.score, total = s.total + (ui.assume ? s.pendingIfConfirmed : 0), band = { total, band: P.bandOf(total) };
    const conf = e.flags.filter(f => f.status === 'confirmed' && f.points > 0), unc = e.flags.filter(f => f.status === 'unconfirmed');
    const rows = conf.map(f => `<tr><td>${esc(f.title)}</td><td class="num mono">+${f.points}</td></tr>`);
    if (ui.assume) unc.forEach(f => rows.push(`<tr><td>${esc(f.title)} <span class="muted">(assumed)</span></td><td class="num mono">+${f.pointsIfConfirmed}</td></tr>`));
    const lead = conf[0];
    const stale = v.sources.filter(x => x.stale);
    const own = v.ownerLabel(e.cur.owner);
    return `<p class="lead">${conf.length ? `<b>${conf.length} confirmed risk indicator${conf.length > 1 ? 's' : ''}</b>${unc.length ? ` and ${unc.length} that cannot be confirmed yet` : ''}. ${esc(lead.text)}` : `No risk indicators are confirmed.${unc.length ? ` ${unc.length} possible indicator${unc.length > 1 ? 's' : ''} rest on name matches only.` : ''}`}
        Details are on the ${link('company.' + e.bin + '.risk', 'Risk indicators')} tab.</p>
      <div class="grid2">
        <fieldset><legend>Company details</legend><table class="kv"><tbody>
          <tr><th>Name</th><td>${esc(e.name)}</td></tr><tr><th>BIN</th><td class="mono">${e.bin}</td></tr>
          <tr><th>Status</th><td>${statusLbl(e.cur.status)}</td></tr><tr><th>Owner</th><td>${esc(own)}</td></tr>
          <tr><th>Employees</th><td>${e.cur.employees}</td></tr><tr><th>Address</th><td>${esc(e.cur.address)}</td></tr>
          <tr><th>Also known as</th><td>${e.aliases.filter(a => a !== e.name).map(esc).join('<br>') || '<span class="muted">none</span>'}</td></tr></tbody></table></fieldset>
        <fieldset><legend>Risk rating</legend><div class="stack">
          <div class="row"><span class="big">${total}</span><span class="muted">out of 100</span>${bandLbl(band)}</div>
          <div><div class="bar" role="img" aria-label="Score ${total} of 100"><div class="p" style="width:${ui.assume ? total : 0}%"></div><div class="f" style="width:${s.total}%"></div></div>
            <div class="scale" aria-hidden="true"><span style="left:0">0</span><span style="left:25%">25</span><span style="left:50%">50</span><span style="left:100%">100</span></div></div>
          <div class="scroll"><table><thead><tr><th>Counted indicator</th><th class="num">Points</th></tr></thead><tbody>${rows.join('') || '<tr><td class="empty" colspan="2">None counted.</td></tr>'}</tbody></table></div>
          ${s.pendingIfConfirmed ? `<label><input type="checkbox" data-act="assume" ${ui.assume ? 'checked' : ''}> Assume the unconfirmed evidence is confirmed (shows what a BIN match would add: ${s.total} to ${Math.min(100, s.total + s.pendingIfConfirmed)})</label>` : ''}
          <div class="facts">Weights are placeholders for this demo.</div></div></fieldset>
      </div>
      ${unc.length ? `<div class="note"><b>${unc.length} item${unc.length > 1 ? 's need' : ' needs'} a person:</b> the evidence has no BIN. Decide in the <a href="#queue" data-act="open-queue" data-k="risk">review queue</a>.</div>` : ''}
      <div class="note"><b>Coverage:</b> registry, procurement, courts and land cadastre were checked. PEP and sanctions lists are not connected.${stale.length ? ' ' + stale.map(x => `${esc(x.label)} are ${x.ageDays} days old.`).join(' ') : ''} A low score does not mean a company is clean.</div>
      <fieldset><legend>Latest activity</legend>${table('recent-' + e.bin, [
        { key: 'd', label: 'Seen', html: x => fdate(x.date) }, { key: 't', label: 'Type', html: x => esc(EVENT_LABEL[x.type]) },
        { key: 'x', label: 'What happened', html: x => esc(x.text) }, { key: 'c', label: 'Basis', html: x => x.confidence === 'confirmed' ? lbl('green', 'Confirmed') : lbl('dash', 'Possible') }],
        e.events.slice(0, 5), { empty: 'No activity recorded yet.' })}</fieldset>`;
  }

  function tabRisk(v, e) {
    const flags = e.flags;
    const rows = flags.map(f => {
      const open = !!ui.open[f.id + ':' + e.bin];
      const pts = f.status === 'unconfirmed' ? `0 <span class="muted">(+${f.pointsIfConfirmed})</span>` : f.severity === 'info' ? '' : `+${f.points}`;
      return `<tr><td>${sevLbl(f.severity)}</td><td><b>${esc(f.title)}</b><br>${esc(f.text)}</td>
        <td>${f.severity === 'info' ? '' : f.status === 'confirmed' ? lbl('green', 'Confirmed') : lbl('dash', 'Unconfirmed')}</td><td class="num mono">${pts}</td>
        <td><button type="button" class="linkbtn" data-act="flag" data-id="${f.id}:${e.bin}" aria-expanded="${open}">${open ? 'Hide details' : 'Show details'}</button></td></tr>
        ${open ? `<tr class="detail"><td></td><td colspan="4"><dl><dt>Evidence</dt><dd class="mono">${f.evidence.map(esc).join(', ') || 'none'}</dd>
          <dt>Check next</dt><dd>${esc(f.checkNext)}</dd>${f.falsePositive ? `<dt>False alarm if</dt><dd>${esc(f.falsePositive)}</dd>` : ''}</dl></td></tr>` : ''}`;
    }).join('');
    return `<p class="lead">These describe what the records show. They are not findings of wrongdoing. ${lbl('dash', 'Unconfirmed')} indicators rest on a name match only and add nothing to the score until a person or a BIN confirms them.</p>
      <div class="scroll"><table class="wide"><thead><tr><th>Level</th><th>Indicator</th><th>Basis</th><th class="num">Points</th><th></th></tr></thead>
      <tbody>${rows || '<tr><td class="empty" colspan="5">No indicators. This is not the same as a clean bill: see Sources for coverage.</td></tr>'}</tbody></table></div>`;
  }

  function tabOwnership(v, e) {
    const o = world.ownership(v, e.bin);
    const chain = o.up.slice().reverse();  // top-most owner first
    const who = it => (it.type === 'individual' ? esc(it.label) : companyLink(v, it.bin));
    const downTree = ch => (ch.length ? `<ul>${ch.map(c => `<li>${companyLink(v, c.bin)}${downTree(c.children)}</li>`).join('')}</ul>` : '');
    const upTree = (i, inner) => (i >= chain.length ? inner : `<ul><li>${who(chain[i])}${upTree(i + 1, inner)}</li></ul>`);
    const tree = upTree(0, `<ul><li><b>${esc(e.name)}</b>${downTree(o.subsidiaries)}</li></ul>`).replace('<ul>', '<ul class="tree">');
    const aff = o.affiliates.map(a => ({ ...a, e: v.entities.get(a.bin) }));
    const board = e.cur.board.map(m => {
      if (!m.official_id) return `<li>${esc(m.role)}: individual, name not shown</li>`;
      const off = world.officials.get(m.official_id);
      return `<li>${esc(m.role)}: <b>${esc(off.label)}</b>, ${esc(off.role)} ${lbl('orange', 'public official')}</li>`;
    }).join('');
    return `<p class="lead">Ownership comes from the registry. Individuals are shown only as roles. A public official appears by role and only because they hold a public post.</p>
      <div class="grid2"><fieldset><legend>Ownership structure</legend>${tree}</fieldset>
      <fieldset><legend>Board and management</legend><ul style="padding-left:18px">${board}</ul><p class="facts" style="margin-top:6px">The public-official list in this demo is synthetic.</p></fieldset></div>
      <fieldset><legend>Companies with the same owner</legend>${table('aff-' + e.bin, [
        { key: 'n', label: 'Company', sort: a => a.name, html: a => companyLink(v, a.bin) },
        { key: 'b', label: 'BIN', html: a => `<span class="mono">${a.bin}</span>` },
        { key: 'r', label: 'Risk', cls: 'num', sort: a => a.e.score.total, html: a => `${a.e.score.total} ${bandLbl(a.e.score)}` },
        { key: 'c', label: '', html: a => link('compare.' + e.bin + '.' + a.bin, 'Compare') }], aff, { empty: 'No other company has the same owner.', wide: false })}</fieldset>`;
  }

  const linkCell = r => `${basisLbl(r.link)}${r.link.basis === 'name' ? ` <span class="muted">${r.link.score.toFixed(2)}</span>` : ''}`;
  const within12 = r => r.date >= P.addDays(S.clock, -365);

  function tabContracts(v, e) {
    const f = ui.filters['c' + e.bin] || 'all', all = e.records.procurement;
    const rows = all.filter(r => f === 'all' || (f === 'confirmed' && P.isConfirmed(r.link)) || (f === 'year' && within12(r)));
    const conf = all.filter(r => P.isConfirmed(r.link) && within12(r));
    const pipes = [['all', 'All'], ['confirmed', 'Confirmed only'], ['year', 'Last 12 months']].map(([k, t]) => k === f ? `<b>${t}</b>` : `<a href="#" data-act="filter" data-scope="c${e.bin}" data-k="${k}">${t}</a>`).join('');
    return `<p class="lead">State tenders won. Only confirmed links count towards risk indicators. In the last 12 months: <b>${conf.length}</b> confirmed wins worth <b>${num(conf.reduce((s, r) => s + r.amount_m, 0))} M KZT</b>${all.length - all.filter(r => P.isConfirmed(r.link)).length ? `, plus ${all.filter(r => !P.isConfirmed(r.link)).length} by name only` : ''}.</p>
      <div class="row"><span>Show:</span><div class="pipes">${pipes}</div></div>
      ${table('contracts-' + e.bin, [
        { key: 'd', label: 'Awarded', sort: r => r.date, html: r => fdate(r.date) }, { key: 'c', label: 'Contract', sort: r => r.contract, html: r => `<span class="mono">${esc(r.contract)}</span>` },
        { key: 'u', label: 'Customer', sort: r => r.customer, html: r => esc(r.customer) }, { key: 'a', label: 'M KZT', cls: 'num', sort: r => r.amount_m, html: r => num(r.amount_m) },
        { key: 'n', label: 'Name as written', sort: r => r.name, html: r => esc(r.name) }, { key: 'l', label: 'Link', html: linkCell }], rows,
        { defaultSort: { col: 'd', dir: 'desc' }, empty: 'No tenders linked to this company.' })}`;
  }

  function tabCourts(v, e) {
    const cs = v.sources.find(s => s.id === 'courts');
    return `<p class="lead">Court records usually carry no BIN, so many links here are by name only. ${cs.stale ? `<b>Court data is ${cs.ageDays} days old, so recent cases may be missing.</b>` : `Court data was refreshed ${fdate(cs.lastRefreshed)}.`}</p>
      ${table('courts-' + e.bin, [
        { key: 'd', label: 'Filed', sort: r => r.date, html: r => fdate(r.date) }, { key: 'r', label: 'Role', sort: r => r.role, html: r => esc(r.role) },
        { key: 'k', label: 'Type', sort: r => r.kind, html: r => esc(r.kind) }, { key: 'a', label: 'M KZT', cls: 'num', sort: r => r.amount_m, html: r => num(r.amount_m) },
        { key: 'n', label: 'Name as written', sort: r => r.name, html: r => esc(r.name) }, { key: 'l', label: 'Link', html: linkCell }], e.records.courts,
        { defaultSort: { col: 'd', dir: 'desc' }, empty: 'No court cases linked to this company.' })}`;
  }

  function tabLand(v, e) {
    return `<p class="lead">Land parcels from the cadastre. Distance to a project site is shown where the parcel was recorded near a contract.</p>
      ${table('land-' + e.bin, [
        { key: 'd', label: 'Acquired', sort: r => r.date, html: r => fdate(r.date) }, { key: 'c', label: 'Cadastral no.', html: r => `<span class="mono">${esc(r.cadastral)}</span>` },
        { key: 'a', label: 'Area (ha)', cls: 'num', sort: r => r.area_ha, html: r => r.area_ha }, { key: 'e', label: 'Encumbrance', html: r => esc(r.encumbrance || 'none') },
        { key: 'x', label: 'Near contract', html: r => r.near_contract ? `<span class="mono">${esc(r.near_contract)}</span> (${r.distance_m} m)` : '' },
        { key: 'n', label: 'Name as written', html: r => esc(r.name) }, { key: 'l', label: 'Link', html: linkCell }], e.records.cadastre,
        { defaultSort: { col: 'd', dir: 'desc' }, empty: 'No land parcels linked to this company.' })}`;
  }

  function tabHistory(v, e) {
    const snaps = e.snaps, own = s => v.ownerLabel(s.owner);
    const rows = snaps.map((s, i) => {
      const p = snaps[i - 1], d = (a, b) => (p && a !== b ? ' diff' : '');
      return `<tr><td>${fdate(s.date)}</td><td class="${d(s.name, p?.name).trim()}">${esc(s.name)}</td><td class="${d(s.status, p?.status).trim()}">${esc(s.status)}</td>
        <td class="num ${d(s.employees, p?.employees).trim()}">${s.employees}</td><td class="${p && own(s) !== own(p) ? 'diff' : ''}">${esc(own(s))}</td>
        <td class="${p && JSON.stringify(s.board) !== JSON.stringify(p.board) ? 'diff' : ''}">${s.board.length} member${s.board.length > 1 ? 's' : ''}</td></tr>`;
    }).reverse().join('');
    return `<p class="lead">Government sites edit records in place. We keep every version we fetch, so a change stays visible after the source overwrites it. Highlighted cells changed since the previous version.</p>
      <div class="scroll"><table class="wide"><thead><tr><th>Version fetched</th><th>Name</th><th>Status</th><th class="num">Employees</th><th>Owner</th><th>Board</th></tr></thead><tbody>${rows}</tbody></table></div>
      <fieldset><legend>Everything that changed or arrived</legend>${table('events-' + e.bin, [
        { key: 'd', label: 'Seen', sort: x => x.date, html: x => fdate(x.date) }, { key: 't', label: 'Type', sort: x => x.type, html: x => esc(EVENT_LABEL[x.type]) },
        { key: 'x', label: 'What happened', html: x => esc(x.text) }, { key: 'c', label: 'Basis', html: x => x.confidence === 'confirmed' ? lbl('green', 'Confirmed') : lbl('dash', 'Possible') }],
        e.events, { defaultSort: { col: 'd', dir: 'desc' }, empty: 'Nothing recorded.' })}</fieldset>`;
  }

  function tabRecords(v, e) {
    const all = [...e.records.procurement, ...e.records.courts, ...e.records.cadastre].map(r => ({ ...r }));
    const variants = new Map();
    for (const a of e.aliases) variants.set(a, { n: 0, src: new Set(['registry']) });
    for (const r of all) { const x = variants.get(r.name) || { n: 0, src: new Set() }; x.n++; x.src.add(SOURCE[r.source]); variants.set(r.name, x); }
    const vrows = [...variants.entries()].map(([name, x]) => ({ name, n: x.n, src: [...x.src].join(', '), key: E.parseCompanyName(name).key }));
    return `<p class="lead">Every record linked to this company, and every spelling it was found under. Different scripts and legal-form markers reach the same company through the matcher's spelling key.</p>
      <fieldset><legend>Spellings seen (${vrows.length})</legend>${table('variants-' + e.bin, [
        { key: 'n', label: 'As written', sort: r => r.name, html: r => esc(r.name) }, { key: 'k', label: 'Matching key', html: r => `<span class="mono">${esc(r.key)}</span>` },
        { key: 'c', label: 'Records', cls: 'num', sort: r => r.n, html: r => r.n }, { key: 's', label: 'Sources', html: r => esc(r.src) }], vrows, { wide: false })}</fieldset>
      <fieldset><legend>All linked records (${all.length})</legend>${table('allrec-' + e.bin, [
        { key: 's', label: 'Source', sort: r => r.source, html: r => esc(SOURCE[r.source]) }, { key: 'i', label: 'ID', sort: r => r.id, html: r => `<span class="mono">${r.id}</span>` },
        { key: 'd', label: 'Date', sort: r => r.date, html: r => fdate(r.date) }, { key: 'n', label: 'Name as written', sort: r => r.name, html: r => esc(r.name) },
        { key: 'b', label: 'BIN on record', html: r => r.bin ? `<span class="mono">${r.bin}</span>${E.isValidBin(r.bin) ? '' : ' ' + lbl('red', 'invalid')}` : '<span class="muted">none</span>' },
        { key: 'l', label: 'Link', html: linkCell }, { key: 'w', label: 'Why', html: r => `<span class="mono muted">${r.link.reasons.map(esc).join(', ')}</span>` }], all,
        { defaultSort: { col: 'd', dir: 'desc' } })}</fieldset>`;
  }

  function tabSources(v, e) {
    const per = s => e.records[s === 'procurement' ? 'procurement' : s === 'courts' ? 'courts' : s === 'cadastre' ? 'cadastre' : 'none']?.length;
    const rows = v.sources.map(s => ({ ...s, n: s.id === 'registry' ? e.snaps.length : per(s.id) }));
    return `<p class="lead">Every fact carries the date it was fetched. Anything older than ${P.STALE_AFTER_DAYS} days is marked out of date. When a source is stale, an absence of records means little.</p>
      ${table('src-' + e.bin, [
        { key: 's', label: 'Source', html: r => esc(r.label) }, { key: 'l', label: 'Last refreshed', html: r => fdate(r.lastRefreshed) },
        { key: 'a', label: 'Age (days)', cls: 'num', html: r => r.ageDays }, { key: 'n', label: 'Items for this company', cls: 'num', html: r => r.n },
        { key: 't', label: 'Status', html: r => r.stale ? lbl('orange', 'Out of date') : lbl('green', 'Current') }], rows, { wide: false })}
      <div class="note">PEP and sanctions lists are not connected: they need a licensed dataset. The public-official list used for the board indicator is synthetic.</div>`;
  }

  // ---- watchlist -----------------------------------------------------------------------------
  function pageWatchlist(v) {
    const watched = Object.entries(S.watch).map(([bin, since]) => ({ bin, since, e: v.entities.get(bin) })).filter(x => x.e);
    const alerts = alertsFor(v), unread = alerts.filter(a => !S.read[a.key]);
    const newBy = bin => unread.filter(a => a.bin === bin).length;
    return `<div class="crumbs">You are here: <a href="#home">Home</a> &rsaquo; Watchlist</div><h1>Watchlist</h1>
      <p class="lead">Watch a company and you are told when something new arrives about it: a tender win, a court case, a new land record, a change of owner, status or name. Alerts only cover what happens after you start watching. This demo runs on a clock: use <b>+1 week</b> or <b>+1 month</b> at the top of the page to let new data arrive.</p>
      ${watched.length ? '' : `<div class="note">You are not watching any company yet. Open a company report and choose <b>Add to watchlist</b>, or <button type="button" class="linkbtn" data-act="watch-examples">add three example companies</button>.</div>`}
      <fieldset><legend>Alerts (${unread.length} new, ${alerts.length} in total)</legend>
        <div class="row" style="margin-bottom:6px"><button type="button" class="btn" data-act="readall"${unread.length ? '' : ' disabled'}>Mark all read</button>
        <span class="facts">Alerts about records matched by name only are marked Possible. They are not confirmed.</span></div>
        ${table('alerts', [
          { key: 'd', label: 'Seen', sort: a => a.date, html: a => fdate(a.date) },
          { key: 'c', label: 'Company', sort: a => a.company, html: a => link('company.' + a.bin, a.company) },
          { key: 't', label: 'Type', sort: a => a.type, html: a => esc(EVENT_LABEL[a.type]) },
          { key: 'x', label: 'What happened', html: a => esc(a.text) },
          { key: 'b', label: 'Basis', html: a => a.confidence === 'confirmed' ? lbl('green', 'Confirmed') : lbl('dash', 'Possible') },
          { key: 'r', label: '', html: a => S.read[a.key] ? '<span class="muted">read</span>' : `<button type="button" class="linkbtn" data-act="read" data-key="${esc(a.key)}">Mark read</button>` }],
          alerts, { defaultSort: { col: 'd', dir: 'desc' }, rowClass: a => (S.read[a.key] ? '' : 'unread'), empty: watched.length ? 'No alerts yet. Move the clock forward to let new data arrive.' : 'Add a company to start receiving alerts.' })}</fieldset>
      <fieldset><legend>Companies you watch (${watched.length})</legend>${table('watched', [
        { key: 'n', label: 'Company', sort: w => w.e.name, html: w => link('company.' + w.bin, w.e.name) },
        { key: 'r', label: 'Risk', cls: 'num', sort: w => w.e.score.total, html: w => `${w.e.score.total} ${bandLbl(w.e.score)}` },
        { key: 's', label: 'Watching since', sort: w => w.since, html: w => fdate(w.since) },
        { key: 'a', label: 'New alerts', cls: 'num', sort: w => newBy(w.bin), html: w => newBy(w.bin) },
        { key: 'x', label: '', html: w => `<button type="button" class="btn" data-act="unwatch" data-bin="${w.bin}">Remove</button>` }], watched, { wide: false, empty: 'Nothing watched.' })}</fieldset>
      <fieldset><legend>What should raise an alert?</legend><div class="row">${Object.keys(RULE_LABEL).map(k => `<label><input type="checkbox" data-act="rule" data-type="${k}" ${S.rules[k] ? 'checked' : ''}> ${RULE_LABEL[k]}</label>`).join('')}</div></fieldset>`;
  }

  // ---- review queue --------------------------------------------------------------------------
  const KIND = { ambiguous: ['Ambiguous', 'Two or more companies fit this name equally well.'], possible: ['Possible', 'Close to one company, but not close enough to link.'],
    name_only: ['Name only', 'Linked by name. The record has no BIN, so nothing proves it.'] };
  function pageQueue(v) {
    const f = ui.filters.queue || 'decide';
    const feeds = new Set();
    for (const e of v.entities.values()) for (const fl of e.flags) if (fl.status === 'unconfirmed') fl.evidence.forEach(id => feeds.add(id));
    const affects = q => feeds.has(q.record.id);
    const tests = { decide: q => q.kind !== 'name_only', risk: q => q.kind === 'name_only' && affects(q), name_only: q => q.kind === 'name_only', all: () => true };
    const labels = { decide: 'Needs a decision', risk: 'Affects a risk indicator', name_only: 'All name-only links', all: 'Everything' };
    const order = { ambiguous: 0, possible: 1, name_only: 2 };
    const items = v.queue.filter(tests[f]).sort((a, b) => order[a.kind] - order[b.kind] || (affects(b) - affects(a)) || (a.record.date < b.record.date ? 1 : -1));
    const pipes = Object.keys(labels).map(k => k === f ? `<b>${labels[k]} (${v.queue.filter(tests[k]).length})</b>` : `<a href="#" data-act="filter" data-scope="queue" data-k="${k}">${labels[k]} (${v.queue.filter(tests[k]).length})</a>`).join('');
    const cand = q => {
      if (q.kind === 'name_only') {
        const bin = q.link.entityBin;
        return `<div class="cand">Linked to ${companyLink(v, bin)} <span class="mono muted">${bin}</span> (score ${q.link.score.toFixed(2)})</div>
          <div class="row"><button type="button" class="btn" data-act="decide" data-rec="${q.record.id}" data-entity="${bin}">Confirm: same company</button>
          <button type="button" class="btn" data-act="decide" data-rec="${q.record.id}" data-entity="">Not the same</button></div>`;
      }
      return q.link.candidates.slice(0, 3).map(c => `<div class="cand">${companyLink(v, c.bin)} <span class="mono muted">${c.bin}, ${esc(district(v.entities.get(c.bin)))}, score ${c.score.toFixed(2)}</span><br>
          <button type="button" class="btn" data-act="decide" data-rec="${q.record.id}" data-entity="${c.bin}">Same company</button></div>`).join('')
        + `<button type="button" class="btn" data-act="decide" data-rec="${q.record.id}" data-entity="">None of these</button>`;
    };
    return `<div class="crumbs">You are here: <a href="#home">Home</a> &rsaquo; Review queue</div><h1>Review queue</h1>
      <p class="lead">The matcher links a record on its own only when it is sure. Everything else waits here for a person. A decision is applied straight away: risk indicators and scores are recalculated, and it is remembered in this browser. <b>Name-only links</b> are already attached to a company but nothing proves them; confirming them is what turns an unconfirmed risk indicator into a confirmed one.</p>
      <div class="row"><span>Show:</span><div class="pipes">${pipes}</div></div>
      ${table('queue', [
        { key: 'r', label: 'Record', sort: q => q.record.date, html: q => `${esc(SOURCE[q.record.source])}<br><span class="mono">${q.record.id}</span><br><span class="muted">${fdate(q.record.date)}</span>` },
        { key: 'n', label: 'Name as written', sort: q => q.record.name, html: q => `${esc(q.record.name)}<br><span class="muted">${esc(recordDetail(q.record))}</span>` },
        { key: 'b', label: 'BIN on record', html: q => q.record.bin ? `<span class="mono">${q.record.bin}</span> ${E.isValidBin(q.record.bin) ? '' : lbl('red', 'invalid')}` : '<span class="muted">none</span>' },
        { key: 'k', label: 'Why it is here', sort: q => q.kind, html: q => `${lbl(q.kind === 'name_only' ? 'dash' : 'grey', KIND[q.kind][0])}<br><span class="muted">${KIND[q.kind][1]}</span>${affects(q) ? '<br><b>Part of an unconfirmed risk indicator.</b>' : ''}` },
        { key: 'a', label: 'Decide', html: cand }], items, { defaultSort: null, empty: f === 'decide' ? 'Nothing needs a decision right now.' : 'Nothing to show.' })}
      <fieldset><legend>Decisions you have made (${v.decided.length})</legend>${table('decided', [
        { key: 'r', label: 'Record', html: d => `<span class="mono">${d.record.id}</span> ${esc(d.record.name)}` },
        { key: 'd', label: 'Decision', html: d => d.link.status === 'rejected' ? lbl('grey', 'Not any candidate') : `${lbl('navy', 'Confirmed')} ${companyLink(v, d.link.entityBin)}` },
        { key: 'u', label: '', html: d => `<button type="button" class="btn" data-act="undo" data-rec="${d.record.id}">Undo</button>` }], v.decided, { wide: false, empty: 'No decisions yet.' })}</fieldset>`;
  }
  function recordDetail(r) {
    if (r.source === 'procurement') return `Tender won, ${num(r.amount_m)} M KZT, ${r.customer}`;
    if (r.source === 'courts') return `${r.role}, ${r.kind}, ${num(r.amount_m)} M KZT`;
    return `${r.area_ha} ha parcel${r.near_contract ? ' near ' + r.near_contract : ''}`;
  }

  // ---- compare -------------------------------------------------------------------------------
  function pageCompare(v, args) {
    const list = entityList(v), [a, b] = args;
    const opts = sel => `<option value="">Choose a company</option>${list.map(e => `<option value="${e.bin}" ${e.bin === sel ? 'selected' : ''}>${esc(e.name)} (${e.bin.slice(-4)})</option>`).join('')}`;
    const A = a && v.entities.has(a) ? world.summary(v, a) : null, B = b && v.entities.has(b) ? world.summary(v, b) : null;
    let grid = '<div class="note">Choose two companies to see them side by side.</div>';
    if (A && B) {
      const rows = [
        ['BIN', s => `<span class="mono">${s.bin}</span>`, null], ['Status', s => statusLbl(s.status), s => s.status], ['Registered', s => fdate(s.registered), null],
        ['District', s => esc(s.region), s => s.region], ['Employees', s => s.employees, s => s.employees], ['Owner', s => esc(s.owner), s => s.owner],
        ['Risk score', s => `<b>${s.score.total}</b> ${bandLbl(s.score)}`, s => s.score.total],
        ['Confirmed indicators', s => s.flags.length ? `<ul style="padding-left:16px">${s.flags.map(f => `<li>${esc(f.title)}</li>`).join('')}</ul>` : '<span class="muted">none</span>', s => s.flags.map(f => f.id).join()],
        ['Not confirmed', s => s.unconfirmed.length ? s.unconfirmed.map(f => esc(f.title)).join('<br>') : '<span class="muted">none</span>', s => s.unconfirmed.length],
        ['Tender wins, 12 months', s => `${s.wins12} (${num(s.winsTotal12)} M KZT)`, s => s.wins12], ['Court cases, 12 months', s => s.cases12, s => s.cases12], ['Land parcels', s => s.parcels, s => s.parcels]];
      const ea = v.entities.get(a), eb = v.entities.get(b);
      const shared = ea.cur.owner.type === 'company' && eb.cur.owner.type === 'company' && ea.cur.owner.bin === eb.cur.owner.bin;
      grid = `${shared ? `<div class="note"><b>These two companies have the same owner</b> (${esc(A.owner)}).</div>` : ''}
        <div class="scroll"><table class="wide" style="min-width:560px"><thead><tr><th style="width:22%"></th><th>${link('company.' + a, A.name)}</th><th>${link('company.' + b, B.name)}</th></tr></thead><tbody>
        ${rows.map(([label, f, k]) => `<tr><th style="background:var(--navhead);color:var(--navy);border-color:var(--line-soft)">${label}</th><td class="${k && k(A) !== k(B) ? 'diff' : ''}">${f(A)}</td><td class="${k && k(A) !== k(B) ? 'diff' : ''}">${f(B)}</td></tr>`).join('')}</tbody></table></div>
        <p class="facts">Highlighted rows differ (BIN and registration date always differ, so they are not highlighted).</p>`;
    }
    return `<div class="crumbs">You are here: <a href="#home">Home</a> &rsaquo; Compare</div><h1>Compare companies</h1>
      <div class="row"><label for="cmpA">First:</label><select id="cmpA" data-act="cmp">${opts(a)}</select><label for="cmpB">Second:</label><select id="cmpB" data-act="cmp">${opts(b)}</select></div>${grid}`;
  }

  // ---- matcher quality -----------------------------------------------------------------------
  function pageQA() {
    const q = world.qa(), pct = x => (x * 100).toFixed(1) + '%', nameOf = bin => world.entitiesAt(DATA.meta.end).get(bin).cur.name;
    const rec = r => `<span class="mono">${r.id}</span> ${esc(r.name)}`;
    return `<div class="crumbs">You are here: <a href="#home">Home</a> &rsaquo; Matcher quality</div><h1>Matcher quality</h1>
      <p class="lead">The matcher only ever sees a record's name and BIN. This page compares what it decided with the hidden truth in the synthetic data. The most important number is <b>wrong links</b>: a false merge would put one company's court cases on another company's report.</p>
      <div class="grid2"><fieldset><legend>Result on all ${q.total} records</legend><table class="kv"><tbody>
        <tr><th>Linked automatically</th><td>${q.linked}</td></tr><tr><th>Linked correctly</th><td>${q.rows.correct.length}</td></tr>
        <tr><th>Linked wrongly</th><td><b>${q.rows.wrong.length}</b> ${q.rows.wrong.length ? lbl('red', 'false merges') : lbl('green', 'none')}</td></tr>
        <tr><th>Sent to a person</th><td>${q.rows.review.length}</td></tr><tr><th>Left unlinked</th><td>${q.rows.unlinked.length}</td></tr>
        <tr><th>Precision</th><td>${pct(q.precision)}</td></tr><tr><th>Recall</th><td>${pct(q.recall)}</td></tr></tbody></table></fieldset>
      <fieldset><legend>By how the link was made</legend><table class="kv"><tbody>
        <tr><th>By BIN</th><td>${q.byBasis.bin.ok} right, ${q.byBasis.bin.bad} wrong</td></tr><tr><th>By name only</th><td>${q.byBasis.name.ok} right, ${q.byBasis.name.bad} wrong</td></tr></tbody></table>
        <p class="facts" style="margin-top:6px">Precision means: of the records linked, how many went to the right company. Recall means: of all records, how many were linked correctly without a person.</p></fieldset></div>
      <fieldset><legend>Wrong links (${q.rows.wrong.length})</legend>${table('qa-wrong', [{ key: 'r', label: 'Record', html: x => rec(x.record) }, { key: 'l', label: 'Linked to', html: x => esc(nameOf(x.link.entityBin)) }, { key: 't', label: 'Should be', html: x => esc(nameOf(x.record.truth)) }], q.rows.wrong, { wide: false, empty: 'None. No record was linked to the wrong company.' })}</fieldset>
      <fieldset><legend>Sent to a person (${q.rows.review.length})</legend>${table('qa-review', [{ key: 'r', label: 'Record', html: x => rec(x.record) }, { key: 't', label: 'Truth', html: x => esc(nameOf(x.record.truth)) },
        { key: 'c', label: 'Candidates offered', html: x => x.link.candidates.map(c => esc(nameOf(c.bin))).join('<br>') }, { key: 'o', label: 'Right answer offered?', html: x => x.truthInCandidates ? lbl('green', 'yes') : lbl('red', 'no') }], q.rows.review, { wide: false })}</fieldset>
      <fieldset><legend>Left unlinked (${q.rows.unlinked.length})</legend>${table('qa-un', [{ key: 'r', label: 'Record', html: x => rec(x.record) }, { key: 't', label: 'Truth', html: x => esc(nameOf(x.record.truth)) }], q.rows.unlinked, { wide: false, empty: 'None.' })}</fieldset>
      <div class="note">The synthetic data contains deliberate traps: numbered siblings, same-name companies, legal-form twins, a renamed company, mistyped and missing BINs. Real registries will contain traps nobody planned, so treat these numbers as a test of the method, not a promise.</div>`;
  }

  // ---- help ----------------------------------------------------------------------------------
  function pageHelp() {
    const gloss = [
      ['Many tender wins, very few employees', 'At least 10 confirmed state tenders in 12 months and 5 or fewer employees.', 'A new or asset-light firm can subcontract most of the work.'],
      ['Owns land next to a project it was awarded', 'A confirmed parcel within 500 m of the site of a contract the company won.', 'Local contractors often own land where they work.'],
      ['Owner changed shortly before a large contract', 'The registry owner changed within 60 days before a confirmed award of 100 M KZT or more.', 'Group restructurings are common.'],
      ['Repeated litigation as defendant', 'Three or more confirmed cases as defendant in 12 months.', 'Large operators are sued more simply because they have more counterparties.'],
      ['Public official on the board', 'A listed public official sits on the board; stronger if the company won contracts from their area.', 'Lawful, and the list in this demo is synthetic.'],
      ['New company, very large award', 'Registered less than a year before an award of 500 M KZT or more.', 'Special-purpose companies exist for single projects.'],
      ['Winning contracts while in liquidation', 'Status is liquidating and a contract was awarded afterwards.', 'Liquidating companies sometimes finish existing obligations.']];
    return `<div class="crumbs">You are here: <a href="#home">Home</a> &rsaquo; Help and method</div><h1>Help and method</h1>
      <fieldset><legend>Reading a report</legend><ul class="stack" style="padding-left:18px">
        <li><b>Risk score (0 to 100):</b> the sum of points from confirmed indicators. ${lbl('green', 'LOW')} under 25, ${lbl('orange', 'MODERATE')} 25 to 49, ${lbl('red', 'ELEVATED')} 50 and over. The weights are placeholders in this demo.</li>
        <li><b>Confirmed</b> means the evidence is tied to the company by a valid BIN or by a person's decision. ${lbl('dash', 'Unconfirmed')} means the match rests on a name. It is shown, never counted.</li>
        <li><b>Coverage:</b> a report says which sources were checked and how old they are. A low score from stale or missing sources is not a clean bill.</li></ul></fieldset>
      <fieldset><legend>How a record is linked</legend><table class="kv"><tbody>
        <tr><th>${lbl('green', 'BIN')}</th><td>The record carries a valid 12-digit BIN that equals the company's. This decides the link.</td></tr>
        <tr><th>${lbl('dash', 'Name only')}</th><td>No usable BIN, but the name fits exactly one company. Shown with a score; waits in the review queue.</td></tr>
        <tr><th>${lbl('navy', 'Analyst')}</th><td>A person confirmed the link in the review queue. Counts as confirmed.</td></tr>
        <tr><th>${lbl('grey', 'Needs a person')}</th><td>Two companies fit equally well, or one fits but not well enough. Never linked automatically.</td></tr>
        <tr><th>${lbl('grey', 'Kept apart')}</th><td>Valid BINs that differ, or names too different. The record is not attached to the company.</td></tr></tbody></table></fieldset>
      <fieldset><legend>The matcher in six rules</legend><ol style="padding-left:20px">
        <li>Two valid BINs decide the answer, whatever the names say.</li><li>A BIN with a bad check digit is ignored and flagged as invalid.</li>
        <li>Names are compared after Cyrillic, Kazakh and Latin spellings are folded together, so Қazaқstan, Казахстан and Kazakhstan agree.</li>
        <li>A different legal form (ТОО against АО) lowers the score.</li><li>Different numbers (Stroy 1 and Stroy 2) never link automatically.</li>
        <li>When unsure, the matcher asks a person. A wrong merge is worse than a missed link.</li></ol>
        <p class="facts" style="margin-top:6px">The same code is tested against the project's Python reference on thousands of generated cases.</p></fieldset>
      <fieldset><legend>Risk indicators</legend>${table('gloss', [{ key: 'i', label: 'Indicator', html: g => `<b>${esc(g[0])}</b>` }, { key: 'm', label: 'What it means here', html: g => esc(g[1]) }, { key: 'f', label: 'False alarm if', html: g => esc(g[2]) }], gloss, { wide: false })}</fieldset>
      <fieldset><legend>Limits, stated plainly</legend><ul class="stack" style="padding-left:18px">
        <li>Every company, BIN, contract, case and official here is <b>invented</b>. Nothing is connected to a real source yet.</li>
        <li>Thresholds and point weights are placeholders. They need calibrating on real data.</li>
        <li>PEP and sanctions lists need a licensed dataset. The public-official list here is synthetic.</li>
        <li>The BIN check-digit rule is implemented from the published scheme; verify it against an official sample.</li>
        <li>This is not legal, compliance or investment advice. Questions for counsel are listed in the project's docs.</li></ul></fieldset>
      <fieldset><legend>Keyboard</legend><p>Press <b>/</b> anywhere to jump to the search box. Tables sort when you click a column heading. Everything is reachable with Tab and Enter.</p></fieldset>`;
  }

  // ---- render --------------------------------------------------------------------------------
  const PAGES = { home: pageHome, search: pageSearch, company: pageCompany, watchlist: pageWatchlist, queue: pageQueue, compare: pageCompare, qa: pageQA, help: pageHelp };
  let focusSel = null;
  function render() {
    const r = route(), v = V();
    renderChrome(v, r);
    $('content').innerHTML = (PAGES[r.page] || pageHome)(v, r.args);
    const q = $('q');
    if (document.activeElement !== q && r.page !== 'home') q.value = S.query || '';
    if (focusSel) { const el = document.querySelector(focusSel); if (el) el.focus(); focusSel = null; }
    if (ui.copy && $('copybox')) $('copybox').select();
  }
  const flash = (html, warn) => { ui.flash = { html, warn: !!warn }; ui.keepFlash = true; };

  // ---- actions -------------------------------------------------------------------------------
  function doSearch(text) {
    S.query = (text || '').trim();
    if (S.query) { S.recent = [S.query, ...S.recent.filter(x => x !== S.query)].slice(0, 6); }
    save(); ui.flash = null; go('search');
  }

  function moveClock(days) {
    const prev = S.clock, before = unreadCount(V());
    S.clock = days === 0 ? DATA.meta.start : (P.addDays(prev, days) > DATA.meta.end ? DATA.meta.end : P.addDays(prev, days));
    save();
    if (S.clock === prev) { render(); return; }
    if (S.clock < prev) { flash(`Clock reset to ${fdate(S.clock)}.`); render(); return; }
    const recs = DATA.records.filter(r => r.first_seen > prev && r.first_seen <= S.clock).length;
    const changes = DATA.registry.reduce((n, e) => n + e.snapshots.filter((s, i) => i > 0 && s.date > prev && s.date <= S.clock).length, 0);
    const v = V(), fresh = alertsFor(v).filter(a => a.date > prev);
    flash(`Clock moved to <b>${fdate(S.clock)}</b>. ${recs} new record${recs === 1 ? '' : 's'} and ${changes} registry change${changes === 1 ? '' : 's'} arrived.`
      + (Object.keys(S.watch).length ? ` ${fresh.length ? `<b>${fresh.length} alert${fresh.length === 1 ? '' : 's'} for your watchlist:</b> ${fresh.slice(0, 3).map(a => esc(a.company) + ': ' + esc(EVENT_LABEL[a.type].toLowerCase())).join('; ')}${fresh.length > 3 ? '; and more' : ''}. <a href="#watchlist">Open the watchlist</a>.` : 'Nothing new for your watchlist.'}` : ' Add a company to your watchlist to be alerted.'));
    render();
  }

  function decide(rec, entity) {
    const before = V(), prevLink = before.links.get(rec), r = DATA.records.find(x => x.id === rec);
    const affected = new Set([entity, prevLink && prevLink.status === 'linked' ? prevLink.entityBin : null].filter(Boolean));
    const beforeScores = new Map([...affected].map(b => [b, before.entities.get(b).score.total]));
    S.decisions[rec] = { entity: entity || null };
    save();
    const after = V();
    const changes = [...affected].map(b => [b, beforeScores.get(b), after.entities.get(b).score.total]).filter(([, a, c]) => a !== c)
      .map(([b, a, c]) => `${esc(after.nameOf(b))}: risk ${a} to ${c}`);
    flash(entity ? `Saved. <span class="mono">${r.id}</span> is now confirmed as ${esc(after.nameOf(entity))}.` + (changes.length ? ' ' + changes.join('; ') + '.' : ' No risk score changed.')
      : `Saved. <span class="mono">${r.id}</span> is marked as not belonging to any candidate.` + (changes.length ? ' ' + changes.join('; ') + '.' : ''));
    render();
  }

  function copySummary(bin) {
    const v = V(), e = v.entities.get(bin), text = summaryText(v, e);
    const fallback = () => { ui.copy = bin; render(); };
    try {
      navigator.clipboard.writeText(text).then(() => { ui.copy = null; flash('Summary copied to the clipboard.'); render(); }, fallback);
    } catch (err) { fallback(); }
  }

  const selectorFor = el => { const parts = ['[data-act="' + el.dataset.act + '"]']; for (const k of ['bin', 'id', 'rec', 'entity', 'key', 'type', 'k', 'scope', 'table', 'col', 'days']) if (el.dataset[k] !== undefined) parts.push(`[data-${k}="${el.dataset[k]}"]`); return parts.join(''); };

  document.addEventListener('click', ev => {
    const el = ev.target.closest('[data-act]');
    if (!el || el.tagName === 'SELECT' || el.type === 'checkbox') return;
    const a = el.dataset.act;
    if (el.tagName === 'A') ev.preventDefault();
    if (a !== 'clock') focusSel = selectorFor(el);
    switch (a) {
      case 'sort': { const id = el.dataset.table, col = el.dataset.col, cur = ui.sort[id]; ui.sort[id] = { col, dir: cur && cur.col === col && cur.dir === 'asc' ? 'desc' : 'asc' }; render(); break; }
      case 'example': doSearch(el.dataset.q); break;
      case 'watch': S.watch[el.dataset.bin] = S.clock; save(); flash(`Added to your watchlist. New activity from ${fdate(S.clock)} on will appear as alerts; move the clock to see some.`); render(); break;
      case 'unwatch': delete S.watch[el.dataset.bin]; save(); flash('Removed from your watchlist.'); render(); break;
      case 'watch-examples': for (const frag of ['Алтын Дала Строй»', 'Сары Арка Транс', 'Хан Тенгри Тур']) { const b = entityList(V()).find(e => e.name.includes(frag))?.bin; if (b) S.watch[b] = S.clock; } save(); flash('Added three example companies. Move the clock forward to see alerts.'); render(); break;
      case 'clock': moveClock(Number(el.dataset.days)); break;
      case 'flag': ui.open[el.dataset.id] = !ui.open[el.dataset.id]; render(); break;
      case 'filter': ui.filters[el.dataset.scope] = el.dataset.k; render(); break;
      case 'decide': decide(el.dataset.rec, el.dataset.entity || null); break;
      case 'undo': delete S.decisions[el.dataset.rec]; save(); flash('Decision removed.'); render(); break;
      case 'read': S.read[el.dataset.key] = true; save(); render(); break;
      case 'readall': alertsFor(V()).forEach(x => { S.read[x.key] = true; }); save(); render(); break;
      case 'open-queue': ui.filters.queue = el.dataset.k; focusSel = null; go('queue'); break;
      case 'copy': copySummary(el.dataset.bin); break;
    }
  });

  document.addEventListener('change', ev => {
    const el = ev.target.closest('[data-act]');
    if (!el) return;
    if (el.dataset.act === 'assume') { ui.assume = el.checked; focusSel = '[data-act="assume"]'; render(); }
    else if (el.dataset.act === 'rule') { S.rules[el.dataset.type] = el.checked; save(); focusSel = selectorFor(el); render(); }
    else if (el.dataset.act === 'cmp') go('compare', $('cmpA').value || '-', $('cmpB').value || '-');
  });

  document.addEventListener('submit', ev => {
    if (ev.target.id === 'finder') { ev.preventDefault(); doSearch($('q').value); }
    else if (ev.target.id === 'homeform') { ev.preventDefault(); doSearch($('hq').value); }
  });

  document.addEventListener('keydown', ev => {
    if (ev.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) && !ev.ctrlKey && !ev.metaKey) { ev.preventDefault(); $('q').focus(); $('q').select(); }
  });

  window.addEventListener('hashchange', () => { if (!ui.keepFlash) ui.flash = null; ui.keepFlash = false; ui.copy = null; focusSel = null; render(); window.scrollTo(0, 0); });

  $('q').value = S.query || '';
  render();
})();
