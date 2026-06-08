'use client'
import { useState, useRef, useEffect, KeyboardEvent } from 'react'
import { Item } from '@/types'
import { Input } from '@/components/ui/input'
import { formatCurrency } from '@/lib/utils'

interface ItemAutocompleteProps {
  items: Item[]
  selectedItem: Item | null
  onSelect: (item: Item | null, query: string) => void
  placeholder?: string
}

export function ItemAutocomplete({ items, selectedItem, onSelect, placeholder }: ItemAutocompleteProps) {
  const [query, setQuery] = useState(selectedItem?.name ?? '')
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const filtered = query.length > 0
    ? items.filter(i => i.name.toLowerCase().includes(query.toLowerCase()))
    : items

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [])

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!open || filtered.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlighted(h => Math.min(h + 1, filtered.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setHighlighted(h => Math.max(h - 1, 0)) }
    if (e.key === 'Enter') { e.preventDefault(); pick(filtered[highlighted]) }
    if (e.key === 'Escape') setOpen(false)
  }

  function pick(item: Item) {
    setQuery(item.name)
    setOpen(false)
    onSelect(item, item.name)
  }

  return (
    <div ref={containerRef} className="relative">
      <Input
        value={query}
        onChange={e => {
          const val = e.target.value
          setQuery(val)
          setOpen(true)
          setHighlighted(0)
          onSelect(null, val)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder ?? 'Search items…'}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full rounded-lg border border-[#DADADA] bg-white shadow-lg overflow-hidden">
          {filtered.map((item, i) => (
            <li key={item.id}>
              <button
                type="button"
                className={`flex w-full items-center justify-between px-3 py-2.5 text-sm transition-colors text-left ${
                  i === highlighted ? 'bg-[#E8231A]/8 text-[#111111]' : 'text-[#111111] hover:bg-black/5'
                }`}
                onMouseEnter={() => setHighlighted(i)}
                onMouseDown={() => pick(item)}
              >
                <span className="font-medium">{item.name}</span>
                <span className="text-[#9CA3AF] font-mono text-xs ml-2 shrink-0">
                  {item.unit} · {formatCurrency(Number(item.price_per_unit))}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
