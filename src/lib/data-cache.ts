import { supabase } from './supabase'
import type { Branch, Item } from '@/types'

let branchesCache: Branch[] | null = null
let itemsCache: Item[] | null = null

export async function fetchBranches(): Promise<Branch[]> {
  if (branchesCache) return branchesCache
  const { data } = await supabase.from('branches').select('*').order('name')
  branchesCache = data ?? []
  return branchesCache
}

export async function fetchItems(): Promise<Item[]> {
  if (itemsCache) return itemsCache
  const { data } = await supabase.from('items').select('*').order('name')
  itemsCache = data ?? []
  return itemsCache
}

export function invalidateBranches() { branchesCache = null }
export function invalidateItems() { itemsCache = null }
