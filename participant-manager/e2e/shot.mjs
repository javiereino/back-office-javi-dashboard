// Dev helper: screenshots of the main pages (desktop + mobile) against `vite preview`.
import { createRequire } from 'node:module'
const { chromium } = createRequire(import.meta.url)('playwright')
const base = process.env.BASE ?? 'http://localhost:4173/'
const out = new URL('./out/', import.meta.url).pathname
const browser = await chromium.launch()
const errors = []
for (const [label, viewport] of [['desk', { width: 1440, height: 900 }], ['mob', { width: 390, height: 844 }]]) {
  const ctx = await browser.newContext({ viewport })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(`${label}: ${e.message}`))
  page.on('console', (m) => m.type() === 'error' && errors.push(`${label} console: ${m.text()}`))
  await page.goto(base)
  await page.getByRole('button', { name: /demonstration|demostración/i }).click()
  await page.waitForTimeout(800)
  for (const r of (process.env.PAGES ?? 'dashboard,participants,projects,settings').split(',')) {
    await page.goto(base + '#/' + r)
    await page.waitForTimeout(700)
    await page.screenshot({ path: `${out}${label}-${r}.png`, fullPage: label === 'mob' ? false : true })
  }
  if (process.env.THEME_LIGHT) {
    await page.getByRole('button', { name: /light mode|modo claro/i }).click()
    await page.goto(base + '#/participants')
    await page.waitForTimeout(500)
    await page.screenshot({ path: `${out}${label}-participants-light.png` })
  }
  await ctx.close()
}
await browser.close()
console.log(errors.length ? errors.join('\n') : 'no errors')
