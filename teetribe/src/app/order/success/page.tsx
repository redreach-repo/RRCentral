import Link from 'next/link'
import { ClearCartOnSuccess } from '@/components/ClearCartOnSuccess'

type Props = { searchParams: Promise<{ mock?: string; order?: string; email?: string }> }

export default async function OrderSuccessPage({ searchParams }: Props) {
  const params = await searchParams
  const isMock = params.mock === '1'

  return (
    <div className="container-site py-16 text-center max-w-lg mx-auto">
      <ClearCartOnSuccess />
      <div className="rounded-2xl border-2 border-ink bg-sunshine p-8 shadow-sticker">
        <h1 className="font-display text-3xl font-black uppercase">Order confirmed!</h1>
        {params.order && <p className="mt-4 font-semibold">Order #{params.order}</p>}
        {params.email && <p className="mt-2 text-sm text-ink/70">Confirmation sent to {params.email}</p>}
        {isMock && <p className="mt-2 text-xs text-ink/50">(Mock checkout — no payment processed)</p>}
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link href="/order/track" className="btn-primary">Track order</Link>
          <Link href="/shop" className="btn-secondary">Continue shopping</Link>
        </div>
      </div>
    </div>
  )
}
