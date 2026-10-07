export default function ShippingPage() {
  return (
    <div className="container-site py-8 max-w-2xl">
      <h1 className="font-display text-4xl font-black uppercase mb-8">Shipping</h1>
      <div className="space-y-6 text-ink/80">
        <section>
          <h2 className="font-display text-lg font-black uppercase mb-2">UAE delivery</h2>
          <p className="text-sm">We ship to all seven emirates. Standard delivery is AED 15, free on orders over AED 200.</p>
        </section>
        <section>
          <h2 className="font-display text-lg font-black uppercase mb-2">Dispatch time</h2>
          <p className="text-sm">Orders are dispatched within 1–3 business days. You&apos;ll receive a tracking link via email.</p>
        </section>
        <section>
          <h2 className="font-display text-lg font-black uppercase mb-2">International</h2>
          <p className="text-sm">International shipping coming soon. Join the Tribe waitlist to be notified.</p>
        </section>
      </div>
    </div>
  )
}
