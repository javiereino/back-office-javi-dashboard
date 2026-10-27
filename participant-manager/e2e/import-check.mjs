import { createRequire } from 'node:module'
const { chromium } = createRequire(import.meta.url)('playwright')
const base = process.env.BASE ?? 'http://localhost:4173/'
const samples = new URL('../samples/', import.meta.url).pathname
const out = new URL('./out/', import.meta.url).pathname
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
const external = []
page.on('request', (r) => { if (!r.url().startsWith(base) && !r.url().startsWith('blob:') && !r.url().startsWith('data:')) external.push(r.url()) })
page.on('pageerror', (e) => console.log('PAGEERROR', e.message))
await page.goto(base)
await page.getByRole('button', { name: /empty workspace/i }).click()
await page.getByRole('button', { name: /new project/i }).first().click()
await page.getByLabel('Project name').fill('Import test')
await page.getByRole('button', { name: 'Create' }).click()
for (const f of (process.env.FILES ?? 'participants-sample.xlsx,participants-sample.csv,participants-sample.txt,participants-sample.pdf').split(',')) {
  await page.goto(base + '#/import')
  await page.reload()
  await page.getByTestId('import-file').setInputFiles(samples + f)
  await page.waitForTimeout(2500)
  const scanned = await page.getByRole('button', { name: /run local ocr/i }).count()
  if (scanned) {
    console.log(f, 'scanned -> OCR')
    await page.getByRole('button', { name: /run local ocr/i }).click()
    await page.waitForSelector('text=/possible records detected|Save \\d+ participants/', { timeout: 240000 })
  }
  const alert = await page.getByRole('alert').count()
  if (alert) { console.log(f, 'ERROR', await page.getByRole('alert').innerText()); continue }
  if (await page.getByText(/possible records detected/).count()) {
    console.log(f, await page.getByText(/possible records detected/).innerText())
    await page.screenshot({ path: `${out}import-map-${f}.png`, fullPage: true })
    await page.getByRole('button', { name: /^Next/ }).click()
  }
  await page.waitForTimeout(500)
  console.log(f, await page.getByText(/rows selected/).innerText())
  await page.screenshot({ path: `${out}import-review-${f}.png` })
  const firstRows = await page.$$eval('[data-testid=review-table] tbody tr', (trs) => trs.slice(0, 4).map((tr) => Array.from(tr.querySelectorAll('input')).map((i) => i.value).filter(Boolean).join(' | ')))
  console.log(firstRows.join('\n'))
}
console.log('external requests:', external)
await browser.close()
