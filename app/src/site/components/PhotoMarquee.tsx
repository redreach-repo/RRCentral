import { siteAsset } from '../assets'

export default function PhotoMarquee({
  files,
  reverse = false,
}: {
  files: readonly string[]
  reverse?: boolean
}) {
  const items = [...files, ...files]
  return (
    <div className={`site-film ${reverse ? 'reverse' : ''}`} aria-hidden>
      <div className="site-film-track">
        {items.map((file, i) => (
          <figure key={`${file}-${i}`}>
            <img src={siteAsset(file)} alt="" />
          </figure>
        ))}
      </div>
    </div>
  )
}
