'use client'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { Branch, TransferRow } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog } from '@/components/ui/dialog'
import { Plus, Pencil, Trash2, Building2 } from 'lucide-react'

type BranchWithStats = Branch & {
  totalBorrowed: number
  totalReturned: number
  outstanding: number
}

export default function BranchesPage() {
  const [branches, setBranches] = useState<BranchWithStats[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Branch | null>(null)
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Branch | null>(null)

  async function load() {
    const [{ data: branchData }, { data: transfers }] = await Promise.all([
      supabase.from('branches').select('*').order('name'),
      supabase.from('transfers').select('to_branch_id, quantity, quantity_returned, item:items(price_per_unit)'),
    ])

    const branchList = branchData || []
    const transferList = transfers || []

    const withStats: BranchWithStats[] = branchList.map(b => {
      const mine = transferList.filter(t => t.to_branch_id === b.id)
      const totalBorrowed = mine.reduce((s, t) => s + Number(t.quantity) * Number((t.item as { price_per_unit?: number } | null)?.price_per_unit ?? 0), 0)
      const totalReturned = mine.reduce((s, t) => s + Number(t.quantity_returned) * Number((t.item as { price_per_unit?: number } | null)?.price_per_unit ?? 0), 0)
      return { ...b, totalBorrowed, totalReturned, outstanding: totalBorrowed - totalReturned }
    })

    setBranches(withStats)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function openAdd() {
    setEditing(null); setName(''); setLocation(''); setDialogOpen(true)
  }

  function openEdit(b: Branch) {
    setEditing(b); setName(b.name); setLocation(b.location ?? ''); setDialogOpen(true)
  }

  async function save() {
    if (!name.trim()) { toast.error('Branch name is required'); return }
    setSaving(true)
    const payload = { name: name.trim(), location: location.trim() || null }
    const { error } = editing
      ? await supabase.from('branches').update(payload).eq('id', editing.id)
      : await supabase.from('branches').insert(payload)

    if (error) { toast.error(error.message); setSaving(false); return }
    toast.success(editing ? 'Branch updated' : 'Branch added')
    setSaving(false)
    setDialogOpen(false)
    load()
  }

  async function confirmDelete(b: Branch) {
    const { error } = await supabase.from('branches').delete().eq('id', b.id)
    if (error) { toast.error('Cannot delete — branch has transfers'); setDeleteTarget(null); return }
    toast.success('Branch deleted')
    setDeleteTarget(null)
    load()
  }

  return (
    <div className="px-4 py-5 sm:px-8 sm:py-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[#111111]">Branches</h1>
          <p className="text-sm text-[#888888] mt-0.5">{branches.length} branch{branches.length !== 1 ? 'es' : ''} registered</p>
        </div>
        <Button onClick={openAdd}>
          <Plus className="h-4 w-4" />
          Add Branch
        </Button>
      </div>

      {loading ? (
        <div className="py-16 text-center text-sm text-[#444444]">Loading…</div>
      ) : branches.length === 0 ? (
        <div className="py-16 text-center">
          <Building2 className="h-8 w-8 text-[#D1D5DB] mx-auto mb-3" />
          <p className="text-sm text-[#888888] mb-1">No branches yet</p>
          <button onClick={openAdd} className="text-xs text-[#E8231A] hover:underline">Add the first branch →</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {branches.map(b => (
            <div key={b.id} className="border border-[#E5E5E5] rounded-xl p-4 bg-white hover:shadow-sm transition-all">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="font-semibold text-[#111111] text-sm">{b.name}</p>
                  {b.location
                    ? <p className="text-xs text-[#9CA3AF] mt-0.5">{b.location}</p>
                    : <p className="text-xs text-[#D1D5DB] mt-0.5">No location</p>
                  }
                </div>
                <div className="flex items-center gap-0.5 -mr-1">
                  <button onClick={() => openEdit(b)} className="p-1.5 text-[#9CA3AF] hover:text-[#111111] transition-colors rounded-md hover:bg-black/5">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => setDeleteTarget(b)} className="p-1.5 text-[#9CA3AF] hover:text-red-500 transition-colors rounded-md hover:bg-red-50">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 pt-3 border-t border-[#F0F0F0]">
                <div>
                  <p className="text-[10px] text-[#9CA3AF] uppercase tracking-wider mb-0.5">Borrowed</p>
                  <p className="text-xs font-mono font-medium text-[#111111]">{formatCurrency(b.totalBorrowed)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-[#9CA3AF] uppercase tracking-wider mb-0.5">Returned</p>
                  <p className="text-xs font-mono font-medium text-green-500">{formatCurrency(b.totalReturned)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-[#9CA3AF] uppercase tracking-wider mb-0.5">Outstanding</p>
                  <p className={`text-xs font-mono font-semibold ${b.outstanding > 0 ? 'text-amber-500' : 'text-[#9CA3AF]'}`}>
                    {formatCurrency(b.outstanding)}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} title={editing ? 'Edit Branch' : 'Add Branch'}>
        <div className="space-y-4">
          <div>
            <Label htmlFor="name">Branch Name *</Label>
            <Input id="name" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Beirut - Hamra" />
          </div>
          <div>
            <Label htmlFor="location">Location</Label>
            <Input id="location" value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Beirut, Lebanon" />
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save} loading={saving}>{editing ? 'Save Changes' : 'Add Branch'}</Button>
          </div>
        </div>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete Branch">
        <p className="text-sm text-[#888888] mb-5">
          Delete <span className="text-[#111111] font-medium">{deleteTarget?.name}</span>? This cannot be undone. Branches with active transfers cannot be deleted.
        </p>
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button variant="destructive" onClick={() => deleteTarget && confirmDelete(deleteTarget)}>Delete</Button>
        </div>
      </Dialog>
    </div>
  )
}
