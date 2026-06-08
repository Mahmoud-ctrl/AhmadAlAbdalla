'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowDownUp, Boxes, Filter, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { AppRole, Branch, Item, TransferRow, TransferStatus } from '@/types'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

type Profile = {
  branch_id: string | null
  role: AppRole
  branch: Pick<Branch, 'id' | 'name'> | null
}

type DirectionFilter = 'all' | 'incoming' | 'outgoing'
type SortKey = 'branch' | 'item' | 'incoming' | 'outgoing' | 'pending' | 'discrepancy' | 'net'

type QuantityRow = {
  key: string
  branchId: string
  branchName: string
  itemId: string
  itemName: string
  unit: string
  incomingReceived: number
  outgoingSent: number
  pendingIncoming: number
  discrepancy: number
  transferCount: number
}

const statuses: Array<{ value: TransferStatus | 'all'; label: string }> = [
  { value: 'all', label: 'All Statuses' },
  { value: 'pending_receipt', label: 'Pending Receipt' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'needs_admin_review', label: 'Needs Review' },
  { value: 'admin_resolved', label: 'Admin Resolved' },
  { value: 'cancelled', label: 'Cancelled' },
]

function formatQty(value: number) {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
  }).format(value)
}

function dateInputValue(date: string) {
  return new Date(date).toISOString().split('T')[0]
}

