import Link from 'next/link'
import Image from 'next/image'
import { Card } from '@/components/ui/card'
import { SetupForm } from './setup-form'
import { hasSuperAdminProfile } from '@/lib/user-admin'

export default async function SetupPage() {
  let setupComplete = false
  let configError = ''

  try {
    setupComplete = await hasSuperAdminProfile()
  } catch (error) {
    configError = error instanceof Error ? error.message : 'Setup could not check the database.'
  }

  return (
    <div className="min-h-screen grid place-items-center px-4 py-10 bg-white">
      <Card className="w-full max-w-sm p-6 bg-white">
        <div className="mb-6">
          <Image src="/logo.png" alt="Ahmad Al'Abdalla" width={180} height={64} className="h-12 w-auto object-contain" priority />
          <h1 className="mt-5 text-xl font-semibold text-[#111111]">First-Time Setup</h1>
          <p className="mt-1 text-sm text-[#888888]">
            Create the first super admin account. This page locks after setup.
          </p>
        </div>

        {configError ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
            {configError}
          </div>
        ) : setupComplete ? (
          <div className="space-y-4">
            <p className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
              Setup is already complete.
            </p>
            <Link href="/login" className="block">
              <span className="flex h-10 items-center justify-center rounded-md bg-[#E8231A] px-5 text-sm font-medium text-white">
                Go to Login
              </span>
            </Link>
          </div>
        ) : (
          <SetupForm />
        )}
      </Card>
    </div>
  )
}
