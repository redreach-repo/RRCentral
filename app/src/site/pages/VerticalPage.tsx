import { useEffect, useState } from 'react'
import { Navigate, useLocation, useParams } from 'react-router-dom'
import Lightbox from '../components/Lightbox'
import Seo from '../components/Seo'
import { THREAD_LOOKBOOK } from '../assets'
import { webPageJsonLd } from '../data/organization'
import { PLAYBOOKS, playbookByPath, verticalPath } from '../data/playbooks'
import { verticalBySlug, type VerticalSlug } from '../data/verticals'
import {
  AgencyLayout,
  ApparelLayout,
  LearnLayout,
  MedicalLayout,
  TradeLayout,
  TravelLayout,
  VaLayout,
} from './verticalLayouts'

function VerticalAliasRedirect() {
  const { slug } = useParams()
  const next = verticalPath(slug)
  if (!slug || next === '/businesses') return <Navigate to="/businesses" replace />
  return <Navigate to={next} replace />
}

export { VerticalAliasRedirect }

export default function VerticalPage() {
  const { slug: paramSlug } = useParams()
  const { pathname } = useLocation()
  const matched = playbookByPath(pathname)
  const slug = (matched?.slug ?? paramSlug) as VerticalSlug | undefined
  const vertical = verticalBySlug(slug)
  const playbook = slug ? PLAYBOOKS[slug] : undefined
  const [shot, setShot] = useState<number | null>(null)

  useEffect(() => {
    setShot(null)
  }, [slug])

  if (!vertical || !playbook || !slug) return <Navigate to="/" replace />

  const lightboxFiles =
    playbook.layout === 'apparel'
      ? [...THREAD_LOOKBOOK]
      : playbook.layout === 'travel'
        ? playbook.collection.map((item) => item.image).filter((file): file is string => Boolean(file))
        : (vertical.gallery ?? [])

  const Layout =
    playbook.layout === 'agency'
      ? AgencyLayout
      : playbook.layout === 'medical'
        ? MedicalLayout
        : playbook.layout === 'va'
          ? VaLayout
          : playbook.layout === 'travel'
            ? TravelLayout
            : playbook.layout === 'apparel'
              ? ApparelLayout
              : playbook.layout === 'trade'
                ? TradeLayout
                : LearnLayout

  return (
    <div className={`site-vertical site-vertical--${playbook.layout}`}>
      <Seo
        title={vertical.seoTitle}
        description={vertical.seoDescription}
        path={playbook.path}
        image={vertical.image}
        jsonLd={webPageJsonLd(vertical.brand, playbook.path, vertical.seoDescription)}
      />
      <Layout vertical={vertical} playbook={playbook} onOpenShot={setShot} />
      {shot !== null && lightboxFiles.length > 0 && (
        <Lightbox files={lightboxFiles} index={shot} onIndex={setShot} onClose={() => setShot(null)} />
      )}
    </div>
  )
}
