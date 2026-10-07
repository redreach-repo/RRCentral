'use client'

import { useEffect, useMemo, useState } from 'react'

type CountdownProps = {
  target: string | Date
  className?: string
}

type TimeLeft = { days: number; hours: number; minutes: number; seconds: number }

function calcTimeLeft(target: Date): TimeLeft | null {
  const diff = target.getTime() - Date.now()
  if (diff <= 0) return null
  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((diff / (1000 * 60)) % 60),
    seconds: Math.floor((diff / 1000) % 60),
  }
}

export function Countdown({ target, className }: CountdownProps) {
  const targetMs = useMemo(
    () => (typeof target === 'string' ? new Date(target).getTime() : target.getTime()),
    [target],
  )
  const [timeLeft, setTimeLeft] = useState<TimeLeft | null>(() => calcTimeLeft(new Date(targetMs)))

  useEffect(() => {
    const id = setInterval(() => setTimeLeft(calcTimeLeft(new Date(targetMs))), 1000)
    return () => clearInterval(id)
  }, [targetMs])

  if (!timeLeft) {
    return <p className={className}>Drop closed</p>
  }

  const units = [
    { label: 'Days', value: timeLeft.days },
    { label: 'Hrs', value: timeLeft.hours },
    { label: 'Min', value: timeLeft.minutes },
    { label: 'Sec', value: timeLeft.seconds },
  ]

  return (
    <div className={className}>
      <div className="flex gap-3 sm:gap-4">
        {units.map((u) => (
          <div key={u.label} className="flex flex-col items-center">
            <span className="font-display text-3xl font-black tabular-nums sm:text-4xl">
              {String(u.value).padStart(2, '0')}
            </span>
            <span className="text-xs font-semibold uppercase tracking-wide text-ink/60">{u.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
