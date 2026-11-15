import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { DEMO_ROLES, readDemoRoleOverride, writeDemoRoleOverride, DEMO_ROLE_EVENT } from '../lib/demo/demoRole'
import {
  DEMO_TOUR_EVENT,
  DEMO_TOUR_STEPS,
  markTourStepDone,
  readTourDone,
  resetTourProgress,
  tourProgress,
  type DemoTourStepId,
} from '../lib/demo/demoTour'
import type { UserRole } from '../lib/types'
import styles from './DemoPresenterChrome.module.css'

/** Floating presenter tools — only mounted when VITE_APP_ENV=demo. */
export default function DemoPresenterChrome({ membershipRole }: { membershipRole: UserRole }) {
  const location = useLocation()
  const [open, setOpen] = useState(true)
  const [override, setOverride] = useState<UserRole | null>(() => readDemoRoleOverride())
  const [done, setDone] = useState(() => readTourDone())

  useEffect(() => {
    const syncRole = () => setOverride(readDemoRoleOverride())
    const syncTour = () => setDone(readTourDone())
    window.addEventListener(DEMO_ROLE_EVENT, syncRole)
    window.addEventListener(DEMO_TOUR_EVENT, syncTour)
    return () => {
      window.removeEventListener(DEMO_ROLE_EVENT, syncRole)
      window.removeEventListener(DEMO_TOUR_EVENT, syncTour)
    }
  }, [])

  useEffect(() => {
    const hit = DEMO_TOUR_STEPS.find((s) => location.pathname === s.to || location.pathname.startsWith(`${s.to}/`))
    if (hit && !done.has(hit.id)) {
      setDone(markTourStepDone(hit.id))
    }
  }, [location.pathname, done])

  const progress = tourProgress(done)
  const effective = override ?? membershipRole

  return (
    <div className={styles.wrap} role="region" aria-label="Demo presenter tools">
      <button type="button" className={styles.toggle} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        Demo tour {progress.done}/{progress.total}
      </button>
      {open ? (
        <div className={styles.panel}>
          <p className={styles.eyebrow}>Falcon Bay story</p>
          <ol className={styles.steps}>
            {DEMO_TOUR_STEPS.map((step) => (
              <li key={step.id} className={done.has(step.id) ? styles.stepDone : undefined}>
                <Link
                  to={step.to}
                  onClick={() => setDone(markTourStepDone(step.id as DemoTourStepId))}
                  className={styles.stepLink}
                >
                  <strong>{step.title}</strong>
                  <span>{step.body}</span>
                </Link>
              </li>
            ))}
          </ol>
          <label className={styles.role}>
            <span>Show UI as</span>
            <select
              value={override ?? ''}
              aria-label="Demo role switcher"
              onChange={(e) => {
                const v = e.target.value
                writeDemoRoleOverride(v ? (v as UserRole) : null)
                setOverride(readDemoRoleOverride())
              }}
            >
              <option value="">Signed-in role ({membershipRole})</option>
              {DEMO_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <p className={styles.hint}>
            Shell role now: <strong>{effective}</strong>. Database RLS still uses the signed-in user.
          </p>
          <button
            type="button"
            className={styles.reset}
            onClick={() => {
              resetTourProgress()
              setDone(readTourDone())
            }}
          >
            Reset tour ticks
          </button>
        </div>
      ) : null}
    </div>
  )
}
