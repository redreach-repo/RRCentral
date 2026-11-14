/** Shown on every page of a demo build (gap plan module 4). */
export default function DemoBanner() {
  return (
    <div
      role="note"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 1000,
        background: '#b45309',
        color: '#fff',
        fontSize: 12,
        fontWeight: 600,
        textAlign: 'center',
        padding: '5px 12px',
        letterSpacing: 0.2,
      }}
    >
      DEMO. Made-up companies and people. Nothing is sent: no email, WhatsApp, payments or webhooks leave this demo.
    </div>
  )
}
