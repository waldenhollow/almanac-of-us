/* Almanac of Us: the page. The build puts core.js and this file inside one function,
   so the engine's names (computeEvents, fmtLong and the rest) are in scope here. */

const MODE = '__MODE__';   // 'live' on the real site, 'preview' in the private preview
const LIVE = MODE === 'live';
const FREE = MODE === 'free';   // everything unlocked, no server at all
const OWN = MODE !== 'preview';  // a real page of its own: plain downloads and printing work
const SITE = '__SITE__' || (location.host + location.pathname).replace(/\/(index\.html)?$/, '');
const STORE = 'almanac-of-us:v1';
const PRICE_TEXT = '$' + (PRICE_CENTS % 100 ? (PRICE_CENTS / 100).toFixed(2) : String(PRICE_CENTS / 100));
const SVGNS = 'http://www.w3.org/2000/svg';

const state = { rows: [], seq: 0, title: '', key: '', tab: 'next', year: 0, shared: null, lastHero: '' };
let model = null;
let downloads = null;

/* ---------- small helpers ---------- */

function $(id) { return document.getElementById(id); }
function el(tag, attrs, kids) {
  const node = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  if (kids != null) (Array.isArray(kids) ? kids : [kids]).forEach(function (c) {
    if (c != null && c !== false) node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return node;
}
function sv(tag, attrs, text) {
  const n = document.createElementNS(SVGNS, tag);
  if (attrs) for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (text != null) n.textContent = text;
  return n;
}
function para(text, cls) { return el('p', { class: cls || null, text: text }); }

let toastTimer = 0;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { t.hidden = true; }, 3400);
}
function openSheet(title, nodes) {
  $('sheetTitle').textContent = title;
  const body = $('sheetBody');
  body.textContent = '';
  nodes.forEach(function (n) { if (n) body.appendChild(n); });
  const d = $('sheet');
  if (!d.open) { try { d.showModal(); } catch (e) { d.setAttribute('open', ''); } }
}
function closeSheet() {
  const d = $('sheet');
  if (d.open) { try { d.close(); } catch (e) { d.removeAttribute('open'); } }
}
function copyText(text, done) {
  const no = function () { toast('Select the text and copy it by hand.'); };
  try { navigator.clipboard.writeText(text).then(function () { toast(done || 'Copied.'); }, no); } catch (e) { no(); }
}
function linkBox(value, label) {
  return el('input', { class: 'linkbox', type: 'text', readonly: true, value: value, 'aria-label': label, onfocus: function (ev) { ev.target.select(); } });
}

/* Saving a file. Inside the preview the host has to offer the file, so we ask it to;
   on the live site an ordinary download link does the job. */
async function saveFile(filename, data) {
  if (downloads) {
    try { await downloads.save({ filename: filename, data: data }); toast('Saved.'); return; }
    catch (err) { if (!err || err.code !== 'declined') toast('Saving isn’t available in this view.'); return; }
  }
  if (!LIVE && window.claude) { toast('Saving isn’t available in this view.'); return; }
  const blob = data instanceof Blob ? data : new Blob([data]);
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
}

async function call(path, body) {
  const res = await fetch(path, body === undefined ? undefined : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  let data = null;
  try { data = await res.json(); } catch (e) { data = null; }
  if (!res.ok) {
    const err = new Error((data && data.message) || 'Something went wrong on our side. Try again in a minute.');
    err.code = data && data.error;
    throw err;
  }
  return data;
}

/* ---------- state ---------- */

function blankRow(rel) {
  state.seq += 1;
  return { uid: state.seq, name: '', rel: rel, bm: '', bd: '', by: '', sm: '', sd: '', sy: '', gone: false };
}
function loadState() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(STORE) || 'null'); } catch (e) { saved = null; }
  if (saved && Array.isArray(saved.rows) && saved.rows.length >= 2 && saved.rows[0].rel === 'self') {
    state.rows = saved.rows.slice(0, MAX_PEOPLE).filter(function (r) { return r && RELATIONS[r.rel]; });
    state.seq = Math.max.apply(null, state.rows.map(function (r) { return +r.uid || 0; }).concat([+saved.seq || 0]));
    state.title = typeof saved.title === 'string' ? saved.title : '';
    state.key = typeof saved.key === 'string' && (LIVE || saved.key === 'PREVIEW') ? saved.key : '';
  }
  if (state.rows.length < 2) state.rows = [blankRow('self'), blankRow('mother')];
}
function saveState() {
  try { localStorage.setItem(STORE, JSON.stringify({ rows: state.rows, seq: state.seq, title: state.title, key: state.key })); } catch (e) { /* private window: carry on without it */ }
}
function isoFrom(y, m, d) {
  if (!/^\d{4}$/.test(y) || !m || !/^\d{1,2}$/.test(d)) return '';
  return y + '-' + pad2(+m) + '-' + pad2(+d);
}
function rowRaw(r) {
  const birth = isoFrom(r.by, r.bm, r.bd);
  if (!cleanName(r.name) || !birth) return null;
  return { name: r.name, rel: r.rel, birth: birth, since: isoFrom(r.sy, r.sm, r.sd), gone: !!r.gone };
}
function currentRaw() {
  const filled = state.rows.map(rowRaw), others = filled.slice(1).filter(Boolean);
  if (!filled[0] || !others.length) return null;
  return { title: state.title, people: [filled[0]].concat(others) };
}
function exampleFamily(today) {
  const mom = dn(1968, 6, 21), kid = Math.floor((today + 12 + mom) / 2);
  return { title: '', people: [{ name: 'Ana', rel: 'self', birth: iso(kid) }, { name: 'Rosa', rel: 'mother', birth: iso(mom) }] };
}

function compute() {
  const today = todayDN();
  const raw = state.shared || currentRaw();
  let res = raw ? normalizeFamily(raw, today) : null, example = false, problem = '';
  if (res && !res.ok) { problem = res.errors[0].msg; res = null; }
  if (!res) { res = normalizeFamily(exampleFamily(today), today); example = true; }
  const fam = res.family, events = computeEvents(fam), byId = {};
  fam.people.forEach(function (p) { byId[p.id] = p; });
  const horizon = today + 3653;
  const upcoming = events.filter(function (e) { return e.dn >= today && e.dn <= horizon; });
  const past = events.filter(function (e) { return e.dn < today && e.weight >= 50; }).reverse();
  const hero = heroFor(fam, events, today);
  const unlocked = FREE || !!state.key || !!state.shared;
  let free = [];
  if (!unlocked) {
    const heroAhead = !!hero && hero.dn >= today && hero.dn <= horizon;
    free = upcoming.filter(function (e) { return !hero || e.key !== hero.key; }).slice(0, heroAhead ? 2 : 3);
    if (heroAhead) free.push(hero);
    free.sort(function (a, b) { return a.dn - b.dn; });
  }
  model = { today: today, fam: fam, events: events, byId: byId, horizon: horizon, upcoming: upcoming, past: past, hero: hero, example: example, problem: problem, unlocked: unlocked, free: free };
}
function isYou(p) { return !model.example && !state.shared && p === model.fam.self; }

