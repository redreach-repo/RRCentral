import Link from 'next/link'
import { TribeMemberForm } from '@/components/TribeMemberForm'

export default function FamilyPage() {
  return (
    <div className="container-site py-8">
      <h1 className="font-display text-4xl font-black uppercase">Tribe Family</h1>
      <p className="mt-4 max-w-lg text-ink/70">
        Our community of wearers, makers, and dreamers. Join for early drop access, member pricing, and the occasional surprise.
      </p>
      <div className="mt-12 max-w-lg">
        <TribeMemberForm />
      </div>
      <div className="mt-16 grid gap-6 sm:grid-cols-3">
        {[
          { title: '10% off first order', desc: 'Automatic discount code on signup.' },
          { title: 'Early drop access', desc: 'Shop limited runs before they go public.' },
          { title: 'Birthday surprise', desc: 'Something special on your day.' },
        ].map((b) => (
          <div key={b.title} className="rounded-2xl border-2 border-ink p-6 shadow-sticker">
            <h3 className="font-display font-black uppercase">{b.title}</h3>
            <p className="mt-2 text-sm text-ink/70">{b.desc}</p>
          </div>
        ))}
      </div>
      <Link href="/shop" className="btn-primary mt-12 inline-flex">Start shopping</Link>
    </div>
  )
}
