import { useCallback, useEffect, useState } from 'react'
import { DRIVE_OFF, getDriveStatus, type DriveStatus } from '../lib/googleDrive'

/** Whether Google Drive is connected (asks the google-drive function once per mount). */
export function useDriveStatus(): { status: DriveStatus; loading: boolean; error: string; reload: () => Promise<void> } {
  const [status, setStatus] = useState<DriveStatus>(DRIVE_OFF)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      setStatus(await getDriveStatus())
      setError('')
    } catch (e) {
      setStatus(DRIVE_OFF)
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  return { status, loading, error, reload }
}
