// Renders the PWA PNG icons from public/favicon.svg using the preinstalled Playwright Chromium.
import { createRequire } from 'node:module'
const { chromium } = createRequire(import.meta.url)('playwright')
import fs from 'node:fs'
const svg = fs.readFileSync(new URL('../public/favicon.svg', import.meta.url), 'utf8')
const browser = await chromium.launch()
const page = await browser.newPage()
for (const size of [192, 512]) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(`<html><body style="margin:0;background:#081426">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`)
  await page.screenshot({ path: new URL(`../public/icons/icon-${size}.png`, import.meta.url).pathname })
}
await browser.close()
