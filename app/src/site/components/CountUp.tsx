import { useEffect, useRef, useState } from 'react'

export default function CountUp({
  to,
  suffix = '',
}: {
  to: number
  suffix?: string
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const [value, setValue] = useState(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      setValue(to)
      return
    }

    let started = false
    let frame = 0
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || started) return
        started = true
        const start = performance.now()
        const duration = 1100
        const tick = (now: number) => {
          const p = Math.min(1, (now - start) / duration)
          const eased = 1 - (1 - p) ** 3
          setValue(Math.round(to * eased))
          if (p < 1) frame = requestAnimationFrame(tick)
        }
        frame = requestAnimationFrame(tick)
      },
      { threshold: 0.45 },
    )
    io.observe(el)
    return () => {
      io.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [to])

  return (
    <span ref={ref}>
      {value}
      {suffix}
    </span>
  )
}
