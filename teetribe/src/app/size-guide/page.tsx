const rows = [
  { size: 'XS', chest: '86–91', length: '66', shoulder: '42' },
  { size: 'S', chest: '91–96', length: '68', shoulder: '44' },
  { size: 'M', chest: '96–101', length: '70', shoulder: '46' },
  { size: 'L', chest: '101–106', length: '72', shoulder: '48' },
  { size: 'XL', chest: '106–111', length: '74', shoulder: '50' },
  { size: '2XL', chest: '111–116', length: '76', shoulder: '52' },
  { size: '3XL', chest: '116–121', length: '78', shoulder: '54' },
]

export default function SizeGuidePage() {
  return (
    <div className="container-site py-8">
      <h1 className="font-display text-4xl font-black uppercase mb-4">Size Guide</h1>
      <p className="text-ink/70 mb-8 max-w-lg">All measurements in centimetres. Oversized tees — size down for a relaxed fit.</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-2 border-ink rounded-2xl overflow-hidden">
          <thead className="bg-ink text-cream">
            <tr>
              <th className="py-3 px-4 text-left font-bold">Size</th>
              <th className="py-3 px-4 text-left font-bold">Chest</th>
              <th className="py-3 px-4 text-left font-bold">Length</th>
              <th className="py-3 px-4 text-left font-bold">Shoulder</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.size} className="border-t border-ink/10">
                <td className="py-3 px-4 font-semibold">{r.size}</td>
                <td className="py-3 px-4">{r.chest}</td>
                <td className="py-3 px-4">{r.length}</td>
                <td className="py-3 px-4">{r.shoulder}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
