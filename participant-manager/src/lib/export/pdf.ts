// Printable PDF directory grouped by country (jsPDF + AutoTable, generated in the browser).
import { participantCountryLabel } from '../countries'
import { translate, type Lang } from '../i18n'
import { displayName } from '../participants'
import type { Participant, Project } from '../types'
import { toB64 } from './crypto'
import { sortForExport } from './table'

async function loadFont(name: string): Promise<string> {
  // Liberation Sans (SIL OFL) ships with pdf.js and is served by this app; it covers Latin, Greek and Cyrillic.
  const res = await fetch(new URL(`./pdfjs/standard_fonts/${name}`, document.baseURI))
  if (!res.ok) throw new Error('font')
  return toB64(new Uint8Array(await res.arrayBuffer()))
}

function dateRange(p: Project, lang: Lang) {
  const f = (s: string) => new Date(s + 'T00:00:00').toLocaleDateString(lang, { day: 'numeric', month: 'long', year: 'numeric' })
  return [p.startDate && f(p.startDate), p.endDate && f(p.endDate)].filter(Boolean).join(' – ')
}

export async function buildPdf(project: Project, list: Participant[], lang: Lang): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const autoTable = (await import('jspdf-autotable')).default
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
  let font = 'helvetica'
  try {
    doc.addFileToVFS('LiberationSans-Regular.ttf', await loadFont('LiberationSans-Regular.ttf'))
    doc.addFont('LiberationSans-Regular.ttf', 'Liberation', 'normal')
    doc.addFileToVFS('LiberationSans-Bold.ttf', await loadFont('LiberationSans-Bold.ttf'))
    doc.addFont('LiberationSans-Bold.ttf', 'Liberation', 'bold')
    font = 'Liberation'
  } catch {
    /* fall back to the built-in font (Latin-1 only) */
  }
  const t = (k: Parameters<typeof translate>[1]) => translate(lang, k)
  const W = doc.internal.pageSize.getWidth()
  const navy: [number, number, number] = [8, 20, 38]
  const cyan: [number, number, number] = [53, 188, 232]

  // header band
  doc.setFillColor(...navy)
  doc.rect(0, 0, W, 78, 'F')
  doc.setFillColor(...cyan)
  doc.rect(0, 78, W, 3, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont(font, 'bold')
  doc.setFontSize(18)
  doc.text(project.name, 36, 36, { maxWidth: W - 72 })
  doc.setFont(font, 'normal')
  doc.setFontSize(10)
  doc.setTextColor(185, 205, 225)
  const sub = [project.location, dateRange(project, lang), `${list.length} ${t('statParticipants').toLowerCase()}`].filter(Boolean).join('  ·  ')
  doc.text(sub, 36, 58)

  const sorted = sortForExport(list, lang)
  const body: unknown[] = []
  let current = '\u0000'
  for (const p of sorted) {
    const label = participantCountryLabel(p, lang) || t('noCountry')
    if (label !== current) {
      current = label
      const n = sorted.filter((x) => (participantCountryLabel(x, lang) || t('noCountry')) === label).length
      body.push([
        {
          content: `${label.toUpperCase()}   (${n})`,
          colSpan: 6,
          styles: { fillColor: [228, 236, 246], textColor: navy, fontStyle: 'bold', fontSize: 9.5 },
        },
      ])
    }
    body.push([
      displayName(p),
      p.jobTitle,
      [p.organisation, p.department].filter(Boolean).join('\n'),
      p.email,
      [p.phone, p.whatsapp && p.whatsapp !== p.phone ? `WhatsApp: ${p.whatsapp}` : ''].filter(Boolean).join('\n'),
      p.notes,
    ])
  }

  autoTable(doc, {
    startY: 98,
    head: [[t('f_name'), t('f_jobTitle'), t('f_organisation'), t('f_email'), t('f_phone'), t('f_notes')]],
    body: body as never,
    theme: 'grid',
    margin: { left: 36, right: 36, top: 40, bottom: 40 },
    styles: { font, fontSize: 8.5, cellPadding: 5, lineColor: [215, 222, 232], lineWidth: 0.4, textColor: [20, 32, 50], valign: 'middle', overflow: 'linebreak' },
    headStyles: { fillColor: navy, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5 },
    alternateRowStyles: { fillColor: [246, 249, 252] },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 130 }, 1: { cellWidth: 110 }, 2: { cellWidth: 150 }, 3: { cellWidth: 160 }, 4: { cellWidth: 125 } },
    rowPageBreak: 'avoid',
    didDrawPage: () => {
      const H = doc.internal.pageSize.getHeight()
      doc.setFont(font, 'normal')
      doc.setFontSize(7.5)
      doc.setTextColor(120, 130, 145)
      const page = doc.getCurrentPageInfo().pageNumber
      doc.text(`${project.name} · ${new Date().toLocaleDateString(lang)}`, 36, H - 20)
      doc.text(lang === 'es' ? 'Contiene datos personales — uso restringido' : 'Contains personal data — restricted use', W / 2, H - 20, { align: 'center' })
      doc.text(String(page), W - 36, H - 20, { align: 'right' })
    },
  })
  doc.setProperties({ title: project.name, creator: 'Participant Manager' })
  return doc.output('blob')
}
