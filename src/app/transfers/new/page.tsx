'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { UNITS } from '@/lib/constants'
import { Branch, Item } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Card } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { ItemAutocomplete } from '@/components/item-autocomplete'
import { ArrowLeft, ArrowRight, Plus } from 'lucide-react'
import Link from 'next/link'

export default function NewTransferPage() {
  const router = useRouter()
  const [branches, setBranches] = useState<Branch[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Transfer form
  const [fromBranch, setFromBranch] = useState('')
  const [toBranch, setToBranch] = useState('')
  const [selectedItem, setSelectedItem] = useState<Item | null>(null)
  const [quantity, setQuantity] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0])
  const [notes, setNotes] = useState('')

  // Add Branch modal
  const [branchOpen, setBranchOpen] = useState(false)
  const [newBranchName, setNewBranchName] = useState('')
  const [newBranchLocation, setNewBranchLocation] = useState('')
  const [savingBranch, setSavingBranch] = useState(false)

  // Add Item modal
  const [itemOpen, setItemOpen] = useState(false)
  const [newItemName, setNewItemName] = useState('')
  const [newItemUnit, setNewItemUnit] = useState('')
  const [newItemPrice, setNewItemPrice] = useState('')
  const [savingItem, setSavingItem] = useState(false)

  async function loadBranches() {
    const { data } = await supabase.from('branches').select('*').order('name')
    setBranches(data || [])
  }

  async function loadItems() {
    const { data } = await supabase.from('items').select('*').order('name')
    setItems(data || [])
  }

  useEffect(() => {
    async function load() {
      await Promise.all([loadBranches(), loadItems()])
      setLoading(false)
    }
    load()
  }, [])

  // Add Branch
  function openAddBranch() {
    setNewBranchName(''); setNewBranchLocation(''); setBranchOpen(true)
  }

  async function saveNewBranch() {
    if (!newBranchName.trim()) { toast.error('Branch name is required'); return }
    setSavingBranch(true)
    const { error } = await supabase.from('branches').insert({
      name: newBranchName.trim(),
      location: newBranchLocation.trim() || null,
    })
    if (error) { toast.error(error.message); setSavingBranch(false); return }
    toast.success(`"${newBranchName.trim()}" added`)
    setSavingBranch(false)
    setBranchOpen(false)
    await loadBranches()
  }

  // Add Item
  function openAddItem() {
    setNewItemName(''); setNewItemUnit(''); setNewItemPrice(''); setItemOpen(true)
  }

  async function saveNewItem() {
    if (!newItemName.trim()) { toast.error('Item name is required'); return }
    if (!newItemUnit) { toast.error('Select a unit'); return }
    const priceNum = parseFloat(newItemPrice)
    if (isNaN(priceNum) || priceNum < 0) { toast.error('Enter a valid price'); return }

    setSavingItem(true)
    const { data, error } = await supabase
      .from('items')
      .insert({ name: newItemName.trim(), unit: newItemUnit, price_per_unit: priceNum })
      .select()
      .single()

    if (error) { toast.error(error.message); setSavingItem(false); return }
    toast.success(`"${newItemName.trim()}" added`)
    setSavingItem(false)
    setItemOpen(false)
    await loadItems()
    if (data) setSelectedItem(data as Item)
  }

  // Submit Transfer
  const qty = parseFloat(quantity) || 0
  const subtotal = qty * Number(selectedItem?.price_per_unit ?? 0)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!fromBranch) { toast.error('Select the branch giving the items'); return }
    if (!toBranch) { toast.error('Select the branch receiving the items'); return }
    if (fromBranch === toBranch) { toast.error('From and To branches must be different'); return }
    if (!selectedItem) { toast.error('Pick an item from the list (or add a new one)'); return }
    if (qty <= 0) { toast.error('Quantity must be greater than 0'); return }

    setSaving(true)
    const { data, error } = await supabase.from('transfers').insert({
      from_branch_id: fromBranch,
      to_branch_id: toBranch,
      item_id: selectedItem.id,
      quantity: qty,
      quantity_returned: 0,
      status: 'pending',
      date: new Date(date).toISOString(),
      notes: notes.trim() || null,
    }).select('id').single()

    if (error) { toast.error(error.message); setSaving(false); return }
    toast.success('Transfer logged')
    router.push(`/transfers/${data.id}`)
  }

  if (loading) {
    return <div className="px-4 py-5 sm:px-8 sm:py-8 text-sm text-[#444444]">Loading…</div>
  }

  return (
    <div className="px-4 py-5 sm:px-8 sm:py-8 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/transfers">
          <button className="text-[#444444] hover:text-[#111111] transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </button>
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-[#111111]">Log Transfer</h1>
          <p className="text-sm text-[#888888] mt-0.5">Record an inter-branch item loan</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Route */}
        <Card className="p-5">
          <h2 className="text-xs font-medium text-[#444444] uppercase tracking-wider mb-4">Transfer Route</h2>
          <div className="grid grid-cols-[1fr,auto,1fr] items-center gap-3">
            <div>
              <Label htmlFor="from">From Branch *</Label>
              <Select id="from" value={fromBranch} onChange={e => setFromBranch(e.target.value)}>
                <option value="">Select branch…</option>
                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
            </div>
            <div className="mt-5">
              <ArrowRight className="h-4 w-4 text-[#D1D5DB]" />
            </div>
            <div>
              <Label htmlFor="to">To Branch *</Label>
              <Select id="to" value={toBranch} onChange={e => setToBranch(e.target.value)}>
                <option value="">Select branch…</option>
                {branches.filter(b => b.id !== fromBranch).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
            </div>
          </div>
          <button
            type="button"
            onClick={openAddBranch}
            className="mt-3 flex items-center gap-1 text-xs text-[#444444] hover:text-[#E8231A] transition-colors"
          >
            <Plus className="h-3 w-3" />
            Add new branch
          </button>
        </Card>

        {/* Item */}
        <Card className="p-5">
          <h2 className="text-xs font-medium text-[#444444] uppercase tracking-wider mb-4">Item Details</h2>
          <div className="space-y-4">
            <div>
              <Label>Item *</Label>
              <ItemAutocomplete
                items={items}
                selectedItem={selectedItem}
                onSelect={(item) => setSelectedItem(item)}
                placeholder="Search items by name…"
              />
              <button
                type="button"
                onClick={openAddItem}
                className="mt-2 flex items-center gap-1 text-xs text-[#444444] hover:text-[#E8231A] transition-colors"
              >
                <Plus className="h-3 w-3" />
                Add new item
              </button>
            </div>

            {selectedItem && (
              <div className="flex gap-4 rounded-md bg-white border border-[#E5E5E5] px-4 py-3">
                <div>
                  <p className="text-xs text-[#444444] mb-0.5">Unit</p>
                  <p className="text-sm text-[#111111] font-medium">{selectedItem.unit}</p>
                </div>
                <div className="w-px bg-[#E5E5E5]" />
                <div>
                  <p className="text-xs text-[#444444] mb-0.5">Price / unit</p>
                  <p className="text-sm text-[#111111] font-mono">{formatCurrency(Number(selectedItem.price_per_unit))}</p>
                </div>
                {qty > 0 && (
                  <>
                    <div className="w-px bg-[#E5E5E5]" />
                    <div>
                      <p className="text-xs text-[#444444] mb-0.5">Total value</p>
                      <p className="text-sm text-[#E8231A] font-mono font-medium">{formatCurrency(subtotal)}</p>
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="qty">Quantity *</Label>
                <Input
                  id="qty"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={quantity}
                  onChange={e => setQuantity(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div>
                <Label htmlFor="date">Date *</Label>
                <Input
                  id="date"
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                />
              </div>
            </div>
          </div>
        </Card>

        {/* Notes */}
        <div>
          <Label htmlFor="notes">Notes</Label>
          <Textarea
            id="notes"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Optional - reason for transfer, urgency, etc."
          />
        </div>

        <div className="flex gap-3 justify-end">
          <Link href="/transfers">
            <Button type="button" variant="ghost">Cancel</Button>
          </Link>
          <Button type="submit" loading={saving} size="lg">
            Log Transfer
          </Button>
        </div>
      </form>

      {/* Add Branch Modal */}
      <Dialog open={branchOpen} onClose={() => setBranchOpen(false)} title="Add New Branch">
        <div className="space-y-4">
          <div>
            <Label htmlFor="nb-name">Branch Name *</Label>
            <Input
              id="nb-name"
              value={newBranchName}
              onChange={e => setNewBranchName(e.target.value)}
              placeholder="e.g. Beirut - Hamra"
              autoFocus
            />
          </div>
          <div>
            <Label htmlFor="nb-location">Location</Label>
            <Input
              id="nb-location"
              value={newBranchLocation}
              onChange={e => setNewBranchLocation(e.target.value)}
              placeholder="e.g. Beirut, Lebanon"
            />
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <Button variant="ghost" onClick={() => setBranchOpen(false)}>Cancel</Button>
            <Button onClick={saveNewBranch} loading={savingBranch}>Add Branch</Button>
          </div>
        </div>
      </Dialog>

      {/* Add Item Modal */}
      <Dialog open={itemOpen} onClose={() => setItemOpen(false)} title="Add New Item">
        <div className="space-y-4">
          <div>
            <Label htmlFor="ni-name">Item Name *</Label>
            <Input
              id="ni-name"
              value={newItemName}
              onChange={e => setNewItemName(e.target.value)}
              placeholder="e.g. Pita Bread"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="ni-unit">Unit *</Label>
              <Select id="ni-unit" value={newItemUnit} onChange={e => setNewItemUnit(e.target.value)}>
                <option value="">Select unit…</option>
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </Select>
            </div>
            <div>
              <Label htmlFor="ni-price">Price / Unit (USD) *</Label>
              <Input
                id="ni-price"
                type="number"
                min="0"
                step="0.01"
                value={newItemPrice}
                onChange={e => setNewItemPrice(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <Button variant="ghost" onClick={() => setItemOpen(false)}>Cancel</Button>
            <Button onClick={saveNewItem} loading={savingItem}>Add Item</Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
