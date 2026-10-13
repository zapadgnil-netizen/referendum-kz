/* Behavioral regressions for the standalone desk. Run: node tests/core.cjs */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

const appPath = path.join(__dirname, '..', 'src', 'desk.js');
const source = fs.readFileSync(appPath, 'utf8');
const ending = /\nrender\(\);\s*\n\}\)\(\);\s*$/;
assert.match(source, ending, 'Test harness must replace the actual final render, not an unrelated call.');
const instrumented = source.replace(ending, `
globalThis.__deskTest = {
  defaults, normalizeState, dateOK, safeURL, esc, parseCSV, doCSV,
  sameBIN, conflict, readiness, ready, reportBody, sampleCase, demoState,
  save, render, toggleDemo, importJSON, reportDialog, money, htmlDoc, quoteDoc, offerHTML, guardEdits,
  filename, emailOK, looksIIN, documentRequest, renderHome, renderSettings, evidenceDialog,
  getState:()=>state, getOwn:()=>own, isDemo:()=>demo,
  setState:s=>{state=s;own=s;demo=false;selectedCase=s.cases[0]?.id||null;},
  setDemo:v=>{demo=v;}
};
})();
`);

function nodeStub() {
  return {
    textContent:'', innerHTML:'', value:'', hidden:false, style:{}, dataset:{},
    classList:{toggle(){},add(){},remove(){},contains(){return false;}},
    addEventListener(){}, removeEventListener(){}, setAttribute(){}, removeAttribute(){},
    showModal(){this.open=true;},close(){this.open=false;},
    querySelector(){return null;},querySelectorAll(){return [];},
    append(){},appendChild(){},remove(){},click(){},focus(){},select(){},
    setSelectionRange(){},scrollIntoView(){},matches(){return false;},
    reportValidity(){return true;}
  };
}

function harness(initialStored=null) {
  const elements=new Map(), listeners={}, writes=[];
  const storageKey='ashyq-dala-desk-v1';
  const storage=new Map(initialStored===null?[]:[[storageKey,initialStored]]);
  const getNode=selector=>{
    if(!elements.has(selector))elements.set(selector,nodeStub());
    return elements.get(selector);
  };
  getNode('#prospect-data').textContent='[]';
  const context={
    console,URL,Intl,Date,Math,Number,String,JSON,Uint8Array,TextDecoder,Blob,
    crypto:webcrypto,
    setTimeout(){return 1;},clearTimeout(){},
    confirm(){return true;},alert(){},
    atob:value=>Buffer.from(value,'base64').toString('binary'),
    localStorage:{
      getItem(key){return storage.get(key)??null;},
      setItem(key,value){writes.push({key,value});storage.set(key,value);},
      removeItem(key){storage.delete(key);}
    },
    document:{
      querySelector:getNode,querySelectorAll(){return [];},
      addEventListener(type,callback){(listeners[type]??=[]).push(callback);},
      createElement:nodeStub,body:nodeStub()
    },
    navigator:{},
    window:{addEventListener(){},open(){return null;}},
    addEventListener(){},
  };
  vm.createContext(context);
  vm.runInContext(instrumented,context,{filename:appPath});
  return {context,api:context.__deskTest,elements,listeners,writes,getNode,stored:()=>storage.get(storageKey)??null};
}

function sourceRecord(overrides={}) {
  return {
    id:'source-1',title:'Company document',category:'Company documents',
    url:'https://example.com/company',reference:'DOC-1',
    accessed:'2026-10-06',sourceDate:'2026-10-01',
    recordBin:'123456789012',recordName:'Fixture Company LLP',
    claim:'ATTRIBUTED_FINDING_MARKER',match:'Confirmed',permission:'Client-authorized',
    reviewNote:'Identifier agrees with the supplied subject documents.',...overrides
  };
}

function caseRecord(overrides={}) {
  return {
    id:'case-1',leadId:'lead-1',synthetic:false,company:'Fixture Company LLP',
    bin:'123456789012',client:'Fixture Client',goal:'Confirm the contracting entity.',
    deadline:'2026-10-10',summary:'Summary for client.',
    recommendations:'Request the missing confirmation.',limitations:'Only supplied documents reviewed.',
    notes:'INTERNAL_ONLY_SECRET_MARKER',analyst:'Fixture Analyst',signedOff:true,
    createdAt:'2026-10-01',updatedAt:'2026-10-06',sources:[sourceRecord()],...overrides
  };
}

