import type { Metadata } from 'next'
import { DM_Sans, Space_Mono } from 'next/font/google'
import { Nav } from '@/components/nav'
import { Toaster } from 'sonner'
import './globals.css'

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
  display: 'swap',
})

const spaceMono = Space_Mono({
  weight: ['400', '700'],
  subsets: ['latin'],
  variable: '--font-space-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Al Abdalla Transfer System',
  description: 'Inter-branch item transfer management',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${dmSans.variable} ${spaceMono.variable}`}>
        <Nav />
        <main className="pt-14 pb-16 lg:pt-0 lg:pb-0 lg:pl-60 min-h-screen bg-white">
          {children}
        </main>
        <Toaster
          theme="dark"
          position="bottom-right"
          toastOptions={{
            style: {
              background: '#111111',
              border: '1px solid #222222',
              color: '#ffffff',
            },
          }}
        />
      </body>
    </html>
  )
}