/* ---------- the people form ---------- */

function triple(id, label, r, keys) {
  const sel = el('select', { id: id + '-m', 'aria-label': label + ', month' },
    [el('option', { value: '', text: 'Month' })].concat(MONTHS.map(function (m, i) { return el('option', { value: String(i + 1), text: m }); })));
  sel.value = r[keys[0]];
  const day = el('input', { id: id + '-d', type: 'text', inputmode: 'numeric', maxlength: '2', placeholder: 'Day', autocomplete: 'off', 'aria-label': label + ', day', value: r[keys[1]] });
  const year = el('input', { id: id + '-y', type: 'text', inputmode: 'numeric', maxlength: '4', placeholder: 'Year', autocomplete: 'off', 'aria-label': label + ', year', value: r[keys[2]] });
  sel.addEventListener('change', function () { r[keys[0]] = sel.value; changed(); });
  day.addEventListener('input', function () { day.value = day.value.replace(/\D/g, ''); r[keys[1]] = day.value; changed(); });
  year.addEventListener('input', function () { year.value = year.value.replace(/\D/g, ''); r[keys[2]] = year.value; changed(); });
  return [el('span', { text: label }), el('div', { class: 'triple' }, [sel, day, year])];
}
function rowNode(r, i) {
  const id = 'p' + r.uid, me = i === 0, R = RELATIONS[r.rel];
  const row = el('fieldset', { class: 'row' }, [el('legend', { class: 'sr', text: me ? 'You' : 'Person ' + (i + 1) })]);
  const name = el('input', { id: id + '-name', type: 'text', maxlength: '24', autocomplete: 'off', placeholder: me ? 'Ana' : 'Rosa', value: r.name });
  name.addEventListener('input', function () { r.name = name.value; changed(); });
  row.appendChild(el('label', { class: 'f name' }, [el('span', { text: me ? 'Your first name' : 'Their first name' }), name]));
  if (!me) {
    const rel = el('select', { id: id + '-rel' }, RELATION_ORDER.map(function (k) { return el('option', { value: k, text: RELATIONS[k].label }); }));
    rel.value = r.rel;
    rel.addEventListener('change', function () { r.rel = rel.value; renderRows(); const again = $(id + '-rel'); if (again) again.focus(); changed(); });
    row.appendChild(el('label', { class: 'f rel' }, [el('span', { text: 'Is my' }), rel]));
  }
  row.appendChild(el('div', { class: 'f when-born' }, triple(id + '-b', 'Born', r, ['bm', 'bd', 'by'])));
  if (!me && R.since) {
    const label = R.group === 'pet' ? 'Came home (optional)' : (R.group === 'friend' ? 'Friends since (optional)' : 'Together since (optional)');
    row.appendChild(el('div', { class: 'f since' }, triple(id + '-s', label, r, ['sm', 'sd', 'sy'])));
  }
  if (!me) {
    const gone = el('input', { id: id + '-gone', type: 'checkbox' });
    gone.checked = !!r.gone;
    gone.addEventListener('change', function () { r.gone = gone.checked; changed(); });
    row.appendChild(el('div', { class: 'tail' }, [
      el('label', { class: 'gone' }, [gone, 'No longer with us']),
      i >= 2 ? el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Remove ' + (cleanName(r.name) || 'this person'), text: '×',
        onclick: function () { state.rows.splice(state.rows.indexOf(r), 1); renderRows(); changed(); } }) : null
    ]));
  }
  return row;
}
function renderRows() {
  const host = $('rows');
  host.textContent = '';
  state.rows.forEach(function (r, i) { host.appendChild(rowNode(r, i)); });
  $('addPerson').disabled = state.rows.length >= MAX_PEOPLE;
}
let changeTimer = 0;
function changed() {
  clearTimeout(changeTimer);
  changeTimer = setTimeout(function () { saveState(); refresh(); }, 180);
}

/* ---------- the moon ---------- */

function moonPath(f, cx, cy, r) {
  const w = Math.cos(2 * Math.PI * f), rx = Math.max(0.01, Math.abs(w) * r), waxing = f < 0.5;
  const top = cx + ' ' + (cy - r), bottom = cx + ' ' + (cy + r);
  return 'M' + top + ' A' + r + ' ' + r + ' 0 0 ' + (waxing ? 1 : 0) + ' ' + bottom + ' A' + rx + ' ' + r + ' 0 0 ' + ((w > 0) === waxing ? 0 : 1) + ' ' + top + ' Z';
}
function moonName(f) {
  if (f < 0.03 || f > 0.97) return 'new moon';
  if (f < 0.22) return 'waxing crescent';
  if (f < 0.28) return 'first quarter';
  if (f < 0.47) return 'waxing gibbous';
  if (f < 0.53) return 'full moon';
  if (f < 0.72) return 'waning gibbous';
  if (f < 0.78) return 'last quarter';
  return 'waning crescent';
}
function moonNode(day, size) {
  const f = moonPhase(day), r = size / 2 - 1, c = size / 2;
  const s = sv('svg', { class: 'moon', width: size, height: size, viewBox: '0 0 ' + size + ' ' + size, role: 'img', 'aria-label': moonName(f) });
  s.appendChild(sv('title', null, 'Moon that night: ' + moonName(f)));
  s.appendChild(sv('circle', { class: 'disc', cx: c, cy: c, r: r }));
  s.appendChild(sv('path', { class: 'lit', d: moonPath(f, c, c, r - 0.5) }));
  return s;
}

/* ---------- the day ---------- */

