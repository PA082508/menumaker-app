// ============================================================
// DailyTimeLogPage.tsx — route /staff/time-log
// CACFP Daily Time Log — two types:
//   program: teachers — auto-filled from meal_schedule
//   admin:   directors/admin — manual CACFP activities
// Monthly view, printable, claimable cost calculation
// ============================================================

import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/contexts/OrgContext'
import BackBar from '@/components/BackBar'

// ── types ────────────────────────────────────────────────────
type StaffRow = {
  id: string; first_name: string | null; last_name: string | null
  position: string | null; center_id: string | null
  class_primary: string | null; hourly_rate: number | null
}
type TimeLogEntry = {
  id?: string; log_date: string; activity: string | null
  meal_slot: string | null; begin_time: string; end_time: string
  total_minutes?: number; auto_filled?: boolean; notes?: string | null
}
type MealSlotTime = { slot: string; start_time: string | null; end_time: string | null }

// ── constants ────────────────────────────────────────────────
const MEAL_SLOTS: Record<string, string> = {
  breakfast: 'B = Breakfast', am_snack: 'AM = AM Snack',
  lunch: 'L = Lunch', pm_snack: 'PM = PM Snack',
  supper: 'S = Supper', eve_snack: 'E = Evening Snack',
}
const SLOT_SHORT: Record<string, string> = {
  breakfast: 'B', am_snack: 'AM', lunch: 'L',
  pm_snack: 'PM', supper: 'S', eve_snack: 'E',
}
const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

