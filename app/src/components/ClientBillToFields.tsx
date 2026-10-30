import type { BillToDraft } from '../lib/clientBillTo'
import { colors, fieldStyle, inputStyle, labelStyle } from '../lib/uiStyles'

/** Address + TRN under the Client field; printed under the client name on the document. */
export default function ClientBillToFields({
  draft,
  onChange,
  client,
  savedClient,
}: {
  draft: BillToDraft
  onChange: (patch: Partial<BillToDraft>) => void
  client: string
  savedClient: boolean
}) {
  const hint = !client.trim()
    ? 'Pick a client to fill these in.'
    : savedClient
      ? 'From the client record. Changes here update the client too.'
      : 'New client. Saving adds them to Clients with these details.'
  return (
    <div
      style={{
        gridColumn: '1 / -1',
        display: 'flex',
        flexWrap: 'wrap',
        gap: 12,
      }}
    >
      <div style={{ ...fieldStyle, flex: '2 1 280px' }}>
        <label style={labelStyle}>Client address</label>
        <textarea
          style={{ ...inputStyle, minHeight: 64, resize: 'vertical', fontFamily: 'inherit' }}
          rows={3}
          value={draft.address}
          placeholder={'Building, office\nP.O. Box, area\nCity, country'}
          onChange={(e) => onChange({ address: e.target.value })}
        />
      </div>
      <div style={{ ...fieldStyle, flex: '1 1 180px' }}>
        <label style={labelStyle}>Client TRN</label>
        <input
          style={inputStyle}
          value={draft.trn}
          inputMode="numeric"
          placeholder="15 digit TRN"
          onChange={(e) => onChange({ trn: e.target.value })}
        />
        <span style={{ fontSize: 12, color: colors.muted2, marginTop: 4 }}>{hint}</span>
      </div>
    </div>
  )
}
