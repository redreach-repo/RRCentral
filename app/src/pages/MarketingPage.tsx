import { useCallback, useEffect, useState } from 'react'
import { Megaphone } from 'lucide-react'
import { useToast } from '../contexts/ToastContext'
import EmptyState from '../components/EmptyState'
import { errorMessage } from '../lib/errors'
import { createMarketingCampaign, listMarketingCampaigns, type MarketingCampaign } from '../lib/featureSliceStores'
import { buttonPrimaryStyle, cardStyle, colors, inputStyle, labelStyle, selectStyle } from '../lib/uiStyles'
import docsStyles from '../styles/docsList.module.css'

/** M10 first slice: campaign list. */
export default function MarketingPage() {
  const { showToast } = useToast()
  const [rows, setRows] = useState<MarketingCampaign[]>([])
  const [name, setName] = useState('')
  const [channel, setChannel] = useState('email')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setRows(await listMarketingCampaigns())
    } catch (e) {
      showToast(errorMessage(e, 'Could not load campaigns'), 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    void load()
  }, [load])

  async function onAdd(e: React.FormEvent) {
    e.preventDefault()
    try {
      await createMarketingCampaign({ name, channel })
      setName('')
      showToast('Campaign created', 'success')
      await load()
    } catch (err) {
      showToast(errorMessage(err, 'Could not create campaign'), 'error')
    }
  }

  return (
    <div className={docsStyles.page}>
      <header className={docsStyles.hero}>
        <div>
          <p className={docsStyles.kicker}>Marketing · first slice</p>
          <h1 className={docsStyles.title}>Campaigns</h1>
          <p className={docsStyles.subtitle}>Track planned campaigns. Send/automation comes later.</p>
        </div>
      </header>

      <form onSubmit={(e) => void onAdd(e)} style={{ ...cardStyle, marginBottom: 16, display: 'grid', gap: 10, maxWidth: 520 }}>
        <label style={labelStyle}>
          Name
          <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label style={labelStyle}>
          Channel
          <select style={selectStyle} value={channel} onChange={(e) => setChannel(e.target.value)}>
            <option value="email">Email</option>
            <option value="social">Social</option>
            <option value="ads">Ads</option>
            <option value="event">Event</option>
            <option value="other">Other</option>
          </select>
        </label>
        <button type="submit" style={buttonPrimaryStyle}>
          New campaign
        </button>
      </form>

      {loading ? (
        <p style={{ color: colors.muted }}>Loading…</p>
      ) : rows.length === 0 ? (
        <EmptyState icon={<Megaphone size={22} />} title="No campaigns" subtitle="Add a draft to start marketing." />
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {rows.map((r) => (
            <article key={r.id} style={cardStyle}>
              <strong>{r.name}</strong>
              <div style={{ color: colors.muted, fontSize: 13, marginTop: 4 }}>
                {r.channel} · {r.status}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