function echoTruths(e) {
  const m = model, Y = m.byId[e.younger], E = m.byId[e.elder], past = e.dn < m.today, fut = e.dn > m.today;
  const yy = isYou(Y), ye = isYou(E);
  const be = function (second) { return past ? (second ? 'were' : 'was') : (fut ? 'will be' : (second ? 'are' : 'is')); };
  const spent = function (second) { return past ? 'had spent' : (fut ? 'will have spent' : (second ? 'have spent' : 'has spent')); };
  const out = [(yy ? 'You' : Y.name) + ' ' + be(yy) + ' exactly the age ' + (ye ? 'you were' : E.name + ' was') + ' on the day ' + (yy ? 'you were' : Y.name + ' was') + ' born: ' + e.age + '.'];
  if (e.full) {
    out.push((ye ? 'You' : E.name) + ' ' + be(ye) + ' exactly twice ' + (yy ? 'your' : poss(Y.name)) + ' age.');
    if (e.lineage) out.push((ye ? 'You' : E.name) + ' ' + spent(ye) + ' exactly half ' + (ye ? 'your life' : 'a lifetime') + ' as ' + (yy ? 'your' : poss(Y.name)) + ' ' + e.role + '.');
  }
  return out;
}
function whoLine(e) {
  const m = model;
  if (m.example) {
    const me = m.fam.self, o = m.fam.people[1];
    return me.name + ', born ' + fmtDate(me.b) + ', and her mother ' + o.name + ', born ' + fmtDate(o.b);
  }
  const names = e.who.map(function (id) { return isYou(m.byId[id]) ? 'you' : m.byId[id].name; });
  const line = joinList(names);
  return line.charAt(0).toUpperCase() + line.slice(1);
}
function shortSpan(a) { return a.y ? a.y + ' yrs' + (a.m ? ' ' + a.m + ' mo' : '') : a.m + ' mo'; }

function drawLifelines(host, e) {
  const m = model, E = m.byId[e.elder], Y = m.byId[e.younger];
  host.textContent = '';
  const W = Math.max(280, Math.min(700, Math.floor(host.getBoundingClientRect().width) || 600)), H = 170;
  const t0 = E.b, last = Math.max(e.dn, m.today), t1 = last + Math.round((last - t0) * 0.05);
  const x = function (d) { return Math.round((2 + (d - t0) / (t1 - t0) * (W - 4)) * 10) / 10; };
  const gap = shortSpan(ageYMD(E.b, Y.b));
  const s = sv('svg', { class: 'll', width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, role: 'img',
    'aria-label': 'Two lifelines. ' + Y.name + ' is born when ' + E.name + ' is ' + gap + ' old, and reaches that same age on Echo Day.' });
  const bracket = function (x1, x2, y) {
    s.appendChild(sv('path', { class: 'span', d: 'M' + x1 + ' ' + (y - 4) + ' V' + (y + 4) + ' M' + x1 + ' ' + y + ' H' + x2 + ' M' + x2 + ' ' + (y - 4) + ' V' + (y + 4) }));
    s.appendChild(sv('text', { x: (x1 + x2) / 2, y: y + 17, 'text-anchor': 'middle' }, gap));
  };
  s.appendChild(sv('text', { class: 'nm', x: x(E.b), y: 14 }, E.name));
  s.appendChild(sv('rect', { class: 'bar-e', x: x(E.b), y: 22, width: x(t1) - x(E.b), height: 10 }));
  bracket(x(E.b), x(Y.b), 44);
  s.appendChild(sv('text', { class: 'nm', x: x(Y.b) + 6, y: 82 }, Y.name));
  s.appendChild(sv('rect', { class: 'bar-y', x: x(Y.b), y: 90, width: x(t1) - x(Y.b), height: 10 }));
  bracket(x(Y.b), x(e.dn), 112);
  s.appendChild(sv('line', { class: 'born', x1: x(Y.b), x2: x(Y.b), y1: 22, y2: 100 }));
  s.appendChild(sv('line', { class: 'echo', x1: x(e.dn), x2: x(e.dn), y1: 4, y2: 142 }));
  s.appendChild(sv('text', { class: 'mark', x: x(e.dn) - 7, y: 14, 'text-anchor': 'end' }, 'Echo Day'));
  s.appendChild(sv('line', { class: 'span', x1: x(t0), x2: x(t1), y1: 142, y2: 142 }));
  s.appendChild(sv('text', { x: x(E.b), y: 160 }, String(parts(E.b).y)));
  s.appendChild(sv('text', { x: x(Y.b), y: 160, 'text-anchor': 'middle' }, String(parts(Y.b).y)));
  s.appendChild(sv('text', { class: 'mark', x: x(e.dn), y: 160, 'text-anchor': 'end' }, String(parts(e.dn).y)));
  if (m.today !== e.dn && Math.abs(x(m.today) - x(e.dn)) > 54 && Math.abs(x(m.today) - x(Y.b)) > 40) {
    s.appendChild(sv('circle', { class: 'dot', cx: x(m.today), cy: 142, r: 4.5 }));
    s.appendChild(sv('text', { x: x(m.today), y: 160, 'text-anchor': 'middle' }, 'today'));
  }
  host.appendChild(s);
}

function renderResult() {
  const host = $('result'), m = model, e = m.hero;
  host.textContent = '';
  host.hidden = !e;
  if (!e) return;
  const sig = e.key + ':' + e.dn + ':' + e.who.map(function (id) { return m.byId[id].name; }).join('|');
  const fresh = sig !== state.lastHero;
  state.lastHero = sig;
  const p = parts(e.dn);
  const gutter = el('div', { class: 'gutter' }, [para(e.label, 'eyebrow red'), m.example ? para('Example', 'tag') : null]);
  const col = el('div', { class: 'col' });
  col.appendChild(para(whoLine(e), 'result-who'));
  col.appendChild(el('p', { class: 'bigdate' }, [el('span', { class: 'wd', text: WEEKDAYS[p.w] + ',' }), MONTHS[p.m - 1] + ' ' + p.d + ', ' + p.y]));
  col.appendChild(para(untilText(m.today, e.dn), 'when'));
  if (e.dn < m.today && !m.example) col.appendChild(para('It went by unmarked. The ones still ahead are listed below, so the next won’t.', 'missed'));
  let lines = null;
  if (e.type === 'echo') {
    lines = el('div', { class: 'lifelines' });
    col.appendChild(lines);
    col.appendChild(el('ol', { class: 'truths' }, echoTruths(e).map(function (t) { return el('li', null, [el('span', { text: t })]); })));
  } else {
    col.appendChild(para(e.text, 'daytext'));
  }
  col.appendChild(el('div', { class: 'actions' }, [
    el('button', { type: 'button', class: 'btn', text: 'Keep this day', onclick: function () { openEventSheet(e); } }),
    el('a', { class: 'btn ghost', href: '#almanac', text: 'See every hidden day' })
  ]));
  host.appendChild(el('div', { class: 'wrap grid' }, [gutter, col]));
  if (lines) drawLifelines(lines, e);
  if (fresh) { host.classList.remove('fresh'); void host.offsetWidth; host.classList.add('fresh'); }
}

