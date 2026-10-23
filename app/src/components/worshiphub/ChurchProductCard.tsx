import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Pencil } from 'lucide-react'
import { useToast } from '../../contexts/ToastContext'
import ChurchDetailsModal from './ChurchDetailsModal'
import ChurchFacts from './ChurchFacts'
import { churchView } from '../../lib/worshiphub'
import { fetchLiveTenants, listChurchProfiles, saveChurchProfile, type ChurchDetailsInput, type LiveResult } from '../../lib/worshiphubStore'
import { errorMessage } from '../../lib/errors'
import type { Account, WorshipChurchProfile } from '../../lib/types'
import { buttonSecondaryStyle, cardStyle, colors, sectionTitleStyle } from '../../lib/uiStyles'

type Props = {
  account: Account
  editable: boolean
  author: { appUserId: string | null; email: string }
  onChanged: () => void
}

/** WorshipHub plan, usage and billing on a church's account page. */
export default function ChurchProductCard({ account, editable, author, onChanged }: Props) {
  const { showToast } = useToast()
  const [profile, setProfile] = useState<WorshipChurchProfile | null>(null)
  const [live, setLive] = useState<LiveResult | null>(null)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const rows = await listChurchProfiles()
      setProfile(rows.find((p) => p.account_id === account.id) ?? null)
    } catch (e) {
      showToast(errorMessage(e, 'Could not load the WorshipHub details'), 'error')
    }
  }, [account.id, showToast])

  useEffect(() => {
    void load()
    void fetchLiveTenants().then(setLive)
  }, [load])

  async function handleSave(values: ChurchDetailsInput) {
    setSaving(true)
    try {
      await saveChurchProfile(account.id, values, profile, author)
      setEditing(false)
      await load()
      onChanged()
    } catch (e) {
      showToast(errorMessage(e, 'Could not save the WorshipHub details'), 'error')
    } finally {
      setSaving(false)
    }
  }

  const slug = profile?.tenant_slug ?? ''
  const tenant = live?.connected && slug ? (live.tenants.find((t) => t.slug === slug) ?? null) : null
  const view = churchView(profile, tenant)
  let status: string
  if (!live) status = 'Checking WorshipHub…'
  else if (!live.connected) status = `Not connected. ${live.message} Showing the details entered by hand.`
  else if (!slug) status = 'Connected. Add the WorshipHub slug to see live details.'
  else if (!tenant) status = `Connected, but WorshipHub has no church with the slug ${slug}. Showing the details entered by hand.`
  else status = 'Live from WorshipHub.'

  return (
    <section style={{ ...cardStyle, marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ ...sectionTitleStyle, margin: 0 }}>WorshipHub</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Link to="/products" style={{ color: colors.muted, fontSize: 12 }}>
            All churches
          </Link>
          {editable ? (
            <button
              type="button"
              style={{ ...buttonSecondaryStyle, padding: '6px 10px', fontSize: 12 }}
              onClick={() => setEditing(true)}
            >
              <Pencil size={13} /> {profile ? 'Edit details' : 'Add details'}
            </button>
          ) : null}
        </div>
      </div>
      <p style={{ fontSize: 12, color: view.source === 'live' ? colors.success : colors.muted2, margin: '8px 0 6px' }}>
        {slug ? `${slug}. ` : ''}
        {status}
      </p>
      {!profile && !tenant ? (
        <p style={{ color: colors.muted, fontSize: 13, margin: 0 }}>
          No WorshipHub details yet. Add the church's slug, plan and renewal date so the team can support it.
        </p>
      ) : (
        <ChurchFacts view={view} />
      )}
      <ChurchDetailsModal
        open={editing}
        onClose={() => setEditing(false)}
        profile={profile}
        saving={saving}
        onSave={(v) => void handleSave(v)}
      />
    </section>
  )
}
