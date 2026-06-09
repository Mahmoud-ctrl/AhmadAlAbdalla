import { NextResponse } from 'next/server'
import { adminAuthErrorResponse, requireSuperAdmin } from '@/lib/admin-auth'
import { createAppUser, resetAppUserPassword } from '@/lib/user-admin'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import type { AppRole } from '@/types'

export const runtime = 'nodejs'

type CreateUserBody = {
  username?: string
  mobileNumber?: string
  temporaryPassword?: string
  fullName?: string | null
  branchId?: string | null
  role?: AppRole
}

type PatchUserBody = {
  id?: string
  action?: 'set_active' | 'reset_password'
  active?: boolean
  temporaryPassword?: string
}

export async function GET(request: Request) {
  try {
    await requireSuperAdmin(request)
    const supabaseAdmin = getSupabaseAdmin()

    const [{ data: users, error: usersError }, { data: branches, error: branchesError }] = await Promise.all([
      supabaseAdmin
        .from('user_profiles')
        .select('id, username, mobile_number, full_name, branch_id, role, active, must_change_password, created_at, updated_at, branch:branches(id,name)')
        .order('role', { ascending: false })
        .order('username'),
      supabaseAdmin
        .from('branches')
        .select('id, name')
        .order('name'),
    ])

    if (usersError) {
      return NextResponse.json({ error: usersError.message }, { status: 500 })
    }

    if (branchesError) {
      return NextResponse.json({ error: branchesError.message }, { status: 500 })
    }

    return NextResponse.json({
      users: users ?? [],
      branches: branches ?? [],
    })
  } catch (error) {
    return adminAuthErrorResponse(error)
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireSuperAdmin(request)
    const body = (await request.json()) as CreateUserBody

    const created = await createAppUser({
      username: body.username ?? '',
      mobileNumber: body.mobileNumber ?? '',
      temporaryPassword: body.temporaryPassword ?? '',
      fullName: body.fullName ?? null,
      branchId: body.role === 'super_admin' ? null : body.branchId ?? null,
      role: body.role ?? 'branch_manager',
      createdBy: actor.id,
      mustChangePassword: true,
    })

    return NextResponse.json({ user: created }, { status: 201 })
  } catch (error) {
    return adminAuthErrorResponse(error)
  }
}

export async function PATCH(request: Request) {
  try {
    const actor = await requireSuperAdmin(request)
    const body = (await request.json()) as PatchUserBody

    if (!body.id) {
      return NextResponse.json({ error: 'User id is required.' }, { status: 400 })
    }

    if (body.action === 'reset_password') {
      await resetAppUserPassword(body.id, body.temporaryPassword ?? '')
      return NextResponse.json({ ok: true })
    }

    if (body.action === 'set_active') {
      if (body.id === actor.id && body.active === false) {
        return NextResponse.json({ error: 'You cannot deactivate your own account.' }, { status: 400 })
      }

      const supabaseAdmin = getSupabaseAdmin()
      const { error } = await supabaseAdmin
        .from('user_profiles')
        .update({ active: Boolean(body.active) })
        .eq('id', body.id)

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Unsupported user action.' }, { status: 400 })
  } catch (error) {
    return adminAuthErrorResponse(error)
  }
}
