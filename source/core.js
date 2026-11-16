/* Almanac of Us: the date engine.
   Pure functions only: no DOM, no network, no storage. The page and the Worker both run this
   file, so the screen, the printed almanac and the calendar feed can never disagree on a date.
   Every date is a whole UTC day number (days since 1970-01-01). */

export const DAY_MS = 86400000;
export const MAX_PEOPLE = 12;
export const FREE_PEOPLE = 2;
export const PRICE_CENTS = 1200;
export const BRAND = 'Almanac of Us';

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const RELATIONS = {
  self: { label: 'Me', group: 'self', noun: '' },
  mother: { label: 'Mother', group: 'parent', noun: 'mother' },
  father: { label: 'Father', group: 'parent', noun: 'father' },
  parent: { label: 'Parent', group: 'parent', noun: 'parent' },
  daughter: { label: 'Daughter', group: 'child', noun: 'daughter' },
  son: { label: 'Son', group: 'child', noun: 'son' },
  child: { label: 'Child', group: 'child', noun: 'child' },
  partner: { label: 'Partner or spouse', group: 'partner', noun: 'partner', since: true },
  sister: { label: 'Sister', group: 'sibling', noun: 'sister' },
  brother: { label: 'Brother', group: 'sibling', noun: 'brother' },
  sibling: { label: 'Sibling', group: 'sibling', noun: 'sibling' },
  grandmother: { label: 'Grandmother', group: 'grandparent', noun: 'grandmother' },
  grandfather: { label: 'Grandfather', group: 'grandparent', noun: 'grandfather' },
  grandparent: { label: 'Grandparent', group: 'grandparent', noun: 'grandparent' },
  granddaughter: { label: 'Granddaughter', group: 'grandchild', noun: 'granddaughter' },
  grandson: { label: 'Grandson', group: 'grandchild', noun: 'grandson' },
  grandchild: { label: 'Grandchild', group: 'grandchild', noun: 'grandchild' },
  friend: { label: 'Friend', group: 'friend', noun: 'friend', since: true },
  dog: { label: 'Dog', group: 'pet', noun: 'dog', since: true },
  cat: { label: 'Cat', group: 'pet', noun: 'cat', since: true }
};
export const RELATION_ORDER = ['mother', 'father', 'parent', 'daughter', 'son', 'child', 'partner', 'sister', 'brother', 'sibling',
  'grandmother', 'grandfather', 'grandparent', 'granddaughter', 'grandson', 'grandchild', 'friend', 'dog', 'cat'];

/* ---------- calendar arithmetic ---------- */

export function pad2(n) { return n < 10 ? '0' + n : '' + n; }
export function num(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
export function ordinal(n) { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
export function isLeap(y) { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }
export function daysInMonth(y, m) { return [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]; }
export function dn(y, m, d) { return Math.round(Date.UTC(y, m - 1, d) / DAY_MS); }
export function parts(n) {
  const t = new Date(n * DAY_MS);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(), w: t.getUTCDay() };
}
export function parseDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s == null ? '' : s));
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (y < 1850 || y > 2150 || mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return null;
  return dn(y, mo, d);
}
export function iso(n) { const p = parts(n); return p.y + '-' + pad2(p.m) + '-' + pad2(p.d); }
export function todayDN(now) { const t = now || new Date(); return dn(t.getFullYear(), t.getMonth() + 1, t.getDate()); }
export function fmtDate(n) { const p = parts(n); return MONTHS[p.m - 1] + ' ' + p.d + ', ' + p.y; }
export function fmtLong(n) { const p = parts(n); return WEEKDAYS[p.w] + ', ' + MONTHS[p.m - 1] + ' ' + p.d + ', ' + p.y; }

