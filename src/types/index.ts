export type Branch = {
  id: string
  name: string
  location: string | null
}

export type Item = {
  id: string
  name: string
  unit: string
  price_per_unit: number
}

export type AppRole = 'super_admin' | 'branch_manager' | 'district_manager'

export type UserProfile = {
  id: string
  username: string
  mobile_number: string
  full_name: string | null
  branch_id: string | null
  role: AppRole
  active: boolean
  must_change_password: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export type TransferStatus =
  | 'pending_receipt'
  | 'confirmed'
  | 'needs_admin_review'
  | 'admin_resolved'
  | 'cancelled'

export type Transfer = {
  id: string
  sender_branch_id: string
  receiver_branch_id: string
  status: TransferStatus
  created_by: string
  received_by: string | null
  resolved_by: string | null
  sent_at: string
  received_at: string | null
  resolved_at: string | null
  notes: string | null
  admin_notes: string | null
  created_at: string
  updated_at: string
}

export type TransferLine = {
  id: string
  transfer_id: string
  item_id: string
  quantity_sent: number
  quantity_received: number | null
  unit_price_snapshot: number
  item: Item
}

export type TransferEvent = {
  id: string
  transfer_id: string
  actor_id: string | null
  event_type: string
  details: Record<string, unknown>
  created_at: string
}

export type TransferRow = Transfer & {
  sender_branch: Branch
  receiver_branch: Branch
  transfer_lines: TransferLine[]
  transfer_events?: TransferEvent[]
}
