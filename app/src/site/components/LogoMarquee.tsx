import { siteAsset } from '../assets'

export default function LogoMarquee({ files }: { files: readonly string[] }) {
  const items = [...files, ...files]
  return (
    <div className="site-logo-marquee" aria-label="Trusted by">
      <div className="site-logo-marquee-track">
        {items.map((file, i) => (
          <img key={`${file}-${i}`} src={siteAsset(file)} alt="" />
        ))}
      </div>
    </div>
  )
}
