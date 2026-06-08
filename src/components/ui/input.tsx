import { cn } from '@/lib/utils'
import { InputHTMLAttributes, forwardRef } from 'react'

const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'flex h-9 w-full rounded-md border border-[#DADADA] bg-white px-3 py-2 text-sm text-[#111111] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#E8231A] focus:ring-1 focus:ring-[#E8231A]/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
        className
      )}
      {...props}
    />
  )
)
Input.displayName = 'Input'

export { Input }
