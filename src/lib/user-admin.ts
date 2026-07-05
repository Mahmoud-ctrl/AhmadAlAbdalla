import type { AppRole } from '@/types'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { authEmailForUsername } from '@/lib/auth-identity'

const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,31}$/
const MOBILE_PATTERN = /^\+[1-9][0-9]{7,14}$/

export type CreateAppUserInput = {
  username: string
  mobileNumber: string
  temporaryPassword: string
  fullName?: string | null
  branchId?: string | null
  branchIds?: string[] | null
  role: AppRole
  createdBy?: string | null
  mustChangePassword?: boolean
}

export type CreatedAppUser = {
  id: string
  username: string
  authEmail: string
  mobileNumber: string
  fullName: string | null
  branchId: string | null
  role: AppRole
}

export function normalizeUsername(username: string) {
  return username.trim().toLowerCase()
}

export function normalizeMobileNumber(mobileNumber: string) {
  return mobileNumber.trim()
}

function assertValidUserInput(input: {
  username: string
  mobileNumber: string
  temporaryPassword: string
  role: AppRole
  branchId: string | null
  branchIds: string[]
}) {
  if (!USERNAME_PATTERN.test(input.username)) {
    throw new Error('Username must be 3-32 lowercase characters and may include numbers, dot, dash, or underscore.')
  }

  if (!MOBILE_PATTERN.test(input.mobileNumber)) {
    throw new Error('Mobile number must be in E.164 format, for example +96170123456.')
  }

  if (input.temporaryPassword.length < 8) {
    throw new Error('Temporary password must be at least 8 characters.')
  }

  if (input.role === 'super_admin' && input.branchId !== null) {
    throw new Error('Super admin users must not be assigned to a branch.')
  }

  if (input.role === 'branch_manager' && input.branchId === null) {
    throw new Error('Branch managers must be assigned to a branch.')
  }

  if (input.role === 'district_manager' && input.branchId !== null) {
    throw new Error('District managers must not have a single branch_id; use branch assignments.')
  }

  if (input.role === 'district_manager' && input.branchIds.length === 0) {
    throw new Error('District managers must be assigned at least one branch.')
  }
}

export async function createAppUser(input: CreateAppUserInput): Promise<CreatedAppUser> {
  const supabaseAdmin = getSupabaseAdmin()
  const username = normalizeUsername(input.username)
  const mobileNumber = normalizeMobileNumber(input.mobileNumber)
  const authEmail = authEmailForUsername(username)
  const fullName = input.fullName?.trim() || null
  const branchId = input.branchId ?? null
  const branchIds = input.branchIds ?? []
  const mustChangePassword = input.mustChangePassword ?? true

  assertValidUserInput({
    username,
    mobileNumber,
    temporaryPassword: input.temporaryPassword,
    role: input.role,
    branchId,
    branchIds,
  })

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: authEmail,
    password: input.temporaryPassword,
    email_confirm: true,
    user_metadata: {
      username,
      mobile_number: mobileNumber,
      full_name: fullName,
    },
    app_metadata: {
      role: input.role,
    },
  })

  if (error) {
    throw new Error(error.message)
  }

  if (!data.user) {
    throw new Error('Supabase did not return the created auth user.')
  }

  const { error: profileError } = await supabaseAdmin.from('user_profiles').insert({
    id: data.user.id,
    username,
    mobile_number: mobileNumber,
    full_name: fullName,
    branch_id: branchId,
    role: input.role,
    created_by: input.createdBy ?? null,
    must_change_password: mustChangePassword,
  })

  if (profileError) {
    await supabaseAdmin.auth.admin.deleteUser(data.user.id)
    throw new Error(`Created auth user but failed to create profile: ${profileError.message}`)
  }

  if (input.role === 'district_manager') {
    const { error: branchesError } = await supabaseAdmin
      .from('district_manager_branches')
      .insert(branchIds.map(branch_id => ({ user_id: data.user.id, branch_id })))

    if (branchesError) {
      await supabaseAdmin.auth.admin.deleteUser(data.user.id)
      throw new Error(`Created user but failed to assign branches: ${branchesError.message}`)
    }
  }

  return {
    id: data.user.id,
    username,
    authEmail,
    mobileNumber,
    fullName,
    branchId,
    role: input.role,
  }
}

export async function hasSuperAdminProfile() {
  const supabaseAdmin = getSupabaseAdmin()
  const { data, error } = await supabaseAdmin
    .from('user_profiles')
    .select('id')
    .eq('role', 'super_admin')
    .limit(1)

  if (error) {
    throw new Error(error.message)
  }

  return (data?.length ?? 0) > 0
}

export async function setDistrictManagerBranches(userId: string, branchIds: string[]) {
  if (branchIds.length === 0) {
    throw new Error('District managers must be assigned at least one branch.')
  }

  const supabaseAdmin = getSupabaseAdmin()

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('user_profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle()

  if (profileError) {
    throw new Error(profileError.message)
  }

  if (!profile || profile.role !== 'district_manager') {
    throw new Error('Only district manager accounts have branch assignments.')
  }

  const { error: deleteError } = await supabaseAdmin
    .from('district_manager_branches')
    .delete()
    .eq('user_id', userId)

  if (deleteError) {
    throw new Error(deleteError.message)
  }

  const { error: insertError } = await supabaseAdmin
    .from('district_manager_branches')
    .insert(branchIds.map(branch_id => ({ user_id: userId, branch_id })))

  if (insertError) {
    throw new Error(insertError.message)
  }
}

export async function resetAppUserPassword(userId: string, temporaryPassword: string) {
  if (temporaryPassword.length < 8) {
    throw new Error('Temporary password must be at least 8 characters.')
  }

  const supabaseAdmin = getSupabaseAdmin()
  const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    password: temporaryPassword,
  })

  if (authError) {
    throw new Error(authError.message)
  }

  const { error: profileError } = await supabaseAdmin
    .from('user_profiles')
    .update({ must_change_password: true })
    .eq('id', userId)

  if (profileError) {
    throw new Error(profileError.message)
  }
}
