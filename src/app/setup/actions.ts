'use server'

import { redirect } from 'next/navigation'
import { createAppUser, hasSuperAdminProfile } from '@/lib/user-admin'

export type SetupState = {
  error: string
}

function readRequired(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? '').trim()

  if (!value) {
    throw new Error('Fill in all required fields.')
  }

  return value
}

export async function createFirstSuperAdmin(
  _previousState: SetupState,
  formData: FormData
): Promise<SetupState> {
  try {
    const expectedSecret = process.env.SETUP_SECRET

    if (!expectedSecret) {
      return { error: 'Missing SETUP_SECRET on the server.' }
    }

    const submittedSecret = readRequired(formData, 'setupSecret')

    if (submittedSecret !== expectedSecret) {
      return { error: 'Invalid setup secret.' }
    }

    if (await hasSuperAdminProfile()) {
      return { error: 'Setup is already complete.' }
    }

    const username = readRequired(formData, 'username')
    const mobileNumber = readRequired(formData, 'mobileNumber')
    const password = readRequired(formData, 'password')
    const confirmPassword = readRequired(formData, 'confirmPassword')
    const fullName = String(formData.get('fullName') ?? '').trim() || null

    if (password !== confirmPassword) {
      return { error: 'Passwords do not match.' }
    }

    await createAppUser({
      username,
      mobileNumber,
      temporaryPassword: password,
      fullName,
      role: 'super_admin',
      branchId: null,
      mustChangePassword: false,
    })
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Could not complete setup.',
    }
  }

  redirect('/login?setup=complete')
}
