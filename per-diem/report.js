/* PDF report (jsPDF + autoTable) and Excel export (SheetJS). */
(function () {
  'use strict';
  var NAVY = [10, 35, 81], BLUE = [27, 110, 194], GOLD = [200, 162, 74], MUTE = [93, 107, 133], LINE = [223, 229, 238], SKY = [232, 241, 251];
  var PAY = [15, 122, 77], PROV = [164, 92, 0], NA = [150, 160, 178];
  var COMPS = ['breakfast', 'lunch', 'dinner', 'hotel', 'incid'];

  // The built-in PDF fonts have no € glyph and no narrow spaces: write amounts as "1.234,56 EUR".
  function clean(s) { return String(s).replace(/[   ]/g, ' ').replace(/€/g, 'EUR').replace(/−/g, '-').replace(/[→]/g, '>').replace(/[—–]/g, '-').replace(/≈/g, '~'); }

  function pdf(c) {
    var t = c.t, r = c.result, m = c.mission, T = r.totals, fx = m.fx;
    var doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
    var W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 14, y;
    var eur = function (n) { return clean(c.num(n)) + ' EUR'; }, usd = function (n) { return clean(c.num(n)) + ' USD'; };
    var txt = function (s, x, yy, o) { doc.text(clean(s), x, yy, o); };

    // header band
    doc.setFillColor.apply(doc, NAVY); doc.rect(0, 0, W, 30, 'F');
    doc.setFillColor.apply(doc, GOLD); doc.rect(0, 30, W, 1.2, 'F');
    doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(17); doc.setCharSpace(1.2); txt('INTERPOL', M, 13); doc.setCharSpace(0);
    doc.setFontSize(12); doc.setFont('helvetica', 'normal'); txt(t('rTitle'), M, 21);
    doc.setFontSize(8.5); txt(t('rGenerated') + ' ' + c.fmtDate(new Date().toISOString(), true), W - M, 13, { align: 'right' });
    if (m.ref) { doc.setFont('helvetica', 'bold'); doc.setFontSize(10); txt(t('rRef') + ': ' + m.ref, W - M, 21, { align: 'right' }); }

    // mission box + total box
    y = 38;
    var info = [[t('rOfficer'), m.officer.name], [t('rUnit'), m.officer.unit], [t('fEmail'), m.officer.email], [t('rPurpose'), m.purpose], [t('rOrigin'), m.origin]]
      .filter(function (x) { return x[1]; });
    var boxW = W - 2 * M - 66, tx = M + boxW + 4;
    doc.setFontSize(9);
    var yy = y + 6;
    info.forEach(function (x) {
      doc.setTextColor.apply(doc, MUTE); doc.setFont('helvetica', 'normal'); txt(x[0], M, yy);
      doc.setTextColor.apply(doc, NAVY); doc.setFont('helvetica', 'bold');
      var lines = doc.splitTextToSize(clean(x[1]), boxW - 30); doc.text(lines, M + 28, yy); yy += 5 * lines.length;
    });
    doc.setFillColor.apply(doc, NAVY); doc.roundedRect(tx, y, 62, 30, 2.5, 2.5, 'F');
    doc.setTextColor(255); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); txt(t('rTotal'), tx + 5, y + 7);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(17); txt(eur(T.totalEUR), tx + 5, y + 17);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); txt('~ ' + usd(T.totalUSD), tx + 5, y + 24);
    y = Math.max(yy, y + 30) + 6;

    function section(title) {
      if (y > H - 40) { doc.addPage(); y = 18; }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor.apply(doc, NAVY); txt(title, M, y);
      doc.setDrawColor.apply(doc, GOLD); doc.setLineWidth(0.6); doc.line(M, y + 1.6, M + 14, y + 1.6); y += 5;
    }
    var base = { theme: 'plain', margin: { left: M, right: M, bottom: 18 },
      styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 1.8, textColor: [20, 33, 61], lineColor: LINE, lineWidth: { bottom: 0.2 } },
      headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold', fontSize: 8, lineWidth: 0 } };
    function table(o) { doc.autoTable(Object.assign({}, base, o, { startY: y })); y = doc.lastAutoTable.finalY + 8; }

    // itinerary
    section(t('rItinerary'));
    table({
      head: [[t('flight'), t('flightNo'), t('dep'), t('arr')]],
      body: m.flights.map(function (f, i) {
        return [clean(c.placeName(i - 1) + (f.from ? ' (' + f.from + ')' : '') + ' > ' + c.placeName(i) + (f.to ? ' (' + f.to + ')' : '')), f.no || '-', clean(c.fmtDT(f.dep)), clean(c.fmtDT(f.arr))];
      })
    });

    // rates
    section(t('rRates') + ' (EUR ' + t('perDay') + ')');
    table({
      head: [[t('destination'), t('rRate'), t('rRoomPct')].concat(COMPS.map(function (k) { return t(k); }))],
      body: r.stops.map(function (s) {
        var b = s.breakdown;
        return [clean(c.areaName(s.area) + ', ' + s.area.country + '\n' + s.nights + ' ' + t('nights')), usd(s.area.usd) + '\n' + eur(s.area.usd * fx), b.roomPct + ' %']
          .concat(COMPS.map(function (k) { return clean(c.num(b[k] * fx)); }));
      }),
      columnStyles: { 0: { cellWidth: 46 }, 1: { halign: 'right', cellWidth: 30 }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' } },
      headStyles: Object.assign({}, base.headStyles, { halign: 'right' }),
      didParseCell: function (d) { if (d.section === 'head' && d.column.index === 0) d.cell.styles.halign = 'left'; }
    });

    // daily detail
    section(t('rDaily'));
    table({
      head: [[t('date'), t('place')].concat(COMPS.map(function (k) { return t(k); }), ['USD', 'EUR'])],
      body: r.days.map(function (d) {
        var notes = d.notes.map(c.noteText).join(' · ');
        return [clean(c.fmtDate(d.date)), clean(d.atDest ? c.areaName(d.area) + (notes ? '\n' + notes : '') : notes)]
          .concat(COMPS.map(function (k) { var x = d.comps[k]; return x.state === 'na' ? '-' : x.state === 'provided' ? clean(c.num(x.usd * fx)) + '\n(' + t('rCovered') + ')' : clean(c.num(x.usd * fx)); }),
            [clean(c.num(d.usd)), clean(c.num(d.eur))]);
      }),
      foot: [[{ content: t('dsaSubtotal'), colSpan: 2 }].concat(COMPS.map(function (k) { return clean(c.num(T.byComp[k] * fx)); }), [clean(c.num(T.dsaUSD)), clean(c.num(T.dsaEUR))])],
      footStyles: { fillColor: SKY, textColor: NAVY, fontStyle: 'bold', halign: 'right', lineWidth: 0 },
      showFoot: 'lastPage',
      styles: Object.assign({}, base.styles, { fontSize: 8, halign: 'right' }),
      headStyles: Object.assign({}, base.headStyles, { halign: 'right', fontSize: 7.5 }),
      columnStyles: { 0: { halign: 'left', cellWidth: 22, fontStyle: 'bold' }, 1: { halign: 'left', cellWidth: 44 }, 7: { textColor: MUTE }, 8: { fontStyle: 'bold' } },
      didParseCell: function (d) {
        if (d.section === 'head' && d.column.index < 2) d.cell.styles.halign = 'left';
        if (d.section === 'foot' && d.column.index === 0) d.cell.styles.halign = 'left';
        if (d.section !== 'body') return;
        if (d.column.index === 1) d.cell.styles.fontSize = 7.5;
        var k = COMPS[d.column.index - 2]; if (!k) return;
        var st = r.days[d.row.index].comps[k].state;
        d.cell.styles.textColor = st === 'pay' ? PAY : st === 'provided' ? PROV : NA;
        if (st === 'provided') d.cell.styles.fontSize = 7;
      }
    });

    // summary
    section(t('rSummary'));
    var rows = [[t('dsaSubtotal') + ' (' + T.nights + ' ' + t('nights') + ', ' + T.days + ' ' + t('days') + ')', usd(T.dsaUSD), eur(T.dsaEUR)]];
    if (T.providedUSD > 0) rows.push([t('deducted'), '(' + usd(T.providedUSD) + ')', '(' + eur(T.providedEUR) + ')']);
    rows.push([t('taxi'), usd(T.taxiUSD), eur(T.taxiEUR)]);
    rows.push([t('rTotal'), usd(T.totalUSD), eur(T.totalEUR)]);
    table({
      body: rows, tableWidth: 130, margin: { left: W - M - 130, right: M, bottom: 18 },
      columnStyles: { 1: { halign: 'right', textColor: MUTE }, 2: { halign: 'right', fontStyle: 'bold' } },
      didParseCell: function (d) {
        if (T.providedUSD > 0 && d.row.index === 1) d.cell.styles.textColor = MUTE;
        if (d.row.index === rows.length - 1) { d.cell.styles.fillColor = NAVY; d.cell.styles.textColor = 255; d.cell.styles.fontStyle = 'bold'; d.cell.styles.fontSize = 10; }
      }
    });

    // method
    section(t('rMethod'));
    var s = c.settings, sh = s.shares, sum = sh.breakfast + sh.lunch + sh.dinner + sh.incid;
    var split = s.method === 'fixed' ? t('rSplitFixed', { b: sh.breakfast, l: sh.lunch, d: sh.dinner, i: sh.incid, r: 100 - sum }) : t('rSplitIcsc', { b: sh.breakfast, l: sh.lunch, d: sh.dinner, i: sh.incid });
    var method = t('rMethodText', { ref: c.data.ref, d: c.fmtDate(c.data.date, true), split: split, tb: s.mealTimes.breakfast, tl: s.mealTimes.lunch, td: s.mealTimes.dinner,
      inc: t(s.incidMode === 'night' ? 'rIncNight' : 'rIncDay'), fx: fx, taxi: eur(s.taxiEUR) });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor.apply(doc, MUTE);
    var lines = doc.splitTextToSize(clean(method), W - 2 * M);
    if (y + lines.length * 4 > H - 18) { doc.addPage(); y = 18; }
    doc.text(lines, M, y);

    // footers
    var n = doc.getNumberOfPages();
    for (var p = 1; p <= n; p++) {
      doc.setPage(p); doc.setDrawColor.apply(doc, LINE); doc.setLineWidth(0.2); doc.line(M, H - 12, W - M, H - 12);
      doc.setFontSize(7.5); doc.setTextColor.apply(doc, MUTE); doc.setFont('helvetica', 'normal');
      txt(t('rDisclaimer') + '  ' + c.data.ref, M, H - 7.5); txt(t('rPage') + ' ' + p + ' / ' + n, W - M, H - 7.5, { align: 'right' });
    }
    void BLUE;
    return doc;
  }

  function xlsx(c, filename) {
    var X = window.XLSX, t = c.t, r = c.result, m = c.mission, T = r.totals, fx = m.fx, r2 = function (n) { return Math.round(n * 100) / 100; };
    var sum = [[t('rTitle')], [], [t('rOfficer'), m.officer.name], [t('rUnit'), m.officer.unit], [t('fEmail'), m.officer.email], [t('rRef'), m.ref], [t('rPurpose'), m.purpose], [t('rOrigin'), m.origin], [],
      ['', 'USD', 'EUR'], [t('dsaSubtotal'), T.dsaUSD, T.dsaEUR], [t('deducted'), T.providedUSD, T.providedEUR], [t('taxi'), T.taxiUSD, T.taxiEUR], [t('rTotal'), T.totalUSD, T.totalEUR], [],
      [t('fxLabel'), fx], ['DSA', c.data.ref + ' (' + c.data.date + ')'], [], [t('flight'), t('flightNo'), t('dep'), t('arr')]];
    m.flights.forEach(function (f, i) { sum.push([c.placeName(i - 1) + ' → ' + c.placeName(i), f.no, f.dep.replace('T', ' '), f.arr.replace('T', ' ')]); });
    var days = [[t('date'), t('place'), t('rRate') + ' USD', t('rRoomPct')].concat(COMPS.map(function (k) { return t(k) + ' EUR'; }), [t('dayTotal') + ' USD', t('dayTotal') + ' EUR', t('notes')])];
    r.days.forEach(function (d) {
      days.push([d.date, c.areaName(d.area) + ', ' + d.area.country, r2(d.rateUSD), d.roomPct].concat(
        COMPS.map(function (k) { var x = d.comps[k]; return x.state === 'pay' ? r2(x.usd * fx) : x.state === 'provided' ? t('rCovered') : ''; }),
        [r2(d.usd), r2(d.eur), d.notes.map(c.noteText).join(' · ')]));
    });
    days.push(['', '', '', ''].concat(COMPS.map(function (k) { return r2(T.byComp[k] * fx); }), [T.dsaUSD, T.dsaEUR, '']));
    var wb = X.utils.book_new(), s1 = X.utils.aoa_to_sheet(sum), s2 = X.utils.aoa_to_sheet(days);
    s1['!cols'] = [{ wch: 38 }, { wch: 22 }, { wch: 18 }, { wch: 18 }];
    s2['!cols'] = [{ wch: 12 }, { wch: 30 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 40 }];
    X.utils.book_append_sheet(wb, s1, t('rSummary').slice(0, 30)); X.utils.book_append_sheet(wb, s2, t('rDaily').slice(0, 30).replace(/[\\/?*[\]:]/g, ' '));
    X.writeFile(wb, filename);
  }

  window.Report = { pdf: pdf, xlsx: xlsx };
})();
