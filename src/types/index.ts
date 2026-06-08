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

export type TransferStatus = 'pending' | 'partial' | 'returned'

export type Transfer = {
  id: string
  from_branch_id: string
  to_branch_id: string
  item_id: string
  quantity: number
  quantity_returned: number
  status: TransferStatus
  date: string
  return_date: string | null
  notes: string | null
}

export type TransferRow = Transfer & {
  from_branch: Branch
  to_branch: Branch
  item: Item
}