// ── helpers ──────────────────────────────────────────────────
const pad2 = (n: number) => String(n).padStart(2, '0')
const to12 = (t: string | null) => {
  if (!t) return ''
  const [h, m] = t.slice(0,5).split(':').map(Number)
  const ap = h >= 12 ? 'PM' : 'AM'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}:${pad2(m)} ${ap}`
}
const minutesDiff = (start: string, end: string) => {
  if (!start || !end) return 0
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  return Math.max(0, (eh * 60 + em) - (sh * 60 + sm))
}
const roundTo5 = (mins: number) => Math.round(mins / 5) * 5
const fmtHM = (mins: number) => {
  if (!mins) return '0:00'
  return `${Math.floor(mins / 60)}:${pad2(mins % 60)}`
}
const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate()
const monthName = (m: number) => ['January','February','March','April','May','June','July','August','September','October','November','December'][m]

const isWeekend = (year: number, month: number, day: number) => {
  const d = new Date(year, month, day).getDay()
  return d === 0 || d === 6
}

// ── styles ────────────────────────────────────────────────────
const sel: React.CSSProperties = {
  padding: '8px 12px', borderRadius: 8, border: '1.5px solid #e0e0e0',
  fontSize: 13, fontFamily: 'inherit', outline: 'none', background: '#fff', cursor: 'pointer',
}
const btnPri: React.CSSProperties = {
  padding: '8px 18px', borderRadius: 9, border: 'none', background: '#0f4c35',
  color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
}
const btnSec: React.CSSProperties = {
  padding: '8px 14px', borderRadius: 9, border: '1.5px solid #0f4c35',
  background: '#fff', color: '#0f4c35', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
}
const tinp: React.CSSProperties = {
  padding: '4px 6px', borderRadius: 6, border: '1px solid #e0e0e0',
  fontSize: 12, fontFamily: 'inherit', outline: 'none', width: 85,
}

export default function DailyTimeLogPage() {
  const { org, currentCenter, centers } = useOrg()
  const now = new Date()
  const [year,  setYear]  = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [staffId, setStaffId] = useState('')
  const [logType, setLogType] = useState<'program'|'admin'>('program')

  const [staffList, setStaffList] = useState<StaffRow[]>([])
  const [mealTimes, setMealTimes] = useState<MealSlotTime[]>([])
  const [entries,   setEntries]   = useState<Record<string, TimeLogEntry[]>>({}) // date → entries[]
  const [saving,    setSaving]    = useState(false)
  const [saved,     setSaved]     = useState(false)
  const [empSig,    setEmpSig]    = useState('')
  const [adminSig,  setAdminSig]  = useState('')

  const centerId = currentCenter?.id ?? ''
  const selectedStaff = staffList.find(s => s.id === staffId)
  const daysInMonth   = getDaysInMonth(year, month)

  // Load staff list — filtered by current center
  useEffect(() => {
    if (!org?.id) return
    let q = supabase.schema('menumaker').from('staff')
      .select('id,first_name,last_name,position,center_id,class_primary,hourly_rate')
      .eq('org_id', org.id).eq('is_active', true)
    if (currentCenter?.id) q = q.eq('center_id', currentCenter.id)
    q.order('last_name').then(({ data }) => {
      setStaffList((data ?? []) as StaffRow[])
      setStaffId('') // reset selection when center changes
    })
  }, [org?.id, currentCenter?.id])

  // Load meal schedule when staff selected
  useEffect(() => {
    if (!staffId || !selectedStaff?.class_primary) return
    // Find classroom UUID by name
    supabase.schema('menumaker').from('classrooms')
      .select('id').eq('center_id', selectedStaff.center_id ?? centerId)
      .ilike('name', selectedStaff.class_primary)
      .maybeSingle()
      .then(async ({ data: cls }) => {
        if (!cls) return
        const { data: ms } = await supabase.schema('menumaker').from('meal_schedule')
          .select('slot,start_time,end_time').eq('classroom_id', cls.id)
        setMealTimes((ms ?? []) as MealSlotTime[])
      })
  }, [staffId, selectedStaff?.class_primary])

  // Load existing log entries for month
  useEffect(() => {
    if (!staffId) return
    const monthYear = `${year}-${pad2(month + 1)}`
    supabase.schema('menumaker').from('staff_time_log')
      .select('*').eq('staff_id', staffId)
      .eq('log_type', logType).eq('month_year', monthYear)
      .then(({ data }) => {
        const map: Record<string, TimeLogEntry[]> = {}
        for (const row of (data ?? []) as any[]) {
          const d = row.log_date
          if (!map[d]) map[d] = []
          map[d].push({
            id: row.id, log_date: d, activity: row.activity,
            meal_slot: row.meal_slot,
            begin_time: row.begin_time?.slice(0,5) ?? '',
            end_time: row.end_time?.slice(0,5) ?? '',
            total_minutes: row.total_minutes, auto_filled: row.auto_filled,
            notes: row.notes,
          })
        }
        setEntries(map)
      })
  }, [staffId, logType, year, month])

  // Auto-fill program entries from meal_schedule
  useEffect(() => {
    if (logType !== 'program' || mealTimes.length === 0 || !staffId) return
    setEntries(prev => {
      const next = { ...prev }
      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${pad2(month + 1)}-${pad2(day)}`
        if (isWeekend(year, month, day)) continue
        // Only auto-fill if no existing entries
        if (!next[dateStr] || next[dateStr].length === 0) {
          next[dateStr] = mealTimes
            .filter(m => m.start_time && m.end_time)
            .map(m => ({
              log_date: dateStr,
              activity: 'Serve food and clean up',
              meal_slot: m.slot,
              begin_time: m.start_time!.slice(0,5),
              end_time: m.end_time!.slice(0,5),
              auto_filled: true,
            }))
        }
      }
      return next
    })
  }, [mealTimes, staffId, logType, year, month, daysInMonth])

  const updateEntry = (date: string, idx: number, field: keyof TimeLogEntry, val: string) => {
    setEntries(prev => {
      const dayEntries = [...(prev[date] ?? [])]
      dayEntries[idx] = { ...dayEntries[idx], [field]: val, auto_filled: false }
      return { ...prev, [date]: dayEntries }
    })
  }

  const addEntry = (date: string) => {
    setEntries(prev => {
      const dayEntries = [...(prev[date] ?? []), {
        log_date: date, activity: '', meal_slot: null, begin_time: '', end_time: '', auto_filled: false,
      }]
      return { ...prev, [date]: dayEntries }
    })
  }

  const removeEntry = (date: string, idx: number) => {
    setEntries(prev => {
      const dayEntries = [...(prev[date] ?? [])]
      dayEntries.splice(idx, 1)
      return { ...prev, [date]: dayEntries }
    })
  }

  // Totals
  const totalMinutes = useMemo(() =>
    Object.values(entries).flat().reduce((sum, e) => sum + roundTo5(minutesDiff(e.begin_time, e.end_time)), 0)
  , [entries])
  const totalHours = totalMinutes / 60
  const claimableCost = totalHours * (selectedStaff?.hourly_rate ?? 0)

  const saveLog = async () => {
    if (!staffId || !org?.id) return
    setSaving(true)
    const monthYear = `${year}-${pad2(month + 1)}`
    const rows: any[] = []
    for (const [date, dayEntries] of Object.entries(entries)) {
      for (const e of dayEntries) {
        if (!e.begin_time || !e.end_time) continue
        rows.push({
          org_id: org.id,
          center_id: selectedStaff?.center_id ?? centerId,
          staff_id: staffId, log_type: logType,
          log_date: date, month_year: monthYear,
          activity: e.activity, meal_slot: e.meal_slot,
          begin_time: e.begin_time, end_time: e.end_time,
          auto_filled: e.auto_filled ?? false, notes: e.notes ?? null,
        })
      }
    }
    if (rows.length > 0) {
      await supabase.schema('menumaker').from('staff_time_log')
        .upsert(rows, { onConflict: 'staff_id,log_date,log_type,meal_slot' })
    }
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const print = () => window.print()

  return (
    <div style={{ padding: '24px 32px', fontFamily: "'DM Sans', sans-serif", background: '#f4f6f4', minHeight: '100vh' }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Serif+Display&display=swap" rel="stylesheet" />
      <style>{`@media print { .no-print { display: none !important; } body { background: white; } }`}</style>

      <div className="no-print" style={{ margin: '-24px -32px 18px' }}>
        <BackBar to="/staff" label="Staff" />
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 24, color: '#0a3320' }}>
            CACFP Daily Time Log
            {currentCenter && <span style={{ fontSize: 16, color: '#0f4c35', marginLeft: 10 }}>· {currentCenter.name.replace(/^Play Academy\s+/i,'')}</span>}
          </div>
          <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>Keep on file for 3 years + current year (Ohio Admin Code 5180:2-12-18)</div>
        </div>
        <div className="no-print" style={{ display: 'flex', gap: 8 }}>
          <button onClick={print} style={btnSec}>🖨 Print</button>
          <button onClick={saveLog} disabled={saving || !staffId} style={saving ? { ...btnPri, opacity: 0.7 } : saved ? { ...btnPri, background: '#0f7a4a' } : btnPri}>
            {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save Log'}
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="no-print" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20, alignItems: 'center' }}>
        {/* Staff selector */}
        <select style={{ ...sel, minWidth: 220 }} value={staffId} onChange={e => setStaffId(e.target.value)}>
          <option value="">— Select staff —</option>
          {staffList.map(s => (
            <option key={s.id} value={s.id}>
              {[s.first_name, s.last_name].filter(Boolean).join(' ')} · {s.position ?? ''}
            </option>
          ))}
        </select>

        {/* Log type */}
        <div style={{ display: 'flex', border: '1.5px solid #0f4c35', borderRadius: 8, overflow: 'hidden' }}>
          {[['program','🍽 Program/Food Prep'],['admin','📋 Administrative']].map(([key, label]) => (
            <button key={key} onClick={() => setLogType(key as 'program'|'admin')} style={{
              padding: '7px 14px', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              fontSize: 12, fontWeight: logType === key ? 700 : 400,
              background: logType === key ? '#0f4c35' : '#fff',
              color: logType === key ? '#fff' : '#0f4c35',
            }}>{label}</button>
          ))}
        </div>

        {/* Month/Year */}
        <select style={sel} value={month} onChange={e => setMonth(Number(e.target.value))}>
          {Array.from({length: 12}, (_, i) => <option key={i} value={i}>{monthName(i)}</option>)}
        </select>
        <select style={sel} value={year} onChange={e => setYear(Number(e.target.value))}>
          {[2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {/* Form header (printable) */}
      {staffId && (
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e0e8e0', overflow: 'hidden', marginBottom: 16 }}>
          {/* Title */}
          <div style={{ background: '#0f4c35', padding: '12px 20px', textAlign: 'center' }}>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 16, letterSpacing: '0.05em' }}>CACFP DAILY TIME LOG</div>
            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 2 }}>Play Academy Inc. · {centers.find(c => c.id === selectedStaff?.center_id)?.name?.replace(/^Play Academy\s+/i,'') ?? ''}</div>
          </div>

          {/* Staff info row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 0, borderBottom: '1px solid #e0e8e0' }}>
            {[
              ['Employee Name', [selectedStaff?.first_name, selectedStaff?.last_name].filter(Boolean).join(' ')],
              ['Position', selectedStaff?.position ?? '—'],
              ['Month / Year', `${monthName(month)} ${year}`],
            ].map(([label, value]) => (
              <div key={label} style={{ padding: '10px 16px', borderRight: '1px solid #e0e8e0' }}>
                <div style={{ fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>{label}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1a2e1a' }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Official CACFP Directions — must match form exactly */}
          <div style={{ padding: '12px 20px', background: '#fff', borderBottom: '1px solid #e0e8e0', fontSize: 11, color: '#222', lineHeight: 1.6 }}>
            <strong>Directions:</strong> Agencies can use this prototype Daily Time Log if they will be <u>claiming</u> CACFP operational program/food preparation labor costs or administrative costs of staff that on a daily basis do not spend 100% of their time on food/CACFP related duties. Labor costs for staff that spend 100% of their time on CACFP related duties each day can be documented with regular time/payment records.
            <ul style={{ margin: '6px 0 0 16px', padding: 0, listStyle: 'disc' }}>
              <li>Have each staff person complete their own time log each day. Staff that performs both operational program labor and administrative labor needs to complete a separate log for each.</li>
              <li>Each staff person records the meal and/or CACFP related activity and the time spent on that activity (round to nearest 5 minute) each day</li>
              <li>At end of month, tally total time worked on CACFP food related activities. Turn in completed log to director.</li>
              <li>Administration to calculate total claimable labor costs by completing the bottom section.</li>
              <li>Keep Daily Time Log on file with other CACFP documents for 3 years plus the current year.</li>
            </ul>
          </div>
          <div style={{ padding: '8px 16px', background: '#f8fbf8', borderBottom: '1px solid #e0e8e0', display: 'flex', gap: 16 }}>
            {['Program/Food Preparation Labor','Administrative Labor'].map(label => (
              <label key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                <span style={{
                  display: 'inline-block', width: 14, height: 14, border: '1.5px solid #0f4c35',
                  borderRadius: 2, background: (logType === 'program' ? label.startsWith('Program') : label.startsWith('Admin')) ? '#0f4c35' : '#fff',
                  flexShrink: 0,
                }} />
                {label}
              </label>
            ))}
          </div>

          {/* Meal slot legend (program only) */}
          {logType === 'program' && (
            <div style={{ padding: '6px 16px', background: '#f0f4f1', borderBottom: '1px solid #e0e8e0', fontSize: 11, color: '#555' }}>
              {Object.entries(SLOT_SHORT).map(([k, v]) => `${v} = ${k.replace('_',' ').replace(/\b\w/g, c => c.toUpperCase())}`).join('  ·  ')}
            </div>
          )}

          {/* Table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f0f4f1', borderBottom: '1px solid #e0e8e0' }}>
                  <th style={{ padding: '8px 10px', textAlign: 'center', width: 40, fontWeight: 700, color: '#0f4c35', fontSize: 11 }}>Date</th>
                  {logType === 'program' && <th style={{ padding: '8px 10px', textAlign: 'center', width: 60, fontWeight: 700, color: '#0f4c35', fontSize: 11 }}>Slot</th>}
                  <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700, color: '#0f4c35', fontSize: 11 }}>Describe CACFP Activity</th>
                  <th style={{ padding: '8px 4px', textAlign: 'center', fontWeight: 700, color: '#0f4c35', fontSize: 10, lineHeight: 1.2, width: 70 }}>Round Time<br/>to Nearest<br/>5 Minute</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center', width: 90, fontWeight: 700, color: '#0f4c35', fontSize: 11 }}>Begin Time</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center', width: 90, fontWeight: 700, color: '#0f4c35', fontSize: 11 }}>End Time</th>
                  <th style={{ padding: '8px 4px', textAlign: 'center', fontWeight: 700, color: '#0f4c35', fontSize: 10, lineHeight: 1.2, width: 80 }}>Daily Total<br/>in MINUTES</th>
                  <th style={{ padding: '8px 4px', textAlign: 'center', fontWeight: 700, color: '#0f4c35', fontSize: 10, lineHeight: 1.2, width: 60 }}>Worked on<br/>CACFP</th>
                  <th className="no-print" style={{ padding: '8px 6px', width: 60 }}></th>
                </tr>
              </thead>
              <tbody>
                {Array.from({length: daysInMonth}, (_, i) => i + 1).map(day => {
                  const dateStr = `${year}-${pad2(month + 1)}-${pad2(day)}`
                  const dow = new Date(year, month, day).getDay()
                  const isWknd = dow === 0 || dow === 6
                  const dayEntries = entries[dateStr] ?? []
                  const dayMins = dayEntries.reduce((s, e) => s + roundTo5(minutesDiff(e.begin_time, e.end_time)), 0)

                  // Show at least one row per day
                  const rows = dayEntries.length > 0 ? dayEntries : [{ log_date: dateStr, activity: '', meal_slot: null, begin_time: '', end_time: '', auto_filled: false }]

                  return rows.map((entry, idx) => (
                    <tr key={`${dateStr}-${idx}`} style={{
                      borderBottom: idx === rows.length - 1 ? '1px solid #e8e8e8' : '1px solid #f5f5f5',
                      background: isWknd ? '#f8f4f0' : idx % 2 === 0 ? '#fff' : '#fafbfa',
                    }}>
                      {idx === 0 && (
                        <>
                          <td rowSpan={rows.length} style={{ padding: '6px 10px', textAlign: 'center', fontWeight: 600, color: isWknd ? '#aaa' : '#0a3320', verticalAlign: 'middle' }}>
                            {pad2(day)}
                          </td>
                        </>
                      )}
                      {logType === 'program' && (
                        <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                          {isWknd ? '' : (
                            <span style={{
                              display: 'inline-block', padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700,
                              background: '#0f4c35', color: '#fff',
                            }}>
                              {SLOT_SHORT[entry.meal_slot ?? ''] ?? ''}
                            </span>
                          )}
                        </td>
                      )}
                      <td style={{ padding: '4px 8px' }}>
                        {isWknd ? (
                          <span style={{ color: '#ccc', fontSize: 11 }}>Weekend</span>
                        ) : (
                          <input
                            className="no-print"
                            value={entry.activity ?? ''}
                            onChange={e => updateEntry(dateStr, idx, 'activity', e.target.value)}
                            placeholder={logType === 'program' ? (MEAL_SLOTS[entry.meal_slot ?? ''] ?? 'Activity…') : 'Describe CACFP activity…'}
                            style={{ ...tinp, width: '100%' }}
                          />
                        )}
                        <span className="print-only" style={{ fontSize: 11 }}>{entry.activity}</span>
                      </td>
                      <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                        {!isWknd && (
                          <>
                            <input className="no-print" type="time" value={entry.begin_time} onChange={e => updateEntry(dateStr, idx, 'begin_time', e.target.value)} style={tinp} />
                            <span className="print-only" style={{ fontSize: 11 }}>{to12(entry.begin_time)}</span>
                          </>
                        )}
                      </td>
                      <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                        {!isWknd && (
                          <>
                            <input className="no-print" type="time" value={entry.end_time} onChange={e => updateEntry(dateStr, idx, 'end_time', e.target.value)} style={tinp} />
                            <span className="print-only" style={{ fontSize: 11 }}>{to12(entry.end_time)}</span>
                          </>
                        )}
                      </td>
                      <td style={{ padding: '4px 8px', textAlign: 'center', fontWeight: 600, color: dayMins > 0 ? '#0f4c35' : '#ccc' }}>
                        {idx === 0 && dayMins > 0 ? fmtHM(dayMins) : idx === 0 ? '0:00' : ''}
                      </td>
                      <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                        {idx === 0 && !isWknd && (
                          <input type="checkbox" defaultChecked={dayMins > 0} style={{ width: 14, height: 14, accentColor: '#0f4c35' }} />
                        )}
                      </td>
                      <td className="no-print" style={{ padding: '4px 6px', textAlign: 'center' }}>
                        {!isWknd && (
                          <div style={{ display: 'flex', gap: 3, justifyContent: 'center' }}>
                            {idx === rows.length - 1 && (
                              <button onClick={() => addEntry(dateStr)} title="Add row" style={{ fontSize: 14, background: 'none', border: '1px solid #0f4c35', borderRadius: 4, color: '#0f4c35', cursor: 'pointer', padding: '1px 6px', lineHeight: 1 }}>+</button>
                            )}
                            {dayEntries.length > 0 && (
                              <button onClick={() => removeEntry(dateStr, idx)} title="Remove" style={{ fontSize: 12, background: 'none', border: '1px solid #fca5a5', borderRadius: 4, color: '#dc2626', cursor: 'pointer', padding: '1px 6px' }}>✕</button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                })}
              </tbody>
            </table>
          </div>

          {/* Totals footer — must match official CACFP form */}
          <div style={{ padding: '14px 20px', background: '#f0f4f1', borderTop: '2px solid #0f4c35' }}>
            {/* Total minutes row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, padding: '6px 0', borderBottom: '1px solid #e0e8e0' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#1a2e1a' }}>Total MINUTES Worked in Month</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#0f4c35', minWidth: 80, textAlign: 'right' }}>{totalMinutes}</div>
            </div>
            {/* Total hours row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, padding: '6px 0', borderBottom: '1px solid #e0e8e0' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#1a2e1a' }}>
                TOTAL CACFP HOURS WORKED IN MONTH<br />
                <span style={{ fontWeight: 400, fontSize: 11 }}>(Total Minutes divided by 60, carry out to 2 decimals)</span>
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#0f4c35', minWidth: 80, textAlign: 'right' }}>{totalHours.toFixed(2)}</div>
            </div>
            {/* Claimable cost row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '6px 0', borderBottom: '1px solid #e0e8e0', fontSize: 12 }}>
              <span style={{ fontWeight: 700 }}>Total CACFP Hours Worked</span>
              <span style={{ fontWeight: 700, color: '#0f4c35', minWidth: 50 }}>{totalHours.toFixed(2)}</span>
              <span>Hourly Wage $</span>
              <span style={{ fontWeight: 700, color: '#0f4c35' }}>${(selectedStaff?.hourly_rate ?? 0).toFixed(2)}</span>
              <span>Total Claimable Labor Costs $</span>
              <span style={{ fontWeight: 700, color: '#0f4c35', fontSize: 14 }}>${claimableCost.toFixed(2)}</span>
            </div>

            {/* Signature lines */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40, marginTop: 16 }}>
              <div>
                <input
                  className="no-print"
                  value={empSig}
                  onChange={e => setEmpSig(e.target.value)}
                  placeholder="Employee — type full name to sign electronically"
                  style={{ ...tinp, width: '100%', fontSize: 13, padding: '7px 10px',
                    fontStyle: empSig ? 'italic' : 'normal',
                    fontFamily: empSig ? 'Georgia, serif' : 'inherit',
                    marginBottom: 4,
                  }}
                />
                {empSig
                  ? <div style={{ fontFamily: 'Georgia, serif', fontSize: 16, fontStyle: 'italic', color: '#1a2e1a', borderBottom: '1px solid #555', paddingBottom: 4, marginBottom: 4 }}>{empSig}</div>
                  : <div style={{ borderBottom: '1px solid #555', height: 32, marginBottom: 4 }} />
                }
                <div style={{ fontSize: 11, color: '#666' }}>
                  Employee Signature · {empSig ? new Date().toLocaleDateString() : 'Date'}
                </div>
              </div>
              <div>
                <input
                  className="no-print"
                  value={adminSig}
                  onChange={e => setAdminSig(e.target.value)}
                  placeholder="Administrator — type full name to sign electronically"
                  style={{ ...tinp, width: '100%', fontSize: 13, padding: '7px 10px',
                    fontStyle: adminSig ? 'italic' : 'normal',
                    fontFamily: adminSig ? 'Georgia, serif' : 'inherit',
                    marginBottom: 4,
                  }}
                />
                {adminSig
                  ? <div style={{ fontFamily: 'Georgia, serif', fontSize: 16, fontStyle: 'italic', color: '#1a2e1a', borderBottom: '1px solid #555', paddingBottom: 4, marginBottom: 4 }}>{adminSig}</div>
                  : <div style={{ borderBottom: '1px solid #555', height: 32, marginBottom: 4 }} />
                }
                <div style={{ fontSize: 11, color: '#666' }}>
                  Signature of Administrator · {adminSig ? new Date().toLocaleDateString() : 'Date'}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {!staffId && (
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e0e8e0', padding: 40, textAlign: 'center', color: '#aaa', fontSize: 13 }}>
          {!currentCenter
            ? 'Select a center in the sidebar first, then choose a staff member.'
            : 'Select a staff member to view or generate their CACFP Daily Time Log.'}
        </div>
      )}
    </div>
  )
}
