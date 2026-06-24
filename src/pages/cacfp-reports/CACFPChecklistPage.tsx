// ============================================================
// CACFPChecklistPage.tsx — route /cacfp-checklist
//
// CACFP compliance self-audit checklist (Administrator's Notebook).
// 8 sections / 51 items. Each item: checkbox + requirement text + status
// (Not Done / Complete / N/A) + optional notes + date completed.
//
// State is local-only, persisted to localStorage keyed by center + fiscal
// year (cacfp_checklist:<centerId>:<fy>). Per-section + overall progress,
// All/Incomplete/Complete filter, and a clean window.print() view.
// ============================================================

import { useEffect, useMemo, useState } from 'react'
import { useOrg } from '@/contexts/OrgContext'

// ─── Checklist data (exact text from the Administrator's Notebook) ─────────────
type Item = { id: string; text: string }
type Section = { id: number; title: string; items: Item[] }

const SECTIONS: Section[] = [
  {
    id: 1, title: 'Meal Service Records', items: [
      { id: '1.1', text: 'Daily meal count by meal type (breakfast/lunch/snack/supper)' },
      { id: '1.2', text: 'Meal count recorded at point of service — by individual name or group tally' },
      { id: '1.3', text: 'Daily attendance linked to meal count' },
      { id: '1.4', text: 'Monthly menu posted with date — meets USDA meal pattern' },
      { id: '1.5', text: 'Menus retained on file (all components documented)' },
      { id: '1.6', text: 'Infant menu — Parent Preference Form on file for each infant' },
      { id: '1.7', text: 'Meal pattern compliance by age group (grain/protein/fruit/veg/milk)' },
      { id: '1.8', text: 'Creditable foods verified against USDA Product Formulation Statements' },
    ],
  },
  {
    id: 2, title: 'Participant Records', items: [
      { id: '2.1', text: 'Enrollment Form completed by parent/guardian before first meal claimed' },
      { id: '2.2', text: 'Enrollment Form includes: child name/DOB/days & hours in care/meals served' },
      { id: '2.3', text: 'Enrollment Forms updated annually' },
      { id: '2.4', text: 'Income Eligibility Application (MBIE/EIEA) completed per household' },
      { id: '2.5', text: 'MBIE updated annually (effective July 1 each year)' },
      { id: '2.6', text: 'Eligibility determination recorded: Free/Reduced/Paid' },
      { id: '2.7', text: 'Enrollment Roster current — reflects all enrolled children with eligibility category' },
      { id: '2.8', text: 'Children removed from roster when they leave care' },
      { id: '2.9', text: 'Daily Sign-in/Sign-out sheets maintained for all participants' },
      { id: '2.10', text: 'Foster children listed as categorically Free' },
    ],
  },
  {
    id: 3, title: 'Financial / Fiscal Management', items: [
      { id: '3.1', text: 'Original itemized receipts/invoices for all food purchases on file' },
      { id: '3.2', text: 'Original itemized receipts for non-food supplies on file' },
      { id: '3.3', text: 'Labor costs documented — time & attendance logs for food service staff' },
      { id: '3.4', text: 'Administrative labor documented — time & attendance logs' },
      { id: '3.5', text: 'Monthly claim for reimbursement submitted on time' },
      { id: '3.6', text: 'Reimbursement payments received and recorded' },
      { id: '3.7', text: 'Nonprofit Food Service Status documented monthly' },
      { id: '3.8', text: 'Excess balance does not exceed 6 months average expenses' },
      { id: '3.9', text: 'Annual Budget on file' },
      { id: '3.10', text: 'Annual Budget submitted at renewal' },
      { id: '3.11', text: 'Separate CACFP accounting code maintained' },
    ],
  },
  {
    id: 4, title: 'Menu & Food Production', items: [
      { id: '4.1', text: 'MenuMaker menus on file — ChildMenu & InfantsMenu' },
      { id: '4.2', text: 'FoodList matches creditable foods list' },
      { id: '4.3', text: 'Recipes on file with meal pattern contribution noted' },
      { id: '4.4', text: 'ForPurchase list reconciled with actual invoices' },
      { id: '4.5', text: 'Standardized recipes used — portion sizes documented' },
      { id: '4.6', text: 'Whole grain-rich foods identified with Product Formulation Statements' },
    ],
  },
  {
    id: 5, title: 'Special Dietary Needs', items: [
      { id: '5.1', text: 'Medical Statement on file for each child with dietary restriction' },
      { id: '5.2', text: 'Milk substitution request form on file' },
      { id: '5.3', text: 'Meal accommodation plan documented and followed' },
    ],
  },
  {
    id: 6, title: 'Staff Training', items: [
      { id: '6.1', text: 'Training conducted at hire for all frontline CACFP staff' },
      { id: '6.2', text: 'Annual training conducted for all CACFP staff' },
      { id: '6.3', text: 'Training log on file: date/location/topics/names of attendees' },
      { id: '6.4', text: 'Director/Administrator training documentation on file' },
    ],
  },
  {
    id: 7, title: 'Program Administration', items: [
      { id: '7.1', text: 'CACFP Agreement signed and on file (renewed annually)' },
      { id: '7.2', text: 'License/registration certificate on file' },
      { id: '7.3', text: 'Civil Rights nondiscrimination statement posted' },
      { id: '7.4', text: 'Civil Rights complaint procedure on file' },
      { id: '7.5', text: 'Action Plans on file (if applicable)' },
      { id: '7.6', text: 'Monitoring visit records on file' },
    ],
  },
  {
    id: 8, title: 'Record Retention', items: [
      { id: '8.1', text: 'All records retained minimum 3 fiscal years + current year' },
      { id: '8.2', text: 'Records retained until all audits/investigations resolved' },
      { id: '8.3', text: 'Archiving policy documented and followed' },
    ],
  },
]

