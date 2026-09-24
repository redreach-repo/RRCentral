import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { VAT_RATE } from './config'
import { parseSupplierInvoiceText, type ParsedSupplierInvoice } from './supplierInvoiceParse'

GlobalWorkerOptions.workerSrc = pdfWorker

/** Extract text from a PDF File / ArrayBuffer using pdf.js. */
export async function extractPdfText(source: File | ArrayBuffer | Uint8Array): Promise<string> {
  const data =
    source instanceof File
      ? new Uint8Array(await source.arrayBuffer())
      : source instanceof ArrayBuffer
        ? new Uint8Array(source)
        : source
  const doc = await getDocument({ data }).promise
  const parts: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    const pageText = content.items
      .map((item) => ('str' in item ? String(item.str || '') : ''))
      .filter(Boolean)
      .join(' ')
    parts.push(pageText)
  }
  await doc.destroy()
  return parts.join('\n')
}

export async function parseSupplierInvoicePdf(
  file: File,
  vatRate = VAT_RATE,
): Promise<ParsedSupplierInvoice> {
  const text = await extractPdfText(file)
  return parseSupplierInvoiceText(text, vatRate)
}
