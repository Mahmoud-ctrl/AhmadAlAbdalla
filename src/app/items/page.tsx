'use client'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { Item } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Dialog } from '@/components/ui/dialog'
import { ItemAutocomplete } from '@/components/item-autocomplete'
import { UNITS } from '@/lib/constants'
import { Plus, Pencil, Trash2, Package } from 'lucide-react'

export default function ItemsPage() {
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Item | null>(null)
  const [selectedSuggestion, setSelectedSuggestion] = useState<Item | null>(null)
  const [name, setName] = useState('')
  const [unit, setUnit] = useState('')
  const [price, setPrice] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Item | null>(null)

  async function load() {
    const { data } = await supabase.from('items').select('*').order('name')
    setItems(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function openAdd() {
    setEditing(null); setSelectedSuggestion(null); setName(''); setUnit(''); setPrice(''); setDialogOpen(true)
  }

  function openEdit(item: Item) {
    setEditing(item); setSelectedSuggestion(item); setName(item.name); setUnit(item.unit)
    setPrice(String(item.price_per_unit)); setDialogOpen(true)
  }

  function handleAutocompleteSelect(item: Item | null, query: string) {
    setSelectedSuggestion(item)
    setName(query)
    if (item) { setUnit(item.unit); setPrice(String(item.price_per_unit)) }
  }

  async function save() {
    if (!name.trim()) { toast.error('Item name is required'); return }
    if (!unit.trim()) { toast.error('Unit is required'); return }
    const priceNum = parseFloat(price)
    if (isNaN(priceNum) || priceNum < 0) { toast.error('Enter a valid price'); return }

    setSaving(true)
    const payload = { name: name.trim(), unit: unit.trim(), price_per_unit: priceNum }
    const { error } = editing
      ? await supabase.from('items').update(payload).eq('id', editing.id)
      : await supabase.from('items').insert(payload)

    if (error) { toast.error(error.message); setSaving(false); return }
    toast.success(editing ? 'Item updated' : 'Item added')
    setSaving(false)
    setDialogOpen(false)
    load()
  }

  async function confirmDelete(item: Item) {
    const { error } = await supabase.from('items').delete().eq('id', item.id)
    if (error) { toast.error('Cannot delete — item has transfers'); setDeleteTarget(null); return }
    toast.success('Item deleted')
    setDeleteTarget(null)
    load()
  }

  return (
    <div className="px-4 py-5 sm:px-8 sm:py-8 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[#111111]">Items</h1>
          <p className="text-sm text-[#888888] mt-0.5">{items.length} item{items.length !== 1 ? 's' : ''} in catalog</p>
        </div>
        <Button onClick={openAdd}>
          <Plus className="h-4 w-4" />
          Add Item
        </Button>
      </div>

      {loading ? (
        <div className="py-16 text-center text-sm text-[#444444]">Loading…</div>
      ) : items.length === 0 ? (
        <div className="py-16 text-center">
          <Package className="h-8 w-8 text-[#D1D5DB] mx-auto mb-3" />
          <p className="text-sm text-[#888888] mb-1">No items yet</p>
          <button onClick={openAdd} className="text-xs text-[#E8231A] hover:underline">Add the first item →</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {items.map(item => (
            <div key={item.id} className="border border-[#E5E5E5] rounded-xl p-4 bg-white hover:shadow-sm transition-all">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="font-semibold text-[#111111] text-sm">{item.name}</p>
                  <span className="inline-block mt-1.5 px-2 py-0.5 rounded-md bg-[#F3F4F6] text-[#6B7280] text-[10px] font-medium uppercase tracking-wide">
                    {item.unit}
                  </span>
                </div>
                <div className="flex items-center gap-0.5 -mr-1">
                  <button onClick={() => openEdit(item)} className="p-1.5 text-[#9CA3AF] hover:text-[#111111] transition-colors rounded-md hover:bg-black/5">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => setDeleteTarget(item)} className="p-1.5 text-[#9CA3AF] hover:text-red-500 transition-colors rounded-md hover:bg-red-50">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <div className="pt-3 border-t border-[#F0F0F0]">
                <p className="text-[10px] text-[#9CA3AF] uppercase tracking-wider mb-0.5">Price / Unit</p>
                <p className="text-sm font-mono font-semibold text-[#111111]">{formatCurrency(Number(item.price_per_unit))}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} title={editing ? 'Edit Item' : 'Add Item'}>
        <div className="space-y-4">
          <div>
            <Label htmlFor="item-name">Item Name *</Label>
            <ItemAutocomplete
              items={items.filter(i => !editing || i.id !== editing.id)}
              selectedItem={selectedSuggestion}
              onSelect={handleAutocompleteSelect}
              placeholder="e.g. Pita Bread"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="unit">Unit *</Label>
              <Select id="unit" value={unit} onChange={e => setUnit(e.target.value)}>
                <option value="">Select unit…</option>
                {/* show existing unit even if it's not in the preset list */}
                {unit && !UNITS.includes(unit as typeof UNITS[number]) && (
                  <option value={unit}>{unit}</option>
                )}
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </Select>
            </div>
            <div>
              <Label htmlFor="price">Price per Unit (USD) *</Label>
              <Input id="price" type="number" min="0" step="0.01" value={price} onChange={e => setPrice(e.target.value)} placeholder="0.00" />
            </div>
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save} loading={saving}>{editing ? 'Save Changes' : 'Add Item'}</Button>
          </div>
        </div>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete Item">
        <p className="text-sm text-[#888888] mb-5">
          Delete <span className="text-[#111111] font-medium">{deleteTarget?.name}</span>? Items referenced in transfers cannot be deleted.
        </p>
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button variant="destructive" onClick={() => deleteTarget && confirmDelete(deleteTarget)}>Delete</Button>
        </div>
      </Dialog>
    </div>
  )
}
