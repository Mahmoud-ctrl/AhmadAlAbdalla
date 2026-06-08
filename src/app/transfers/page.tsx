'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeftRight, ArrowRight, Plus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { Branch, TransferRow, TransferStatus } from '@/types'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { StatusBadge } from '@/components/status-badge'

function sentValue(transfer: TransferRow) {
  return transfer.transfer_lines.reduce(
    (sum, line) => sum + Number(line.quantity_sent) * Number(line.unit_price_snapshot),
    0
  )
}

function receivedValue(transfer: TransferRow) {
  return transfer.transfer_lines.reduce(
    (sum, line) => sum + Number(line.quantity_received ?? 0) * Number(line.unit_price_snapshot),
    0
  )
}

function discrepancyValue(transfer: TransferRow) {
  return Math.abs(sentValue(transfer) - receivedValue(transfer))
}

export default function TransfersPage() {
  const [transfers, setTransfers] = useState<TransferRow[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<TransferStatus | 'all'>('all')
  const [branchFilter, setBranchFilter] = useState('all')

  useEffect(() => {
    async function load() {
      const [{ data: transferData }, { data: branchData }] = await Promise.all([
        supabase
          .from('transfers')
          .select('id, status, sent_at, received_at, notes, sender_branch:branches!sender_branch_id(id,name,location), receiver_branch:branches!receiver_branch_id(id,name,location), transfer_lines(id, transfer_id, item_id, quantity_sent, quantity_received, unit_price_snapshot, item:items(id,name,unit,price_per_unit))')
          .order('sent_at', { ascending: false }),
        supabase.from('branches').select('*').order('name'),
      ])

      setTransfers((transferData as unknown as TransferRow[]) ?? [])
      setBranches(branchData ?? [])
      setLoading(false)
    }

    load()
  }, [])

  const filtered = useMemo(() => {
    return transfers.filter(transfer => {
      if (statusFilter !== 'all' && transfer.status !== statusFilter) return false
      if (branchFilter !== 'all') {
        if (transfer.sender_branch?.id !== branchFilter && transfer.receiver_branch?.id !== branchFilter) return false
      }
      return true
    })
  }, [branchFilter, statusFilter, transfers])

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

      <div className="flex flex-wrap gap-2 mb-4">
        <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value as TransferStatus | 'all')} className="flex-1 min-w-[160px]">
          <option value="all">All Statuses</option>
          <option value="pending_receipt">Pending Receipt</option>
          <option value="confirmed">Confirmed</option>
          <option value="needs_admin_review">Needs Review</option>
          <option value="admin_resolved">Admin Resolved</option>
          <option value="cancelled">Cancelled</option>
        </Select>
        <Select value={branchFilter} onChange={e => setBranchFilter(e.target.value)} className="flex-1 min-w-[160px]">
          <option value="all">All Branches</option>
          {branches.map(branch => (
            <option key={branch.id} value={branch.id}>{branch.name}</option>
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
        <div className="py-16 text-center text-sm text-[#444444]">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center">
          <ArrowLeftRight className="h-8 w-8 text-[#D1D5DB] mx-auto mb-3" />
          <p className="text-sm text-[#888888]">
            {transfers.length === 0 ? 'No transfers yet.' : 'No transfers match the selected filters.'}
          </p>
          {transfers.length === 0 && (
            <Link href="/transfers/new" className="mt-3 inline-block text-xs text-[#E8231A] hover:underline">Create the first transfer</Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map(transfer => {
            const lineCount = transfer.transfer_lines.length
            const firstLine = transfer.transfer_lines[0]
            const reviewValue = transfer.status === 'needs_admin_review' ? discrepancyValue(transfer) : 0

            return (
              <Link key={transfer.id} href={`/transfers/${transfer.id}`}>
                <div className="border border-[#E5E5E5] rounded-xl p-4 bg-white hover:border-[#E8231A]/50 hover:shadow-sm transition-all group cursor-pointer">
                  <div className="flex items-start justify-between mb-3">
                    <span className="text-xs text-[#9CA3AF] font-mono">{formatDate(transfer.sent_at)}</span>
                    <StatusBadge status={transfer.status} />
                  </div>
                  <p className="font-semibold text-[#111111] text-sm mb-0.5">
                    {firstLine?.item?.name ?? 'Transfer'}
                    {lineCount > 1 && <span className="ml-1.5 font-normal text-xs text-[#9CA3AF]">+{lineCount - 1} more</span>}
                  </p>
                  <p className="text-xs text-[#6B7280] font-mono mb-3">
                    {lineCount} line{lineCount === 1 ? '' : 's'} sent
                  </p>
                  <div className="flex items-center gap-1.5 text-xs mb-4">
                    <span className="text-[#6B7280] truncate">{transfer.sender_branch?.name}</span>
                    <ArrowRight className="h-3 w-3 text-[#D1D5DB] shrink-0" />
                    <span className="text-[#111111] font-medium truncate">{transfer.receiver_branch?.name}</span>
                  </div>
                  <div className="flex items-center justify-between pt-3 border-t border-[#F0F0F0]">
                    <span className={`font-mono text-sm font-semibold ${reviewValue > 0 ? 'text-red-500' : 'text-[#111111]'}`}>
                      {reviewValue > 0 ? formatCurrency(reviewValue) : formatCurrency(sentValue(transfer))}
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
