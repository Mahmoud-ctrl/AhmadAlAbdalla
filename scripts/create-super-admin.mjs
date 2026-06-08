#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,31}$/
const MOBILE_PATTERN = /^\+[1-9][0-9]{7,14}$/
const INTERNAL_AUTH_DOMAIN = 'alabdallah.internal'

function authEmailForUsername(username) {
  return `${username.trim().toLowerCase()}@${INTERNAL_AUTH_DOMAIN}`
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return

  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/)

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const separator = trimmed.indexOf('=')
    if (separator === -1) continue

    const key = trimmed.slice(0, separator).trim()
    let value = trimmed.slice(separator + 1).trim()

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    if (!process.env[key]) {
      process.env[key] = value
    }
  }
}

function parseArgs(argv) {
  const values = {}
  const positional = []

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]

    if (!arg.startsWith('--')) {
      positional.push(arg)
      continue
    }

    const key = arg.slice(2)
    const next = argv[i + 1]

    if (!next || next.startsWith('--')) {
      values[key] = 'true'
      continue
    }

    values[key] = next
    i += 1
  }

  if (!values.username && positional[0]) values.username = positional[0]
  if (!values.mobile && positional[1]) values.mobile = positional[1]
  if (!values.password && positional[2]) values.password = positional[2]
  if (!values['full-name'] && positional.length > 3) {
    values['full-name'] = positional.slice(3).join(' ')
  }

  return values
}

function usage() {
  console.log(`
Create the first super admin auth user and profile.

Usage:
  npm run create:super-admin -- \\
    --username super.admin \\
    --mobile +96170123456 \\
    --password "ChangeMe123!" \\
    --full-name "Super Admin"

PowerShell/npm may strip flag names. This positional form also works:
  npm run create:super-admin -- super.admin +96170123456 "ChangeMe123!" "Super Admin"

Required env:
  NEXT_PUBLIC_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
`)
}

function required(value, label) {
  if (!value) {
    throw new Error(`${label} is required.`)
  }

  return value
}

function validateInput(input) {
  if (!USERNAME_PATTERN.test(input.username)) {
    throw new Error('Username must be 3-32 lowercase characters and may include numbers, dot, dash, or underscore.')
  }

  if (!MOBILE_PATTERN.test(input.mobile)) {
    throw new Error('Mobile number must be in E.164 format, for example +96170123456.')
  }

  if (input.password.length < 8) {
    throw new Error('Password must be at least 8 characters.')
  }
}

async function main() {
  loadEnvFile(path.resolve(process.cwd(), '.env'))

  const args = parseArgs(process.argv.slice(2))

  if (args.help) {
    usage()
    return
  }

  const input = {
    username: required(args.username, 'Username').trim().toLowerCase(),
    mobile: required(args.mobile, 'Mobile number').trim(),
    password: required(args.password, 'Password'),
    fullName: args['full-name']?.trim() || null,
  }

  validateInput(input)
  const authEmail = authEmailForUsername(input.username)

  const supabaseUrl = required(process.env.NEXT_PUBLIC_SUPABASE_URL, 'NEXT_PUBLIC_SUPABASE_URL')
  const serviceRoleKey = required(process.env.SUPABASE_SERVICE_ROLE_KEY, 'SUPABASE_SERVICE_ROLE_KEY')

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  const { data: existingSuperAdmins, error: existingError } = await supabaseAdmin
    .from('user_profiles')
    .select('id')
    .eq('role', 'super_admin')
    .limit(1)

  if (existingError) {
    throw new Error(`Could not check existing super admin: ${existingError.message}`)
  }

  if ((existingSuperAdmins?.length ?? 0) > 0) {
    throw new Error('A super admin already exists. Use the /users page to create more admins.')
  }

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: authEmail,
    password: input.password,
    email_confirm: true,
    user_metadata: {
      username: input.username,
      mobile_number: input.mobile,
      full_name: input.fullName,
    },
    app_metadata: {
      role: 'super_admin',
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
    username: input.username,
    mobile_number: input.mobile,
    full_name: input.fullName,
    branch_id: null,
    role: 'super_admin',
    active: true,
    must_change_password: false,
  })

  if (profileError) {
    await supabaseAdmin.auth.admin.deleteUser(data.user.id)
    throw new Error(`Created auth user but failed to create profile: ${profileError.message}`)
  }

  console.log(`Super admin created: ${input.username} (${input.mobile})`)
  console.log(`Internal auth email: ${authEmail}`)
  console.log('Next: log in with the username, then enroll Google Authenticator.')
}

main().catch(error => {
  console.error(`Error: ${error.message}`)
  console.error('Run with --help to see usage.')
  process.exit(1)
})
