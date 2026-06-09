'use client'

import { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AlertCircle, CheckCircle, Clock, Download, Filter, Printer, TrendingUp } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Branch, Item, TransferRow, TransferStatus } from '@/types'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

type BranchStat = Branch & {
  incomingReceivedQty: number
  outgoingSentQty: number
  pendingIncomingQty: number
  discrepancyQty: number
  transferCount: number
}

type ItemStat = Item & {
  quantitySent: number
  quantityReceived: number
  pendingQuantity: number
  discrepancyQuantity: number
}

type DatePreset = 'all' | 'today' | 'week' | 'month' | 'last_month' | 'custom'

const statusOptions: Array<{ value: TransferStatus | 'all'; label: string }> = [
  { value: 'all', label: 'All Statuses' },
  { value: 'pending_receipt', label: 'Pending Receipt' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'needs_admin_review', label: 'Needs Review' },
  { value: 'admin_resolved', label: 'Admin Resolved' },
  { value: 'cancelled', label: 'Cancelled' },
]

function sentQuantity(transfer: TransferRow) {
  return transfer.transfer_lines.reduce((sum, line) => sum + Number(line.quantity_sent), 0)
}

function receivedQuantity(transfer: TransferRow) {
  return transfer.transfer_lines.reduce((sum, line) => sum + Number(line.quantity_received ?? 0), 0)
}

function pendingQuantity(transfer: TransferRow) {
  return transfer.status === 'pending_receipt' ? sentQuantity(transfer) : 0
}

function discrepancyQuantity(transfer: TransferRow) {
  return transfer.transfer_lines.reduce(
    (sum, line) => sum + Math.abs(Number(line.quantity_sent) - Number(line.quantity_received ?? 0)),
    0
  )
}

function formatQty(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value)
}

function dateInputValue(date: Date | string) {
  return new Date(date).toISOString().split('T')[0]
}

function presetRange(preset: DatePreset) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  if (preset === 'today') return { from: dateInputValue(today), to: dateInputValue(today) }

  if (preset === 'week') {
    const from = new Date(today)
    from.setDate(today.getDate() - 6)
    return { from: dateInputValue(from), to: dateInputValue(today) }
  }

  if (preset === 'month') {
    const from = new Date(today.getFullYear(), today.getMonth(), 1)
    return { from: dateInputValue(from), to: dateInputValue(today) }
  }

  if (preset === 'last_month') {
    const from = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    const to = new Date(today.getFullYear(), today.getMonth(), 0)
    return { from: dateInputValue(from), to: dateInputValue(to) }
  }

  return { from: '', to: '' }
}

function csvEscape(value: string | number) {
  return `"${String(value).replaceAll('"', '""')}"`
}

