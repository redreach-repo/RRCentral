import { useCallback, useEffect, useState } from 'react'
import { CreditCard } from 'lucide-react'
import { useToast } from '../contexts/ToastContext'
import EmptyState from '../components/EmptyState'
import { errorMessage } from '../lib/errors'
import {
  getTenantSubscription,
  listHrEmployees,
  transitionTenantSubscription,
  upsertTenantSubscription,
  type TenantSubscription,
} from '../lib/featureSliceStores'
import { SAAS_PLANS, planByKey, seatUsageLabel, seatsOverLimit } from '../lib/saasBillingPlans'
import { buttonPrimaryStyle, buttonSecondaryStyle, cardStyle, colors, selectStyle } from '../lib/uiStyles'
import docsStyles from '../styles/docsList.module.css'

/** M11: HighMast SaaS plan for the tenant (not customer invoices). */
export default function SaasBillingPage() {
  const { showToast } = useToast()
  const [sub, setSub] = useState<TenantSubscription | null>(null)
  const [planKey, setPlanKey] = useState('starter')
  const [activePeople, setActivePeople] = useState(0)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [row, people] = await Promise.all([getTenantSubscription(), listHrEmployees('active')])
      setSub(row)
      setActivePeople(people.length)
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

  async function onSaveTrial() {
    const plan = planByKey(planKey)
    if (!plan) return
    try {
      await upsertTenantSubscription(plan.key, plan.seatsIncluded, 'trialing')
      showToast('Trial plan saved', 'success')
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Could not save subscription'), 'error')
    }
  }

  async function onActivate() {
    try {
      if (!sub) {
        const plan = planByKey(planKey)
        if (!plan) return
        await upsertTenantSubscription(plan.key, plan.seatsIncluded, 'active')
      } else {
        await transitionTenantSubscription('activate')
      }
      showToast('Plan activated', 'success')
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Could not activate'), 'error')
    }
  }

  async function onCancel() {
    try {
      await transitionTenantSubscription('cancel')
      showToast('Subscription canceled', 'success')
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Could not cancel'), 'error')
    }
  }

  const currentPlan = planByKey(sub?.plan_key || planKey)
  const seats = sub?.seats ?? currentPlan?.seatsIncluded ?? 0
  const over = seatsOverLimit(activePeople, seats)

  return (
    <div className={docsStyles.page}>
      <header className={docsStyles.hero}>
        <div>
          <p className={docsStyles.kicker}>SaaS billing</p>
          <h1 className={docsStyles.title}>HighMast plan</h1>
          <p className={docsStyles.subtitle}>
            Tenant subscription for this workspace. Separate from customer invoice Stripe links. Stripe Checkout wiring stays next.
          </p>
        </div>
      </header>

      <div
        style={{
          display: 'grid',
          gap: 12,
          gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 220px), 1fr))',
          marginBottom: 16,
        }}
      >
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

      <div style={{ ...cardStyle, display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <select style={selectStyle} value={planKey} onChange={(e) => setPlanKey(e.target.value)}>
            {SAAS_PLANS.map((p) => (
              <option key={p.key} value={p.key}>
                {p.name}
              </option>
            ))}
          </select>
          <button type="button" style={buttonSecondaryStyle} onClick={() => void onSaveTrial()}>
            Save trial
          </button>
          <button type="button" style={buttonPrimaryStyle} onClick={() => void onActivate()}>
            Activate
          </button>
          {sub && sub.status !== 'canceled' ? (
            <button type="button" style={buttonSecondaryStyle} onClick={() => void onCancel()}>
              Cancel
            </button>
          ) : null}
        </div>

        {loading ? <span style={{ color: colors.muted }}>Loading…</span> : null}
        {!loading && !sub ? (
          <EmptyState icon={<CreditCard size={18} />} title="No plan yet" subtitle="Save a trial or activate a plan." />
        ) : null}
        {sub ? (
          <div style={{ fontSize: 13, color: colors.muted }}>
            Current: <strong style={{ color: colors.text }}>{sub.plan_key}</strong> · {sub.status} ·{' '}
            {seatUsageLabel(activePeople, seats)}
            {sub.current_period_end
              ? ` · period ends ${new Date(sub.current_period_end).toLocaleDateString('en-GB')}`
              : ''}
            {over ? (
              <div style={{ color: colors.warn, marginTop: 6 }}>Active people exceed included seats — upgrade or trim roster.</div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
