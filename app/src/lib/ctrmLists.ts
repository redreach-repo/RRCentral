import { DEFAULT_SESSION_TOPICS, SESSION_TOPICS_SETTING } from './ctrmSessions'
import { DEFAULT_FIT_MODULES, FIT_MODULES_SETTING } from './fitSheet'

/** The pick lists used on CTRM Next accounts, kept in app_settings one item per line (Settings → CTRM Next lists). */
export const CTRM_LISTS: { key: string; label: string; fallback: string[] }[] = [
  { key: FIT_MODULES_SETTING, label: 'Fit sheet: modules of interest', fallback: DEFAULT_FIT_MODULES },
  { key: SESSION_TOPICS_SETTING, label: 'Sessions: topics', fallback: DEFAULT_SESSION_TOPICS },
]
