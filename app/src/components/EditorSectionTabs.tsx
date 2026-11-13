import type { CSSProperties } from 'react'

export type EditorSection = 'basics' | 'lines' | 'terms' | 'notes'

const SECTIONS: { id: EditorSection; label: string }[] = [
  { id: 'basics', label: 'Basics' },
  { id: 'lines', label: 'Lines' },
  { id: 'terms', label: 'Terms' },
  { id: 'notes', label: 'Notes' },
]

function barStyle(count: number): CSSProperties {
  return {
    display: 'grid',
    gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))`,
    gap: 4,
    marginBottom: 14,
    paddingBottom: 10,
    borderBottom: '1px solid rgba(255,255,255,0.08)',
  }
}

function tabStyle(active: boolean): CSSProperties {
  return {
    appearance: 'none',
    background: active ? 'rgba(232,93,4,0.12)' : 'transparent',
    border: `1px solid ${active ? 'rgba(232,93,4,0.5)' : 'transparent'}`,
    color: active ? '#fff' : 'rgba(255,255,255,0.55)',
    borderRadius: 8,
    padding: '8px 6px',
    font: 'inherit',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    textAlign: 'center',
    minWidth: 0,
  }
}

type Props = {
  value: EditorSection
  onChange: (next: EditorSection) => void
  /** Hide empty tabs (e.g. invoice Terms only has payment) */
  sections?: EditorSection[]
}

export default function EditorSectionTabs({ value, onChange, sections }: Props) {
  const list = sections
    ? SECTIONS.filter((s) => sections.includes(s.id))
    : SECTIONS

  return (
    <div style={barStyle(list.length)} role="tablist" aria-label="Editor sections">
      {list.map((s) => (
        <button
          key={s.id}
          type="button"
          role="tab"
          aria-selected={value === s.id}
          style={tabStyle(value === s.id)}
          onClick={() => onChange(s.id)}
        >
          {s.label}
        </button>
      ))}
    </div>
  )
}

/** Keep inputs mounted so focus/state survive tab switches. */
export function editorPanelStyle(active: boolean): CSSProperties {
  return active ? {} : { display: 'none' }
}
