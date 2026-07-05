'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { CheckCircle, Clock, Download, Filter, Printer, TrendingUp } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { fetchBranches } from '@/lib/data-cache'
import type { Branch, TransferRow, TransferStatus } from '@/types'
import { useAppProfile } from '@/contexts/profile-context'
import { useLanguage } from '@/contexts/language-context'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'

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

type PivotCell = { in: number; out: number }
type PivotItem = { id: string; name: string; unit: string }
type PivotRow = { branchId: string; branchName: string; direction: 'in' | 'out'; cells: Map<string, PivotCell> }
type PivotData = { items: PivotItem[]; rows: PivotRow[] }

type DatePreset = 'all' | 'today' | 'week' | 'month' | 'last_month' | 'custom'

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
  const d = new Date(date)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
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
  const profile = useAppProfile()
  const { t } = useLanguage()

  const [branches, setBranches] = useState<Branch[]>([])
  const [transfers, setTransfers] = useState<TransferRow[]>([])
  const [loading, setLoading] = useState(true)

  const [datePreset, setDatePreset] = useState<DatePreset>('month')
  const [dateFrom, setDateFrom] = useState(() => presetRange('month').from)
  const [dateTo, setDateTo] = useState(() => presetRange('month').to)
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

  const pivotData = useMemo<PivotData>(() => {
    const data = buildPivotTable(branches, filteredTransfers)

    const excluded = new Set<string>()
    if (branchFilter !== 'all') excluded.add(branchFilter)
    if (profile?.role === 'branch_manager' || profile?.role === 'district_manager') {
      for (const branch of profile.branches) excluded.add(branch.id)
    }

    return excluded.size > 0
      ? { ...data, rows: data.rows.filter(row => !excluded.has(row.branchId)) }
      : data
  }, [branches, filteredTransfers, branchFilter, profile])

  // Branches that appear in both an in-row and an out-row need a direction label.
  const multiBranchIds = useMemo(() => {
    const counts = new Map<string, number>()
    for (const row of pivotData.rows) counts.set(row.branchId, (counts.get(row.branchId) ?? 0) + 1)
    return new Set([...counts.entries()].filter(([, n]) => n > 1).map(([id]) => id))
  }, [pivotData.rows])

  // Only show items that have at least one row with any movement.
  const visibleItems = useMemo(() => {
    return pivotData.items.filter(item =>
      pivotData.rows.some(row => {
        const c = row.cells.get(item.id)
        return c && (c.in > 0 || c.out > 0)
      })
    )
  }, [pivotData])

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
    const itemHeaders = visibleItems.flatMap(item => [
      `${item.name} In${item.unit ? ` (${item.unit})` : ''}`,
      `${item.name} Out${item.unit ? ` (${item.unit})` : ''}`,
      `${item.name} Diff${item.unit ? ` (${item.unit})` : ''}`,
    ])
    const header = ['Branch', ...itemHeaders]

    const dataRows = pivotData.rows.map(row => {
      const cells = visibleItems.flatMap(item => {
        const cell = row.cells.get(item.id)
        const inQty  = cell?.in  ?? 0
        const outQty = cell?.out ?? 0
        return [inQty, outQty, inQty - outQty]
      })
      return [row.branchName, ...cells]
    })

    const csv = `\uFEFF${[header, ...dataRows].map(row => row.map(v => csvEscape(v)).join(',')).join('\n')}`
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), `item-movement-${dateInputValue(new Date())}.csv`)
  }

  async function exportDesignedReport() {
    const logoDataUrl = await imageToDataUrl('/logo.png')
    const generatedAt = new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date())
    const filterLabel = dateFrom || dateTo ? `${dateFrom || 'Start'} → ${dateTo || 'Today'}` : 'All time'

    const pivotItemHeadersHtml = visibleItems.map(item =>
      `<th colspan="3" class="pivot-item-head" dir="auto">${htmlEscape(item.name)}${item.unit ? ` <span class="pivot-unit">(${htmlEscape(item.unit)})</span>` : ''}</th>`
    ).join('')

    const pivotSubHeaderHtml = visibleItems.map(() =>
      `<th class="pivot-in">in</th><th class="pivot-out">out</th><th class="pivot-diff">diff</th>`
    ).join('')

    const exportMultiBranchIds = new Set(
      pivotData.rows.map(r => r.branchId).filter((id, _, arr) => arr.filter(x => x === id).length > 1)
    )

    const pivotRowsHtml = pivotData.rows.map((row, idx) => {
      const cells = visibleItems.map(item => {
        const cell = row.cells.get(item.id)
        const inVal  = cell && cell.in  > 0 ? `<span class="val-in">${htmlEscape(formatQty(cell.in))}</span>`   : `<span class="val-empty">—</span>`
        const outVal = cell && cell.out > 0 ? `<span class="val-out">${htmlEscape(formatQty(cell.out))}</span>` : `<span class="val-empty">—</span>`
        const diff = cell ? cell.in - cell.out : 0
        const diffVal = diff === 0
          ? `<span class="val-empty">—</span>`
          : diff > 0
            ? `<span class="val-in">+${htmlEscape(formatQty(diff))}</span>`
            : `<span class="val-out">${htmlEscape(formatQty(diff))}</span>`
        return `<td class="pivot-cell">${inVal}</td><td class="pivot-cell">${outVal}</td><td class="pivot-cell">${diffVal}</td>`
      }).join('')
      const dirLabel = exportMultiBranchIds.has(row.branchId)
        ? ` <span style="font-size:9px;font-weight:700;color:${row.direction === 'in' ? '#16a34a' : '#e8231a'}">${row.direction === 'in' ? '↓' : '↑'}</span>`
        : ''
      return `<tr class="${idx % 2 === 0 ? '' : 'alt'}"><td class="pivot-branch" dir="auto">${htmlEscape(row.branchName)}${dirLabel}</td>${cells}</tr>`
    }).join('')

    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Item Movement Report</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #f4f4f5; color: #111111; font-family: Arial, Helvetica, sans-serif; }
    .page { max-width: 1400px; margin: 0 auto; padding: 28px; }
    .hero { background: #ffffff; border: 1px solid #e5e5e5; border-radius: 14px; overflow: hidden; box-shadow: 0 18px 45px rgba(17,17,17,0.08); }
    .topbar { height: 8px; background: #e8231a; }
    .header { display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 20px 28px; border-bottom: 1px solid #eeeeee; }
    .brand { display: flex; align-items: center; gap: 16px; }
    .logo { max-width: 150px; max-height: 56px; object-fit: contain; }
    h1 { margin: 0; font-size: 20px; }
    .subtitle { margin: 4px 0 0; color: #6b7280; font-size: 12px; }
    .meta { text-align: right; color: #6b7280; font-size: 11px; line-height: 1.8; white-space: nowrap; }
    .section { padding: 22px 28px 28px; }
    h2 { margin: 0 0 14px; font-size: 14px; color: #111; }
    .pivot-wrap { overflow-x: auto; }
    .pivot { border-collapse: collapse; background: #ffffff; font-size: 12px; width: 100%; }
    .pivot thead tr:first-child th { background: #111111; color: #ffffff; text-align: center; padding: 10px 14px; font-size: 11px; letter-spacing: .03em; border-left: 2px solid #555; white-space: nowrap; }
    .pivot thead tr:first-child th:first-child { text-align: left; border-left: none; }
    .pivot-unit { font-weight: 400; color: #9ca3af; font-size: 10px; }
    .pivot-item-head { background: #1c1c1c; }
    .pivot-in   { background: #1a2e1a; color: #4ade80; text-align: center; padding: 6px 10px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; border-left: 2px solid #555; }
    .pivot-out  { background: #2e1a1a; color: #e8231a; text-align: center; padding: 6px 10px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; border-left: 1px solid #3a1a1a; }
    .pivot-diff { background: #1a1a2e; color: #818cf8; text-align: center; padding: 6px 10px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; border-left: 1px solid #252538; }
    .pivot-branch { padding: 10px 16px; font-weight: 600; color: #111111; border-top: 2px solid #d0d0d0; border-right: 2px solid #cccccc; white-space: nowrap; min-width: 140px; }
    .pivot-cell { text-align: center; padding: 10px 12px; border-top: 2px solid #d0d0d0; border-left: 1px solid #eeeeee; min-width: 60px; }
    .pivot-cell:nth-child(3n+2) { border-left: 2px solid #cccccc; }
    .val-in    { font-family: Consolas, 'Courier New', monospace; font-weight: 700; color: #16a34a; }
    .val-out   { font-family: Consolas, 'Courier New', monospace; font-weight: 700; color: #e8231a; }
    .val-empty { color: #dddddd; }
    tr.alt td  { background: #f7f7f7; }
    .footer { padding: 14px 28px 22px; color: #9ca3af; font-size: 11px; border-top: 1px solid #eeeeee; }
    @media print { body { background: #fff; } .page { padding: 0; } .hero { box-shadow: none; border-radius: 0; } }
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
            <h1>Item Movement by Branch</h1>
            <p class="subtitle">In / Out / Diff per item per branch</p>
          </div>
        </div>
        <div class="meta">
          <div>Generated: ${htmlEscape(generatedAt)}</div>
          <div>Period: ${htmlEscape(filterLabel)}</div>
          <div>Status: ${htmlEscape(statusFilter === 'all' ? 'All statuses' : statusFilter.replaceAll('_', ' '))}</div>
        </div>
      </div>
      <div class="section">
        <h2>Item Movement by Branch</h2>
        ${pivotData.rows.length > 0 ? `
        <div class="pivot-wrap">
          <table class="pivot">
            <thead>
              <tr><th rowspan="2">Branch</th>${pivotItemHeadersHtml}</tr>
              <tr>${pivotSubHeaderHtml}</tr>
            </thead>
            <tbody>${pivotRowsHtml || '<tr><td colspan="100">No data.</td></tr>'}</tbody>
          </table>
        </div>` : '<p style="color:#888;font-size:12px">No item movement.</p>'}
      </div>
      <div class="footer">Ahmad Al Abdalla — internal transfer report</div>
    </div>
  </div>
</body>
</html>`

    downloadBlob(new Blob([html], { type: 'text/html;charset=utf-8;' }), `item-movement-${dateInputValue(new Date())}.html`)
  }

  return (
    <div className="px-4 py-5 sm:px-8 sm:py-8 max-w-7xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[#111111]">{t.report.title}</h1>
          <p className="text-sm text-[#888888] mt-0.5">{t.report.subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2 no-print">
          <Button variant="outline" onClick={exportCsv} disabled={loading || filteredTransfers.length === 0}>
            <Download className="h-4 w-4" />
            {t.report.exportCsv}
          </Button>
          <Button variant="outline" onClick={exportDesignedReport} disabled={loading || filteredTransfers.length === 0}>
            <Download className="h-4 w-4" />
            {t.report.exportReport}
          </Button>
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="h-4 w-4" />
            {t.report.print}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-[#444444]">{t.common.loading}</div>
      ) : (
        <div className="space-y-8">
          <Card className="p-4 bg-white no-print">
            <div className="flex items-center gap-2 mb-4">
              <Filter className="h-4 w-4 text-[#888888]" />
              <h2 className="text-sm font-medium text-[#111111]">{t.report.filters}</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-3">
              <div>
                <Label htmlFor="month-picker">{t.report.month}</Label>
                <Input
                  id="month-picker"
                  type="month"
                  value={datePreset === 'custom' || datePreset === 'all' ? '' : dateFrom.slice(0, 7)}
                  onChange={event => {
                    const [year, month] = event.target.value.split('-').map(Number)
                    const from = dateInputValue(new Date(year, month - 1, 1))
                    const to = dateInputValue(new Date(year, month, 0))
                    setDatePreset('custom')
                    setDateFrom(from)
                    setDateTo(to)
                  }}
                />
              </div>
              <div>
                <Label htmlFor="date-preset">{t.report.preset}</Label>
                <Select id="date-preset" value={datePreset} onChange={event => updatePreset(event.target.value as DatePreset)}>
                  <option value="all">{t.report.allTime}</option>
                  <option value="today">{t.report.today}</option>
                  <option value="week">{t.report.lastWeek}</option>
                  <option value="month">{t.report.thisMonth}</option>
                  <option value="last_month">{t.report.lastMonth}</option>
                  <option value="custom">{t.report.customRange}</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="date-from">{t.report.from}</Label>
                <Input id="date-from" type="date" value={dateFrom} onChange={event => { setDatePreset('custom'); setDateFrom(event.target.value) }} />
              </div>
              <div>
                <Label htmlFor="date-to">{t.report.to}</Label>
                <Input id="date-to" type="date" value={dateTo} onChange={event => { setDatePreset('custom'); setDateTo(event.target.value) }} />
              </div>
              <div>
                <Label htmlFor="status-filter">{t.report.status}</Label>
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
                <Label htmlFor="branch-filter">{t.report.branch}</Label>
                <Select id="branch-filter" value={branchFilter} onChange={event => setBranchFilter(event.target.value)}>
                  <option value="all">{t.report.allBranches}</option>
                  {branches.map(branch => (
                    <option key={branch.id} value={branch.id}>{branch.name}</option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-[#888888]">
                {t.report.showing(filteredTransfers.length, transfers.length)}
              </p>
              <button type="button" onClick={clearFilters} className="self-start text-xs text-[#888888] hover:text-[#111111] transition-colors">
                {t.report.clearFilters}
              </button>
            </div>
          </Card>

          <div>
            <SectionHeading
              title={t.report.pivotTitle}
              description={t.report.pivotSubtitle}
            />
            {pivotData.rows.length === 0 ? (
              <Card className="px-6 py-8 text-center text-sm text-[#444444]">{t.report.noData}</Card>
            ) : (
              <Card className="overflow-hidden bg-white shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr>
                        <th
                          rowSpan={2}
                          className="sticky left-0 z-10 bg-[#111111] text-white text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider border-r-2 border-r-[#555] min-w-[140px]"
                        >
                          {t.report.branch}
                        </th>
                        {visibleItems.map(item => (
                          <th
                            key={item.id}
                            colSpan={3}
                            className="bg-[#1C1C1C] text-white text-center px-3 py-2 text-xs font-semibold border-l-2 border-l-[#555] whitespace-nowrap"
                            dir="auto"
                          >
                            {item.name}
                            {item.unit ? <span className="ml-1 text-[#9CA3AF] font-normal">({item.unit})</span> : null}
                          </th>
                        ))}
                      </tr>
                      <tr>
                        {visibleItems.map(item => (
                          <React.Fragment key={item.id}>
                            <th className="bg-[#1a2e1a] text-green-400 text-center px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest border-l-2 border-l-[#555] w-[64px]">{t.report.colIn}</th>
                            <th className="bg-[#2e1a1a] text-[#E8231A] text-center px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest border-l border-l-[#3a1a1a] w-[64px]">{t.report.colOut}</th>
                            <th className="bg-[#1a1a2e] text-[#818CF8] text-center px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest border-l border-l-[#252538] w-[64px]">{t.report.colDiff}</th>
                          </React.Fragment>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pivotData.rows.map((row, rowIdx) => (
                        <tr key={`${row.branchId}-${row.direction}`} className={rowIdx % 2 === 0 ? 'bg-white' : 'bg-[#F7F7F7]'}>
                          <td className="sticky left-0 z-10 px-4 py-3 font-semibold text-[#111111] border-r-2 border-r-[#CCCCCC] border-t-2 border-t-[#D0D0D0] bg-inherit" dir="auto">
                            <span>{row.branchName}</span>
                            {multiBranchIds.has(row.branchId) && (
                              <span className={`ml-1.5 text-[10px] font-bold uppercase tracking-widest ${row.direction === 'in' ? 'text-green-500' : 'text-[#E8231A]'}`}>
                                {row.direction === 'in' ? '↓' : '↑'}
                              </span>
                            )}
                          </td>
                          {visibleItems.map(item => {
                            const cell = row.cells.get(item.id)
                            const diff = cell ? cell.in - cell.out : 0
                            return (
                              <React.Fragment key={item.id}>
                                <td className="text-center px-3 py-3 border-l-2 border-l-[#CCCCCC] border-t-2 border-t-[#D0D0D0] font-mono text-sm tabular-nums">
                                  {cell && cell.in > 0
                                    ? <span className="font-semibold text-green-600">{formatQty(cell.in)}</span>
                                    : <span className="text-[#DDDDDD]">—</span>}
                                </td>
                                <td className="text-center px-3 py-3 border-l border-l-[#E8E8E8] border-t-2 border-t-[#D0D0D0] font-mono text-sm tabular-nums">
                                  {cell && cell.out > 0
                                    ? <span className="font-semibold text-[#E8231A]">{formatQty(cell.out)}</span>
                                    : <span className="text-[#DDDDDD]">—</span>}
                                </td>
                                <td className="text-center px-3 py-3 border-l border-l-[#E0E0F0] border-t-2 border-t-[#D0D0D0] font-mono text-sm tabular-nums">
                                  {diff === 0
                                    ? <span className="text-[#DDDDDD]">—</span>
                                    : diff > 0
                                      ? <span className="font-semibold text-green-600">+{formatQty(diff)}</span>
                                      : <span className="font-semibold text-[#E8231A]">{formatQty(diff)}</span>}
                                </td>
                              </React.Fragment>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
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

function buildPivotTable(branches: Branch[], transfers: TransferRow[]): PivotData {
  const itemMap = new Map<string, PivotItem>()
  // Separate maps for incoming and outgoing so each direction becomes its own row.
  const inMap  = new Map<string, Map<string, PivotCell>>()
  const outMap = new Map<string, Map<string, PivotCell>>()

  for (const transfer of transfers) {
    for (const line of transfer.transfer_lines) {
      if (line.item && !itemMap.has(line.item_id)) {
        itemMap.set(line.item_id, { id: line.item_id, name: line.item.name, unit: line.item.unit ?? '' })
      }

      const qty    = Number(line.quantity_sent)
      const itemId = line.item_id

      const senderCells = outMap.get(transfer.sender_branch_id) ?? new Map<string, PivotCell>()
      const senderCell  = senderCells.get(itemId) ?? { in: 0, out: 0 }
      senderCell.out += qty
      senderCells.set(itemId, senderCell)
      outMap.set(transfer.sender_branch_id, senderCells)

      const receiverCells = inMap.get(transfer.receiver_branch_id) ?? new Map<string, PivotCell>()
      const receiverCell  = receiverCells.get(itemId) ?? { in: 0, out: 0 }
      receiverCell.in += qty
      receiverCells.set(itemId, receiverCell)
      inMap.set(transfer.receiver_branch_id, receiverCells)
    }
  }

  const items = Array.from(itemMap.values()).sort((a, b) => a.name.localeCompare(b.name))
  const rows: PivotRow[] = []

  for (const branch of [...branches].sort((a, b) => a.name.localeCompare(b.name))) {
    const inCells  = inMap.get(branch.id)
    const outCells = outMap.get(branch.id)
    if (inCells)  rows.push({ branchId: branch.id, branchName: branch.name, direction: 'in',  cells: inCells })
    if (outCells) rows.push({ branchId: branch.id, branchName: branch.name, direction: 'out', cells: outCells })
  }

  return { items, rows }
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