/* ---------- a small sketch for each kind of day ---------- */

/* Each sketch is a few pen strokes on a 32 by 32 grid. `a` marks the one stroke drawn in red. */
const SKETCH = {
  echo: [['circle', { cx: 16, cy: 16, r: 2.6, class: 'a fill' }], ['path', { d: 'M9.5 9.5a9.2 9.2 0 0 0 0 13M22.5 9.5a9.2 9.2 0 0 1 0 13' }], ['path', { d: 'M5.5 5.8a14.5 14.5 0 0 0 0 20.4M26.5 5.8a14.5 14.5 0 0 1 0 20.4' }]],
  grow: [['circle', { cx: 10, cy: 7.5, r: 3 }], ['path', { d: 'M10 10.5V21M10 21l-3 6M10 21l3 6M5.5 15h9' }], ['circle', { cx: 23, cy: 17, r: 2.2, class: 'a' }], ['path', { d: 'M23 19.2V24M23 24l-2 3M23 24l2 3M20 21.5h6', class: 'a' }]],
  tally: [['path', { d: 'M7 8.5v15M12 8v15.5M17 8.5v15M22 8v15.5' }], ['path', { d: 'M4 21.5L26 10', class: 'a' }]],
  heart: [['path', { d: 'M16 26.5C9 21.5 4.5 17 4.5 12.2a5.6 5.6 0 0 1 11.5-1.6a5.6 5.6 0 0 1 11.5 1.6c0 4.8-4.5 9.3-11.5 14.3z', class: 'a' }]],
  half: [['circle', { cx: 16, cy: 16, r: 11 }], ['path', { d: 'M16 5a11 11 0 0 1 0 22z', class: 'a fill' }]],
  both: [['circle', { cx: 12, cy: 16, r: 8 }], ['circle', { cx: 20, cy: 16, r: 8, class: 'a' }]],
  sum: [['circle', { cx: 8, cy: 10, r: 3 }], ['circle', { cx: 8, cy: 22, r: 3 }], ['path', { d: 'M13 16h5M15.5 13.5v5' }], ['circle', { cx: 24, cy: 16, r: 4.5, class: 'a' }]],
  glass: [['path', { d: 'M9 5h14M9 27h14' }], ['path', { d: 'M10.5 5c0 6.5 5.5 7.5 5.5 11c0-3.5 5.5-4.5 5.5-11M10.5 27c0-6.5 5.5-7.5 5.5-11c0 3.5 5.5 4.5 5.5 11' }], ['path', { d: 'M13 24.5h6l-3-4z', class: 'a fill' }]],
  page: [['rect', { x: 6, y: 8, width: 20, height: 19, rx: 2.5 }], ['path', { d: 'M6 13.5h20M11.5 5v5.5M20.5 5v5.5' }], ['path', { d: 'M12 21l3 3l5.5-6', class: 'a' }]],
  planet: [['circle', { cx: 16, cy: 16, r: 6.5 }], ['path', { d: 'M9.8 18.3C5 20.6 2.4 22.6 3 23.8c1 1.9 8.300-.2 15.600-4s11.500-8.500 10.500-10.400c-.600-1.200-3.800-.800-8.500.700', class: 'a' }]],
  moon: [['path', { d: 'M20.500 5.500a11.200 11.200 0 1 0 6.500 15.500a9 9 0 0 1-6.500-15.500z' }], ['path', { d: 'M24.500 6.500v3M23 8h3', class: 'a' }]],
  cake: [['path', { d: 'M7 27V18a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v9zM5 27h22' }], ['path', { d: 'M7 21c1.500 1.500 3 1.500 4.500 0s3-1.500 4.500 0s3 1.500 4.500 0s3-1.500 4.500 0' }], ['path', { d: 'M16 16v-5' }], ['path', { d: 'M16 8.500c-1.300-1.200-.300-2.800 0-4c.300 1.200 1.300 2.800 0 4z', class: 'a fill' }]],
  paw: [['path', { d: 'M16 16.500c-3.500 0-6.500 3.200-6.500 6.200c0 2.300 2.200 3.300 6.500 3.300s6.500-1 6.500-3.300c0-3-3-6.200-6.500-6.200z', class: 'a' }], ['circle', { cx: 8, cy: 14, r: 2.3 }], ['circle', { cx: 13, cy: 8.500, r: 2.3 }], ['circle', { cx: 19, cy: 8.500, r: 2.3 }], ['circle', { cx: 24, cy: 14, r: 2.3 }]]
};
const SKETCH_FOR = {
  echo: 'echo', halfagain: 'grow', multiple: 'grow', myriad: 'tally', kiloday: 'tally', odometer: 'tally',
  weeks: 'page', months: 'page', seconds: 'glass', hours: 'glass', minutes: 'glass', planet: 'planet', moons: 'moon',
  golden: 'cake', beddian: 'cake', sum: 'both', sumdays: 'both', famsum: 'sum', addup: 'sum',
  tmyriad: 'heart', tdays: 'heart', tweeks: 'heart', tmonths: 'heart', thours: 'heart', tseconds: 'heart',
  halflife: 'half', lifeshare: 'both', overtake: 'paw', petyears: 'paw'
};
function sketchNode(e) {
  const pet = e.who.some(function (id) { return model.byId[id] && model.byId[id].kind === 'pet'; });
  const name = pet && SKETCH_FOR[e.type] !== 'half' ? 'paw' : (SKETCH_FOR[e.type] || 'page');
  const s = sv('svg', { class: 'sk', width: 46, height: 46, viewBox: '0 0 32 32', 'aria-hidden': 'true' });
  SKETCH[name].forEach(function (part) { s.appendChild(sv(part[0], part[1])); });
  return s;
}

/* ---------- the list ---------- */

