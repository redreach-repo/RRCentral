const faqs = [
  { q: 'How long does delivery take?', a: 'We dispatch within 1–3 business days. UAE delivery typically takes 1–2 days after dispatch.' },
  { q: 'Do you offer free delivery?', a: 'Yes — free delivery on orders over AED 200 within the UAE.' },
  { q: 'What is your return policy?', a: 'Unworn items with tags attached can be returned within 14 days. Contact us to start a return.' },
  { q: 'How do drops work?', a: 'Limited runs with a countdown timer. Once the drop closes or stock runs out, there\'s no restock.' },
  { q: 'Can I order custom merch?', a: 'Yes! Visit Tribe Made for custom quotes. Minimum order is typically 10 pieces.' },
  { q: 'What sizes do you carry?', a: 'XS through 3XL for most apparel. Check the size guide for measurements.' },
]

export default function FaqPage() {
  return (
    <div className="container-site py-8 max-w-2xl">
      <h1 className="font-display text-4xl font-black uppercase mb-8">FAQ</h1>
      <div className="space-y-4">
        {faqs.map((f) => (
          <details key={f.q} className="rounded-2xl border-2 border-ink p-4 group">
            <summary className="font-semibold cursor-pointer list-none flex justify-between items-center">
              {f.q}
              <span className="text-ink/40 group-open:rotate-45 transition-transform">+</span>
            </summary>
            <p className="mt-3 text-sm text-ink/70">{f.a}</p>
          </details>
        ))}
      </div>
    </div>
  )
}
