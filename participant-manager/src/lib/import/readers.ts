// File readers. Everything runs in the browser; heavy parsers are loaded only when needed.
import { cleanLine } from '../text'
import { detectHeaderRow, type ImportRecord, type SourceTable } from './mapping'
import { freeTextRecords, itemsToLines, linesToTable, looksDelimited, parseDelimited, type Line, type PositionedItem } from './text'

export const MAX_FILE_MB = 25
export const ACCEPT = '.xlsx,.xls,.csv,.docx,.pdf,.txt'

export type ImportErrorCode = 'tooBig' | 'unsupported' | 'signature' | 'empty' | 'failed'
export class ImportError extends Error {
  code: ImportErrorCode
  constructor(code: ImportErrorCode, detail?: string) {
    super(detail ?? code)
    this.code = code
  }
}

export type ReadResult =
  | { kind: 'tables'; tables: SourceTable[]; fromText?: boolean }
  | { kind: 'text'; records: ImportRecord[] }
  | { kind: 'scanned'; data: ArrayBuffer; pages: number }

type Ext = 'xlsx' | 'xls' | 'csv' | 'txt' | 'docx' | 'pdf'

function extOf(name: string): Ext | null {
  const e = name.toLowerCase().split('.').pop() ?? ''
  return (['xlsx', 'xls', 'csv', 'txt', 'docx', 'pdf'] as const).find((x) => x === e) ?? null
}

function startsWith(bytes: Uint8Array, sig: number[]) {
  return sig.every((b, i) => bytes[i] === b)
}
const ZIP = [0x50, 0x4b, 0x03, 0x04]
const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]

/** Checks that the content matches the extension (protects against disguised or damaged files). */
function checkSignature(ext: Ext, bytes: Uint8Array) {
  const head = bytes.subarray(0, 1024)
  const isBinary = head.some((b) => b === 0)
  const ok =
    ext === 'xlsx' || ext === 'docx'
      ? startsWith(bytes, ZIP)
      : ext === 'xls'
        ? startsWith(bytes, OLE) || startsWith(bytes, ZIP) || !isBinary // old Excel, or HTML/CSV saved as .xls
        : ext === 'pdf'
          ? new TextDecoder('latin1').decode(bytes.subarray(0, 1024)).includes('%PDF')
          : !isBinary
  if (!ok) throw new ImportError('signature')
}

export function decodeText(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  // UTF-16 with BOM
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes)
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes)
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, '')
  } catch {
    // Spreadsheet software in Spain/France often saves CSV as Windows-1252.
    return new TextDecoder('windows-1252').decode(bytes)
  }
}

export async function readFile(file: File): Promise<ReadResult> {
  if (file.size > MAX_FILE_MB * 1024 * 1024) throw new ImportError('tooBig')
  const ext = extOf(file.name)
  if (!ext) throw new ImportError('unsupported')
  const buf = await file.arrayBuffer()
  if (!buf.byteLength) throw new ImportError('empty')
  checkSignature(ext, new Uint8Array(buf))
  try {
    switch (ext) {
      case 'xlsx':
      case 'xls':
        return await readSpreadsheet(buf)
      case 'csv':
        return { kind: 'tables', tables: [{ name: file.name, rows: parseDelimited(decodeText(buf)) }] }
      case 'txt':
        return readText(decodeText(buf), file.name)
      case 'docx':
        return await readDocx(buf, file.name)
      case 'pdf':
        return await readPdf(buf, file.name)
    }
  } catch (e) {
    if (e instanceof ImportError) throw e
    throw new ImportError('failed', e instanceof Error ? e.message : String(e))
  }
}

export function readText(text: string, name: string): ReadResult {
  if (!text.trim()) throw new ImportError('empty')
  if (looksDelimited(text)) return { kind: 'tables', tables: [{ name, rows: parseDelimited(text) }], fromText: true }
  return { kind: 'text', records: freeTextRecords(text, name) }
}

