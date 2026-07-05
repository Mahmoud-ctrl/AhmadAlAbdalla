'use client'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { invalidateBranches } from '@/lib/data-cache'
import { useAppProfile } from '@/contexts/profile-context'
import { useLanguage } from '@/contexts/language-context'
import type { Branch } from '@/types'
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

export default function BranchesPage() {
  const profile = useAppProfile()
  const { t } = useLanguage()
  const [branches, setBranches] = useState<BranchWithStats[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Branch | null>(null)
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Branch | null>(null)

  function branchMutationError(error: DbError) {
    return isPermissionError(error) ? t.branches.errorAccess : error.message
  }

  async function load() {
    const [{ data: branchData }, { data: transfers }] = await Promise.all([
      supabase.from('branches').select('*').order('name'),
      supabase.from('transfers').select('sender_branch_id, receiver_branch_id, status, transfer_lines(quantity_sent, quantity_received, unit_price_snapshot)'),
    ])

    const branchList = branchData || []
    const transferList = transfers || []

    const withStats: BranchWithStats[] = branchList.map(b => {
      const outgoing = transferList.filter(tr => tr.sender_branch_id === b.id)
      const incoming = transferList.filter(tr => tr.receiver_branch_id === b.id)
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
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const canManage = profile?.role === 'super_admin' || profile?.role === 'district_manager'

  function openAdd() {
    if (!canManage) { toast.error(t.branches.errorAccess); return }
    setEditing(null); setName(''); setLocation(''); setDialogOpen(true)
  }

  function openEdit(b: Branch) {
    if (!canManage) { toast.error(t.branches.errorAccess); return }
    setEditing(b); setName(b.name); setLocation(b.location ?? ''); setDialogOpen(true)
  }

  async function save() {
    if (!canManage) { toast.error(t.branches.errorAccess); return }
    if (!name.trim()) { toast.error(t.branches.errorName); return }
    setSaving(true)
    const payload = { name: name.trim(), location: location.trim() || null }
    const { error } = editing
      ? await supabase.from('branches').update(payload).eq('id', editing.id)
      : await supabase.from('branches').insert(payload)

    if (error) { toast.error(branchMutationError(error)); setSaving(false); return }
    toast.success(editing ? t.branches.successUpdate : t.branches.successAdd)
    setSaving(false)
    setDialogOpen(false)
    invalidateBranches()
    load()
  }

  async function confirmDelete(b: Branch) {
    if (!canManage) { toast.error(t.branches.errorAccess); return }
    const { error } = await supabase.from('branches').delete().eq('id', b.id)
    if (error) {
      toast.error(error.code === '23503' ? t.branches.errorFK : branchMutationError(error))
      setDeleteTarget(null)
      return
    }
    toast.success(t.branches.successDelete)
    setDeleteTarget(null)
    invalidateBranches()
    load()
  }

  return (
    <div className="px-4 py-5 sm:px-8 sm:py-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[#111111]">{t.branches.title}</h1>
          <p className="text-sm text-[#888888] mt-0.5">{t.branches.subtitle(branches.length)}</p>
        </div>
        {canManage && (
          <Button onClick={openAdd}>
            <Plus className="h-4 w-4" />
            {t.branches.add}
          </Button>
        )}
      </div>

      {loading ? (
        <div className="py-16 text-center text-sm text-[#444444]">{t.common.loading}</div>
      ) : !canManage ? (
        <Card className="p-5 bg-white">
          <p className="text-sm font-medium text-[#111111]">{t.branches.errorAccess}</p>
          <p className="mt-1 text-sm text-[#888888]">{t.branches.errorAccessDesc}</p>
        </Card>
      ) : branches.length === 0 ? (
        <div className="py-16 text-center">
          <Building2 className="h-8 w-8 text-[#D1D5DB] mx-auto mb-3" />
          <p className="text-sm text-[#888888] mb-1">{t.branches.empty}</p>
          <button onClick={openAdd} className="text-xs text-[#E8231A] hover:underline">{t.branches.emptyAdd}</button>
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
                    : <p className="text-xs text-[#D1D5DB] mt-0.5">{t.branches.noLocation}</p>
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
                  <p className="text-[10px] text-[#9CA3AF] uppercase tracking-wider mb-0.5">{t.branches.outgoing}</p>
                  <p className="text-xs font-mono font-medium text-[#111111]">{formatCurrency(b.outgoingValue)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-[#9CA3AF] uppercase tracking-wider mb-0.5">{t.branches.incoming}</p>
                  <p className="text-xs font-mono font-medium text-green-500">{formatCurrency(b.incomingValue)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-[#9CA3AF] uppercase tracking-wider mb-0.5">{t.branches.discrepancy}</p>
                  <p className={`text-xs font-mono font-semibold ${b.discrepancyValue > 0 ? 'text-red-500' : 'text-[#9CA3AF]'}`}>
                    {formatCurrency(b.discrepancyValue)}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} title={editing ? t.branches.dialogEdit : t.branches.dialogAdd}>
        <div className="space-y-4">
          <div>
            <Label htmlFor="name">{t.branches.fieldName}</Label>
            <Input id="name" value={name} onChange={e => setName(e.target.value)} placeholder={t.branches.fieldNamePlaceholder} />
          </div>
          <div>
            <Label htmlFor="location">{t.branches.fieldLocation}</Label>
            <Input id="location" value={location} onChange={e => setLocation(e.target.value)} placeholder={t.branches.fieldLocationPlaceholder} />
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>{t.branches.cancel}</Button>
            <Button onClick={save} loading={saving}>{editing ? t.branches.save : t.branches.add}</Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title={t.branches.dialogDelete}>
        <p className="text-sm text-[#888888] mb-5">
          {deleteTarget ? t.branches.deleteConfirm(deleteTarget.name) : ''}
        </p>
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={() => setDeleteTarget(null)}>{t.branches.cancel}</Button>
          <Button variant="destructive" onClick={() => deleteTarget && confirmDelete(deleteTarget)}>{t.branches.delete}</Button>
        </div>
      </Dialog>
    </div>
  )
}
