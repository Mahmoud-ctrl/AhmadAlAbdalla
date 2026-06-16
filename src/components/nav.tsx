'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeftRight,
  BarChart3,
  Building2,
  Boxes,
  LayoutDashboard,
  LogOut,
  MoreHorizontal,
  Package,
  Plus,
  Users,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAppProfile } from '@/contexts/profile-context'
import { cn } from '@/lib/utils'
import { NotificationBell } from '@/components/notification-bell'
import { useNotifications } from '@/hooks/use-notifications'

const links = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/transfers', label: 'Transfers', icon: ArrowLeftRight },
  { href: '/quantities', label: 'Quantities', icon: Boxes },
  { href: '/branches', label: 'Branches', icon: Building2, adminOnly: true },
  { href: '/items', label: 'Items', icon: Package, adminOnly: true },
  { href: '/report', label: 'Report', icon: BarChart3 },
  { href: '/users', label: 'Users', icon: Users, adminOnly: true },
]

export function Nav() {
  const pathname = usePathname()
  const router = useRouter()
  const profile = useAppProfile()
  const [signingOut, setSigningOut] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)

  const notifs = useNotifications(profile?.id)

  const visibleLinks = useMemo(
    () => links.filter(link => !link.adminOnly || profile?.role === 'super_admin'),
    [profile?.role]
  )

  const primaryLinks = visibleLinks.filter(link => !link.adminOnly)
  const secondaryLinks = visibleLinks.filter(link => link.adminOnly)
  const secondaryActive = secondaryLinks.some(({ href }) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href)
  )

  const roleLabel = profile?.role === 'super_admin' ? 'Super Admin' : 'Branch Manager'
  const displayName = profile?.full_name || profile?.username || 'Manager'
  const branchLabel = profile?.role === 'super_admin' ? 'All branches' : profile?.branch?.name ?? 'No branch assigned'

  async function signOut() {
    setSigningOut(true)
    await supabase.auth.signOut()
    router.replace('/login')
  }

  return (
    <>
      <nav className="hidden lg:flex fixed inset-y-0 left-0 z-40 w-60 flex-col border-r border-[#E5E5E5] bg-[#FAFAFA] print:hidden">
        <div className="px-4 py-4 border-b border-[#E5E5E5]">
          <Image src="/logo.png" alt="Ahmad Al'Abdalla" width={180} height={64} className="object-contain h-12 w-auto" priority />
          <p className="mt-2 px-0.5 text-[10px] text-[#9CA3AF] font-mono">Branch Movement System</p>
        </div>

        <div className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
          {visibleLinks.map(({ href, label, icon: Icon }) => {
            const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-all duration-100',
                  active ? 'bg-[#E8231A]/10 text-[#E8231A] font-medium' : 'text-[#6B7280] hover:text-[#111111] hover:bg-black/5'
                )}
              >
                <Icon className="h-4 w-4 shrink-0" strokeWidth={active ? 2.5 : 1.75} />
                {label}
              </Link>
            )
          })}
        </div>

        <div className="px-3 pb-4">
          <Link href="/transfers/new" className="flex items-center justify-center gap-2 h-9 w-full rounded-md bg-[#E8231A] text-white text-sm font-semibold hover:bg-[#f03020] transition-colors">
            <Plus className="h-4 w-4 text-white" />
            <span className="text-white">New Transfer</span>
          </Link>

          <div className="mt-4 rounded-lg border border-[#E5E5E5] bg-white p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[#111111]">{displayName}</p>
                <p className="mt-0.5 truncate text-xs text-[#888888]">{roleLabel}</p>
                <p className="mt-0.5 truncate text-xs text-[#9CA3AF]">{branchLabel}</p>
              </div>
              <NotificationBell {...notifs} placement="left" />
            </div>
            <button
              type="button"
              onClick={signOut}
              disabled={signingOut}
              className="mt-3 flex h-8 w-full items-center justify-center gap-2 rounded-md border border-[#DADADA] text-xs font-medium text-[#6B7280] transition-colors hover:bg-black/5 hover:text-[#111111] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <LogOut className="h-3.5 w-3.5" />
              {signingOut ? 'Signing out...' : 'Log Out'}
            </button>
          </div>

          <p className="mt-4 px-1 text-[10px] text-[#9CA3AF] font-mono">Ahmad Al Abdalla - Since 1987</p>
        </div>
      </nav>

      <header className="lg:hidden fixed top-0 inset-x-0 z-40 h-14 flex items-center justify-between px-4 bg-white border-b border-[#E5E5E5] print:hidden">
        <Image src="/logo.png" alt="Ahmad Al'Abdalla" width={120} height={40} className="object-contain h-8 w-auto" priority />
        <div className="flex items-center gap-2">
          <Link href="/transfers/new" className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-[#E8231A] text-white text-xs font-semibold hover:bg-[#f03020] transition-colors">
            <Plus className="h-3.5 w-3.5 text-white" />
            <span className="text-white">New Transfer</span>
          </Link>
          <NotificationBell {...notifs} />
          <button
            type="button"
            onClick={signOut}
            disabled={signingOut}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#DADADA] text-[#6B7280] transition-colors hover:bg-black/5 hover:text-[#111111] disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Log out"
            title="Log out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      <AnimatePresence>
        {moreOpen && (
          <>
            <motion.div
              key="backdrop"
              className="lg:hidden fixed inset-0 z-40 print:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={() => setMoreOpen(false)}
            />
            <motion.div
              key="panel"
              className="lg:hidden fixed bottom-14 inset-x-0 z-50 mx-3 mb-2 rounded-xl border border-[#E5E5E5] bg-white shadow-xl overflow-hidden print:hidden"
              initial={{ opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.97 }}
              transition={{ duration: 0.18, ease: [0.25, 0.46, 0.45, 0.94] }}
            >
              {secondaryLinks.map(({ href, label, icon: Icon }) => {
                const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setMoreOpen(false)}
                    className={cn(
                      'flex items-center gap-3 px-5 py-3.5 text-sm font-medium border-b border-[#F0F0F0] last:border-0 transition-colors',
                      active ? 'text-[#E8231A] bg-[#E8231A]/5' : 'text-[#444444] hover:bg-[#F8F8F8]'
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" strokeWidth={active ? 2.5 : 1.75} />
                    {label}
                  </Link>
                )
              })}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-[#E5E5E5] flex print:hidden">
        {primaryLinks.map(({ href, label, icon: Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setMoreOpen(false)}
              className={cn(
                'flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors',
                active ? 'text-[#E8231A]' : 'text-[#9CA3AF]'
              )}
            >
              <Icon className="h-5 w-5" strokeWidth={active ? 2.5 : 1.75} />
              {label}
            </Link>
          )
        })}
        {secondaryLinks.length > 0 && (
          <button
            type="button"
            onClick={() => setMoreOpen(o => !o)}
            className={cn(
              'flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors',
              moreOpen || secondaryActive ? 'text-[#E8231A]' : 'text-[#9CA3AF]'
            )}
          >
            <MoreHorizontal className="h-5 w-5" strokeWidth={moreOpen || secondaryActive ? 2.5 : 1.75} />
            More
          </button>
        )}
      </nav>
    </>
  )
}
