'use client'
import { createContext, useContext } from 'react'
import type { AppRole } from '@/types'

export type AppProfile = {
  id: string
  role: AppRole
  branches: { id: string; name: string }[]
  username: string
  full_name: string | null
}

export const ProfileContext = createContext<AppProfile | null>(null)

export function useAppProfile() {
  return useContext(ProfileContext)
}
