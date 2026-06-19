'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { translations, type Lang, type Translations } from '@/lib/translations'

type LanguageContextValue = {
  lang: Lang
  setLang: (lang: Lang) => void
  t: Translations
  dir: 'ltr' | 'rtl'
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en')

  useEffect(() => {
    const stored = localStorage.getItem('lang') as Lang | null
    if (stored === 'ar' || stored === 'en') setLangState(stored)
  }, [])

  useEffect(() => {
    const dir = lang === 'ar' ? 'rtl' : 'ltr'
    document.documentElement.lang = lang
    document.documentElement.dir = dir
  }, [lang])

  function setLang(next: Lang) {
    setLangState(next)
    localStorage.setItem('lang', next)
  }

  const dir = lang === 'ar' ? 'rtl' : 'ltr'

  return (
    <LanguageContext.Provider value={{ lang, setLang, t: translations[lang], dir }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLanguage must be used inside LanguageProvider')
  return ctx
}
