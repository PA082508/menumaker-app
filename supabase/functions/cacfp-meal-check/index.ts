// supabase/functions/cacfp-meal-check/index.ts
// Called by pg_cron every 5 min
// Checks if any classroom missed meal count 15+ min after scheduled meal time
// Sends push notification to teacher + director

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

Deno.serve(async () => {
  const now = new Date()
  const todayET = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }))
  const dayOfWeek = todayET.getDay()

  // Skip weekends
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return new Response(JSON.stringify({ skipped: 'weekend' }), { status: 200 })
  }

  const timeNow = `${String(todayET.getHours()).padStart(2,'0')}:${String(todayET.getMinutes()).padStart(2,'0')}`
  const mondayDate = getMondayDate(todayET)
  const dayKey = ['sun','mon','tue','wed','thu','fri','sat'][dayOfWeek]

  // Get all active meal schedules
  const { data: schedules } = await supabase
    .schema('menumaker')
    .from('meal_schedule')
    .select('classroom_id, slot, start_time')
    .not('start_time', 'is', null)

  if (!schedules?.length) return new Response(JSON.stringify({ checked: 0 }), { status: 200 })

  let triggered = 0

  for (const sch of schedules) {
    // Check if 15 min have passed since meal start
    const mealTime = sch.start_time.slice(0, 5)
    const diff = minutesDiff(mealTime, timeNow)
    if (diff < 15 || diff > 45) continue // only alert between 15-45 min after meal

    // Check if already notified today for this classroom+slot
    const { data: already } = await supabase
      .schema('menumaker')
      .from('notification_log')
      .select('id')
      .eq('classroom_id', sch.classroom_id)
      .eq('meal_slot', sch.slot)
      .gte('sent_at', todayET.toISOString().slice(0, 10))
      .eq('event_type', 'cacfp_violation')
      .limit(1)

    if (already?.length) continue

    // Check if any checkmarks exist for this classroom+slot+day
    const slotCol = getSlotCol(dayKey, sch.slot)
    const { data: records } = await supabase
      .schema('menumaker')
      .from('meal_week_records')
      .select(slotCol)
      .eq('classroom_id', sch.classroom_id)
      .eq('monday_date', mondayDate)
      .eq(slotCol, 1)
      .limit(1)

    if (records?.length) continue // already has checkmarks — OK

    // Get classroom info
    const { data: cls } = await supabase
      .schema('menumaker')
      .from('classrooms')
      .select('name, center_id, org_id')
      .eq('id', sch.classroom_id)
      .single()

    if (!cls) continue

    const slotLabel: Record<string,string> = {
      breakfast: 'Breakfast', am_snack: 'AM Snack', lunch: 'Lunch', supper: 'Supper'
    }

    const message = `⚠️ CACFP: Meal count not recorded for ${slotLabel[sch.slot] || sch.slot} in ${cls.name}. Please mark attendance immediately.`

    // Send push to teachers + director of this center
    await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
      },
      body: JSON.stringify({
        org_id: cls.org_id,
        center_id: cls.center_id,
        title: '⚠️ CACFP Violation',
        body: message,
        url: `/portal/teacher/${getCenterCode(cls.center_id)}`,
        tag: `cacfp-${sch.classroom_id}-${sch.slot}`,
        urgent: true
      })
    })

    // Log the notification
    await supabase.schema('menumaker').from('notification_log').insert({
      org_id: cls.org_id,
      center_id: cls.center_id,
      event_type: 'cacfp_violation',
      classroom_id: sch.classroom_id,
      meal_slot: sch.slot,
      message,
      triggered_by: 'system'
    })

    triggered++
  }

  return new Response(JSON.stringify({ triggered }), { status: 200 })
})

function minutesDiff(from: string, to: string): number {
  const [fh, fm] = from.split(':').map(Number)
  const [th, tm] = to.split(':').map(Number)
  return (th * 60 + tm) - (fh * 60 + fm)
}

function getMondayDate(d: Date): string {
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  const mon = new Date(d.setDate(diff))
  return mon.toISOString().slice(0, 10)
}

function getSlotCol(day: string, slot: string): string {
  const s: Record<string,string> = { breakfast:'b', am_snack:'as', lunch:'l', supper:'su' }
  return `${day}_${s[slot] || slot}`
}

function getCenterCode(centerId: string): string {
  const map: Record<string,string> = {
    '4aed7d5a-00d0-4a4c-ac99-311046ad2027': 'ridge',
    '881ef4ce-1a27-4d3b-aa60-59d2a307bf2b': 'pearl',
    '099c404b-e6d3-4543-9d9a-1fb11a2ee62d': 'alpha',
  }
  return map[centerId] || 'ridge'
}
