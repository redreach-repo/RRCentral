import type { DealStep } from '../lib/dealProgress'
import { colors } from '../lib/uiStyles'

export default function DealProgressStrip({ steps }: { steps: DealStep[] }) {
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 6,
        alignItems: 'center',
        margin: '0 0 14px',
      }}
      aria-label="Deal progress"
    >
      {steps.map((step, i) => (
        <div key={step.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {i > 0 ? (
            <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 12 }} aria-hidden>
              →
            </span>
          ) : null}
          <span
            title={step.detail || step.label}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '4px 9px',
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.02em',
              background: step.done ? 'rgba(232, 93, 4, 0.22)' : 'rgba(255,255,255,0.06)',
              border: `1px solid ${step.done ? 'rgba(232, 93, 4, 0.45)' : 'rgba(255,255,255,0.1)'}`,
              color: step.done ? '#ffd4a8' : colors.muted2,
            }}
          >
            <span
              aria-hidden
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: step.done ? colors.accent : 'rgba(255,255,255,0.25)',
              }}
            />
            {step.label}
          </span>
        </div>
      ))}
    </div>
  )
}
