export {
  csvRowsToObjects,
  escapeCsvCell,
  parseCsv,
  rowsToCsv,
  validateMappedRows,
  type ColumnMap,
} from './csv'
export { columnMapsToZod, parseListIoRow, parseListIoRows } from './schema'
import { downloadCsv } from '../uiStyles'
import { rowsToCsv } from './csv'

export function exportListCsv(
  filename: string,
  headers: string[],
  rows: Array<Record<string, unknown>>,
): void {
  downloadCsv(filename, rowsToCsv(headers, rows))
}
