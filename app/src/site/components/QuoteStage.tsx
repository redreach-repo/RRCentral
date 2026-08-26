import { useEffect, useState } from 'react'
import { TESTIMONIALS } from '../data/verticals'

export default function QuoteStage() {
  const [index, setIndex] = useState(0)
  const quote = TESTIMONIALS[index]

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const id = window.setInterval(() => {
      setIndex((n) => (n + 1) % TESTIMONIALS.length)
    }, 5600)
    return () => window.clearInterval(id)
  }, [])

  if (!quote) return null

  return (
    <div className="site-quote-stage">
      <div className="site-stars" aria-label={`${quote.rating} stars`}>
        {'★★★★★'.slice(0, quote.rating)}
      </div>
      <blockquote key={quote.name}>
        <p>“{quote.quote}”</p>
        <footer>
          {quote.name}
          <span>{quote.role}</span>
        </footer>
      </blockquote>
      <div className="site-quote-dots" role="tablist" aria-label="Testimonials">
        {TESTIMONIALS.map((t, i) => (
          <button
            key={t.name}
            type="button"
            role="tab"
            aria-selected={i === index}
            className={i === index ? 'on' : ''}
            onClick={() => setIndex(i)}
          />
        ))}
      </div>
    </div>
  )
}
