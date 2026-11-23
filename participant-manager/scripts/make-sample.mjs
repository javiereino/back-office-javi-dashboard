// Generates fictional sample files in samples/ to test the importer:
//   participants-sample.xlsx  (Spanish headers, title row, 34 people, mixed country spellings, gaps, a duplicate)
//   participants-sample.csv   (French headers, semicolon-separated, Windows-1252 would also work)
//   participants-sample.txt   (free text blocks)
//   participants-sample.pdf   (text PDF with a table)        — needs Playwright
//   participants-scanned.pdf  (image-only PDF, for local OCR) — needs Playwright
// All data is invented; emails use the reserved .example domain.
import * as XLSX from '@e965/xlsx'
import fs from 'node:fs'
import { createRequire } from 'node:module'

const out = new URL('../samples/', import.meta.url).pathname
fs.mkdirSync(out, { recursive: true })

const P = [
  ['España', 'Lucía', 'Herrera Gil', 'Comisaria', 'Unidad de Coordinación Internacional', 'lucia.herrera@uci-es.example', '+34 915 550 214', ''],
  ['Spain', 'Javier', 'Ortega Ruiz', 'Inspector', 'Unidad de Coordinación Internacional', 'javier.ortega@uci-es.example', '0034 600 555 123', ''],
  ['ES', 'Nuria', 'Castells', 'Analista', 'Centro de Inteligencia Regional', 'n.castells@cir-es.example', '', 'Llega el martes'],
  ['Francia', 'Camille', 'Dubois', 'Commissaire divisionnaire', 'Office de coordination opérationnelle', 'camille.dubois@oco-fr.example', '+33 1 55 50 12 34', ''],
  ['France', 'Hugo', 'Lefèvre', 'Capitaine', 'Office de coordination opérationnelle', 'h.lefevre@oco-fr.example', '+33 6 55 50 98 76', ''],
  ['Alemania', 'Katrin', 'Vogel', 'Head of Unit', 'Federal Coordination Office', 'k.vogel@fco-de.example', '+49 30 5550 1820', ''],
  ['Germany', 'Markus', 'Brandt', 'Liaison Officer', 'Federal Coordination Office', '', '+49 171 5550342', 'Email pendiente'],
  ['Italia', 'Giulia', 'Romano', 'Vice Questore', 'Servizio per la Cooperazione', 'giulia.romano@sci-it.example', '+39 06 5550 4410', ''],
  ['Italia', 'Matteo', 'Esposito', 'Commissario', 'Servizio per la Cooperazione', '', '', ''],
  ['Portugal', 'João', 'Ferreira', 'Inspetor-Chefe', 'Unidade de Coordenação Nacional', 'j.ferreira@ucn-pt.example', '+351 21 555 0132', ''],
  ['Países Bajos', 'Sanne', 'de Vries', 'Strategic Advisor', 'National Coordination Unit', 's.devries@ncu-nl.example', '+31 70 555 0123', ''],
  ['Bélgica', 'Elise', 'Janssens', 'Senior Analyst', 'National Crisis Centre', 'elise.janssens@ncc-be.example', '+32 2 555 04 17', ''],
  ['Polonia', 'Agnieszka', 'Nowak', 'Head of Section', 'Central Coordination Bureau', 'a.nowak@ccb-pl.example', '+48 22 555 01 45', ''],
  ['Rumanía', 'Andrei', 'Popescu', 'Chief Commissioner', 'General Directorate for Coordination', 'a.popescu@gdc-ro.example', '+40 21 555 0177', ''],
  ['Suecia', 'Linnea', 'Berg', 'Detective Superintendent', 'National Operations Department', 'linnea.berg@nod-se.example', '+46 8 555 012 34', ''],
  ['Grecia', 'Eleni', 'Papadaki', 'Police Major', 'Hellenic Coordination Directorate', 'e.papadaki@hcd-gr.example', '+30 21 0555 0144', ''],
  ['Irlanda', 'Ciarán', 'O’Sullivan', 'Detective Inspector', 'National Bureau of Coordination', 'c.osullivan@nbc-ie.example', '+353 1 555 0199', ''],
  ['Reino Unido', 'James', 'Whitfield', 'Programme Manager', 'National Coordination Agency', 'james.whitfield@nca-uk.example', '+44 20 7946 0958', ''],
  ['UK', 'Priya', 'Raman', 'Senior Investigator', 'National Coordination Agency', 'p.raman@nca-uk.example', '07700 900123', 'Número sin prefijo internacional'],
  ['Marruecos', 'Youssef', 'El Amrani', 'Commissaire principal', 'Direction de la Coopération', 'y.elamrani@dc-ma.example', '+212 5 37 55 50 11', ''],
  ['Senegal', 'Aminata', 'Diop', 'Commissaire', 'Direction de la Coordination', 'a.diop@dc-sn.example', '+221 33 555 01 23', ''],
  ['México', 'Fernanda', 'Galindo', 'Directora de Área', 'Secretaría de Coordinación Regional', 'f.galindo@scr-mx.example', '+52 55 5555 0177', ''],
  ['Colombia', 'Andrés', 'Rojas Mejía', 'Coronel', 'Dirección de Cooperación Internacional', 'andres.rojas@dci-co.example', '+57 601 555 2390', ''],
  ['Colombia', 'Paula', 'Cárdenas', 'Capitán', 'Dirección de Cooperación Internacional', 'p.cardenas@dci-co', '', 'Email incompleto en el original'],
  ['Perú', 'Diego', 'Quispe Huamán', 'Mayor', 'Dirección de Cooperación Policial', 'd.quispe@dcp-pe.example', '+51 1 555 0163', ''],
  ['Argentina', 'María Belén', 'Sosa', 'Investigadora', 'Servicio Federal de Investigaciones', 'mb.sosa@fis-ar.example', '+54 11 5555 0187', ''],
  ['Brasil', 'Rafael', 'Monteiro', 'Agente Federal', 'Agência Nacional de Coordenação', 'r.monteiro@nca-br.example', '+55 61 5555 0342', ''],
  ['Chile', 'Tomás', 'Fuentealba', 'Subcomisario', 'Dirección Nacional de Coordinación', 't.fuentealba@dnc-cl.example', '+56 2 2555 0190', ''],
  ['Uruguay', 'Valentina', 'Pereyra', 'Comisario Mayor', 'Dirección de Asuntos Internacionales', 'v.pereyra@dai-uy.example', '+598 2 555 0123', ''],
  ['Estados Unidos', 'Daniel', 'Brooks', 'Attaché', 'Department of Regional Coordination', 'daniel.brooks@drc-us.example', '+1 202 555 0175', ''],
  ['Canadá', 'Olivia', 'Bennett', 'Project Officer', 'Public Safety Coordination', 'olivia.bennett@psc-ca.example', '+1 613 555 0142', ''],
  ['Japón', 'Yuki', 'Tanaka', 'Superintendent', 'National Coordination Agency', 'y.tanaka@nca-jp.example', '+81 3 5555 0123', ''],
  // duplicate of the first row (same email), written differently
  ['España', 'Lucia', 'Herrera', 'Comisaria', 'U. Coordinación Internacional', 'lucia.herrera@uci-es.example', '915550214', ''],
  // missing country
  ['', 'Observador', 'Pendiente', '', 'Organización Regional Asociada', 'observador@ora.example', '', ''],
]