function dayRow(e, plain) {
  const m = model, p = parts(e.dn);
  const row = el('div', { class: 'day' + (e.weight >= 70 ? ' red' : '') });
  row.appendChild(el('div', { class: 'md' }, [el('span', { class: 'mo', text: MONTHS[p.m - 1].slice(0, 3) }), el('span', { class: 'dnum', text: String(p.d) })]));
  row.appendChild(el('div', { class: 'sky' }, [el('span', { class: 'wk', text: WEEKDAYS[p.w].slice(0, 3) }), moonNode(e.dn, 15)]));
  const words = el('div', { class: 'words' }, [para(e.title, 'title'), para(e.text, 'text')]);
  if (!plain) words.appendChild(para(untilText(m.today, e.dn), 'away'));
  row.appendChild(el('div', { class: 'body' }, [sketchNode(e), words]));
  if (!plain) row.appendChild(el('button', { type: 'button', class: 'btn ghost', text: 'Keep', 'aria-label': 'Keep this day: ' + e.title, onclick: function () { openEventSheet(e); } }));
  return row;
}
function teaser(list) {
  const seen = {}, out = [];
  list.slice().sort(function (a, b) { return b.weight - a.weight; }).forEach(function (e) {
    if (out.length >= 3 || e.weight < 56 || seen[e.label] || !/^[A-Z]/.test(e.label)) return;
    seen[e.label] = true;
    const label = e.label === 'Thousand Moons' ? 'thousand moons' : e.label;
    out.push((/^[aeio]/i.test(label) ? 'an ' : 'a ') + label);
  });
  return out.length ? 'Among them: ' + joinList(out) + '.' : '';
}
function lockBlock(count, hidden, next) {
  const m = model, wrap = el('div', { class: 'locked' });
  for (let i = 0; i < 3; i++) wrap.appendChild(el('div', { class: 'faux', 'aria-hidden': 'true' }, [el('i'), el('div', null, [el('i'), el('i')])]));
  const tease = (teaser(hidden) + (m.example ? ' This is the example family. Put in your own and the count becomes yours.' : '')).trim();
  wrap.appendChild(el('div', { class: 'lock-cta' }, [
    para(num(count) + ' more hidden ' + (count === 1 ? 'day' : 'days') + (next ? ' between now and ' + parts(m.horizon).y : ' already behind you'), 'count'),
    tease ? para(tease) : null,
    el('button', { type: 'button', class: 'btn red', text: 'Unlock the whole almanac · ' + PRICE_TEXT, onclick: unlock }),
    para('One payment. No subscription, no account.', 'hint')
  ]));
  return wrap;
}
function renderTimeline() {
  const host = $('timeline'), m = model, next = state.tab === 'next';
  host.textContent = '';
  $('tabNext').setAttribute('aria-selected', String(next));
  $('tabPast').setAttribute('aria-selected', String(!next));
  host.setAttribute('aria-labelledby', next ? 'tabNext' : 'tabPast');
  const all = next ? m.upcoming : m.past;
  const shown = m.unlocked ? all.slice(0, next ? 400 : 80) : (next ? m.free : all.slice(0, 1));
  const perYear = {};
  shown.forEach(function (e) { const y = parts(e.dn).y; perYear[y] = (perYear[y] || 0) + 1; });
  let year = 0;
  shown.forEach(function (e) {
    const y = parts(e.dn).y;
    if (y !== year) { year = y; host.appendChild(el('h3', { class: 'year-head' }, [String(y), el('small', { text: perYear[y] + (perYear[y] === 1 ? ' day' : ' days') })])); }
    host.appendChild(dayRow(e));
  });
  if (!shown.length) host.appendChild(para(next ? 'No hidden days fall in the next ten years for these two. Add someone else and there will be.' : 'Nothing behind you yet. They are all still to come.', 'empty'));
  const hidden = all.filter(function (e) { return shown.indexOf(e) < 0; });
  if (!m.unlocked && hidden.length) host.appendChild(lockBlock(hidden.length, hidden, next));
  const names = joinList(m.fam.people.map(function (p) { return p.name; }));
  $('almanacSub').textContent = num(m.upcoming.length) + ' hidden days fall between now and ' + parts(m.horizon).y + ' for ' + names + '.' +
    (m.unlocked ? '' : ' The first three are free to read.');
}

/* ---------- price, ownership, the printed year ---------- */

function renderOwned() {
  const m = model;
  $('priceInline').textContent = PRICE_TEXT;
  $('unlockBtn').hidden = m.unlocked;
  $('unlockBtn').textContent = 'Unlock the whole almanac · ' + PRICE_TEXT;
  $('restoreBtn').hidden = !LIVE || m.unlocked;
  let line = 'One payment. No subscription, no account.';
  if (state.shared) line = 'This almanac was unlocked by the person who sent it to you.';
  else if (m.unlocked) line = LIVE ? 'Unlocked. Your key is ' + state.key + '. Keep it: it restores the almanac on any device.' : 'Unlocked in this preview. Nothing was charged.';
  $('unlockState').textContent = line;
  $('owned').hidden = !m.unlocked || !!state.shared || m.example;
  if (FREE) { $('ownedHint').textContent = 'The calendar file works with Apple Calendar, Google Calendar and Outlook. The link carries the names and birthdays inside it, so send it only to family.'; return; }
  $('ownedHint').textContent = LIVE ? 'The calendar link works with Apple Calendar, Google Calendar and Outlook, and keeps itself up to date.'
    : 'In this preview these two buttons describe what the live site does: the calendar link and the gift link are made by the real server.';
}
function leapLine(y) {
  if (isLeap(y)) return 'being leap year';
  const k = y % 4;
  return k ? 'being the ' + ['', 'first', 'second', 'third'][k] + ' after leap year' : 'being a common year';
}
function renderEdition() {
  const m = model, y = state.year, host = $('pages');
  host.textContent = '';
  $('editionYearText').textContent = String(y);
  const inYear = m.events.filter(function (e) { return parts(e.dn).y === y; });
  const names = joinList(m.fam.people.map(function (p) { return p.name; }));
  $('editionSub').textContent = m.unlocked
    ? num(inYear.length) + ' hidden ' + (inYear.length === 1 ? 'day falls' : 'days fall') + ' in ' + y + '.' + (OWN ? ' Print it, or save it as a PDF and send it.' : ' On the live site this prints, or saves as a PDF.')
    : 'The cover and the first entries are free to look at. The rest of ' + y + ' comes with the almanac.';
  const title = cleanName(state.shared ? state.shared.title : state.title, 40) || (m.fam.people.length <= 3 ? names : 'Us');
  host.appendChild(el('div', { class: 'leaf cover' }, [
    para('An almanac of', 'an'),
    para(title, 'ttl'),
    el('p', { class: 'yr' }, ['for the year ', el('b', { text: String(y) }), ', ' + leapLine(y)]),
    el('div', { class: 'rule' }),
    el('p', { class: 'of' }, ['Containing the red-letter days of ', el('b', { text: names }), ', which no other calendar prints.']),
    para(SITE, 'by')
  ]));
  const leaf = el('div', { class: 'leaf' });
  if (!inYear.length) leaf.appendChild(para('No hidden days fall in ' + y + ' for this family. Try another year.', 'leaf-note'));
  const shown = m.unlocked ? inYear : inYear.slice(0, 2);
  let month = 0;
  shown.forEach(function (e) {
    const mo = parts(e.dn).m;
    if (mo !== month) { month = mo; leaf.appendChild(para(MONTHS[mo - 1], 'month-head')); }
    leaf.appendChild(dayRow(e, true));
  });
  if (!m.unlocked && inYear.length > shown.length) leaf.appendChild(para((inYear.length - shown.length) + ' more in ' + y + ', printed once the almanac is unlocked.', 'leaf-note'));
  host.appendChild(leaf);
}

