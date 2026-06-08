import { Buffer } from 'node:buffer'
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export type AdminActor = {
  id: string
}

export class AdminAuthError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'AdminAuthError'
    this.status = status
  }
}

function getBearerToken(request: Request) {
  const header = request.headers.get('authorization') ?? ''
  const [scheme, token] = header.split(' ')

  if (scheme !== 'Bearer' || !token) {
    throw new AdminAuthError('Missing authorization token.', 401)
  }

  return token
}

function readJwtClaims(accessToken: string) {
  const [, payload] = accessToken.split('.')

  if (!payload) {
    throw new AdminAuthError('Invalid authorization token.', 401)
  }

  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
    aal?: string
  }
}

export async function requireSuperAdmin(request: Request): Promise<AdminActor> {
  const accessToken = getBearerToken(request)
  const claims = readJwtClaims(accessToken)

  if (claims.aal !== 'aal2') {
    throw new AdminAuthError('Google Authenticator verification is required.', 403)
  }

  const supabaseAdmin = getSupabaseAdmin()
  const { data: userResult, error: userError } = await supabaseAdmin.auth.getUser(accessToken)

  if (userError || !userResult.user) {
    throw new AdminAuthError('Invalid authorization token.', 401)
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('user_profiles')
    .select('id, role, active')
    .eq('id', userResult.user.id)
    .maybeSingle()

  if (profileError) {
    throw new AdminAuthError(profileError.message, 500)
  }

  if (!profile || !profile.active || profile.role !== 'super_admin') {
    throw new AdminAuthError('Super admin access is required.', 403)
  }

  return { id: userResult.user.id }
}

export function adminAuthErrorResponse(error: unknown) {
  if (error instanceof AdminAuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status })
  }

  return NextResponse.json(
    { error: error instanceof Error ? error.message : 'Unexpected server error.' },
    { status: 500 }
  )
}
