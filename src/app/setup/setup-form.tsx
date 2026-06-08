'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createFirstSuperAdmin } from './actions'
import type { SetupState } from './actions'

const initialSetupState: SetupState = {
  error: '',
}

export function SetupForm() {
  const [state, formAction, pending] = useActionState(createFirstSuperAdmin, initialSetupState)

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <Label htmlFor="setup-secret">Setup Secret</Label>
        <Input
          id="setup-secret"
          name="setupSecret"
          type="password"
          autoComplete="off"
          required
        />
      </div>

      <div>
        <Label htmlFor="username">Username</Label>
        <Input
          id="username"
          name="username"
          placeholder="super.admin"
          autoComplete="username"
          required
        />
      </div>

      <div>
        <Label htmlFor="mobile-number">Mobile Number</Label>
        <Input
          id="mobile-number"
          name="mobileNumber"
          type="tel"
          placeholder="+96170123456"
          autoComplete="tel"
          required
        />
      </div>

      <div>
        <Label htmlFor="full-name">Full Name</Label>
        <Input
          id="full-name"
          name="fullName"
          autoComplete="name"
        />
      </div>

      <div>
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
        />
      </div>

      <div>
        <Label htmlFor="confirm-password">Confirm Password</Label>
        <Input
          id="confirm-password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
        />
      </div>

      {state.error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
          {state.error}
        </p>
      )}

      <Button type="submit" loading={pending} className="w-full" size="lg">
        Create Super Admin
      </Button>
    </form>
  )
}