/* A leap-day birthday lands on March 1 in common years: the first day a full year has passed. */
export function addYears(n, k) {
  const p = parts(n), y = p.y + k;
  if (p.m === 2 && p.d === 29 && !isLeap(y)) return dn(y, 3, 1);
  return dn(y, p.m, p.d);
}
export function addMonths(n, k) {
  const p = parts(n), total = p.y * 12 + (p.m - 1) + k;
  const y = Math.floor(total / 12), m = (total % 12) + 1;
  return dn(y, m, Math.min(p.d, daysInMonth(y, m)));
}
export function wholeYears(b, day) {
  if (day <= b) return 0;
  let k = Math.floor((day - b) / 365.2425);
  while (addYears(b, k + 1) <= day) k++;
  while (k > 0 && addYears(b, k) > day) k--;
  return k;
}
/* Age as a continuous number of years: whole birthdays plus the fraction of the current one. */
export function ageYears(b, day) {
  if (day <= b) return 0;
  const k = wholeYears(b, day), s = addYears(b, k), e = addYears(b, k + 1);
  return k + (day - s) / (e - s);
}
export function ageYMD(b, day) {
  if (day <= b) return { y: 0, m: 0, d: 0 };
  const y = wholeYears(b, day), anchor = addYears(b, y);
  let m = 0;
  while (m < 11 && addMonths(anchor, m + 1) <= day) m++;
  return { y: y, m: m, d: day - addMonths(anchor, m) };
}
export function joinList(xs) {
  if (xs.length <= 1) return xs.join('');
  return xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1];
}
export function ymdText(a) {
  const bits = [];
  if (a.y) bits.push(a.y + (a.y === 1 ? ' year' : ' years'));
  if (a.m) bits.push(a.m + (a.m === 1 ? ' month' : ' months'));
  if (a.d || !bits.length) bits.push(a.d + (a.d === 1 ? ' day' : ' days'));
  return joinList(bits);
}
export function untilText(today, day) {
  const diff = day - today;
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff === -1) return 'yesterday';
  const a = diff > 0 ? ageYMD(today, day) : ageYMD(day, today);
  let body;
  if (Math.abs(diff) < 61) body = Math.abs(diff) + ' days';
  else if (a.y === 0) body = ymdText({ y: 0, m: a.m, d: a.d });
  else body = ymdText({ y: a.y, m: a.m, d: 0 });
  return diff > 0 ? 'in ' + body : body + ' ago';
}
/* Mean phase of the Moon at midday: 0 new, 0.5 full. Good to about half a day. */
export function moonPhase(day) {
  const lunation = 29.530588853, ref = 10962.76; // new moon of 2000-01-06 18:14 UTC
  const f = ((day + 0.5 - ref) / lunation) % 1;
  return f < 0 ? f + 1 : f;
}

/* ---------- people ---------- */

export function cleanName(s, max) {
  return String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max || 24);
}
export function poss(name) { return name + (/s$/i.test(name) ? '\u2019' : '\u2019s'); }

/* Turns raw form rows into a checked family. Errors are written for the person filling in the form. */
export function normalizeFamily(raw, today) {
  const errors = [];
  const rows = raw && Array.isArray(raw.people) ? raw.people.slice(0, MAX_PEOPLE) : [];
  const people = [];
  rows.forEach(function (r, i) {
    const rel = r && RELATIONS[r.rel] ? r.rel : null;
    const name = cleanName(r && r.name);
    const b = parseDate(r && r.birth);
    if (!rel) { errors.push({ i: i, field: 'rel', msg: 'Choose how this person is related to you.' }); return; }
    if (!name) { errors.push({ i: i, field: 'name', msg: 'Add a first name or a nickname.' }); return; }
    if (b == null) { errors.push({ i: i, field: 'birth', msg: r && r.birth ? 'Check ' + poss(name) + ' date of birth. That day isn’t on the calendar.' : 'Add ' + poss(name) + ' full date of birth.' }); return; }
    if (today != null && b > today) { errors.push({ i: i, field: 'birth', msg: poss(name) + ' birthday is in the future.' }); return; }
    const R = RELATIONS[rel];
    let since = null;
    if (R.since && r.since) {
      since = parseDate(r.since);
      if (since == null) errors.push({ i: i, field: 'since', msg: 'That \u201ctogether since\u201d date isn\u2019t a real date.' });
    }
    people.push({
      id: i, name: name, rel: rel, group: R.group, noun: R.noun, kind: R.group === 'pet' ? 'pet' : 'person',
      b: b, birth: iso(b), since: since, gone: !!(r && r.gone) && rel !== 'self'
    });
  });
  const selves = people.filter(function (p) { return p.rel === 'self'; });
  const self = selves.length === 1 ? selves[0] : null;
  if (!self) errors.push({ i: -1, field: 'self', msg: 'An almanac starts with you: add your own name and birthday.' });
  if (self) people.forEach(function (p) {
    if (p === self) return;
    if ((p.group === 'parent' || p.group === 'grandparent') && p.b >= self.b) {
      errors.push({ i: p.id, field: 'birth', msg: p.name + ' is listed as your ' + p.noun + ', so should be born before you. Check the years.' });
    }
    if ((p.group === 'child' || p.group === 'grandchild') && p.b <= self.b) {
      errors.push({ i: p.id, field: 'birth', msg: p.name + ' is listed as your ' + p.noun + ', so should be born after you. Check the years.' });
    }
    if (p.since != null) {
      if (p.since < Math.max(p.b, self.b)) errors.push({ i: p.id, field: 'since', msg: '\u201cTogether since\u201d can\u2019t be earlier than either birthday.' });
      else if (today != null && p.since > today) errors.push({ i: p.id, field: 'since', msg: '\u201cTogether since\u201d can\u2019t be in the future.' });
    }
  });
  return { ok: errors.length === 0, errors: errors, family: { title: cleanName(raw && raw.title, 40), people: people, self: self } };
}

