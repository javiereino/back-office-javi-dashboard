// node tools/test_itin.js
const assert = require('assert');
const I = require('../per-diem/itin.js');
const eq = (segs, exp, name) => assert.deepStrictEqual(segs.map(s => [s.no, s.from, s.to, s.dep, s.arr]), exp, name);

// A. Agency itinerary, English, date header before each flight, connection + overnight
const A = `ITINERARY - Booking ref: X7KQ2P   Traveller: DOE/JOHN MR
Friday 20 November 2026
Flight LH 1077  Lufthansa   Economy
Departure 18:30 Lyon St Exupery (LYS)   Arrival 20:00 Frankfurt (FRA)
Friday 20 November 2026
Flight LH 590 Lufthansa
Departure 22:05 Frankfurt (FRA)  Arrival 06:35 +1 Nairobi Jomo Kenyatta (NBO)
Wednesday 25 November 2026
Flight LH 591 Lufthansa
Departure 23:10 Nairobi (NBO)   Arrival 05:40 Frankfurt (FRA) Thursday 26 November 2026
Thursday 26 November 2026
Flight LH 1074
Departure 08:15 Frankfurt (FRA)  Arrival 09:30 Lyon (LYS)
Total fare EUR 1,245.50`;
let s = I.parse(A, 2026);
eq(s, [['LH1077', 'LYS', 'FRA', '2026-11-20T18:30', '2026-11-20T20:00'], ['LH590', 'FRA', 'NBO', '2026-11-20T22:05', '2026-11-21T06:35'],
       ['LH591', 'NBO', 'FRA', '2026-11-25T23:10', '2026-11-26T05:40'], ['LH1074', 'FRA', 'LYS', '2026-11-26T08:15', '2026-11-26T09:30']], 'A');
const stays = I.suggestStays(s); assert.deepStrictEqual(stays, [false, true, false]);
const legs = I.mergeLegs(s, stays);
assert.deepStrictEqual(legs.map(l => [l.no, l.dep, l.arr]), [['LH1077 + LH590', '2026-11-20T18:30', '2026-11-21T06:35'], ['LH591 + LH1074', '2026-11-25T23:10', '2026-11-26T09:30']]);

// B. Airline e-ticket table, compact dates, one line per flight
const B = `ELECTRONIC TICKET RECEIPT
FLIGHT  FROM            TO              DATE     DEP    ARR    CLASS
AF1345  LYON LYS        PARIS CDG       03DEC26  07:10  08:20  Y
AF0256  PARIS CDG       SINGAPORE SIN   03DEC26  10:45  06:20  Y
AF0257  SINGAPORE SIN   PARIS CDG       10DEC26  23:55  06:30  Y
AF1344  PARIS CDG       LYON LYS        11DEC26  09:05  10:10  Y`;
s = I.parse(B, 2026);
eq(s, [['AF1345', 'LYS', 'CDG', '2026-12-03T07:10', '2026-12-03T08:20'], ['AF256', 'CDG', 'SIN', '2026-12-03T10:45', '2026-12-04T06:20'],
       ['AF257', 'SIN', 'CDG', '2026-12-10T23:55', '2026-12-11T06:30'], ['AF1344', 'CDG', 'LYS', '2026-12-11T09:05', '2026-12-11T10:10']], 'B');

// C. Spanish, numeric dates with dep and arr dates, 12h noise ignored
const C = `Su viaje - Localizador ABC123
Vuelo IB 3401 - Salida: 14/01/2027 07:40 Lyon (LYS) - Llegada: 14/01/2027 09:35 Madrid (MAD)
Vuelo IB 6845 - Salida: 14/01/2027 12:25 Madrid (MAD) - Llegada: 14/01/2027 20:10 Buenos Aires (EZE)
Vuelo IB 6844 - Salida: 20/01/2027 22:15 Buenos Aires (EZE) - Llegada: 21/01/2027 14:30 Madrid (MAD)
Vuelo IB 3402 - Salida: 21/01/2027 16:00 Madrid (MAD) - Llegada: 21/01/2027 17:50 Lyon (LYS)
Importe total 2.340,00 EUR`;
s = I.parse(C, 2026);
eq(s, [['IB3401', 'LYS', 'MAD', '2027-01-14T07:40', '2027-01-14T09:35'], ['IB6845', 'MAD', 'EZE', '2027-01-14T12:25', '2027-01-14T20:10'],
       ['IB6844', 'EZE', 'MAD', '2027-01-20T22:15', '2027-01-21T14:30'], ['IB3402', 'MAD', 'LYS', '2027-01-21T16:00', '2027-01-21T17:50']], 'C');

// D. French, "h" times, multi-city (two stays)
const D = `Vol AF 7641 le 02 mars 2027 Lyon (LYS) 06h30 - Paris (CDG) 07h40
Vol AF 1148 le 02 mars 2027 Paris (CDG) 09h15 - Varsovie (WAW) 11h35
Vol LO 335 le 05 mars 2027 Varsovie (WAW) 13h00 - Vienne (VIE) 14h20
Vol OS 421 le 08 mars 2027 Vienne (VIE) 17h05 - Lyon (LYS) 18h45`;
s = I.parse(D, 2026);
assert.strictEqual(s.length, 4); assert.strictEqual(s[2].dep, '2027-03-05T13:00');
assert.deepStrictEqual(I.suggestStays(s), [false, true, true]);
assert.strictEqual(I.mergeLegs(s, I.suggestStays(s)).length, 3);
assert.deepStrictEqual(I.parse('nothing useful here 12:30', 2026), []);

// E. Agency e-ticket: letter-spaced day headers, month-first dates without year, aircraft type "A321Neo",
//    and a hotel name ("Marriott") that must not be read as a month. Invented data.
const E = `Y O U R E - T I C K E T
Date: 02 Feb 27
Feb 15 - Feb 19, 2027 | TRIP LOCATOR: ABC123
M O N , F E B 1 5 , 2 0 2 7
EXAMPLE AIRLINES AF 1501 CONFIRMED
E-Ticket: 0000000000000 | Booking Reference: XYZ999
DEPARTURE ARRIVAL
Mon, Feb 15 | 21:40 Tue, Feb 16 | 07:05
Lyon Saint Exupery (LYS) Dubai International (DXB)
Class: Economy (S) Aircraft: Airbus A321Neo Operated by: Example
Flight duration: 6h 25m (non-stop)
Hotel: Marriott 5 nights
F R I, F E B 1 9 , 2 0 2 7
EXAMPLE AIRLINES AF 1502 CONFIRMED
DEPARTURE ARRIVAL
Fri, Feb 19 | 09:15 Fri, Feb 19 | 13:50
Dubai International (DXB) Lyon Saint Exupery (LYS)
Aircraft: Airbus A321Neo`;
s = I.parse(E, 2026);
eq(s, [['AF1501', 'LYS', 'DXB', '2027-02-15T21:40', '2027-02-16T07:05'], ['AF1502', 'DXB', 'LYS', '2027-02-19T09:15', '2027-02-19T13:50']], 'E');

// F. Yearless dates crossing new year take the following year
s = I.parse(`M O N , D E C 2 8 , 2 0 2 6
Flight IB 3401  Mon, Dec 28 | 07:40 Lyon (LYS) Mon, Dec 28 | 09:35 Madrid (MAD)
Flight IB 3402  Sat, Jan 2 | 16:00 Madrid (MAD) Sat, Jan 2 | 17:50 Lyon (LYS)`, 2026);
assert.deepStrictEqual(s.map(x => x.dep), ['2026-12-28T07:40', '2027-01-02T16:00'], 'F');
console.log('itinerary parser tests passed');
