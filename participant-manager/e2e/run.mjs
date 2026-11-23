// Acceptance test (section 15 of the brief) in a real Chromium against the production build.
// Usage: npm run build && npm run e2e   (Playwright must be installed globally or locally)
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import * as XLSX from '@e965/xlsx'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const root = new URL('..', import.meta.url).pathname
const out = path.join(root, 'e2e/out')
fs.mkdirSync(out, { recursive: true })
const PORT = 4179
const BASE = `http://localhost:${PORT}/`

const results = []
const check = (n, name, ok, detail = '') => {
  results.push({ n, name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}. ${name}${detail ? ' — ' + detail : ''}`)
}

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'ignore' })
await new Promise((r) => setTimeout(r, 2500))

const browser = await chromium.launch()
const external = []
const consoleErrors = []
const watch = (page) => {
  page.on('request', (r) => {
    const u = r.url()
    if (!u.startsWith(BASE) && !u.startsWith('blob:') && !u.startsWith('data:')) external.push(u)
  })
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()))
  page.on('pageerror', (e) => consoleErrors.push(e.message))
}

try {
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  watch(page)
  await page.goto(BASE)
  await page.getByRole('button', { name: /empty workspace/i }).click()

  // 1. two projects
  for (const name of ['Acceptance Meeting', 'Second Project']) {
    await page.goto(BASE + '#/projects')
    await page.getByRole('button', { name: /new project/i }).first().click()
    await page.getByLabel('Project name').fill(name)
    await page.getByLabel('Location').fill('Test City')
    await page.getByRole('button', { name: 'Create' }).click()
    await page.waitForTimeout(300)
  }
  const cards = await page.locator('article h2').allInnerTexts()
  check(1, 'Create two separate projects', cards.includes('Acceptance Meeting') && cards.includes('Second Project'), cards.join(', '))
  await page.locator('#active-project').selectOption({ label: 'Acceptance Meeting' })

  // 2-3. import Excel with 34 fictional participants
  await page.goto(BASE + '#/import')
  await page.locator('#import-project').selectOption({ label: 'Acceptance Meeting' })
  await page.getByTestId('import-file').setInputFiles(path.join(root, 'samples/participants-sample.xlsx'))
  await page.getByText(/possible records detected/).waitFor()
  const detected = await page.getByText(/possible records detected/).innerText()
  check(2, 'Import a sample Excel file with at least 30 participants', /3[0-9] possible/.test(detected), detected)
  const mapped = {}
  for (const i of [1, 2, 3, 6, 7]) mapped[i] = await page.getByTestId(`map-${i}`).inputValue()
  check(3, 'Detect country, name, email and phone columns', mapped[1] === 'country' && mapped[2] === 'firstName' && mapped[3] === 'lastName' && mapped[6] === 'email' && mapped[7] === 'phone', JSON.stringify(mapped))
  await page.getByRole('button', { name: /^Next/ }).click()

  // 4. correct a missing field before saving (Markus Brandt has no email)
  const emailInput = page.getByLabel('Email 10', { exact: true })
  const wasFlagged = (await emailInput.getAttribute('class')).includes('border-warning')
  await emailInput.fill('m.brandt@fco-de.example')
  await emailInput.blur()
  const nowFlagged = (await emailInput.getAttribute('class')).includes('border-warning')
  // include the duplicate row on purpose so the directory can show duplicate detection
  const dupBadge = await page.getByText(/Repeated in this file/).count()
  await page.getByLabel('Include 36', { exact: true }).check()
  await page.getByRole('button', { name: /Save \d+ participants/ }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: /Save \d+ participants/ }).click()
  await page.getByText(/participants imported/).first().waitFor()
  check(4, 'Correct missing fields before saving', wasFlagged && !nowFlagged, `flagged before=${wasFlagged}, after=${nowFlagged}`)

  // 5. grouping by country, alphabetical
  await page.goto(BASE + '#/participants')
  await page.waitForTimeout(800)
  const groups = await page.locator('table tbody tr.bg-group button span.uppercase').allInnerTexts()
  const named = groups.filter((g) => g !== 'NO COUNTRY')
  const sorted = [...named].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }))
  const spainCount = await page.locator('tr.bg-group', { hasText: 'Spain' }).locator('span.rounded-full').innerText()
  check(5, 'Group participants alphabetically by country', JSON.stringify(named) === JSON.stringify(sorted) && spainCount === '4', `${groups.length} groups, Spain=${spainCount} (España/Spain/ES merged), last="${groups.at(-1)}"`)

  // 6. duplicates
  await page.getByRole('button', { name: /Duplicates/ }).click()
  const dupGroups = await page.getByRole('dialog').getByRole('button', { name: 'Merge' }).count()
  const reason = await page.getByRole('dialog').getByText(/same email/).count()
  check(6, 'Detect duplicate entries', dupBadge > 0 && dupGroups === 1 && reason === 1, `import badge=${dupBadge}, directory groups=${dupGroups}`)
  await page.getByRole('dialog').getByRole('button', { name: 'Merge' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Merge' }).click()
  await page.waitForTimeout(400)
  const afterMerge = await page.getByRole('dialog').getByText(/No possible duplicates/).count()
  await page.keyboard.press('Escape')

  // 7. edit and refresh
  await page.getByRole('button', { name: 'Katrin Vogel', exact: true }).click()
  await page.getByLabel('Job title / Rank').fill('Director of Coordination')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await page.getByText('Participant saved').waitFor()
  await page.reload()
  await page.waitForTimeout(800)
  const persisted = await page.locator('tr', { hasText: 'Katrin Vogel' }).getByText('Director of Coordination').count()
  check(7, 'Edit a participant and keep the change after refreshing', persisted === 1 && afterMerge === 1, `persisted=${persisted}, merged=${afterMerge === 1}`)
  await page.screenshot({ path: path.join(out, 'accept-directory.png') })

  // 8. Excel export
  await page.goto(BASE + '#/export')
  let dl = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Excel (.xlsx)' }).click()
  const xlsxPath = path.join(out, 'export.xlsx')
  await (await dl).saveAs(xlsxPath)
  const wb = XLSX.read(fs.readFileSync(xlsxPath))
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 })
  check(8, 'Export the directory to Excel', rows.length === 34 && rows[0][0] === 'Country' && rows.some((r) => r.includes('Director of Coordination')), `${rows.length - 1} data rows`)

  // 9. standalone HTML export
  dl = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Standalone HTML' }).last().click()
  const htmlPath = path.join(out, 'directory.html')
  await (await dl).saveAs(htmlPath)
  const html = fs.readFileSync(htmlPath, 'utf8')
  const noExternal = !/<(script|link|img)[^>]+(src|href)=["']https?:/i.test(html)
  check(9, 'Export the directory to one standalone HTML file', html.startsWith('<!doctype html>') && noExternal && html.includes("default-src 'none'"), `${(html.length / 1024).toFixed(0)} KB, no external resources=${noExternal}`)

  // 10. open the HTML offline from file:// with working search and filters
  const offline = await browser.newContext({ offline: true, acceptDownloads: true })
  const hp = await offline.newPage()
  const htmlErrors = []
  const htmlRequests = []
  hp.on('pageerror', (e) => htmlErrors.push(e.message))
  hp.on('console', (m) => m.type() === 'error' && htmlErrors.push(m.text()))
  hp.on('request', (r) => !r.url().startsWith('file:') && !r.url().startsWith('data:') && htmlRequests.push(r.url()))
  await hp.goto('file://' + htmlPath)
  const total = await hp.locator('.panel tr.p').count()
  await hp.getByPlaceholder(/Search/).fill('cooperazione')
  const searched = await hp.locator('.panel tr.p').count()
  await hp.getByPlaceholder(/Search/).fill('')
  await hp.locator('select').selectOption({ label: 'France' })
  const filtered = await hp.locator('.panel tr.p').count()
  const mailto = await hp.locator('.panel tr.p a.a.m').first().getAttribute('href')
  await hp.screenshot({ path: path.join(out, 'accept-html-offline.png') })
  // XSS probe: names are rendered as text
  const scripts = await hp.locator('script').count()
  check(10, 'Open the HTML offline with functioning search and filters', total === 33 && searched === 2 && filtered === 2 && /^mailto:/.test(mailto) && !htmlErrors.length && !htmlRequests.length && scripts === 3, `rows=${total}, search=${searched}, France=${filtered}, errors=${htmlErrors.length}, requests=${htmlRequests.length}`)
  await offline.close()

  // 11. JSON backup
  dl = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download full backup' }).click()
  const backupPath = path.join(out, 'backup.json')
  await (await dl).saveAs(backupPath)
  const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'))
  check(11, 'Export a JSON backup', backup.format === 'pm-backup' && backup.projects.length === 2 && backup.participants.length === 33, `${backup.projects.length} projects, ${backup.participants.length} participants`)

  // 12. restore in a clean browser profile
  const clean = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const cp = await clean.newPage()
  watch(cp)
  await cp.goto(BASE)
  await cp.getByRole('button', { name: /empty workspace/i }).click()
  await cp.goto(BASE + '#/export')
  await cp.getByTestId('restore-file').setInputFiles(backupPath)
  await cp.getByText(/Backup from/).waitFor()
  await cp.getByRole('button', { name: 'Restore', exact: true }).click()
  await cp.getByText(/Backup restored/).waitFor()
  await cp.locator('#active-project').selectOption({ label: 'Acceptance Meeting' })
  await cp.goto(BASE + '#/participants')
  await cp.waitForTimeout(800)
  const restoredRows = await cp.locator('table tbody tr:not(.bg-group)').count()
  const restoredEdit = await cp.locator('table').getByText('Director of Coordination').count()
  check(12, 'Restore the JSON backup in a clean browser', restoredRows === 33 && restoredEdit === 1, `${restoredRows} participants restored`)
  await clean.close()

  // 13. no data leaves the browser
  check(13, 'Participant data never leaves the browser', external.length === 0, external.length ? external.slice(0, 5).join(', ') : 'no requests outside the app origin; CSP connect-src self')
  await ctx.close()
} catch (e) {
  console.error(e)
  results.push({ ok: false })
} finally {
  await browser.close()
  server.kill()
}
if (consoleErrors.length) console.log('Console errors:', consoleErrors.slice(0, 10))
const failed = results.filter((r) => !r.ok).length
console.log(`\n${results.length - failed}/${results.length} checks passed`)
process.exit(failed ? 1 : 0)