/* Compact form used inside sealed calendar links. */
export function packFamily(fam) {
  return JSON.stringify({ t: fam.title || '', p: fam.people.map(function (p) { return [p.name, p.birth, p.rel, p.since != null ? iso(p.since) : '', p.gone ? 1 : 0]; }) });
}
export function unpackFamily(text) {
  let o;
  try { o = JSON.parse(text); } catch (e) { return null; }
  if (!o || !Array.isArray(o.p)) return null;
  return { title: o.t || '', people: o.p.map(function (r) { return { name: r[0], birth: r[1], rel: r[2], since: r[3] || '', gone: !!r[4] }; }) };
}

/* ---------- the days ---------- */

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const FOLD = { 3: 'Triple Day', 4: 'Fourfold Day', 5: 'Fivefold Day', 6: 'Sixfold Day', 7: 'Sevenfold Day', 8: 'Eightfold Day', 9: 'Ninefold Day', 10: 'Tenfold Day', 15: 'Fifteenfold Day', 20: 'Twentyfold Day', 25: 'Twenty-Fivefold Day', 50: 'Fiftyfold Day', 100: 'Hundredfold Day', 1000: 'Thousandfold Day' };
const SHARE = { 3: 'a third', 4: 'a quarter', 5: 'a fifth', 6: 'a sixth', 7: 'a seventh', 8: 'an eighth', 9: 'a ninth', 10: 'a tenth' };
const PLANETS = [
  { name: 'Mercury', period: 87.9691, lap: '88 days', counts: [50, 100, 150, 200, 250, 300, 350, 400] },
  { name: 'Venus', period: 224.701, lap: '225 days', counts: [10, 25, 50, 75, 100, 125, 150] },
  { name: 'Mars', period: 686.98, lap: '687 days', counts: [1, 5, 10, 15, 18, 20, 21, 25, 30, 35, 40, 45, 50] },
  { name: 'Jupiter', period: 4332.589, lap: 'just under 12 years', counts: [1, 2, 3, 4, 5, 6, 7, 8] },
  { name: 'Saturn', period: 10759.22, lap: 'about 29 and a half years', counts: [1, 2, 3] },
  { name: 'Uranus', period: 30688.5, lap: '84 years', counts: [1] }
];
const YEAR = 365.2425;

