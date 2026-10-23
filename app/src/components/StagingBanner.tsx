/** Shown on every page of the staging copy so nobody mistakes it for the live CRM. */
export default function StagingBanner() {
  return (
    <div
      role="note"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 1000,
        background: '#6d28d9',
        color: '#fff',
        fontSize: 12,
        fontWeight: 600,
        textAlign: 'center',
        padding: '5px 12px',
        letterSpacing: 0.2,
      }}
    >
      STAGING. A test copy with its own database. Nothing you do here changes the live CRM.
    </div>
  )
}
