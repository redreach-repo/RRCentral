import type { Config } from 'tailwindcss'

export default {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        amber: '#E8A317',
        teal: '#0A8A7A',
        sunshine: '#F5C842',
        ink: '#0D0D0D',
        cream: '#FAF7F0',
      },
      fontFamily: {
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
        sans: ['var(--font-body)', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        sticker: '3px 3px 0 0 #0D0D0D',
        'sticker-amber': '3px 3px 0 0 #E8A317',
      },
      maxWidth: {
        site: '1200px',
      },
    },
  },
  plugins: [],
} satisfies Config
