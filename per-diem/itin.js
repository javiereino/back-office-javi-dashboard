/* Itinerary text parser — best-effort extraction of flight segments from an e-ticket / agency itinerary.
   Output is always reviewed by the officer before it is applied. Pure functions (browser + Node). */
(function (root) {
  'use strict';

  var MONTHS = {
    jan: 1, ene: 1, janv: 1, feb: 2, fev: 2, fevr: 2, mar: 3, mars: 3, apr: 4, abr: 4, avr: 4, avril: 4,
    may: 5, mai: 5, jun: 6, juin: 6, jul: 7, juil: 7, aug: 8, ago: 8, aou: 8, aout: 8,
    sep: 9, sept: 9, set: 9, oct: 10, nov: 11, dec: 12, dic: 12
  };
  var AIRLINES = ('AF KL LH LX OS SN IB I2 UX VY U2 FR BA EI AY SK DY D8 TP AZ A3 OA TK PC LO OK RO JU OU FB BT ' +
    'AA DL UA AC WS B6 AS WN AM CM AV LA JJ G3 AR H2 AD ' +
    'EK QR EY WY GF SV MS RJ ME KU XY FZ G9 ' +
    'SQ CX JL NH KE OZ TG MH GA PR VN CI BR CA MU CZ HU AI 6E UK UL PK BG QF NZ FJ ' +
    'ET KQ SA AT TU AH MK WB UR TC HF KP W3 P4 QC DT TM RW ' +
    'W6 W4 EW 4U DE X3 HV TO SS BF TX LG WK EN A5 YS V7 S7 SU PS HY KC B2 J2 LY 5F BJ 8U').split(' ');
  var AIRLINE_SET = {}; AIRLINES.forEach(function (a) { AIRLINE_SET[a] = 1; });
  var NOT_AIRPORT = { THE: 1, AND: 1, FOR: 1, VIA: 1, DEP: 1, ARR: 1, EUR: 1, USD: 1, PNR: 1, REF: 1, TAX: 1, VAT: 1, TVA: 1,
    IVA: 1, MRS: 0, MON: 1, TUE: 1, WED: 1, THU: 1, FRI: 1, SAT: 1, SUN: 1, JAN: 1, FEB: 1, MAR: 1, APR: 1, MAY: 1, JUN: 1,
    JUL: 1, AUG: 1, SEP: 1, OCT: 1, NOV: 1, DEC: 1, ENE: 1, ABR: 1, AGO: 1, DIC: 1, VOL: 1, DES: 1, LES: 1, DEL: 1, LAS: 1,
    LOS: 1, CON: 1, POR: 1, SIN: 0, NON: 1, OUI: 1, YES: 1, ETA: 1, ETD: 1, GMT: 1, UTC: 1, KGS: 1, PCS: 1, ECO: 1, BUS: 1,
    TEL: 1, FAX: 1, MR: 1, AIR: 1, FLY: 1, DAY: 1, NUM: 1, FQTV: 1, ADT: 1, CHD: 1, INF: 1, SEAT: 1, YOU: 1, ARE: 1, NOT: 1 };

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function strip(s) { return s.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
  function year(y, def) { if (!y) return def; y = +y; return y < 100 ? 2000 + y : y; }

  // Full month names (EN/ES/FR) so that a word like "Marriott" is never taken for "Mar".
  var FULL = [
    'january february march april may june july august september october november december',
    'enero febrero marzo abril mayo junio julio agosto septiembre octubre noviembre diciembre',
    'janvier fevrier mars avril mai juin juillet aout septembre octobre novembre decembre',
    '- - - - - - - - setiembre - - -'
  ].map(function (l) { return l.split(' '); });
  function monthOf(word) {
    var w = word.toLowerCase().replace(/\.$/, '');
    if (MONTHS[w]) return MONTHS[w];
    for (var l = 0; l < FULL.length; l++) for (var k = 0; k < 12; k++) if (w.length >= 3 && FULL[l][k].indexOf(w) === 0) return k + 1;
    return 0;
  }

  function findDates(text, defYear) {
    var out = [], m, t = strip(text);
    var alt = '((?:' + Object.keys(MONTHS).sort(function (a, b) { return b.length - a.length; }).join('|') + ')[a-z]*)';
    // Each rule returns [year or null, month word, day]. Order matters: earlier rules win overlaps.
    var res = [
      // Nov 20, 2026 · OCT19,2026
      [new RegExp('\\b' + alt + '\\.?\\s*(\\d{1,2})(?:st|nd|rd|th)?\\b,?\\s*(20\\d{2})\\b', 'gi'), function (m) { return [+m[3], m[1], +m[2]]; }],
      // 2026-11-20
      [/\b(20\d{2})-(\d{2})-(\d{2})\b/g, function (m) { return [+m[1], +m[2], +m[3]]; }],
      // 20NOV26, 20 Nov 2026, 20 novembre 2026, 20-Nov-26, 20 de noviembre de 2026
      [new RegExp('\\b(\\d{1,2})[\\s.-]*(?:de\\s+)?' + alt + '\\.?[\\s,.-]*(?:de\\s+)?((?:20)?\\d{2})?(?![\\d:hH])', 'gi'),
        function (m) { return [m[3] ? year(m[3]) : null, m[2], +m[1]]; }],
      // 20/11/2026, 20.11.26 (day first — European convention)
      [/\b(\d{1,2})[\/.](\d{1,2})[\/.]((?:20)?\d{2})\b/g, function (m) { return [year(m[3]), +m[2], +m[1]]; }],
      // Mon, Oct 19 (no year: taken from the nearest dated header)
      [new RegExp('\\b' + alt + '\\.?\\s*(\\d{1,2})(?:st|nd|rd|th)?\\b(?!\\s*[:.\\/]\\d)', 'gi'), function (m) { return [null, m[1], +m[2]]; }]
    ];
    res.forEach(function (r) {
      while ((m = r[0].exec(t))) {
        var d = r[1](m), mo = typeof d[1] === 'number' ? d[1] : monthOf(d[1]);
        if (!mo || d[2] < 1 || d[2] > 31 || (d[0] != null && (d[0] < 2000 || d[0] > 2100))) continue;
        var pos = m.index, end = m.index + m[0].length;
        if (out.some(function (o) { return pos < o.end && end > o.pos; })) continue;
        out.push({ pos: pos, end: end, y: d[0], mo: mo, d: d[2] });
      }
    });
    out.sort(function (a, b) { return a.pos - b.pos; });
    var docYear = (out.filter(function (o) { return o.y != null; })[0] || {}).y || defYear, lastY = null, lastMo = null;
    out.forEach(function (o) {
      if (o.y == null) {
        o.y = lastY || docYear;
        if (lastMo && o.mo < lastMo - 6) o.y++; // e.g. a December header followed by a January flight
      } else { lastY = o.y; lastMo = o.mo; }
      o.iso = o.y + '-' + pad(o.mo) + '-' + pad(o.d);
    });
    return out;
  }

  // Some PDFs letter-space their headings ("M O N , O C T 1 9 , 2 0 2 6"): join such lines back together.
  function unspace(text) {
    return text.split('\n').map(function (l) {
      var tk = l.trim().split(/\s+/);
      return tk.length >= 6 && tk.filter(function (x) { return x.length === 1; }).length >= tk.length * 0.7 ? tk.join('') : l;
    }).join('\n');
  }

  function findTimes(text) {
    var out = [], m, re = /(^|[^\d:.,])([01]?\d|2[0-3])\s?[:hH]\s?([0-5]\d)(?!\d)(?:\s?([AaPp])\.?[Mm]\.?)?(?:\s*\(?\+\s?(\d)\)?)?/g;
    while ((m = re.exec(text))) {
      var h = +m[2];
      if (m[4]) { var pm = m[4].toLowerCase() === 'p'; if (pm && h < 12) h += 12; if (!pm && h === 12) h = 0; }
      out.push({ pos: m.index + m[1].length, hm: pad(h) + ':' + m[3], plus: +(m[5] || 0) });
    }
    return out;
  }

  function findFlights(text) {
    var out = [], m, re = /(^|[^A-Z0-9])([A-Z][A-Z0-9]|\d[A-Z])\s?(\d{2,4})(?![\dA-Za-z:\/.-])/g; // not "A321Neo"
    while ((m = re.exec(text))) {
      if (AIRLINE_SET[m[2]]) out.push({ pos: m.index + m[1].length, no: m[2] + m[3].replace(/^0+(?=\d{2})/, '') });
    }
    return out;
  }

  function findAirports(text) {
    var out = [], m, re = /\(([A-Z]{3})\)/g;
    while ((m = re.exec(text))) out.push({ pos: m.index, code: m[1] });
    if (out.length >= 2) return out;
    out = []; re = /(^|[^A-Za-z0-9])([A-Z]{3})(?![A-Za-z0-9])/g;
    while ((m = re.exec(text))) if (!NOT_AIRPORT[m[2]]) out.push({ pos: m.index, code: m[2] });
    return out;
  }

  function addDays(iso, n) {
    var d = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) + n * 86400000);
    return d.toISOString().slice(0, 10);
  }

  function parse(text, defYear) {
    text = unspace(String(text || '').replace(/\r/g, '').replace(/[\u00a0\t]+/g, ' '));
    defYear = defYear || new Date().getFullYear();
    var flights = findFlights(text), dates = findDates(text, defYear), segs = [], seen = {};
    flights.forEach(function (f, i) {
      var end = Math.min(i + 1 < flights.length ? flights[i + 1].pos : text.length, f.pos + 700);
      // The header date of a segment usually sits just before the flight number.
      var prev = null, inWin = [];
      dates.forEach(function (d) {
        if (d.pos < f.pos && f.pos - d.pos < 250 && !(i > 0 && d.pos < flights[i - 1].pos)) prev = d;
        if (d.pos >= f.pos && d.pos < end) inWin.push(d);
      });
      var win = text.slice(f.pos, end);
      var times = findTimes(win).map(function (t) { t.pos += f.pos; return t; })
        .filter(function (t) { return !dates.some(function (d) { return t.pos >= d.pos && t.pos < d.end; }); });
      if (times.length < 2) return;
      var t1 = times[0], t2 = times[1];
      var depDate = null, arrDate = null;
      var before = inWin.filter(function (d) { return d.pos < t1.pos; });
      var between = inWin.filter(function (d) { return d.pos > t1.pos && d.pos < t2.pos; });
      var after = inWin.filter(function (d) { return d.pos > t2.pos && d.pos - t2.pos < 40; });
      depDate = before.length ? before[before.length - 1].iso : (prev ? prev.iso : (inWin[0] ? inWin[0].iso : null));
      if (!depDate) return;
      if (between.length) arrDate = between[between.length - 1].iso;
      else if (after.length && after[0].iso >= depDate) arrDate = after[0].iso;
      else if (before.length >= 2 && before[before.length - 2].iso < depDate) { arrDate = depDate; depDate = before[before.length - 2].iso; }
      else arrDate = depDate;
      if (t2.plus) arrDate = addDays(depDate, t2.plus);
      else if (arrDate === depDate && t2.hm < t1.hm) arrDate = addDays(depDate, 1); // overnight flight
      var ap = findAirports(win);
      var seg = { no: f.no, from: ap[0] ? ap[0].code : '', to: ap[1] ? ap[1].code : '',
        dep: depDate + 'T' + t1.hm, arr: arrDate + 'T' + t2.hm };
      var key = seg.no + seg.dep;
      if (!seen[key]) { seen[key] = 1; segs.push(seg); }
    });
    segs.sort(function (a, b) { return a.dep < b.dep ? -1 : a.dep > b.dep ? 1 : 0; });
    return segs;
  }

  function mins(s) { return Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10), +s.slice(11, 13), +s.slice(14, 16)) / 60000; }

  // Suggest which gaps between consecutive flights are real stays (true) and which are connections (false).
  function suggestStays(segs, minStayHours) {
    var out = [];
    for (var i = 0; i + 1 < segs.length; i++) out.push(mins(segs[i + 1].dep) - mins(segs[i].arr) >= (minStayHours || 8) * 60);
    return out;
  }

  // Merge connections: returns flights [{no, dep, arr, from, to}] with one entry per leg between stays.
  function mergeLegs(segs, stays) {
    var legs = [], cur = null;
    segs.forEach(function (s, i) {
      if (!cur) cur = { no: s.no, dep: s.dep, arr: s.arr, from: s.from, to: s.to };
      else { cur.no += ' + ' + s.no; cur.arr = s.arr; cur.to = s.to; }
      if (i === segs.length - 1 || stays[i]) { legs.push(cur); cur = null; }
    });
    return legs;
  }

  var api = { parse: parse, suggestStays: suggestStays, mergeLegs: mergeLegs };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Itin = api;
})(typeof self !== 'undefined' ? self : this);