const TOTAL_ITEMS = SECTIONS.reduce((n, s) => n + s.items.length, 0) // 51

// ─── Item state ────────────────────────────────────────────────────────────────
type Status = 'not_done' | 'complete' | 'na'
type ItemState = { status: Status; notes: string; date: string }
type ChecklistState = Record<string, ItemState>

const DEFAULT_ITEM: ItemState = { status: 'not_done', notes: '', date: '' }
const isDone = (st?: ItemState) => st?.status === 'complete' || st?.status === 'na'

// CACFP federal fiscal year (Oct 1 – Sep 30): Oct–Dec roll into next year's FY.
function currentFY(): number {
  const d = new Date()
  return d.getMonth() >= 9 ? d.getFullYear() + 1 : d.getFullYear()
}

type Filter = 'all' | 'incomplete' | 'complete'

const STATUS_OPTS: { val: Status; label: string }[] = [
  { val: 'not_done', label: 'Not Done' },
  { val: 'complete', label: 'Complete' },
  { val: 'na',       label: 'N/A' },
]

// ─── Styles ─────────────────────────────────────────────────────────────────────
const inputStyle: React.CSSProperties = {
  padding: '6px 9px', borderRadius: 6, border: '1.5px solid #e0e0e0',
  fontSize: 12, fontFamily: 'inherit', outline: 'none', background: '#fff', color: '#1a1a1a',
}

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total ? Math.round((done / total) * 100) : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 220 }}>
      <div style={{ flex: 1, height: 8, borderRadius: 6, background: '#e8efe9', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: pct === 100 ? '#0f4c35' : '#7ee8b0', transition: 'width 0.2s' }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 600, color: '#0f4c35', whiteSpace: 'nowrap' }}>{done} / {total}</span>
    </div>
  )
}

