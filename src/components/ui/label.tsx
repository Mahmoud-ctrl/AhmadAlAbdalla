import { cn } from '@/lib/utils'
import { LabelHTMLAttributes } from 'react'

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn('block text-xs font-medium text-[#6B7280] uppercase tracking-wider mb-1.5', className)}
      {...props}
    />
  )
}