// ---------- Excel ----------
const header = ['Nº', 'País', 'Nombre', 'Apellidos', 'Cargo', 'Organización', 'Correo electrónico', 'Teléfono', 'Observaciones']
const aoa = [
  ['Reunión Internacional de Coordinación — Lista de participantes (DATOS FICTICIOS)'],
  [],
  header,
  ...P.map((r, i) => [i + 1, ...r]),
]
const ws = XLSX.utils.aoa_to_sheet(aoa)
ws['!cols'] = [6, 16, 16, 18, 26, 38, 34, 20, 30].map((wch) => ({ wch }))
const wb = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(wb, ws, 'Participantes')
fs.writeFileSync(out + 'participants-sample.xlsx', XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))

// ---------- CSV (French headers) ----------
const csvHeader = ['Pays', 'Prénom', 'Nom', 'Fonction', 'Organisme', 'Courriel', 'Téléphone']
const esc = (v) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
const csv = [csvHeader, ...P.slice(0, 12).map((r) => [r[0], r[1], r[2], r[3], r[4], r[5], r[6]])].map((r) => r.map(esc).join(';')).join('\r\n')
fs.writeFileSync(out + 'participants-sample.csv', '﻿' + csv)

// ---------- free text ----------
const txt = [
  'PARTICIPANTS – REGIONAL TASK FORCE (fictional data)',
  '',
  'SPAIN',
  '',
  'Marta Domínguez',
  'Inspectora Jefa, Unidad de Coordinación Internacional',
  'Email: m.dominguez@uci-es.example',
  'Tel: +34 915 550 377',
  '',
  'Álvaro Navarro',
  'Organisation: Centro de Altos Estudios',
  'a.navarro@cae-es.example · Mobile +34 600 555 188 · WhatsApp +34 600 555 188',
  '',
  'FRANCE',
  '',
  'Léa Moreau',
  'Formatrice — École nationale de coordination',
  'l.moreau@enc-fr.example',
  '+33 4 55 50 11 22',
].join('\n')
fs.writeFileSync(out + 'participants-sample.txt', txt)

// ---------- PDFs (rendered with Playwright Chromium) ----------
let chromium
try {
  chromium = createRequire(import.meta.url)('playwright').chromium
} catch {
  console.log('Playwright not found: PDF samples skipped')
}
if (chromium) {
  const rows = P.slice(0, 20)
    .map((r) => `<tr><td>${r[0]}</td><td>${r[1]} ${r[2]}</td><td>${r[3]}</td><td>${r[4]}</td><td>${r[5]}</td><td>${r[6]}</td></tr>`)
    .join('')
  const html = `<html><body style="font-family:Arial;font-size:9px;margin:24px">
<h2>International Coordination Meeting – Participants (fictional)</h2>
<table style="border-collapse:collapse;width:100%" border="0" cellpadding="4">
<tr style="font-weight:bold"><td>Country</td><td>Name</td><td>Position</td><td>Organisation</td><td>Email</td><td>Telephone</td></tr>${rows}</table></body></html>`
  const browser = await chromium.launch()
  const page = await browser.newPage()
  await page.setContent(html)
  await page.pdf({ path: out + 'participants-sample.pdf', format: 'A4', landscape: true })
  // image-only PDF: screenshot of the same table embedded as a picture
  await page.setViewportSize({ width: 1400, height: 900 })
  await page.setContent(html.replace('font-size:9px', 'font-size:15px').replace(rows, P.slice(0, 8).map((r) => `<tr><td>${r[0]}</td><td>${r[1]} ${r[2]}</td><td>${r[3]}</td><td>${r[4]}</td><td>${r[5]}</td><td>${r[6]}</td></tr>`).join('')))
  const png = await page.screenshot({ fullPage: true })
  await page.setContent(`<html><body style="margin:0"><img style="width:100%" src="data:image/png;base64,${png.toString('base64')}"></body></html>`)
  await page.pdf({ path: out + 'participants-scanned.pdf', format: 'A4', landscape: true, printBackground: true })
  await browser.close()
}
console.log('Samples written to', out)
