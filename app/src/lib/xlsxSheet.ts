import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'

/**
 * Tiny .xlsx reader / writer for plain tables (no formulas, no styles).
 * An .xlsx is a zip of XML parts, so we read the first worksheet's cells as
 * text without pulling in a spreadsheet library. Works in the browser and in
 * Node (no DOMParser).
 */

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&')
}

function encodeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
}

/** All <t> text inside a fragment (handles rich text runs). */
function textOf(fragment: string): string {
  let out = ''
  const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(fragment))) out += decodeXml(m[1] ?? '')
  return out
}

/** "AB12" → 27 (zero based column index). */
export function columnIndex(ref: string): number {
  const letters = (ref.match(/^[A-Z]+/i)?.[0] || 'A').toUpperCase()
  let n = 0
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

function columnLetters(index: number): string {
  let n = index + 1
  let s = ''
  while (n > 0) {
    const r = (n - 1) % 26
    s = String.fromCharCode(65 + r) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

function formatNumber(raw: string): string {
  const n = Number(raw)
  if (!Number.isFinite(n)) return raw
  // Excel stores 42 as "42" but 32.5 can come back as 32.499999999999996.
  return String(Math.round(n * 1e9) / 1e9)
}

function firstSheetPath(files: Record<string, Uint8Array>): string | null {
  const wb = files['xl/workbook.xml'] ? strFromU8(files['xl/workbook.xml']) : ''
  const rels = files['xl/_rels/workbook.xml.rels'] ? strFromU8(files['xl/_rels/workbook.xml.rels']) : ''
  const firstSheet = wb.match(/<sheet\b[^>]*\br:id="([^"]+)"/)?.[1] || wb.match(/<sheet\b[^>]*\bid="([^"]+)"/)?.[1]
  if (firstSheet && rels) {
    const rel = rels.match(new RegExp(`<Relationship\\b[^>]*Id="${firstSheet}"[^>]*>`))?.[0] || ''
    const target = rel.match(/Target="([^"]+)"/)?.[1]
    if (target) {
      const path = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`
      if (files[path]) return path
    }
  }
  const sheets = Object.keys(files)
    .filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k))
    .sort((a, b) => Number(a.match(/\d+/)?.[0]) - Number(b.match(/\d+/)?.[0]))
  return sheets[0] || null
}

/** First worksheet of an .xlsx file as rows of text cells (blank rows dropped). */
export function readXlsxRows(data: Uint8Array): string[][] {
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(data)
  } catch {
    throw new Error('This file is not a valid .xlsx workbook.')
  }
  const sheetPath = firstSheetPath(files)
  if (!sheetPath) throw new Error('No worksheet found in this workbook.')

  const shared: string[] = []
  if (files['xl/sharedStrings.xml']) {
    const xml = strFromU8(files['xl/sharedStrings.xml'])
    const re = /<si\b[^>]*>([\s\S]*?)<\/si>|<si\b[^>]*\/>/g
    let m: RegExpExecArray | null
    while ((m = re.exec(xml))) shared.push(textOf(m[1] ?? ''))
  }

  const xml = strFromU8(files[sheetPath])
  const rows: string[][] = []
  const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g
  let rm: RegExpExecArray | null
  while ((rm = rowRe.exec(xml))) {
    const cells: string[] = []
    const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g
    let cm: RegExpExecArray | null
    let next = 0
    while ((cm = cellRe.exec(rm[1]))) {
      const attrs = cm[1] || ''
      const body = cm[2] || ''
      const ref = attrs.match(/\br="([A-Z]+\d+)"/i)?.[1]
      const col = ref ? columnIndex(ref) : next
      next = col + 1
      const type = attrs.match(/\bt="([^"]+)"/)?.[1] || 'n'
      const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1]
      let value = ''
      if (type === 's') value = shared[Number(v)] ?? ''
      else if (type === 'inlineStr') value = textOf(body)
      else if (type === 'b') value = v === '1' ? 'TRUE' : v === '0' ? 'FALSE' : ''
      else if (type === 'str' || type === 'e') value = decodeXml(v ?? '')
      else value = v != null ? formatNumber(decodeXml(v)) : ''
      while (cells.length < col) cells.push('')
      cells[col] = value.trim()
    }
    if (cells.some((c) => c !== '')) rows.push(cells)
  }
  return rows
}

/** A one-sheet .xlsx with text cells; the first row is bold-free headers. */
export function writeXlsxRows(rows: string[][], sheetName = 'Sheet1'): Uint8Array {
  const sheetRows = rows
    .map((cells, r) => {
      const cs = cells
        .map((v, c) =>
          v === ''
            ? ''
            : `<c r="${columnLetters(c)}${r + 1}" t="inlineStr"><is><t xml:space="preserve">${encodeXml(v)}</t></is></c>`,
        )
        .join('')
      return `<row r="${r + 1}">${cs}</row>`
    })
    .join('')
  const widths = (rows[0] || []).map((_, i) => `<col min="${i + 1}" max="${i + 1}" width="18" customWidth="1"/>`).join('')
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    ),
    '_rels/.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    ),
    'xl/workbook.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${encodeXml(sheetName).slice(0, 31)}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    ),
    'xl/worksheets/sheet1.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${widths ? `<cols>${widths}</cols>` : ''}<sheetData>${sheetRows}</sheetData></worksheet>`,
    ),
  }
  return zipSync(files)
}
