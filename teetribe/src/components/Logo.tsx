import Link from 'next/link'
import { cn } from '@/lib/cn'

type LogoProps = {
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

export function Logo({ className, size = 'md' }: LogoProps) {
  const sizes = { sm: 28, md: 36, lg: 48 }
  const h = sizes[size]

  return (
    <Link href="/" className={cn('inline-flex items-center gap-2 group', className)}>
      <svg width={h} height={h} viewBox="0 0 48 48" fill="none" aria-hidden className="shrink-0">
        <path d="M24 4L44 40H4L24 4Z" fill="#E8A317" stroke="#0D0D0D" strokeWidth="2" />
        <path d="M24 12L36 36H12L24 12Z" fill="#0A8A7A" stroke="#0D0D0D" strokeWidth="1.5" />
        <path d="M24 20L28 32H20L24 20Z" fill="#F5C842" stroke="#0D0D0D" strokeWidth="1" />
      </svg>
      <span className="font-display text-xl font-black uppercase tracking-tight text-ink group-hover:text-teal transition-colors sm:text-2xl">
        Tee Tribe
      </span>
    </Link>
  )
}
