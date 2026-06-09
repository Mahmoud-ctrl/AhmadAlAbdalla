'use client'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import type { AppRole, Branch } from '@/types'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog } from '@/components/ui/dialog'
import { Plus, Pencil, Trash2, Building2 } from 'lucide-react'

type BranchWithStats = Branch & {
  outgoingValue: number
  incomingValue: number
  discrepancyValue: number
}

type Profile = {
  role: AppRole
}

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

function branchMutationError(error: DbError) {
  if (isPermissionError(error)) {
    return 'Super admin access with MFA is required.'
  }

  return error.message
}

export default function BranchesPage() {
  const [branches, setBranches] = useState<BranchWithStats[]>([])
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Branch | null>(null)
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Branch | null>(null)

  async function load() {
    const { data: sessionResult } = await supabase.auth.getSession()
    const userId = sessionResult.session?.user.id

    const [{ data: branchData }, { data: transfers }, profileResult] = await Promise.all([
      supabase.from('branches').select('*').order('name'),
      supabase.from('transfers').select('sender_branch_id, receiver_branch_id, status, transfer_lines(quantity_sent, quantity_received, unit_price_snapshot)'),
      userId
        ? supabase.from('user_profiles').select('role').eq('id', userId).maybeSingle()
        : Promise.resolve({ data: null }),
    ])

    const branchList = branchData || []
    const transferList = transfers || []

    const withStats: BranchWithStats[] = branchList.map(b => {
      const outgoing = transferList.filter(t => t.sender_branch_id === b.id)
      const incoming = transferList.filter(t => t.receiver_branch_id === b.id)
      const outgoingValue = outgoing.reduce((sum, transfer) => {
        const lines = (transfer.transfer_lines ?? []) as { quantity_sent: number; unit_price_snapshot: number }[]
        return sum + lines.reduce((lineSum, line) => lineSum + Number(line.quantity_sent) * Number(line.unit_price_snapshot), 0)
      }, 0)
      const incomingValue = incoming.reduce((sum, transfer) => {
        const lines = (transfer.transfer_lines ?? []) as { quantity_received: number | null; unit_price_snapshot: number }[]
        return sum + lines.reduce((lineSum, line) => lineSum + Number(line.quantity_received ?? 0) * Number(line.unit_price_snapshot), 0)
      }, 0)
      const discrepancyValue = incoming.reduce((sum, transfer) => {
        const lines = (transfer.transfer_lines ?? []) as { quantity_sent: number; quantity_received: number | null; unit_price_snapshot: number }[]
        return sum + lines.reduce((lineSum, line) => lineSum + Math.abs((Number(line.quantity_sent) - Number(line.quantity_received ?? 0)) * Number(line.unit_price_snapshot)), 0)
      }, 0)
      return { ...b, outgoingValue, incomingValue, discrepancyValue }
    })

    setBranches(withStats)
    setProfile((profileResult.data as Profile | null) ?? null)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const isSuperAdmin = profile?.role === 'super_admin'

  function openAdd() {
    if (!isSuperAdmin) { toast.error('Super admin access with MFA is required.'); return }
    setEditing(null); setName(''); setLocation(''); setDialogOpen(true)
  }

  function openEdit(b: Branch) {
    if (!isSuperAdmin) { toast.error('Super admin access with MFA is required.'); return }
    setEditing(b); setName(b.name); setLocation(b.location ?? ''); setDialogOpen(true)
  }

  async function save() {
    if (!isSuperAdmin) { toast.error('Super admin access with MFA is required.'); return }
    if (!name.trim()) { toast.error('Branch name is required'); return }
    setSaving(true)
    const payload = { name: name.trim(), location: location.trim() || null }
    const { error } = editing
      ? await supabase.from('branches').update(payload).eq('id', editing.id)
      : await supabase.from('branches').insert(payload)

    if (error) { toast.error(branchMutationError(error)); setSaving(false); return }
    toast.success(editing ? 'Branch updated' : 'Branch added')
    setSaving(false)
    setDialogOpen(false)
    load()
  }

  async function confirmDelete(b: Branch) {
    if (!isSuperAdmin) { toast.error('Super admin access with MFA is required.'); return }
    const { error } = await supabase.from('branches').delete().eq('id', b.id)
    if (error) {
      toast.error(error.code === '23503' ? 'Cannot delete - branch has transfers' : branchMutationError(error))
      setDeleteTarget(null)
      return
    }
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
        {isSuperAdmin && (
          <Button onClick={openAdd}>
            <Plus className="h-4 w-4" />
            Add Branch
          </Button>
        )}
      </div>

      {loading ? (
        <div className="py-16 text-center text-sm text-[#444444]">Loading…</div>
      ) : !isSuperAdmin ? (
        <Card className="p-5 bg-white">
          <p className="text-sm font-medium text-[#111111]">Super admin access with MFA is required.</p>
          <p className="mt-1 text-sm text-[#888888]">
            Branch management is protected by Supabase row level security and is only available to verified super admins.
          </p>
        </Card>
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
                  <p className="text-[10px] text-[#9CA3AF] uppercase tracking-wider mb-0.5">Outgoing</p>
                  <p className="text-xs font-mono font-medium text-[#111111]">{formatCurrency(b.outgoingValue)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-[#9CA3AF] uppercase tracking-wider mb-0.5">Incoming</p>
                  <p className="text-xs font-mono font-medium text-green-500">{formatCurrency(b.incomingValue)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-[#9CA3AF] uppercase tracking-wider mb-0.5">Discrepancy</p>
                  <p className={`text-xs font-mono font-semibold ${b.discrepancyValue > 0 ? 'text-red-500' : 'text-[#9CA3AF]'}`}>
                    {formatCurrency(b.discrepancyValue)}
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
