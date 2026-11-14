import { useCallback, useEffect, useState } from 'react'
import { CreditCard } from 'lucide-react'
import { useToast } from '../contexts/ToastContext'
import EmptyState from '../components/EmptyState'
import { errorMessage } from '../lib/errors'
import { getTenantSubscription, upsertTenantSubscription, type TenantSubscription } from '../lib/featureSliceStores'
import { SAAS_PLANS, planByKey } from '../lib/saasBillingPlans'
import { buttonPrimaryStyle, cardStyle, colors, selectStyle } from '../lib/uiStyles'
import docsStyles from '../styles/docsList.module.css'

/** M11 first slice: HighMast SaaS plan for the tenant (not customer invoices). */
export default function SaasBillingPage() {
  const { showToast } = useToast()
  const [sub, setSub] = useState<TenantSubscription | null>(null)
  const [planKey, setPlanKey] = useState('starter')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const row = await getTenantSubscription()
      setSub(row)
      if (row) setPlanKey(row.plan_key)
    } catch (e) {
      showToast(errorMessage(e, 'Could not load subscription'), 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    void load()
  }, [load])

  async function onSave() {
    const plan = planByKey(planKey)
    if (!plan) return
    try {
      await upsertTenantSubscription(plan.key, plan.seatsIncluded)
      showToast('Subscription saved (trialing)', 'success')
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Could not save subscription'), 'error')
    }
  }

  return (
    <div className={docsStyles.page}>
      <header className={docsStyles.hero}>
        <div>
          <p className={docsStyles.kicker}>SaaS billing · first slice</p>
          <h1 className={docsStyles.title}>HighMast plan</h1>
          <p className={docsStyles.subtitle}>
            Tenant subscription for this workspace. Separate from customer invoice Stripe links.
          </p>
        </div>
      </header>

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 220px), 1fr))', marginBottom: 16 }}>
        {SAAS_PLANS.map((p) => (
          <article key={p.key} style={{ ...cardStyle, borderColor: planKey === p.key ? colors.accent : undefined }}>
            <strong>{p.name}</strong>
            <div style={{ fontSize: 22, margin: '8px 0' }}>AED {p.monthlyAed}</div>
            <div style={{ color: colors.muted, fontSize: 13 }}>{p.seatsIncluded} seats</div>
            <ul style={{ margin: '10px 0 0', paddingInlineStart: 18, color: colors.muted, fontSize: 13 }}>
              {p.features.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            <button type="button" style={{ ...buttonPrimaryStyle, marginTop: 12 }} onClick={() => setPlanKey(p.key)}>
              Select
            </button>
          </article>
        ))}
      </div>

      <div style={{ ...cardStyle, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <select style={selectStyle} value={planKey} onChange={(e) => setPlanKey(e.target.value)}>
          {SAAS_PLANS.map((p) => (
            <option key={p.key} value={p.key}>
              {p.name}
            </option>
          ))}
        </select>
        <button type="button" style={buttonPrimaryStyle} onClick={() => void onSave()}>
          Save trial plan
        </button>
        {loading ? <span style={{ color: colors.muted }}>Loading…</span> : null}
        {!loading && !sub ? (
          <EmptyState icon={<CreditCard size={18} />} title="No plan yet" subtitle="Save a trial plan for this tenant." />
        ) : null}
        {sub ? (
          <span style={{ color: colors.muted, fontSize: 13 }}>
            Current: {sub.plan_key} · {sub.status} · {sub.seats} seats
          </span>
        ) : null}
      </div>
    </div>
  )
}
