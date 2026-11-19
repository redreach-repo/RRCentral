import { useMemo, useState } from 'react'
import { useToast } from '../../../contexts/ToastContext'
import Modal from '../../../components/Modal'
import { errorMessage } from '../../../lib/errors'
import { parseCsv } from '../../../lib/listIo'
import { readXlsxRows, writeXlsxRows } from '../../../lib/xlsxSheet'
import type { UniformStaff } from '../../../lib/clientUniforms/clientUniforms'
import {
  IMPORT_FIELDS,
  UNIFORM_TEMPLATE_EXAMPLE,
  UNIFORM_TEMPLATE_HEADERS,
  findHeaderRow,
  guessMapping,
  importCounts,
  importPayload,
  planUniformImport,
  type ImportField,
  type ImportMapping,
  type ImportStatus,
} from '../../../lib/clientUniforms/uniformImport'
import { importUniformStaff } from '../../../lib/clientUniforms/clientUniformsStore'
import { buttonPrimaryStyle, buttonSecondaryStyle, labelStyle, selectStyle } from '../../../lib/uiStyles'
import docsStyles from '../../../styles/docsList.module.css'

type ClientOpt = { id: string; company_name: string }

const STATUS_LABEL: Record<ImportStatus, string> = {
  new: 'New',
  update: 'Update',
  unchanged: 'No change',
  problem: 'Problem',
}

const STATUS_COLOR: Record<ImportStatus, string> = {
  new: 'var(--success, #15803d)',
  update: 'var(--accent, #2563eb)',
  unchanged: 'var(--muted, #6b7280)',
  problem: 'var(--danger, #b91c1c)',
}

