import { useEffect } from 'react'
import { siteAsset } from '../assets'
import { DEFAULT_OG_IMAGE, publicUrl, type SeoInput } from '../data/seo'
import { SITE } from '../data/verticals'

function upsertMeta(attr: 'name' | 'property', key: string, content: string) {
  const selector = `meta[${attr}="${key}"]`
  let el = document.head.querySelector(selector) as HTMLMetaElement | null
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

function upsertLink(rel: string, href: string) {
  let el = document.head.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', rel)
    document.head.appendChild(el)
  }
  el.setAttribute('href', href)
}

export default function Seo({ title, description, path = '/', image = DEFAULT_OG_IMAGE, jsonLd }: SeoInput) {
  useEffect(() => {
    const previous = document.title
    document.title = title
    const url = publicUrl(path)
    const host = SITE.publicOrigin.replace(/\/RRCentral\/?$/, '')
    const imageUrl = image.startsWith('http') ? image : `${host}${siteAsset(image)}`

    upsertMeta('name', 'description', description)
    upsertMeta('property', 'og:title', title)
    upsertMeta('property', 'og:description', description)
    upsertMeta('property', 'og:type', 'website')
    upsertMeta('property', 'og:url', url)
    upsertMeta('property', 'og:image', imageUrl)
    upsertMeta('property', 'og:site_name', SITE.name)
    upsertMeta('name', 'twitter:card', 'summary_large_image')
    upsertMeta('name', 'twitter:title', title)
    upsertMeta('name', 'twitter:description', description)
    upsertLink('canonical', url)

    let script = document.getElementById('site-jsonld') as HTMLScriptElement | null
    const payload = jsonLd ? JSON.stringify(jsonLd) : ''
    if (payload) {
      if (!script) {
        script = document.createElement('script')
        script.id = 'site-jsonld'
        script.type = 'application/ld+json'
        document.head.appendChild(script)
      }
      script.textContent = payload
    } else if (script) {
      script.remove()
    }

    return () => {
      document.title = previous
    }
  }, [title, description, path, image, jsonLd])

  return null
}
