export default function SiteWordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="site-wordmark">
      <svg width={compact ? 22 : 28} height={compact ? 22 : 28} viewBox="0 0 32 32" aria-hidden>
        <rect width="32" height="32" rx="8" fill="#e85d04" />
        <path d="M9 23V9h7.4c3.1 0 5.1 1.7 5.1 4.3 0 1.8-1 3.2-2.7 3.8L22.6 23h-3.5l-3.5-5.3H12V23H9zm3-8.3h4.1c1.4 0 2.2-.8 2.2-1.9s-.8-1.9-2.2-1.9H12v3.8z" fill="#fff" />
      </svg>
      Red Reach
    </span>
  )
}
