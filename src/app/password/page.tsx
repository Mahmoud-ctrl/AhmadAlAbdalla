'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function PasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)

    const { error: passwordError } = await supabase.auth.updateUser({ password })

    if (passwordError) {
      setLoading(false)
      setError(passwordError.message)
      return
    }

    const { error: profileError } = await supabase.rpc('mark_password_changed')

    setLoading(false)

    if (profileError) {
      setError(profileError.message)
      return
    }

    router.replace('/mfa')
  }

  async function signOut() {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  return (
    <div className="min-h-screen grid place-items-center px-4 py-10 bg-white">
      <Card className="w-full max-w-sm p-6 bg-white">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-[#111111]">Set New Password</h1>
          <p className="mt-1 text-sm text-[#888888]">Replace the temporary password before continuing.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="new-password">New Password</Label>
            <Input
              id="new-password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
          </div>

          <div>
            <Label htmlFor="confirm-password">Confirm Password</Label>
            <Input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
          </div>

          {error && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={signOut}>
              Sign Out
            </Button>
            <Button type="submit" loading={loading} className="flex-1">
              Continue
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
