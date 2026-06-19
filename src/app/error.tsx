'use client'

import { useEffect } from 'react'
import { useLanguage } from '@/contexts/language-context'
import { Button } from '@/components/ui/button'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const { t } = useLanguage()

  useEffect(() => {
    console.error('Unhandled app error:', error)
  }, [error])

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4">
      <div className="text-center max-w-sm">
        <p className="text-5xl font-bold font-mono text-[#E8231A] mb-4">500</p>
        <h1 className="text-lg font-semibold text-[#111111] mb-2">{t.errors.title500}</h1>
        <p className="text-sm text-[#888888] mb-6">{t.errors.desc500}</p>
        <Button onClick={reset}>{t.errors.retry}</Button>
      </div>
    </div>
  )
}
