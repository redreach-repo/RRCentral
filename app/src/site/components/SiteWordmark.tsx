export default function SiteWordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="site-wordmark">
      <svg width={compact ? 26 : 32} height={compact ? 26 : 32} viewBox="0 0 32 32" aria-hidden>
        <rect width="32" height="32" rx="6" fill="#cf1d23" />
        <path
          d="M9 23V9h7.2c3.2 0 5.2 1.7 5.2 4.4 0 1.9-1.1 3.3-2.8 3.9L22.4 23h-3.6l-3.4-5.4H12.1V23H9zm3.1-8.4h4c1.5 0 2.3-.8 2.3-1.9s-.8-1.9-2.3-1.9h-4v3.8z"
          fill="#fff"
        />
      </svg>
      <span>
        <span className="red">Red</span>
        <span className="reach">Reach</span>
      </span>
    </span>
  )
}
