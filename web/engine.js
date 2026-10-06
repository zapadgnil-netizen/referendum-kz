/* Ashyq Dala matching engine: a line-for-line port of src/ashyqdala/{bin,translit,names,similarity,match}.py.
 * The Python code is the reference. tests/test_js_parity.py runs both on a large corpus and fails on any difference.
 * Keep the two in step: change Python first, then this file. */
(function (root) {
  'use strict';

  // ---- BIN / IIN -----------------------------------------------------------------------------
  const FIRST_WEIGHTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const SECOND_WEIGHTS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 1, 2];

  function normalizeBin(value) {
    if (!value) return null;
    const digits = String(value).replace(/[\s-]/g, '');
    return /^[0-9]{12}$/.test(digits) ? digits : null;
  }
  function checkDigit(firstEleven) {
    if (!/^[0-9]{11}$/.test(firstEleven || '')) return null;
    const d = firstEleven.split('').map(Number);
    let r = d.reduce((s, x, i) => s + x * FIRST_WEIGHTS[i], 0) % 11;
    if (r === 10) r = d.reduce((s, x, i) => s + x * SECOND_WEIGHTS[i], 0) % 11;
    return r === 10 ? null : r;
  }
  function isValidBin(value) {
    const d = normalizeBin(value);
    if (d === null) return false;
    const expected = checkDigit(d.slice(0, 11));
    return expected !== null && expected === Number(d[11]);
  }
  function classifyBin(value) {
    if (!isValidBin(value)) return null;
    return '456'.includes(normalizeBin(value)[4]) ? 'bin' : 'iin';
  }

  // ---- Python-compatible rounding ------------------------------------------------------------
  // Python rounds exact ties half to even; JS toFixed rounds them up. A tie at d digits happens only when
  // x * 2^(d+1) is an odd integer, which is exact in floating point, so it can be detected exactly.
  function pyRound(x, d) {
    const t = x * Math.pow(2, d + 1);
    if (Number.isInteger(t) && Math.abs(t % 2) === 1) {
      const n = (x * Math.pow(10, d));
      const f = Math.floor(n);
      return (f % 2 === 0 ? f : f + 1) / Math.pow(10, d);
    }
    return Number(x.toFixed(d));
  }
  const fmt2 = x => pyRound(x, 2).toFixed(2);

  // ---- transliteration key -------------------------------------------------------------------
  const CYRILLIC = {
    'а': 'a', 'ә': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'ғ': 'g', 'д': 'd', 'е': 'e', 'ё': 'e',
    'ж': 'zh', 'з': 'z', 'и': 'i', 'і': 'i', 'й': 'i', 'к': 'k', 'қ': 'k', 'л': 'l', 'м': 'm',
    'н': 'n', 'ң': 'n', 'о': 'o', 'ө': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
    'ұ': 'u', 'ү': 'u', 'ф': 'f', 'х': 'k', 'һ': 'k', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh',
    'щ': 'sh', 'ъ': '', 'ы': 'i', 'ь': '', 'э': 'e', 'ю': 'iu', 'я': 'ia',
  };
  const LATIN_PRE = { 'ş': 'sh', 'ç': 'ch', 'ı': 'i', 'ğ': 'g', 'ñ': 'n', 'ʼ': '', '’': '', "'": '' };
  // A lone h becomes k, but not inside the sh/zh/ch digraphs. Done with a callback instead of a regex
  // lookbehind, which older Safari and some WebViews cannot parse. Python's re lookbehind is equivalent.
  const loneH = (m, offset, str) => (offset > 0 && 'szc'.includes(str[offset - 1]) ? m : 'k');
  const LATIN_COLLAPSE = [
    [/\bye/g, 'e'], [/kh/g, 'k'], [/h/g, loneH], [/q/g, 'k'], [/x/g, 'ks'],
    [/j/g, 'zh'], [/w/g, 'v'], [/y/g, 'i'], [/c(?=[eiy])/g, 'ts'],
  ];
  const casefold = s => s.toLowerCase().replace(/ß/g, 'ss');

  function matchKey(text) {
    if (!text) return '';
    let s = casefold(String(text).normalize('NFKC'));
    s = Array.from(s).map(c => (c in LATIN_PRE ? LATIN_PRE[c] : c)).join('');
    s = s.normalize('NFKD').replace(/\p{M}/gu, '');
    s = Array.from(s).map(c => (c in CYRILLIC ? CYRILLIC[c] : c)).join('');
    for (const [pattern, repl] of LATIN_COLLAPSE) s = s.replace(pattern, repl);
    s = s.replace(/[^a-z0-9]+/g, ' ').trim();
    s = s.replace(/(.)\1+/g, '$1');
    return s.replace(/\s+/g, ' ');
  }

  // ---- company names -------------------------------------------------------------------------
  const FORMS = [
    [['товарищество', 'с', 'ограниченной', 'ответственностью'], 'llp'],
    [['жауапкершілігі', 'шектеулі', 'серіктестік'], 'llp'],
    [['акционерное', 'общество'], 'jsc'],
    [['акционерлік', 'қоғам'], 'jsc'],
    [['индивидуальный', 'предприниматель'], 'ie'],
    [['жеке', 'кәсіпкер'], 'ie'],
    [['тоо'], 'llp'], [['too'], 'llp'], [['llp'], 'llp'], [['жшс'], 'llp'],
    [['ао'], 'jsc'], [['ao'], 'jsc'], [['jsc'], 'jsc'], [['ақ'], 'jsc'],
    [['ип'], 'ie'], [['ip'], 'ie'], [['ie'], 'ie'], [['жк'], 'ie'],
  ];
  const BY_LENGTH = FORMS.map(f => f).sort((a, b) => b[0].length - a[0].length); // stable, like Python's sorted
  const PUNCT = /[«»"“”„‹›().,;:]/g;

  function parseCompanyName(raw) {
    raw = raw || '';
    let tokens = raw.replace(PUNCT, ' ').split(/\s+/).filter(Boolean);
    const lowered = tokens.map(casefold);
    let form = null;
    for (const [phrase, code] of BY_LENGTH) {
      const n = phrase.length;
      if (tokens.length >= n && lowered.slice(0, n).join(' ') === phrase.join(' ')) { form = code; tokens = tokens.slice(n); break; }
      if (tokens.length >= n && lowered.slice(-n).join(' ') === phrase.join(' ')) { form = code; tokens = tokens.slice(0, -n); break; }
    }
    const core = tokens.join(' ');
    return { raw, form, core, key: matchKey(core) };
  }

  // ---- similarity (Ratcliff/Obershelp) -------------------------------------------------------
  function longest(a, alo, ahi, b, blo, bhi) {
    let bi = alo, bj = blo, bk = 0, prev = new Map();
    for (let i = alo; i < ahi; i++) {
      const cur = new Map();
      for (let j = blo; j < bhi; j++) {
        if (a[i] === b[j]) {
          const k = (prev.get(j - 1) || 0) + 1;
          cur.set(j, k);
          if (k > bk) { bi = i - k + 1; bj = j - k + 1; bk = k; }
        }
      }
      prev = cur;
    }
    return [bi, bj, bk];
  }
  function matched(a, alo, ahi, b, blo, bhi) {
    if (alo >= ahi || blo >= bhi) return 0;
    const [i, j, k] = longest(a, alo, ahi, b, blo, bhi);
    if (k === 0) return 0;
    return k + matched(a, alo, i, b, blo, j) + matched(a, i + k, ahi, b, j + k, bhi);
  }
  function ratio(a, b) {
    const total = a.length + b.length;
    if (total === 0) return 1.0;
    return 2.0 * matched(a, 0, a.length, b, 0, b.length) / total;
  }

  // ---- match decision ------------------------------------------------------------------------
  const MATCH_THRESHOLD = 0.92, REVIEW_THRESHOLD = 0.75, LEGAL_FORM_MISMATCH_FACTOR = 0.8;
  const NUMERIC_MISMATCH_CAP = REVIEW_THRESHOLD + (MATCH_THRESHOLD - REVIEW_THRESHOLD) / 2;

  function nameSimilarity(ka, kb) {
    if (!ka || !kb) return 0.0;
    const direct = ratio(ka, kb);
    const sorted = ratio(ka.split(' ').sort().join(' '), kb.split(' ').sort().join(' '));
    return Math.max(direct, sorted);
  }
  const numbers = key => (key.match(/\d+/g) || []).sort();
  const decide = s => (s >= MATCH_THRESHOLD ? 'match' : s >= REVIEW_THRESHOLD ? 'review' : 'no_match');

  function score(a, b) {
    const reasons = [];
    const binA = normalizeBin(a.bin), binB = normalizeBin(b.bin);
    const usableA = binA !== null && isValidBin(binA), usableB = binB !== null && isValidBin(binB);
    if ((a.bin && !usableA) || (b.bin && !usableB)) reasons.push('bin_invalid_ignored');
    if (usableA && usableB) {
      if (binA === binB) return { score: 1.0, decision: 'match', reasons: [...reasons, 'bin_exact'] };
      return { score: 0.0, decision: 'no_match', reasons: [...reasons, 'bin_conflict'] };
    }
    const na = parseCompanyName(a.name), nb = parseCompanyName(b.name);
    const similarity = nameSimilarity(na.key, nb.key);
    if (similarity === 0.0) return { score: 0.0, decision: 'no_match', reasons: [...reasons, 'name_empty_or_disjoint'] };
    let result = similarity;
    if (na.form && nb.form && na.form !== nb.form) { result *= LEGAL_FORM_MISMATCH_FACTOR; reasons.push('legal_form_mismatch'); }
    if (numbers(na.key).join(',') !== numbers(nb.key).join(',')) {
      result = Math.min(result, NUMERIC_MISMATCH_CAP);
      reasons.push('numeric_token_mismatch');
    }
    reasons.push('name_similarity=' + fmt2(similarity));
    return { score: pyRound(result, 4), decision: decide(result), reasons };
  }

  const Engine = {
    normalizeBin, checkDigit, isValidBin, classifyBin, matchKey, parseCompanyName, ratio, score,
    MATCH_THRESHOLD, REVIEW_THRESHOLD, pyRound, fmt2,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Engine; else root.Engine = Engine;
})(typeof self !== 'undefined' ? self : this);
