import { MARQUEE_ITEMS } from '../data/verticals'

export default function Marquee() {
  const items = [...MARQUEE_ITEMS, ...MARQUEE_ITEMS]
  return (
    <div className="site-marquee" aria-hidden>
      <div className="site-marquee-track">
        {items.map((item, i) => (
          <span key={`${item}-${i}`}>{item} ·</span>
        ))}
      </div>
    </div>
  )
}
