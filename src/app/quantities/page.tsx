'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowDownUp, Boxes, Filter, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { fetchBranches, fetchItems } from '@/lib/data-cache'
import { useAppProfile } from '@/contexts/profile-context'
import { useLanguage } from '@/contexts/language-context'
import type { Branch, Item, TransferRow, TransferStatus } from '@/types'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

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

function formatQty(value: number) {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
  }).format(value)
}

function dateInputValue(date: string) {
  return new Date(date).toISOString().split('T')[0]
}

export default function QuantitiesPage() {
  const profile = useAppProfile()
  const { t } = useLanguage()
  const [branches, setBranches] = useState<Branch[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [transfers, setTransfers] = useState<TransferRow[]>([])
  const [loading, setLoading] = useState(true)

  const [branchFilter, setBranchFilter] = useState('all')
  const [counterpartyFilter, setCounterpartyFilter] = useState('all')
  const [itemFilter, setItemFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<TransferStatus | 'all'>('all')
  const [directionFilter, setDirectionFilter] = useState<DirectionFilter>('all')
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [allTime, setAllTime] = useState(false)
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('branch')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  useEffect(() => {
    async function load() {
      const [branchData, itemData, transferResult] = await Promise.all([
        fetchBranches(),
        fetchItems(),
        supabase
          .from('transfers')
          .select('id, status, sent_at, received_at, sender_branch_id, receiver_branch_id, sender_branch:branches!sender_branch_id(id,name,location), receiver_branch:branches!receiver_branch_id(id,name,location), transfer_lines(id, transfer_id, item_id, quantity_sent, quantity_received, unit_price_snapshot, item:items(id,name,unit,price_per_unit))')
          .order('sent_at', { ascending: false }),
      ])

      setBranches(branchData)
      setItems(itemData)
      setTransfers((transferResult.data as unknown as TransferRow[]) ?? [])
      setLoading(false)
    }

    load()
  }, [])

  useEffect(() => {
    if (profile?.role === 'branch_manager' && profile.branch_id) {
      setBranchFilter(profile.branch_id)
    }
  }, [profile])

  const selectedBranchId = profile?.role === 'branch_manager' ? profile.branch_id ?? 'all' : branchFilter
  const isManager = profile?.role === 'branch_manager'

  const { dateFrom, dateTo } = useMemo(() => {
    if (allTime) return { dateFrom: '', dateTo: '' }
    const [year, month] = selectedMonth.split('-').map(Number)
    const from = new Date(year, month - 1, 1)
    const to = new Date(year, month, 0)
    return {
      dateFrom: from.toISOString().split('T')[0],
      dateTo: to.toISOString().split('T')[0],
    }
  }, [selectedMonth, allTime])

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

  return (
    <div className="px-4 py-5 sm:px-8 sm:py-8 max-w-7xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[#111111]">{t.quantities.title}</h1>
          <p className="text-sm text-[#888888] mt-0.5">
            {isManager
              ? t.quantities.subtitleManager(profile?.branch?.name ?? t.quantities.yourBranch)
              : t.quantities.subtitleAdmin}
            {!allTime && (
              <span className="ml-2 text-xs font-medium text-[#E8231A]">
                — {new Date(selectedMonth + '-01').toLocaleString('en-US', { month: 'long', year: 'numeric' })}
              </span>
            )}
          </p>
        </div>
        <Badge variant={isManager ? 'info' : 'accent'}>
          {isManager ? t.quantities.branchScoped : t.quantities.superAdminView}
        </Badge>
      </div>

      <Card className="p-4 mb-5 bg-white">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="h-4 w-4 text-[#888888]" />
          <h2 className="text-sm font-medium text-[#111111]">{t.quantities.advancedFilters}</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          <div>
            <Label htmlFor="search">{t.quantities.search}</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[#9CA3AF]" />
              <Input
                id="search"
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder={t.quantities.searchPlaceholder}
                className="pl-9"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="branch-filter">{t.quantities.branch}</Label>
            <Select
              id="branch-filter"
              value={selectedBranchId}
              onChange={event => setBranchFilter(event.target.value)}
              disabled={isManager}
            >
              <option value="all">{t.quantities.allBranches}</option>
              {branches.map(branch => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </Select>
          </div>

          <div>
            <Label htmlFor="direction-filter">{t.quantities.direction}</Label>
            <Select id="direction-filter" value={directionFilter} onChange={event => setDirectionFilter(event.target.value as DirectionFilter)}>
              <option value="all">{t.quantities.incomingOutgoing}</option>
              <option value="incoming">{t.quantities.incomingOnly}</option>
              <option value="outgoing">{t.quantities.outgoingOnly}</option>
            </Select>
          </div>

          <div>
            <Label htmlFor="counterparty-filter">{t.quantities.counterparty}</Label>
            <Select id="counterparty-filter" value={counterpartyFilter} onChange={event => setCounterpartyFilter(event.target.value)}>
              <option value="all">{t.quantities.allCounterparties}</option>
              {branches
                .filter(branch => branch.id !== selectedBranchId)
                .map(branch => (
                  <option key={branch.id} value={branch.id}>{branch.name}</option>
                ))}
            </Select>
          </div>

          <div>
            <Label htmlFor="item-filter">{t.quantities.item}</Label>
            <Select id="item-filter" value={itemFilter} onChange={event => setItemFilter(event.target.value)}>
              <option value="all">{t.quantities.allItems}</option>
              {items.map(item => (
                <option key={item.id} value={item.id}>{item.name} ({item.unit})</option>
              ))}
            </Select>
          </div>

          <div>
            <Label htmlFor="status-filter">{t.quantities.status}</Label>
            <Select id="status-filter" value={statusFilter} onChange={event => setStatusFilter(event.target.value as TransferStatus | 'all')}>
              <option value="all">{t.transfers.allStatuses}</option>
              <option value="pending_receipt">{t.status.pending_receipt}</option>
              <option value="confirmed">{t.status.confirmed}</option>
              <option value="needs_admin_review">{t.status.needs_admin_review}</option>
              <option value="admin_resolved">{t.status.admin_resolved}</option>
              <option value="cancelled">{t.status.cancelled}</option>
            </Select>
          </div>

          <div>
            <Label htmlFor="month-picker">{t.quantities.month}</Label>
            <Input
              id="month-picker"
              type="month"
              value={allTime ? '' : selectedMonth}
              disabled={allTime}
              onChange={event => { setSelectedMonth(event.target.value); setAllTime(false) }}
            />
          </div>

          <div className="flex flex-col justify-end">
            <label className="flex items-center gap-2 text-sm text-[#444444] cursor-pointer h-9 px-1">
              <input
                type="checkbox"
                checked={allTime}
                onChange={event => setAllTime(event.target.checked)}
                className="rounded"
              />
              {t.quantities.showAllTime}
            </label>
          </div>

          <div>
            <Label htmlFor="sort-key">{t.quantities.sortBy}</Label>
            <Select id="sort-key" value={sortKey} onChange={event => setSortKey(event.target.value as SortKey)}>
              <option value="branch">{t.quantities.branch}</option>
              <option value="item">{t.quantities.item}</option>
              <option value="incoming">{t.quantities.incomingReceived}</option>
              <option value="outgoing">{t.quantities.outgoingSent}</option>
              <option value="pending">{t.quantities.pendingIncoming}</option>
              <option value="discrepancy">{t.quantities.discrepancy}</option>
              <option value="net">{t.quantities.netQuantity}</option>
            </Select>
          </div>

          <div>
            <Label htmlFor="sort-dir">{t.quantities.sortDirection}</Label>
            <Select id="sort-dir" value={sortDir} onChange={event => setSortDir(event.target.value as 'asc' | 'desc')}>
              <option value="asc">{t.quantities.ascending}</option>
              <option value="desc">{t.quantities.descending}</option>
            </Select>
          </div>
        </div>
      </Card>

      <Card className="bg-white">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-[#E5E5E5]">
          <div className="flex items-center gap-2">
            <Boxes className="h-4 w-4 text-[#888888]" />
            <h2 className="text-sm font-medium text-[#111111]">{t.quantities.branchItemQuantities}</h2>
          </div>
          <div className="flex items-center gap-1 text-xs text-[#888888]">
            <ArrowDownUp className="h-3.5 w-3.5" />
            {t.quantities.rowCount(rows.length)}
          </div>
        </div>

        {loading ? (
          <div className="px-6 py-12 text-center text-sm text-[#444444]">{t.common.loading}</div>
        ) : rows.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-[#888888]">{t.quantities.noResults}</div>
        ) : (
          <>
            {/* Mobile card view */}
            <div className="sm:hidden divide-y divide-[#F0F0F0]">
              {rows.map(row => {
                const net = row.incomingReceived - row.outgoingSent
                return (
                  <div key={row.key} className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-sm text-[#111111]">{row.branchName}</p>
                        <p className="text-sm text-[#444444]">{row.itemName}</p>
                        <p className="text-xs text-[#888888]">{row.unit}</p>
                      </div>
                      <p className="text-xs text-[#888888] font-mono shrink-0">{t.quantities.lineCount(row.transferCount)}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                      <div className="flex justify-between gap-2">
                        <span className="text-[#888888]">{t.quantities.incoming}</span>
                        <span className="font-mono">{formatQty(row.incomingReceived)}</span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-[#888888]">{t.quantities.outgoing}</span>
                        <span className="font-mono">{formatQty(row.outgoingSent)}</span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-[#888888]">{t.quantities.pending}</span>
                        <span className="font-mono text-amber-500">{formatQty(row.pendingIncoming)}</span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-[#888888]">{t.quantities.net}</span>
                        <span className={`font-mono ${net < 0 ? 'text-red-500' : net > 0 ? 'text-green-500' : 'text-[#888888]'}`}>{formatQty(net)}</span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-[#888888]">{t.quantities.discrepancy}</span>
                        <span className={`font-mono ${row.discrepancy > 0 ? 'text-red-500' : 'text-[#888888]'}`}>{formatQty(row.discrepancy)}</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Desktop table view */}
            <div className="hidden sm:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t.quantities.branch}</TableHead>
                    <TableHead>{t.quantities.item}</TableHead>
                    <TableHead className="text-right">{t.quantities.incomingReceived}</TableHead>
                    <TableHead className="text-right">{t.quantities.outgoingSent}</TableHead>
                    <TableHead className="text-right">{t.quantities.pendingIncoming}</TableHead>
                    <TableHead className="text-right">{t.quantities.net}</TableHead>
                    <TableHead className="text-right">{t.quantities.discrepancy}</TableHead>
                    <TableHead className="text-right">{t.quantities.lines}</TableHead>
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
            </div>
          </>
        )}
      </Card>
    </div>
  )
}
