import { Badge } from '@/components/ui/badge'
import { computeStatus } from '@/lib/utils'

interface StatusBadgeProps {
  quantity: number
  quantityReturned: number
}

export function StatusBadge({ quantity, quantityReturned }: StatusBadgeProps) {
  const status = computeStatus(quantity, quantityReturned)
  const dot = (
    <span
      className={
        status === 'returned' ? 'h-1.5 w-1.5 rounded-full bg-green-400' :
        status === 'partial'  ? 'h-1.5 w-1.5 rounded-full bg-blue-400' :
                                'h-1.5 w-1.5 rounded-full bg-amber-400'
      }
    />
  )
  return (
    <Badge variant={status === 'returned' ? 'success' : status === 'partial' ? 'info' : 'warning'}>
      {dot}
      {status === 'returned' ? 'Returned' : status === 'partial' ? 'Partial' : 'Outstanding'}
    </Badge>
  )
}
