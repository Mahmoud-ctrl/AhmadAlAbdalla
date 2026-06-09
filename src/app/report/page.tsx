'use client'

import { useEffect, useMemo, useState } from 'react'
import { CheckCircle, Clock, Download, Filter, Printer, TrendingUp } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { fetchBranches } from '@/lib/data-cache'
import type { Branch, TransferRow, TransferStatus } from '@/types'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

type BranchStat = Branch & {
  incomingReceivedQty: number
  outgoingSentQty: number
  totalMovementQty: number
  pendingIncomingQty: number
  transferCount: number
}

type RouteItemStat = {
  id: string
  senderBranchName: string
  receiverBranchName: string
  itemName: string
  unit: string
  quantitySent: number
  transferCount: number
}

type RouteItemGroup = {
  branchName: string
  rows: RouteItemStat[]
}

type ReceiverRouteGroup = {
  receiverBranchName: string
  rows: RouteItemStat[]
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

function currentMonthRange() {
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), 1)
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0)

  return { from: dateInputValue(from), to: dateInputValue(to) }
}

function isTransferInDateRange(transfer: TransferRow, from: string, to: string) {
  const sentDate = dateInputValue(transfer.sent_at)

  if (from && sentDate < from) return false
  if (to && sentDate > to) return false

  return true
}

function csvEscape(value: string | number) {
  return `"${String(value).replaceAll('"', '""')}"`
}

function htmlEscape(value: string | number) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

async function imageToDataUrl(path: string) {
  try {
    const response = await fetch(path)
    const blob = await response.blob()

    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(blob)
    })
  } catch {
    return ''
  }
}

const csvHeaders = [
  'Section',
  'Name',
  'Unit',
  'From Branch',
  'To Branch',
  'Transfers',
  'Total Movement Qty',
  'Outgoing Sent Qty',
  'Incoming Received Qty',
  'Pending Incoming Qty',
  'Qty Sent',
] as const

type CsvHeader = typeof csvHeaders[number]
type CsvRow = Partial<Record<CsvHeader, string | number>>

function csvRow(values: CsvRow) {
  return csvHeaders.map(header => values[header] ?? '')
}

