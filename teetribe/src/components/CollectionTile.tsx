import Link from 'next/link'
import type { Collection } from '@/lib/types'
import { cn } from '@/lib/cn'

type CollectionTileProps = {
  collection: Collection
  className?: string
}

export function CollectionTile({ collection, className }: CollectionTileProps) {
  return (
    <Link
      href={`/collections/${collection.slug}`}
      className={cn(
        'group relative flex min-h-[180px] flex-col justify-end overflow-hidden rounded-2xl border-2 border-ink p-6 transition hover:shadow-sticker sm:min-h-[220px]',
        className,
      )}
      style={{ backgroundColor: collection.heroTone }}
    >
      <div className="absolute inset-0 bg-gradient-to-t from-ink/40 to-transparent" />
      <div className="relative z-10">
        <h3 className="font-display text-2xl font-black uppercase text-cream sm:text-3xl">{collection.name}</h3>
        <p className="mt-1 text-sm text-cream/80 line-clamp-2">{collection.description}</p>
        <span className="mt-3 inline-block text-sm font-bold text-sunshine group-hover:underline">Shop →</span>
      </div>
    </Link>
  )
}
