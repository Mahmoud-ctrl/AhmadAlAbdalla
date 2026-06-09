'use client'

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeft, ArrowRight, CheckCircle, ShieldCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatDate } from '@/lib/utils'
import { isDecimalUnit } from '@/lib/constants'
import { useAppProfile } from '@/contexts/profile-context'
import type { TransferRow, TransferStatus } from '@/types'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { StatusBadge } from '@/components/status-badge'

function lineSentValue(line: TransferRow['transfer_lines'][number]) {
  return Number(line.quantity_sent) * Number(line.unit_price_snapshot)
}

function lineReceivedValue(line: TransferRow['transfer_lines'][number]) {
  return Number(line.quantity_received ?? 0) * Number(line.unit_price_snapshot)
}

export default function TransferDetailPage() {
  const { id } = useParams<{ id: string }>()

  const profile = useAppProfile()
  const [transfer, setTransfer] = useState<TransferRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [receivedQuantities, setReceivedQuantities] = useState<Record<string, string>>({})
  const [receiptNote, setReceiptNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [adminStatus, setAdminStatus] = useState<TransferStatus>('admin_resolved')
  const [adminNotes, setAdminNotes] = useState('')
  const [resolving, setResolving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)

    const transferResult = await supabase
      .from('transfers')
      .select('id, status, sent_at, received_at, resolved_at, notes, admin_notes, sender_branch_id, receiver_branch_id, sender_branch:branches!sender_branch_id(id,name,location), receiver_branch:branches!receiver_branch_id(id,name,location), transfer_lines(id, transfer_id, item_id, quantity_sent, quantity_received, unit_price_snapshot, item:items(id,name,unit,price_per_unit)), transfer_events(id, transfer_id, actor_id, event_type, details, created_at)')
      .eq('id', id)
      .single()

    if (transferResult.error || !transferResult.data) {
      setNotFound(true)
      setLoading(false)
      return
    }

    const nextTransfer = transferResult.data as unknown as TransferRow
    setTransfer(nextTransfer)
    setReceivedQuantities(
      Object.fromEntries(
        nextTransfer.transfer_lines.map(line => [
          line.id,
          String(line.quantity_received ?? line.quantity_sent),
        ])
      )
    )
    setLoading(false)
  }, [id])

  useEffect(() => { if (id) load() }, [id, load])

  const totals = useMemo(() => {
    const sent = transfer?.transfer_lines.reduce((sum, line) => sum + lineSentValue(line), 0) ?? 0
    const received = transfer?.transfer_lines.reduce((sum, line) => sum + lineReceivedValue(line), 0) ?? 0
    return {
      sent,
      received,
      discrepancy: Math.abs(sent - received),
    }
  }, [transfer])

  const canReceive =
    transfer?.status === 'pending_receipt'
    && (profile?.role === 'super_admin' || profile?.branch_id === transfer.receiver_branch_id)

  const canAdminResolve =
    profile?.role === 'super_admin'
    && transfer?.status !== 'confirmed'
    && transfer?.status !== 'admin_resolved'
    && transfer?.status !== 'cancelled'

  async function handleReceive(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!transfer) return

    const lines = transfer.transfer_lines.map(line => ({
      line_id: line.id,
      quantity_received: Number(receivedQuantities[line.id]),
    }))

    for (const line of lines) {
      if (!Number.isFinite(line.quantity_received) || line.quantity_received < 0) {
        toast.error('Received quantities must be zero or greater.')
        return
      }
      const transferLine = transfer.transfer_lines.find(l => l.id === line.line_id)
      if (transferLine && !isDecimalUnit(transferLine.item?.unit ?? '') && !Number.isInteger(line.quantity_received)) {
        toast.error(`Received quantity for "${transferLine.item?.name}" must be a whole number (unit: ${transferLine.item?.unit}).`)
        return
      }
    }

    setSubmitting(true)
    const { data, error } = await supabase.rpc('receive_transfer', {
      p_transfer_id: transfer.id,
      p_lines: lines,
      p_notes: receiptNote.trim() || null,
    })
    setSubmitting(false)

    if (error) {
      toast.error(error.message)
      return
    }

    toast.success(data === 'confirmed' ? 'Transfer confirmed' : 'Mismatch sent to admin review')
    setReceiptNote('')
    await load()
  }

  async function handleAdminResolve(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!transfer) return

    setResolving(true)
    const { error } = await supabase.rpc('admin_resolve_transfer', {
      p_transfer_id: transfer.id,
      p_status: adminStatus,
      p_admin_notes: adminNotes.trim() || null,
    })
    setResolving(false)

    if (error) {
      toast.error(error.message)
      return
    }

    toast.success('Transfer resolved')
    setAdminNotes('')
    await load()
  }

  if (loading) return <div className="px-4 py-5 sm:px-8 sm:py-8 text-sm text-[#444444]">Loading...</div>
  if (notFound) return (
    <div className="px-8 py-8">
      <p className="text-sm text-[#888888]">Transfer not found.</p>
      <Link href="/transfers" className="text-xs text-[#E8231A] hover:underline mt-2 inline-block">Back to transfers</Link>
    </div>
  )
  if (!transfer) return null

  return (
    <div className="px-4 py-5 sm:px-8 sm:py-8 max-w-4xl">
      <div className="flex items-start justify-between mb-8">
        <div className="flex items-center gap-3">
          <Link href="/transfers">
            <button className="text-[#444444] hover:text-[#111111] transition-colors">
              <ArrowLeft className="h-4 w-4" />
            </button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold text-[#111111]">Transfer Detail</h1>
              <StatusBadge status={transfer.status} />
            </div>
            <p className="text-xs text-[#444444] font-mono mt-1">{transfer.id}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-5">
        <Card className="p-5">
          <p className="text-xs font-medium text-[#444444] uppercase tracking-wider mb-4">Movement Info</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
            <InfoRow label="Sent Date" value={formatDate(transfer.sent_at)} />
            <InfoRow
              label="Route"
              value={
                <span className="flex items-center gap-1.5">
                  <span className="text-[#888888]">{transfer.sender_branch?.name}</span>
                  <ArrowRight className="h-3 w-3 text-[#333333] shrink-0" />
                  <span className="text-[#111111] font-medium">{transfer.receiver_branch?.name}</span>
                </span>
              }
            />
            {transfer.received_at && <InfoRow label="Received Date" value={formatDate(transfer.received_at)} />}
            {transfer.resolved_at && <InfoRow label="Resolved Date" value={formatDate(transfer.resolved_at)} />}
            {transfer.notes && <InfoRow label="Notes" value={transfer.notes} />}
            {transfer.admin_notes && <InfoRow label="Admin Notes" value={transfer.admin_notes} />}
          </div>
        </Card>

        <Card>
          <div className="p-5 border-b border-[#E5E5E5]">
            <p className="text-xs font-medium text-[#444444] uppercase tracking-wider">Transfer Lines</p>
          </div>

          {/* Mobile card view */}
          <div className="sm:hidden divide-y divide-[#F0F0F0]">
            {transfer.transfer_lines.map(line => {
              const difference = Number(line.quantity_received ?? 0) - Number(line.quantity_sent)
              return (
                <div key={line.id} className="p-4 space-y-2">
                  <div>
                    <p className="font-medium text-sm text-[#111111]">{line.item?.name}</p>
                    <p className="text-xs text-[#888888]">{line.item?.unit} · {formatCurrency(Number(line.unit_price_snapshot))}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-[#888888]">Sent</span>
                      <span className="font-mono">{Number(line.quantity_sent)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#888888]">Received</span>
                      <span className="font-mono">{line.quantity_received === null ? '-' : Number(line.quantity_received)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#888888]">Value</span>
                      <span className="font-mono">{formatCurrency(lineSentValue(line))}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#888888]">Difference</span>
                      <span className={`font-mono ${difference === 0 ? 'text-[#888888]' : 'text-red-500'}`}>
                        {line.quantity_received === null ? '-' : difference}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Desktop table view */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#F0F0F0] text-left text-xs text-[#888888]">
                  <th className="px-5 py-3 font-medium">Item</th>
                  <th className="px-5 py-3 font-medium text-right">Sent</th>
                  <th className="px-5 py-3 font-medium text-right">Received</th>
                  <th className="px-5 py-3 font-medium text-right">Value</th>
                  <th className="px-5 py-3 font-medium text-right">Difference</th>
                </tr>
              </thead>
              <tbody>
                {transfer.transfer_lines.map(line => {
                  const difference = Number(line.quantity_received ?? 0) - Number(line.quantity_sent)
                  return (
                    <tr key={line.id} className="border-b border-[#F7F7F7] last:border-0">
                      <td className="px-5 py-3">
                        <p className="font-medium text-[#111111]">{line.item?.name}</p>
                        <p className="text-xs text-[#888888]">{line.item?.unit} · {formatCurrency(Number(line.unit_price_snapshot))}</p>
                      </td>
                      <td className="px-5 py-3 text-right font-mono">{Number(line.quantity_sent)}</td>
                      <td className="px-5 py-3 text-right font-mono">
                        {line.quantity_received === null ? '-' : Number(line.quantity_received)}
                      </td>
                      <td className="px-5 py-3 text-right font-mono">{formatCurrency(lineSentValue(line))}</td>
                      <td className={`px-5 py-3 text-right font-mono ${difference === 0 ? 'text-[#888888]' : 'text-red-500'}`}>
                        {line.quantity_received === null ? '-' : difference}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <FinancialCard label="Sent Value" value={totals.sent} />
          <FinancialCard label="Received Value" value={totals.received} color="green" />
          <FinancialCard label="Discrepancy" value={totals.discrepancy} color={totals.discrepancy > 0 ? 'red' : 'green'} />
        </div>

        {canReceive && (
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <CheckCircle className="h-4 w-4 text-[#888888]" />
              <p className="text-sm font-medium text-[#111111]">Confirm Received Quantities</p>
            </div>
            <form onSubmit={handleReceive} className="space-y-4">
              <div className="grid gap-3">
                {transfer.transfer_lines.map(line => (
                  <div key={line.id} className="grid grid-cols-1 sm:grid-cols-[1fr,140px] gap-2 sm:gap-3 sm:items-end">
                    <div>
                      <p className="text-sm font-medium text-[#111111]">{line.item?.name}</p>
                      <p className="text-xs text-[#888888]">Sent: {Number(line.quantity_sent)} {line.item?.unit}</p>
                    </div>
                    <div>
                      <Label htmlFor={`received-${line.id}`}>Received</Label>
                      <Input
                        id={`received-${line.id}`}
                        type="number"
                        min="0"
                        step={isDecimalUnit(line.item?.unit ?? '') ? '0.01' : '1'}
                        value={receivedQuantities[line.id] ?? ''}
                        onChange={e => setReceivedQuantities(current => ({ ...current, [line.id]: e.target.value }))}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div>
                <Label htmlFor="receipt-note">Receipt Note</Label>
                <Textarea
                  id="receipt-note"
                  value={receiptNote}
                  onChange={e => setReceiptNote(e.target.value)}
                  placeholder="Optional note about the received transfer"
                />
              </div>
              <div className="flex justify-end">
                <Button type="submit" loading={submitting}>Submit Receipt</Button>
              </div>
            </form>
          </Card>
        )}

        {canAdminResolve && (
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <ShieldCheck className="h-4 w-4 text-[#888888]" />
              <p className="text-sm font-medium text-[#111111]">Admin Resolution</p>
            </div>
            <form onSubmit={handleAdminResolve} className="space-y-4">
              <div>
                <Label htmlFor="admin-status">Resolution</Label>
                <Select id="admin-status" value={adminStatus} onChange={e => setAdminStatus(e.target.value as TransferStatus)}>
                  <option value="admin_resolved">Mark Admin Resolved</option>
                  <option value="confirmed">Accept As Confirmed</option>
                  <option value="cancelled">Cancel Transfer</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="admin-notes">Admin Notes</Label>
                <Textarea
                  id="admin-notes"
                  value={adminNotes}
                  onChange={e => setAdminNotes(e.target.value)}
                  placeholder="Explain the resolution"
                />
              </div>
              <div className="flex justify-end">
                <Button type="submit" loading={resolving}>Resolve Transfer</Button>
              </div>
            </form>
          </Card>
        )}

        {transfer.transfer_events && transfer.transfer_events.length > 0 && (
          <Card className="p-5">
            <p className="text-xs font-medium text-[#444444] uppercase tracking-wider mb-4">Audit Trail</p>
            <div className="space-y-2">
              {transfer.transfer_events.map(event => (
                <div key={event.id} className="flex items-center justify-between gap-3 text-xs">
                  <span className="font-medium text-[#111111]">{event.event_type.replaceAll('_', ' ')}</span>
                  <span className="text-[#888888] font-mono">{formatDate(event.created_at)}</span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-[#444444] uppercase tracking-wider mb-1">{label}</p>
      <div className="text-sm text-[#111111]">{value}</div>
    </div>
  )
}

function FinancialCard({ label, value, color }: { label: string; value: number; color?: 'green' | 'red' }) {
  const valueColor = color === 'green' ? 'text-green-400' : color === 'red' ? 'text-red-500' : 'text-[#111111]'
  return (
    <Card className="p-4">
      <p className="text-xs text-[#444444] uppercase tracking-wider mb-2">{label}</p>
      <p className={`text-base font-bold font-mono tabular ${valueColor}`}>{formatCurrency(value)}</p>
    </Card>
  )
}