function leadRecord(overrides={}) {
  return {
    id:'lead-1',client:'Fixture Client',email:'buyer@example.com',company:'Fixture Company LLP',
    stage:'Active',fee:250,received:125,cost:10,hours:2,followup:'2026-10-08',
    next:'Confirm scope.',notes:'PRIVATE_SALES_NOTES',createdAt:'2026-10-01',...overrides
  };
}

function stateFor(api,overrides={}) {
  return {...api.defaults(),leads:[leadRecord()],cases:[caseRecord()],...overrides};
}

let failed=0,passed=0;
const checks=[];
function test(name,fn){checks.push({name,fn});}

test('Client report includes public assessment but excludes internal case and sales notes',()=>{
  const {api}=harness();api.setState(stateFor(api));
  const html=api.reportBody(api.getState().cases[0]);
  assert.match(html,/Summary for client\./);
  assert.match(html,/ATTRIBUTED_FINDING_MARKER/);
  assert.doesNotMatch(html,/INTERNAL_ONLY_SECRET_MARKER|PRIVATE_SALES_NOTES/);
  assert.match(html,/Status: Analyst review complete/);
});

test('A confirmed source with a conflicting BIN cannot produce a reviewed brief',()=>{
  const {api}=harness();const c=caseRecord({sources:[sourceRecord({recordBin:'999999999999'})]});
  assert.equal(api.conflict(c,c.sources[0]),true);
  assert.equal(api.ready(c),false);
  assert.match(api.reportBody(c),/DRAFT · Review incomplete/);
});

test('Name-only confirmed attribution requires an analyst rationale',()=>{
  const {api}=harness();const c=caseRecord({sources:[sourceRecord({recordBin:'',reviewNote:''})]});
  assert.equal(api.ready(c),false);
  c.sources[0].reviewNote='Company supplied the extract directly and its legal name agrees.';
  assert.equal(api.ready(c),true);
});

test('Uncertain findings stay outside confirmed evidence; unreviewed and excluded contents stay private',()=>{
  const {api}=harness();const c=caseRecord({sources:[
    sourceRecord(),
    sourceRecord({id:'uncertain',match:'Uncertain',claim:'UNCERTAIN_FINDING_MARKER'}),
    sourceRecord({id:'unreviewed',match:'Unreviewed',claim:'UNREVIEWED_FINDING_SECRET'}),
    sourceRecord({id:'excluded',match:'Excluded',claim:'EXCLUDED_FINDING_SECRET'}),
  ]});
  const html=api.reportBody(c);
  const confirmed=html.split('<h2>Evidence attributed to the subject</h2>')[1].split('<h2>Unresolved attribution</h2>')[0];
  assert.match(confirmed,/ATTRIBUTED_FINDING_MARKER/);
  assert.doesNotMatch(confirmed,/UNCERTAIN_FINDING_MARKER/);
  assert.match(html,/<h2>Unresolved attribution<\/h2>/);
  assert.match(html,/UNCERTAIN_FINDING_MARKER/);
  assert.doesNotMatch(html,/UNREVIEWED_FINDING_SECRET|EXCLUDED_FINDING_SECRET/);
  assert.equal(api.ready(c),false);
});

test('Executable URLs and credential-bearing URLs are rejected',()=>{
  const {api}=harness();
  for(const url of ['javascript:alert(1)','data:text/html,<script>alert(1)</script>',
    'http://example.com','https://user:pass@example.com/','file:///private']) {
    assert.equal(api.safeURL(url),'',url);
  }
  assert.equal(api.safeURL('https://example.com/source?a=1&b=2'),'https://example.com/source?a=1&b=2');
});

