/* Per diem engine — pure functions, no DOM. Works in the browser and in Node (tests). */
(function (root) {
  'use strict';

  var COMPS = ['breakfast', 'lunch', 'dinner', 'hotel', 'incid'];
  var MEALS = ['breakfast', 'lunch', 'dinner'];

  var DEFAULT_SETTINGS = {
    method: 'icsc',                 // 'icsc' = room % from the circular column; 'fixed' = UN flat split
    shares: { breakfast: 6, lunch: 12, dinner: 12, incid: 20 },
    mealTimes: { breakfast: '08:00', lunch: '13:00', dinner: '20:00' },
    incidMode: 'day',               // 'day' = every calendar day at destination; 'night' = per night
    taxiEUR: 60,
    longStayDays: 60
  };

  // "YYYY-MM-DDTHH:mm" -> minutes since epoch, treated as wall-clock (no timezone maths:
  // every time that matters for the allowance is local time at the destination).
  function toMin(s) {
    var m = /^(\d{4})-(\d\d)-(\d\d)(?:T(\d\d):(\d\d))?/.exec(s || '');
    if (!m) return NaN;
    return Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)) / 60000;
  }
  function dayOf(min) { return Math.floor(min / 1440); }
  function dayToISO(day) { return new Date(day * 86400000).toISOString().slice(0, 10); }
  function hm(s) { var p = String(s).split(':'); return (+p[0]) * 60 + (+p[1] || 0); }
  function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }

  // Split one day's DSA into its components.
  function breakdown(rateUSD, roomPct, settings) {
    var sh = settings.shares;
    var sum = sh.breakfast + sh.lunch + sh.dinner + sh.incid;
    var room = settings.method === 'fixed' ? 100 - sum : roomPct;
    var rest = rateUSD * (100 - room) / 100;
    return {
      roomPct: room,
      hotel: rateUSD * room / 100,
      breakfast: rest * sh.breakfast / sum,
      lunch: rest * sh.lunch / sum,
      dinner: rest * sh.dinner / sum,
      incid: rest * sh.incid / sum
    };
  }

  /**
   * mission: {
   *   flights: [{no, dep, arr}]            n+1 flights for n destinations (local wall-clock times)
   *   dests:   [{area:{country,name,usd,local,local60,room}}]
   *   provided:{hotel,breakfast,lunch,dinner}   covered by a third party for the whole mission
   *   overrides:{ 'YYYY-MM-DD|comp': 'pay'|'provided'|'na' }
   *   fx: EUR per 1 USD
   * }
   */
  function compute(mission, settingsIn) {
    var settings = Object.assign({}, DEFAULT_SETTINGS, settingsIn || {});
    settings.shares = Object.assign({}, DEFAULT_SETTINGS.shares, settings.shares || {});
    settings.mealTimes = Object.assign({}, DEFAULT_SETTINGS.mealTimes, settings.mealTimes || {});
    var out = { ok: false, errors: [], warnings: [], days: [], stops: [], settings: settings };
    var flights = mission.flights || [], dests = mission.dests || [];
    var fx = +mission.fx;

    if (!dests.length || flights.length !== dests.length + 1) { out.errors.push({ code: 'incomplete' }); return out; }
    dests.forEach(function (d, i) { if (!d.area) out.errors.push({ code: 'noDest', i: i + 1 }); });
    flights.forEach(function (f, i) {
      if (isNaN(toMin(f.dep)) || isNaN(toMin(f.arr))) out.errors.push({ code: 'noTimes', i: i + 1 });
    });
    if (!(fx > 0)) out.errors.push({ code: 'noFx' });
    if (out.errors.length) return out;

    var stops = dests.map(function (d, i) {
      return { i: i, area: d.area, arr: toMin(flights[i].arr), dep: toMin(flights[i + 1].dep) };
    });
    stops.forEach(function (s) {
      if (s.dep < s.arr) out.errors.push({ code: 'order', i: s.i + 1 });
      var h = ((s.arr % 1440) + 1440) % 1440;
      if (h < 300) out.warnings.push({ code: 'earlyArrival', i: s.i + 1, date: dayToISO(dayOf(s.arr) - 1) });
    });
    for (var k = 1; k < stops.length; k++) {
      if (stops[k].arr < stops[k - 1].dep) out.errors.push({ code: 'order', i: k + 1 });
    }
    if (out.errors.length) return out;

    var firstDay = Math.min(dayOf(toMin(flights[0].dep)), dayOf(stops[0].arr));
    var lastDay = Math.max(dayOf(toMin(flights[flights.length - 1].arr)), dayOf(stops[stops.length - 1].dep));
    if (lastDay - firstDay > 400) { out.errors.push({ code: 'tooLong' }); return out; }

    function stopAt(min) { // stop where the officer is at a given instant
      for (var i = 0; i < stops.length; i++) if (stops[i].arr <= min && min <= stops[i].dep) return stops[i];
      return null;
    }
    function stopForDay(day) { // which destination's rate a day belongs to
      var end = (day + 1) * 1440, s = stopAt(end), i;
      if (s && s.dep > end - 1) return s;
      for (i = stops.length - 1; i >= 0; i--) if (dayOf(stops[i].arr) <= day && dayOf(stops[i].dep) >= day) return stops[i];
      for (i = 0; i < stops.length; i++) if (dayOf(stops[i].arr) > day) return stops[i];
      return stops[stops.length - 1];
    }
    function rateFor(stop, day) {
      var a = stop.area, n = day - dayOf(stop.arr), long = n >= settings.longStayDays && a.local > 0 && a.local60 < a.local;
      return { usd: long ? a.usd * a.local60 / a.local : a.usd, long: long };
    }

    var prov = mission.provided || {}, ov = mission.overrides || {};
    var tot = { usd: 0, providedUSD: 0, byComp: {} };
    COMPS.forEach(function (c) { tot.byComp[c] = 0; });

    for (var day = firstDay; day <= lastDay; day++) {
      var iso = dayToISO(day), home = stopForDay(day), row = { date: iso, comps: {}, usd: 0, notes: [] };
      var atDest = stops.some(function (s) { return dayOf(s.arr) <= day && dayOf(s.dep) >= day; });
      var nightStop = (function () {
        var end = (day + 1) * 1440;
        for (var i = 0; i < stops.length; i++) if (stops[i].arr < end && stops[i].dep >= end) return stops[i];
        return null;
      })();

      COMPS.forEach(function (c) {
        var s = null;
        if (c === 'hotel') s = nightStop;
        else if (c === 'incid') s = settings.incidMode === 'night' ? nightStop : (atDest ? home : null);
        else s = stopAt(day * 1440 + hm(settings.mealTimes[c]));
        var auto = s ? 'pay' : 'na';
        var state = auto;
        if (auto === 'pay' && prov[c]) state = 'provided';
        var o = ov[iso + '|' + c];
        if (o === 'pay' || o === 'provided' || o === 'na') state = o;
        var st = s || home, r = rateFor(st, day), b = breakdown(r.usd, st.area.room, settings);
        row.comps[c] = { state: state, auto: auto, overridden: !!o && o !== (auto === 'pay' && prov[c] ? 'provided' : auto), usd: b[c], stop: st.i };
        if (state === 'pay') { row.usd += b[c]; tot.byComp[c] += b[c]; }
        if (state === 'provided') tot.providedUSD += b[c];
      });

      var hr = rateFor(home, day), hb = breakdown(hr.usd, home.area.room, settings);
      row.stop = home.i; row.area = home.area; row.rateUSD = hr.usd; row.long = hr.long; row.roomPct = hb.roomPct;
      row.atDest = atDest;
      stops.forEach(function (s) {
        if (dayOf(s.arr) === day) row.notes.push({ code: 'arr', stop: s.i, time: flights[s.i].arr.slice(11, 16) });
        if (dayOf(s.dep) === day) row.notes.push({ code: 'dep', stop: s.i, time: flights[s.i + 1].dep.slice(11, 16) });
      });
      if (!atDest) row.notes.push({ code: 'travel' });
      if (hr.long) row.notes.push({ code: 'long' });
      row.eur = row.usd * fx;
      tot.usd += row.usd;
      out.days.push(row);
    }

    out.stops = stops.map(function (s) {
      var nights = Math.max(0, dayOf(s.dep) - dayOf(s.arr));
      return { i: s.i, area: s.area, arr: flights[s.i].arr, dep: flights[s.i + 1].dep, nights: nights,
               breakdown: breakdown(s.area.usd, s.area.room, settings) };
    });
    var taxi = +settings.taxiEUR || 0;
    out.totals = {
      dsaUSD: round2(tot.usd), dsaEUR: round2(tot.usd * fx),
      providedUSD: round2(tot.providedUSD), providedEUR: round2(tot.providedUSD * fx),
      taxiEUR: taxi, taxiUSD: round2(taxi / fx),
      totalEUR: round2(tot.usd * fx + taxi), totalUSD: round2(tot.usd + taxi / fx),
      byComp: tot.byComp, fx: fx,
      nights: out.days.filter(function (d) { return d.comps.hotel.auto === 'pay'; }).length,
      days: out.days.length
    };
    out.ok = true;
    return out;
  }

  // EUR per USD implied by the euro-denominated rows of the circular (≈ UN operational rate of the month).
  function impliedEurRate(data) {
    var usd = 0, eur = 0;
    data.countries.forEach(function (c) {
      if (c.currency === 'Euro') c.areas.forEach(function (a) { usd += a[1]; eur += a[2]; });
    });
    return usd ? Math.round(eur / usd * 10000) / 10000 : 0.9;
  }

  var api = { compute: compute, breakdown: breakdown, impliedEurRate: impliedEurRate, DEFAULT_SETTINGS: DEFAULT_SETTINGS,
              COMPS: COMPS, MEALS: MEALS, toMin: toMin, round2: round2 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PerDiem = api;
})(typeof self !== 'undefined' ? self : this);
