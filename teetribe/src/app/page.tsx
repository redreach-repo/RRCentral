import Link from 'next/link'
import { collections, getActiveDrop, getBestSellers } from '@/data/seed'
import { CollectionTile } from '@/components/CollectionTile'
import { ProductCard } from '@/components/ProductCard'
import { Countdown } from '@/components/Countdown'
import { TribeMemberForm } from '@/components/TribeMemberForm'
import { Badge } from '@/components/Badge'

export default function HomePage() {
  const activeDrop = getActiveDrop()
  const bestSellers = getBestSellers(4)

  return (
    <>
      {/* Hero */}
      <section className="container-site py-12 sm:py-20">
        <div className="max-w-2xl">
          <Badge className="mb-4">New season</Badge>
          <h1 className="font-display text-5xl font-black uppercase leading-[0.95] sm:text-7xl">
            Wear the<br />
            <span className="text-teal">Tribe.</span>
          </h1>
          <p className="mt-6 text-lg text-ink/70 max-w-md">
            Premium oversized tees, limited drops, and custom merch — designed for Gulf life.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/shop" className="btn-primary">Shop all</Link>
            <Link href="/drops" className="btn-secondary">View drops</Link>
          </div>
        </div>

        {activeDrop?.dropClosesAt && (
          <div className="mt-12 rounded-2xl border-2 border-ink bg-ink p-6 text-cream sm:p-8">
            <p className="text-sm font-bold uppercase tracking-wide text-sunshine">Active drop</p>
            <h2 className="mt-2 font-display text-2xl font-black sm:text-3xl">{activeDrop.name}</h2>
            <Countdown target={activeDrop.dropClosesAt} className="mt-4" />
            <Link href={`/product/${activeDrop.slug}`} className="btn-primary mt-6 bg-sunshine text-ink hover:bg-amber">
              Shop drop
            </Link>
          </div>
        )}
      </section>

      {/* Collections */}
      <section className="container-site py-12">
        <h2 className="font-display text-3xl font-black uppercase mb-6">Collections</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {collections.map((c) => (
            <CollectionTile key={c.id} collection={c} />
          ))}
        </div>
      </section>

      {/* Best sellers */}
      <section className="container-site py-12">
        <div className="flex items-end justify-between mb-6">
          <h2 className="font-display text-3xl font-black uppercase">Best sellers</h2>
          <Link href="/shop" className="text-sm font-bold hover:text-teal">View all →</Link>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {bestSellers.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>

      {/* Why strip */}
      <section className="border-y-2 border-ink bg-sunshine py-12">
        <div className="container-site">
          <h2 className="font-display text-3xl font-black uppercase mb-8">Why Tee Tribe</h2>
          <div className="grid gap-6 sm:grid-cols-3">
            {[
              { title: 'Premium cotton', desc: '200–360gsm fabrics built for Gulf heat.' },
              { title: 'Fast UAE delivery', desc: 'Free over AED 200. 1–3 day dispatch.' },
              { title: 'Tribe made', desc: 'Custom merch for teams, events, and crews.' },
            ].map((item) => (
              <div key={item.title} className="rounded-2xl border-2 border-ink bg-cream p-6 shadow-sticker">
                <h3 className="font-display text-lg font-black uppercase">{item.title}</h3>
                <p className="mt-2 text-sm text-ink/70">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Community */}
      <section className="container-site py-12">
        <h2 className="font-display text-3xl font-black uppercase mb-4">Join the community</h2>
        <p className="text-ink/70 mb-6 max-w-lg">10% off your first order. Early access to drops. No spam.</p>
        <TribeMemberForm />
      </section>

      {/* Instagram placeholder */}
      <section className="container-site py-12">
        <h2 className="font-display text-3xl font-black uppercase mb-6">@teetribe</h2>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="aspect-square rounded-xl border-2 border-ink bg-ink/5 flex items-center justify-center text-xs text-ink/40">
              IG
            </div>
          ))}
        </div>
      </section>
    </>
  )
}
