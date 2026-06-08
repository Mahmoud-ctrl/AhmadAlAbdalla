import { cn } from '@/lib/utils'
import { HTMLAttributes } from 'react'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'accent' | 'success' | 'warning' | 'info' | 'destructive' | 'muted'
}

export function Badge({ className, variant = 'muted', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium border',
        variant === 'accent' && 'bg-[#E8231A]/10 text-[#E8231A] border-[#E8231A]/25',
        variant === 'success' && 'bg-green-500/10 text-green-400 border-green-500/25',
        variant === 'warning' && 'bg-amber-500/10 text-amber-400 border-amber-500/25',
        variant === 'info' && 'bg-blue-500/10 text-blue-400 border-blue-500/25',
        variant === 'destructive' && 'bg-red-500/10 text-red-400 border-red-500/25',
        variant === 'muted' && 'bg-white/5 text-[#888888] border-white/10',
        className
      )}
      {...props}
    />
  )
}