function times(k) { return k <= 12 ? WORDS[k] : num(k); }
function nth(k) { return ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth'][k] || ordinal(k); }

function ev(day, type, weight, label, title, text, who, param, extra) {
  const e = {
    dn: day, type: type, weight: weight, label: label, title: title, text: text,
    who: who.map(function (p) { return p.id; }),
    key: type + ':' + who.map(function (p) { return p.id; }).join('+') + ':' + param
  };
  if (extra) for (const k in extra) e[k] = extra[k];
  return e;
}

function soloEvents(p, out) {
  const n = p.name, b = p.b, P = [p];
  for (let d = 1000; d <= 40000; d += 1000) {
    const span = ymdText(ageYMD(b, b + d));
    if (d === 10000) out.push(ev(b + d, 'myriad', 80, 'Myriad Day', 'Myriad Day: ' + n + ' is 10,000 days old', n + ' has been alive for exactly 10,000 days, which the ancient Greeks counted as one myriad. It comes to ' + span + '.', P, d));
    else out.push(ev(b + d, 'kiloday', d % 5000 === 0 ? 62 : 48, 'kiloday', n + ' is ' + num(d) + ' days old', num(d) + ' days since ' + n + ' was born: ' + span + '.', P, d));
  }
  [11111, 12345, 22222, 33333].forEach(function (d) {
    out.push(ev(b + d, 'odometer', 50, 'Odometer Day', 'Odometer Day: ' + n + ' is ' + num(d) + ' days old', 'The day-counter rolls over to ' + num(d) + ' for ' + n + ': ' + ymdText(ageYMD(b, b + d)) + '.', P, d));
  });
  for (let w = 1000; w <= 5000; w += 1000) {
    out.push(ev(b + w * 7, 'weeks', 46, 'thousand-week day', n + ' is ' + num(w) + ' weeks old', 'Exactly ' + num(w) + ' weeks since ' + n + ' was born. It falls on a ' + WEEKDAYS[parts(b).w] + ', the day of the week ' + n + ' arrived.', P, w));
  }
  [100, 250, 500, 750, 1000].forEach(function (m) {
    out.push(ev(addMonths(b, m), 'months', m >= 500 ? 50 : 42, 'month count', n + ' is ' + num(m) + ' months old', num(m) + ' months to the day since ' + n + ' was born.', P, m));
  });
  [[5e8, 'half a billion', 46], [1e9, 'a billion', 78], [2e9, 'two billion', 74], [3e9, 'three billion', 70]].forEach(function (s) {
    const days = Math.floor(s[0] / 86400), rem = s[0] - days * 86400;
    const h = Math.floor(rem / 3600), mi = Math.floor((rem % 3600) / 60), se = rem % 60;
    const offset = joinList([h + (h === 1 ? ' hour' : ' hours'), mi + ' minutes', se + ' seconds'].filter(function (x) { return x.charAt(0) !== '0'; }));
    out.push(ev(b + days, 'seconds', s[2], s[0] === 1e9 ? 'Billion Day' : 'second count',
      (s[0] === 1e9 ? 'Billion Day: ' : '') + n + ' is ' + s[1] + ' seconds old',
      n + ' passes ' + s[1] + ' seconds alive. The exact moment comes ' + num(days) + ' days, ' + offset + ' after ' + n + ' was born, so a birth late in the evening tips it just past midnight.', P, s[0], { approx: true }));
  });
  [[1e5, 40], [2.5e5, 44], [5e5, 48], [7.5e5, 44]].forEach(function (h) {
    out.push(ev(b + Math.floor(h[0] / 24), 'hours', h[1], 'hour count', n + ' is ' + num(h[0]) + ' hours old', n + ' passes ' + num(h[0]) + ' hours alive today, give or take the hour of birth.', P, h[0], { approx: true }));
  });
  [[1e6, 'a million', 46], [1e7, 'ten million', 44], [2.5e7, '25 million', 40]].forEach(function (m) {
    out.push(ev(b + Math.floor(m[0] / 1440), 'minutes', m[2], 'minute count', n + ' is ' + m[1] + ' minutes old', n + ' passes ' + m[1] + ' minutes alive today, give or take the hour of birth.', P, m[0], { approx: true }));
  });
  PLANETS.forEach(function (pl) {
    pl.counts.forEach(function (c) {
      let w = 36;
      if (pl.name === 'Saturn') w = 72; else if (pl.name === 'Uranus') w = 70; else if (pl.name === 'Jupiter') w = 58;
      else if (pl.name === 'Mars') w = c === 21 ? 56 : 42; else if (c === 100) w = 44;
      out.push(ev(b + Math.round(c * pl.period), 'planet', w, pl.name + ' birthday',
        poss(n) + ' ' + nth(c) + ' ' + pl.name + ' birthday',
        c === 1 ? pl.name + ' has gone around the Sun exactly once since ' + n + ' was born. One lap takes it ' + pl.lap + '.'
          : pl.name + ' has circled the Sun ' + (c === 2 ? 'twice' : times(c) + ' times') + ' since ' + n + ' was born. Each lap takes ' + pl.lap + '.', P, pl.name + c, { planet: pl.name }));
    });
  });
  [100, 250, 500, 750, 1000].forEach(function (m) {
    out.push(ev(b + Math.round(m * 29.530588853), 'moons', m === 1000 ? 70 : (m === 500 ? 56 : 44), m === 1000 ? 'Thousand Moons' : 'moon count',
      m === 1000 ? 'A thousand moons: ' + n : n + ' is ' + m + ' moons old',
      n + ' has lived through ' + num(m) + ' lunar months, each about 29 and a half days from new moon to new moon.' + (m === 1000 ? ' In parts of India, living to see a thousand full moons is honoured with a ceremony, Sahasra Chandra Darshan.' : ''), P, m));
  });
  const born = parts(b);
  out.push(ev(addYears(b, born.d), 'golden', 60, 'golden birthday', 'Golden birthday: ' + n + ' turns ' + born.d + ' on the ' + ordinal(born.d), 'The one birthday when the age matches the date. It happens once in a lifetime.', P, 'g1'));
  if (born.d * 2 <= 62) out.push(ev(addYears(b, born.d * 2), 'golden', 44, 'double golden birthday', 'Double golden birthday: ' + n + ' turns ' + born.d * 2 + ' on the ' + ordinal(born.d), 'Twice the date, on the date. It happens once in a lifetime.', P, 'g2'));
  const yy = born.y % 100;
  if (yy > 0) out.push(ev(addYears(b, yy), 'beddian', 52, 'Beddian birthday', 'Beddian birthday: ' + n + ' turns ' + yy, n + ' was born in ' + born.y + ' and turns ' + yy + ': the age matches the last two digits of the birth year. It is named after Bobby Beddia, a New York firefighter who noticed his own.', P, 'bed'));
}

/* Age pairs. E is the elder, Y the younger. `lineage` means E has been in Y's life from the start
   as a parent or grandparent; `role` is what E is to Y. */
function pairAgeEvents(pr, out) {
  const E = pr.E, Y = pr.Y, g = Y.b - E.b;
  if (g < 1 || Y.gone) return;
  const en = E.name, yn = Y.name, both = [Y, E];
  const echo = Y.b + g, echoAge = ymdText(ageYMD(Y.b, echo));
  const elderPresent = !E.gone && 2 * g <= 105 * YEAR;
  let text;
  if (!elderPresent) text = yn + ' is exactly the age ' + en + ' was on the day ' + yn + ' was born: ' + echoAge + '.';
  else if (pr.lineage) text = yn + ' is exactly the age ' + en + ' was on the day ' + yn + ' was born. ' + en + ' is exactly twice ' + poss(yn) + ' age, and has spent exactly half a lifetime as ' + poss(yn) + ' ' + pr.role + '.';
  else text = yn + ' is exactly the age ' + en + ' was on the day ' + yn + ' was born, which makes ' + en + ' exactly twice as old as ' + yn + '. It is true for one day.';
  out.push(ev(echo, 'echo', pr.lineage ? 100 : 44, 'Echo Day', 'Echo Day: ' + yn + ' and ' + en, text, both, 'k2',
    { need: [Y.id], elder: E.id, younger: Y.id, gap: g, age: echoAge, lineage: !!pr.lineage, role: pr.role || '', full: elderPresent }));

  if (2 * g <= 105 * YEAR) {
    out.push(ev(Y.b + 2 * g, 'halfagain', pr.lineage ? 64 : 40, 'Half-Again Day', 'Half-Again Day: ' + yn + ' and ' + en,
      E.gone || 3 * g > 105 * YEAR ? yn + ' is now twice the age ' + en + ' was on the day ' + yn + ' was born.'
        : yn + ' is now twice the age ' + en + ' was on the day ' + yn + ' was born, and ' + en + ' is exactly one and a half times as old as ' + yn + '.',
      both, 'k1.5', { need: [Y.id] }));
  }
  if (E.gone) return;
  (pr.lineage ? [3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 25, 50, 100, 1000] : [3, 4, 5, 10]).forEach(function (k) {
    const off = Math.floor(g / (k - 1));
    if (off < 1) return;
    let w = 40;
    if (pr.lineage) w = k <= 10 ? 68 : (k >= 100 ? 60 : 52);
    out.push(ev(Y.b + off, 'multiple', w, FOLD[k], FOLD[k] + ': ' + en + ' is ' + times(k) + ' times ' + poss(yn) + ' age',
      en + ' is exactly ' + times(k) + ' times as old as ' + yn + (pr.lineage && SHARE[k] ? ', and has spent exactly ' + SHARE[k] + ' of a lifetime as ' + poss(yn) + ' ' + pr.role : '') + '. It is true for one day.',
      both, 'k' + k));
  });
}

function sumDay(births, S) {
  const start = Math.max.apply(null, births);
  const total = function (d) { let t = 0; for (let i = 0; i < births.length; i++) t += ageYears(births[i], d); return t; };
  if (total(start) >= S) return null;
  let lo = start, hi = start + 40200;
  if (total(hi) < S) return null;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (total(mid) >= S) hi = mid; else lo = mid; }
  return hi;
}

