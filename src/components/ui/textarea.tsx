import { cn } from '@/lib/utils'
import { TextareaHTMLAttributes, forwardRef } from 'react'

const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'flex min-h-[80px] w-full rounded-md border border-[#DADADA] bg-white px-3 py-2 text-sm text-[#111111] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#E8231A] focus:ring-1 focus:ring-[#E8231A]/20 transition-colors resize-none disabled:opacity-50',
        className
      )}
      {...props}
    />
  )
)
Textarea.displayName = 'Textarea'

export { Textarea }
