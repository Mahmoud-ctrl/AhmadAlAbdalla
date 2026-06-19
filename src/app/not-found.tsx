'use client'

import Link from 'next/link'
import { useLanguage } from '@/contexts/language-context'

export default function NotFound() {
  const { t } = useLanguage()

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4">
      <div className="text-center max-w-sm">
        <p className="text-5xl font-bold font-mono text-[#E8231A] mb-4">404</p>
        <h1 className="text-lg font-semibold text-[#111111] mb-2">{t.errors.title404}</h1>
        <p className="text-sm text-[#888888] mb-6">{t.errors.desc404}</p>
        <Link
          href="/"
          className="inline-flex h-9 items-center justify-center rounded-md bg-[#E8231A] px-5 text-sm font-medium text-white hover:bg-[#f03020] transition-colors"
        >
          {t.errors.backToDashboard}
        </Link>
      </div>
    </div>
  )
}
