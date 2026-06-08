'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatDate, computeStatus } from '@/lib/utils'
import { TransferRow } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card } from '@/components/ui/card'
import { StatusBadge } from '@/components/status-badge'
import { ArrowLeft, ArrowRight, RotateCcw, Trash2 } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'

export default function TransferDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [transfer, setTransfer] = useState<TransferRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [returnQty, setReturnQty] = useState('')
  const [returnDate, setReturnDate] = useState(() => new Date().toISOString().split('T')[0])
  const [returnNote, setReturnNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  async function load() {
    const { data, error } = await supabase
      .from('transfers')
      .select('id, date, return_date, quantity, quantity_returned, status, notes, from_branch:branches!from_branch_id(id,name,location), to_branch:branches!to_branch_id(id,name,location), item:items(id,name,unit,price_per_unit)')
      .eq('id', id)
      .single()

    if (error || !data) { setNotFound(true); setLoading(false); return }
    setTransfer(data as unknown as TransferRow)
    setLoading(false)
  }

  useEffect(() => { if (id) load() }, [id])

  async function handleReturn(e: React.FormEvent) {
    e.preventDefault()
    if (!transfer) return
    const incoming = parseFloat(returnQty)
    if (isNaN(incoming) || incoming <= 0) { toast.error('Enter a valid return quantity'); return }

    const currentReturned = Number(transfer.quantity_returned)
    const totalReturned = currentReturned + incoming
    const maxReturnable = Number(transfer.quantity) - currentReturned

    if (incoming > maxReturnable) {
      toast.error(`Maximum returnable: ${maxReturnable} ${transfer.item?.unit}`)
      return
    }

    setSubmitting(true)
    const newStatus = computeStatus(Number(transfer.quantity), totalReturned)
    const { error } = await supabase
      .from('transfers')
      .update({
        quantity_returned: totalReturned,
        status: newStatus,
        return_date: new Date(returnDate).toISOString(),
        notes: returnNote.trim()
          ? [transfer.notes, `Return note: ${returnNote.trim()}`].filter(Boolean).join(' | ')
          : transfer.notes,
      })
      .eq('id', id)

    if (error) { toast.error(error.message); setSubmitting(false); return }
    toast.success(newStatus === 'returned' ? 'Fully returned — transfer closed' : 'Partial return logged')
    setReturnQty(''); setReturnNote('')
    setSubmitting(false)
    load()
  }

  async function handleDelete() {
    const { error } = await supabase.from('transfers').delete().eq('id', id)
    if (error) { toast.error(error.message); return }
    toast.success('Transfer deleted')
    router.push('/transfers')
  }

  if (loading) return <div className="px-4 py-5 sm:px-8 sm:py-8 text-sm text-[#444444]">Loading…</div>
  if (notFound) return (
    <div className="px-8 py-8">
      <p className="text-sm text-[#888888]">Transfer not found.</p>
      <Link href="/transfers" className="text-xs text-[#E8231A] hover:underline mt-2 inline-block">← Back to transfers</Link>
    </div>
  )
  if (!transfer) return null

  const qty = Number(transfer.quantity)
  const returned = Number(transfer.quantity_returned)
  const outstanding = qty - returned
  const price = Number(transfer.item?.price_per_unit ?? 0)
  const valueBorrowed = qty * price
  const valueReturned = returned * price
  const valueOutstanding = outstanding * price
  const isFullyReturned = returned >= qty

  return (
    <div className="px-4 py-5 sm:px-8 sm:py-8 max-w-3xl">
      {/* Header */}
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
              <StatusBadge quantity={qty} quantityReturned={returned} />
            </div>
            <p className="text-xs text-[#444444] font-mono mt-1">{id}</p>
          </div>
        </div>
        <button
          onClick={() => setDeleteOpen(true)}
          className="p-2 text-[#333333] hover:text-red-400 transition-colors"
          title="Delete transfer"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="grid gap-5">
        {/* Transfer Info */}
        <Card>
          <div className="p-5">
            <p className="text-xs font-medium text-[#444444] uppercase tracking-wider mb-4">Transfer Info</p>
            <div className="grid grid-cols-2 gap-x-8 gap-y-4">
              <InfoRow label="Date" value={formatDate(transfer.date)} />
              <InfoRow
                label="Route"
                value={
                  <span className="flex items-center gap-1.5">
                    <span className="text-[#888888]">{transfer.from_branch?.name}</span>
                    <ArrowRight className="h-3 w-3 text-[#333333] shrink-0" />
                    <span className="text-[#111111] font-medium">{transfer.to_branch?.name}</span>
                  </span>
                }
              />
              <InfoRow label="Item" value={<span>{transfer.item?.name} <span className="text-[#888888]">({transfer.item?.unit})</span></span>} />
              <InfoRow label="Price / Unit" value={<span className="font-mono">{formatCurrency(price)}</span>} />
              {transfer.notes && (
                <div className="col-span-2">
                  <p className="text-xs text-[#444444] uppercase tracking-wider mb-1">Notes</p>
                  <p className="text-sm text-[#888888]">{transfer.notes}</p>
                </div>
              )}
            </div>
          </div>
        </Card>

        {/* Financial Summary */}
        <div className="grid grid-cols-3 sm:grid-cols-3 gap-3">
          <FinancialCard label="Borrowed" qty={qty} unit={transfer.item?.unit ?? ''} value={valueBorrowed} />
          <FinancialCard label="Returned" qty={returned} unit={transfer.item?.unit ?? ''} value={valueReturned} color="green" />
          <FinancialCard label="Outstanding" qty={outstanding} unit={transfer.item?.unit ?? ''} value={valueOutstanding} color={outstanding > 0 ? 'amber' : 'green'} />
        </div>

        {/* Return Form */}
        {!isFullyReturned && (
          <Card>
            <div className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <RotateCcw className="h-4 w-4 text-[#888888]" />
                <p className="text-sm font-medium text-[#111111]">Log Return</p>
                <span className="text-xs text-[#444444]">({outstanding} {transfer.item?.unit} outstanding)</span>
              </div>
              <form onSubmit={handleReturn} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="return-qty">
                      Quantity Returned ({transfer.item?.unit}) *
                    </Label>
                    <Input
                      id="return-qty"
                      type="number"
                      min="0.01"
                      max={outstanding}
                      step="0.01"
                      value={returnQty}
                      onChange={e => setReturnQty(e.target.value)}
                      placeholder={`max ${outstanding}`}
                    />
                  </div>
                  <div>
                    <Label htmlFor="return-date">Return Date *</Label>
                    <Input
                      id="return-date"
                      type="date"
                      value={returnDate}
                      onChange={e => setReturnDate(e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="return-note">Note (optional)</Label>
                  <Textarea
                    id="return-note"
                    value={returnNote}
                    onChange={e => setReturnNote(e.target.value)}
                    placeholder="e.g. Returned via driver on Tuesday"
                    className="min-h-[60px]"
                  />
                </div>
                {returnQty && parseFloat(returnQty) > 0 && (
                  <p className="text-xs text-[#888888]">
                    Returning {returnQty} {transfer.item?.unit} ·
                    value: <span className="text-[#111111] font-mono">{formatCurrency(parseFloat(returnQty) * price)}</span> ·
                    remaining after: <span className="text-[#111111] font-mono">{formatCurrency(Math.max(0, outstanding - parseFloat(returnQty)) * price)}</span>
                  </p>
                )}
                <div className="flex justify-end">
                  <Button type="submit" loading={submitting}>Confirm Return</Button>
                </div>
              </form>
            </div>
          </Card>
        )}

        {isFullyReturned && transfer.return_date && (
          <Card className="p-4">
            <div className="flex items-center gap-2 text-green-400">
              <span className="h-2 w-2 rounded-full bg-green-400" />
              <p className="text-sm font-medium">Fully returned on {formatDate(transfer.return_date)}</p>
            </div>
          </Card>
        )}
      </div>

      {/* Delete Confirmation */}
      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete Transfer">
        <p className="text-sm text-[#888888] mb-5">
          Permanently delete this transfer? This action cannot be undone.
        </p>
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={() => setDeleteOpen(false)}>Cancel</Button>
          <Button variant="destructive" onClick={handleDelete}>Delete</Button>
        </div>
      </Dialog>
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

function FinancialCard({
  label, qty, unit, value, color,
}: {
  label: string
  qty: number
  unit: string
  value: number
  color?: 'green' | 'amber'
}) {
  const valueColor = color === 'green' ? 'text-green-400' : color === 'amber' ? 'text-amber-400' : 'text-[#111111]'
  return (
    <Card className="p-4">
      <p className="text-xs text-[#444444] uppercase tracking-wider mb-2">{label}</p>
      <p className="text-base font-bold text-[#111111] font-mono tabular">{qty} <span className="text-xs text-[#444444] font-normal">{unit}</span></p>
      <p className={`text-xs font-mono tabular mt-1 ${valueColor}`}>{formatCurrency(value)}</p>
    </Card>
  )
}