export default function ReportPage() {
  const [branches, setBranches] = useState<Branch[]>([])
  const [transfers, setTransfers] = useState<TransferRow[]>([])
  const [loading, setLoading] = useState(true)

  const [datePreset, setDatePreset] = useState<DatePreset>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [statusFilter, setStatusFilter] = useState<TransferStatus | 'all'>('all')
  const [branchFilter, setBranchFilter] = useState('all')

  useEffect(() => {
    async function load() {
      const [branchData, { data: transferData }] = await Promise.all([
        fetchBranches(),
        supabase
          .from('transfers')
          .select('id, status, sent_at, sender_branch_id, receiver_branch_id, transfer_lines(id, transfer_id, item_id, quantity_sent, quantity_received, unit_price_snapshot, item:items(id,name,unit,price_per_unit))')
          .order('sent_at', { ascending: false }),
      ])

      setBranches(branchData)
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
    return buildBranchStats(branches, filteredTransfers)
  }, [branches, filteredTransfers])

  const monthlyTransfers = useMemo(() => {
    const { from, to } = currentMonthRange()
    return transfers.filter(transfer => isTransferInDateRange(transfer, from, to))
  }, [transfers])

  const monthlyBranchStats = useMemo<BranchStat[]>(() => {
    return buildBranchStats(branches, monthlyTransfers)
  }, [branches, monthlyTransfers])

  const monthlySummary = useMemo(() => {
    const sent = monthlyTransfers.reduce((sum, transfer) => sum + sentQuantity(transfer), 0)
    const received = monthlyTransfers.reduce((sum, transfer) => sum + receivedQuantity(transfer), 0)
    const pending = monthlyTransfers.reduce((sum, transfer) => sum + pendingQuantity(transfer), 0)
    const totalMovement = monthlyBranchStats.reduce((sum, branch) => sum + branch.totalMovementQty, 0)

    return {
      sent,
      received,
      pending,
      totalMovement,
      transferCount: monthlyTransfers.length,
    }
  }, [monthlyBranchStats, monthlyTransfers])

  const routeItemGroups = useMemo<RouteItemGroup[]>(() => {
    return buildRouteItemGroups(branches, filteredTransfers)
  }, [branches, filteredTransfers])

  const routeItemRows = useMemo(() => {
    return routeItemGroups.flatMap(group => group.rows)
  }, [routeItemGroups])

  const summary = useMemo(() => {
    const sent = filteredTransfers.reduce((sum, transfer) => sum + sentQuantity(transfer), 0)
    const received = filteredTransfers.reduce((sum, transfer) => sum + receivedQuantity(transfer), 0)
    const pending = filteredTransfers.reduce((sum, transfer) => sum + pendingQuantity(transfer), 0)

    return { sent, received, pending }
  }, [filteredTransfers])

  function clearFilters() {
    setDatePreset('all')
    setDateFrom('')
    setDateTo('')
    setStatusFilter('all')
    setBranchFilter('all')
  }

  function exportCsv() {
    const rows = [
      csvHeaders,
      ...branchStats.map(branch => csvRow({
        Section: 'Branch Summary',
        Name: branch.name,
        Unit: 'mixed',
        Transfers: branch.transferCount,
        'Total Movement Qty': branch.totalMovementQty.toFixed(2),
        'Outgoing Sent Qty': branch.outgoingSentQty.toFixed(2),
        'Incoming Received Qty': branch.incomingReceivedQty.toFixed(2),
        'Pending Incoming Qty': branch.pendingIncomingQty.toFixed(2),
      })),
      ...routeItemGroups.flatMap(group => [
        csvRow({
          Section: 'From Branch',
          Name: group.branchName,
          'From Branch': group.branchName,
        }),
        ...groupRouteRowsByReceiver(group.rows).flatMap(receiverGroup => [
          csvRow({
            Section: 'To Branch',
            Name: receiverGroup.receiverBranchName,
            'From Branch': group.branchName,
            'To Branch': receiverGroup.receiverBranchName,
          }),
          ...receiverGroup.rows.map(row => csvRow({
            Section: 'Route Item',
            Name: row.itemName,
            Unit: row.unit,
            'From Branch': row.senderBranchName,
            'To Branch': row.receiverBranchName,
            Transfers: row.transferCount,
            'Qty Sent': row.quantitySent.toFixed(2),
          })),
        ]),
      ]),
    ]

    const csv = `\uFEFF${rows.map(row => row.map(value => csvEscape(value)).join(',')).join('\n')}`
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), `quantity-report-${dateInputValue(new Date())}.csv`)
  }

  async function exportDesignedReport() {
    const logoDataUrl = await imageToDataUrl('/logo.png')
    const generatedAt = new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date())
    const filterLabel = dateFrom || dateTo ? `${dateFrom || 'Start'} to ${dateTo || 'Today'}` : 'All time'
    const branchRowsHtml = branchStats.map(branch => `
      <tr>
        <td dir="auto">${htmlEscape(branch.name)}</td>
        <td>${htmlEscape(branch.transferCount)}</td>
        <td>${htmlEscape(formatQty(branch.totalMovementQty))}</td>
        <td>${htmlEscape(formatQty(branch.outgoingSentQty))}</td>
        <td>${htmlEscape(formatQty(branch.incomingReceivedQty))}</td>
        <td>${htmlEscape(formatQty(branch.pendingIncomingQty))}</td>
      </tr>
    `).join('')

    const routeGroupsHtml = routeItemGroups.map(group => {
      const receiverGroups = groupRouteRowsByReceiver(group.rows)
      const totalQty = group.rows.reduce((sum, row) => sum + row.quantitySent, 0)

      return `
        <div class="route-card">
          <div class="route-card-head">
            <div>
              <h3 dir="auto">${htmlEscape(group.branchName)}</h3>
              <p>${htmlEscape(formatQty(group.rows.length))} item routes</p>
            </div>
            <strong>${htmlEscape(formatQty(totalQty))}</strong>
          </div>
          ${receiverGroups.map(receiverGroup => `
            <div class="receiver-block">
              <div class="receiver-title">To <span dir="auto">${htmlEscape(receiverGroup.receiverBranchName)}</span></div>
              <table class="route">
                <thead><tr><th>Item</th><th>Unit</th><th>Qty Sent</th><th>Lines</th></tr></thead>
                <tbody>
                  ${receiverGroup.rows.map(row => `
                    <tr>
                      <td dir="auto">${htmlEscape(row.itemName)}</td>
                      <td>${htmlEscape(row.unit || '-')}</td>
                      <td>${htmlEscape(formatQty(row.quantitySent))}</td>
                      <td>${htmlEscape(row.transferCount)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          `).join('')}
        </div>
      `
    }).join('')

    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Quantity Report</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #f4f4f5; color: #111111; font-family: Arial, Helvetica, sans-serif; }
    .page { max-width: 1180px; margin: 0 auto; padding: 28px; }
    .hero { background: #ffffff; border: 1px solid #e5e5e5; border-radius: 14px; overflow: hidden; box-shadow: 0 18px 45px rgba(17,17,17,0.08); }
    .topbar { height: 8px; background: #e8231a; }
    .header { display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 24px 28px; border-bottom: 1px solid #eeeeee; }
    .brand { display: flex; align-items: center; gap: 18px; min-width: 0; }
    .logo { max-width: 170px; max-height: 64px; object-fit: contain; }
    h1 { margin: 0; font-size: 24px; letter-spacing: 0; }
    .subtitle { margin: 6px 0 0; color: #6b7280; font-size: 13px; }
    .meta { text-align: right; color: #6b7280; font-size: 12px; line-height: 1.7; white-space: nowrap; }
    .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; padding: 20px 28px; background: #fafafa; }
    .metric { background: #ffffff; border: 1px solid #eeeeee; border-radius: 10px; padding: 14px; }
    .metric span { display: block; color: #8a8a8a; font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
    .metric strong { display: block; margin-top: 7px; font-size: 22px; font-family: Consolas, 'Courier New', monospace; }
    .section { padding: 22px 28px 6px; }
    h2 { margin: 0 0 10px; font-size: 15px; }
    table { width: 100%; border-collapse: collapse; background: #ffffff; border: 1px solid #eeeeee; border-radius: 10px; overflow: hidden; }
    th { background: #111111; color: #ffffff; text-align: left; font-size: 11px; letter-spacing: .04em; text-transform: uppercase; padding: 10px 12px; }
    td { border-top: 1px solid #eeeeee; padding: 10px 12px; font-size: 12px; vertical-align: top; }
    tr:nth-child(even) td { background: #fbfbfb; }
    td:not(:first-child), th:not(:first-child) { text-align: right; }
    .route-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
    .route-card { border: 1px solid #eeeeee; border-radius: 12px; overflow: hidden; background: #ffffff; page-break-inside: avoid; }
    .route-card-head { display: flex; justify-content: space-between; gap: 18px; align-items: flex-start; background: #111111; color: #ffffff; padding: 14px 16px; }
    .route-card-head h3 { margin: 0; font-size: 15px; }
    .route-card-head p { margin: 4px 0 0; color: #d1d5db; font-size: 11px; }
    .route-card-head strong { color: #ffffff; font-family: Consolas, 'Courier New', monospace; font-size: 18px; }
    .receiver-block { padding: 12px 14px 14px; border-top: 1px solid #eeeeee; }
    .receiver-title { margin-bottom: 8px; color: #6b7280; font-size: 11px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
    .receiver-title span { color: #e8231a; }
    .route th { background: #f4f4f5; color: #444444; }
    .route td:first-child, .route th:first-child { text-align: left; }
    .footer { padding: 18px 28px 26px; color: #8a8a8a; font-size: 11px; }
    @media print { body { background: #ffffff; } .page { padding: 0; } .hero { box-shadow: none; border-radius: 0; } }
    @media (max-width: 800px) { .header, .summary, .route-grid { grid-template-columns: 1fr; display: block; } .metric, .route-card { margin-top: 10px; } .meta { text-align: left; margin-top: 14px; } }
  </style>
</head>
<body>
  <div class="page">
    <div class="hero">
      <div class="topbar"></div>
      <div class="header">
        <div class="brand">
          ${logoDataUrl ? `<img class="logo" src="${logoDataUrl}" alt="Ahmad Al Abdalla" />` : ''}
          <div>
            <h1>Quantity Report</h1>
            <p class="subtitle">Branch movement, item routes, and monthly quantity totals</p>
          </div>
        </div>
        <div class="meta">
          <div>Generated: ${htmlEscape(generatedAt)}</div>
          <div>Range: ${htmlEscape(filterLabel)}</div>
          <div>Status: ${htmlEscape(statusFilter === 'all' ? 'All statuses' : statusFilter.replaceAll('_', ' '))}</div>
        </div>
      </div>
      <div class="summary">
        <div class="metric"><span>Total Sent</span><strong>${htmlEscape(formatQty(summary.sent))}</strong></div>
        <div class="metric"><span>Total Received</span><strong>${htmlEscape(formatQty(summary.received))}</strong></div>
        <div class="metric"><span>This Month Movement</span><strong>${htmlEscape(formatQty(monthlySummary.totalMovement))}</strong></div>
        <div class="metric"><span>Pending Qty</span><strong>${htmlEscape(formatQty(summary.pending))}</strong></div>
      </div>
      <div class="section">
        <h2>Branch Summary</h2>
        <table>
          <thead><tr><th>Branch</th><th>Transfers</th><th>Total Movement</th><th>Outgoing Sent</th><th>Incoming Received</th><th>Pending Incoming</th></tr></thead>
          <tbody>${branchRowsHtml || '<tr><td colspan="6">No branch data.</td></tr>'}</tbody>
        </table>
      </div>
      <div class="section">
        <h2>Items From / To Branches</h2>
        ${routeGroupsHtml ? `<div class="route-grid">${routeGroupsHtml}</div>` : '<table><tbody><tr><td>No item movement.</td></tr></tbody></table>'}
      </div>
      <div class="footer">Ahmad Al Abdalla internal transfer report.</div>
    </div>
  </div>
</body>
</html>`

    downloadBlob(new Blob([html], { type: 'text/html;charset=utf-8;' }), `quantity-report-${dateInputValue(new Date())}.html`)
  }

  return (
    <div className="px-4 py-5 sm:px-8 sm:py-8 max-w-7xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[#111111]">Quantity Report</h1>
          <p className="text-sm text-[#888888] mt-0.5">Branch movement and item quantity summary</p>
        </div>
        <div className="flex flex-wrap gap-2 no-print">
          <Button variant="outline" onClick={exportCsv} disabled={loading || filteredTransfers.length === 0}>
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
          <Button variant="outline" onClick={exportDesignedReport} disabled={loading || filteredTransfers.length === 0}>
            <Download className="h-4 w-4" />
            Export Report
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
            <div>
              <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between mb-3">
                <div>
                  <h2 className="text-sm font-medium text-[#111111]">This Month</h2>
                  <p className="text-xs text-[#888888] mt-0.5">
                    Current calendar month totals, independent from the selected report filters.
                  </p>
                </div>
                <p className="text-xs text-[#888888]">
                  {formatQty(monthlySummary.transferCount)} transfer{monthlySummary.transferCount === 1 ? '' : 's'}
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <SummaryCard icon={<TrendingUp className="h-4 w-4" />} label="Total Movement" value={formatQty(monthlySummary.totalMovement)} compact />
                <SummaryCard icon={<TrendingUp className="h-4 w-4" />} label="Qty Sent" value={formatQty(monthlySummary.sent)} compact />
                <SummaryCard icon={<CheckCircle className="h-4 w-4 text-green-400" />} label="Qty Received" value={formatQty(monthlySummary.received)} color="green" compact />
                <SummaryCard icon={<Clock className="h-4 w-4" />} label="Pending Qty" value={formatQty(monthlySummary.pending)} compact />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <SummaryCard icon={<TrendingUp className="h-4 w-4" />} label="Qty Sent" value={formatQty(summary.sent)} />
              <SummaryCard icon={<CheckCircle className="h-4 w-4 text-green-400" />} label="Qty Received" value={formatQty(summary.received)} color="green" />
              <SummaryCard icon={<Clock className="h-4 w-4" />} label="Pending Qty" value={formatQty(summary.pending)} compact />
            </div>
          </div>

          <div>
            <SectionHeading
              title="Per Branch"
              description="A 4-column operational view of incoming, outgoing, pending, and total movement."
            />
            {branchStats.length === 0 ? (
              <Card className="px-6 py-8 text-center text-sm text-[#444444]">No branch data matches the selected filters.</Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                {branchStats.map(branch => (
                  <BranchReportCard key={branch.id} branch={branch} />
                ))}
              </div>
            )}
          </div>

          <div>
            <SectionHeading
              title="Items From / To Branches"
              description="One unified view of every item sent from each branch to each destination in the selected report filters."
            />
            {routeItemRows.length === 0 ? (
              <Card className="px-6 py-8 text-center text-sm text-[#444444]">No item movement matches the selected filters.</Card>
            ) : (
              <Card className="overflow-hidden bg-white shadow-sm">
                <div className="border-b border-[#F0F0F0] bg-[#FAFAFA] px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#888888]">
                    {formatQty(routeItemRows.length)} item route{routeItemRows.length === 1 ? '' : 's'}
                  </p>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow className="bg-[#111111] hover:bg-[#111111]">
                      <TableHead className="text-white">From Branch</TableHead>
                      <TableHead className="text-white">To Branch</TableHead>
                      <TableHead className="text-white">Item</TableHead>
                      <TableHead className="text-white">Unit</TableHead>
                      <TableHead className="text-right text-white">Qty Sent</TableHead>
                      <TableHead className="text-right text-white">Lines</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {routeItemRows.map(row => (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium" dir="auto">{row.senderBranchName}</TableCell>
                        <TableCell dir="auto">{row.receiverBranchName}</TableCell>
                        <TableCell dir="auto">{row.itemName}</TableCell>
                        <TableCell className="text-[#888888]">{row.unit || '-'}</TableCell>
                        <TableCell className="text-right font-mono text-xs font-semibold tabular text-[#E8231A]">
                          {formatQty(row.quantitySent)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs tabular text-[#444444]">
                          {formatQty(row.transferCount)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function branchName(branches: Branch[], id: string) {
  return branches.find(branch => branch.id === id)?.name ?? 'Unknown branch'
}

function buildBranchStats(branches: Branch[], transfers: TransferRow[]): BranchStat[] {
  return branches.map(branch => {
    const incoming = transfers.filter(transfer => transfer.receiver_branch_id === branch.id)
    const outgoing = transfers.filter(transfer => transfer.sender_branch_id === branch.id)
    const incomingReceivedQty = incoming.reduce((sum, transfer) => sum + receivedQuantity(transfer), 0)
    const outgoingSentQty = outgoing.reduce((sum, transfer) => sum + sentQuantity(transfer), 0)

    return {
      ...branch,
      incomingReceivedQty,
      outgoingSentQty,
      totalMovementQty: incomingReceivedQty + outgoingSentQty,
      pendingIncomingQty: incoming.reduce((sum, transfer) => sum + pendingQuantity(transfer), 0),
      transferCount: incoming.length + outgoing.length,
    }
  }).filter(branch => branch.transferCount > 0).sort((a, b) => b.totalMovementQty - a.totalMovementQty)
}

function buildRouteItemGroups(branches: Branch[], transfers: TransferRow[]): RouteItemGroup[] {
  const rowsByKey = new Map<string, RouteItemStat>()

  for (const transfer of transfers) {
    const senderBranchName = branchName(branches, transfer.sender_branch_id)
    const receiverBranchName = branchName(branches, transfer.receiver_branch_id)

    for (const line of transfer.transfer_lines) {
      const itemName = line.item?.name ?? 'Unknown item'
      const unit = line.item?.unit ?? ''
      const key = `${transfer.sender_branch_id}:${transfer.receiver_branch_id}:${line.item_id}:${unit}`
      const existing = rowsByKey.get(key)

      if (existing) {
        existing.quantitySent += Number(line.quantity_sent)
        existing.transferCount += 1
      } else {
        rowsByKey.set(key, {
          id: key,
          senderBranchName,
          receiverBranchName,
          itemName,
          unit,
          quantitySent: Number(line.quantity_sent),
          transferCount: 1,
        })
      }
    }
  }

  const groups = new Map<string, RouteItemStat[]>()

  for (const row of rowsByKey.values()) {
    const groupRows = groups.get(row.senderBranchName) ?? []
    groupRows.push(row)
    groups.set(row.senderBranchName, groupRows)
  }

  return Array.from(groups.entries())
    .map(([branchNameValue, rows]) => ({
      branchName: branchNameValue,
      rows: rows.sort((a, b) => (
        a.receiverBranchName.localeCompare(b.receiverBranchName)
        || a.itemName.localeCompare(b.itemName)
      )),
    }))
    .sort((a, b) => a.branchName.localeCompare(b.branchName))
}

function groupRouteRowsByReceiver(rows: RouteItemStat[]): ReceiverRouteGroup[] {
  const groups = new Map<string, RouteItemStat[]>()

  for (const row of rows) {
    const groupRows = groups.get(row.receiverBranchName) ?? []
    groupRows.push(row)
    groups.set(row.receiverBranchName, groupRows)
  }

  return Array.from(groups.entries())
    .map(([receiverBranchName, groupRows]) => ({
      receiverBranchName,
      rows: groupRows.sort((a, b) => a.itemName.localeCompare(b.itemName)),
    }))
    .sort((a, b) => a.receiverBranchName.localeCompare(b.receiverBranchName))
}

function SectionHeading({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2 className="text-sm font-semibold text-[#111111]">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-[#888888]">{description}</p>}
      </div>
    </div>
  )
}

function BranchReportCard({ branch }: { branch: BranchStat }) {
  return (
    <Card className="group overflow-hidden bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:border-[#F3B4AF] hover:shadow-md">
      <div className="h-1 bg-[#E8231A]" />
      <div className="p-4">
      <div className="flex items-start justify-between gap-3 border-b border-[#F0F0F0] pb-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-[#111111]">{branch.name}</h3>
          <p className="mt-0.5 text-xs text-[#888888]">
            {formatQty(branch.transferCount)} transfer{branch.transferCount === 1 ? '' : 's'}
          </p>
        </div>
        <div className="rounded-md bg-[#FFF1F0] px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#E8231A]">
          Branch
        </div>
      </div>

      <div className="mt-4 rounded-lg bg-[#FAFAFA] p-3">
        <p className="text-[10px] uppercase tracking-wider text-[#9CA3AF]">Total Quantity</p>
        <p className="mt-1 font-mono text-3xl font-bold tabular text-[#111111]">{formatQty(branch.totalMovementQty)}</p>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <QuantityMetric label="In" value={branch.incomingReceivedQty} color="green" />
        <QuantityMetric label="Out" value={branch.outgoingSentQty} />
        <QuantityMetric label="Pending In" value={branch.pendingIncomingQty} color="amber" />
      </div>
      </div>
    </Card>
  )
}

function QuantityMetric({
  label,
  value,
  color,
}: {
  label: string
  value: number
  color?: 'green' | 'amber' | 'red'
}) {
  const valueColor = color === 'green'
    ? 'text-green-500'
    : color === 'amber'
      ? 'text-amber-500'
      : color === 'red'
        ? 'text-red-500'
        : 'text-[#111111]'

  return (
    <div className="rounded-lg border border-[#F0F0F0] bg-white px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-[#9CA3AF]">{label}</p>
      <p className={`mt-0.5 font-mono text-sm font-semibold tabular ${valueColor}`}>{formatQty(value)}</p>
    </div>
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
    <Card className={`bg-white shadow-sm ${compact ? 'p-4' : 'p-5'} ${className}`}>
      <div className={`flex items-center gap-2 ${compact ? 'mb-2' : 'mb-3'} text-[#444444]`}>
        {icon}
        <span className="text-xs uppercase tracking-wider font-medium text-[#888888]">{label}</span>
      </div>
      <p className={`${compact ? 'text-xl' : 'text-2xl'} font-bold font-mono tabular tracking-tight ${valueColor}`}>{value}</p>
    </Card>
  )
}