function refresh() {
  compute();
  const err = $('formError');
  err.hidden = !model.problem;
  err.textContent = model.problem;
  renderResult();
  renderTimeline();
  renderOwned();
  renderEdition();
}

/* ---------- keeping a day: the card, the calendar, the note ---------- */

function noteFor(e) {
  const m = model, fut = e.dn > m.today, past = e.dn < m.today, when = fmtLong(e.dn);
  if (e.type === 'echo' && e.full) {
    if (isYou(m.byId[e.younger])) {
      if (fut) return 'On ' + when + ', I will be exactly the age you were on the day I was born. You will be exactly twice my age that day, for the only time in our lives. I worked it out, and I wanted you to know I’m grateful for every one of those years.';
      if (past) return 'I just found out that on ' + when + ', I was exactly the age you were on the day I was born. You were exactly twice my age that day, for the only time in our lives. I missed it then, so I’m telling you now: thank you for every one of those years.';
      return 'Today I am exactly the age you were on the day I was born. You are exactly twice my age, for the only day in our lives. Thank you for every one of those years.';
    }
    if (isYou(m.byId[e.elder])) {
      if (fut) return 'On ' + when + ', you will be exactly the age I was on the day you were born. I remember that day better than any other. I can’t wait to see who you are by then.';
      if (past) return 'I just worked out that on ' + when + ', you were exactly the age I was on the day you were born. I remember that day better than any other, and I’m prouder now than I was then.';
      return 'Today you are exactly the age I was on the day you were born. I remember that day better than any other.';
    }
  }
  if (e.type === 'halflife' && isYou(m.byId[e.of])) {
    if (fut) return 'On ' + when + ', I will have known you for exactly half my life. From the next day on, it’s more than half. It’s the better half.';
    if (past) return 'I just worked out that since ' + fmtDate(e.dn) + ', I have known you for more than half my life. It’s the better half.';
    return 'As of today I have known you for exactly half my life. From tomorrow it’s more than half. It’s the better half.';
  }
  return (fut || past ? when : 'Today') + ': ' + e.title + '. ' + e.text + ' I thought you should know.';
}
function googleLink(e) {
  return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(e.title) +
    '&dates=' + iso(e.dn).replace(/-/g, '') + '/' + iso(e.dn + 1).replace(/-/g, '') + '&details=' + encodeURIComponent(e.text);
}
function fontsReady() {
  if (!document.fonts || !document.fonts.load) return Promise.resolve();
  const wait = Promise.all([document.fonts.load('150px "Libre Caslon Display"'), document.fonts.load('italic 44px "Libre Caslon Text"'), document.fonts.load('40px "Libre Caslon Text"'), document.fonts.load('600 26px Archivo')]);
  return Promise.race([wait, new Promise(function (r) { setTimeout(r, 1800); })]).catch(function () {});
}
function drawCard(cv, e) {
  const W = 1080, H = 1350, c = cv.getContext('2d');
  const ink = '#14213A', soft = '#4B5B76', red = '#BF2B1D', paper = '#EEF2F5';
  const display = '"Libre Caslon Display", "Libre Caslon Text", Georgia, serif', text = '"Libre Caslon Text", Georgia, serif', ui = 'Archivo, "Helvetica Neue", Arial, sans-serif';
  cv.width = W; cv.height = H;
  c.fillStyle = paper; c.fillRect(0, 0, W, H);
  c.strokeStyle = ink; c.lineWidth = 3; c.strokeRect(46, 46, W - 92, H - 92);
  c.lineWidth = 1; c.strokeRect(58, 58, W - 116, H - 116);
  c.textBaseline = 'alphabetic';
  const spaced = function (str, y, gap) {
    let total = 0;
    const widths = str.split('').map(function (ch) { const w = c.measureText(ch).width + gap; total += w; return w; });
    let x = (W - (total - gap)) / 2;
    c.textAlign = 'left';
    str.split('').forEach(function (ch, i) { c.fillText(ch, x, y); x += widths[i]; });
  };
  const fit = function (str, y, size, family, max) {
    let s = size;
    do { c.font = s + 'px ' + family; s -= 4; } while (c.measureText(str).width > max && s > 40);
    c.textAlign = 'center';
    c.fillText(str, W / 2, y);
  };
  const p = parts(e.dn);
  c.fillStyle = ink; c.font = '600 26px ' + ui; spaced('ALMANAC OF US', 150, 9);
  c.fillRect(W / 2 - 60, 178, 120, 2); c.fillRect(W / 2 - 60, 184, 120, 1);
  c.fillStyle = red; c.font = '600 32px ' + ui; spaced(e.label.toUpperCase(), 300, 10);
  c.fillStyle = ink; c.textAlign = 'center'; c.font = 'italic 46px ' + text; c.fillText(WEEKDAYS[p.w], W / 2, 400);
  c.fillStyle = red; fit(MONTHS[p.m - 1] + ' ' + p.d, 560, 156, display, 880);
  c.fillStyle = ink; c.font = '88px ' + display; c.textAlign = 'center'; c.fillText(String(p.y), W / 2, 672);
  const f = moonPhase(e.dn);
  c.save(); c.translate(W / 2, 748);
  c.fillStyle = ink; c.beginPath(); c.arc(0, 0, 17, 0, Math.PI * 2); c.fill();
  c.fillStyle = paper; c.fill(new Path2D(moonPath(f, 0, 0, 15.5)));
  c.restore();
  c.fillStyle = soft; c.font = '500 22px ' + ui; spaced(moonName(f).toUpperCase(), 806, 5);
  c.fillStyle = ink; c.font = '40px ' + text; c.textAlign = 'center';
  const words = e.text.split(' '), lines = [];
  let line = '';
  words.forEach(function (w) {
    const trial = line ? line + ' ' + w : w;
    if (c.measureText(trial).width > 820 && line) { lines.push(line); line = w; } else line = trial;
  });
  if (line) lines.push(line);
  const shownLines = lines.slice(0, 6);
  if (lines.length > 6) shownLines[5] = shownLines[5].replace(/\W*\w+$/, '') + '…';
  let y = 900;
  shownLines.forEach(function (ln) { c.fillText(ln, W / 2, y); y += 58; });
  c.fillStyle = soft; c.font = '500 22px ' + ui; spaced('FIND YOUR OWN HIDDEN DAYS', H - 152, 6);
  c.fillStyle = ink; c.font = '38px ' + display; c.textAlign = 'center'; c.fillText(SITE, W / 2, H - 100);
}
function openEventSheet(e) {
  const cv = el('canvas', { class: 'card', width: '1080', height: '1350', role: 'img', 'aria-label': 'A card for ' + e.title + ', ' + fmtLong(e.dn) });
  const note = el('textarea', { class: 'note', id: 'noteText', 'aria-label': 'A note to send' });
  note.value = noteFor(e);
  const stem = e.label.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + iso(e.dn);
  openSheet('Keep this day', [
    cv,
    el('div', { class: 'sheet-actions' }, [
      el('button', { type: 'button', class: 'btn', text: 'Save the card', onclick: function () { cv.toBlob(function (blob) { if (blob) saveFile(stem + '.png', blob); }, 'image/png'); } }),
      el('a', { class: 'btn ghost', href: googleLink(e), target: '_blank', rel: 'noopener', text: 'Add to Google Calendar' }),
      OWN ? el('button', { type: 'button', class: 'btn ghost', text: 'Apple or Outlook file', onclick: function () { saveFile(stem + '.ics', new Blob([buildICS([e], { name: BRAND })], { type: 'text/calendar' })); } }) : null
    ]),
    para('A note to send with it. Change anything you like.', 'hint'),
    note,
    el('div', { class: 'sheet-actions' }, [el('button', { type: 'button', class: 'btn ghost', text: 'Copy the note', onclick: function () { copyText(note.value, 'Note copied.'); } })])
  ]);
  drawCard(cv, e);
  fontsReady().then(function () { drawCard(cv, e); });
}