test('Report and restored content escape HTML and remove dangerous source links',()=>{
  const {api}=harness();const attack='<img src=x onerror="alert(1)">';
  const state=stateFor(api,{cases:[caseRecord({company:attack,summary:'</p><script>alert(1)</script>',
    sources:[sourceRecord({title:attack,url:'javascript:alert(1)',claim:attack})]})]});
  const clean=api.normalizeState(state);api.setState(clean);
  const html=api.reportBody(clean.cases[0]);
  assert.equal(clean.cases[0].sources[0].url,'');
  assert.doesNotMatch(html,/<img|<script|href="javascript:/i);
  assert.match(html,/&lt;img/);assert.match(html,/&lt;script&gt;/);
});

test('CSV handles quoted commas, escaped quotes, multiline fields and BOM',()=>{
  const {api}=harness();
  const rows=api.parseCSV('\ufefftitle,claim\r\n"Company, extract","Line one\nLine ""two"""\r\n');
  assert.equal(rows.length,2);assert.equal(rows[1][0],'Company, extract');
  assert.equal(rows[1][1],'Line one\nLine "two"');
  assert.throws(()=>api.parseCSV('title,claim\n"unfinished,field'));
});

test('CSV imports untrusted findings as unreviewed and clears final sign-off',()=>{
  const {api}=harness();const state=stateFor(api,{cases:[caseRecord({sources:[]})]});api.setState(state);
  api.doCSV('title,claim,url,accessed\n"Extract, v2","A quoted claim",https://example.com/evidence,2026-10-06');
  const c=api.getState().cases[0];assert.equal(c.sources.length,1);
  assert.equal(c.sources[0].match,'Unreviewed');assert.equal(c.sources[0].permission,'Unchecked');
  assert.equal(c.signedOff,false);
});

test('CSV cumulative limit rejects an import atomically before dropping existing evidence',()=>{
  const {api}=harness();const sources=Array.from({length:499},(_,i)=>sourceRecord({id:'record-'+i}));
  api.setState(stateFor(api,{cases:[caseRecord({sources})]}));
  assert.throws(()=>api.doCSV('title,claim\nNew one,Claim one\nNew two,Claim two'),/500|limit|many/i);
  assert.equal(api.getState().cases[0].sources.length,499);
  assert.equal(api.getState().cases[0].signedOff,true);
});

test('Restore rejects duplicate entity IDs instead of editing/deleting the wrong record',()=>{
  const {api}=harness();
  assert.throws(()=>api.normalizeState(stateFor(api,{leads:[leadRecord(),leadRecord()]})));
  assert.throws(()=>api.normalizeState(stateFor(api,{cases:[caseRecord(),caseRecord()]})));
  assert.throws(()=>api.normalizeState(stateFor(api,{cases:[caseRecord({sources:[sourceRecord(),sourceRecord()]})]})));
});

test('Restore rejects non-object records and nonfinite numeric values',()=>{
  const {api}=harness();
  assert.throws(()=>api.normalizeState(stateFor(api,{leads:[null]})));
  assert.throws(()=>api.normalizeState(stateFor(api,{cases:[null]})));
  assert.throws(()=>api.normalizeState(stateFor(api,{cases:[caseRecord({sources:[null]})]})));
  for(const field of ['fee','received','cost','hours']) {
    assert.throws(()=>api.normalizeState(stateFor(api,{leads:[leadRecord({[field]:'Infinity'})]})),field);
  }
});

test('Restore rejects oversized arrays without silently truncating a backup',()=>{
  const {api}=harness();
  const oversizedLeads=Array.from({length:1001},(_,i)=>leadRecord({id:'lead-'+i}));
  const oversizedCases=Array.from({length:501},(_,i)=>caseRecord({id:'case-'+i}));
  const oversizedSources=Array.from({length:501},(_,i)=>sourceRecord({id:'source-'+i}));
  assert.throws(()=>api.normalizeState(stateFor(api,{leads:oversizedLeads})));
  assert.throws(()=>api.normalizeState(stateFor(api,{cases:oversizedCases})));
  assert.throws(()=>api.normalizeState(stateFor(api,{cases:[caseRecord({sources:oversizedSources})]})));
});

test('Evidence dates reject impossible days and accept real leap days',()=>{
  const {api}=harness();
  for(const invalid of ['2026-02-31','2026-02-29','2026-04-31','2026-13-01','2026-00-10','2026-01-00','2026-1-01']){
    assert.equal(api.dateOK(invalid),false,invalid);
  }
  for(const valid of ['2024-02-29','2026-10-06','2000-02-29'])assert.equal(api.dateOK(valid),true,valid);
});

test('Corrupt stored JSON is retained through initial render for recovery',()=>{
  const corrupt='{this is not valid JSON';const h=harness(corrupt);h.api.render();
  assert.equal(h.stored(),corrupt,'Initial render must not overwrite the only existing copy with defaults.');
});

test('Malformed stored workspace is retained through initial render for recovery',()=>{
  const broken=JSON.stringify({version:1,settings:{},leads:[null],cases:[],tasks:[]});
  const h=harness(broken);h.api.render();assert.equal(h.stored(),broken);
});

test('Exploring and changing the demo never changes or saves own-workspace records',()=>{
  const h=harness();h.api.setState(stateFor(h.api));h.api.save();
  const ownBefore=JSON.stringify(h.api.getOwn()),storedBefore=h.stored(),writeCount=h.writes.length;
  h.api.toggleDemo();assert.equal(h.api.isDemo(),true);
  h.api.getState().leads[0].client='Edited demo client';h.api.save();
  assert.equal(h.writes.length,writeCount);assert.equal(h.stored(),storedBefore);
  assert.equal(JSON.stringify(h.api.getOwn()),ownBefore);
  assert.match(h.api.reportBody(h.api.getState().cases[0]),/FICTIONAL SAMPLE/);
  h.api.toggleDemo();assert.equal(h.api.isDemo(),false);
  assert.equal(JSON.stringify(h.api.getState()),ownBefore);
});

test('Sample output is always labelled fictional; ordinary complete reports are not',()=>{
  const {api}=harness();
  assert.match(api.reportBody(api.sampleCase()),/FICTIONAL SAMPLE/);
  assert.doesNotMatch(api.reportBody(caseRecord()),/FICTIONAL SAMPLE/);
  api.setDemo(true);assert.match(api.reportBody(caseRecord()),/FICTIONAL SAMPLE/);
});

test('Intake cannot be imported while the fictional workspace is active',async()=>{
  const {api}=harness();api.toggleDemo();
  const file={size:100,text:async()=>JSON.stringify({type:'ashyq-dala-intake',version:1,clientName:'Actual client'})};
  await assert.rejects(()=>api.importJSON(file),/own workspace|real request/i);
});

test('Permission-unchecked evidence is withheld even from draft exports',()=>{
  const {api}=harness();const c=caseRecord({sources:[sourceRecord({permission:'Unchecked',claim:'RESTRICTED_MATERIAL_MARKER'})]});
  assert.equal(api.ready(c),false);
  assert.doesNotMatch(api.reportBody(c),/RESTRICTED_MATERIAL_MARKER/);
});
test('Identifier-conflicting evidence is withheld from draft findings',()=>{
  const {api}=harness();const c=caseRecord({sources:[sourceRecord({recordBin:'999999999999',claim:'WRONG_COMPANY_FINDING'})]});
  assert.doesNotMatch(api.reportBody(c),/WRONG_COMPANY_FINDING/);
});
test('Edited synthetic case preview exports that case rather than regenerating the default sample',()=>{
  const h=harness();const c=h.api.sampleCase();c.id='edited-demo';c.company='Edited fictional subject';h.api.reportDialog(c);
  const content=h.getNode('#dialog-body').innerHTML;
  assert.match(content,/data-action="export-report" data-id="edited-demo"/);
  assert.doesNotMatch(content,/data-action="download-sample"/);
});
test('Odd-dollar quote deposits preserve cents instead of overcharging through rounding',()=>{
  const {api}=harness();api.setState(stateFor(api));
  const html=api.quoteDoc(leadRecord({fee:251}));
  assert.match(html,/Total fee: \$251 USD/);
  assert.match(html,/Deposit: \$125\.50/);
  assert.match(html,/balance: \$125\.50/);
});
test('Public offer export includes only public configuration and neutralizes closing script payloads',()=>{
  const h=harness();const state=stateFor(h.api);state.settings.operator='</script><img src=x onerror=alert(1)>';state.settings.email='owner@example.com';
  state.settings.paymentUrl='https://example.com/private-payment';h.api.setState(state);
  h.getNode('#offer-template').textContent=Buffer.from('<html><script id="ad-config" type="application/json">{}</script></html>').toString('base64');
  const html=h.api.offerHTML();
  assert.match(html,/owner@example.com/);
  assert.doesNotMatch(html,/INTERNAL_ONLY_SECRET_MARKER|PRIVATE_SALES_NOTES|private-payment|<img/);
  assert.equal((html.match(/<\/script>/g)||[]).length,1);
});
test('Unsaved edits prevent export or modal changes until explicitly saved or discarded',()=>{
  const h=harness();const form={dataset:{dirty:'true'},closest(){return null}};
  h.context.document.querySelectorAll=selector=>selector.includes('data-dirty')?[form]:[];
  assert.equal(h.api.guardEdits(false),false);
  assert.match(h.getNode('#toast').textContent,/Save your edits/);
  assert.equal(h.api.guardEdits(true),true);
  assert.equal(form.dataset.dirty,undefined);
});

/* ---- Review fixes, 13 October 2026 ---- */
const ownBackup=(api,overrides={})=>({type:'ashyq-dala-backup',dataset:'own',data:{...api.defaults(),...overrides}});
const fileOf=obj=>({size:100,text:async()=>JSON.stringify(obj)});

test('"Import request" refuses a backup file, so a stranger cannot replace the workspace',async()=>{
  const {api}=harness();api.setState(stateFor(api));
  const hostile=ownBackup(api,{settings:{...api.defaults().settings,email:'attacker@evil.example',paymentUrl:'https://attacker.example/pay'}});
  await assert.rejects(()=>api.importJSON(fileOf(hostile),'request'),/request/i);
  assert.equal(api.getState().leads.length,1);
  assert.equal(api.getState().settings.paymentUrl,'');
});

test('"Restore backup" refuses an intake request and only accepts own-workspace backups',async()=>{
  const {api}=harness();api.setState(stateFor(api));
  await assert.rejects(()=>api.importJSON(fileOf({type:'ashyq-dala-intake',version:1,clientName:'X'}),'restore'),/backup/i);
});

test('Restore confirmation shows incoming and current email and payment link, and lead/case counts',async()=>{
  const h=harness();const st=stateFor(h.api);st.settings.email='me@example.com';h.api.setState(st);
  let asked='';h.context.confirm=m=>{asked=m;return false;};
  const incoming=ownBackup(h.api,{settings:{...h.api.defaults().settings,email:'other@example.org',paymentUrl:'https://pay.example.org/x'}});
  await h.api.importJSON(fileOf(incoming),'restore');
  assert.match(asked,/other@example\.org/);assert.match(asked,/https:\/\/pay\.example\.org\/x/);
  assert.match(asked,/me@example\.com/);assert.match(asked,/0 opportunit/);assert.match(asked,/1 opportunit/);
  assert.equal(h.api.getState().settings.email,'me@example.com','Declining must keep the workspace.');
});

test('Filenames keep Cyrillic company names instead of collapsing to underscores',()=>{
  const {api}=harness();
  assert.equal(api.filename('ТОО Тест'),'ТОО_Тест');
  assert.notEqual(api.filename('ТОО Альфа'),api.filename('ТОО Бета'));
  assert.equal(api.filename('<>:'),'Brief');
});

test('Desk email check matches the public offer: query strings and spaces are rejected',()=>{
  const {api}=harness();
  for(const bad of ['me@example.com?bcc=evil%40x.com','a b@example.com','me@example','me@@example.com'])assert.equal(api.emailOK(bad),false,bad);
  assert.equal(api.emailOK('first.last+kz@example.co.uk'),true);
});

test('A restored backup with an invalid receiving email does not keep it',()=>{
  const {api}=harness();
  const s=api.normalizeState({...api.defaults(),settings:{email:'me@example.com?bcc=evil%40x.com'}});
  assert.equal(s.settings.email,'');
});

test('Client brief says whether a confirmed attribution rests on a BIN match or the name only',()=>{
  const {api}=harness();
  const bin=api.reportBody(caseRecord());
  assert.match(bin,/Confirmed by analyst \(BIN match\)/);
  const nameOnly=api.reportBody(caseRecord({sources:[sourceRecord({recordBin:'',reviewNote:'Name agrees with the supplied extract.'})]}));
  assert.match(nameOnly,/Confirmed by analyst \(name only; no BIN in this record\)/);
  assert.doesNotMatch(nameOnly,/BIN match\)/);
});

