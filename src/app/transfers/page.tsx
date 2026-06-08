'use client'
import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Branch, TransferRow } from '@/types'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { StatusBadge } from '@/components/status-badge'
import { Plus, ArrowLeftRight, ArrowRight } from 'lucide-react'

export default function TransfersPage() {
  const [transfers, setTransfers] = useState<TransferRow[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [branchFilter, setBranchFilter] = useState('all')

  useEffect(() => {
    async function load() {
      const [{ data: t }, { data: b }] = await Promise.all([
        supabase
          .from('transfers')
          .select('id, date, quantity, quantity_returned, notes, from_branch:branches!from_branch_id(id,name), to_branch:branches!to_branch_id(id,name), item:items(id,name,unit,price_per_unit)')
          .order('date', { ascending: false }),
        supabase.from('branches').select('*').order('name'),
      ])
      setTransfers((t as unknown as TransferRow[]) || [])
      setBranches(b || [])
      setLoading(false)
    }
    load()
  }, [])

  const filtered = useMemo(() => {
    return transfers.filter(t => {
      const qty = Number(t.quantity)
      const ret = Number(t.quantity_returned)
      const status = ret >= qty ? 'returned' : ret > 0 ? 'partial' : 'pending'
      if (statusFilter !== 'all' && status !== statusFilter) return false
      if (branchFilter !== 'all') {
        if (t.from_branch?.id !== branchFilter && t.to_branch?.id !== branchFilter) return false
      }
      return true
    })
  }, [transfers, statusFilter, branchFilter])

  return (
    <div className="px-4 py-5 sm:px-8 sm:py-8 max-w-7xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[#111111]">Transfers</h1>
          <p className="text-sm text-[#888888] mt-0.5">{filtered.length} of {transfers.length} transfers</p>
        </div>
        <Link href="/transfers/new" className="hidden sm:block">
          <Button>
            <Plus className="h-4 w-4" />
            New Transfer
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="flex-1 min-w-[140px]">
          <option value="all">All Statuses</option>
          <option value="pending">Outstanding</option>
          <option value="partial">Partial Return</option>
          <option value="returned">Returned</option>
        </Select>
        <Select value={branchFilter} onChange={e => setBranchFilter(e.target.value)} className="flex-1 min-w-[140px]">
          <option value="all">All Branches</option>
          {branches.map(b => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </Select>
        {(statusFilter !== 'all' || branchFilter !== 'all') && (
          <button
            onClick={() => { setStatusFilter('all'); setBranchFilter('all') }}
            className="text-xs text-[#888888] hover:text-[#111111] transition-colors px-2"
          >
            Clear
          </button>
        )}
      </div>

      {loading ? (
        <div className="py-16 text-center text-sm text-[#444444]">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center">
          <ArrowLeftRight className="h-8 w-8 text-[#D1D5DB] mx-auto mb-3" />
          <p className="text-sm text-[#888888]">
            {transfers.length === 0 ? 'No transfers yet.' : 'No transfers match the selected filters.'}
          </p>
          {transfers.length === 0 && (
            <Link href="/transfers/new" className="mt-3 inline-block text-xs text-[#E8231A] hover:underline">Log the first transfer →</Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map(t => {
            const outstanding = Math.max(0, (Number(t.quantity) - Number(t.quantity_returned)) * Number(t.item?.price_per_unit ?? 0))
            return (
              <Link key={t.id} href={`/transfers/${t.id}`}>
                <div className="border border-[#E5E5E5] rounded-xl p-4 bg-white hover:border-[#E8231A]/50 hover:shadow-sm transition-all group cursor-pointer">
                  <div className="flex items-start justify-between mb-3">
                    <span className="text-xs text-[#9CA3AF] font-mono">{formatDate(t.date)}</span>
                    <StatusBadge quantity={Number(t.quantity)} quantityReturned={Number(t.quantity_returned)} />
                  </div>
                  <p className="font-semibold text-[#111111] text-sm mb-0.5">
                    {t.item?.name}
                    <span className="ml-1.5 font-normal text-xs text-[#9CA3AF]">{t.item?.unit}</span>
                  </p>
                  <p className="text-xs text-[#6B7280] font-mono mb-3">
                    {Number(t.quantity)} {t.item?.unit} borrowed
                  </p>
                  <div className="flex items-center gap-1.5 text-xs mb-4">
                    <span className="text-[#6B7280] truncate">{t.from_branch?.name}</span>
                    <ArrowRight className="h-3 w-3 text-[#D1D5DB] shrink-0" />
                    <span className="text-[#111111] font-medium truncate">{t.to_branch?.name}</span>
                  </div>
                  <div className="flex items-center justify-between pt-3 border-t border-[#F0F0F0]">
                    <span className={`font-mono text-sm font-semibold ${outstanding > 0 ? 'text-amber-500' : 'text-green-500'}`}>
                      {formatCurrency(outstanding)}
                    </span>
                    <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#E8231A] text-white text-xs font-medium group-hover:bg-[#f03020] transition-colors">
                      View
                      <ArrowRight className="h-3 w-3" />
                    </span>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
