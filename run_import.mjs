import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const supabase = createClient(
  'https://trrmyqfpxntmgxnqkikp.supabase.co',
  process.env.SUPABASE_SERVICE_KEY
)

// Step 1: migration via REST SQL endpoint
const migrationSQL = `
ALTER TABLE menumaker.staff
  ADD COLUMN IF NOT EXISTS birthday date,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS phone2 text,
  ADD COLUMN IF NOT EXISTS brightwheel_role text,
  ADD COLUMN IF NOT EXISTS brightwheel_activated boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS brightwheel_rooms text,
  ADD COLUMN IF NOT EXISTS emergency_contact_name text,
  ADD COLUMN IF NOT EXISTS emergency_contact_relationship text,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone text,
  ADD COLUMN IF NOT EXISTS allergies text,
  ADD COLUMN IF NOT EXISTS medications text,
  ADD COLUMN IF NOT EXISTS doctor_name text,
  ADD COLUMN IF NOT EXISTS doctor_phone text,
  ADD COLUMN IF NOT EXISTS degree text,
  ADD COLUMN IF NOT EXISTS certification text,
  ADD COLUMN IF NOT EXISTS ece_credits text,
  ADD COLUMN IF NOT EXISTS infant_toddler_credits text,
  ADD COLUMN IF NOT EXISTS certification_notes text,
  ADD COLUMN IF NOT EXISTS photo_url text,
  ADD COLUMN IF NOT EXISTS brightwheel_profile_created_at timestamptz;
`

console.log('Running migration...')
const migRes = await fetch('https://trrmyqfpxntmgxnqkikp.supabase.co/rest/v1/rpc/exec_sql', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'apikey': process.env.SUPABASE_SERVICE_KEY,
    'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
  },
  body: JSON.stringify({ sql: migrationSQL })
})
if (!migRes.ok) {
  // Try direct postgres endpoint
  const sqlRes = await fetch('https://trrmyqfpxntmgxnqkikp.supabase.co/pg/query', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': process.env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
    },
    body: JSON.stringify({ query: migrationSQL })
  })
  console.log('Migration via pg:', sqlRes.status, await sqlRes.text())
} else {
  console.log('Migration OK')
}

// Step 2: get existing staff
const { data: existing, error: fetchErr } = await supabase
  .schema('menumaker').from('staff').select('id, email')
if (fetchErr) { console.error('Fetch error:', fetchErr); process.exit(1) }

const byEmail = {}
for (const s of existing ?? []) {
  if (s.email) byEmail[s.email.toLowerCase()] = s.id
}
console.log(`Existing in DB: ${Object.keys(byEmail).length}`)

const staff = JSON.parse(readFileSync('/tmp/staff_data.json', 'utf8'))
let updated = 0, inserted = 0, errors = 0

for (const rec of staff) {
  const key = rec.email.toLowerCase()
  const existingId = byEmail[key]

  const fields = {}
  const safe = (v) => (v === null || v === undefined || v === '') ? undefined : v
  if (safe(rec.phone)) fields.phone = rec.phone
  if (safe(rec.phone2)) fields.phone2 = rec.phone2
  if (safe(rec.birthday)) fields.birthday = rec.birthday
  if (safe(rec.address)) fields.address = rec.address
  if (safe(rec.hire_date)) fields.hire_date = rec.hire_date
  if (safe(rec.brightwheel_role)) fields.brightwheel_role = rec.brightwheel_role
  fields.brightwheel_activated = rec.brightwheel_activated
  if (safe(rec.brightwheel_rooms)) fields.brightwheel_rooms = rec.brightwheel_rooms
  if (safe(rec.brightwheel_profile_created_at)) fields.brightwheel_profile_created_at = rec.brightwheel_profile_created_at
  if (safe(rec.emergency_contact_name)) fields.emergency_contact_name = rec.emergency_contact_name
  if (safe(rec.emergency_contact_relationship)) fields.emergency_contact_relationship = rec.emergency_contact_relationship
  if (safe(rec.emergency_contact_phone)) fields.emergency_contact_phone = rec.emergency_contact_phone
  if (safe(rec.allergies)) fields.allergies = rec.allergies
  if (safe(rec.medications)) fields.medications = rec.medications
  if (safe(rec.doctor_name)) fields.doctor_name = rec.doctor_name
  if (safe(rec.doctor_phone)) fields.doctor_phone = rec.doctor_phone
  if (safe(rec.degree)) fields.degree = rec.degree
  if (safe(rec.certification)) fields.certification = rec.certification
  if (safe(rec.ece_credits)) fields.ece_credits = rec.ece_credits
  if (safe(rec.infant_toddler_credits)) fields.infant_toddler_credits = rec.infant_toddler_credits
  if (safe(rec.certification_notes)) fields.certification_notes = rec.certification_notes

  if (existingId) {
    const { error } = await supabase.schema('menumaker').from('staff')
      .update(fields).eq('id', existingId)
    if (error) { console.error(`✗ UPDATE ${rec.email}: ${error.message}`); errors++ }
    else { console.log(`✓ updated: ${rec.first_name} ${rec.last_name}`); updated++ }
  } else {
    const { error } = await supabase.schema('menumaker').from('staff').insert({
      ...fields,
      email: rec.email,
      first_name: rec.first_name,
      last_name: rec.last_name,
      center_id: rec.center_id,
      org_id: '3a9a290e-7e49-491e-946b-ad86f2399910',
      is_active: true,
    })
    if (error) { console.error(`✗ INSERT ${rec.email}: ${error.message}`); errors++ }
    else { console.log(`+ inserted: ${rec.first_name} ${rec.last_name}`); inserted++ }
  }
}

console.log(`\nDone: ${updated} updated, ${inserted} inserted, ${errors} errors`)
