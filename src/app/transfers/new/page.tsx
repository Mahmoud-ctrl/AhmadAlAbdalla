'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeft, ArrowRight, Plus, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { isDecimalUnit } from '@/lib/constants'
import { fetchBranches, fetchItems } from '@/lib/data-cache'
import { useAppProfile } from '@/contexts/profile-context'
import type { Branch, Item } from '@/types'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

type DraftLine = {
  itemId: string
  quantity: string
}

const emptyLine = (): DraftLine => ({ itemId: '', quantity: '' })

export default function NewTransferPage() {
  const router = useRouter()
  const profile = useAppProfile()
  const [branches, setBranches] = useState<Branch[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [senderBranchId, setSenderBranchId] = useState('')
  const [receiverBranchId, setReceiverBranchId] = useState('')
  const [sentAt, setSentAt] = useState(() => new Date().toISOString().split('T')[0])
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()])

  useEffect(() => {
    async function load() {
      const [branchData, itemData] = await Promise.all([fetchBranches(), fetchItems()])
      setBranches(branchData)
      setItems(itemData)
      setLoading(false)
    }

    load()
  }, [])

  const effectiveSenderBranchId = profile?.role === 'super_admin' ? senderBranchId : profile?.branch_id
  const senderBranch = profile?.role === 'super_admin'
    ? branches.find(branch => branch.id === senderBranchId) ?? null
    : profile?.branch
  const availableReceivers = branches.filter(branch => branch.id !== effectiveSenderBranchId)

  const totals = useMemo(() => {
    return lines.reduce(
      (sum, line) => {
        const item = items.find(candidate => candidate.id === line.itemId)
        const qty = Number(line.quantity)
        return sum + (Number.isFinite(qty) && item ? qty * Number(item.price_per_unit) : 0)
      },
      0
    )
  }, [items, lines])

  function updateLine(index: number, patch: Partial<DraftLine>) {
    setLines(current => current.map((line, i) => (i === index ? { ...line, ...patch } : line)))
  }

  function removeLine(index: number) {
    setLines(current => current.length === 1 ? current : current.filter((_, i) => i !== index))
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()

    if (!effectiveSenderBranchId) {
      toast.error(profile?.role === 'super_admin' ? 'Select the sender branch.' : 'Your user must be assigned to a sender branch before creating transfers.')
      return
    }

    if (!receiverBranchId) {
      toast.error('Select the receiving branch.')
      return
    }

    const seenItems = new Set<string>()
    const payloadLines = lines.map(line => ({
      item_id: line.itemId,
      quantity_sent: Number(line.quantity),
    }))

    for (const line of payloadLines) {
      if (!line.item_id) {
        toast.error('Every line needs an item.')
        return
      }

      if (!Number.isFinite(line.quantity_sent) || line.quantity_sent <= 0) {
        toast.error('Every line quantity must be greater than 0.')
        return
      }

      const lineItem = items.find(candidate => candidate.id === line.item_id)
      if (lineItem && !isDecimalUnit(lineItem.unit) && !Number.isInteger(line.quantity_sent)) {
        toast.error(`Quantity for "${lineItem.name}" must be a whole number (unit: ${lineItem.unit}).`)
        return
      }

      if (seenItems.has(line.item_id)) {
        toast.error('Each item can appear only once per transfer.')
        return
      }

      seenItems.add(line.item_id)
    }

    setSaving(true)

    const { data, error } = await supabase.rpc('create_transfer', {
      p_receiver_branch_id: receiverBranchId,
      p_lines: payloadLines,
      p_sent_at: new Date(sentAt).toISOString(),
      p_notes: notes.trim() || null,
      p_sender_branch_id: profile?.role === 'super_admin' ? effectiveSenderBranchId : null,
    })

    setSaving(false)

    if (error) {
      toast.error(error.message)
      return
    }

    toast.success('Transfer sent for receiver confirmation')
    router.push(`/transfers/${data}`)
  }

  if (loading) {
    return <div className="px-4 py-5 sm:px-8 sm:py-8 text-sm text-[#444444]">Loading...</div>
  }

  return (
    <div className="px-4 py-5 sm:px-8 sm:py-8 max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/transfers">
          <button className="text-[#444444] hover:text-[#111111] transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </button>
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-[#111111]">Create Transfer</h1>
          <p className="text-sm text-[#888888] mt-0.5">Send multiple item lines for receiver confirmation</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <Card className="p-5">
          <h2 className="text-xs font-medium text-[#444444] uppercase tracking-wider mb-4">Route</h2>
          <div className="grid grid-cols-[1fr,auto,1fr] items-center gap-3">
            <div>
              <Label>Sender Branch</Label>
              {profile?.role === 'super_admin' ? (
                <Select value={senderBranchId} onChange={e => setSenderBranchId(e.target.value)}>
                  <option value="">Select branch...</option>
                  {branches.map(branch => (
                    <option key={branch.id} value={branch.id}>{branch.name}</option>
                  ))}
                </Select>
              ) : (
                <div className="flex h-9 items-center rounded-md border border-[#DADADA] bg-[#F8F8F8] px-3 text-sm text-[#111111]">
                  {senderBranch?.name ?? 'No branch assigned'}
                </div>
              )}
            </div>
            <div className="mt-5">
              <ArrowRight className="h-4 w-4 text-[#D1D5DB]" />
            </div>
            <div>
              <Label htmlFor="receiver-branch">Receiver Branch *</Label>
              <Select id="receiver-branch" value={receiverBranchId} onChange={e => setReceiverBranchId(e.target.value)}>
                <option value="">Select branch...</option>
                {availableReceivers.map(branch => (
                  <option key={branch.id} value={branch.id}>{branch.name}</option>
                ))}
              </Select>
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-medium text-[#444444] uppercase tracking-wider">Items</h2>
            <Button type="button" variant="outline" size="sm" onClick={() => setLines(current => [...current, emptyLine()])}>
              <Plus className="h-3.5 w-3.5" />
              Add Line
            </Button>
          </div>

          <div className="space-y-3">
            {lines.map((line, index) => {
              const item = items.find(candidate => candidate.id === line.itemId)
              const quantity = Number(line.quantity)
              const value = item && Number.isFinite(quantity) ? quantity * Number(item.price_per_unit) : 0
              const decimal = item ? isDecimalUnit(item.unit) : false

              return (
                <div key={index} className="grid grid-cols-[1fr,120px,90px,auto] gap-2 items-end">
                  <div>
                    <Label htmlFor={`item-${index}`}>Item *</Label>
                    <Select id={`item-${index}`} value={line.itemId} onChange={e => updateLine(index, { itemId: e.target.value })}>
                      <option value="">Select item...</option>
                      {items.map(candidate => (
                        <option key={candidate.id} value={candidate.id}>
                          {candidate.name} ({candidate.unit})
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor={`quantity-${index}`}>Quantity *</Label>
                    <Input
                      id={`quantity-${index}`}
                      type="number"
                      min={decimal ? '0.01' : '1'}
                      step={decimal ? '0.01' : '1'}
                      value={line.quantity}
                      onChange={e => updateLine(index, { quantity: e.target.value })}
                    />
                  </div>
                  <div>
                    <p className="mb-2 text-xs text-[#444444]">Value</p>
                    <p className="h-9 rounded-md border border-[#E5E5E5] px-2 py-2 text-right text-xs font-mono text-[#111111]">
                      {formatCurrency(value)}
                    </p>
                  </div>
                  <Button type="button" variant="ghost" size="icon" onClick={() => removeLine(index)} disabled={lines.length === 1}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )
            })}
          </div>

          <div className="mt-4 border-t border-[#F0F0F0] pt-3 text-right text-sm">
            <span className="text-[#888888]">Total value: </span>
            <span className="font-mono font-semibold text-[#E8231A]">{formatCurrency(totals)}</span>
          </div>
        </Card>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="sent-at">Sent Date *</Label>
            <Input id="sent-at" type="date" value={sentAt} onChange={e => setSentAt(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Optional context for the receiving branch"
              className="min-h-9"
            />
          </div>
        </div>

        <div className="flex gap-3 justify-end">
          <Link href="/transfers">
            <Button type="button" variant="ghost">Cancel</Button>
          </Link>
          <Button type="submit" loading={saving} size="lg">
            Create Transfer
          </Button>
        </div>
      </form>
    </div>
  )
}
