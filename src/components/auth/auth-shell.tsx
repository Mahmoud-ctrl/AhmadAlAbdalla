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
}

type RawProfileRow = {
  id: string
  active: boolean
  must_change_password: boolean
  role: AppProfile['role']
  username: string
  full_name: string | null
  branch: { id: string; name: string } | null
  district_manager_branches: { branch: { id: string; name: string } }[] | null
}

const userAdminRoutes = ['/users']
const catalogRoutes = ['/branches', '/items']

function matchesRoute(pathname: string, routes: string[]) {
  return routes.some(route => pathname === route || pathname.startsWith(`${route}/`))
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

    const { profile } = auth

    if (setupRoute) { setState('auth-route'); return }
    if (loginRoute) { router.replace('/'); return }

    if (profile.must_change_password) {
      if (path !== '/password') { router.replace('/password'); return }
      setState('auth-route'); return
    }

    if (path === '/password') { router.replace('/'); return }

    if (matchesRoute(path, userAdminRoutes) && profile.role !== 'super_admin') {
      router.replace('/'); return
    }

    if (
      matchesRoute(path, catalogRoutes) &&
      profile.role !== 'super_admin' &&
      profile.role !== 'district_manager'
    ) {
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

      const profileResult = await supabase
        .from('user_profiles')
        .select('id, active, must_change_password, role, username, full_name, branch:branches!user_profiles_branch_id_fkey(id,name), district_manager_branches(branch:branches(id,name))')
        .eq('id', session.user.id)
        .maybeSingle()

      if (cancelled) return

      const rawProfile = profileResult.data as unknown as RawProfileRow | null

      if (!rawProfile || !rawProfile.active) {
        await supabase.auth.signOut()
        router.replace('/login?error=unauthorized')
        return
      }

      const branches =
        rawProfile.role === 'branch_manager'
          ? (rawProfile.branch ? [rawProfile.branch] : [])
          : rawProfile.role === 'district_manager'
            ? (rawProfile.district_manager_branches ?? []).map(row => row.branch).filter(Boolean)
            : []

      const profile: AppProfile & { active: boolean; must_change_password: boolean } = {
        id: rawProfile.id,
        role: rawProfile.role,
        branches,
        username: rawProfile.username,
        full_name: rawProfile.full_name,
        active: rawProfile.active,
        must_change_password: rawProfile.must_change_password,
      }

      const cached: CachedAuth = { profile }
      authRef.current = cached

      setAppProfile({
        id: profile.id,
        role: profile.role,
        branches: profile.branches,
        username: profile.username,
        full_name: profile.full_name,
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
      <main className="pt-14 pb-16 lg:pt-0 lg:pb-0 lg:ps-60 min-h-screen bg-white">
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
