import { jsPDF } from 'jspdf'
import type { AgreementBlock } from './serviceAgreement'

const INK: [number, number, number] = [20, 20, 20]
const MUTED: [number, number, number] = [110, 110, 110]
const WARN: [number, number, number] = [176, 40, 20]

/**
 * Draw the filled agreement as a text A4 PDF (selectable, searchable),
 * with page numbers and the template version on every page.
 */
export function agreementPdf(
  blocks: AgreementBlock[],
  opts: { footer: string; draft: boolean; providerName: string; clientName: string; clientSignatory: string },
): Blob {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true })
  const W = 210
  const H = 297
  const M = 20
  const width = W - 2 * M
  const bottom = H - 22
  let y = M
  const color = (c: [number, number, number]) => pdf.setTextColor(c[0], c[1], c[2])

  const banner = () => {
    if (!opts.draft) return
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(9)
    color(WARN)
    pdf.text('DRAFT. This template has not been approved by a lawyer yet. Do not send for signature.', W / 2, 12, {
      align: 'center',
    })
  }
  const room = (needed: number) => {
    if (y + needed <= bottom) return
    pdf.addPage('a4', 'portrait')
    y = M
    banner()
  }
  const write = (text: string, size: number, style: 'normal' | 'bold', gap: number, indent = 0, bullet = false) => {
    pdf.setFont('helvetica', style)
    pdf.setFontSize(size)
    color(INK)
    const lineH = size * 0.42
    const lines = pdf.splitTextToSize(text, width - indent) as string[]
    for (let i = 0; i < lines.length; i++) {
      room(lineH)
      if (bullet && i === 0) pdf.text('•', M + indent - 4, y + lineH * 0.8)
      pdf.text(lines[i], M + indent, y + lineH * 0.8)
      y += lineH
    }
    y += gap
  }

  banner()
  for (const b of blocks) {
    if (b.kind === 'title') {
      write(b.text, 18, 'bold', 4)
    } else if (b.kind === 'heading') {
      room(16)
      y += 3
      write(b.text, 11.5, 'bold', 1.5)
    } else if (b.kind === 'bullet') {
      write(b.text, 10, 'normal', 1.2, 6, true)
    } else if (b.kind === 'paragraph') {
      write(b.text, 10, 'normal', 2)
    } else {
      room(62)
      y += 6
      const colW = (width - 10) / 2
      const parties = [
        { who: `For ${opts.providerName}`, name: '' },
        { who: `For ${opts.clientName}`, name: opts.clientSignatory },
      ]
      parties.forEach((p, i) => {
        const x = M + i * (colW + 10)
        let yy = y
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(10)
        color(INK)
        const who = pdf.splitTextToSize(p.who, colW) as string[]
        pdf.text(who, x, yy + 4)
        yy += who.length * 4.4 + 4
        pdf.setFont('helvetica', 'normal')
        pdf.setFontSize(9)
        for (const label of ['Name', 'Title', 'Signature', 'Date']) {
          yy += 9
          pdf.setDrawColor(150, 150, 150)
          pdf.line(x + 20, yy, x + colW, yy)
          color(MUTED)
          pdf.text(label, x, yy - 1)
          if (label === 'Name' && p.name) {
            color(INK)
            pdf.text(pdf.splitTextToSize(p.name, colW - 22)[0] as string, x + 21, yy - 1.5)
          }
        }
      })
      y += 58
    }
  }

  const pages = pdf.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    pdf.setPage(i)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8)
    color(opts.draft ? WARN : MUTED)
    pdf.text(opts.footer, M, H - 10)
    color(MUTED)
    pdf.text(`Page ${i} of ${pages}`, W - M, H - 10, { align: 'right' })
    pdf.text('Initials: ______  ______', W - M, H - 15, { align: 'right' })
  }
  return pdf.output('blob')
}