export default function CACFPChecklistPage() {
  const { currentCenter } = useOrg()
  const centerId = currentCenter?.id ?? null

  const [fy, setFy] = useState<number>(currentFY())
  const [filter, setFilter] = useState<Filter>('all')
  const [data, setData] = useState<ChecklistState>({})

  const storageKey = centerId ? `cacfp_checklist:${centerId}:${fy}` : null

  // load on center / fiscal-year change
  useEffect(() => {
    if (!storageKey) { setData({}); return }
    try {
      const raw = localStorage.getItem(storageKey)
      setData(raw ? JSON.parse(raw) : {})
    } catch {
      setData({})
    }
  }, [storageKey])

  // write-through update (persist immediately to avoid load/save races)
  function update(id: string, patch: Partial<ItemState>) {
    setData(prev => {
      const next = { ...prev, [id]: { ...DEFAULT_ITEM, ...prev[id], ...patch } }
      if (storageKey) {
        try { localStorage.setItem(storageKey, JSON.stringify(next)) } catch { /* ignore quota */ }
      }
      return next
    })
  }

  const toggleCheck = (id: string) => {
    const cur = data[id]?.status
    update(id, {
      status: cur === 'complete' ? 'not_done' : 'complete',
      date: cur === 'complete' ? '' : (data[id]?.date || new Date().toISOString().slice(0, 10)),
    })
  }

  const overallDone = useMemo(
    () => SECTIONS.reduce((n, s) => n + s.items.filter(it => isDone(data[it.id])).length, 0),
    [data],
  )

  const matchesFilter = (st?: ItemState) =>
    filter === 'all' ? true
      : filter === 'complete' ? isDone(st)
      : !isDone(st) // incomplete

  const fyLabel = `FY${fy} (Oct ${fy - 1} – Sep ${fy})`

  if (!centerId) {
    return (
      <div style={{ padding: 40, fontFamily: "'DM Sans', sans-serif", color: '#888' }}>
        Select a center to open its CACFP checklist.
      </div>
    )
  }

  return (
    <div style={{ padding: '28px 32px', fontFamily: "'DM Sans', sans-serif", background: '#f4f6f4', minHeight: '100vh' }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Serif+Display&display=swap" rel="stylesheet" />
      <style>{`@media print {
        body * { visibility: hidden !important; }
        #cacfp-print, #cacfp-print * { visibility: visible !important; }
        #cacfp-print { position: absolute; left: 0; top: 0; width: 100%; }
        .cacfp-noprint { display: none !important; }
        select, input { border: none !important; }
      }`}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div>
          <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 26, color: '#0a3320', marginBottom: 2 }}>
            CACFP Compliance Checklist
          </div>
          <div style={{ fontSize: 12, color: '#888' }}>{currentCenter?.name} · {fyLabel}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }} className="cacfp-noprint">
          <select value={fy} onChange={e => setFy(Number(e.target.value))} style={{ ...inputStyle, cursor: 'pointer', fontSize: 13, padding: '7px 11px' }}>
            {[currentFY() + 1, currentFY(), currentFY() - 1, currentFY() - 2].map(y => (
              <option key={y} value={y}>{`FY${y}`}</option>
            ))}
          </select>
          <button onClick={() => window.print()} style={{
            padding: '8px 16px', borderRadius: 8, border: '1px solid #0f4c35', background: '#0f4c35',
            color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          }}>🖨️ Print</button>
        </div>
      </div>

      {/* Overall progress + filter */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e8e8e8', padding: '14px 18px', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#0a3320' }}>Overall progress</div>
        <div style={{ flex: 1, minWidth: 240 }}><ProgressBar done={overallDone} total={TOTAL_ITEMS} /></div>
        <div style={{ display: 'flex', gap: 4, background: '#f4f6f4', padding: 4, borderRadius: 8 }} className="cacfp-noprint">
          {([['all', 'All'], ['incomplete', 'Incomplete'], ['complete', 'Complete']] as [Filter, string][]).map(([val, label]) => (
            <button key={val} onClick={() => setFilter(val)} style={{
              padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              background: filter === val ? '#0f4c35' : 'transparent',
              color: filter === val ? '#fff' : '#666', fontSize: 12, fontWeight: filter === val ? 600 : 400,
            }}>{label}</button>
          ))}
        </div>
      </div>

      {/* Sections */}
      <div id="cacfp-print">
        <div style={{ display: 'none' }} className="cacfp-printonly" />
        {SECTIONS.map(section => {
          const sectionDone = section.items.filter(it => isDone(data[it.id])).length
          const visible = section.items.filter(it => matchesFilter(data[it.id]))
          if (visible.length === 0) return null
          return (
            <div key={section.id} style={{ background: '#fff', borderRadius: 14, border: '1px solid #e8e8e8', marginBottom: 16, overflow: 'hidden' }}>
              {/* Section header */}
              <div style={{ padding: '14px 18px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', background: '#fafaf8' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#0a3320' }}>
                  Section {section.id} — {section.title}
                </div>
                <div style={{ marginLeft: 'auto', minWidth: 200 }}>
                  <ProgressBar done={sectionDone} total={section.items.length} />
                </div>
              </div>

              {/* Items */}
              {visible.map(item => {
                const st = data[item.id] ?? DEFAULT_ITEM
                const checked = st.status === 'complete'
                const na = st.status === 'na'
                return (
                  <div key={item.id} style={{
                    display: 'grid', gridTemplateColumns: '34px 1fr 130px 1fr 132px', gap: 12, alignItems: 'center',
                    padding: '11px 18px', borderBottom: '1px solid #f5f5f5',
                    background: checked ? '#f7fdf9' : na ? '#fafafa' : '#fff',
                  }}>
                    {/* checkbox */}
                    <button onClick={() => toggleCheck(item.id)} title="Toggle complete" style={{
                      width: 24, height: 24, borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
                      border: `1.5px solid ${checked ? '#0f4c35' : '#cfd6d0'}`,
                      background: checked ? '#0f4c35' : '#fff', color: '#fff', fontSize: 14, lineHeight: 1,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>{checked ? '✓' : ''}</button>

                    {/* requirement text */}
                    <div style={{ fontSize: 13, color: na ? '#999' : '#23332a', textDecoration: na ? 'line-through' : 'none' }}>
                      <span style={{ color: '#aaa', fontWeight: 600, marginRight: 6 }}>{item.id}</span>{item.text}
                    </div>

                    {/* status dropdown */}
                    <select
                      value={st.status}
                      onChange={e => update(item.id, { status: e.target.value as Status })}
                      style={{
                        ...inputStyle, cursor: 'pointer',
                        color: checked ? '#0f4c35' : na ? '#888' : '#c0392b',
                        fontWeight: 600,
                        borderColor: checked ? '#bbf7d0' : na ? '#e0e0e0' : '#f3c9c4',
                      }}
                    >
                      {STATUS_OPTS.map(o => <option key={o.val} value={o.val}>{o.label}</option>)}
                    </select>

                    {/* notes */}
                    <input
                      value={st.notes}
                      onChange={e => update(item.id, { notes: e.target.value })}
                      placeholder="Notes (optional)…"
                      style={{ ...inputStyle, width: '100%' }}
                    />

                    {/* date completed */}
                    <input
                      type="date"
                      value={st.date}
                      onChange={e => update(item.id, { date: e.target.value })}
                      style={{ ...inputStyle, width: '100%' }}
                    />
                  </div>
                )
              })}
            </div>
          )
        })}

        {/* Empty-filter notice */}
        {SECTIONS.every(s => s.items.filter(it => matchesFilter(data[it.id])).length === 0) && (
          <div style={{ background: '#fff', borderRadius: 14, border: '1px dashed #d8ddd8', padding: 40, textAlign: 'center', color: '#aaa', fontSize: 13 }}>
            No items match the “{filter}” filter.
          </div>
        )}
      </div>

      <div style={{ marginTop: 8, fontSize: 11, color: '#aab4ad' }}>
        Saved locally on this device per center &amp; fiscal year. “Complete” counts items marked Complete or N/A.
      </div>
    </div>
  )
}