test('Document request asks counterparties to redact individuals\' IINs and home addresses',()=>{
  const {api}=harness();api.setState(stateFor(api));
  const t=api.documentRequest(caseRecord());
  assert.match(t,/IIN/);assert.match(t,/home addresses/);
  assert.doesNotMatch(t,/remove unrelated personal identifiers/);
});

test('Overview offer does not promise unconditional two-day delivery',()=>{
  const {api}=harness();api.setState(stateFor(api));
  const html=api.renderHome();
  assert.doesNotMatch(html,/next step in 2 days/);
  assert.match(html,/two business days once scope/);
});

test('IIN-looking numbers are flagged; BIN-looking and blank numbers are not',()=>{
  const {api}=harness();
  assert.equal(api.looksIIN('900101300123'),true,'fifth digit 3: individual');
  assert.equal(api.looksIIN('123456789012'),false,'fifth digit 5: legal entity');
  assert.equal(api.looksIIN(''),false);assert.equal(api.looksIIN('12345'),false);
});

test('Settings ask for the seller legal name, country and terms link',()=>{
  const {api}=harness();const html=api.renderSettings();
  for(const f of ['legalName','country','termsUrl'])assert.match(html,new RegExp('name="'+f+'"'));
});

test('Public offer export carries the seller identity and refuses to export without it',()=>{
  const h=harness();const st=stateFor(h.api);st.settings.email='owner@example.com';h.api.setState(st);
  h.getNode('#offer-template').textContent=Buffer.from('<html><script id="ad-config" type="application/json">{}</script></html>').toString('base64');
  st.settings.legalName='Example Research LLC';st.settings.country='Kazakhstan';st.settings.termsUrl='https://example.com/terms';
  const html=h.api.offerHTML();
  assert.match(html,/Example Research LLC/);assert.match(html,/Kazakhstan/);assert.match(html,/https:\/\/example\.com\/terms/);
  const s=h.api.normalizeState({...h.api.defaults(),settings:{legalName:'A',country:'B',termsUrl:'javascript:alert(1)'}});
  assert.equal(s.settings.legalName,'A');assert.equal(s.settings.termsUrl,'');
});

