import { strToU8, zipSync } from 'fflate'
import type { Statement } from './statementReport'

/**
 * Excel (.xlsx) version of the income & expenses statement, styled like the PDF:
 * income in green (+), expenses in red (−), signed numbers so totals still add up.
 * Built by hand (an .xlsx is a zip of XML parts) to avoid a spreadsheet dependency.
 */

const GREEN = 'FF15803D'
const RED = 'FFB91C1C'
const MUTED = 'FF6B7280'
const HEADER_FILL = 'FFF3F4F6'

// cellXfs indexes (see styles below)
const S = {
  title: 1,
  subtitle: 2,
  muted: 3,
  header: 4,
  headerRight: 5,
  date: 6,
  text: 7,
  greenNum: 8,
  greenNumBold: 9,
  redNum: 10,
  redNumBold: 11,
  greenText: 12,
  redText: 13,
  bold: 14,
  boldTop: 15,
  greenNumBoldTop: 16,
  redNumBoldTop: 17,
  mutedTop: 18,
} as const

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2">
<numFmt numFmtId="164" formatCode="+#,##0.00;-#,##0.00;0.00"/>
<numFmt numFmtId="165" formatCode="dd mmm yyyy"/>
</numFmts>
<fonts count="9">
<font><sz val="11"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><name val="Calibri"/></font>
<font><sz val="11"/><color rgb="${GREEN}"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color rgb="${GREEN}"/><name val="Calibri"/></font>
<font><sz val="11"/><color rgb="${RED}"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color rgb="${RED}"/><name val="Calibri"/></font>
<font><b/><sz val="16"/><name val="Calibri"/></font>
<font><sz val="10"/><color rgb="${MUTED}"/><name val="Calibri"/></font>
<font><b/><sz val="12"/><name val="Calibri"/></font>
</fonts>
<fills count="3">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="${HEADER_FILL}"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="3">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left/><right/><top/><bottom style="medium"><color rgb="FF111827"/></bottom><diagonal/></border>
<border><left/><right/><top style="thin"><color rgb="FF111827"/></top><bottom/><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="19">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="6" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="8" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="7" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="left" vertical="top"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
<xf numFmtId="164" fontId="2" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyAlignment="1"><alignment vertical="top"/></xf>
<xf numFmtId="164" fontId="3" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyAlignment="1"><alignment vertical="top"/></xf>
<xf numFmtId="164" fontId="4" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyAlignment="1"><alignment vertical="top"/></xf>
<xf numFmtId="164" fontId="5" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyAlignment="1"><alignment vertical="top"/></xf>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="top"/></xf>
<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="top"/></xf>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="2" xfId="0" applyFont="1" applyBorder="1"/>
<xf numFmtId="164" fontId="3" fillId="0" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>
<xf numFmtId="164" fontId="5" fillId="0" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>
<xf numFmtId="0" fontId="7" fillId="0" borderId="2" xfId="0" applyFont="1" applyBorder="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`

const esc = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // Drop control characters Excel refuses to open.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')

const COLS = 'ABCDEFGHI'

type Cell = { t: 's'; v: string; s?: number } | { t: 'n'; v: number; s?: number } | null

function cellXml(ref: string, c: Cell): string {
  if (!c) return ''
  const style = c.s ? ` s="${c.s}"` : ''
  if (c.t === 'n') return `<c r="${ref}"${style}><v>${Number.isFinite(c.v) ? c.v : 0}</v></c>`
  if (!c.v) return c.s ? `<c r="${ref}"${style}/>` : ''
  return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${esc(c.v)}</t></is></c>`
}

/** yyyy-mm-dd → Excel serial date (days since 1899-12-30). */
export function excelDate(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000)
}

function prettyDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${String(d).padStart(2, '0')} ${months[m - 1]} ${y}`
}

const str = (v: string, s?: number): Cell => ({ t: 's', v, s })
const num = (v: number, s?: number): Cell => ({ t: 'n', v: Math.round(v * 100) / 100, s })

