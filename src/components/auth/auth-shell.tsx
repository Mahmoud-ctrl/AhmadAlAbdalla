'use client'

import { ReactNode, useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Nav } from '@/components/nav'

type ShellState = 'checking' | 'auth-route' | 'ready'

const adminOnlyRoutes = ['/branches', '/items', '/users']

function isAdminOnlyRoute(pathname: string) {
  return adminOnlyRoutes.some(route => pathname === route || pathname.startsWith(`${route}/`))
}

export function AuthShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [state, setState] = useState<ShellState>('checking')

  useEffect(() => {
    let cancelled = false

    async function checkAccess() {
      if (cancelled) return

      const loginRoute = pathname === '/login'
      const setupRoute = pathname === '/setup'
      const publicRoute = loginRoute || setupRoute
      setState('checking')

      const { data: sessionResult } = await supabase.auth.getSession()
      const session = sessionResult.session

      if (!session) {
        if (publicRoute) {
          if (!cancelled) setState('auth-route')
          return
        }

        router.replace('/login')
        return
      }

      if (setupRoute) {
        if (!cancelled) setState('auth-route')
        return
      }

      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('id, active, must_change_password, role')
        .eq('id', session.user.id)
        .maybeSingle()

      if (profileError || !profile || !profile.active) {
        await supabase.auth.signOut()
        router.replace('/login?error=unauthorized')
        return
      }

      if (pathname === '/login') {
        router.replace('/')
        return
      }

      const { data: aal, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      const hasAal2 = !aalError && aal.currentLevel === 'aal2'

      if (profile.must_change_password) {
        const factors = await supabase.auth.mfa.listFactors()
        const hasVerifiedMfa = factors.data?.totp.some(factor => factor.status === 'verified') ?? false

        if ((factors.error || hasVerifiedMfa) && !hasAal2) {
          if (pathname !== '/mfa') {
            router.replace('/mfa')
            return
          }

          if (!cancelled) setState('auth-route')
          return
        }

        if (pathname !== '/password') {
          router.replace('/password')
          return
        }

        if (!cancelled) setState('auth-route')
        return
      }

      if (pathname === '/password') {
        router.replace('/mfa')
        return
      }

      if (!hasAal2) {
        if (pathname !== '/mfa') {
          router.replace('/mfa')
          return
        }

        if (!cancelled) setState('auth-route')
        return
      }

      if (pathname === '/mfa') {
        router.replace('/')
        return
      }

      if (isAdminOnlyRoute(pathname) && profile.role !== 'super_admin') {
        router.replace('/')
        return
      }

      if (!cancelled) setState('ready')
    }

    checkAccess()

    const { data: listener } = supabase.auth.onAuthStateChange(() => {
      setTimeout(() => {
        checkAccess()
      }, 0)
    })

    return () => {
      cancelled = true
      listener.subscription.unsubscribe()
    }
  }, [pathname, router])

  if (state === 'checking') {
    return (
      <main className="min-h-screen bg-white flex items-center justify-center px-4">
        <div className="h-8 w-8 rounded-full border-2 border-[#E8231A] border-t-transparent animate-spin" />
      </main>
    )
  }

  if (state === 'auth-route') {
    return <main className="min-h-screen bg-white">{children}</main>
  }

  return (
    <>
      <Nav />
      <main className="pt-14 pb-16 lg:pt-0 lg:pb-0 lg:pl-60 min-h-screen bg-white">
        {children}
      </main>
    </>
  )
}
