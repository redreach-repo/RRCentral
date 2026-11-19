import { describe, expect, it } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import { columnIndex, readXlsxRows, writeXlsxRows } from './xlsxSheet'

describe('xlsxSheet', () => {
  it('round-trips a table through write and read', () => {
    const rows = [
      ['Client', 'Name', 'Shirt size'],
      ['Maxtherm & Co', 'Ali <Hassan>', 'L'],
      ['', 'Sara', 'M'],
    ]
    expect(readXlsxRows(writeXlsxRows(rows))).toEqual(rows)
  })

  it('reads shared strings, numbers, gaps and rich text the way Excel saves them', () => {
    const sheet = `<worksheet><sheetData>
      <row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row>
      <row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>42</v></c><c r="C2"><v>32.499999999999996</v></c></row>
      <row r="3"></row>
    </sheetData></worksheet>`
    const shared = `<sst><si><t>Name</t></si><si><r><t>Shoe </t></r><r><t>size</t></r></si><si><t xml:space="preserve"> Ali &amp; Co </t></si></sst>`
    const file = zipSync({
      'xl/worksheets/sheet1.xml': strToU8(sheet),
      'xl/sharedStrings.xml': strToU8(shared),
    })
    expect(readXlsxRows(file)).toEqual([
      ['Name', '', 'Shoe size'],
      ['Ali & Co', '42', '32.5'],
    ])
  })

  it('follows the workbook to its first sheet', () => {
    const file = zipSync({
      'xl/workbook.xml': strToU8('<workbook><sheets><sheet name="Sizes" sheetId="2" r:id="rId7"/></sheets></workbook>'),
      'xl/_rels/workbook.xml.rels': strToU8('<Relationships><Relationship Id="rId7" Target="worksheets/sheet9.xml"/></Relationships>'),
      'xl/worksheets/sheet1.xml': strToU8('<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>wrong</t></is></c></row></sheetData></worksheet>'),
      'xl/worksheets/sheet9.xml': strToU8('<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>right</t></is></c></row></sheetData></worksheet>'),
    })
    expect(readXlsxRows(file)).toEqual([['right']])
  })

  it('explains a file that is not an xlsx', () => {
    expect(() => readXlsxRows(strToU8('Name,Size'))).toThrow(/not a valid/)
  })

  it('turns column letters into indexes', () => {
    expect(columnIndex('A1')).toBe(0)
    expect(columnIndex('Z9')).toBe(25)
    expect(columnIndex('AB12')).toBe(27)
  })
})
