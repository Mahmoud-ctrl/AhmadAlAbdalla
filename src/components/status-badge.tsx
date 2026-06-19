'use client'

import { Badge } from '@/components/ui/badge'
import { useLanguage } from '@/contexts/language-context'
import type { TransferStatus } from '@/types'

interface StatusBadgeProps {
  status: TransferStatus
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const { t } = useLanguage()

  const dot = (
    <span
      className={
        status === 'confirmed' ? 'h-1.5 w-1.5 rounded-full bg-green-400' :
        status === 'admin_resolved' ? 'h-1.5 w-1.5 rounded-full bg-blue-400' :
        status === 'cancelled' ? 'h-1.5 w-1.5 rounded-full bg-[#9CA3AF]' :
        status === 'needs_admin_review' ? 'h-1.5 w-1.5 rounded-full bg-red-400' :
        'h-1.5 w-1.5 rounded-full bg-amber-400'
      }
    />
  )

  const variant =
    status === 'confirmed' ? 'success' :
    status === 'admin_resolved' ? 'info' :
    status === 'needs_admin_review' ? 'destructive' :
    status === 'cancelled' ? 'muted' :
    'warning'

  return (
    <Badge variant={variant}>
      {dot}
      {t.status[status]}
    </Badge>
  )
}
