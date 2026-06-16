'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export type AppNotification = {
  id: string
  type: string
  title: string
  body: string | null
  data: Record<string, string> | null
  read_at: string | null
  created_at: string
}

export function useNotifications(userId: string | undefined) {
  const [notifications, setNotifications] = useState<AppNotification[]>([])

  useEffect(() => {
    if (!userId) return

    supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (data) setNotifications(data as AppNotification[])
      })

    const channel = supabase
      .channel(`notifications-${userId}-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          setNotifications(prev => [payload.new as AppNotification, ...prev].slice(0, 20))
          const audio = new Audio('/notification.mp3')
          audio.play().catch(() => {})
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [userId])

  const markAllRead = useCallback(async () => {
    if (!userId) return
    const now = new Date().toISOString()
    await supabase
      .from('notifications')
      .update({ read_at: now })
      .is('read_at', null)
    setNotifications(prev => prev.map(n => (n.read_at ? n : { ...n, read_at: now })))
  }, [userId])

  const unreadCount = notifications.filter(n => !n.read_at).length

  return { notifications, unreadCount, markAllRead }
}