// ---------- Excel ----------
async function readSpreadsheet(buf: ArrayBuffer): Promise<ReadResult> {
  const XLSX = await import('@e965/xlsx')
  const wb = XLSX.read(buf, {
    type: 'array',
    cellFormula: false,
    cellHTML: false,
    cellStyles: false,
    bookVBA: false,
    sheetRows: 10000,
  })
  const tables: SourceTable[] = []
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name]
    if (!ws || !ws['!ref']) continue
    // Merged cells (e.g. one country cell spanning several participants): copy the value to every cell.
    for (const m of ws['!merges'] ?? []) {
      const src = ws[XLSX.utils.encode_cell(m.s)]
      if (!src) continue
      for (let r = m.s.r; r <= m.e.r; r++)
        for (let c = m.s.c; c <= m.e.c; c++) {
          const addr = XLSX.utils.encode_cell({ r, c })
          if (!ws[addr]) ws[addr] = { ...src }
        }
    }
    const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: false, defval: '', blankrows: true })
    const clean = rows.map((r) => r.map((c) => (c === null || c === undefined ? '' : String(c))))
    if (clean.some((r) => r.some((c) => c.trim()))) tables.push({ name, rows: clean })
  }
  if (!tables.length) throw new ImportError('empty')
  return { kind: 'tables', tables }
}

// ---------- Word ----------
async function readDocx(buf: ArrayBuffer, name: string): Promise<ReadResult> {
  const mammoth = (await import('mammoth')).default
  const { value: html } = await mammoth.convertToHtml({ arrayBuffer: buf })
  // DOMParser creates an inert document: no scripts run and no resources load.
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const tables: SourceTable[] = []
  let pending: string[] = [] // paragraphs seen since the last table (possible section headings)
  const freeText: string[] = []
  let current: SourceTable | null = null
  for (const el of Array.from(doc.body.children)) {
    if (el.tagName === 'TABLE') {
      const rows = Array.from(el.querySelectorAll('tr')).map((tr) =>
        Array.from(tr.querySelectorAll('td,th')).map((td) =>
          Array.from(td.querySelectorAll('p'))
            .map((p) => p.textContent ?? '')
            .filter((s) => s.trim())
            .join(' ') || (td.textContent ?? ''),
        ),
      )
      const width = Math.max(0, ...rows.map((r) => r.length))
      // a short heading just before the table becomes a one-cell section row (e.g. "SPAIN")
      const heading = pending.filter((p) => p.length < 60).slice(-1)
      if (current && Math.max(0, ...current.rows.map((r) => r.length)) === width) {
        current.rows.push(...heading.map((h) => [h]), ...rows)
      } else {
        current = { name: `${name} · ${tables.length + 1}`, rows: [...heading.map((h) => [h]), ...rows] }
        tables.push(current)
      }
      pending = []
    } else {
      const text = cleanLine(el.textContent ?? '')
      if (text) {
        pending.push(text)
        freeText.push(text)
      } else freeText.push('')
    }
  }
  const useful = tables.filter((t) => t.rows.length >= 2)
  if (useful.length) return { kind: 'tables', tables: useful }
  const text = Array.from(doc.body.querySelectorAll('p,h1,h2,h3,h4,li'))
    .map((p) => p.textContent ?? '')
    .join('\n\n')
  return readText(text || freeText.join('\n'), name)
}

// ---------- PDF ----------
const base = () => new URL('./', document.baseURI).href

async function loadPdf(buf: ArrayBuffer) {
  const pdfjs = await import('pdfjs-dist')
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  const task = pdfjs.getDocument({
    data: new Uint8Array(buf.slice(0)),
    enableXfa: false,
    disableFontFace: true,
    wasmUrl: base() + 'pdfjs/wasm/',
    standardFontDataUrl: base() + 'pdfjs/standard_fonts/',
  })
  const pdf = await task.promise
  return Object.assign(pdf, { close: () => task.destroy() })
}

/** Joins lines into text, inserting blank lines where the vertical gap is larger than usual. */
function linesToText(lines: Line[]): string {
  const gaps = lines.slice(1).map((l, i) => l.y - lines[i].y).filter((g) => g > 0)
  const typical = gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)] ?? 12
  return lines
    .map((l, i) => (i > 0 && l.y - lines[i - 1].y > typical * 1.6 ? '\n' : '') + l.cells.map((c) => c.text).join('\t'))
    .join('\n')
}