function pairSumEvents(pr, out) {
  const A = pr.a, B = pr.b;
  if (A.gone || B.gone) return;
  const names = A.name + ' and ' + B.name, both = [A, B];
  (pr.couple ? [40, 50, 60, 70, 75, 80, 90, 100, 110, 120, 125, 130, 140, 150] : [50, 75, 100, 125, 150, 175, 200]).forEach(function (S) {
    const d = sumDay([A.b, B.b], S);
    if (d == null) return;
    if (S === 100) out.push(ev(d, 'sum', pr.couple ? 86 : 74, 'Century Day', 'Century Day: ' + names, 'Add their ages together and ' + names + ' are exactly 100 years old today. A century between them.', both, 's' + S));
    else out.push(ev(d, 'sum', S % 50 === 0 ? 60 : 46, 'combined age', names + ' are ' + S + ' between them', 'Add their ages together and ' + names + ' are exactly ' + S + ' years old today.', both, 's' + S));
  });
  if (pr.couple) [20000, 25000, 30000, 40000, 50000].forEach(function (N) {
    const d = Math.ceil((N + A.b + B.b) / 2);
    if (d >= Math.max(A.b, B.b)) out.push(ev(d, 'sumdays', 40, 'combined days', names + ': ' + num(N) + ' days between them', 'Count every day each of them has been alive and the total reaches ' + num(N) + ' today.', both, 'n' + N));
  });
}

