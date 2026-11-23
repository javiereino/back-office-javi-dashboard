import { createRequire } from 'node:module'
const { chromium } = createRequire(import.meta.url)('playwright')
const out = new URL('./out/', import.meta.url).pathname
const b = await chromium.launch(); const ctx = await b.newContext({ acceptDownloads: true }); const p = await ctx.newPage()
p.on('pageerror', e=>console.log('ERR',e.message))
await p.goto('http://localhost:4173/'); await p.getByRole('button',{name:/demonstration/i}).click(); await p.waitForTimeout(800)
await p.goto('http://localhost:4173/#/export')
for (const [btn, file] of [['PDF directory','dir.pdf'],['Standalone HTML','demo.html'],['Contacts (.vcf)','demo.vcf'],['CSV (UTF-8)','demo.csv']]) {
  const dl = p.waitForEvent('download'); await p.getByRole('button', { name: btn }).last().click(); await (await dl).saveAs(out + file)
}
await b.close()
