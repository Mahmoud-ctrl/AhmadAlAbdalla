'use client'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { invalidateItems } from '@/lib/data-cache'
import { useAppProfile } from '@/contexts/profile-context'
import { useLanguage } from '@/contexts/language-context'
import type { Item } from '@/types'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Dialog } from '@/components/ui/dialog'
import { ItemAutocomplete } from '@/components/item-autocomplete'
import { UNITS } from '@/lib/constants'
import { Plus, Pencil, Trash2, Package } from 'lucide-react'

type DbError = {
  code?: string
  message: string
}

function isPermissionError(error: DbError) {
  const message = error.message.toLowerCase()

  return error.code === '42501'
    || message.includes('row-level security')
    || message.includes('permission')
    || message.includes('not authorized')
}

export default function ItemsPage() {
  const profile = useAppProfile()
  const { t } = useLanguage()
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

  function itemMutationError(error: DbError) {
    return isPermissionError(error) ? t.items.errorAccess : error.message
  }

  async function load() {
    const { data } = await supabase.from('items').select('*').order('name')
    setItems(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const canManage = profile?.role === 'super_admin' || profile?.role === 'district_manager'

  function openAdd() {
    if (!canManage) { toast.error(t.items.errorAccess); return }
    setEditing(null); setSelectedSuggestion(null); setName(''); setUnit(''); setPrice(''); setDialogOpen(true)
  }

  function openEdit(item: Item) {
    if (!canManage) { toast.error(t.items.errorAccess); return }
    setEditing(item); setSelectedSuggestion(item); setName(item.name); setUnit(item.unit)
    setPrice(String(item.price_per_unit)); setDialogOpen(true)
  }

  function handleAutocompleteSelect(item: Item | null, query: string) {
    setSelectedSuggestion(item)
    setName(query)
    if (item) { setUnit(item.unit); setPrice(String(item.price_per_unit)) }
  }

  async function save() {
    if (!canManage) { toast.error(t.items.errorAccess); return }
    if (!name.trim()) { toast.error(t.items.errorName); return }
    if (!unit.trim()) { toast.error(t.items.errorUnit); return }
    const priceNum = parseFloat(price)
    if (isNaN(priceNum) || priceNum < 0) { toast.error(t.items.errorPrice); return }

    setSaving(true)
    const payload = { name: name.trim(), unit: unit.trim(), price_per_unit: priceNum }
    const { error } = editing
      ? await supabase.from('items').update(payload).eq('id', editing.id)
      : await supabase.from('items').insert(payload)

    if (error) { toast.error(itemMutationError(error)); setSaving(false); return }
    toast.success(editing ? t.items.successUpdate : t.items.successAdd)
    setSaving(false)
    setDialogOpen(false)
    invalidateItems()
    load()
  }

  async function confirmDelete(item: Item) {
    if (!canManage) { toast.error(t.items.errorAccess); return }
    const { error } = await supabase.from('items').delete().eq('id', item.id)
    if (error) {
      toast.error(error.code === '23503' ? t.items.errorFK : itemMutationError(error))
      setDeleteTarget(null)
      return
    }
    toast.success(t.items.successDelete)
    setDeleteTarget(null)
    invalidateItems()
    load()
  }

  return (
    <div className="px-4 py-5 sm:px-8 sm:py-8 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[#111111]">{t.items.title}</h1>
          <p className="text-sm text-[#888888] mt-0.5">{t.items.subtitle(items.length)}</p>
        </div>
        {canManage && (
          <Button onClick={openAdd}>
            <Plus className="h-4 w-4" />
            {t.items.add}
          </Button>
        )}
      </div>

      {loading ? (
        <div className="py-16 text-center text-sm text-[#444444]">{t.common.loading}</div>
      ) : !canManage ? (
        <Card className="p-5 bg-white">
          <p className="text-sm font-medium text-[#111111]">{t.items.errorAccess}</p>
          <p className="mt-1 text-sm text-[#888888]">{t.items.errorAccessDesc}</p>
        </Card>
      ) : items.length === 0 ? (
        <div className="py-16 text-center">
          <Package className="h-8 w-8 text-[#D1D5DB] mx-auto mb-3" />
          <p className="text-sm text-[#888888] mb-1">{t.items.empty}</p>
          <button onClick={openAdd} className="text-xs text-[#E8231A] hover:underline">{t.items.emptyAdd}</button>
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
                <p className="text-[10px] text-[#9CA3AF] uppercase tracking-wider mb-0.5">{t.items.pricePerUnit}</p>
                <p className="text-sm font-mono font-semibold text-[#111111]">{formatCurrency(Number(item.price_per_unit))}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} title={editing ? t.items.dialogEdit : t.items.dialogAdd}>
        <div className="space-y-4">
          <div>
            <Label htmlFor="item-name">{t.items.fieldName}</Label>
            <ItemAutocomplete
              items={items.filter(i => !editing || i.id !== editing.id)}
              selectedItem={selectedSuggestion}
              onSelect={handleAutocompleteSelect}
              placeholder={t.items.fieldNamePlaceholder}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="unit">{t.items.fieldUnit}</Label>
              <Select id="unit" value={unit} onChange={e => setUnit(e.target.value)}>
                <option value="">{t.items.fieldUnitPlaceholder}</option>
                {unit && !UNITS.includes(unit as typeof UNITS[number]) && (
                  <option value={unit}>{unit}</option>
                )}
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </Select>
            </div>
            <div>
              <Label htmlFor="price">{t.items.fieldPrice}</Label>
              <Input id="price" type="number" min="0" step="0.01" value={price} onChange={e => setPrice(e.target.value)} placeholder={t.items.fieldPricePlaceholder} />
            </div>
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>{t.items.cancel}</Button>
            <Button onClick={save} loading={saving}>{editing ? t.items.save : t.items.add}</Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title={t.items.dialogDelete}>
        <p className="text-sm text-[#888888] mb-5">
          {deleteTarget ? t.items.deleteConfirm(deleteTarget.name) : ''}
        </p>
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={() => setDeleteTarget(null)}>{t.items.cancel}</Button>
          <Button variant="destructive" onClick={() => deleteTarget && confirmDelete(deleteTarget)}>{t.items.delete}</Button>
        </div>
      </Dialog>
    </div>
  )
}