/* Days counted from a shared starting date: the day two people met, married, or the day a pet came home. */
function pairSinceEvents(pr, out) {
  const A = pr.a, B = pr.b, s = pr.since;
  if (s == null || A.gone || B.gone) return;
  const pet = B.kind === 'pet', names = A.name + ' and ' + B.name, both = [A, B];
  const from = pet ? 'since ' + B.name + ' came home' : 'since day one for ' + names;
  [100, 500, 1000, 1500, 2000, 2500, 3000, 4000, 5000, 6000, 7000, 7500, 8000, 9000, 10000, 11111, 12345, 15000, 20000, 25000].forEach(function (N) {
    const span = ymdText(ageYMD(s, s + N));
    if (N === 10000) out.push(ev(s + N, 'tmyriad', 84, 'Myriad Day', 'Myriad Day: 10,000 days of ' + names, 'Ten thousand days ' + from + ', which the ancient Greeks counted as one myriad. It comes to ' + span + '.', both, 'td' + N));
    else {
      let w = 46;
      if (N % 1000 === 0) w = N % 5000 === 0 ? 70 : 62; else if (N === 100 || N === 500 || N > 11000) w = 52;
      out.push(ev(s + N, 'tdays', w, 'day count together', num(N) + ' days of ' + names, num(N) + ' days ' + from + ': ' + span + '.', both, 'td' + N));
    }
  });
  [100, 500, 1000, 1500, 2000, 2500].forEach(function (w) {
    out.push(ev(s + w * 7, 'tweeks', w === 1000 ? 55 : 44, 'week count together', num(w) + ' weeks of ' + names, 'Exactly ' + num(w) + ' weeks ' + from + '.', both, 'tw' + w));
  });
  [100, 200, 250, 300, 400, 500, 600, 700, 750].forEach(function (m) {
    out.push(ev(addMonths(s, m), 'tmonths', m === 500 ? 55 : 44, 'month count together', m + ' months of ' + names, m + ' months to the day ' + from + '.', both, 'tm' + m));
  });
  [[1e4, 50, ' That is the figure usually quoted for mastering a craft.'], [5e4, 42, ''], [1e5, 50, ''], [2.5e5, 46, ''], [5e5, 50, '']].forEach(function (h) {
    out.push(ev(s + Math.floor(h[0] / 24), 'thours', h[1], 'hour count together', num(h[0]) + ' hours of ' + names, num(h[0]) + ' hours ' + from + ', give or take a few.' + h[2], both, 'th' + h[0], { approx: true }));
  });
  [[1e8, '100 million', 46], [5e8, 'Half a billion', 50], [1e9, 'A billion', 80]].forEach(function (x) {
    out.push(ev(s + Math.floor(x[0] / 86400), 'tseconds', x[2], x[0] === 1e9 ? 'Billion Day' : 'second count together',
      (x[0] === 1e9 ? 'Billion Day: a' : x[1]) + (x[0] === 1e9 ? ' billion' : '') + ' seconds of ' + names, x[1] + ' seconds ' + from + ', to within a day.', both, 'ts' + x[0], { approx: true }));
  });
  /* The share of one person's life the other has been in it. */
  const shares = [[1, 4, 'a quarter', 46], [1, 3, 'a third', 46], [1, 2, 'half', 92], [2, 3, 'two-thirds', 58], [3, 4, 'three-quarters', 58], [9, 10, 'nine-tenths', 60]];
  (pet ? [A] : [A, B]).forEach(function (P) {
    const O = P === A ? B : A;
    shares.forEach(function (f) {
      const d = Math.floor((f[1] * s - f[0] * P.b) / (f[1] - f[0]));
      if (d <= s) return;
      if (f[0] === 1 && f[1] === 2) {
        out.push(ev(d, 'halflife', 92, 'Half-Life Day', 'Half-Life Day: ' + P.name + ' and ' + O.name,
          pet ? O.name + ' has now been part of exactly half of ' + poss(P.name) + ' life. From tomorrow it is more than half.'
            : P.name + ' has now shared exactly half a lifetime with ' + O.name + '. From tomorrow it is more than half.', [P, O], 'hl', { of: P.id }));
      } else {
        out.push(ev(d, 'lifeshare', f[3], 'share of a lifetime', P.name + ': ' + f[2] + ' of a lifetime with ' + O.name,
          pet ? O.name + ' has now been part of exactly ' + f[2] + ' of ' + poss(P.name) + ' life.' : P.name + ' has now shared exactly ' + f[2] + ' of a lifetime with ' + O.name + '.', [P, O], 'ls' + f[0] + '-' + f[1], { of: P.id }));
      }
    });
  });
}

