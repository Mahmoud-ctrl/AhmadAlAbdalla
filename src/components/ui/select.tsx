import { cn } from '@/lib/utils'
import { SelectHTMLAttributes, forwardRef } from 'react'

const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <div className="relative">
      <select
        ref={ref}
        className={cn(
          'flex h-9 w-full rounded-md border border-[#DADADA] bg-white px-3 py-2 text-sm text-[#111111] focus:outline-none focus:border-[#E8231A] focus:ring-1 focus:ring-[#E8231A]/20 transition-colors disabled:opacity-50 appearance-none cursor-pointer pr-8',
          className
        )}
        {...props}
      >
        {children}
      </select>
      <div className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center">
        <svg className="h-3.5 w-3.5 text-[#9CA3AF]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>
    </div>
  )
)
Select.displayName = 'Select'

export { Select }
