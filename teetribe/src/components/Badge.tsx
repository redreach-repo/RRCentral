import { cn } from '@/lib/cn'

type BadgeProps = {
  children: React.ReactNode
  variant?: 'sticker' | 'teal' | 'outline'
  className?: string
}

export function Badge({ children, variant = 'sticker', className }: BadgeProps) {
  const variants = {
    sticker: 'badge-sticker',
    teal: 'inline-flex items-center rounded-full bg-teal px-3 py-1 text-xs font-bold uppercase tracking-wide text-cream',
    outline: 'inline-flex items-center rounded-full border-2 border-ink px-3 py-1 text-xs font-bold uppercase tracking-wide text-ink',
  }
  return <span className={cn(variants[variant], className)}>{children}</span>
}
