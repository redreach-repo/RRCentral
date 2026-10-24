const ICON_URL = `${import.meta.env.BASE_URL}worshiphub-icon.png`

/** WorshipHub app icon, sized like the lucide icons it sits beside in the nav. */
export function WorshipHubIcon({ size = 18 }: { size?: number; strokeWidth?: number }) {
  return (
    <img
      src={ICON_URL}
      alt=""
      width={size}
      height={size}
      style={{ borderRadius: Math.round(size / 4.5), flexShrink: 0, display: 'block' }}
    />
  )
}