/* ---------- buying and owning ---------- */

function unlock() {
  if (model.unlocked) return;
  if (!LIVE) {
    openSheet('Preview checkout', [
      para('On the live site this step is a card payment. In this preview no card is asked for and nothing is charged.'),
      el('dl', { class: 'order' }, [el('dt', { text: 'The whole almanac, one family' }), el('dd', { text: PRICE_TEXT }), el('dt', { class: 'total', text: 'Charged in this preview' }), el('dd', { class: 'total', text: '$0' })]),
      el('div', { class: 'sheet-actions' }, [el('button', { type: 'button', class: 'btn red', text: 'Complete the preview purchase',
        onclick: function () { state.key = 'PREVIEW'; saveState(); closeSheet(); refresh(); toast('Unlocked in this preview. Nothing was charged.'); } })])
    ]);
    return;
  }
  openSheet('One moment', [para('Opening the secure checkout.')]);
  call('/api/checkout', {}).then(function (d) { location.assign(d.url); }, function (err) { openSheet('Checkout isn’t available', [para(err.message)]); });
}
function restore() {
  const input = el('input', { class: 'linkbox', id: 'restoreKey', type: 'text', autocomplete: 'off', placeholder: 'AOU-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX', 'aria-label': 'Your key' });
  const msg = para('', 'form-error');
  msg.hidden = true;
  openSheet('Restore your almanac', [
    para('Your key is in the payment receipt we emailed you.'),
    input, msg,
    el('div', { class: 'sheet-actions' }, [el('button', { type: 'button', class: 'btn', text: 'Restore', onclick: function () {
      const key = input.value.trim().toUpperCase();
      call('/api/verify', { key: key }).then(function () { state.key = key; saveState(); closeSheet(); refresh(); toast('Welcome back. The almanac is unlocked.'); },
        function (err) { msg.textContent = err.code === 'bad_key' ? 'That key doesn’t match. Check it against the receipt.' : err.message; msg.hidden = false; });
    } })])
  ]);
}
function sealed() { return call('/api/seal', { key: state.key, family: currentRaw() }).then(function (d) { return d.token; }); }
function b64u(text) {
  let s = '';
  new TextEncoder().encode(text).forEach(function (b) { s += String.fromCharCode(b); });
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64u(str) {
  const s = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4));
  return new TextDecoder().decode(Uint8Array.from(s, function (c) { return c.charCodeAt(0); }));
}
function calendarSheet() {
  if (FREE) {
    const events = model.events.filter(function (e) { return e.dn >= model.today - 366 && e.dn <= model.today + 5479; });
    saveFile('almanac-of-us.ics', new Blob([buildICS(events, { name: state.title ? BRAND + ': ' + cleanName(state.title, 40) : BRAND, url: location.origin + location.pathname, headsUp: true })], { type: 'text/calendar' }));
    openSheet('Your calendar file', [
      para('A file with ' + num(events.length) + ' entries has been saved: the past year and the next fifteen, with a week\u2019s notice before the big days.'),
      para('Open it on an iPhone or a Mac to add everything at once. In Google Calendar, choose Settings, then Import.')
    ]);
    return;
  }
  if (!LIVE) {
    openSheet('The calendar link', [
      para('On the live site this hands you one private link. Add it to Apple Calendar, Google Calendar or Outlook once, and every hidden day arrives on your phone by itself, with a week’s notice before the big ones.'),
      para('Your link would carry ' + num(model.upcoming.length) + ' days through ' + parts(model.horizon).y + ', and it keeps rolling forward after that.'),
      para('Until then, “Keep” beside any day adds that one to Google Calendar.', 'hint')
    ]);
    return;
  }
  openSheet('Your calendar link', [para('Sealing your almanac into a link.')]);
  sealed().then(function (token) {
    const https = location.origin + '/cal/' + token + '.ics';
    openSheet('Your calendar link', [
      para('On an iPhone or a Mac, the button adds it in one step. For Google Calendar or Outlook, copy the link and choose “Add calendar from URL”.'),
      el('div', { class: 'sheet-actions' }, [
        el('a', { class: 'btn', href: https.replace(/^https?:/, 'webcal:'), text: 'Add to my calendar' }),
        el('button', { type: 'button', class: 'btn ghost', text: 'Copy the link', onclick: function () { copyText(https, 'Link copied.'); } })
      ]),
      linkBox(https, 'Your calendar link'),
      para('Anyone with this link can see these dates, so share it only with family.', 'hint')
    ]);
  }, function (err) { openSheet('Your calendar link', [para(err.message)]); });
}
function giftSheet() {
  if (FREE) {
    const url = location.origin + location.pathname + '#a.' + b64u(packFamily(model.fam));
    openSheet('A link to send', [
      para('Send this to the person it\u2019s for. It opens their finished almanac.'),
      linkBox(url, 'Gift link'),
      el('div', { class: 'sheet-actions' }, [el('button', { type: 'button', class: 'btn', text: 'Copy the link', onclick: function () { copyText(url, 'Link copied.'); } })]),
      para('The names and birthdays travel inside the link itself, so anyone who has it can read them.', 'hint')
    ]);
    return;
  }
  if (!LIVE) {
    openSheet('A link to send', [
      para('On the live site this makes a link to the finished almanac. Whoever opens it sees every day, already unlocked, with the family’s name on the cover. They don’t pay and they don’t sign up.'),
      para('Under their almanac is one line inviting them to start their own.', 'hint')
    ]);
    return;
  }
  openSheet('A link to send', [para('Sealing the almanac into a link.')]);
  sealed().then(function (token) {
    const url = location.origin + '/#a.' + token;
    openSheet('A link to send', [
      para('Send this to the person it’s for. It opens their almanac, already unlocked.'),
      linkBox(url, 'Gift link'),
      el('div', { class: 'sheet-actions' }, [el('button', { type: 'button', class: 'btn', text: 'Copy the link', onclick: function () { copyText(url, 'Link copied.'); } })])
    ]);
  }, function (err) { openSheet('A link to send', [para(err.message)]); });
}

