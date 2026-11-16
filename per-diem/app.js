/* Mission per diem calculator — UI. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var DATA = window.DSA_DATA, P = window.PerDiem;
  var LS = { draft: 'perdiem.draft', settings: 'perdiem.settings', history: 'perdiem.history', lang: 'perdiem.lang' };
  var COMP_ICON = { breakfast: '☕', lunch: '🍽', dinner: '🌙', hotel: '🛏', incid: '＋' };

  function store(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
  function load(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function norm(s) { return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* ---------- language ---------- */
  var lang = load(LS.lang, null) || (['es', 'en', 'fr'].indexOf((navigator.language || 'es').slice(0, 2)) >= 0 ? navigator.language.slice(0, 2) : 'es');
  function t(k, v) {
    var s = (window.I18N[lang] && window.I18N[lang][k]) || window.I18N.es[k] || k;
    return v ? s.replace(/\{(\w+)\}/g, function (_, n) { return v[n] == null ? '' : v[n]; }) : s;
  }
  function money(n, cur) { return new Intl.NumberFormat(lang, { style: 'currency', currency: cur, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n); }
  function num(n) { return new Intl.NumberFormat(lang, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n); }
  function fmtDate(iso, long) {
    var d = new Date(iso.slice(0, 10) + 'T00:00:00Z');
    return new Intl.DateTimeFormat(lang, long ? { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }
      : { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(d);
  }
  function fmtDT(s) { return s ? fmtDate(s) + ' ' + s.slice(11, 16) : '—'; }

  /* ---------- rates index ---------- */
  var AREAS = [], BYKEY = {};
  (function () {
    var alias = {};
    try { // Spanish/French country names so that "Alemania" or "Allemagne" also finds Germany
      var en = new Intl.DisplayNames(['en'], { type: 'region' }), es = new Intl.DisplayNames(['es'], { type: 'region' }), fr = new Intl.DisplayNames(['fr'], { type: 'region' });
      var A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', byEn = {};
      for (var i = 0; i < 26; i++) for (var j = 0; j < 26; j++) {
        var c = A[i] + A[j], n; try { n = en.of(c); } catch (e) { n = c; }
        if (n && n !== c) byEn[norm(n)] = c;
      }
      var fix = { 'united states of america': 'US', 'russian federation': 'RU', 'turkiye': 'TR', 'korea, republic of': 'KR', 'viet nam': 'VN',
        'czech republic': 'CZ', 'united kingdom': 'GB', 'united kingdom of great britain and northern ireland': 'GB', 'netherlands': 'NL',
        "cote d'ivoire": 'CI', 'iran, islamic republic of': 'IR', 'slovak republic': 'SK', 'republic of moldova': 'MD', 'moldova, republic of': 'MD',
        'united republic of tanzania': 'TZ', 'tanzania, united rep. of': 'TZ', 'syrian arab republic': 'SY', 'bolivia': 'BO', 'venezuela': 'VE',
        'lao people\'s democratic republic': 'LA', 'brunei': 'BN', 'cabo verde': 'CV', 'congo, dem. rep. of': 'CD', 'hong kong, china': 'HK', 'china': 'CN' };
      DATA.countries.forEach(function (c) {
        var k = norm(c.country), code = fix[k] || byEn[k] || byEn[k.replace(/,.*$/, '').replace(/\s*\(.*\)$/, '')];
        if (code) alias[c.country] = es.of(code) + ' ' + fr.of(code);
      });
    } catch (e) { /* Intl.DisplayNames unavailable: English search only */ }
    DATA.countries.forEach(function (c) {
      c.areas.forEach(function (a) {
        var o = { key: c.country + '|' + a[0], country: c.country, currency: c.currency, name: a[0], usd: a[1], local: a[2], local60: a[3], room: a[4], notes: a[5] || [] };
        o.search = norm(a[0] + ' ' + c.country + ' ' + (alias[c.country] || '') + (a[0] === 'Elsewhere' ? ' resto elsewhere ailleurs otras' : ''));
        o.n = norm(a[0]);
        AREAS.push(o); BYKEY[o.key] = o;
      });
    });
  })();
  function areaName(a) { return a.name === 'Elsewhere' ? t('elsewhere') : a.name; }
  function areaLabel(a) { return areaName(a) + ' — ' + a.country; }
  function isSpecial(a) { return a.notes.indexOf(1) >= 0 || a.notes.indexOf(2) >= 0; }
  // Other rates published for the same city: named hotels with their own (higher) rate, or seasonal rates.
  function baseName(a) { return a.name.replace(/\s*\(.*$/, '').trim(); }
  function variants(a) { var b = baseName(a); return AREAS.filter(function (x) { return x.country === a.country && baseName(x) === b; }); }
  function variantSelect(a, i) {
    if (!a) return '';
    var v = variants(a); if (v.length < 2) return '';
    return '<label class="variant"><span>' + t('rateVariant') + '</span><select data-variant="' + i + '">' + v.map(function (x) {
      var detail = /\((.*)\)\s*(.*)$/.exec(x.name), lab = detail ? (detail[1] + (detail[2] ? ' ' + detail[2] : '')) : t('rateStandard');
      return '<option value="' + esc(x.key) + '"' + (x.key === a.key ? ' selected' : '') + '>' + esc((isSpecial(x) ? t('rateHotel') + ': ' : '') + lab) + ' — ' + x.usd + ' USD · ' + x.room + ' %</option>';
    }).join('') + '</select><small>' + t('rateVariantHint') + '</small></label>';
  }

  /* ---------- state ---------- */
  var defaultFx = P.impliedEurRate(DATA);
  function blank() {
    return { id: null, officer: { name: '', email: '', unit: '' }, ref: '', purpose: '', origin: 'Lyon',
      flights: [{ no: '', dep: '', arr: '' }, { no: '', dep: '', arr: '' }], dests: [{ key: '' }],
      provided: {}, overrides: {}, fx: defaultFx, fxSource: 'circular', fxDate: '' };
  }
  var mission = Object.assign(blank(), load(LS.draft, {}));
  var prefs = load(LS.settings, {});
  var settings = Object.assign({}, P.DEFAULT_SETTINGS, prefs);
  settings.shares = Object.assign({}, P.DEFAULT_SETTINGS.shares, prefs.shares);
  settings.mealTimes = Object.assign({}, P.DEFAULT_SETTINGS.mealTimes, prefs.mealTimes);
  var result = null;

  function buildMission() {
    var m = clone(mission);
    m.dests = m.dests.map(function (d) { return { area: BYKEY[d.key] || null }; });
    return m;
  }

  /* ---------- static texts ---------- */
  function renderStatic() {
    document.documentElement.lang = lang;
    $$('[data-t]').forEach(function (el) { el.textContent = t(el.getAttribute('data-t')); });
    document.title = 'INTERPOL · ' + t('appTitle');
    $('#back').setAttribute('aria-label', t('backDashFull')); $('#back').title = t('backDashFull');
    $$('#lang button').forEach(function (b) { b.classList.toggle('on', b.dataset.lang === lang); });
    $('#source').textContent = t('sourceLine', { ref: DATA.ref, d: fmtDate(DATA.date, true), n: AREAS.length });
    var d = new Date(DATA.date + 'T00:00:00Z'), now = new Date();
    var stale = now.getUTCFullYear() * 12 + now.getUTCMonth() > d.getUTCFullYear() * 12 + d.getUTCMonth();
    $('#banner').hidden = !stale;
    $('#banner').textContent = t('stale', { ref: DATA.ref, d: fmtDate(DATA.date, true) });
    $('#histCount').textContent = load(LS.history, []).length || '';
  }

  /* ---------- officer fields ---------- */
  var FIELD = { oName: ['officer', 'name'], oEmail: ['officer', 'email'], oUnit: ['officer', 'unit'], mRef: ['ref'], mPurpose: ['purpose'], mOrigin: ['origin'] };
  function fillFields() {
    Object.keys(FIELD).forEach(function (id) { var p = FIELD[id]; $('#' + id).value = p.length === 2 ? mission[p[0]][p[1]] : mission[p[0]]; });
    $('#fx').value = mission.fx;
  }
  Object.keys(FIELD).forEach(function (id) {
    $('#' + id).addEventListener('input', function (e) {
      var p = FIELD[id]; if (p.length === 2) mission[p[0]][p[1]] = e.target.value; else mission[p[0]] = e.target.value;
      if (id === 'mOrigin') renderTimelineLabels();
      store(LS.draft, mission);
    });
  });

  /* ---------- timeline ---------- */
  function placeName(i) { // i = -1 origin, else destination index
    if (i < 0 || i >= mission.dests.length) return mission.origin || '…';
    var a = BYKEY[mission.dests[i].key]; return a ? (a.name === 'Elsewhere' ? a.country : a.name.replace(/\s*\(.*$/, '')) : t('destination') + ' ' + (i + 1);
  }
  function flightTitle(i) {
    var f = mission.flights[i], from = placeName(i - 1), to = placeName(i);
    return esc(from) + (f.from ? ' (' + esc(f.from) + ')' : '') + ' → ' + esc(to) + (f.to ? ' (' + esc(f.to) + ')' : '');
  }
  function renderTimelineLabels() { $$('#timeline [data-ftitle]').forEach(function (el) { el.innerHTML = flightTitle(+el.dataset.ftitle); }); }
  function renderTimeline() {
    var n = mission.dests.length, h = '';
    for (var i = 0; i <= n; i++) {
      var f = mission.flights[i], tag = i === 0 ? t('outbound') : i === n ? t('inbound') : t('connection');
      h += '<div class="tl"><span class="pin">✈</span><div class="box">' +
        '<div class="box-h"><span data-ftitle="' + i + '">' + flightTitle(i) + '</span><span class="tag">' + tag + '</span></div>' +
        '<div class="fl">' +
        '<label class="fnow"><span>' + t('flightNo') + '</span><span class="fno"><input data-f="' + i + '.no" value="' + esc(f.no) + '" placeholder="AF1234" autocapitalize="characters">' +
        '<button type="button" data-lookup="' + i + '" title="' + t('lookup') + '" aria-label="' + t('lookup') + '">⌕</button></span></label>' +
        '<label><span>' + t('dep') + '</span><input type="datetime-local" data-f="' + i + '.dep" value="' + esc(f.dep) + '"></label>' +
        '<label><span>' + t('arr') + '</span><input type="datetime-local" data-f="' + i + '.arr" value="' + esc(f.arr) + '"></label>' +
        '</div></div></div>';
      if (i < n) {
        var a = BYKEY[mission.dests[i].key];
        h += '<div class="tl dest"><span class="pin">' + (i + 1) + '</span><div class="box">' +
          '<div class="box-h"><span>' + t('destination') + (n > 1 ? ' ' + (i + 1) : '') + '</span>' +
          (n > 1 ? '<button class="rm" data-rm="' + i + '">' + t('remove') + '</button>' : '') + '</div>' +
          '<div class="picker"><input data-dest="' + i + '" value="' + (a ? esc(areaLabel(a)) : '') + '" placeholder="' + t('destPlaceholder') + '" autocomplete="off" spellcheck="false"></div>' +
          variantSelect(a, i) + '<div class="destinfo" data-info="' + i + '">' + destInfo(a) + '</div></div></div>';
      }
    }
    $('#timeline').innerHTML = h;
  }
  function destInfo(a) {
    if (!a) return '';
    return '<span><b>' + a.usd + ' USD</b> ' + t('perDay') + '</span><span><b>' + money(a.usd * mission.fx, 'EUR') + '</b> ' + t('perDay') + '</span>' +
      '<span>' + t('room') + ' <b>' + a.room + ' %</b></span>';
  }
  var tl = $('#timeline');
  tl.addEventListener('input', function (e) {
    var f = e.target.dataset.f;
    if (f) { var p = f.split('.'); mission.flights[+p[0]][p[1]] = p[1] === 'no' ? e.target.value.toUpperCase() : e.target.value; recalc(); }
    else if (e.target.dataset.dest != null) openPicker(e.target);
  });
  tl.addEventListener('focusin', function (e) { if (e.target.dataset.dest != null) { e.target.select(); openPicker(e.target); } });
  tl.addEventListener('focusout', function (e) {
    if (e.target.dataset.dest == null) return;
    var inp = e.target; setTimeout(function () { var d = mission.dests[+inp.dataset.dest]; if (!d || !inp.isConnected) return; closePicker(inp); var a = BYKEY[d.key]; inp.value = a ? areaLabel(a) : ''; }, 150);
  });
  tl.addEventListener('keydown', function (e) {
    if (e.target.dataset.dest == null) return;
    var ul = $('ul', e.target.parentNode); if (!ul) return;
    var items = $$('li[data-key]', ul), cur = items.indexOf($('li.on', ul));
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); if (!items.length) return;
      var nx = (cur + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items.forEach(function (li, i) { li.classList.toggle('on', i === nx); }); items[nx].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' && items.length) { e.preventDefault(); pick(e.target, items[Math.max(cur, 0)].dataset.key); e.target.blur(); }
    else if (e.key === 'Escape') e.target.blur();
  });
  tl.addEventListener('mousedown', function (e) {
    var li = e.target.closest('li[data-key]'); if (!li) return;
    e.preventDefault(); var inp = $('input', li.closest('.picker')); pick(inp, li.dataset.key); inp.blur();
  });
  tl.addEventListener('click', function (e) {
    var rm = e.target.closest('[data-rm]'), lk = e.target.closest('[data-lookup]');
    if (rm) { var i = +rm.dataset.rm; var last = i === mission.dests.length - 1; mission.dests.splice(i, 1); mission.flights.splice(last ? i : i + 1, 1); mission.overrides = {}; renderTimeline(); recalc(); }
    if (lk) lookupFlight(+lk.dataset.lookup);
  });
  $('#btnAddDest').addEventListener('click', function () {
    mission.flights.splice(mission.flights.length - 1, 0, { no: '', dep: '', arr: '' });
    mission.dests.push({ key: '' }); renderTimeline(); recalc();
    var ins = $$('#timeline [data-dest]'); ins[ins.length - 1].focus();
  });

  function search(q) {
    var toks = norm(q).split(/[\s,—-]+/).filter(Boolean);
    if (!toks.length) return [];
    var hits = AREAS.filter(function (a) { return toks.every(function (k) { return a.search.indexOf(k) >= 0; }); });
    var q0 = toks[0];
    hits.sort(function (a, b) {
      var sa = (a.n.indexOf(q0) === 0 ? 0 : 2) + (isSpecial(a) ? 1 : 0), sb = (b.n.indexOf(q0) === 0 ? 0 : 2) + (isSpecial(b) ? 1 : 0);
      return sa - sb || a.n.length - b.n.length;
    });
    return hits.slice(0, 40);
  }
  function openPicker(inp) {
    closePicker(inp);
    var cur = BYKEY[mission.dests[+inp.dataset.dest].key];
    var q = cur && inp.value === areaLabel(cur) ? '' : inp.value, hits = search(q);
    if (!q.trim()) return;
    var ul = document.createElement('ul');
    ul.innerHTML = hits.length ? hits.map(function (a, i) {
      return '<li data-key="' + esc(a.key) + '"' + (i === 0 ? ' class="on"' : '') + '><span>' + esc(areaName(a)) + ' <em>· ' + esc(a.country) + '</em></span><small>' + a.usd + ' USD · ' + a.room + ' %</small></li>';
    }).join('') : '<li class="none">' + t('noResults') + '</li>';
    inp.parentNode.appendChild(ul);
  }
  function closePicker(inp) { var ul = $('ul', inp.parentNode); if (ul) ul.remove(); }
  function pick(inp, key) {
    var i = +inp.dataset.dest; mission.dests[i].key = key; renderTimeline(); recalc();
  }
  tl.addEventListener('change', function (e) {
    if (e.target.dataset.variant == null) return;
    mission.dests[+e.target.dataset.variant].key = e.target.value; renderTimeline(); recalc();
  });

  /* ---------- covered costs: how many nights / meals are paid by someone else ---------- */
  var COVER = [['hotel', 'hotelPaid'], ['breakfast', 'bPaid'], ['lunch', 'lPaid'], ['dinner', 'dPaid']];
  function setState(date, comp, state) { // write one calendar cell, keeping overrides minimal
    var day = result.days.filter(function (d) { return d.date === date; })[0]; if (!day) return;
    var x = day.comps[comp], def = x.auto === 'pay' && mission.provided[comp] ? 'provided' : x.auto, k = date + '|' + comp;
    if (state === def) delete mission.overrides[k]; else mission.overrides[k] = state;
  }
  function coverCount(c) {
    var n = 0, max = 0;
    if (result && result.ok) result.days.forEach(function (d) { var s = d.comps[c].state; if (s !== 'na') max++; if (s === 'provided') n++; });
    return { n: n, max: max };
  }
  function renderChips() {
    var ok = result && result.ok, any = false;
    var rows = COVER.map(function (c) {
      var k = coverCount(c[0]); if (k.n) any = true;
      return '<div class="cov' + (k.n ? ' on' : '') + '"><span class="cov-l">' + COMP_ICON[c[0]] + ' ' + t(c[1]) + '</span>' +
        '<span class="step"><button data-cov="' + c[0] + '" data-a="-" aria-label="−"' + (k.n ? '' : ' disabled') + '>−</button>' +
        '<b>' + k.n + '</b><small>/ ' + k.max + '</small>' +
        '<button data-cov="' + c[0] + '" data-a="+" aria-label="+"' + (ok && k.n < k.max ? '' : ' disabled') + '>+</button></span>' +
        '<button class="all" data-cov="' + c[0] + '" data-a="all"' + (ok && k.n < k.max ? '' : ' disabled') + '>' + t('all') + '</button></div>';
    }).join('');
    $('#chips').innerHTML = '<button class="chip full' + (any ? '' : ' on') + '" data-cov="full">✓ ' + t('fullPerDiem') + '</button>' + rows;
  }
  $('#chips').addEventListener('click', function (e) {
    var b = e.target.closest('[data-cov]'); if (!b || b.disabled) return;
    var c = b.dataset.cov, a = b.dataset.a, days = result && result.ok ? result.days : [], i;
    if (c === 'full') { mission.provided = {}; mission.overrides = {}; }
    else if (a === 'all') { mission.provided[c] = true; days.forEach(function (d) { delete mission.overrides[d.date + '|' + c]; }); }
    else if (a === '+') { for (i = 0; i < days.length; i++) if (days[i].comps[c].state === 'pay') { setState(days[i].date, c, 'provided'); break; } }
    else { for (i = days.length - 1; i >= 0; i--) if (days[i].comps[c].state === 'provided') { setState(days[i].date, c, 'pay'); break; } }
    recalc();
  });

  /* ---------- results ---------- */
  function noteText(n) {
    var st = result.stops[n.stop], c = st ? areaName(st.area) : '';
    return n.code === 'arr' ? t('nArr', { t: n.time, c: c }) : n.code === 'dep' ? t('nDep', { t: n.time, c: c }) : n.code === 'travel' ? t('nTravel') : t('nLong');
  }
  function renderDays() {
    var el = $('#days');
    if (!result.ok) { el.innerHTML = '<div class="empty">' + t('eIncomplete') + '</div>'; return; }
    var h = '<table class="dtable"><thead><tr><th>' + t('date') + '</th>' + P.COMPS.map(function (c) { return '<th title="' + t(c) + '">' + COMP_ICON[c] + ' <span>' + t(c) + '</span></th>'; }).join('') +
      '<th style="text-align:right">' + t('dayTotal') + '</th></tr></thead><tbody>';
    result.days.forEach(function (d) {
      h += '<tr><td class="d"><b>' + esc(fmtDate(d.date)) + '</b><small>' + esc(d.notes.map(noteText).join(' · ') || areaName(d.area)) + '</small></td>';
      P.COMPS.forEach(function (c) {
        var x = d.comps[c], lab = x.state === 'pay' ? t('stPay') : x.state === 'provided' ? t('stProvided') : t('stNa');
        h += '<td><button class="cell ' + x.state + (x.overridden ? ' ov' : '') + '" data-d="' + d.date + '" data-c="' + c + '" title="' + t(c) + ': ' + lab + '">' +
          (x.state === 'na' ? '—' : num(x.usd * mission.fx)) + '</button></td>';
      });
      h += '<td class="tot">' + money(d.eur, 'EUR') + '<small>' + money(d.usd, 'USD') + '</small></td></tr>';
    });
    el.innerHTML = h + '</tbody></table>';
  }
  $('#days').addEventListener('click', function (e) {
    var b = e.target.closest('.cell'); if (!b) return;
    var day = result.days.filter(function (d) { return d.date === b.dataset.d; })[0], x = day.comps[b.dataset.c];
    var order = ['pay', 'provided', 'na'];
    setState(b.dataset.d, b.dataset.c, order[(order.indexOf(x.state) + 1) % 3]);
    recalc();
  });

  function renderSummary() {
    var ok = result.ok, T = result.totals;
    $('#totEUR').textContent = ok ? money(T.totalEUR, 'EUR') : '—';
    $('#mTot').textContent = ok ? money(T.totalEUR, 'EUR') : '—';
    $('#totUSD').textContent = ok ? '≈ ' + money(T.totalUSD, 'USD') : '';
    var h = '';
    if (ok) {
      h += '<div><span>' + t('dsaSubtotal') + '<small>' + T.nights + ' ' + t('nights') + ' · ' + T.days + ' ' + t('days') + '</small></span><span>' + money(T.dsaEUR, 'EUR') + '<small>' + money(T.dsaUSD, 'USD') + '</small></span></div>';
      if (T.providedUSD > 0) h += '<div class="ded"><span>' + t('deducted') + '</span><span>− ' + money(T.providedEUR, 'EUR') + '</span></div>';
      h += '<div><span>' + t('taxi') + '</span><span>' + money(T.taxiEUR, 'EUR') + '</span></div>';
    }
    $('#sumLines').innerHTML = h;
    $('#fxNote').textContent = mission.fxSource === 'live' ? t('fxNoteLive', { d: mission.fxDate }) : mission.fxSource === 'manual' ? t('fxNoteManual') : t('fxNoteCircular');
    var msgs = [];
    result.errors.forEach(function (e) {
      if (e.code === 'incomplete') return;
      var filled = mission.dests.some(function (d) { return d.key; }) || mission.flights.some(function (f) { return f.dep || f.arr; });
      if ((e.code === 'noDest' || e.code === 'noTimes') && !filled) return;
      msgs.push('<div class="msg err">' + t('e' + e.code.charAt(0).toUpperCase() + e.code.slice(1), e) + '</div>');
    });
    result.warnings.forEach(function (w) { if (w.code === 'earlyArrival') msgs.push('<div class="msg warn">' + t('wEarly', { i: w.i, d: fmtDate(w.date) }) + '</div>'); });
    mission.dests.forEach(function (d) { var a = BYKEY[d.key]; if (a && isSpecial(a)) msgs.push('<div class="msg warn">' + t('wSpecial', { n: esc(areaName(a)) }) + '</div>'); });
    $('#msgs').innerHTML = msgs.join('');
    ['btnPdf', 'btnEmail', 'btnXlsx', 'mPdf'].forEach(function (id) { $('#' + id).disabled = !ok; });
  }

  function renderRates() {
    var seen = {}, h = '';
    mission.dests.forEach(function (d) {
      var a = BYKEY[d.key]; if (!a || seen[a.key]) return; seen[a.key] = 1;
      var b = P.breakdown(a.usd, a.room, settings), parts = ['hotel', 'breakfast', 'lunch', 'dinner', 'incid'];
      h += '<div class="card rate"><h3>' + esc(areaName(a)) + '</h3><div class="sub">' + esc(a.country) + ' · ' + esc(a.currency) + '</div>' +
        '<div class="big">' + a.usd + ' USD <small>' + t('perDay') + ' · ' + money(a.usd * mission.fx, 'EUR') + '</small></div>' +
        '<div class="bar">' + parts.map(function (c) { return '<i class="c-' + c + '" style="width:' + (b[c] / a.usd * 100) + '%"></i>'; }).join('') + '</div><div class="split">' +
        parts.map(function (c) { return '<span><b class="dot c-' + c + '"></b>' + t(c) + '</span><span>' + (b[c] / a.usd * 100).toFixed(1).replace(/\.0$/, '') + ' %</span><span>' + money(b[c] * mission.fx, 'EUR') + '</span>'; }).join('') +
        '</div></div>';
    });
    $('#rates').innerHTML = h;
  }

  function recalc() {
    result = P.compute(buildMission(), settings);
    renderChips(); renderDays(); renderSummary(); renderRates();
    store(LS.draft, mission);
  }
  function renderAll() { renderStatic(); fillFields(); renderTimeline(); recalc(); }

  /* ---------- exchange rate ---------- */
  function setFx(v, src, date) {
    mission.fx = v; mission.fxSource = src; mission.fxDate = date || '';
    if (src !== 'manual') $('#fx').value = v;
    $$('[data-info]').forEach(function (el) { el.innerHTML = destInfo(BYKEY[mission.dests[+el.dataset.info].key]); });
    recalc();
  }
  $('#fx').addEventListener('input', function (e) { setFx(parseFloat(e.target.value), 'manual'); });
  $('#fxCircular').addEventListener('click', function () { setFx(defaultFx, 'circular'); });
  $('#fxLive').addEventListener('click', function () {
    var urls = ['https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR', 'https://api.frankfurter.app/latest?from=USD&to=EUR'];
    (function next(i) {
      if (i >= urls.length) return toast(t('fxFail'));
      fetch(urls[i]).then(function (r) { if (!r.ok) throw 0; return r.json(); })
        .then(function (j) { if (!(j.rates && j.rates.EUR > 0)) throw 0; setFx(Math.round(j.rates.EUR * 10000) / 10000, 'live', j.date); })
        .catch(function () { next(i + 1); });
    })(0);
  });

  /* ---------- toast / dialogs ---------- */
  var toastT;
  function toast(msg) { var el = $('#toast'); el.textContent = msg; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(function () { el.hidden = true; }, 3800); }
  document.addEventListener('click', function (e) { var c = e.target.closest('[data-close]'); if (c) c.closest('dialog').close(); });
  $$('dialog').forEach(function (d) { d.addEventListener('click', function (e) { if (e.target === d) d.close(); }); });

  /* ---------- language ---------- */
  $('#lang').addEventListener('click', function (e) { var b = e.target.closest('[data-lang]'); if (!b) return; lang = b.dataset.lang; store(LS.lang, lang); renderAll(); });

  /* ---------- history ---------- */
  function missionLabel(m) {
    var places = m.dests.map(function (d) { var a = BYKEY[d.key]; return a ? (a.name === 'Elsewhere' ? a.country : a.name) : '?'; }).join(' + ');
    return (m.ref ? m.ref + ' · ' : '') + places;
  }
  function renderHistory() {
    var list = load(LS.history, []);
    $('#histCount').textContent = list.length || '';
    $('#histList').innerHTML = list.length ? list.map(function (h) {
      var d = (h.mission.flights[0].dep || '').slice(0, 10);
      return '<div class="hrow"><div><b>' + esc(missionLabel(h.mission)) + '</b><small>' + (d ? esc(fmtDate(d, true)) + ' · ' : '') + esc(h.mission.officer.name || '') +
        (h.totalEUR != null ? ' · ' + money(h.totalEUR, 'EUR') : '') + '</small></div>' +
        '<button data-h="load" data-id="' + h.id + '">' + t('load') + '</button><button data-h="dup" data-id="' + h.id + '">' + t('duplicate') + '</button>' +
        '<button class="danger" data-h="del" data-id="' + h.id + '">' + t('del') + '</button></div>';
    }).join('') : '<p class="hint">' + t('noHistory') + '</p>';
  }
  $('#btnHistory').addEventListener('click', function () { renderHistory(); $('#dlgHistory').showModal(); });
  $('#histList').addEventListener('click', function (e) {
    var b = e.target.closest('[data-h]'); if (!b) return;
    var list = load(LS.history, []), i = list.findIndex(function (h) { return h.id === b.dataset.id; }); if (i < 0) return;
    if (b.dataset.h === 'del') { list.splice(i, 1); store(LS.history, list); renderHistory(); return toast(t('deleted')); }
    mission = Object.assign(blank(), clone(list[i].mission));
    if (b.dataset.h === 'dup') { mission.id = null; mission.ref = mission.ref ? t('copyOf') + ' ' + mission.ref : ''; mission.overrides = {}; mission.flights.forEach(function (f) { f.dep = ''; f.arr = ''; f.no = ''; }); }
    $('#dlgHistory').close(); renderAll();
  });
  $('#btnSave').addEventListener('click', function () {
    var list = load(LS.history, []);
    if (!mission.id) mission.id = 'm' + Date.now().toString(36);
    var entry = { id: mission.id, savedAt: new Date().toISOString(), mission: clone(mission), totalEUR: result.ok ? result.totals.totalEUR : null };
    var i = list.findIndex(function (h) { return h.id === mission.id; });
    if (i >= 0) list[i] = entry; else list.unshift(entry);
    store(LS.history, list); store(LS.draft, mission); $('#histCount').textContent = list.length; toast(t('saved'));
  });
  $('#btnNew').addEventListener('click', function () {
    if (!confirm(t('confirmNew'))) return;
    var keep = mission.officer, origin = mission.origin; mission = blank(); mission.officer = keep; mission.origin = origin; renderAll(); window.scrollTo(0, 0);
  });

  /* ---------- settings ---------- */
  function fillSettings() {
    $$('[name=method]').forEach(function (r) { r.checked = r.value === settings.method; });
    $$('[name=incidMode]').forEach(function (r) { r.checked = r.value === settings.incidMode; });
    $('#shB').value = settings.shares.breakfast; $('#shL').value = settings.shares.lunch; $('#shD').value = settings.shares.dinner; $('#shI').value = settings.shares.incid;
    $('#tmB').value = settings.mealTimes.breakfast; $('#tmL').value = settings.mealTimes.lunch; $('#tmD').value = settings.mealTimes.dinner;
    $('#taxi').value = settings.taxiEUR; $('#apiKey').value = settings.apiKey || '';
  }
  $('#btnSettings').addEventListener('click', function () { fillSettings(); $('#dlgSettings').showModal(); });
  $('#dlgSettings').addEventListener('input', function () {
    var n = function (id, d) { var v = parseFloat($(id).value); return v >= 0 ? v : d; };
    settings.method = ($('[name=method]:checked') || {}).value || 'icsc';
    settings.incidMode = ($('[name=incidMode]:checked') || {}).value || 'day';
    settings.shares = { breakfast: n('#shB', 6), lunch: n('#shL', 12), dinner: n('#shD', 12), incid: n('#shI', 20) };
    if (settings.shares.breakfast + settings.shares.lunch + settings.shares.dinner + settings.shares.incid <= 0) settings.shares = clone(P.DEFAULT_SETTINGS.shares);
    settings.mealTimes = { breakfast: $('#tmB').value || '08:00', lunch: $('#tmL').value || '13:00', dinner: $('#tmD').value || '20:00' };
    settings.taxiEUR = n('#taxi', 60); settings.apiKey = $('#apiKey').value.trim();
    store(LS.settings, settings); recalc();
  });
  $('#btnReset').addEventListener('click', function () {
    var key = settings.apiKey; settings = clone(P.DEFAULT_SETTINGS); settings.apiKey = key; store(LS.settings, settings); fillSettings(); recalc();
  });

  /* ---------- flight number lookup (optional, AeroDataBox via RapidAPI) ---------- */
  function lookupFlight(i) {
    var f = mission.flights[i], no = (f.no || '').replace(/\s+/g, ''), date = (f.dep || '').slice(0, 10);
    if (!settings.apiKey) { toast(t('needKey')); fillSettings(); $('#dlgSettings').showModal(); return; }
    if (!no || !date) return toast(t('needNoDate'));
    fetch('https://aerodatabox.p.rapidapi.com/flights/number/' + encodeURIComponent(no) + '/' + date, {
      headers: { 'X-RapidAPI-Key': settings.apiKey, 'X-RapidAPI-Host': 'aerodatabox.p.rapidapi.com' }
    }).then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (j) {
      var x = Array.isArray(j) ? j[0] : null;
      var loc = function (p) { var s = p && p.scheduledTime && p.scheduledTime.local || p && p.scheduledTimeLocal || ''; return /^\d{4}-\d\d-\d\d[ T]\d\d:\d\d/.test(s) ? s.slice(0, 10) + 'T' + s.slice(11, 16) : ''; };
      var dep = x && loc(x.departure), arr = x && loc(x.arrival);
      if (!dep || !arr) throw 0;
      f.dep = dep; f.arr = arr; f.from = x.departure.airport && x.departure.airport.iata || ''; f.to = x.arrival.airport && x.arrival.airport.iata || '';
      renderTimeline(); recalc(); toast(t('flightFound'));
    }).catch(function () { toast(t('flightNotFound')); });
  }

  /* ---------- itinerary import ---------- */
  var imp = { segs: [], stays: [] };
  function loadScript(src) { return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }
  function pdfText(file) {
    return (window.pdfjsLib ? Promise.resolve() : loadScript('vendor/pdf.min.js')).then(function () {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
      return file.arrayBuffer();
    }).then(function (buf) { return window.pdfjsLib.getDocument({ data: buf }).promise; }).then(function (pdf) {
      var pages = [];
      for (var p = 1; p <= pdf.numPages; p++) pages.push(pdf.getPage(p).then(function (pg) { return pg.getTextContent(); }).then(function (tc) {
        var rows = {};
        tc.items.forEach(function (it) { if (!it.str.trim()) return; var y = Math.round(it.transform[5] / 3) * 3; (rows[y] = rows[y] || []).push(it); });
        return Object.keys(rows).sort(function (a, b) { return b - a; }).map(function (y) {
          return rows[y].sort(function (a, b) { return a.transform[4] - b.transform[4]; }).map(function (it) { return it.str; }).join(' ');
        }).join('\n');
      }));
      return Promise.all(pages).then(function (a) { return a.join('\n'); });
    });
  }
  function analyse(text) {
    imp.segs = window.Itin.parse(text, new Date().getFullYear()); imp.stays = window.Itin.suggestStays(imp.segs);
    $('#impText').value = text; renderImport();
  }
  function renderImport() {
    var h = imp.segs.length ? '' : '<div class="empty">' + t('importNone') + '</div>';
    imp.segs.forEach(function (s, i) {
      h += '<div class="seg"><label><span>' + t('flightNo') + '</span><input data-i="' + i + '" data-k="no" value="' + esc(s.no) + '"></label>' +
        '<label><span>' + t('from') + '</span><input data-i="' + i + '" data-k="from" value="' + esc(s.from) + '" maxlength="3"></label>' +
        '<label><span>' + t('to') + '</span><input data-i="' + i + '" data-k="to" value="' + esc(s.to) + '" maxlength="3"></label>' +
        '<label><span>' + t('dep') + '</span><input type="datetime-local" data-i="' + i + '" data-k="dep" value="' + esc(s.dep) + '"></label>' +
        '<label><span>' + t('arr') + '</span><input type="datetime-local" data-i="' + i + '" data-k="arr" value="' + esc(s.arr) + '"></label>' +
        '<button class="rm" data-del="' + i + '" title="' + t('remove') + '">×</button></div>';
      if (i + 1 < imp.segs.length) h += '<div class="gap"><button data-stay="' + i + '" data-v="0" class="' + (imp.stays[i] ? '' : 'on') + '">' + t('layover') + '</button>' +
        '<button data-stay="' + i + '" data-v="1" class="' + (imp.stays[i] ? 'on' : '') + '">📍 ' + t('stay') + '</button><small>' + esc(s.to || '') + '</small></div>';
    });
    $('#impSegs').innerHTML = h;
  }
  $('#btnImport').addEventListener('click', function () { $('#fileItin').click(); });
  $('#fileItin').addEventListener('change', function (e) {
    var file = e.target.files[0]; e.target.value = ''; if (!file) return;
    toast(t('importReading'));
    var isPdf = /pdf$/i.test(file.type) || /\.pdf$/i.test(file.name);
    (isPdf ? pdfText(file) : file.text()).then(function (text) { analyse(text); $('#dlgImport').showModal(); })
      .catch(function () { toast(t('importFail')); analyse(''); $('#dlgImport').showModal(); });
  });
  $('#impParse').addEventListener('click', function () { analyse($('#impText').value); });
  $('#impAdd').addEventListener('click', function () { imp.segs.push({ no: '', from: '', to: '', dep: '', arr: '' }); if (imp.segs.length > 1) imp.stays.push(false); renderImport(); });
  $('#impSegs').addEventListener('input', function (e) { var d = e.target.dataset; if (d.k) imp.segs[+d.i][d.k] = d.k === 'dep' || d.k === 'arr' ? e.target.value : e.target.value.toUpperCase(); });
  $('#impSegs').addEventListener('click', function (e) {
    var s = e.target.closest('[data-stay]'), d = e.target.closest('[data-del]');
    if (s) { imp.stays[+s.dataset.stay] = s.dataset.v === '1'; renderImport(); }
    if (d) { var i = +d.dataset.del; imp.segs.splice(i, 1); imp.stays.splice(Math.min(i, imp.stays.length - 1), 1); renderImport(); }
  });
  $('#impApply').addEventListener('click', function () {
    var segs = imp.segs.filter(function (s) { return s.dep && s.arr; });
    var stays = []; imp.segs.forEach(function (s, i) { if (s.dep && s.arr && stays.length < segs.length - 1) stays.push(!!imp.stays[i]); });
    var legs = window.Itin.mergeLegs(segs, stays);
    if (legs.length < 2) return toast(t('importNeedStay'));
    mission.flights = legs.map(function (l) { return { no: l.no, dep: l.dep, arr: l.arr, from: l.from, to: l.to }; });
    mission.dests = legs.slice(1).map(function (_, i) { return mission.dests[i] || { key: '' }; });
    mission.overrides = {};
    $('#dlgImport').close(); renderTimeline(); recalc(); toast(t('importApplied'));
    var first = $$('#timeline [data-dest]').filter(function (el) { return !el.value; })[0]; if (first) first.focus();
  });

  /* ---------- report / export ---------- */
  function ctx() {
    return { result: result, mission: mission, settings: settings, data: DATA, lang: lang, t: t, money: money, num: num, fmtDate: fmtDate, fmtDT: fmtDT,
      areaName: areaName, noteText: noteText, placeName: placeName };
  }
  function fileBase() {
    var d = (mission.flights[0].dep || '').slice(0, 10);
    return ('PerDiem_' + (mission.ref || placeName(0)) + '_' + d).replace(/[^\w.-]+/g, '_');
  }
  function downloadPdf() { if (!result.ok) return; window.Report.pdf(ctx()).save(fileBase() + '.pdf'); }
  $('#btnPdf').addEventListener('click', downloadPdf);
  $('#mPdf').addEventListener('click', downloadPdf);
  $('#btnXlsx').addEventListener('click', function () { if (result.ok) window.Report.xlsx(ctx(), fileBase() + '.xlsx'); });
  $('#btnEmail').addEventListener('click', function () {
    if (!result.ok) return;
    var doc = window.Report.pdf(ctx()), name = fileBase() + '.pdf', T = result.totals;
    var subject = t('emailSubject') + ' — ' + missionLabel(mission);
    var body = t('emailBody') + '\n\n' + t('totalToPay') + ': ' + money(T.totalEUR, 'EUR') + ' (≈ ' + money(T.totalUSD, 'USD') + ')\n' +
      t('dsaSubtotal') + ': ' + money(T.dsaEUR, 'EUR') + '\n' + t('taxi') + ': ' + money(T.taxiEUR, 'EUR') + '\n';
    var file; try { file = new File([doc.output('blob')], name, { type: 'application/pdf' }); } catch (e) { file = null; }
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: subject, text: body }).then(function () { toast(t('emailShared')); }).catch(function () { /* cancelled */ });
      return;
    }
    doc.save(name);
    location.href = 'mailto:' + encodeURIComponent(mission.officer.email || '') + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
    toast(t('emailFallback'));
  });

  /* ---------- start ---------- */
  renderAll();
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(function () { /* offline support is optional */ });
  window.__perdiem = { get mission() { return mission; }, get result() { return result; } };
})();
