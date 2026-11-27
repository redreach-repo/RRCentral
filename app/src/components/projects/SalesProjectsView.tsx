import { useState } from 'react'
import { Briefcase } from 'lucide-react'
import EmptyState from '../EmptyState'
import type { DeliveryProject } from '../../lib/opsSliceStores'
import { buttonSecondaryStyle, cardStyle, colors } from '../../lib/uiStyles'
import docsStyles from '../../styles/docsList.module.css'
import ProjectMembersPanel from './ProjectMembersPanel'

/**
 * Projects for a Sales user under the lock: only the projects they are on
 * (the database filters the rows), read only, with no budget, cost, WIP or billing.
 */
export default function SalesProjectsView({ rows, loading }: { rows: DeliveryProject[]; loading: boolean }) {
  const [openId, setOpenId] = useState<string | null>(null)
  const live = rows.filter((p) => !p.deleted_at)
  const open = live.find((p) => p.id === openId) || null

  return (
    <div className={docsStyles.page}>
      <header className={docsStyles.hero}>
        <div>
          <h1 className={docsStyles.title}>
            <Briefcase size={22} style={{ verticalAlign: 'middle', marginRight: 8 }} />
            My projects
          </h1>
          <p className={docsStyles.subtitle}>Projects you have been added to. Ask a manager to add you to another one.</p>
        </div>
      </header>
      <section style={cardStyle}>
        {loading ? (
          <p style={{ color: colors.muted }}>Loading…</p>
        ) : live.length === 0 ? (
          <EmptyState title="No projects yet" subtitle="A manager adds you to a project from the Projects page." />
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
            {live.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  style={buttonSecondaryStyle}
                  aria-expanded={openId === p.id}
                  onClick={() => setOpenId(openId === p.id ? null : p.id)}
                >
                  {p.code || p.id.slice(0, 8)} · {p.name} · {p.status}
                </button>
              </li>
            ))}
          </ul>
        )}
        {open ? (
          <div style={{ marginTop: 12 }}>
            <h3 style={{ fontSize: 14, margin: 0 }}>{open.name}</h3>
            {open.notes ? <p style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{open.notes}</p> : null}
            <ProjectMembersPanel projectId={open.id} canManage={false} />
          </div>
        ) : null}
      </section>
    </div>
  )
}
