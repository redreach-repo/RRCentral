import { LOST_REASONS } from '../../lib/dealRules'
import { fieldStyle, inputStyle, labelStyle, selectStyle } from '../../lib/uiStyles'

/** Why a deal was lost: a reason from the short list, and a note in words. Both are needed. */
export default function LostReasonFields({
  idPrefix,
  code,
  note,
  onChange,
  notePlaceholder = 'What happened, in a sentence',
}: {
  idPrefix: string
  code: string
  note: string
  onChange: (next: { code: string; note: string }) => void
  notePlaceholder?: string
}) {
  return (
    <>
      <div style={{ ...fieldStyle, marginBottom: 12 }}>
        <label style={labelStyle} htmlFor={`${idPrefix}-code`}>
          Why was it lost? *
        </label>
        <select
          id={`${idPrefix}-code`}
          style={selectStyle}
          value={LOST_REASONS.includes(code as (typeof LOST_REASONS)[number]) ? code : ''}
          onChange={(e) => onChange({ code: e.target.value, note })}
        >
          <option value="">Pick a reason…</option>
          {LOST_REASONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>
      <div style={{ ...fieldStyle, marginBottom: 12 }}>
        <label style={labelStyle} htmlFor={`${idPrefix}-note`}>
          Note *
        </label>
        <input
          id={`${idPrefix}-note`}
          style={inputStyle}
          value={note}
          placeholder={notePlaceholder}
          onChange={(e) => onChange({ code, note: e.target.value })}
        />
      </div>
    </>
  )
}