function downloadUniformTemplate(): void {
  const bytes = writeXlsxRows([UNIFORM_TEMPLATE_HEADERS, UNIFORM_TEMPLATE_EXAMPLE], 'Uniform sizes')
  const blob = new Blob([bytes as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'uniform-sizes-template.xlsx'
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

async function readFileRows(file: File): Promise<string[][]> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.xlsx')) return readXlsxRows(new Uint8Array(await file.arrayBuffer()))
  if (name.endsWith('.csv') || name.endsWith('.txt')) {
    const { headers, rows } = parseCsv(await file.text())
    return [headers, ...rows].filter((r) => r.some((c) => String(c).trim()))
  }
  if (name.endsWith('.xls')) throw new Error('This is an old .xls file. In Excel, use File > Save As > Excel Workbook (.xlsx), then upload that.')
  throw new Error('Upload an Excel (.xlsx) or CSV file.')
}

/** Upload client staff sizes from Excel / CSV: match columns, preview, then save. */
export default function UniformImportModal(props: {
  open: boolean
  onClose: () => void
  onDone: () => void
  clients: ClientOpt[]
  existing: UniformStaff[]
  initialClientId?: string
}) {
  const { showToast } = useToast()
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState<string[][]>([])
  const [headerRow, setHeaderRow] = useState(0)
  const [mapping, setMapping] = useState<ImportMapping | null>(null)
  const [defaultClientId, setDefaultClientId] = useState(props.initialClientId || '')
  const [keepOtherColumns, setKeepOtherColumns] = useState(true)
  const [saving, setSaving] = useState(false)

  const headers = rows[headerRow] || []

  const lines = useMemo(
    () =>
      mapping
        ? planUniformImport({
            rows,
            headerRow,
            mapping,
            clients: props.clients,
            existing: props.existing,
            defaultClientId: defaultClientId || undefined,
            keepOtherColumns,
          })
        : [],
    [rows, headerRow, mapping, props.clients, props.existing, defaultClientId, keepOtherColumns],
  )
  const counts = importCounts(lines)
  const toSave = counts.new + counts.update

  function reset() {
    setFileName('')
    setRows([])
    setMapping(null)
  }

  async function onFile(file: File | undefined) {
    if (!file) return
    try {
      const data = await readFileRows(file)
      if (data.length < 2) throw new Error('The file has no rows under the headers.')
      const hr = findHeaderRow(data)
      setRows(data)
      setHeaderRow(hr)
      setMapping(guessMapping(data[hr]))
      setFileName(file.name)
    } catch (e) {
      reset()
      showToast(errorMessage(e, 'Could not read the file'), 'error')
    }
  }

  async function save() {
    setSaving(true)
    try {
      const res = await importUniformStaff(lines.map((l) => ({ ...l, payload: importPayload(l) })))
      showToast(`Added ${res.added}, updated ${res.updated}`, 'success')
      reset()
      props.onDone()
    } catch (e) {
      showToast(errorMessage(e, 'Upload failed. Nothing after the error was saved; fix it and upload again.'), 'error')
    } finally {
      setSaving(false)
    }
  }

  function close() {
    reset()
    props.onClose()
  }

  return (
    <Modal open={props.open} title="Upload sizes from Excel" onClose={close} width={980}>
      <div style={{ display: 'grid', gap: 14 }}>
        <p style={{ margin: 0, fontSize: 13 }}>
          Upload an Excel (.xlsx) or CSV file with one person per row. You can use your own sheet; the columns are matched
          by their headings and you can change the matching below. Uploading the same file again updates people instead
          of adding them twice, and empty cells never wipe a size that is already saved.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <label style={{ ...buttonPrimaryStyle, cursor: 'pointer' }}>
            {fileName ? 'Choose another file' : 'Choose file'}
            <input
              type="file"
              accept=".xlsx,.csv,.xls"
              style={{ display: 'none' }}
              onChange={(e) => {
                void onFile(e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </label>
          <button type="button" style={buttonSecondaryStyle} onClick={downloadUniformTemplate}>
            Download template
          </button>
          {fileName ? <span style={{ fontSize: 13 }}>{fileName}</span> : null}
        </div>

        {mapping ? (
          <>
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))' }}>
              <label style={labelStyle}>
                Client for every row
                <select style={selectStyle} value={defaultClientId} onChange={(e) => setDefaultClientId(e.target.value)}>
                  <option value="">{mapping.client >= 0 ? 'Use the Client column' : 'Pick a client…'}</option>
                  {props.clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.company_name}
                    </option>
                  ))}
                </select>
              </label>
              <label style={labelStyle}>
                Headings are on row
                <select
                  style={selectStyle}
                  value={headerRow}
                  onChange={(e) => {
                    const hr = Number(e.target.value)
                    setHeaderRow(hr)
                    setMapping(guessMapping(rows[hr] || []))
                  }}
                >
                  {rows.slice(0, 10).map((r, i) => (
                    <option key={i} value={i}>
                      {i + 1}: {r.filter(Boolean).slice(0, 4).join(', ')}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p style={{ margin: 0, fontSize: 12 }}>
              When the file has a Client column, that column is used and the client above only fills rows where it is
              blank. Client names must match the clients list.
            </p>

            <fieldset style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
              <legend style={{ fontSize: 13, padding: '0 6px' }}>Match the columns</legend>
              <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))' }}>
                {IMPORT_FIELDS.map((f) => (
                  <label key={f.field} style={labelStyle}>
                    {f.label}
                    {f.field === 'full_name' ? ' *' : ''}
                    <select
                      style={selectStyle}
                      value={mapping[f.field]}
                      onChange={(e) =>
                        setMapping((m) => (m ? { ...m, [f.field as ImportField]: Number(e.target.value) } : m))
                      }
                    >
                      <option value={-1}>Not in file</option>
                      {headers.map((h, i) => (
                        <option key={i} value={i}>
                          {h || `Column ${i + 1}`}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginTop: 10 }}>
                <input type="checkbox" checked={keepOtherColumns} onChange={(e) => setKeepOtherColumns(e.target.checked)} />
                Keep any other columns (e.g. chest, height) in Other sizes
              </label>
            </fieldset>

            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 13 }}>
              <strong>{lines.length} rows:</strong>
              <span style={{ color: STATUS_COLOR.new }}>{counts.new} new</span>
              <span style={{ color: STATUS_COLOR.update }}>{counts.update} to update</span>
              <span style={{ color: STATUS_COLOR.unchanged }}>{counts.unchanged} no change</span>
              <span style={{ color: STATUS_COLOR.problem }}>{counts.problem} with problems (will be skipped)</span>
            </div>

            <div className={docsStyles.tableWrap} style={{ maxHeight: 360, overflow: 'auto' }}>
              <table className={docsStyles.table}>
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Result</th>
                    <th>Client</th>
                    <th>Name</th>
                    <th>Employee no</th>
                    <th>Sizes</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.rowNumber}>
                      <td>{l.rowNumber}</td>
                      <td style={{ color: STATUS_COLOR[l.status] }}>
                        {STATUS_LABEL[l.status]}
                        {l.problem ? <div className={docsStyles.meta}>{l.problem}</div> : null}
                        {l.changes.length ? <div className={docsStyles.meta}>{l.changes.join(', ')}</div> : null}
                      </td>
                      <td>{l.clientName || '—'}</td>
                      <td>{l.values.full_name || '—'}</td>
                      <td>{l.values.employee_code || ''}</td>
                      <td>
                        {[
                          l.values.shirt_size && `Shirt ${l.values.shirt_size}`,
                          l.values.trouser_size && `Trousers ${l.values.trouser_size}`,
                          l.values.jacket_size && `Jacket ${l.values.jacket_size}`,
                          l.values.shoe_size && `Shoes ${l.values.shoe_size}`,
                          l.values.cap_size && `Cap ${l.values.cap_size}`,
                          l.values.other_sizes,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" style={buttonSecondaryStyle} onClick={close}>
            Cancel
          </button>
          <button type="button" style={buttonPrimaryStyle} disabled={!toSave || saving} onClick={() => void save()}>
            {saving ? 'Saving…' : toSave ? `Save ${toSave} ${toSave === 1 ? 'person' : 'people'}` : 'Nothing to save'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
