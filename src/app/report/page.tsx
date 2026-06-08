'use client'

import { useEffect, useState } from 'react'
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AlertCircle, CheckCircle, Printer, TrendingUp } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import type { Branch, Item, TransferRow } from '@/types'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

type BranchStat = Branch & {
  incomingActual: number
  outgoingSent: number
  discrepancy: number
  transferCount: number
}

type ItemStat = Item & {
  quantitySent: number
  quantityReceived: number
  sentValue: number
  actualValue: number
  discrepancy: number
}

function sentValue(transfer: TransferRow) {
  return transfer.transfer_lines.reduce(
    (sum, line) => sum + Number(line.quantity_sent) * Number(line.unit_price_snapshot),
    0
  )
}

function actualValue(transfer: TransferRow) {
  return transfer.transfer_lines.reduce(
    (sum, line) => sum + Number(line.quantity_received ?? 0) * Number(line.unit_price_snapshot),
    0
  )
}

function discrepancyValue(transfer: TransferRow) {
  return transfer.transfer_lines.reduce(
    (sum, line) => sum + Math.abs((Number(line.quantity_sent) - Number(line.quantity_received ?? 0)) * Number(line.unit_price_snapshot)),
    0
  )
}

export default function ReportPage() {
  const [branchStats, setBranchStats] = useState<BranchStat[]>([])
  const [itemStats, setItemStats] = useState<ItemStat[]>([])
  const [summary, setSummary] = useState({ sent: 0, actual: 0, discrepancy: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [{ data: branches }, { data: items }, { data: transfers }] = await Promise.all([
        supabase.from('branches').select('*'),
        supabase.from('items').select('*'),
        supabase
          .from('transfers')
          .select('id, status, sender_branch_id, receiver_branch_id, transfer_lines(id, quantity_sent, quantity_received, unit_price_snapshot, item:items(id,name,unit,price_per_unit))'),
      ])

      const branchList = branches ?? []
      const itemList = items ?? []
      const transferList = (transfers as unknown as TransferRow[]) ?? []

      const bStats: BranchStat[] = branchList.map(branch => {
        const incoming = transferList.filter(transfer => transfer.receiver_branch_id === branch.id)
        const outgoing = transferList.filter(transfer => transfer.sender_branch_id === branch.id)
        return {
          ...branch,
          incomingActual: incoming.reduce((sum, transfer) => sum + actualValue(transfer), 0),
          outgoingSent: outgoing.reduce((sum, transfer) => sum + sentValue(transfer), 0),
          discrepancy: incoming.reduce((sum, transfer) => sum + discrepancyValue(transfer), 0),
          transferCount: incoming.length + outgoing.length,
        }
      }).filter(branch => branch.transferCount > 0).sort((a, b) => b.discrepancy - a.discrepancy)

      const iStats: ItemStat[] = itemList.map(item => {
        const lines = transferList.flatMap(transfer => transfer.transfer_lines.filter(line => line.item_id === item.id))
        const quantitySent = lines.reduce((sum, line) => sum + Number(line.quantity_sent), 0)
        const quantityReceived = lines.reduce((sum, line) => sum + Number(line.quantity_received ?? 0), 0)
        const sentTotal = lines.reduce((sum, line) => sum + Number(line.quantity_sent) * Number(line.unit_price_snapshot), 0)
        const actualTotal = lines.reduce((sum, line) => sum + Number(line.quantity_received ?? 0) * Number(line.unit_price_snapshot), 0)
        return {
          ...item,
          quantitySent,
          quantityReceived,
          sentValue: sentTotal,
          actualValue: actualTotal,
          discrepancy: Math.abs(sentTotal - actualTotal),
        }
      }).filter(item => item.sentValue > 0).sort((a, b) => b.discrepancy - a.discrepancy)

      const sent = transferList.reduce((sum, transfer) => sum + sentValue(transfer), 0)
      const actual = transferList.reduce((sum, transfer) => sum + actualValue(transfer), 0)

      setBranchStats(bStats)
      setItemStats(iStats)
      setSummary({
        sent,
        actual,
        discrepancy: transferList.reduce((sum, transfer) => sum + discrepancyValue(transfer), 0),
      })
      setLoading(false)
    }

    load()
  }, [])

  const chartData = branchStats.slice(0, 10).map(branch => ({
    name: branch.name.length > 14 ? `${branch.name.slice(0, 13)}...` : branch.name,
    discrepancy: parseFloat(branch.discrepancy.toFixed(2)),
  }))

  return (
    <div className="px-4 py-5 sm:px-8 sm:py-8 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[#111111]">Movement Report</h1>
          <p className="text-sm text-[#888888] mt-0.5">Branch movement and discrepancy summary</p>
        </div>
        <Button variant="outline" onClick={() => window.print()} className="no-print">
          <Printer className="h-4 w-4" />
          Print / Export
        </Button>
      </div>

      {loading ? (
        <div className="text-sm text-[#444444]">Loading...</div>
      ) : (
        <div className="space-y-8">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <SummaryCard icon={<TrendingUp className="h-4 w-4" />} label="Total Sent" value={formatCurrency(summary.sent)} />
            <SummaryCard icon={<CheckCircle className="h-4 w-4 text-green-400" />} label="Actual Received" value={formatCurrency(summary.actual)} color="green" />
            <SummaryCard icon={<AlertCircle className="h-4 w-4 text-red-500" />} label="Discrepancy Value" value={formatCurrency(summary.discrepancy)} color="red" />
          </div>

          {chartData.length > 0 && (
            <Card>
              <div className="px-5 pt-5 pb-2 border-b border-[#E5E5E5]">
                <h2 className="text-sm font-medium text-[#111111]">Discrepancy by Receiving Branch</h2>
              </div>
              <div className="p-5">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }} barSize={24}>
                    <XAxis dataKey="name" tick={{ fill: '#9CA3AF', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={value => `$${value}`} tick={{ fill: '#9CA3AF', fontSize: 11 }} axisLine={false} tickLine={false} width={60} />
                    <Tooltip
                      cursor={{ fill: 'rgba(0,0,0,0.03)' }}
                      contentStyle={{ background: '#ffffff', border: '1px solid #E5E5E5', borderRadius: '8px', fontSize: '12px', color: '#111111' }}
                      formatter={value => [formatCurrency(Number(value)), 'Discrepancy']}
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
                <div className="px-6 py-8 text-center text-sm text-[#444444]">No branch data yet</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Branch</TableHead>
                        <TableHead className="text-right"># Transfers</TableHead>
                        <TableHead className="text-right">Outgoing Sent</TableHead>
                        <TableHead className="text-right">Incoming Actual</TableHead>
                        <TableHead className="text-right">Discrepancy</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {branchStats.map(branch => (
                        <TableRow key={branch.id}>
                          <TableCell className="font-medium">{branch.name}</TableCell>
                          <TableCell className="text-right text-[#888888] font-mono text-xs tabular">{branch.transferCount}</TableCell>
                          <TableCell className="text-right font-mono text-xs tabular">{formatCurrency(branch.outgoingSent)}</TableCell>
                          <TableCell className="text-right font-mono text-xs tabular text-green-400">{formatCurrency(branch.incomingActual)}</TableCell>
                          <TableCell className="text-right font-mono text-xs tabular text-red-500">{formatCurrency(branch.discrepancy)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </Card>
          </div>

          <div>
            <h2 className="text-sm font-medium text-[#111111] mb-3">Per Item</h2>
            <Card>
              {itemStats.length === 0 ? (
                <div className="px-6 py-8 text-center text-sm text-[#444444]">No item data yet</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead>Unit</TableHead>
                        <TableHead className="text-right">Qty Sent</TableHead>
                        <TableHead className="text-right">Qty Received</TableHead>
                        <TableHead className="text-right">Sent Value</TableHead>
                        <TableHead className="text-right">Actual Value</TableHead>
                        <TableHead className="text-right">Discrepancy</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {itemStats.map(item => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.name}</TableCell>
                          <TableCell className="text-[#888888]">{item.unit}</TableCell>
                          <TableCell className="text-right font-mono text-xs tabular">{item.quantitySent}</TableCell>
                          <TableCell className="text-right font-mono text-xs tabular">{item.quantityReceived}</TableCell>
                          <TableCell className="text-right font-mono text-xs tabular">{formatCurrency(item.sentValue)}</TableCell>
                          <TableCell className="text-right font-mono text-xs tabular text-green-400">{formatCurrency(item.actualValue)}</TableCell>
                          <TableCell className="text-right font-mono text-xs tabular text-red-500">{formatCurrency(item.discrepancy)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}

function SummaryCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color?: 'green' | 'red' }) {
  const valueColor = color === 'green' ? 'text-green-400' : color === 'red' ? 'text-red-500' : 'text-[#111111]'
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-3 text-[#444444]">
        {icon}
        <span className="text-xs uppercase tracking-wider font-medium text-[#888888]">{label}</span>
      </div>
      <p className={`text-2xl font-bold font-mono tabular tracking-tight ${valueColor}`}>{value}</p>
    </Card>
  )
}
