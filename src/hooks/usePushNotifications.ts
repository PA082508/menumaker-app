// src/hooks/usePushNotifications.ts
// Subscribes the current user to Web Push notifications
// and saves the subscription to menumaker.push_subscriptions

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useOrg } from '@/contexts/OrgContext'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
}

export function usePushNotifications() {
  const { user } = useAuth()
  const { org, currentCenter } = useOrg()
  const [status, setStatus] = useState<'idle'|'subscribed'|'denied'|'error'>('idle')

  const subscribe = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setStatus('error'); return
    }
    try {
      const reg = await navigator.serviceWorker.ready
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') { setStatus('denied'); return }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      })

      const { endpoint, keys } = sub.toJSON() as any
      await supabase.schema('menumaker').from('push_subscriptions').upsert({
        user_id: user?.id,
        org_id: org?.id,
        center_id: currentCenter?.id ?? null,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        is_active: true,
      }, { onConflict: 'user_id,endpoint' })

      setStatus('subscribed')
    } catch (err) {
      console.error('[push]', err)
      setStatus('error')
    }
  }

  // Auto-subscribe when user is logged in
  useEffect(() => {
    if (user && org && status === 'idle') subscribe()
  }, [user, org])

  return { status, subscribe }
}
