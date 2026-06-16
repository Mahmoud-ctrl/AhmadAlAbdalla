'use client'

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Bell } from 'lucide-react'
import Link from 'next/link'
import type { AppNotification } from '@/hooks/use-notifications'

type Props = {
  notifications: AppNotification[]
  unreadCount: number
  markAllRead: () => Promise<void>
  placement?: 'left' | 'right'
}

export function NotificationBell({ notifications, unreadCount, markAllRead, placement = 'right' }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  function toggle() {
    const next = !open
    setOpen(next)
    if (next && unreadCount > 0) markAllRead()
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label="Notifications"
        className="relative flex h-8 w-8 items-center justify-center rounded-lg border border-[#DADADA] text-[#6B7280] transition-colors hover:bg-black/5 hover:text-[#111111]"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#E8231A] px-[3px] text-[9px] font-bold text-white leading-none">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className={`absolute z-50 w-80 rounded-xl border border-[#E5E5E5] bg-white shadow-xl overflow-hidden ${placement === 'left' ? 'left-0 bottom-10' : 'right-0 top-10'}`}
          >
            <div className="px-4 py-3 border-b border-[#F0F0F0]">
              <span className="text-sm font-semibold text-[#111111]">Notifications</span>
            </div>
            {notifications.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-[#9CA3AF]">No new notifications</p>
            ) : (
              <div className="divide-y divide-[#F5F5F5] max-h-80 overflow-y-auto">
                {notifications.map(n => (
                  <Link
                    key={n.id}
                    href={`/transfers/${n.data?.transfer_id ?? ''}`}
                    onClick={() => setOpen(false)}
                    className="flex flex-col gap-0.5 px-4 py-3 hover:bg-[#F8F8F8] transition-colors"
                  >
                    <span className="text-sm font-medium text-[#111111]">{n.title}</span>
                    {n.body && (
                      <span className="text-xs text-[#6B7280]">{n.body}</span>
                    )}
                    <span className="mt-0.5 text-[10px] text-[#9CA3AF] font-mono">
                      {new Date(n.created_at).toLocaleString()}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
