import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}

export function formatDate(date: string): string {
  return new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(date))
}

export function formatDateInput(date: string): string {
  return new Date(date).toISOString().split('T')[0]
}

export function computeStatus(qty: number, qtyReturned: number): 'pending' | 'partial' | 'returned' {
  const q = Number(qty)
  const r = Number(qtyReturned)
  if (r >= q) return 'returned'
  if (r > 0) return 'partial'
  return 'pending'
}
