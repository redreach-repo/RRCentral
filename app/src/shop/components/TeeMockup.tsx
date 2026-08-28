import { COLORS, isLightHex, type PrintSpec, type ShopProduct } from '../catalog'

type Props = {
  product: ShopProduct
  colorId?: string
  side?: 'front' | 'back'
  className?: string
}

function printFill(shirtHex: string) {
  return isLightHex(shirtHex) ? '#1a1714' : '#f6f1e8'
}

function Mark({ mark, fill }: { mark: Extract<PrintSpec, { kind: 'mark' }>['mark']; fill: string }) {
  if (mark === 'dot') return <circle cx="50" cy="42" r="7" fill={fill} />
  if (mark === 'line') return <rect x="18" y="40" width="64" height="2.4" rx="1" fill={fill} />
  if (mark === 'circle') return <circle cx="50" cy="42" r="16" fill="none" stroke={fill} strokeWidth="2.2" />
  if (mark === 'cross') {
    return (
      <g fill="none" stroke={fill} strokeWidth="2.4" strokeLinecap="round">
        <path d="M50 22v36" />
        <path d="M38 34h24" />
      </g>
    )
  }
  if (mark === 'pin') {
    return (
      <g fill="none" stroke={fill} strokeWidth="2.2">
        <circle cx="50" cy="34" r="9" />
        <path d="M50 43l0 18" strokeLinecap="round" />
        <circle cx="50" cy="34" r="2.4" fill={fill} stroke="none" />
      </g>
    )
  }
  if (mark === 'sun') {
    return (
      <g fill="none" stroke={fill} strokeWidth="2">
        <circle cx="50" cy="38" r="8" />
        {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
          const a = (deg * Math.PI) / 180
          const x1 = 50 + Math.cos(a) * 12
          const y1 = 38 + Math.sin(a) * 12
          const x2 = 50 + Math.cos(a) * 17
          const y2 = 38 + Math.sin(a) * 17
          return <path key={deg} d={`M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}`} />
        })}
      </g>
    )
  }
  return (
    <g fill="none" stroke={fill} strokeWidth="2.2" strokeLinecap="round">
      <path d="M22 44c8-12 16-12 24 0s16 12 24 0" />
      <path d="M22 52c8-12 16-12 24 0s16 12 24 0" />
    </g>
  )
}

function PrintArt({ print, fill }: { print: PrintSpec; fill: string }) {
  if (print.kind === 'blank') return null
  if (print.kind === 'stack') {
    const size = print.lines.length > 2 ? 13 : 16
    return (
      <text
        x="50"
        y={print.lines.length === 2 ? 36 : 30}
        textAnchor="middle"
        fill={fill}
        fontFamily="'Syne', 'DM Sans', sans-serif"
        fontWeight="800"
        fontSize={size}
        letterSpacing="0.14em"
      >
        {print.lines.map((line, i) => (
          <tspan key={line} x="50" dy={i === 0 ? 0 : size + 4}>
            {line}
          </tspan>
        ))}
      </text>
    )
  }
  if (print.kind === 'script') {
    return (
      <g fill={fill} textAnchor="middle">
        <text x="50" y="44" fontFamily="Georgia, 'Times New Roman', serif" fontStyle="italic" fontSize="13">
          {print.text}
        </text>
        {print.sub ? (
          <text x="50" y="60" fontFamily="'DM Sans', sans-serif" fontSize="7" letterSpacing="0.22em">
            {print.sub.toUpperCase()}
          </text>
        ) : null}
      </g>
    )
  }
  if (print.kind === 'verse') {
    return (
      <g fill={fill} textAnchor="middle">
        <text x="50" y="40" fontFamily="Georgia, serif" fontStyle="italic" fontSize="9">
          {print.text.length > 22 ? (
            <>
              <tspan x="50">{print.text.slice(0, 18).trim()}</tspan>
              <tspan x="50" dy="12">
                {print.text.slice(18).trim()}
              </tspan>
            </>
          ) : (
            print.text
          )}
        </text>
        <text x="50" y="66" fontFamily="'DM Sans', sans-serif" fontSize="7" letterSpacing="0.28em">
          {print.ref.toUpperCase()}
        </text>
      </g>
    )
  }
  if (print.kind === 'lockup') {
    return (
      <g fill={fill} textAnchor="middle">
        <text x="50" y="40" fontFamily="'Syne', sans-serif" fontWeight="800" fontSize="12" letterSpacing="0.16em">
          {print.over}
        </text>
        <text x="50" y="56" fontFamily="'DM Sans', sans-serif" fontSize="8" letterSpacing="0.32em">
          {print.under}
        </text>
      </g>
    )
  }
  return (
    <g>
      <Mark mark={print.mark} fill={fill} />
      {print.caption ? (
        <text
          x="50"
          y="78"
          textAnchor="middle"
          fill={fill}
          fontFamily="'DM Sans', sans-serif"
          fontSize="7"
          letterSpacing="0.22em"
        >
          {print.caption}
        </text>
      ) : null}
    </g>
  )
}

export default function TeeMockup({ product, colorId, side = 'front', className }: Props) {
  const color = COLORS[colorId || product.defaultColor] || COLORS[product.defaultColor]
  const hex = color.hex
  const ink = printFill(hex)
  const shade = isLightHex(hex) ? 'rgba(40,30,20,0.14)' : 'rgba(0,0,0,0.35)'
  const rib = isLightHex(hex) ? '#d9d0c4' : '#0e0e0e'
  const studio =
    product.category === 'christian'
      ? '#ece4d4'
      : product.category === 'one-liners'
        ? '#e7ddd2'
        : product.category === 'minimalist'
          ? '#e4e2dc'
          : '#d9cfc4'

  return (
    <svg
      className={className}
      viewBox="0 0 320 380"
      role="img"
      aria-label={`${product.name} t-shirt in ${color.name}`}
    >
      <rect width="320" height="380" fill={studio} />
      <ellipse cx="160" cy="348" rx="92" ry="10" fill="rgba(40,30,20,0.12)" />
      <path
        d="M104 78c18-22 42-32 56-32s38 10 56 32l28-18 24 38-36 22c6 18 8 38 8 62 0 58-10 118-24 150H132c-14-32-24-92-24-150 0-24 2-44 8-62L80 98l24-38 0 0z"
        fill={hex}
      />
      <path
        d="M104 78c18-22 42-32 56-32s38 10 56 32"
        fill="none"
        stroke={shade}
        strokeWidth="3"
      />
      <path d="M116 86c14-16 28-22 44-22s30 6 44 22" fill={rib} opacity="0.85" />
      <path d="M132 92c8-10 16-14 28-14s20 4 28 14" fill={hex} />
      <path d="M80 98l24-20" stroke={shade} strokeWidth="2" fill="none" />
      <path d="M240 98l-24-20" stroke={shade} strokeWidth="2" fill="none" />
      {side === 'back' ? (
        <g>
          <rect x="148" y="108" width="24" height="8" rx="1" fill={rib} opacity="0.9" />
          <text
            x="160"
            y="115"
            textAnchor="middle"
            fill={ink}
            fontFamily="'Syne', sans-serif"
            fontSize="5"
            fontWeight="700"
            letterSpacing="0.2em"
          >
            TT
          </text>
        </g>
      ) : (
        <svg x="110" y="128" width="100" height="110" viewBox="0 0 100 90">
          <PrintArt print={product.print} fill={ink} />
        </svg>
      )}
    </svg>
  )
}