test('The attribution note field is labelled as client-facing',()=>{
  const h=harness();h.api.setState(stateFor(h.api));h.api.evidenceDialog();
  assert.match(h.getNode('#dialog-body').innerHTML,/appears in the client brief/i);
});

/* ---- Public offer page script ---- */
function offerHarness(){
  const html=fs.readFileSync(path.join(__dirname,'..','src','offer.html'),'utf8');
  const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  let code=scripts[scripts.length-1][1];
  const end=/\}\)\(\);\s*$/;assert.match(code,end);
  code=code.replace(end,'globalThis.__offerTest={looksIIN,mailtoHref,emailBody};})();');
  const nodes=new Map();const node=id=>{if(!nodes.has(id))nodes.set(id,nodeStub());return nodes.get(id)};
  node('ad-config').textContent='{}';
  const context={console,URL,Intl,JSON,Date,
    document:{getElementById:node,querySelectorAll(){return [];},createElement:nodeStub,body:nodeStub(),title:''},
    window:{matchMedia(){return {matches:false}}},navigator:{},setTimeout(){},Blob};
  vm.createContext(context);vm.runInContext(code,context);return context.__offerTest;
}

test('Offer mailto keeps a literal @ in the recipient and encodes only the local part',()=>{
  const o=offerHarness();
  const href=o.mailtoHref('first+kz@example.com','Subj','Body');
  assert.match(href,/^mailto:first%2Bkz@example\.com\?subject=Subj&body=Body$/);
});

