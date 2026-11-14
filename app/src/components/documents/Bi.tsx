import { arabicFor, ARABIC_FONT_STACK } from '../../lib/bilingualDocs/arabicLabels'
import { useBilingual } from './bilingualContext'

/**
 * A fixed document label. In bilingual mode it prints "English · العربية"
 * (or the Arabic on its own line with `stack`),
 * with the Arabic marked lang="ar" dir="rtl" so the browser shapes it (the
 * PDF is drawn from the rendered page, so the PDF gets the same shaping).
 * Labels without a known Arabic stay English only.
 */
export default function Bi({ en, sep = ' · ', stack = false }: { en: string; sep?: string; stack?: boolean }) {
  const on = useBilingual()
  const ar = on ? arabicFor(en) : ''
  if (!ar) return <>{en}</>
  return (
    <>
      {en}
      {stack ? null : sep}
      <span lang="ar" dir="rtl" style={{ display: stack ? 'block' : undefined, fontFamily: ARABIC_FONT_STACK, letterSpacing: 0, textTransform: 'none', unicodeBidi: 'isolate' }}>
        {ar}
      </span>
    </>
  )
}
