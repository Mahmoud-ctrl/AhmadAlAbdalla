'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type MfaMode = 'loading' | 'enroll' | 'challenge'

function mfaErrorMessage(message: string) {
  const lower = message.toLowerCase()

  if (lower.includes('422') || lower.includes('factor') || lower.includes('mfa')) {
    return `${message}. Check that TOTP MFA is enabled in Supabase Authentication settings. If you retried setup earlier, this screen will also clear stale unverified factors and create a fresh QR code.`
  }

  return message
}

export default function MfaPage() {
  const router = useRouter()
  const [mode, setMode] = useState<MfaMode>('loading')
  const [factorId, setFactorId] = useState('')
  const [qrCode, setQrCode] = useState('')
  const [secret, setSecret] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function loadMfaState() {
      setError('')

      const { data: aal, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()

      if (aalError) {
        if (!cancelled) setError(mfaErrorMessage(aalError.message))
        return
      }

      if (aal.currentLevel === 'aal2') {
        router.replace('/')
        return
      }

      const factors = await supabase.auth.mfa.listFactors()

      if (factors.error) {
        if (!cancelled) setError(mfaErrorMessage(factors.error.message))
        return
      }

      const verifiedTotp = factors.data.totp.find(factor => factor.status === 'verified')

      if (verifiedTotp) {
        if (!cancelled) {
          setFactorId(verifiedTotp.id)
          setMode('challenge')
        }
        return
      }

      const staleTotpFactors = factors.data.totp.filter(factor => factor.status !== 'verified')

      for (const factor of staleTotpFactors) {
        await supabase.auth.mfa.unenroll({ factorId: factor.id })
      }

      const enrollment = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: `Google Authenticator ${Date.now()}`,
      })

      if (enrollment.error) {
        if (!cancelled) setError(mfaErrorMessage(enrollment.error.message))
        return
      }

      if (!cancelled) {
        setFactorId(enrollment.data.id)
        setQrCode(enrollment.data.totp.qr_code)
        setSecret(enrollment.data.totp.secret)
        setMode('enroll')
      }
    }

    loadMfaState()

    return () => {
      cancelled = true
    }
  }, [router, retryKey])

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')

    const cleanCode = code.replace(/\s/g, '')

    if (!/^\d{6}$/.test(cleanCode)) {
      setError('Enter the 6-digit code from Google Authenticator.')
      return
    }

    setLoading(true)

    if (mode === 'challenge') {
      const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
        factorId,
        code: cleanCode,
      })

      setLoading(false)

      if (verifyError) {
        setError(verifyError.message)
        return
      }

      router.replace('/')
      return
    }

    const challenge = await supabase.auth.mfa.challenge({ factorId })

    if (challenge.error) {
      setLoading(false)
      setError(challenge.error.message)
      return
    }

    const verification = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.data.id,
      code: cleanCode,
    })

    setLoading(false)

    if (verification.error) {
      setError(verification.error.message)
      return
    }

    router.replace('/')
  }

  async function signOut() {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  return (
    <div className="min-h-screen grid place-items-center px-4 py-10 bg-white">
      <Card className="w-full max-w-sm p-6 bg-white">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-[#111111]">
            {mode === 'enroll' ? 'Set Up Google Authenticator' : 'Verify Login'}
          </h1>
          <p className="mt-1 text-sm text-[#888888]">
            {mode === 'enroll'
              ? 'Scan the code, then enter the 6-digit number.'
              : 'Enter the 6-digit number from Google Authenticator.'}
          </p>
        </div>

        {mode === 'loading' ? (
          <div className="py-10">
            {error ? (
              <div className="space-y-4">
                <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                  {error}
                </p>
                <div className="flex gap-2">
                  <Button type="button" variant="ghost" onClick={signOut}>
                    Sign Out
                  </Button>
                  <Button type="button" className="flex-1" onClick={() => setRetryKey(key => key + 1)}>
                    Try Again
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex justify-center">
                <div className="h-8 w-8 rounded-full border-2 border-[#E8231A] border-t-transparent animate-spin" />
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'enroll' && qrCode && (
              <div className="rounded-lg border border-[#E5E5E5] bg-white p-4">
                {/* Supabase returns an SVG data URL, which Next Image cannot safely parse. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrCode}
                  alt="Google Authenticator QR code"
                  className="mx-auto h-48 w-48"
                />
                {secret && (
                  <p className="mt-3 break-all text-center font-mono text-xs text-[#6B7280]">
                    {secret}
                  </p>
                )}
              </div>
            )}

            <div>
              <Label htmlFor="mfa-code">Authenticator Code</Label>
              <Input
                id="mfa-code"
                value={code}
                onChange={e => setCode(e.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                maxLength={6}
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
                Verify
              </Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  )
}
