'use client'

import { ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import { Nav } from '@/components/nav'
import { ProfileContext, type AppProfile } from '@/contexts/profile-context'

type ShellState = 'checking' | 'auth-route' | 'ready'

type CachedAuth = {
  profile: AppProfile & { active: boolean; must_change_password: boolean }
  hasAal2: boolean
  requiresMfaFlow: boolean
}

const adminOnlyRoutes = ['/branches', '/items', '/users']

function isAdminOnlyRoute(pathname: string) {
  return adminOnlyRoutes.some(route => pathname === route || pathname.startsWith(`${route}/`))
}

export function AuthShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [state, setState] = useState<ShellState>('checking')
  const [appProfile, setAppProfile] = useState<AppProfile | null>(null)

  const authRef = useRef<CachedAuth | null>(null)
  const authInitialized = useRef(false)
  const pathnameRef = useRef(pathname)
  pathnameRef.current = pathname

  const applyGuard = useCallback((auth: CachedAuth | null, path: string) => {
    const loginRoute = path === '/login'
    const setupRoute = path === '/setup'
    const publicRoute = loginRoute || setupRoute

    if (!auth) {
      if (publicRoute) { setState('auth-route'); return }
      router.replace('/login')
      return
    }

    const { profile, hasAal2, requiresMfaFlow } = auth

    if (setupRoute) { setState('auth-route'); return }
    if (loginRoute) { router.replace('/'); return }

    if (profile.must_change_password) {
      if (requiresMfaFlow && !hasAal2) {
        if (path !== '/mfa') { router.replace('/mfa'); return }
        setState('auth-route'); return
      }
      if (path !== '/password') { router.replace('/password'); return }
      setState('auth-route'); return
    }

    if (path === '/password') { router.replace('/mfa'); return }

    if (!hasAal2) {
      if (path !== '/mfa') { router.replace('/mfa'); return }
      setState('auth-route'); return
    }

    if (path === '/mfa') { router.replace('/'); return }

    if (isAdminOnlyRoute(path) && profile.role !== 'super_admin') {
      router.replace('/'); return
    }

    setState('ready')
  }, [router])

  // Full network check — runs once on mount, then only on auth state changes
  useEffect(() => {
    let cancelled = false
    setState('checking')

    async function fullCheck() {
      const { data: sessionResult } = await supabase.auth.getSession()
      const session = sessionResult.session

      if (cancelled) return

      if (!session) {
        authRef.current = null
        setAppProfile(null)
        authInitialized.current = true
        applyGuard(null, pathnameRef.current)
        return
      }

      const [profileResult, aalResult] = await Promise.all([
        supabase
          .from('user_profiles')
          .select('id, active, must_change_password, role, branch_id, username, full_name, branch:branches(id,name)')
          .eq('id', session.user.id)
          .maybeSingle(),
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      ])

      if (cancelled) return

      const rawProfile = profileResult.data as (AppProfile & { active: boolean; must_change_password: boolean }) | null

      if (!rawProfile || !rawProfile.active) {
        await supabase.auth.signOut()
        router.replace('/login?error=unauthorized')
        return
      }

      const hasAal2 = !aalResult.error && aalResult.data?.currentLevel === 'aal2'

      let requiresMfaFlow = false
      if (rawProfile.must_change_password && !hasAal2) {
        const factors = await supabase.auth.mfa.listFactors()
        if (cancelled) return
        const hasVerifiedMfa = factors.data?.totp.some(f => f.status === 'verified') ?? false
        requiresMfaFlow = factors.error ? true : hasVerifiedMfa
      }

      const cached: CachedAuth = { profile: rawProfile, hasAal2, requiresMfaFlow }
      authRef.current = cached

      setAppProfile({
        id: rawProfile.id,
        role: rawProfile.role,
        branch_id: rawProfile.branch_id,
        username: rawProfile.username,
        full_name: rawProfile.full_name,
        branch: rawProfile.branch,
      })

      authInitialized.current = true
      applyGuard(cached, pathnameRef.current)
    }

    fullCheck()

    const { data: listener } = supabase.auth.onAuthStateChange(() => {
      setTimeout(() => { if (!cancelled) fullCheck() }, 0)
    })

    return () => {
      cancelled = true
      listener.subscription.unsubscribe()
    }
  }, [applyGuard, router])

  // Zero-network route guard — runs on every navigation using cached auth
  useEffect(() => {
    if (authInitialized.current) {
      applyGuard(authRef.current, pathname)
    }
  }, [pathname, applyGuard])

  if (state === 'checking') {
    return (
      <main className="min-h-screen bg-white flex items-center justify-center px-4">
        <div className="h-8 w-8 rounded-full border-2 border-[#E8231A] border-t-transparent animate-spin" />
      </main>
    )
  }

  if (state === 'auth-route') {
    return (
      <main className="min-h-screen bg-white">
        <AnimatePresence mode="wait">
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>
    )
  }

  return (
    <ProfileContext.Provider value={appProfile}>
      <Nav />
      <main className="pt-14 pb-16 lg:pt-0 lg:pb-0 lg:pl-60 min-h-screen bg-white">
        <AnimatePresence mode="wait">
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>
    </ProfileContext.Provider>
  )
}
