'use client'
import { cn } from '@/lib/utils'
import { ButtonHTMLAttributes, forwardRef } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'secondary' | 'destructive' | 'ghost' | 'outline'
  size?: 'sm' | 'md' | 'lg' | 'icon'
  loading?: boolean
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'md', loading, children, disabled, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-all duration-150 cursor-pointer select-none disabled:opacity-50 disabled:cursor-not-allowed',
        variant === 'default'     && 'bg-[#E8231A] text-white hover:bg-[#f03020] active:scale-[0.98]',
        variant === 'secondary'   && 'bg-[#F0F0F0] text-[#111111] hover:bg-[#E5E5E5] border border-[#DADADA]',
        variant === 'destructive' && 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200',
        variant === 'ghost'       && 'text-[#6B7280] hover:text-[#111111] hover:bg-black/5',
        variant === 'outline'     && 'border border-[#DADADA] text-[#111111] hover:border-[#BBBBBB] hover:bg-black/5',
        size === 'sm'   && 'h-8 px-3 text-xs',
        size === 'md'   && 'h-9 px-4 text-sm',
        size === 'lg'   && 'h-10 px-5 text-sm',
        size === 'icon' && 'h-8 w-8',
        className
      )}
      {...props}
    >
      {loading && (
        <span className="h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin shrink-0" />
      )}
      {children}
    </button>
  )
)
Button.displayName = 'Button'

export { Button }
