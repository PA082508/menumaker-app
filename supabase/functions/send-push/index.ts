// supabase/functions/send-push/index.ts
// Sends Web Push notification to one or more users

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'https://esm.sh/web-push@3.6.7'

webpush.setVapidDetails(
  Deno.env.get('VAPID_EMAIL')!,
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!
)

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

Deno.serve(async (req) => {
  const { org_id, center_id, role, user_ids, title, body, url, tag, urgent } = await req.json()

  // Find subscriptions
  let query = supabase.schema('menumaker')
    .from('push_subscriptions')
    .select('*')
    .eq('org_id', org_id)
    .eq('is_active', true)

  if (center_id) query = query.eq('center_id', center_id)

  // If specific user_ids — filter by them
  // If role — join with user_roles
  if (user_ids?.length) {
    query = query.in('user_id', user_ids)
  }

  const { data: subs } = await query

  if (!subs?.length) {
    return new Response(JSON.stringify({ sent: 0 }), { status: 200 })
  }

  const payload = JSON.stringify({ title, body, url: url || '/', tag, urgent })
  let sent = 0

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      )
      sent++
    } catch (err: any) {
      // Subscription expired — deactivate
      if (err.statusCode === 410) {
        await supabase.schema('menumaker')
          .from('push_subscriptions')
          .update({ is_active: false })
          .eq('id', sub.id)
      }
    }
  }

  return new Response(JSON.stringify({ sent }), { status: 200 })
})