export default function QuantitiesPage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [branches, setBranches] = useState<Branch[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [transfers, setTransfers] = useState<TransferRow[]>([])
  const [loading, setLoading] = useState(true)

  const [branchFilter, setBranchFilter] = useState('all')
  const [counterpartyFilter, setCounterpartyFilter] = useState('all')
  const [itemFilter, setItemFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<TransferStatus | 'all'>('all')
  const [directionFilter, setDirectionFilter] = useState<DirectionFilter>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('branch')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  useEffect(() => {
    async function load() {
      const { data: sessionResult } = await supabase.auth.getSession()
      const userId = sessionResult.session?.user.id

      const [profileResult, branchResult, itemResult, transferResult] = await Promise.all([
        userId
          ? supabase
              .from('user_profiles')
              .select('branch_id, role, branch:branches(id,name)')
              .eq('id', userId)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        supabase.from('branches').select('*').order('name'),
        supabase.from('items').select('*').order('name'),
        supabase
          .from('transfers')
          .select('id, status, sent_at, received_at, sender_branch_id, receiver_branch_id, sender_branch:branches!sender_branch_id(id,name,location), receiver_branch:branches!receiver_branch_id(id,name,location), transfer_lines(id, transfer_id, item_id, quantity_sent, quantity_received, unit_price_snapshot, item:items(id,name,unit,price_per_unit))')
          .order('sent_at', { ascending: false }),
      ])

      const nextProfile = (profileResult.data as unknown as Profile | null) ?? null
      setProfile(nextProfile)
      setBranches(branchResult.data ?? [])
      setItems(itemResult.data ?? [])
      setTransfers((transferResult.data as unknown as TransferRow[]) ?? [])
      setBranchFilter(nextProfile?.role === 'branch_manager' && nextProfile.branch_id ? nextProfile.branch_id : 'all')
      setLoading(false)
    }

    load()
  }, [])

  const selectedBranchId = profile?.role === 'branch_manager' ? profile.branch_id ?? 'all' : branchFilter
  const isManager = profile?.role === 'branch_manager'

  const filteredTransfers = useMemo(() => {
    return transfers.filter(transfer => {
      const sentDate = dateInputValue(transfer.sent_at)

      if (statusFilter !== 'all' && transfer.status !== statusFilter) return false
      if (dateFrom && sentDate < dateFrom) return false
      if (dateTo && sentDate > dateTo) return false

      if (selectedBranchId !== 'all') {
        const branchMatches = transfer.sender_branch_id === selectedBranchId || transfer.receiver_branch_id === selectedBranchId
        if (!branchMatches) return false

        if (directionFilter === 'incoming' && transfer.receiver_branch_id !== selectedBranchId) return false
        if (directionFilter === 'outgoing' && transfer.sender_branch_id !== selectedBranchId) return false

        if (counterpartyFilter !== 'all') {
          const counterpartyMatches =
            (transfer.sender_branch_id === selectedBranchId && transfer.receiver_branch_id === counterpartyFilter)
            || (transfer.receiver_branch_id === selectedBranchId && transfer.sender_branch_id === counterpartyFilter)
          if (!counterpartyMatches) return false
        }
      } else if (counterpartyFilter !== 'all') {
        if (transfer.sender_branch_id !== counterpartyFilter && transfer.receiver_branch_id !== counterpartyFilter) return false
      }

      if (itemFilter !== 'all' && !transfer.transfer_lines.some(line => line.item_id === itemFilter)) return false

      return true
    })
  }, [counterpartyFilter, dateFrom, dateTo, directionFilter, itemFilter, selectedBranchId, statusFilter, transfers])

  const rows = useMemo(() => {
    const map = new Map<string, QuantityRow>()

    function upsert(branch: Branch, item: Item): QuantityRow {
      const key = `${branch.id}:${item.id}`
      const existing = map.get(key)

      if (existing) return existing

      const next: QuantityRow = {
        key,
        branchId: branch.id,
        branchName: branch.name,
        itemId: item.id,
        itemName: item.name,
        unit: item.unit,
        incomingReceived: 0,
        outgoingSent: 0,
        pendingIncoming: 0,
        discrepancy: 0,
        transferCount: 0,
      }
      map.set(key, next)
      return next
    }

    for (const transfer of filteredTransfers) {
      const sender = transfer.sender_branch
      const receiver = transfer.receiver_branch

      for (const line of transfer.transfer_lines) {
        if (itemFilter !== 'all' && line.item_id !== itemFilter) continue

        const item = line.item
        const sent = Number(line.quantity_sent)
        const received = Number(line.quantity_received ?? 0)
        const difference = Math.abs(sent - received)

        if (selectedBranchId === 'all' && directionFilter !== 'incoming') {
          const senderRow = upsert(sender, item)
          senderRow.outgoingSent += sent
          senderRow.discrepancy += transfer.status === 'pending_receipt' ? 0 : difference
          senderRow.transferCount += 1
        }

        if (selectedBranchId === 'all' && directionFilter !== 'outgoing') {
          const receiverRow = upsert(receiver, item)
          receiverRow.incomingReceived += received
          receiverRow.pendingIncoming += transfer.status === 'pending_receipt' ? sent : 0
          receiverRow.discrepancy += transfer.status === 'pending_receipt' ? 0 : difference
          receiverRow.transferCount += 1
        }

        if (selectedBranchId !== 'all' && transfer.sender_branch_id === selectedBranchId && directionFilter !== 'incoming') {
          const senderRow = upsert(sender, item)
          senderRow.outgoingSent += sent
          senderRow.discrepancy += transfer.status === 'pending_receipt' ? 0 : difference
          senderRow.transferCount += 1
        }

        if (selectedBranchId !== 'all' && transfer.receiver_branch_id === selectedBranchId && directionFilter !== 'outgoing') {
          const receiverRow = upsert(receiver, item)
          receiverRow.incomingReceived += received
          receiverRow.pendingIncoming += transfer.status === 'pending_receipt' ? sent : 0
          receiverRow.discrepancy += transfer.status === 'pending_receipt' ? 0 : difference
          receiverRow.transferCount += 1
        }
      }
    }

    const normalizedSearch = search.trim().toLowerCase()
    const filteredRows = Array.from(map.values()).filter(row => {
      if (!normalizedSearch) return true
      return row.branchName.toLowerCase().includes(normalizedSearch) || row.itemName.toLowerCase().includes(normalizedSearch)
    })

    filteredRows.sort((a, b) => {
      const direction = sortDir === 'asc' ? 1 : -1
      const aNet = a.incomingReceived - a.outgoingSent
      const bNet = b.incomingReceived - b.outgoingSent

      if (sortKey === 'branch') return a.branchName.localeCompare(b.branchName) * direction || a.itemName.localeCompare(b.itemName)
      if (sortKey === 'item') return a.itemName.localeCompare(b.itemName) * direction || a.branchName.localeCompare(b.branchName)
      if (sortKey === 'incoming') return (a.incomingReceived - b.incomingReceived) * direction
      if (sortKey === 'outgoing') return (a.outgoingSent - b.outgoingSent) * direction
      if (sortKey === 'pending') return (a.pendingIncoming - b.pendingIncoming) * direction
      if (sortKey === 'discrepancy') return (a.discrepancy - b.discrepancy) * direction
      return (aNet - bNet) * direction
    })

    return filteredRows
  }, [directionFilter, filteredTransfers, itemFilter, search, selectedBranchId, sortDir, sortKey])

  const totals = useMemo(() => {
    return rows.reduce(
      (sum, row) => ({
        incoming: sum.incoming + row.incomingReceived,
        outgoing: sum.outgoing + row.outgoingSent,
        pending: sum.pending + row.pendingIncoming,
        discrepancy: sum.discrepancy + row.discrepancy,
      }),
      { incoming: 0, outgoing: 0, pending: 0, discrepancy: 0 }
    )
  }, [rows])

  return (
    <div className="px-4 py-5 sm:px-8 sm:py-8 max-w-7xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[#111111]">Quantity Tracker</h1>
          <p className="text-sm text-[#888888] mt-0.5">
            {isManager
              ? `In and out movement for ${profile?.branch?.name ?? 'your branch'}`
              : 'Total item quantities across all branches'}
          </p>
        </div>
        <Badge variant={isManager ? 'info' : 'accent'}>
          {isManager ? 'Branch scoped' : 'Super admin view'}
        </Badge>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Metric label="Incoming Received" value={formatQty(totals.incoming)} />
        <Metric label="Outgoing Sent" value={formatQty(totals.outgoing)} />
        <Metric label="Pending Incoming" value={formatQty(totals.pending)} tone="amber" />
        <Metric label="Discrepancy Qty" value={formatQty(totals.discrepancy)} tone={totals.discrepancy > 0 ? 'red' : 'green'} />
      </div>

      <Card className="p-4 mb-5 bg-white">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="h-4 w-4 text-[#888888]" />
          <h2 className="text-sm font-medium text-[#111111]">Advanced Filters</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          <div>
            <Label htmlFor="search">Search</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[#9CA3AF]" />
              <Input
                id="search"
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Branch or item"
                className="pl-9"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="branch-filter">Branch</Label>
            <Select
              id="branch-filter"
              value={selectedBranchId}
              onChange={event => setBranchFilter(event.target.value)}
              disabled={isManager}
            >
              <option value="all">All branches</option>
              {branches.map(branch => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </Select>
          </div>

          <div>
            <Label htmlFor="direction-filter">Direction</Label>
            <Select id="direction-filter" value={directionFilter} onChange={event => setDirectionFilter(event.target.value as DirectionFilter)}>
              <option value="all">Incoming + Outgoing</option>
              <option value="incoming">Incoming Only</option>
              <option value="outgoing">Outgoing Only</option>
            </Select>
          </div>

          <div>
            <Label htmlFor="counterparty-filter">Counterparty</Label>
            <Select id="counterparty-filter" value={counterpartyFilter} onChange={event => setCounterpartyFilter(event.target.value)}>
              <option value="all">All counterparties</option>
              {branches
                .filter(branch => branch.id !== selectedBranchId)
                .map(branch => (
                  <option key={branch.id} value={branch.id}>{branch.name}</option>
                ))}
            </Select>
          </div>

          <div>
            <Label htmlFor="item-filter">Item</Label>
            <Select id="item-filter" value={itemFilter} onChange={event => setItemFilter(event.target.value)}>
              <option value="all">All items</option>
              {items.map(item => (
                <option key={item.id} value={item.id}>{item.name} ({item.unit})</option>
              ))}
            </Select>
          </div>

          <div>
            <Label htmlFor="status-filter">Status</Label>
            <Select id="status-filter" value={statusFilter} onChange={event => setStatusFilter(event.target.value as TransferStatus | 'all')}>
              {statuses.map(status => (
                <option key={status.value} value={status.value}>{status.label}</option>
              ))}
            </Select>
          </div>

          <div>
            <Label htmlFor="date-from">From</Label>
            <Input id="date-from" type="date" value={dateFrom} onChange={event => setDateFrom(event.target.value)} />
          </div>

          <div>
            <Label htmlFor="date-to">To</Label>
            <Input id="date-to" type="date" value={dateTo} onChange={event => setDateTo(event.target.value)} />
          </div>

          <div>
            <Label htmlFor="sort-key">Sort By</Label>
            <Select id="sort-key" value={sortKey} onChange={event => setSortKey(event.target.value as SortKey)}>
              <option value="branch">Branch</option>
              <option value="item">Item</option>
              <option value="incoming">Incoming Received</option>
              <option value="outgoing">Outgoing Sent</option>
              <option value="pending">Pending Incoming</option>
              <option value="discrepancy">Discrepancy</option>
              <option value="net">Net Quantity</option>
            </Select>
          </div>

          <div>
            <Label htmlFor="sort-dir">Sort Direction</Label>
            <Select id="sort-dir" value={sortDir} onChange={event => setSortDir(event.target.value as 'asc' | 'desc')}>
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </Select>
          </div>
        </div>
      </Card>

      <Card className="bg-white">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-[#E5E5E5]">
          <div className="flex items-center gap-2">
            <Boxes className="h-4 w-4 text-[#888888]" />
            <h2 className="text-sm font-medium text-[#111111]">Branch Item Quantities</h2>
          </div>
          <div className="flex items-center gap-1 text-xs text-[#888888]">
            <ArrowDownUp className="h-3.5 w-3.5" />
            {rows.length} row{rows.length === 1 ? '' : 's'}
          </div>
        </div>

        {loading ? (
          <div className="px-6 py-12 text-center text-sm text-[#444444]">Loading...</div>
        ) : rows.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-[#888888]">No quantities match the selected filters.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Branch</TableHead>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Incoming Received</TableHead>
                <TableHead className="text-right">Outgoing Sent</TableHead>
                <TableHead className="text-right">Pending Incoming</TableHead>
                <TableHead className="text-right">Net</TableHead>
                <TableHead className="text-right">Discrepancy</TableHead>
                <TableHead className="text-right">Lines</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(row => {
                const net = row.incomingReceived - row.outgoingSent
                return (
                  <TableRow key={row.key}>
                    <TableCell className="font-medium">{row.branchName}</TableCell>
                    <TableCell>
                      <p className="font-medium">{row.itemName}</p>
                      <p className="text-xs text-[#888888]">{row.unit}</p>
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs tabular">{formatQty(row.incomingReceived)}</TableCell>
                    <TableCell className="text-right font-mono text-xs tabular">{formatQty(row.outgoingSent)}</TableCell>
                    <TableCell className="text-right font-mono text-xs tabular text-amber-500">{formatQty(row.pendingIncoming)}</TableCell>
                    <TableCell className={`text-right font-mono text-xs tabular ${net < 0 ? 'text-red-500' : net > 0 ? 'text-green-500' : 'text-[#888888]'}`}>
                      {formatQty(net)}
                    </TableCell>
                    <TableCell className={`text-right font-mono text-xs tabular ${row.discrepancy > 0 ? 'text-red-500' : 'text-[#888888]'}`}>
                      {formatQty(row.discrepancy)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs tabular text-[#888888]">{row.transferCount}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  )
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: 'amber' | 'green' | 'red' }) {
  const valueColor = tone === 'amber' ? 'text-amber-500' : tone === 'green' ? 'text-green-500' : tone === 'red' ? 'text-red-500' : 'text-[#111111]'

  return (
    <Card className="p-4 bg-white">
      <p className="text-[10px] text-[#9CA3AF] uppercase tracking-wider mb-1">{label}</p>
      <p className={`font-mono text-xl font-bold tabular ${valueColor}`}>{value}</p>
    </Card>
  )
}
