'use client'

import Image from 'next/image'
import { FormEvent, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { authEmailForUsername } from '@/lib/auth-identity'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function LoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('error') === 'unauthorized') {
      setError('This account is not active or has no manager profile.')
    }
    if (params.get('setup') === 'complete') {
      setNotice('Super admin created. Log in to set up Google Authenticator.')
    }
  }, [])

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const authEmail = authEmailForUsername(username)

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: authEmail,
      password,
    })

    setLoading(false)

    if (signInError) {
      setError(signInError.message)
      return
    }

    router.replace('/')
  }

  return (
    <div className="min-h-screen grid place-items-center px-4 py-10 bg-white">
      <Card className="w-full max-w-sm p-6 bg-white">
        <div className="mb-6">
          <Image src="/logo.png" alt="Ahmad Al'Abdalla" width={180} height={64} className="h-12 w-auto object-contain" priority />
          <h1 className="mt-5 text-xl font-semibold text-[#111111]">Manager Login</h1>
          <p className="mt-1 text-sm text-[#888888]">Use the username assigned by the super admin.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="super.admin"
              autoComplete="username"
              required
            />
          </div>

          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          {error && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </p>
          )}

          {notice && (
            <p className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
              {notice}
            </p>
          )}

          <Button type="submit" loading={loading} className="w-full" size="lg">
            Log In
          </Button>
        </form>

        <p className="mt-5 text-xs text-[#888888]">
          Accounts are created by the super admin. There is no manager signup.
        </p>
      </Card>
    </div>
  )
}