test('Offer email body stays short: long requests drop the duplicated JSON and point to the downloaded file',()=>{
  const o=offerHarness();
  const req={clientName:'A',clientEmail:'a@example.com',company:'ТОО Тест',bin:'',goal:'Ж'.repeat(2500),deadline:''};
  const body=o.emailBody(req,'Op');
  assert.ok(encodeURIComponent(body).length<2000,'encoded body '+encodeURIComponent(body).length);
  assert.match(body,/Ж{100}/,'the start of the question is kept');
  assert.doesNotMatch(body,/"type": "ashyq-dala-intake"/);
  assert.match(body,/download/i);
  const small=o.emailBody({...req,goal:'Short goal'},'Op');
  assert.match(small,/"type": "ashyq-dala-intake"/);
});

test('Offer flags IIN-looking numbers the same way as the desk',()=>{
  const o=offerHarness();
  assert.equal(o.looksIIN('900101300123'),true);assert.equal(o.looksIIN('123456789012'),false);assert.equal(o.looksIIN(''),false);
});

(async()=>{
  for(const {name,fn} of checks){
    try{await fn();passed++;console.log('PASS '+name);}
    catch(error){failed++;console.error('FAIL '+name+'\n  '+String(error.message).replace(/\n/g,'\n  '));}
  }
  console.log(`\n${passed} passed; ${failed} failed.`);
  process.exitCode=failed?1:0;
})();