/* The usual veterinary rule of thumb: 15 for the first year, 9 for the second, then 5 a year for a dog and 4 for a cat. */
export function petYears(species, ageDays) {
  const y = ageDays / YEAR, step = species === 'cat' ? 4 : 5;
  if (y <= 1) return 15 * y;
  if (y <= 2) return 15 + 9 * (y - 1);
  return 24 + step * (y - 2);
}
function petEvents(pet, humans, self, out) {
  if (pet.gone) return;
  const n = pet.name, sp = pet.rel, step = sp === 'cat' ? 4 : 5;
  const rule = 'By the vets\u2019 rule of thumb: 15 ' + sp + ' years for the first year, 9 for the second and ' + step + ' for each year after.';
  for (let d = 1000; d <= 7000; d += 1000) out.push(ev(pet.b + d, 'kiloday', 44, 'kiloday', n + ' is ' + num(d) + ' days old', num(d) + ' days since ' + n + ' was born: ' + ymdText(ageYMD(pet.b, pet.b + d)) + '.', [pet], d));
  [18, 21, 30, 40, 50, 60, 70, 80, 90, 100].forEach(function (R) {
    const y = R <= 15 ? R / 15 : (R <= 24 ? 1 + (R - 15) / 9 : 2 + (R - 24) / step);
    out.push(ev(pet.b + Math.round(y * YEAR), 'petyears', 46, sp + ' years', n + ' turns ' + R + ' in ' + sp + ' years', rule, [pet], 'r' + R));
  });
  humans.forEach(function (h) {
    if (h.gone || h.b >= pet.b) return;
    let lo = pet.b, hi = pet.b + Math.round(22 * YEAR);
    const ahead = function (d) { return petYears(sp, d - pet.b) >= ageYears(h.b, d); };
    if (!ahead(hi)) return;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (ahead(mid)) hi = mid; else lo = mid; }
    const age = wholeYears(h.b, hi);
    out.push(ev(hi, 'overtake', 70, 'Overtake Day', 'Overtake Day: ' + n + ' catches up with ' + h.name,
      'In ' + sp + ' years, ' + n + ' is ' + age + ' today. So is ' + h.name + '. From tomorrow ' + n + ' is the elder. ' + rule, [pet, h], 'ot'));
  });
  if (pet.since != null && self) pairSinceEvents({ a: self, b: pet, since: pet.since }, out);
}

function familyEvents(fam, humans, out) {
  const alive = humans.filter(function (p) { return !p.gone; });
  if (alive.length >= 3) {
    const births = alive.map(function (p) { return p.b; }), names = joinList(alive.map(function (p) { return p.name; }));
    for (let S = 100; S <= 1000; S += 50) {
      const d = sumDay(births, S);
      if (d != null) out.push(ev(d, 'famsum', S % 100 === 0 ? 70 : 58, 'whole-family age', 'All together now: ' + S + ' years', 'Add up the ages of ' + names + ' and the total is exactly ' + S + ' years today.', alive, 'f' + S));
    }
  }
  /* Add-Up Day: the children's ages total the parent's. */
  const self = fam.self;
  if (!self) return;
  const groups = [];
  const kids = alive.filter(function (p) { return p.group === 'child'; });
  if (kids.length >= 2 && !self.gone) groups.push([self, kids]);
  const sibs = alive.filter(function (p) { return p.group === 'sibling'; });
  alive.filter(function (p) { return p.group === 'parent'; }).forEach(function (par) {
    const brood = [self].concat(sibs).filter(function (c) { return c.b > par.b; });
    if (brood.length >= 2) groups.push([par, brood]);
  });
  groups.forEach(function (gp) {
    const par = gp[0], cs = gp[1];
    let sum = 0, last = 0;
    cs.forEach(function (c) { sum += c.b; last = Math.max(last, c.b); });
    const d = Math.floor((sum - par.b) / (cs.length - 1));
    if (d <= last) return;
    out.push(ev(d, 'addup', 76, 'Add-Up Day', 'Add-Up Day: ' + par.name, 'The ages of ' + joinList(cs.map(function (c) { return c.name; })) + ' add up to exactly ' + poss(par.name) + ' age today.', [par].concat(cs), 'au'));
  });
}

function buildPairs(fam) {
  const self = fam.self, pairs = [];
  if (!self) return pairs;
  const humans = fam.people.filter(function (p) { return p.kind === 'person' && p !== self; });
  humans.forEach(function (o) {
    const elderIsOther = o.b <= self.b, E = elderIsOther ? o : self, Y = elderIsOther ? self : o;
    let lineage = false, role = '';
    if ((o.group === 'parent' || o.group === 'grandparent') && elderIsOther) { lineage = true; role = o.noun; }
    if ((o.group === 'child' || o.group === 'grandchild') && !elderIsOther) { lineage = true; role = o.group === 'child' ? 'parent' : 'grandparent'; }
    pairs.push({ E: E, Y: Y, a: self, b: o, lineage: lineage, role: role, since: o.since, couple: o.group === 'partner' });
  });
  ['child', 'grandchild'].forEach(function (grp) {
    const set = humans.filter(function (p) { return p.group === grp; });
    for (let i = 0; i < set.length; i++) for (let j = i + 1; j < set.length; j++) {
      const E = set[i].b <= set[j].b ? set[i] : set[j], Y = E === set[i] ? set[j] : set[i];
      pairs.push({ E: E, Y: Y, a: E, b: Y, lineage: false, role: '', since: null, couple: false });
    }
  });
  const partner = humans.filter(function (p) { return p.group === 'partner'; })[0];
  if (partner) humans.filter(function (p) { return p.group === 'child'; }).forEach(function (c) {
    if (c.b > partner.b) pairs.push({ E: partner, Y: c, a: partner, b: c, lineage: false, role: '', since: null, couple: false });
  });
  const folks = humans.filter(function (p) { return p.group === 'parent'; });
  if (folks.length === 2) pairs.push({ E: folks[0], Y: folks[1], a: folks[0], b: folks[1], sumOnly: true, since: null, couple: true });
  return pairs;
}

