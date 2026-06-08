'use client'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, ArrowLeftRight, Building2, Package, BarChart3, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

const links = [
  { href: '/',          label: 'Dashboard', icon: LayoutDashboard },
  { href: '/transfers', label: 'Transfers',  icon: ArrowLeftRight },
  { href: '/branches',  label: 'Branches',   icon: Building2 },
  { href: '/items',     label: 'Items',      icon: Package },
  { href: '/report',    label: 'Report',     icon: BarChart3 },
]

export function Nav() {
  const pathname = usePathname()

  return (
    <>
      {/* ── Desktop sidebar ───────────────────────────────────────── */}
      <nav className="hidden lg:flex fixed inset-y-0 left-0 z-40 w-60 flex-col border-r border-[#E5E5E5] bg-[#FAFAFA] print:hidden">
        <div className="px-4 py-4 border-b border-[#E5E5E5]">
          <Image src="/logo.png" alt="Ahmad Al'Abdalla" width={180} height={64} className="object-contain h-12 w-auto" priority />
          <p className="mt-2 px-0.5 text-[10px] text-[#9CA3AF] font-mono">Transfer System</p>
        </div>
        <div className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
          {links.map(({ href, label, icon: Icon }) => {
            const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
            return (
              <Link key={href} href={href} className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-all duration-100',
                active ? 'bg-[#E8231A]/10 text-[#E8231A] font-medium' : 'text-[#6B7280] hover:text-[#111111] hover:bg-black/5'
              )}>
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
          <p className="mt-4 px-1 text-[10px] text-[#9CA3AF] font-mono">Ahmad Al Abdalla · Since 1987</p>
        </div>
      </nav>

      {/* ── Mobile top header ─────────────────────────────────────── */}
      <header className="lg:hidden fixed top-0 inset-x-0 z-40 h-14 flex items-center justify-between px-4 bg-white border-b border-[#E5E5E5] print:hidden">
        <Image src="/logo.png" alt="Ahmad Al'Abdalla" width={120} height={40} className="object-contain h-8 w-auto" priority />
        <Link href="/transfers/new" className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-[#E8231A] text-white text-xs font-semibold hover:bg-[#f03020] transition-colors">
          <Plus className="h-3.5 w-3.5 text-white" />
          <span className="text-white">New Transfer</span>
        </Link>
      </header>

      {/* ── Mobile bottom tab bar ─────────────────────────────────── */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-[#E5E5E5] flex print:hidden">
        {links.map(({ href, label, icon: Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
          return (
            <Link key={href} href={href} className={cn(
              'flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors',
              active ? 'text-[#E8231A]' : 'text-[#9CA3AF]'
            )}>
              <Icon className="h-5 w-5" strokeWidth={active ? 2.5 : 1.75} />
              {label}
            </Link>
          )
        })}
      </nav>
    </>
  )
}
