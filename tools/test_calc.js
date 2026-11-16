// node tools/test_calc.js
const assert = require('assert');
const P = require('../per-diem/calc.js');
global.window = {}; require('../per-diem/dsa-data.js'); const D = window.DSA_DATA;
const area = (c, n) => { const C = D.countries.find(x => x.country === c); const a = C.areas.find(x => x[0] === n);
  return { country: c, name: a[0], usd: a[1], local: a[2], local60: a[3], room: a[4] }; };
const near = (a, b, m) => assert.ok(Math.abs(a - b) < 0.011, `${m}: ${a} vs ${b}`);
const paris = area('France', 'Paris'); // 419 USD, room 62 %

// 1. Breakdown: room = column %, the rest split 6:12:12:20
let b = P.breakdown(419, 62, P.DEFAULT_SETTINGS);
near(b.hotel, 259.78, 'hotel'); near(b.breakfast, 419 * .38 * 6 / 50, 'bf'); near(b.incid, 419 * .38 * 20 / 50, 'inc');
near(b.hotel + b.breakfast + b.lunch + b.dinner + b.incid, 419, 'sums to DSA');
b = P.breakdown(400, 62, { method: 'fixed', shares: P.DEFAULT_SETTINGS.shares });
near(b.hotel, 200, 'fixed hotel'); near(b.breakfast, 24, 'fixed bf'); near(b.incid, 80, 'fixed inc');

// 2. Overnight flight: leave in the evening, land 10:00 next morning, 2 nights, fly back 15:00
const m = { fx: 0.9, dests: [{ area: paris }], provided: {}, overrides: {},
  flights: [{ dep: '2026-11-20T18:30', arr: '2026-11-21T10:00' }, { dep: '2026-11-23T15:00', arr: '2026-11-23T22:00' }] };
let r = P.compute(m); assert.ok(r.ok);
const st = d => P.COMPS.map(c => r.days[d].comps[c].state[0]).join('');
assert.strictEqual(r.days.length, 4);
assert.strictEqual(st(0), 'nnnnn', 'day in flight: nothing');
assert.strictEqual(st(1), 'npppp', 'arrive 10:00: no breakfast, lunch+dinner+night');
assert.strictEqual(st(2), 'ppppp', 'full day');
assert.strictEqual(st(3), 'ppnnp', 'leave 15:00: breakfast+lunch, no dinner/night');
assert.strictEqual(r.totals.nights, 2);
const bp = P.breakdown(419, 62, P.DEFAULT_SETTINGS);
const exp = 2 * bp.hotel + 2 * bp.breakfast + 3 * bp.lunch + 2 * bp.dinner + 3 * bp.incid;
near(r.totals.dsaUSD, exp, 'total usd'); near(r.totals.totalEUR, exp * 0.9 + 60, 'total eur incl. taxi');

// 3. Hotel paid -> the room column is removed; meal provided; per-day override
r = P.compute(Object.assign({}, m, { provided: { hotel: true } }));
near(r.totals.dsaUSD, exp - 2 * bp.hotel, 'hotel provided'); near(r.totals.providedUSD, 2 * bp.hotel, 'provided');
r = P.compute(Object.assign({}, m, { overrides: { '2026-11-22|lunch': 'provided', '2026-11-21|breakfast': 'pay' } }));
near(r.totals.dsaUSD, exp - bp.lunch + bp.breakfast, 'overrides');

// 4. Multi-city: Paris 2 nights then Madrid 1 night, different rates
const mad = area('Spain', 'Madrid');
r = P.compute({ fx: 0.9, provided: {}, overrides: {}, dests: [{ area: paris }, { area: mad }],
  flights: [{ dep: '2026-11-20T07:00', arr: '2026-11-20T08:00' }, { dep: '2026-11-22T10:00', arr: '2026-11-22T12:00' },
            { dep: '2026-11-23T19:00', arr: '2026-11-23T21:00' }] });
assert.ok(r.ok); assert.strictEqual(r.days.length, 4);
assert.strictEqual(r.days[1].comps.hotel.stop, 0); assert.strictEqual(r.days[2].comps.hotel.stop, 1);
assert.strictEqual(r.days[2].comps.breakfast.stop, 0, 'breakfast still in Paris');
assert.strictEqual(r.days[2].comps.lunch.stop, 1, 'lunch in Madrid'); assert.strictEqual(r.days[2].rateUSD, mad.usd);
assert.strictEqual(r.totals.nights, 3);

// 5. After 60 days the reduced rate applies (Paris 376 -> 282 EUR local)
r = P.compute({ fx: 0.9, provided: {}, overrides: {}, dests: [{ area: paris }],
  flights: [{ dep: '2026-01-01T06:00', arr: '2026-01-01T07:00' }, { dep: '2026-03-10T20:30', arr: '2026-03-10T22:00' }] });
assert.strictEqual(r.days[59].long, false); assert.strictEqual(r.days[60].long, true);
near(r.days[60].rateUSD, 419 * 282 / 376, 'long-stay rate');

// 6. Validation
assert.ok(!P.compute({ fx: 0.9, dests: [{ area: paris }], flights: [{ dep: '2026-11-20T18:30', arr: '2026-11-21T10:00' }, { dep: '2026-11-20T15:00', arr: '2026-11-20T22:00' }] }).ok);
assert.ok(!P.compute({ fx: 0.9, dests: [{}], flights: [{}, {}] }).ok);
r = P.compute(Object.assign({}, m, { flights: [{ dep: '2026-11-20T18:30', arr: '2026-11-21T01:30' }, m.flights[1]] }));
assert.ok(r.warnings.some(w => w.code === 'earlyArrival'));
r = P.compute(m, { incidMode: 'night' }); assert.strictEqual(r.days.filter(d => d.comps.incid.state === 'pay').length, 2);

const fx = P.impliedEurRate(D); assert.ok(fx > 0.8 && fx < 1, 'fx ' + fx);
console.log('all tests passed · implied EUR/USD', fx, '· Paris day', JSON.stringify(bp, (k, v) => typeof v === 'number' ? +v.toFixed(2) : v));
