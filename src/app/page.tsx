'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatDate } from '@/lib/utils'
import { TransferRow } from '@/types'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/status-badge'
import { ArrowRight, TrendingUp, ArrowLeftRight, Building2, Package, Plus } from 'lucide-react'

type Stats = {
  discrepancy: number
  active: number
  branches: number
  items: number
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats>({ discrepancy: 0, active: 0, branches: 0, items: 0 })
  const [recent, setRecent] = useState<TransferRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [
        { data: allTransfers },
        { data: recentTransfers },
        { count: branchCount },
        { count: itemCount },
      ] = await Promise.all([
        supabase.from('transfers').select('status, transfer_lines(quantity_sent, quantity_received, unit_price_snapshot)'),
        supabase
          .from('transfers')
          .select('id, status, sent_at, sender_branch:branches!sender_branch_id(id,name), receiver_branch:branches!receiver_branch_id(id,name), transfer_lines(id, quantity_sent, quantity_received, unit_price_snapshot, item:items(id,name,unit,price_per_unit))')
          .order('sent_at', { ascending: false })
          .limit(8),
        supabase.from('branches').select('*', { count: 'exact', head: true }),
        supabase.from('items').select('*', { count: 'exact', head: true }),
      ])

      const discrepancy = (allTransfers || []).reduce((sum, t) => {
        const lines = (t.transfer_lines ?? []) as { quantity_sent: number; quantity_received: number | null; unit_price_snapshot: number }[]
        return sum + lines.reduce((lineSum, line) => (
          lineSum + Math.abs((Number(line.quantity_sent) - Number(line.quantity_received ?? 0)) * Number(line.unit_price_snapshot))
        ), 0)
      }, 0)

      const active = (allTransfers || []).filter(t => t.status === 'pending_receipt' || t.status === 'needs_admin_review').length

      setStats({ discrepancy, active, branches: branchCount ?? 0, items: itemCount ?? 0 })
      setRecent((recentTransfers as unknown as TransferRow[]) || [])
      setLoading(false)
    }
    load()
  }, [])

  return (
    <div className="px-4 py-5 sm:px-8 sm:py-8 max-w-7xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-semibold text-[#111111]">Dashboard</h1>
          <p className="text-sm text-[#888888] mt-0.5">Branch movement and receipt overview</p>
        </div>
        <Link href="/transfers/new">
          <Button size="md">
            <Plus className="h-4 w-4" />
            New Transfer
          </Button>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Discrepancy Value"
          value={loading ? '-' : formatCurrency(stats.discrepancy)}
          icon={<TrendingUp className="h-4 w-4" />}
          accent
        />
        <StatCard
          label="Pending / Review"
          value={loading ? '—' : String(stats.active)}
          icon={<ArrowLeftRight className="h-4 w-4" />}
        />
        <StatCard
          label="Branches"
          value={loading ? '—' : String(stats.branches)}
          icon={<Building2 className="h-4 w-4" />}
        />
        <StatCard
          label="Items Tracked"
          value={loading ? '—' : String(stats.items)}
          icon={<Package className="h-4 w-4" />}
        />
      </div>

      {/* Recent Transfers */}
      <Card>
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E5E5]">
          <h2 className="text-sm font-medium text-[#111111]">Recent Transfers</h2>
          <Link href="/transfers">
            <button className="text-xs text-[#888888] hover:text-[#E8231A] transition-colors flex items-center gap-1">
              View all <ArrowRight className="h-3 w-3" />
            </button>
          </Link>
        </div>
        {loading ? (
          <div className="px-6 py-12 text-center text-sm text-[#444444]">Loading...</div>
        ) : recent.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm text-[#888888]">No transfers yet.</p>
            <Link href="/transfers/new" className="mt-3 inline-block text-xs text-[#E8231A] hover:underline">Create the first transfer</Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4">
            {recent.map(t => {
              const transferValue = t.transfer_lines.reduce(
                (sum, line) => sum + Number(line.quantity_sent) * Number(line.unit_price_snapshot),
                0
              )
              const discrepancy = t.transfer_lines.reduce(
                (sum, line) => sum + Math.abs((Number(line.quantity_sent) - Number(line.quantity_received ?? 0)) * Number(line.unit_price_snapshot)),
                0
              )
              const displayValue = t.status === 'needs_admin_review' ? discrepancy : transferValue
              return (
                <Link key={t.id} href={`/transfers/${t.id}`}>
                  <div className="border border-[#E5E5E5] rounded-xl p-4 bg-white hover:border-[#E8231A]/50 hover:shadow-sm transition-all group cursor-pointer">
                    <div className="flex items-start justify-between mb-3">
                      <span className="text-xs text-[#9CA3AF] font-mono">{formatDate(t.sent_at)}</span>
                      <StatusBadge status={t.status} />
                    </div>
                    <p className="font-semibold text-[#111111] text-sm mb-0.5">
                      {t.transfer_lines[0]?.item?.name ?? 'Transfer'}
                      {t.transfer_lines.length > 1 && <span className="ml-1.5 font-normal text-xs text-[#9CA3AF]">+{t.transfer_lines.length - 1} more</span>}
                    </p>
                    <p className="text-xs text-[#6B7280] font-mono mb-3">
                      {t.transfer_lines.length} line{t.transfer_lines.length === 1 ? '' : 's'} sent
                    </p>
                    <div className="flex items-center gap-1.5 text-xs mb-4">
                      <span className="text-[#6B7280]">{t.sender_branch?.name}</span>
                      <ArrowRight className="h-3 w-3 text-[#D1D5DB] shrink-0" />
                      <span className="text-[#111111] font-medium">{t.receiver_branch?.name}</span>
                    </div>
                    <div className="flex items-center justify-between pt-3 border-t border-[#F0F0F0]">
                      <span className={`font-mono text-sm font-semibold ${t.status === 'needs_admin_review' ? 'text-red-500' : 'text-[#111111]'}`}>
                        {formatCurrency(displayValue)}
                      </span>
                      <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#E8231A] text-white text-xs font-medium group-hover:bg-[#f03020] transition-colors">
                        View Transfer
                        <ArrowRight className="h-3 w-3" />
                      </span>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}

function StatCard({
  label, value, icon, accent,
}: {
  label: string
  value: string
  icon: React.ReactNode
  accent?: boolean
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-[#888888] uppercase tracking-wider font-medium">{label}</span>
        <span className={accent ? 'text-[#E8231A]' : 'text-[#444444]'}>{icon}</span>
      </div>
      <div className={`text-2xl font-bold font-mono tabular tracking-tight ${accent ? 'text-[#E8231A]' : 'text-[#111111]'}`}>
        {value}
      </div>
    </Card>
  )
}
