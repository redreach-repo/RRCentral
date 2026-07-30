/** Brand PDF catalogues served from /public/catalogues */
export const BRAND_CATALOGUES = [
  {
    id: 'rr-threads-premium',
    title: 'RR Threads Premium Catalogue',
    divisionCode: '01',
    brand: 'RR Threads',
    description: 'Premium uniforms catalogue — styles, fabrics, and options.',
    fileName: 'RR_Threads_Premium_Catalogue.pdf',
    pages: 29,
  },
] as const

export function catalogueUrl(fileName: string): string {
  const base = import.meta.env.BASE_URL || '/'
  const root = base.endsWith('/') ? base : `${base}/`
  return `${root}catalogues/${fileName}`
}
