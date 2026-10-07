'use client'

import { X } from 'lucide-react'
import { cn } from '@/lib/cn'

type SizeGuideDrawerProps = {
  open: boolean
  onClose: () => void
}

const rows = [
  { size: 'XS', chest: '86–91', length: '66' },
  { size: 'S', chest: '91–96', length: '68' },
  { size: 'M', chest: '96–101', length: '70' },
  { size: 'L', chest: '101–106', length: '72' },
  { size: 'XL', chest: '106–111', length: '74' },
  { size: '2XL', chest: '111–116', length: '76' },
  { size: '3XL', chest: '116–121', length: '78' },
]

export function SizeGuideDrawer({ open, onClose }: SizeGuideDrawerProps) {
  return (
    <>
      <div
        className={cn('fixed inset-0 z-50 bg-ink/40 transition-opacity', open ? 'opacity-100' : 'pointer-events-none opacity-0')}
        onClick={onClose}
        aria-hidden
      />
      <div
        className={cn(
          'fixed bottom-0 left-0 right-0 z-50 max-h-[80vh] overflow-y-auto rounded-t-2xl border-2 border-ink bg-cream p-6 transition-transform sm:left-auto sm:right-4 sm:top-4 sm:bottom-4 sm:max-w-md sm:rounded-2xl',
          open ? 'translate-y-0' : 'translate-y-full sm:translate-y-0 sm:translate-x-full',
        )}
        role="dialog"
        aria-label="Size guide"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-xl font-black uppercase">Size Guide</h2>
          <button type="button" onClick={onClose} className="rounded-full p-2 hover:bg-ink/5" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-4 text-sm text-ink/70">Measurements in cm. Oversized tees — size down for a relaxed fit.</p>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-ink text-left">
              <th className="py-2 font-bold">Size</th>
              <th className="py-2 font-bold">Chest</th>
              <th className="py-2 font-bold">Length</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.size} className="border-b border-ink/10">
                <td className="py-2 font-semibold">{r.size}</td>
                <td className="py-2">{r.chest}</td>
                <td className="py-2">{r.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
