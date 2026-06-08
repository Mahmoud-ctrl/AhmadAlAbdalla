'use client'

import { FormEvent, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Ban, CheckCircle, KeyRound, Plus, ShieldCheck, ShieldX, UserCog } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { AppRole } from '@/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'

type BranchOption = {
  id: string
  name: string
}

type AdminUser = {
  id: string
  username: string
  mobile_number: string
  full_name: string | null
  branch_id: string | null
  role: AppRole
  active: boolean
  must_change_password: boolean
  created_at: string
  updated_at: string
  branch: BranchOption | null
}

type UsersResponse = {
  users: AdminUser[]
  branches: BranchOption[]
}

async function getAccessToken() {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token

  if (!token) {
    throw new Error('You must be logged in.')
  }

  return token
}

async function adminFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const token = await getAccessToken()
  const headers = new Headers(init?.headers)
  headers.set('Authorization', `Bearer ${token}`)

  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(url, { ...init, headers })
  const payload = await response.json()

  if (!response.ok) {
    throw new Error(payload.error ?? 'Request failed.')
  }

  return payload as T
}

export default function UsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [branches, setBranches] = useState<BranchOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [resetTarget, setResetTarget] = useState<AdminUser | null>(null)

  const [username, setUsername] = useState('')
  const [mobileNumber, setMobileNumber] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState<AppRole>('branch_manager')
  const [branchId, setBranchId] = useState('')
  const [temporaryPassword, setTemporaryPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [resetPassword, setResetPassword] = useState('')
  const [resetting, setResetting] = useState(false)

  async function loadUsers() {
    setLoading(true)
    setError('')

    try {
      const data = await adminFetch<UsersResponse>('/api/admin/users')
      setUsers(data.users)
      setBranches(data.branches)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load users.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadUsers()
  }, [])

  function openCreate() {
    setUsername('')
    setMobileNumber('')
    setFullName('')
    setRole('branch_manager')
    setBranchId('')
    setTemporaryPassword('')
    setCreateOpen(true)
  }

  async function createUser(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)

    try {
      await adminFetch('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          username,
          mobileNumber,
          fullName,
          role,
          branchId: role === 'branch_manager' ? branchId : null,
          temporaryPassword,
        }),
      })
      toast.success('User created')
      setCreateOpen(false)
      await loadUsers()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create user.')
    } finally {
      setSaving(false)
    }
  }

  async function setActive(user: AdminUser, active: boolean) {
    try {
      await adminFetch('/api/admin/users', {
        method: 'PATCH',
        body: JSON.stringify({
          id: user.id,
          action: 'set_active',
          active,
        }),
      })
      toast.success(active ? 'User activated' : 'User deactivated')
      await loadUsers()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update user.')
    }
  }

  async function resetUserPassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!resetTarget) return

    setResetting(true)

    try {
      await adminFetch('/api/admin/users', {
        method: 'PATCH',
        body: JSON.stringify({
          id: resetTarget.id,
          action: 'reset_password',
          temporaryPassword: resetPassword,
        }),
      })
      toast.success('Temporary password set')
      setResetTarget(null)
      setResetPassword('')
      await loadUsers()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not reset password.')
    } finally {
      setResetting(false)
    }
  }

  async function clearMfa(user: AdminUser) {
    try {
      const result = await adminFetch<{ cleared: number }>('/api/admin/users', {
        method: 'PATCH',
        body: JSON.stringify({
          id: user.id,
          action: 'clear_mfa',
        }),
      })
      toast.success(result.cleared > 0 ? 'MFA factors cleared' : 'No MFA factors to clear')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not clear MFA factors.')
    }
  }

  return (
    <div className="px-4 py-5 sm:px-8 sm:py-8 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[#111111]">Users</h1>
          <p className="text-sm text-[#888888] mt-0.5">Super-admin managed access</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Add User
        </Button>
      </div>

      {loading ? (
        <div className="py-16 text-center text-sm text-[#444444]">Loading...</div>
      ) : error ? (
        <Card className="p-5 bg-white">
          <p className="text-sm text-red-600">{error}</p>
        </Card>
      ) : users.length === 0 ? (
        <div className="py-16 text-center">
          <UserCog className="h-8 w-8 text-[#D1D5DB] mx-auto mb-3" />
          <p className="text-sm text-[#888888] mb-1">No users yet</p>
          <button onClick={openCreate} className="text-xs text-[#E8231A] hover:underline">Create the first manager</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {users.map(user => (
            <Card key={user.id} className="p-4 bg-white">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-semibold text-[#111111] text-sm truncate">{user.full_name || user.username}</p>
                    <Badge variant={user.active ? 'success' : 'destructive'}>
                      {user.active ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                  <p className="text-xs text-[#888888] font-mono">{user.username}</p>
                  <p className="text-xs text-[#888888] font-mono mt-0.5">{user.mobile_number}</p>
                </div>
                <Badge variant={user.role === 'super_admin' ? 'accent' : 'info'}>
                  {user.role === 'super_admin' && <ShieldCheck className="h-3 w-3" />}
                  {user.role === 'super_admin' ? 'Super Admin' : 'Manager'}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-[#F0F0F0]">
                <div>
                  <p className="text-[10px] text-[#9CA3AF] uppercase tracking-wider mb-0.5">Branch</p>
                  <p className="text-xs text-[#111111]">{user.branch?.name ?? 'All branches'}</p>
                </div>
                <div>
                  <p className="text-[10px] text-[#9CA3AF] uppercase tracking-wider mb-0.5">Password</p>
                  <p className="text-xs text-[#111111]">
                    {user.must_change_password ? 'Temporary' : 'Changed'}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap justify-end gap-2 mt-4">
                <Button variant="outline" size="sm" onClick={() => { setResetTarget(user); setResetPassword('') }}>
                  <KeyRound className="h-3.5 w-3.5" />
                  Reset Password
                </Button>
                <Button variant="outline" size="sm" onClick={() => clearMfa(user)}>
                  <ShieldX className="h-3.5 w-3.5" />
                  Clear MFA
                </Button>
                {user.active ? (
                  <Button variant="destructive" size="sm" onClick={() => setActive(user, false)}>
                    <Ban className="h-3.5 w-3.5" />
                    Deactivate
                  </Button>
                ) : (
                  <Button variant="secondary" size="sm" onClick={() => setActive(user, true)}>
                    <CheckCircle className="h-3.5 w-3.5" />
                    Activate
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="Add User">
        <form onSubmit={createUser} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="username">Username</Label>
              <Input id="username" value={username} onChange={e => setUsername(e.target.value)} placeholder="hamra.manager" required />
            </div>
            <div>
              <Label htmlFor="mobile">Mobile Number</Label>
              <Input id="mobile" type="tel" value={mobileNumber} onChange={e => setMobileNumber(e.target.value)} placeholder="+96170123456" required />
            </div>
          </div>

          <div>
            <Label htmlFor="full-name">Full Name</Label>
            <Input id="full-name" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Branch Manager" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="role">Role</Label>
              <Select id="role" value={role} onChange={e => setRole(e.target.value as AppRole)}>
                <option value="branch_manager">Branch Manager</option>
                <option value="super_admin">Super Admin</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="branch">Branch</Label>
              <Select
                id="branch"
                value={branchId}
                onChange={e => setBranchId(e.target.value)}
                disabled={role === 'super_admin'}
                required={role === 'branch_manager'}
              >
                <option value="">Select branch...</option>
                {branches.map(branch => (
                  <option key={branch.id} value={branch.id}>{branch.name}</option>
                ))}
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="temporary-password">Temporary Password</Label>
            <Input
              id="temporary-password"
              type="password"
              value={temporaryPassword}
              onChange={e => setTemporaryPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button type="submit" loading={saving}>Create User</Button>
          </div>
        </form>
      </Dialog>

      <Dialog open={!!resetTarget} onClose={() => setResetTarget(null)} title="Reset Password">
        <form onSubmit={resetUserPassword} className="space-y-4">
          <p className="text-sm text-[#888888]">
            Set a new temporary password for <span className="text-[#111111] font-medium">{resetTarget?.username}</span>.
          </p>
          <div>
            <Label htmlFor="reset-password">Temporary Password</Label>
            <Input
              id="reset-password"
              type="password"
              value={resetPassword}
              onChange={e => setResetPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Button type="button" variant="ghost" onClick={() => setResetTarget(null)}>Cancel</Button>
            <Button type="submit" loading={resetting}>Reset Password</Button>
          </div>
        </form>
      </Dialog>
    </div>
  )
}
