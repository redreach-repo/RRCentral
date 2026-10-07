import type { Metadata } from 'next'
import { Archivo_Black, Inter } from 'next/font/google'
import { AppProviders } from '@/components/providers/AppProviders'
import { Header } from '@/components/Header'
import { Footer } from '@/components/Footer'
import { Tayo } from '@/components/Tayo'
import './globals.css'

const archivoBlack = Archivo_Black({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-display',
})

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-body',
})

export const metadata: Metadata = {
  title: {
    default: 'Tee Tribe — Premium Tees & Tribe Gear',
    template: '%s | Tee Tribe',
  },
  description: 'Mobile-first UAE storefront for premium tees, limited drops, and custom tribe-made merch.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'),
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${archivoBlack.variable} ${inter.variable} font-sans antialiased`}>
        <AppProviders>
          <Header />
          <main className="min-h-[60vh]">{children}</main>
          <Footer />
          <Tayo />
        </AppProviders>
      </body>
    </html>
  )
}
