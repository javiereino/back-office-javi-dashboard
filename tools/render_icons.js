// Renders the per diem app icons from HTML/CSS with Playwright.
// Usage: node tools/render_icons.js <emblem.png (white, transparent)> per-diem [preview.png]
const { chromium } = require('playwright'); const fs = require('fs');
const EMB = 'data:image/png;base64,' + fs.readFileSync(process.argv[2]).toString('base64'), OUT = process.argv[3];
// mode: 'any' = rounded tile with transparent corners (desktop, favicon); 'full' = full-bleed square (Android maskable, iOS)
function html(n, mode) {
  const safe = mode === 'full' ? 0.86 : 1;           // maskable: keep content inside the central 80 % circle
  const small = n <= 64, eh = n * (small ? 0.80 : 0.60) * safe, badge = small ? 0 : n * 0.205 * safe, off = n * (0.5 + 0.225 * safe) - badge / 2;
  const r = mode === 'any' ? n * 0.225 : 0;
  return `<html><body style="margin:0;background:transparent">
  <div style="position:relative;width:${n}px;height:${n}px;border-radius:${r}px;overflow:hidden;
    background:radial-gradient(circle at 50% 34%, #2a62b5 0%, #15428a 34%, #0a2351 72%, #071a3d 100%)">
    <div style="position:absolute;inset:0;border-radius:${r}px;box-shadow:inset 0 0 0 ${Math.max(1, n * 0.012)}px rgba(255,255,255,.10)"></div>
    <div style="position:absolute;left:50%;top:47%;width:${n * 0.62 * safe}px;height:${n * 0.62 * safe}px;transform:translate(-50%,-50%);border-radius:50%;
      background:radial-gradient(circle, rgba(255,255,255,.16) 0%, rgba(255,255,255,0) 68%)"></div>
    <img src="${EMB}" style="position:absolute;left:50%;top:${small ? 50 : 47}%;height:${eh}px;transform:translate(-50%,-50%);
      filter:drop-shadow(0 ${n * 0.012}px ${n * 0.02}px rgba(0,0,0,.35))">
    ${badge ? '' : '<!--'}<div style="position:absolute;left:${off}px;top:${off}px;width:${badge}px;height:${badge}px;border-radius:50%;
      background:linear-gradient(145deg,#f3d98b 0%,#d4ad55 45%,#a8802c 100%);
      box-shadow:0 0 0 ${n * 0.014 * safe}px #0a2351, 0 ${n * 0.01}px ${n * 0.02}px rgba(0,0,0,.4);
      display:flex;align-items:center;justify-content:center;
      font:800 ${badge * 0.62}px/1 'Helvetica Neue',Arial,sans-serif;color:#0a2351">€</div>${badge ? '' : '-->'}
  </div></body></html>`;
}
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  const jobs = [['icon-512.png', 512, 'any'], ['icon-192.png', 192, 'any'], ['icon-64.png', 64, 'any'],
                ['icon-maskable-512.png', 512, 'full'], ['icon-maskable-192.png', 192, 'full'], ['apple-touch-icon.png', 180, 'full']];
  for (const [f, n, mode] of jobs) {
    await p.setViewportSize({ width: n, height: n }); await p.setContent(html(n, mode)); await p.waitForTimeout(50);
    await p.screenshot({ path: `${OUT}/${f}`, omitBackground: true, clip: { x: 0, y: 0, width: n, height: n } });
  }
  if (process.argv[4]) { // preview sheet: how each platform shows it
    const img = f => 'data:image/png;base64,' + fs.readFileSync(`${OUT}/${f}`).toString('base64');
    await p.setViewportSize({ width: 900, height: 330 });
    await p.setContent(`<body style="margin:0;font:600 14px system-ui;color:#333;background:#eef1f5;display:flex;gap:46px;padding:30px 40px;align-items:flex-end">
      ${[['Escritorio', `<img src="${img('icon-512.png')}" width=128>`],
         ['Android (círculo)', `<div style="width:128px;height:128px;border-radius:50%;overflow:hidden"><img src="${img('icon-maskable-512.png')}" width=128></div>`],
         ['Android (redondeado)', `<div style="width:128px;height:128px;border-radius:30px;overflow:hidden"><img src="${img('icon-maskable-512.png')}" width=128></div>`],
         ['iPhone', `<div style="width:128px;height:128px;border-radius:29px;overflow:hidden"><img src="${img('apple-touch-icon.png')}" width=128></div>`],
         ['Pestaña', `<img src="${img('icon-64.png')}" width=32>`]]
        .map(([l, h]) => `<div style="display:flex;flex-direction:column;align-items:center;gap:12px">${h}<span>${l}</span></div>`).join('')}
      </body>`);
    await p.screenshot({ path: process.argv[4] });
  }
  await b.close();
})();
