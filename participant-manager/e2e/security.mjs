// Opens the hostile exports written by the unit tests (src/lib/__tests__/security.test.ts) and checks nothing executes.
import { createRequire } from 'node:module'
const { chromium } = createRequire(import.meta.url)('playwright')
const out = new URL('./out/', import.meta.url).pathname
const browser = await chromium.launch()
let failed = 0
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) failed++ }

const ctx = await browser.newContext({ offline: true })
const page = await ctx.newPage()
const dialogs = []
const errors = []
page.on('dialog', (d) => { dialogs.push(d.message()); d.dismiss() })
page.on('pageerror', (e) => errors.push(e.message))
await page.goto('file://' + out + 'xss.html')
await page.waitForTimeout(500)
ok(dialogs.length === 0, `no script from participant data ran (dialogs: ${dialogs.length})`)
ok((await page.locator('.panel .nm').first().innerText()).includes('<script>alert(1)</script>'), 'malicious name is displayed as plain text')
ok((await page.locator('a[href^="javascript"]').count()) === 0, 'no javascript: links')
ok(errors.length === 0, `no page errors ${errors.join(' ')}`)

await page.goto('file://' + out + 'xss-encrypted.html')
await page.getByLabel(/Password/).fill('wrong password')
await page.getByRole('button', { name: /Open/ }).click()
await page.getByText(/Wrong password/).waitFor({ timeout: 20000 })
ok(true, 'encrypted HTML rejects a wrong password')
await page.getByLabel(/Password/).fill('correct horse battery')
await page.getByRole('button', { name: /Open/ }).click()
await page.locator('.panel .nm').first().waitFor({ timeout: 20000 })
ok((await page.locator('.panel tr.p').count()) === 1 && dialogs.length === 0, 'encrypted HTML opens offline with the right password')
await browser.close()
process.exit(failed ? 1 : 0)