export function statementXlsx(st: Statement, companyName = 'RED REACH'): Uint8Array {
  const rows: Cell[][] = []
  const t = st.totals
  const netNum = (v: number, bold = true) =>
    num(v, v < 0 ? (bold ? S.redNumBold : S.redNum) : bold ? S.greenNumBold : S.greenNum)

  rows.push([str(companyName, S.title)])
  rows.push([str('Income & expenses statement', S.subtitle)])
  rows.push([str(`Period: ${prettyDate(st.from)} – ${prettyDate(st.to)}`, S.muted)])
  rows.push([])
  rows.push([str('Income', S.muted), num(t.income, S.greenNumBold), str(`VAT ${t.outputVat.toFixed(2)}`, S.muted)])
  rows.push([str('Expenses', S.muted), num(-t.expenses, S.redNumBold), str(`VAT ${t.inputVat.toFixed(2)}`, S.muted)])
  rows.push([
    str('Net', S.muted),
    netNum(t.net),
    str(`Net VAT ${t.netVat.toFixed(2)} ${t.netVat < 0 ? '(refundable)' : '(payable)'}`, S.muted),
  ])
  rows.push([])

  const headerRow = rows.length + 1
  rows.push([
    str('Date', S.header),
    str('Type', S.header),
    str('Party', S.header),
    str('Description', S.header),
    str('Reference', S.header),
    str('Category', S.header),
    str('Amount ex-VAT (AED)', S.headerRight),
    str('VAT (AED)', S.headerRight),
    str('Amount (AED)', S.headerRight),
  ])
  for (const r of st.rows) {
    const income = r.kind === 'income'
    const sign = income ? 1 : -1
    rows.push([
      num(excelDate(r.date), S.date),
      str(income ? 'Income (+)' : 'Expense (−)', income ? S.greenText : S.redText),
      str(r.party, S.text),
      str(r.description, S.text),
      str(r.reference, S.text),
      str(r.category, S.text),
      num(sign * r.exclusive, income ? S.greenNum : S.redNum),
      num(sign * r.vat, income ? S.greenNum : S.redNum),
      num(sign * r.inclusive, income ? S.greenNumBold : S.redNumBold),
    ])
  }
  const lastDataRow = rows.length
  rows.push([])
  rows.push([
    str('Total income', S.bold), null, null, null, null, null,
    num(t.income - t.outputVat, S.greenNum), num(t.outputVat, S.greenNum), num(t.income, S.greenNumBold),
  ])
  rows.push([
    str('Total expenses', S.bold), null, null, null, null, null,
    num(-(t.expenses - t.inputVat), S.redNum), num(-t.inputVat, S.redNum), num(-t.expenses, S.redNumBold),
  ])
  const netEx = t.net - t.netVat
  rows.push([
    str('Net', S.boldTop), str('', S.mutedTop), str('', S.mutedTop), str('', S.mutedTop), str('', S.mutedTop), str('', S.mutedTop),
    num(netEx, netEx < 0 ? S.redNumBoldTop : S.greenNumBoldTop),
    num(t.netVat, t.netVat < 0 ? S.redNumBoldTop : S.greenNumBoldTop),
    num(t.net, t.net < 0 ? S.redNumBoldTop : S.greenNumBoldTop),
  ])
  rows.push([])
  rows.push([str('Income shown in green (+), expenses in red (−). Amounts in AED; amounts include VAT.', S.muted)])

  const sheetRows = rows
    .map((cells, i) => {
      const r = i + 1
      const body = cells.map((c, j) => cellXml(`${COLS[j]}${r}`, c)).join('')
      return body ? `<row r="${r}">${body}</row>` : ''
    })
    .join('')

  const widths = [14, 13, 26, 46, 26, 18, 20, 12, 18]
  const cols = widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')
  const filter = st.rows.length ? `<autoFilter ref="A${headerRow}:I${lastDataRow}"/>` : ''
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>
<sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="${headerRow}" topLeftCell="A${headerRow + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols>${cols}</cols>
<sheetData>${sheetRows}</sheetData>
${filter}
<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>
<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>
</worksheet>`

  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`),
    '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`),
    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Income &amp; expenses" sheetId="1" r:id="rId1"/></sheets>
${st.rows.length ? `<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'Income &amp; expenses'!$A$${headerRow}:$I$${lastDataRow}</definedName></definedNames>` : ''}
</workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`),
    'xl/styles.xml': strToU8(STYLES),
    'xl/worksheets/sheet1.xml': strToU8(sheet),
  }
  return zipSync(files, { level: 6 })
}

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
