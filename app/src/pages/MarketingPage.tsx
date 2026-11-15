import { useCallback, useEffect, useState } from 'react'
import { Megaphone } from 'lucide-react'
import { useToast } from '../contexts/ToastContext'
import EmptyState from '../components/EmptyState'
import { errorMessage } from '../lib/errors'
import {
  createMarketingCampaign,
  listMarketingCampaigns,
  updateMarketingCampaign,
  type MarketingCampaign,
} from '../lib/featureSliceStores'
import {
  createMarketingSegment,
  dryRunCampaignSend,
  listMarketingSegments,
  type MarketingSegment,
} from '../lib/m10m12Stores'
import { buttonPrimaryStyle, buttonSecondaryStyle, cardStyle, colors, inputStyle, labelStyle, selectStyle } from '../lib/uiStyles'
import docsStyles from '../styles/docsList.module.css'

const CHANNELS = ['email', 'social', 'ads', 'event', 'other'] as const
const STATUSES = ['draft', 'scheduled', 'active', 'paused', 'done'] as const

/** M10: campaigns with status, budget, schedule, and consent-aware segments. */
export default function MarketingPage() {
  const { showToast } = useToast()
  const [rows, setRows] = useState<MarketingCampaign[]>([])
  const [segments, setSegments] = useState<MarketingSegment[]>([])
  const [filter, setFilter] = useState('all')
  const [name, setName] = useState('')
  const [channel, setChannel] = useState('email')
  const [budget, setBudget] = useState('')
  const [startsOn, setStartsOn] = useState('')
  const [endsOn, setEndsOn] = useState('')
  const [segmentName, setSegmentName] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [campaigns, segs] = await Promise.all([listMarketingCampaigns(filter), listMarketingSegments()])
      setRows(campaigns)
      setSegments(segs)
    } catch (e) {
      showToast(errorMessage(e, 'Could not load campaigns'), 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast, filter])

  useEffect(() => {
    void load()
  }, [load])

  async function onAdd(e: React.FormEvent) {
    e.preventDefault()
    try {
      await createMarketingCampaign({
        name,
        channel,
        budget_aed: budget ? Number(budget) : null,
        starts_on: startsOn || null,
        ends_on: endsOn || null,
      })
      setName('')
      setBudget('')
      setStartsOn('')
      setEndsOn('')
      showToast('Campaign created', 'success')
      await load()
    } catch (err) {
      showToast(errorMessage(err, 'Could not create campaign'), 'error')
    }
  }

  async function setStatus(id: string, status: string) {
    try {
      await updateMarketingCampaign(id, { status })
      showToast(`Campaign ${status}`, 'success')
      await load()
    } catch (err) {
      showToast(errorMessage(err, 'Could not update status'), 'error')
    }
  }

  async function onAddSegment(e: React.FormEvent) {
    e.preventDefault()
    try {
      await createMarketingSegment({
        name: segmentName,
        filter: { opt_in_only: true, channel: 'email' },
      })
      setSegmentName('')
      showToast('Segment created (opt-in only)', 'success')
      await load()
    } catch (err) {
      showToast(errorMessage(err, 'Could not create segment'), 'error')
    }
  }

  return (
    <div className={docsStyles.page}>
      <header className={docsStyles.hero}>
        <div>
          <p className={docsStyles.kicker}>Marketing</p>
          <h1 className={docsStyles.title}>Campaigns</h1>
          <p className={docsStyles.subtitle}>
            Plan campaigns and opt-in segments. Live ESP send is out of scope; use Dry-run to mark queued recipients locally.
          </p>
        </div>
      </header>

      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>
          Filter
          <select style={selectStyle} value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">All</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>

      <form onSubmit={(e) => void onAdd(e)} style={{ ...cardStyle, marginBottom: 16, display: 'grid', gap: 10, maxWidth: 560 }}>
        <label style={labelStyle}>
          Name
          <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr' }}>
          <label style={labelStyle}>
            Channel
            <select style={selectStyle} value={channel} onChange={(e) => setChannel(e.target.value)}>
              {CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label style={labelStyle}>
            Budget (AED)
            <input style={inputStyle} type="number" min={0} step="0.01" value={budget} onChange={(e) => setBudget(e.target.value)} />
          </label>
          <label style={labelStyle}>
            Starts
            <input style={inputStyle} type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
          </label>
          <label style={labelStyle}>
            Ends
            <input style={inputStyle} type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
          </label>
        </div>
        <button type="submit" style={buttonPrimaryStyle}>
          New campaign
        </button>
      </form>

      <form onSubmit={(e) => void onAddSegment(e)} style={{ ...cardStyle, marginBottom: 16, display: 'grid', gap: 10, maxWidth: 560 }}>
        <strong style={{ fontSize: 14 }}>Segments</strong>
        <p style={{ margin: 0, color: colors.muted, fontSize: 13 }}>
          Default filter is opt-in contacts with email. {segments.length} segment(s) saved.
        </p>
        <label style={labelStyle}>
          Segment name
          <input style={inputStyle} value={segmentName} onChange={(e) => setSegmentName(e.target.value)} required />
        </label>
        <button type="submit" style={buttonSecondaryStyle}>
          New opt-in segment
        </button>
        {segments.length > 0 ? (
          <ul style={{ margin: 0, paddingLeft: 18, color: colors.muted, fontSize: 13 }}>
            {segments.map((s) => (
              <li key={s.id}>
                {s.name}
                {s.filter_json?.opt_in_only ? ' · opt-in' : ''}
              </li>
            ))}
          </ul>
        ) : null}
      </form>

      {loading ? (
        <p style={{ color: colors.muted }}>Loading…</p>
      ) : rows.length === 0 ? (
        <EmptyState icon={<Megaphone size={22} />} title="No campaigns" subtitle="Add a draft to start marketing." />
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {rows.map((r) => (
            <article key={r.id} style={{ ...cardStyle, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <strong>{r.name}</strong>
                <div style={{ color: colors.muted, fontSize: 13, marginTop: 4 }}>
                  {r.channel} · {r.status}
                  {r.budget_aed != null ? ` · AED ${Number(r.budget_aed).toFixed(2)}` : ''}
                </div>
                {(r.starts_on || r.ends_on) && (
                  <div style={{ color: colors.muted2, fontSize: 12, marginTop: 4 }}>
                    {r.starts_on || '—'} → {r.ends_on || '—'}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {r.status === 'draft' ? (
                  <button type="button" style={buttonPrimaryStyle} onClick={() => void setStatus(r.id, 'active')}>
                    Activate
                  </button>
                ) : null}
                {r.status === 'active' ? (
                  <button type="button" style={buttonSecondaryStyle} onClick={() => void setStatus(r.id, 'paused')}>
                    Pause
                  </button>
                ) : null}
                {r.status === 'paused' ? (
                  <button type="button" style={buttonPrimaryStyle} onClick={() => void setStatus(r.id, 'active')}>
                    Resume
                  </button>
                ) : null}
                {r.status !== 'done' ? (
                  <button type="button" style={buttonSecondaryStyle} onClick={() => void setStatus(r.id, 'done')}>
                    Mark done
                  </button>
                ) : null}
                {r.status === 'active' || r.status === 'scheduled' ? (
                  <button
                    type="button"
                    style={buttonSecondaryStyle}
                    onClick={() => {
                      void dryRunCampaignSend(r.id)
                        .then((s) => showToast(`Dry-run: ${s.sent} marked, ${s.skipped} skipped (no ESP)`, 'success'))
                        .catch((err) => showToast(errorMessage(err, 'Dry-run failed'), 'error'))
                    }}
                  >
                    Dry-run send
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
