'use client'
import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { Branch, Item } from '@/types'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Printer, TrendingUp, CheckCircle, AlertCircle } from 'lucide-react'

type BranchStat = Branch & {
  totalBorrowed: number
  totalReturned: number
  outstanding: number
  transferCount: number
}

type ItemStat = Item & {
  totalQtyMoved: number
  totalValue: number
  totalReturnedValue: number
  outstanding: number
}

export default function ReportPage() {
  const [branchStats, setBranchStats] = useState<BranchStat[]>([])
  const [itemStats, setItemStats] = useState<ItemStat[]>([])
  const [summary, setSummary] = useState({ circulation: 0, settled: 0, outstanding: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [{ data: branches }, { data: items }, { data: transfers }] = await Promise.all([
        supabase.from('branches').select('*'),
        supabase.from('items').select('*'),
        supabase.from('transfers').select('to_branch_id, item_id, quantity, quantity_returned'),
      ])

      const branchList = branches || []
      const itemList = items || []
      const transferList = transfers || []

      const itemMap: Record<string, Item> = {}
      for (const i of itemList) itemMap[i.id] = i

      // Per branch
      const bStats: BranchStat[] = branchList.map(b => {
        const mine = transferList.filter(t => t.to_branch_id === b.id)
        const totalBorrowed = mine.reduce((s, t) => s + Number(t.quantity) * Number(itemMap[t.item_id]?.price_per_unit ?? 0), 0)
        const totalReturned = mine.reduce((s, t) => s + Number(t.quantity_returned) * Number(itemMap[t.item_id]?.price_per_unit ?? 0), 0)
        return { ...b, totalBorrowed, totalReturned, outstanding: totalBorrowed - totalReturned, transferCount: mine.length }
      }).filter(b => b.totalBorrowed > 0).sort((a, b) => b.outstanding - a.outstanding)

      // Per item
      const iStats: ItemStat[] = itemList.map(item => {
        const mine = transferList.filter(t => t.item_id === item.id)
        const price = Number(item.price_per_unit)
        const totalQtyMoved = mine.reduce((s, t) => s + Number(t.quantity), 0)
        const totalValue = totalQtyMoved * price
        const totalReturnedValue = mine.reduce((s, t) => s + Number(t.quantity_returned) * price, 0)
        return { ...item, totalQtyMoved, totalValue, totalReturnedValue, outstanding: totalValue - totalReturnedValue }
      }).filter(i => i.totalValue > 0).sort((a, b) => b.outstanding - a.outstanding)

      // Summary
      const circulation = transferList.reduce((s, t) => s + Number(t.quantity) * Number(itemMap[t.item_id]?.price_per_unit ?? 0), 0)
      const settled = transferList.reduce((s, t) => s + Number(t.quantity_returned) * Number(itemMap[t.item_id]?.price_per_unit ?? 0), 0)

      setBranchStats(bStats)
      setItemStats(iStats)
      setSummary({ circulation, settled, outstanding: circulation - settled })
      setLoading(false)
    }
    load()
  }, [])

  const chartData = branchStats.slice(0, 10).map(b => ({
    name: b.name.length > 14 ? b.name.slice(0, 13) + '…' : b.name,
    outstanding: parseFloat(b.outstanding.toFixed(2)),
  }))

  return (
    <div className="px-4 py-5 sm:px-8 sm:py-8 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[#111111]">P&L Report</h1>
          <p className="text-sm text-[#888888] mt-0.5">Full inter-branch transfer summary</p>
        </div>
        <Button variant="outline" onClick={() => window.print()} className="no-print">
          <Printer className="h-4 w-4" />
          Print / Export
        </Button>
      </div>

      {loading ? (
        <div className="text-sm text-[#444444]">Loading…</div>
      ) : (
        <div className="space-y-8">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <SummaryCard
              icon={<TrendingUp className="h-4 w-4" />}
              label="Total In Circulation"
              value={formatCurrency(summary.circulation)}
            />
            <SummaryCard
              icon={<CheckCircle className="h-4 w-4 text-green-400" />}
              label="Total Settled"
              value={formatCurrency(summary.settled)}
              color="green"
            />
            <SummaryCard
              icon={<AlertCircle className="h-4 w-4 text-amber-400" />}
              label="Total Outstanding"
              value={formatCurrency(summary.outstanding)}
              color="amber"
            />
          </div>

          {/* Bar Chart */}
          {chartData.length > 0 && (
            <Card>
              <div className="px-5 pt-5 pb-2 border-b border-[#E5E5E5]">
                <h2 className="text-sm font-medium text-[#111111]">Outstanding Balance by Branch</h2>
              </div>
              <div className="p-5">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }} barSize={24}>
                    <XAxis dataKey="name" tick={{ fill: '#9CA3AF', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={v => `$${v}`} tick={{ fill: '#9CA3AF', fontSize: 11 }} axisLine={false} tickLine={false} width={60} />
                    <Tooltip
                      cursor={{ fill: 'rgba(0,0,0,0.03)' }}
                      contentStyle={{ background: '#ffffff', border: '1px solid #E5E5E5', borderRadius: '8px', fontSize: '12px', color: '#111111' }}
                      formatter={(v) => [formatCurrency(Number(v)), 'Outstanding']}
                    />
                    <Bar dataKey="outstanding" radius={[4, 4, 0, 0]}>
                      {chartData.map((entry, i) => (
                        <Cell key={i} fill={entry.outstanding > 0 ? '#E8231A' : '#333333'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}

          {/* Per Branch */}
          <div>
            <h2 className="text-sm font-medium text-[#111111] mb-3">Per Branch</h2>
            <Card>
              {branchStats.length === 0 ? (
                <div className="px-6 py-8 text-center text-sm text-[#444444]">No branch data yet</div>
              ) : (
                <div className="overflow-x-auto"><Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Branch</TableHead>
                      <TableHead className="text-right"># Transfers</TableHead>
                      <TableHead className="text-right">Total Borrowed</TableHead>
                      <TableHead className="text-right">Total Returned</TableHead>
                      <TableHead className="text-right">Net Outstanding</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {branchStats.map(b => (
                      <TableRow key={b.id}>
                        <TableCell className="font-medium">{b.name}</TableCell>
                        <TableCell className="text-right text-[#888888] font-mono text-xs tabular">{b.transferCount}</TableCell>
                        <TableCell className="text-right font-mono text-xs tabular">{formatCurrency(b.totalBorrowed)}</TableCell>
                        <TableCell className="text-right font-mono text-xs tabular text-green-400">{formatCurrency(b.totalReturned)}</TableCell>
                        <TableCell className="text-right">
                          <span className={`font-mono text-xs tabular font-semibold ${b.outstanding > 0 ? 'text-amber-400' : 'text-green-400'}`}>
                            {formatCurrency(b.outstanding)}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table></div>
              )}
            </Card>
          </div>

          {/* Per Item */}
          <div>
            <h2 className="text-sm font-medium text-[#111111] mb-3">Per Item</h2>
            <Card>
              {itemStats.length === 0 ? (
                <div className="px-6 py-8 text-center text-sm text-[#444444]">No item data yet</div>
              ) : (
                <div className="overflow-x-auto"><Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead>Unit</TableHead>
                      <TableHead className="text-right">Price / Unit</TableHead>
                      <TableHead className="text-right">Total Qty Moved</TableHead>
                      <TableHead className="text-right">Total Value</TableHead>
                      <TableHead className="text-right">Returned Value</TableHead>
                      <TableHead className="text-right">Outstanding</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {itemStats.map(item => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.name}</TableCell>
                        <TableCell className="text-[#888888]">{item.unit}</TableCell>
                        <TableCell className="text-right font-mono text-xs tabular">{formatCurrency(Number(item.price_per_unit))}</TableCell>
                        <TableCell className="text-right font-mono text-xs tabular">{item.totalQtyMoved}</TableCell>
                        <TableCell className="text-right font-mono text-xs tabular">{formatCurrency(item.totalValue)}</TableCell>
                        <TableCell className="text-right font-mono text-xs tabular text-green-400">{formatCurrency(item.totalReturnedValue)}</TableCell>
                        <TableCell className="text-right">
                          <span className={`font-mono text-xs tabular font-semibold ${item.outstanding > 0 ? 'text-amber-400' : 'text-green-400'}`}>
                            {formatCurrency(item.outstanding)}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table></div>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}

function SummaryCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color?: 'green' | 'amber' }) {
  const valueColor = color === 'green' ? 'text-green-400' : color === 'amber' ? 'text-amber-400' : 'text-[#111111]'
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-3 text-[#444444]">{icon}<span className="text-xs uppercase tracking-wider font-medium text-[#888888]">{label}</span></div>
      <p className={`text-2xl font-bold font-mono tabular tracking-tight ${valueColor}`}>{value}</p>
    </Card>
  )
}