/* ---------- start ---------- */

function showShared(on) {
  $('giftBar').hidden = !on;
  document.querySelector('.finder').hidden = on;
  $('coverTitle').disabled = on;
  $('coverTitle').value = on ? cleanName(state.shared.title, 40) : state.title;
  if (on) $('giftBarText').textContent = 'Someone made this almanac for you' + (state.shared.title ? ' and put “' + cleanName(state.shared.title, 40) + '” on the cover.' : '.');
}
function start() {
  $('previewBar').hidden = OWN;
  $('printBtn').hidden = !OWN;
  document.querySelectorAll(FREE ? '.paid-only' : '.free-only').forEach(function (n) { n.hidden = true; });
  loadState();
  const now = new Date();
  state.year = now.getFullYear() + (now.getMonth() >= 9 ? 1 : 0);
  const years = $('editionYear');
  [0, 1, 2].forEach(function (k) { years.appendChild(el('option', { value: String(now.getFullYear() + k), text: String(now.getFullYear() + k) })); });
  years.value = String(state.year);
  $('coverTitle').value = state.title;
  renderRows();
  refresh();

  $('addPerson').addEventListener('click', function () {
    if (state.rows.length >= MAX_PEOPLE) return;
    const r = blankRow('partner');
    state.rows.push(r);
    renderRows();
    const field = $('p' + r.uid + '-name');
    if (field) field.focus();
    saveState();
  });
  $('people').addEventListener('submit', function (ev) {
    ev.preventDefault();
    clearTimeout(changeTimer);
    saveState();
    refresh();
    if (model.example) {
      const err = $('formError');
      err.textContent = model.problem || 'Add both first names and full birthdays, then try again.';
      err.hidden = false;
      return;
    }
    const host = $('result');
    host.classList.remove('fresh');
    void host.offsetWidth;
    host.classList.add('fresh');
    host.scrollIntoView();
  });
  $('tabNext').addEventListener('click', function () { state.tab = 'next'; renderTimeline(); });
  $('tabPast').addEventListener('click', function () { state.tab = 'past'; renderTimeline(); });
  $('unlockBtn').addEventListener('click', unlock);
  $('restoreBtn').addEventListener('click', restore);
  $('calBtn').addEventListener('click', calendarSheet);
  $('giftBtn').addEventListener('click', giftSheet);
  $('printBtn').addEventListener('click', function () { window.print(); });
  $('sheetClose').addEventListener('click', closeSheet);
  $('sheet').addEventListener('click', function (ev) { if (ev.target === $('sheet')) closeSheet(); });
  $('coverTitle').addEventListener('input', function () { state.title = $('coverTitle').value; saveState(); renderEdition(); });
  years.addEventListener('change', function () { state.year = +years.value; renderEdition(); });
  $('giftOwn').addEventListener('click', function () { state.shared = null; showShared(false); if (OWN) history.replaceState(null, '', location.pathname); refresh(); $('finder').scrollIntoView(); });
  let resizeTimer = 0;
  window.addEventListener('resize', function () { clearTimeout(resizeTimer); resizeTimer = setTimeout(function () { const host = document.querySelector('.lifelines'); if (host && model.hero) drawLifelines(host, model.hero); }, 160); });

  if (FREE) {
    const openFree = function () {
      if (location.hash.slice(0, 3) !== '#a.') return;
      let raw = null;
      try { raw = unpackFamily(unb64u(location.hash.slice(3))); } catch (e) { raw = null; }
      if (!raw || !normalizeFamily(raw, null).ok) { toast('That link is damaged or incomplete.'); return; }
      state.shared = raw; showShared(true); refresh(); window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', openFree);
    openFree();
    return;
  }
  if (!LIVE) {
    if (window.claude && window.claude.use) window.claude.use('downloads').then(function (d) { downloads = d; }, function () { downloads = null; });
    return;
  }
  const sid = new URLSearchParams(location.search).get('session_id');
  if (sid) {
    call('/api/unlock?session_id=' + encodeURIComponent(sid)).then(function (d) {
      state.key = d.key; saveState();
      history.replaceState(null, '', location.pathname + location.hash);
      refresh();
      openSheet('The almanac is yours', [
        para('Every hidden day is unlocked on this device. Your key is below and in your receipt. It restores the almanac anywhere.'),
        linkBox(d.key, 'Your key'),
        el('div', { class: 'sheet-actions' }, [el('button', { type: 'button', class: 'btn', text: 'Show me my days', onclick: function () { closeSheet(); $('almanac').scrollIntoView(); } })])
      ]);
    }, function (err) {
      history.replaceState(null, '', location.pathname + location.hash);
      openSheet('That payment didn’t go through', [para(err.code === 'not_paid' ? 'No money was taken. You can try again whenever you like.' : err.message)]);
    });
  }
  const openGift = function () {
    if (location.hash.slice(0, 3) !== '#a.') return;
    call('/api/open?token=' + encodeURIComponent(location.hash.slice(3))).then(function (d) {
      state.shared = d.family; showShared(true); refresh(); window.scrollTo(0, 0);
    }, function () { toast('That gift link is damaged or incomplete.'); });
  };
  window.addEventListener('hashchange', openGift);
  openGift();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
