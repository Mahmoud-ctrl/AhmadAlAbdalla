'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeftRight, ArrowRight, ChevronLeft, ChevronRight, LayoutGrid, Plus, Table2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatDate } from '@/lib/utils'
import { fetchBranches } from '@/lib/data-cache'
import type { Branch, TransferRow, TransferStatus } from '@/types'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Select } from '@/components/ui/select'
import { StatusBadge } from '@/components/status-badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

const pageSize = 12

type ViewMode = 'grid' | 'table'

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
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [page, setPage] = useState(1)
  const [selectedTransfer, setSelectedTransfer] = useState<TransferRow | null>(null)

  useEffect(() => {
    async function load() {
      const [{ data: transferData }, branchData] = await Promise.all([
        supabase
          .from('transfers')
          .select('id, status, sent_at, received_at, notes, sender_branch:branches!sender_branch_id(id,name,location), receiver_branch:branches!receiver_branch_id(id,name,location), transfer_lines(id, transfer_id, item_id, quantity_sent, quantity_received, unit_price_snapshot, item:items(id,name,unit,price_per_unit))')
          .order('sent_at', { ascending: false }),
        fetchBranches(),
      ])

      setTransfers((transferData as unknown as TransferRow[]) ?? [])
      setBranches(branchData)
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

  useEffect(() => {
    setPage(1)
  }, [branchFilter, statusFilter])

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, pageCount)
  const pageStart = (safePage - 1) * pageSize
  const paginated = filtered.slice(pageStart, pageStart + pageSize)
  const rangeStart = filtered.length === 0 ? 0 : pageStart + 1
  const rangeEnd = Math.min(pageStart + pageSize, filtered.length)

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
        <div className="flex h-9 rounded-md border border-[#DADADA] bg-white p-0.5">
          <button
            type="button"
            onClick={() => setViewMode('grid')}
            className={`inline-flex items-center gap-1.5 rounded px-3 text-xs font-medium transition-colors ${viewMode === 'grid' ? 'bg-[#111111] text-white' : 'text-[#6B7280] hover:text-[#111111]'}`}
            aria-pressed={viewMode === 'grid'}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            Grid
          </button>
          <button
            type="button"
            onClick={() => setViewMode('table')}
            className={`inline-flex items-center gap-1.5 rounded px-3 text-xs font-medium transition-colors ${viewMode === 'table' ? 'bg-[#111111] text-white' : 'text-[#6B7280] hover:text-[#111111]'}`}
            aria-pressed={viewMode === 'table'}
          >
            <Table2 className="h-3.5 w-3.5" />
            Table
          </button>
        </div>
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
      ) : viewMode === 'table' ? (
        <>
          <div className="rounded-xl border border-[#E5E5E5] bg-white overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sent Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Route</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead className="text-right">Sent Value</TableHead>
                  <TableHead className="text-right">Discrepancy</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.map(transfer => {
                  const lineCount = transfer.transfer_lines.length
                  const firstLine = transfer.transfer_lines[0]
                  const reviewValue = transfer.status === 'needs_admin_review' ? discrepancyValue(transfer) : 0

                  return (
                    <TableRow key={transfer.id}>
                      <TableCell className="font-mono text-xs text-[#6B7280]">{formatDate(transfer.sent_at)}</TableCell>
                      <TableCell><StatusBadge status={transfer.status} /></TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 text-xs">
                          <span className="max-w-[130px] truncate text-[#6B7280]">{transfer.sender_branch?.name}</span>
                          <ArrowRight className="h-3 w-3 text-[#D1D5DB] shrink-0" />
                          <span className="max-w-[130px] truncate font-medium text-[#111111]">{transfer.receiver_branch?.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm font-medium text-[#111111]">
                          {firstLine?.item?.name ?? 'Transfer'}
                          {lineCount > 1 && <span className="ml-1.5 font-normal text-xs text-[#9CA3AF]">+{lineCount - 1} more</span>}
                        </p>
                        <p className="text-xs text-[#888888]">{lineCount} line{lineCount === 1 ? '' : 's'}</p>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">{formatCurrency(sentValue(transfer))}</TableCell>
                      <TableCell className={`text-right font-mono text-xs ${reviewValue > 0 ? 'text-red-500' : 'text-[#888888]'}`}>
                        {formatCurrency(reviewValue)}
                      </TableCell>
                      <TableCell className="text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedTransfer(transfer)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-[#E8231A] hover:underline"
                        >
                          View
                          <ArrowRight className="h-3 w-3" />
                        </button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
          <Pagination
            page={safePage}
            pageCount={pageCount}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            total={filtered.length}
            onPrevious={() => setPage(current => Math.max(1, current - 1))}
            onNext={() => setPage(current => Math.min(pageCount, current + 1))}
          />
        </>
      ) : (
        <>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {paginated.map(transfer => {
            const lineCount = transfer.transfer_lines.length
            const firstLine = transfer.transfer_lines[0]
            const reviewValue = transfer.status === 'needs_admin_review' ? discrepancyValue(transfer) : 0

            return (
              <button
                key={transfer.id}
                type="button"
                onClick={() => setSelectedTransfer(transfer)}
                className="text-left border border-[#E5E5E5] rounded-xl p-4 bg-white hover:border-[#E8231A]/50 hover:shadow-sm transition-all group cursor-pointer"
              >
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
              </button>
            )
          })}
        </div>
        <Pagination
          page={safePage}
          pageCount={pageCount}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          total={filtered.length}
          onPrevious={() => setPage(current => Math.max(1, current - 1))}
          onNext={() => setPage(current => Math.min(pageCount, current + 1))}
        />
        </>
      )}
      <TransferPreviewDialog
        transfer={selectedTransfer}
        onClose={() => setSelectedTransfer(null)}
      />
    </div>
  )
}

function TransferPreviewDialog({
  transfer,
  onClose,
}: {
  transfer: TransferRow | null
  onClose: () => void
}) {
  if (!transfer) return null

  const sent = sentValue(transfer)
  const received = receivedValue(transfer)
  const discrepancy = discrepancyValue(transfer)

  return (
    <Dialog
      open={!!transfer}
      onClose={onClose}
      title="Transfer Detail"
      className="max-w-4xl"
    >
      <div className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={transfer.status} />
              <span className="text-xs font-mono text-[#888888]">{formatDate(transfer.sent_at)}</span>
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-sm">
              <span className="text-[#6B7280]">{transfer.sender_branch?.name}</span>
              <ArrowRight className="h-3.5 w-3.5 text-[#D1D5DB] shrink-0" />
              <span className="font-medium text-[#111111]">{transfer.receiver_branch?.name}</span>
            </p>
            <p className="mt-1 break-all font-mono text-[11px] text-[#9CA3AF]">{transfer.id}</p>
          </div>
          <Link href={`/transfers/${transfer.id}`} onClick={onClose}>
            <Button type="button" variant="outline" size="sm">
              Open Full Page
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Metric label="Sent Value" value={formatCurrency(sent)} />
          <Metric label="Received Value" value={formatCurrency(received)} tone="green" />
          <Metric label="Discrepancy" value={formatCurrency(discrepancy)} tone={discrepancy > 0 ? 'red' : 'green'} />
        </div>

        <div className="rounded-xl border border-[#E5E5E5] overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Sent</TableHead>
                <TableHead className="text-right">Received</TableHead>
                <TableHead className="text-right">Unit Price</TableHead>
                <TableHead className="text-right">Difference</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transfer.transfer_lines.map(line => {
                const difference = Number(line.quantity_received ?? 0) - Number(line.quantity_sent)

                return (
                  <TableRow key={line.id}>
                    <TableCell>
                      <p className="font-medium text-[#111111]">{line.item?.name}</p>
                      <p className="text-xs text-[#888888]">{line.item?.unit}</p>
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">{Number(line.quantity_sent)}</TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {line.quantity_received === null ? '-' : Number(line.quantity_received)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">{formatCurrency(Number(line.unit_price_snapshot))}</TableCell>
                    <TableCell className={`text-right font-mono text-xs ${difference === 0 ? 'text-[#888888]' : 'text-red-500'}`}>
                      {line.quantity_received === null ? '-' : difference}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>

        {transfer.notes && (
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-[#444444]">Notes</p>
            <p className="mt-1 rounded-lg border border-[#E5E5E5] bg-[#FAFAFA] p-3 text-sm text-[#111111]">
              {transfer.notes}
            </p>
          </div>
        )}
      </div>
    </Dialog>
  )
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: 'green' | 'red' }) {
  const valueColor = tone === 'green' ? 'text-green-500' : tone === 'red' ? 'text-red-500' : 'text-[#111111]'

  return (
    <div className="rounded-xl border border-[#E5E5E5] bg-white p-4">
      <p className="text-[10px] text-[#9CA3AF] uppercase tracking-wider mb-1">{label}</p>
      <p className={`font-mono text-lg font-bold tabular ${valueColor}`}>{value}</p>
    </div>
  )
}

function Pagination({
  page,
  pageCount,
  rangeStart,
  rangeEnd,
  total,
  onPrevious,
  onNext,
}: {
  page: number
  pageCount: number
  rangeStart: number
  rangeEnd: number
  total: number
  onPrevious: () => void
  onNext: () => void
}) {
  return (
    <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-[#888888]">
        Showing {rangeStart}-{rangeEnd} of {total} transfers
      </p>
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onPrevious} disabled={page <= 1}>
          <ChevronLeft className="h-3.5 w-3.5" />
          Previous
        </Button>
        <span className="min-w-20 text-center text-xs font-mono text-[#6B7280]">
          {page} / {pageCount}
        </span>
        <Button type="button" variant="outline" size="sm" onClick={onNext} disabled={page >= pageCount}>
          Next
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}