export default function ReportPage() {
  const [branches, setBranches] = useState<Branch[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [transfers, setTransfers] = useState<TransferRow[]>([])
  const [loading, setLoading] = useState(true)

  const [datePreset, setDatePreset] = useState<DatePreset>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [statusFilter, setStatusFilter] = useState<TransferStatus | 'all'>('all')
  const [branchFilter, setBranchFilter] = useState('all')

  useEffect(() => {
    async function load() {
      const [{ data: branchData }, { data: itemData }, { data: transferData }] = await Promise.all([
        supabase.from('branches').select('*').order('name'),
        supabase.from('items').select('*').order('name'),
        supabase
          .from('transfers')
          .select('id, status, sent_at, sender_branch_id, receiver_branch_id, transfer_lines(id, transfer_id, item_id, quantity_sent, quantity_received, unit_price_snapshot, item:items(id,name,unit,price_per_unit))')
          .order('sent_at', { ascending: false }),
      ])

      setBranches(branchData ?? [])
      setItems(itemData ?? [])
      setTransfers((transferData as unknown as TransferRow[]) ?? [])
      setLoading(false)
    }

    load()
  }, [])

  function updatePreset(value: DatePreset) {
    setDatePreset(value)
    if (value === 'custom') return

    const range = presetRange(value)
    setDateFrom(range.from)
    setDateTo(range.to)
  }

  const filteredTransfers = useMemo(() => {
    return transfers.filter(transfer => {
      const sentDate = dateInputValue(transfer.sent_at)

      if (statusFilter !== 'all' && transfer.status !== statusFilter) return false
      if (branchFilter !== 'all' && transfer.sender_branch_id !== branchFilter && transfer.receiver_branch_id !== branchFilter) return false
      if (dateFrom && sentDate < dateFrom) return false
      if (dateTo && sentDate > dateTo) return false

      return true
    })
  }, [branchFilter, dateFrom, dateTo, statusFilter, transfers])

  const branchStats = useMemo<BranchStat[]>(() => {
    return branches.map(branch => {
      const incoming = filteredTransfers.filter(transfer => transfer.receiver_branch_id === branch.id)
      const outgoing = filteredTransfers.filter(transfer => transfer.sender_branch_id === branch.id)

      return {
        ...branch,
        incomingReceivedQty: incoming.reduce((sum, transfer) => sum + receivedQuantity(transfer), 0),
        outgoingSentQty: outgoing.reduce((sum, transfer) => sum + sentQuantity(transfer), 0),
        pendingIncomingQty: incoming.reduce((sum, transfer) => sum + pendingQuantity(transfer), 0),
        discrepancyQty: incoming.reduce((sum, transfer) => sum + discrepancyQuantity(transfer), 0),
        transferCount: incoming.length + outgoing.length,
      }
    }).filter(branch => branch.transferCount > 0).sort((a, b) => b.discrepancyQty - a.discrepancyQty)
  }, [branches, filteredTransfers])

  const itemStats = useMemo<ItemStat[]>(() => {
    return items.map(item => {
      const lines = filteredTransfers.flatMap(transfer => transfer.transfer_lines.filter(line => line.item_id === item.id))
      const pendingLines = filteredTransfers
        .filter(transfer => transfer.status === 'pending_receipt')
        .flatMap(transfer => transfer.transfer_lines.filter(line => line.item_id === item.id))
      const quantitySent = lines.reduce((sum, line) => sum + Number(line.quantity_sent), 0)
      const quantityReceived = lines.reduce((sum, line) => sum + Number(line.quantity_received ?? 0), 0)
      const pendingQuantity = pendingLines.reduce((sum, line) => sum + Number(line.quantity_sent), 0)

      return {
        ...item,
        quantitySent,
        quantityReceived,
        pendingQuantity,
        discrepancyQuantity: Math.abs(quantitySent - quantityReceived),
      }
    }).filter(item => item.quantitySent > 0).sort((a, b) => b.discrepancyQuantity - a.discrepancyQuantity)
  }, [filteredTransfers, items])

  const summary = useMemo(() => {
    const sent = filteredTransfers.reduce((sum, transfer) => sum + sentQuantity(transfer), 0)
    const received = filteredTransfers.reduce((sum, transfer) => sum + receivedQuantity(transfer), 0)
    const pending = filteredTransfers.reduce((sum, transfer) => sum + pendingQuantity(transfer), 0)
    const discrepancy = filteredTransfers.reduce((sum, transfer) => sum + discrepancyQuantity(transfer), 0)
    const reviewCount = filteredTransfers.filter(transfer => transfer.status === 'needs_admin_review').length
    const pendingCount = filteredTransfers.filter(transfer => transfer.status === 'pending_receipt').length
    const discrepancyRate = sent > 0 ? (discrepancy / sent) * 100 : 0

    return { sent, received, pending, discrepancy, reviewCount, pendingCount, discrepancyRate }
  }, [filteredTransfers])

  const needsAttention = useMemo(() => {
    return {
      pending: filteredTransfers.filter(transfer => transfer.status === 'pending_receipt').slice(0, 5),
      discrepancies: filteredTransfers
        .map(transfer => ({ transfer, value: discrepancyQuantity(transfer) }))
        .filter(entry => entry.value > 0)
        .sort((a, b) => b.value - a.value)
        .slice(0, 5),
    }
  }, [filteredTransfers])

  const chartData = branchStats.slice(0, 10).map(branch => ({
    name: branch.name.length > 14 ? `${branch.name.slice(0, 13)}...` : branch.name,
    discrepancy: parseFloat(branch.discrepancyQty.toFixed(2)),
  }))

  function clearFilters() {
    setDatePreset('all')
    setDateFrom('')
    setDateTo('')
    setStatusFilter('all')
    setBranchFilter('all')
  }

  function exportCsv() {
    const rows = [
      ['Type', 'Name', 'Unit', 'Transfers', 'Outgoing Sent Qty', 'Incoming Received Qty', 'Pending Incoming Qty', 'Qty Sent', 'Qty Received', 'Pending Qty', 'Qty Difference'],
      ...branchStats.map(branch => [
        'Branch',
        branch.name,
        'mixed',
        branch.transferCount,
        branch.outgoingSentQty.toFixed(2),
        branch.incomingReceivedQty.toFixed(2),
        branch.pendingIncomingQty.toFixed(2),
        '',
        '',
        '',
        branch.discrepancyQty.toFixed(2),
      ]),
      ...itemStats.map(item => [
        'Item',
        item.name,
        item.unit,
        '',
        '',
        '',
        '',
        item.quantitySent.toFixed(2),
        item.quantityReceived.toFixed(2),
        item.pendingQuantity.toFixed(2),
        item.discrepancyQuantity.toFixed(2),
      ]),
    ]

    const csv = rows.map(row => row.map(value => csvEscape(value)).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')

    link.href = url
    link.download = `quantity-report-${dateInputValue(new Date())}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="px-4 py-5 sm:px-8 sm:py-8 max-w-6xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[#111111]">Quantity Report</h1>
          <p className="text-sm text-[#888888] mt-0.5">Branch movement and quantity discrepancy summary</p>
        </div>
        <div className="flex flex-wrap gap-2 no-print">
          <Button variant="outline" onClick={exportCsv} disabled={loading || filteredTransfers.length === 0}>
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="h-4 w-4" />
            Print
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-[#444444]">Loading...</div>
      ) : (
        <div className="space-y-8">
          <Card className="p-4 bg-white no-print">
            <div className="flex items-center gap-2 mb-4">
              <Filter className="h-4 w-4 text-[#888888]" />
              <h2 className="text-sm font-medium text-[#111111]">Report Filters</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
              <div>
                <Label htmlFor="date-preset">Date Range</Label>
                <Select id="date-preset" value={datePreset} onChange={event => updatePreset(event.target.value as DatePreset)}>
                  <option value="all">All Time</option>
                  <option value="today">Today</option>
                  <option value="week">Last 7 Days</option>
                  <option value="month">This Month</option>
                  <option value="last_month">Last Month</option>
                  <option value="custom">Custom</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="date-from">From</Label>
                <Input id="date-from" type="date" value={dateFrom} onChange={event => { setDatePreset('custom'); setDateFrom(event.target.value) }} />
              </div>
              <div>
                <Label htmlFor="date-to">To</Label>
                <Input id="date-to" type="date" value={dateTo} onChange={event => { setDatePreset('custom'); setDateTo(event.target.value) }} />
              </div>
              <div>
                <Label htmlFor="status-filter">Status</Label>
                <Select id="status-filter" value={statusFilter} onChange={event => setStatusFilter(event.target.value as TransferStatus | 'all')}>
                  {statusOptions.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="branch-filter">Branch</Label>
                <Select id="branch-filter" value={branchFilter} onChange={event => setBranchFilter(event.target.value)}>
                  <option value="all">All Branches</option>
                  {branches.map(branch => (
                    <option key={branch.id} value={branch.id}>{branch.name}</option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-[#888888]">
                Showing {filteredTransfers.length} of {transfers.length} transfers.
              </p>
              <button type="button" onClick={clearFilters} className="self-start text-xs text-[#888888] hover:text-[#111111] transition-colors">
                Clear filters
              </button>
            </div>
          </Card>

          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <SummaryCard icon={<TrendingUp className="h-4 w-4" />} label="Qty Sent" value={formatQty(summary.sent)} />
              <SummaryCard icon={<CheckCircle className="h-4 w-4 text-green-400" />} label="Qty Received" value={formatQty(summary.received)} color="green" />
              <SummaryCard icon={<AlertCircle className="h-4 w-4 text-red-500" />} label="Qty Difference" value={formatQty(summary.discrepancy)} color="red" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              <SummaryCard icon={<Clock className="h-4 w-4" />} label="Pending Qty" value={formatQty(summary.pending)} compact />
              <SummaryCard icon={<Clock className="h-4 w-4" />} label="Pending Transfers" value={String(summary.pendingCount)} compact />
              <SummaryCard icon={<AlertCircle className="h-4 w-4 text-red-500" />} label="Needs Review" value={String(summary.reviewCount)} color="red" compact />
              <SummaryCard icon={<TrendingUp className="h-4 w-4" />} label="Difference Rate" value={`${summary.discrepancyRate.toFixed(1)}%`} color={summary.discrepancyRate > 0 ? 'red' : undefined} compact />
            </div>
          </div>

          {(needsAttention.pending.length > 0 || needsAttention.discrepancies.length > 0) && (
            <div>
              <h2 className="text-sm font-medium text-[#111111] mb-3">Needs Attention</h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <AttentionList
                  title="Oldest Pending Receipts"
                  empty="No pending receipts in this report."
                  rows={needsAttention.pending.map(transfer => ({
                    id: transfer.id,
                    label: `${branchName(branches, transfer.sender_branch_id)} -> ${branchName(branches, transfer.receiver_branch_id)}`,
                    meta: dateInputValue(transfer.sent_at),
                    value: `${formatQty(sentQuantity(transfer))} qty`,
                  }))}
                />
                <AttentionList
                  title="Largest Quantity Differences"
                  empty="No quantity differences in this report."
                  rows={needsAttention.discrepancies.map(({ transfer, value }) => ({
                    id: transfer.id,
                    label: `${branchName(branches, transfer.sender_branch_id)} -> ${branchName(branches, transfer.receiver_branch_id)}`,
                    meta: transfer.status.replaceAll('_', ' '),
                    value: `${formatQty(value)} qty`,
                  }))}
                />
              </div>
            </div>
          )}

          {chartData.length > 0 && (
            <Card>
              <div className="px-5 pt-5 pb-2 border-b border-[#E5E5E5]">
                <h2 className="text-sm font-medium text-[#111111]">Quantity Difference by Receiving Branch</h2>
              </div>
              <div className="p-5">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }} barSize={24}>
                    <XAxis dataKey="name" tick={{ fill: '#9CA3AF', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={value => formatQty(Number(value))} tick={{ fill: '#9CA3AF', fontSize: 11 }} axisLine={false} tickLine={false} width={60} />
                    <Tooltip
                      cursor={{ fill: 'rgba(0,0,0,0.03)' }}
                      contentStyle={{ background: '#ffffff', border: '1px solid #E5E5E5', borderRadius: '8px', fontSize: '12px', color: '#111111' }}
                      formatter={value => [formatQty(Number(value)), 'Qty Difference']}
                    />
                    <Bar dataKey="discrepancy" radius={[4, 4, 0, 0]}>
                      {chartData.map((entry, index) => (
                        <Cell key={index} fill={entry.discrepancy > 0 ? '#E8231A' : '#333333'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}

          <div>
            <h2 className="text-sm font-medium text-[#111111] mb-3">Per Branch</h2>
            <Card>
              {branchStats.length === 0 ? (
                <div className="px-6 py-8 text-center text-sm text-[#444444]">No branch data matches the selected filters.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Branch</TableHead>
                      <TableHead className="text-right"># Transfers</TableHead>
                      <TableHead className="text-right">Outgoing Sent Qty</TableHead>
                      <TableHead className="text-right">Incoming Received Qty</TableHead>
                      <TableHead className="text-right">Pending Incoming Qty</TableHead>
                      <TableHead className="text-right">Qty Difference</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {branchStats.map(branch => (
                      <TableRow key={branch.id}>
                        <TableCell className="font-medium">{branch.name}</TableCell>
                        <TableCell className="text-right text-[#888888] font-mono text-xs tabular">{branch.transferCount}</TableCell>
                        <TableCell className="text-right font-mono text-xs tabular">{formatQty(branch.outgoingSentQty)}</TableCell>
                        <TableCell className="text-right font-mono text-xs tabular text-green-400">{formatQty(branch.incomingReceivedQty)}</TableCell>
                        <TableCell className="text-right font-mono text-xs tabular text-amber-500">{formatQty(branch.pendingIncomingQty)}</TableCell>
                        <TableCell className="text-right font-mono text-xs tabular text-red-500">{formatQty(branch.discrepancyQty)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Card>
          </div>

          <div>
            <h2 className="text-sm font-medium text-[#111111] mb-3">Per Item</h2>
            <Card>
              {itemStats.length === 0 ? (
                <div className="px-6 py-8 text-center text-sm text-[#444444]">No item data matches the selected filters.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead>Unit</TableHead>
                      <TableHead className="text-right">Qty Sent</TableHead>
                      <TableHead className="text-right">Qty Received</TableHead>
                      <TableHead className="text-right">Pending Qty</TableHead>
                      <TableHead className="text-right">Qty Difference</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {itemStats.map(item => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.name}</TableCell>
                        <TableCell className="text-[#888888]">{item.unit}</TableCell>
                        <TableCell className="text-right font-mono text-xs tabular">{formatQty(item.quantitySent)}</TableCell>
                        <TableCell className="text-right font-mono text-xs tabular">{formatQty(item.quantityReceived)}</TableCell>
                        <TableCell className="text-right font-mono text-xs tabular text-amber-500">{formatQty(item.pendingQuantity)}</TableCell>
                        <TableCell className="text-right font-mono text-xs tabular text-red-500">{formatQty(item.discrepancyQuantity)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}

function branchName(branches: Branch[], id: string) {
  return branches.find(branch => branch.id === id)?.name ?? 'Unknown branch'
}

function AttentionList({
  title,
  empty,
  rows,
}: {
  title: string
  empty: string
  rows: Array<{ id: string; label: string; meta: string; value: string }>
}) {
  return (
    <Card className="p-5 bg-white">
      <h3 className="text-sm font-medium text-[#111111] mb-4">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-[#888888]">{empty}</p>
      ) : (
        <div className="space-y-3">
          {rows.map(row => (
            <div key={row.id} className="flex items-center justify-between gap-4 rounded-lg border border-[#F0F0F0] p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-[#111111]">{row.label}</p>
                <p className="mt-0.5 text-xs text-[#888888]">{row.meta}</p>
              </div>
              <p className="shrink-0 font-mono text-xs font-semibold text-red-500">{row.value}</p>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

function SummaryCard({
  icon,
  label,
  value,
  color,
  className = '',
  compact = false,
}: {
  icon: React.ReactNode
  label: string
  value: string
  color?: 'green' | 'red'
  className?: string
  compact?: boolean
}) {
  const valueColor = color === 'green' ? 'text-green-400' : color === 'red' ? 'text-red-500' : 'text-[#111111]'
  return (
    <Card className={`${compact ? 'p-4' : 'p-5'} ${className}`}>
      <div className={`flex items-center gap-2 ${compact ? 'mb-2' : 'mb-3'} text-[#444444]`}>
        {icon}
        <span className="text-xs uppercase tracking-wider font-medium text-[#888888]">{label}</span>
      </div>
      <p className={`${compact ? 'text-xl' : 'text-2xl'} font-bold font-mono tabular tracking-tight ${valueColor}`}>{value}</p>
    </Card>
  )
}