export function positionedToResult(items: PositionedItem[], name: string): ReadResult {
  const lines = itemsToLines(items)
  if (!lines.length) throw new ImportError('empty')
  const header = detectHeaderRow(lines.map((l) => l.cells.map((c) => c.text)))
  const table = linesToTable(lines, name, header)
  if (table) return { kind: 'tables', tables: [table] }
  return { kind: 'text', records: freeTextRecords(linesToText(lines), name) }
}

async function readPdf(buf: ArrayBuffer, name: string): Promise<ReadResult> {
  const pdf = await loadPdf(buf)
  const pdfjs = await import('pdfjs-dist')
  const items: PositionedItem[] = []
  let imageOnlyPages = 0
  let offset = 0
  for (let p = 1; p <= Math.min(pdf.numPages, 200); p++) {
    const page = await pdf.getPage(p)
    const vp = page.getViewport({ scale: 1 })
    const content = await page.getTextContent()
    let chars = 0
    for (const it of content.items) {
      if (!('str' in it) || !it.str.trim()) continue
      chars += it.str.trim().length
      const [, , c, d, e, f] = it.transform as number[]
      const h = Math.hypot(c, d) || it.height || 10
      items.push({ text: it.str, x: e, y: offset + (vp.height - f), w: it.width, h })
    }
    if (chars < 20) {
      const ops = await page.getOperatorList()
      const imageOps = [pdfjs.OPS.paintImageXObject, pdfjs.OPS.paintInlineImageXObject, pdfjs.OPS.paintImageMaskXObject]
      if (ops.fnArray.some((fn) => imageOps.includes(fn))) imageOnlyPages++
    }
    offset += vp.height + 50
    page.cleanup()
  }
  const pages = pdf.numPages
  await pdf.close()
  if (imageOnlyPages > 0 && imageOnlyPages >= Math.ceil(pages / 2)) return { kind: 'scanned', data: buf, pages }
  if (!items.length) throw new ImportError('empty')
  return positionedToResult(items, name)
}

// ---------- OCR (scanned PDF) ----------
export type OcrProgress = { stage: 'loading' } | { stage: 'page'; page: number; pages: number; pct: number }

/**
 * Local OCR with Tesseract (WebAssembly). The engine and language files are served by this app itself;
 * the document never leaves the browser.
 */
export async function ocrPdf(buf: ArrayBuffer, langs: string[], onProgress: (p: OcrProgress) => void, name: string): Promise<ReadResult> {
  onProgress({ stage: 'loading' })
  const Tesseract = await import('tesseract.js')
  let currentPage = 1
  let totalPages = 1
  const worker = await Tesseract.createWorker(langs, Tesseract.OEM.LSTM_ONLY, {
    workerPath: base() + 'ocr/worker.min.js',
    corePath: base() + 'ocr/core/',
    langPath: base() + 'ocr/lang/',
    gzip: true,
    workerBlobURL: false,
    cacheMethod: 'none',
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') onProgress({ stage: 'page', page: currentPage, pages: totalPages, pct: Math.round(m.progress * 100) })
    },
  })
  try {
    const pdf = await loadPdf(buf)
    totalPages = Math.min(pdf.numPages, 50)
    const items: PositionedItem[] = []
    let offset = 0
    for (let p = 1; p <= totalPages; p++) {
      currentPage = p
      onProgress({ stage: 'page', page: p, pages: totalPages, pct: 0 })
      const page = await pdf.getPage(p)
      const vp = page.getViewport({ scale: 2.2 })
      const canvas = document.createElement('canvas')
      canvas.width = Math.floor(vp.width)
      canvas.height = Math.floor(vp.height)
      await page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport: vp }).promise
      const { data } = await worker.recognize(canvas, {}, { tsv: true, text: false, blocks: false })
      for (const line of (data.tsv ?? '').split('\n').slice(1)) {
        const cols = line.split('\t')
        if (cols[0] !== '5' || !cols[11]?.trim() || Number(cols[10]) < 0) continue
        const [left, top, width, height] = cols.slice(6, 10).map(Number)
        items.push({ text: cols[11], x: left, y: offset + top, w: width, h: height })
      }
      offset += canvas.height + 100
      page.cleanup()
      canvas.width = canvas.height = 0
    }
    await pdf.close()
    if (!items.length) throw new ImportError('empty')
    return positionedToResult(items, name)
  } finally {
    await worker.terminate()
  }
}
