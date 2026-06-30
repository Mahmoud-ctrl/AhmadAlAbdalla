'use client'

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { ArrowLeftRight, ArrowRight, ChevronLeft, ChevronRight, LayoutGrid, Pencil, Plus, Table2, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatDate } from '@/lib/utils'
import { isDecimalUnit } from '@/lib/constants'
import { fetchBranches } from '@/lib/data-cache'
import type { Branch, TransferRow, TransferStatus } from '@/types'
import { useLanguage } from '@/contexts/language-context'
import { useAppProfile } from '@/contexts/profile-context'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
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

function totalQtySent(transfer: TransferRow) {
  return transfer.transfer_lines.reduce((sum, line) => sum + Number(line.quantity_sent), 0)
}

function totalQtyReceived(transfer: TransferRow) {
  return transfer.transfer_lines.reduce((sum, line) => sum + Number(line.quantity_received ?? 0), 0)
}

function formatQty(n: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(n)
}

export default function TransfersPage() {
  const { t } = useLanguage()
  const profile = useAppProfile()
  const isSuperAdmin = profile?.role === 'super_admin'
  const [transfers, setTransfers] = useState<TransferRow[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<TransferStatus | 'all'>('all')
  const [branchFilter, setBranchFilter] = useState('all')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [page, setPage] = useState(1)
  const [selectedTransfer, setSelectedTransfer] = useState<TransferRow | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<TransferRow | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [editTarget, setEditTarget] = useState<TransferRow | null>(null)

  const load = useCallback(async () => {
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
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    const { error } = await supabase.from('transfers').delete().eq('id', deleteTarget.id)
    setDeleting(false)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success(t.transfers.deleteSuccess)
    setTransfers(current => current.filter(tr => tr.id !== deleteTarget.id))
    setSelectedTransfer(null)
    setDeleteTarget(null)
  }

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
          <h1 className="text-xl font-semibold text-[#111111]">{t.transfers.title}</h1>
          <p className="text-sm text-[#888888] mt-0.5">{t.transfers.subtitle(filtered.length, transfers.length)}</p>
        </div>
        <Link href="/transfers/new" className="hidden sm:block">
          <Button>
            <Plus className="h-4 w-4" />
            {t.transfers.newTransfer}
          </Button>
        </Link>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value as TransferStatus | 'all')} className="flex-1 min-w-[160px]">
          <option value="all">{t.transfers.allStatuses}</option>
          <option value="pending_receipt">{t.status.pending_receipt}</option>
          <option value="confirmed">{t.status.confirmed}</option>
          <option value="needs_admin_review">{t.status.needs_admin_review}</option>
          <option value="admin_resolved">{t.status.admin_resolved}</option>
          <option value="cancelled">{t.status.cancelled}</option>
        </Select>
        <Select value={branchFilter} onChange={e => setBranchFilter(e.target.value)} className="flex-1 min-w-[160px]">
          <option value="all">{t.transfers.allBranches}</option>
          {branches.map(branch => (
            <option key={branch.id} value={branch.id}>{branch.name}</option>
          ))}
        </Select>
        {(statusFilter !== 'all' || branchFilter !== 'all') && (
          <button
            onClick={() => { setStatusFilter('all'); setBranchFilter('all') }}
            className="text-xs text-[#888888] hover:text-[#111111] transition-colors px-2"
          >
            {t.transfers.clear}
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
            {t.transfers.grid}
          </button>
          <button
            type="button"
            onClick={() => setViewMode('table')}
            className={`inline-flex items-center gap-1.5 rounded px-3 text-xs font-medium transition-colors ${viewMode === 'table' ? 'bg-[#111111] text-white' : 'text-[#6B7280] hover:text-[#111111]'}`}
            aria-pressed={viewMode === 'table'}
          >
            <Table2 className="h-3.5 w-3.5" />
            {t.transfers.table}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-16 text-center text-sm text-[#444444]">{t.common.loading}</div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center">
          <ArrowLeftRight className="h-8 w-8 text-[#D1D5DB] mx-auto mb-3" />
          <p className="text-sm text-[#888888]">
            {transfers.length === 0 ? t.transfers.noTransfers : t.transfers.noMatches}
          </p>
          {transfers.length === 0 && (
            <Link href="/transfers/new" className="mt-3 inline-block text-xs text-[#E8231A] hover:underline">{t.transfers.createFirst}</Link>
          )}
        </div>
      ) : viewMode === 'table' ? (
        <>
          <div className="rounded-xl border border-[#E5E5E5] bg-white overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t.transfers.sentDate}</TableHead>
                  <TableHead>{t.transfers.status}</TableHead>
                  <TableHead>{t.transfers.route}</TableHead>
                  <TableHead>{t.transfers.items}</TableHead>
                  <TableHead className="text-right">{t.transfers.sentValue}</TableHead>
                  <TableHead className="text-right">{t.transfers.discrepancy}</TableHead>
                  <TableHead className="text-right">{t.transfers.action}</TableHead>
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
                        <p className="text-xs text-[#888888]">{t.transfers.lineCount(lineCount)}</p>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">{formatCurrency(sentValue(transfer))}</TableCell>
                      <TableCell className={`text-right font-mono text-xs ${reviewValue > 0 ? 'text-red-500' : 'text-[#888888]'}`}>
                        {formatCurrency(reviewValue)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex items-center gap-3 justify-end">
                          {isSuperAdmin && (
                            <>
                              <button
                                type="button"
                                onClick={() => setEditTarget(transfer)}
                                className="inline-flex items-center gap-1 text-xs font-medium text-[#6B7280] hover:text-[#111111] hover:underline transition-colors"
                              >
                                <Pencil className="h-3 w-3" />
                                {t.transfers.edit}
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteTarget(transfer)}
                                className="inline-flex items-center gap-1 text-xs font-medium text-red-500 hover:underline"
                              >
                                <Trash2 className="h-3 w-3" />
                                {t.transfers.deleteTransfer}
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() => setSelectedTransfer(transfer)}
                            className="inline-flex items-center gap-1 text-xs font-medium text-[#E8231A] hover:underline"
                          >
                            {t.transfers.view}
                            <ArrowRight className="h-3 w-3" />
                          </button>
                        </div>
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
            labelShowing={t.transfers.showing}
            labelPrevious={t.transfers.previous}
            labelNext={t.transfers.next}
          />
        </>
      ) : (
        <>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {paginated.map(transfer => {
            const lineCount = transfer.transfer_lines.length
            const firstLine = transfer.transfer_lines[0]
            const hasReceived = transfer.transfer_lines.some(l => l.quantity_received !== null)
            const qtyDiff = hasReceived ? Math.abs(totalQtySent(transfer) - totalQtyReceived(transfer)) : null

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
                    {t.transfers.lineCount(lineCount)} {t.transfers.sent.toLowerCase()}
                  </p>
                  <div className="flex items-center gap-1.5 text-xs mb-4">
                    <span className="text-[#6B7280] truncate">{transfer.sender_branch?.name}</span>
                    <ArrowRight className="h-3 w-3 text-[#D1D5DB] shrink-0" />
                    <span className="text-[#111111] font-medium truncate">{transfer.receiver_branch?.name}</span>
                  </div>
                  <div className="flex items-end justify-between pt-3 border-t border-[#F0F0F0]">
                    <div className="flex gap-4">
                      <div>
                        <p className="text-[10px] text-[#9CA3AF] uppercase tracking-wider mb-0.5">{t.transfers.sentValue}</p>
                        <p className="font-mono text-sm font-semibold text-[#111111]">{formatCurrency(sentValue(transfer))}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-[#9CA3AF] uppercase tracking-wider mb-0.5">{t.transfers.discrepancy}</p>
                        <p className={`font-mono text-sm font-semibold ${qtyDiff !== null && qtyDiff > 0 ? 'text-red-500' : 'text-[#D1D5DB]'}`}>
                          {qtyDiff !== null && qtyDiff > 0 ? formatQty(qtyDiff) : '—'}
                        </p>
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#E8231A] text-white text-xs font-medium group-hover:bg-[#f03020] transition-colors shrink-0">
                      {t.transfers.view}
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
          labelShowing={t.transfers.showing}
          labelPrevious={t.transfers.previous}
          labelNext={t.transfers.next}
        />
        </>
      )}
      <TransferPreviewDialog
        transfer={selectedTransfer}
        onClose={() => setSelectedTransfer(null)}
        isSuperAdmin={isSuperAdmin}
        onEdit={transfer => { setSelectedTransfer(null); setEditTarget(transfer) }}
        onDelete={transfer => { setSelectedTransfer(null); setDeleteTarget(transfer) }}
      />

      <EditTransferDialog
        transfer={editTarget}
        branches={branches}
        onClose={() => setEditTarget(null)}
        onSaved={updated => {
          setTransfers(current => current.map(tr => tr.id === updated.id ? updated : tr))
          setEditTarget(null)
        }}
      />

      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title={t.transfers.deleteTransfer}>
        <p className="text-sm text-[#888888] mb-5">{t.transfers.deleteConfirm}</p>
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={() => setDeleteTarget(null)}>{t.common.cancel}</Button>
          <Button variant="destructive" loading={deleting} onClick={handleDelete}>{t.transfers.deleteTransfer}</Button>
        </div>
      </Dialog>
    </div>
  )
}

function TransferPreviewDialog({
  transfer,
  onClose,
  isSuperAdmin,
  onEdit,
  onDelete,
}: {
  transfer: TransferRow | null
  onClose: () => void
  isSuperAdmin: boolean
  onEdit: (transfer: TransferRow) => void
  onDelete: (transfer: TransferRow) => void
}) {
  const { t } = useLanguage()
  if (!transfer) return null

  const sent = sentValue(transfer)
  const received = receivedValue(transfer)
  const discrepancy = discrepancyValue(transfer)

  return (
    <Dialog
      open={!!transfer}
      onClose={onClose}
      title={t.transfers.transferDetail}
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
          <div className="flex flex-col gap-2 items-end">
            {isSuperAdmin ? (
              <Button type="button" variant="outline" size="sm" onClick={() => onEdit(transfer)}>
                <Pencil className="h-3.5 w-3.5" />
                {t.transfers.edit}
              </Button>
            ) : (
              <Link href={`/transfers/${transfer.id}`} onClick={onClose}>
                <Button type="button" variant="outline" size="sm">
                  {t.transfers.openFullPage}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            )}
            {isSuperAdmin && (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => onDelete(transfer)}
              >
                <Trash2 className="h-3.5 w-3.5" />
                {t.transfers.deleteTransfer}
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Metric label={t.transfers.sentValue} value={formatCurrency(sent)} />
          <Metric label={t.transfers.receivedValue} value={formatCurrency(received)} tone="green" />
          <Metric label={t.transfers.discrepancy} value={formatCurrency(discrepancy)} tone={discrepancy > 0 ? 'red' : 'green'} />
        </div>

        <div className="rounded-xl border border-[#E5E5E5] overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.transfer.item}</TableHead>
                <TableHead className="text-right">{t.transfers.sent}</TableHead>
                <TableHead className="text-right">{t.transfers.received}</TableHead>
                <TableHead className="text-right">{t.transfers.unitPrice}</TableHead>
                <TableHead className="text-right">{t.transfers.difference}</TableHead>
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
            <p className="text-xs font-medium uppercase tracking-wider text-[#444444]">{t.transfers.notesLabel}</p>
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
  labelShowing,
  labelPrevious,
  labelNext,
}: {
  page: number
  pageCount: number
  rangeStart: number
  rangeEnd: number
  total: number
  onPrevious: () => void
  onNext: () => void
  labelShowing: (start: number, end: number, total: number) => string
  labelPrevious: string
  labelNext: string
}) {
  return (
    <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-[#888888]">
        {labelShowing(rangeStart, rangeEnd, total)}
      </p>
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onPrevious} disabled={page <= 1}>
          <ChevronLeft className="h-3.5 w-3.5" />
          {labelPrevious}
        </Button>
        <span className="min-w-20 text-center text-xs font-mono text-[#6B7280]">
          {page} / {pageCount}
        </span>
        <Button type="button" variant="outline" size="sm" onClick={onNext} disabled={page >= pageCount}>
          {labelNext}
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}

type EditLine = { id: string; quantity_sent: string; unit_price_snapshot: string }

function EditTransferDialog({
  transfer,
  branches,
  onClose,
  onSaved,
}: {
  transfer: TransferRow | null
  branches: Branch[]
  onClose: () => void
  onSaved: (updated: TransferRow) => void
}) {
  const { t } = useLanguage()
  const [senderBranchId, setSenderBranchId] = useState('')
  const [receiverBranchId, setReceiverBranchId] = useState('')
  const [sentAt, setSentAt] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<EditLine[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!transfer) return
    setSenderBranchId(transfer.sender_branch?.id ?? '')
    setReceiverBranchId(transfer.receiver_branch?.id ?? '')
    setSentAt(transfer.sent_at ? new Date(transfer.sent_at).toISOString().split('T')[0] : '')
    setNotes(transfer.notes ?? '')
    setLines(transfer.transfer_lines.map(l => ({
      id: l.id,
      quantity_sent: String(l.quantity_sent),
      unit_price_snapshot: String(l.unit_price_snapshot),
    })))
  }, [transfer])

  function updateLine(id: string, field: keyof Omit<EditLine, 'id'>, value: string) {
    setLines(current => current.map(l => l.id === id ? { ...l, [field]: value } : l))
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    if (!transfer) return

    if (!senderBranchId || !receiverBranchId) {
      toast.error('Both branches are required.')
      return
    }
    if (senderBranchId === receiverBranchId) {
      toast.error('Sender and receiver branch must be different.')
      return
    }
    if (!sentAt) {
      toast.error(t.newTransfer.errorNoSender)
      return
    }

    for (const line of lines) {
      const origLine = transfer.transfer_lines.find(l => l.id === line.id)
      const qty = parseFloat(line.quantity_sent)
      if (!Number.isFinite(qty) || qty < 0) {
        toast.error(t.transfer.errorQtyNonNegative)
        return
      }
      if (origLine && !isDecimalUnit(origLine.item?.unit ?? '') && !Number.isInteger(qty)) {
        toast.error(t.transfer.errorWholeNumber(origLine.item?.name ?? '', origLine.item?.unit ?? ''))
        return
      }
      const price = parseFloat(line.unit_price_snapshot)
      if (!Number.isFinite(price) || price < 0) {
        toast.error(t.items.errorPrice)
        return
      }
    }

    setSaving(true)

    const { error: transferError } = await supabase
      .from('transfers')
      .update({
        sender_branch_id: senderBranchId,
        receiver_branch_id: receiverBranchId,
        sent_at: new Date(sentAt).toISOString(),
        notes: notes.trim() || null,
      })
      .eq('id', transfer.id)

    if (transferError) {
      toast.error(transferError.message)
      setSaving(false)
      return
    }

    for (const line of lines) {
      const { error: lineError } = await supabase
        .from('transfer_lines')
        .update({
          quantity_sent: parseFloat(line.quantity_sent),
          unit_price_snapshot: parseFloat(line.unit_price_snapshot),
        })
        .eq('id', line.id)

      if (lineError) {
        toast.error(lineError.message)
        setSaving(false)
        return
      }
    }

    toast.success(t.transfers.editSuccess)
    setSaving(false)

    const senderBranch = branches.find(b => b.id === senderBranchId) ?? transfer.sender_branch
    const receiverBranch = branches.find(b => b.id === receiverBranchId) ?? transfer.receiver_branch

    const updatedTransfer: TransferRow = {
      ...transfer,
      sender_branch_id: senderBranchId,
      receiver_branch_id: receiverBranchId,
      sent_at: new Date(sentAt).toISOString(),
      notes: notes.trim() || null,
      sender_branch: senderBranch,
      receiver_branch: receiverBranch,
      transfer_lines: transfer.transfer_lines.map(origLine => {
        const edited = lines.find(l => l.id === origLine.id)
        if (!edited) return origLine
        return {
          ...origLine,
          quantity_sent: parseFloat(edited.quantity_sent),
          unit_price_snapshot: parseFloat(edited.unit_price_snapshot),
        }
      }),
    }

    onSaved(updatedTransfer)
  }

  if (!transfer) return null

  return (
    <Dialog open={!!transfer} onClose={onClose} title={t.transfers.editTransfer} className="max-w-2xl">
      <form onSubmit={handleSave} className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="edit-sender">{t.newTransfer.senderBranch}</Label>
            <Select id="edit-sender" value={senderBranchId} onChange={e => setSenderBranchId(e.target.value)} required>
              <option value="">{t.common.selectBranch}</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="edit-receiver">{t.newTransfer.receiverBranch}</Label>
            <Select id="edit-receiver" value={receiverBranchId} onChange={e => setReceiverBranchId(e.target.value)} required>
              <option value="">{t.common.selectBranch}</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </div>
        </div>

        <div>
          <Label htmlFor="edit-sent-at">{t.transfer.sentDate}</Label>
          <Input id="edit-sent-at" type="date" value={sentAt} onChange={e => setSentAt(e.target.value)} required />
        </div>

        <div>
          <p className="text-xs font-medium text-[#444444] uppercase tracking-wider mb-3">{t.transfer.transferLines}</p>
          <div className="space-y-3 rounded-xl border border-[#E5E5E5] divide-y divide-[#F0F0F0] overflow-hidden">
            {transfer.transfer_lines.map(origLine => {
              const edited = lines.find(l => l.id === origLine.id)
              if (!edited) return null
              return (
                <div key={origLine.id} className="grid grid-cols-[1fr,110px,110px] gap-3 items-end px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-[#111111]">{origLine.item?.name}</p>
                    <p className="text-xs text-[#888888]">{origLine.item?.unit}</p>
                  </div>
                  <div>
                    <Label>{t.transfer.sent}</Label>
                    <Input
                      type="number"
                      min="0"
                      step={isDecimalUnit(origLine.item?.unit ?? '') ? '0.01' : '1'}
                      value={edited.quantity_sent}
                      onChange={e => updateLine(origLine.id, 'quantity_sent', e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>{t.transfers.unitPrice}</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={edited.unit_price_snapshot}
                      onChange={e => updateLine(origLine.id, 'unit_price_snapshot', e.target.value)}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div>
          <Label htmlFor="edit-notes">{t.transfer.notes}</Label>
          <Textarea
            id="edit-notes"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder={t.newTransfer.notesPlaceholder}
          />
        </div>

        <div className="flex gap-2 justify-end pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>{t.common.cancel}</Button>
          <Button type="submit" loading={saving}>{t.common.save}</Button>
        </div>
      </form>
    </Dialog>
  )
}
