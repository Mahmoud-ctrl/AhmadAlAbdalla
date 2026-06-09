'use client'
import { createContext, useContext } from 'react'
import type { AppRole } from '@/types'

export type AppProfile = {
  id: string
  role: AppRole
  branch_id: string | null
  username: string
  full_name: string | null
  branch: { id: string; name: string } | null
}

export const ProfileContext = createContext<AppProfile | null>(null)

export function useAppProfile() {
  return useContext(ProfileContext)
}