/* Every hidden day for a family, earliest first. */
export function computeEvents(fam) {
  const out = [];
  const humans = fam.people.filter(function (p) { return p.kind === 'person'; });
  humans.forEach(function (p) { if (!p.gone) soloEvents(p, out); });
  buildPairs(fam).forEach(function (pr) {
    if (!pr.sumOnly) pairAgeEvents(pr, out);
    pairSumEvents(pr, out);
    if (!pr.sumOnly && pr.since != null) pairSinceEvents(pr, out);
  });
  fam.people.filter(function (p) { return p.kind === 'pet'; }).forEach(function (pet) { petEvents(pet, humans, fam.self, out); });
  familyEvents(fam, humans, out);

  const byId = {};
  fam.people.forEach(function (p) { byId[p.id] = p; });
  const seen = {};
  return out.filter(function (e) {
    if (seen[e.key]) return false;
    seen[e.key] = true;
    return (e.need || e.who).every(function (id) {
      const p = byId[id], age = e.dn - p.b;
      return age >= 0 && age <= (p.kind === 'pet' ? 22 : 105) * YEAR;
    });
  }).sort(function (a, b) { return a.dn - b.dn || b.weight - a.weight; });
}

/* The one day to lead with for the first pair in a family. */
export function heroFor(fam, events, today) {
  const self = fam.self;
  if (!self) return null;
  const o = fam.people.filter(function (p) { return p !== self; })[0];
  if (!o) return null;
  const shared = events.filter(function (e) { return e.who.indexOf(self.id) >= 0 && e.who.indexOf(o.id) >= 0; });
  const echo = shared.filter(function (e) { return e.type === 'echo'; })[0];
  if (echo && echo.lineage) return echo;
  let best = null, bestScore = -1e9;
  shared.forEach(function (e) {
    if (e.dn < today || e.dn > today + 7305) return;
    const score = e.weight - 1.5 * (e.dn - today) / YEAR;
    if (score > bestScore) { bestScore = score; best = e; }
  });
  return best || echo || shared[shared.length - 1] || null;
}

/* ---------- calendar file ---------- */

function icsText(s) { return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
function icsDay(n) { const p = parts(n); return '' + p.y + pad2(p.m) + pad2(p.d); }
function icsFold(line) {
  const out = [];
  let rest = line, width = 60;
  while (rest.length > width) {
    let cut = width;
    const c = rest.charCodeAt(cut - 1);
    if (c >= 0xd800 && c <= 0xdbff) cut -= 1;
    out.push(rest.slice(0, cut));
    rest = ' ' + rest.slice(cut);
  }
  out.push(rest);
  return out.join('\r\n');
}
export function buildICS(events, opts) {
  const o = opts || {}, stamp = o.stamp || '20260101T000000Z';
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Almanac of Us//Hidden Days//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:' + icsText(o.name || BRAND), 'X-WR-CALDESC:' + icsText('The red-letter days nobody else is counting.'),
    'REFRESH-INTERVAL;VALUE=DURATION:P1D', 'X-PUBLISHED-TTL:P1D'];
  const add = function (uid, day, summary, description) {
    lines.push('BEGIN:VEVENT', 'UID:' + uid.replace(/[^A-Za-z0-9.]/g, '-') + '@almanacofus', 'DTSTAMP:' + stamp,
      'DTSTART;VALUE=DATE:' + icsDay(day), 'DTEND;VALUE=DATE:' + icsDay(day + 1),
      'SUMMARY:' + icsText(summary), 'DESCRIPTION:' + icsText(description), 'TRANSP:TRANSPARENT', 'END:VEVENT');
  };
  const tail = o.url ? '\n\n' + o.url : '';
  events.forEach(function (e) {
    add(e.key, e.dn, e.title, e.text + tail);
    if (o.headsUp && e.weight >= 80) add('soon-' + e.key, e.dn - 7, 'In one week: ' + e.title, 'A week from today, on ' + fmtLong(e.dn) + ': ' + e.text + tail);
  });
  lines.push('END:VCALENDAR');
  return lines.map(icsFold).join('\r\n') + '\r\n';
}
