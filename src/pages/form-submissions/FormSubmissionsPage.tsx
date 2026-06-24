// ============================================================
// FormSubmissionsPage.tsx — страница просмотра заявок родителей
// Ниша: src/pages/form-submissions/, роут /submissions,
// пункт сайдбара между Inventory и CACFP Reports.
//
// Три вкладки = три таблицы Группы 1 (Data Sources):
//   Special Diet · Milk Substitution · Infant Meals
// Подписи (base64 PNG) рендерятся картинкой в детальной панели.
// Клиент создан без db.schema — поэтому везде .schema('menumaker').
// ============================================================

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

// ---------- типы ----------
type Row = Record<string, any>

type Column = {
  key: string
  label: string
  map?: Record<string, string>
}

type DetailField = [label: string, source: string | ((r: Row) => string)]

type TabConfig = {
  id: string
  label: string
  columns: Column[]
  signatureField: string
  detail: DetailField[]
}

// ---------- конфигурация вкладок ----------
const TABS: TabConfig[] = [
  {
    id: 'special_diet_forms',
    label: 'Special Diet',
    columns: [
      { key: 'child_name', label: 'Child' },
      { key: 'birth_date', label: 'Birth Date' },
      { key: 'diet_basis', label: 'Basis', map: {
        disability: 'Disability',
        no_disability_special_diet: 'Special diet (no disability)',
      }},
      { key: 'review_date', label: 'Review Date' },
      { key: 'authority_printed_name', label: 'Medical Authority' },
      { key: 'signed_date', label: 'Signed' },
    ],
    signatureField: 'authority_signature_img',
    detail: [
      ['Child/Participant Name', 'child_name'],
      ['Birth Date', 'birth_date'],
      ['Parent/Guardian Name', 'parent_name'],
      ['Email', 'email'],
      ['Home Phone', 'home_phone'],
      ['Work Phone', 'work_phone'],
      ['Cell Phone', 'cell_phone'],
      ['Address', (r) => [r.address, r.city, r.state, r.zip].filter(Boolean).join(', ')],
      ['Basis', (r) => r.diet_basis === 'disability' ? 'Disability' : 'Special diet (no disability)'],
      ['Review Date', (r) => r.review_date ? `${r.review_date}${new Date(r.review_date) < new Date() ? ' ⚠ EXPIRED' : ' ✓ Current'}` : '—'],
      ['Disability Description', 'disability_desc'],
      ['Major Life Activity Affected', 'major_life_activity'],
      ['How Diet Is Restricted', 'diet_restriction'],
      ['Special Dietary Need', 'special_need_desc'],
      ['Foods to Omit', 'foods_omitted'],
      ['Foods to Substitute', 'foods_substituted'],
      ['Medical Authority (printed)', 'authority_printed_name'],
      ['Authority Phone', 'authority_phone'],
      ['Signed Date', 'signed_date'],
    ],
  },
  {
    id: 'milk_substitutions',
    label: 'Milk Substitution',
    columns: [
      { key: 'child_name', label: 'Child' },
      { key: 'center_name', label: 'Center' },
      { key: 'parent_choice', label: 'Parent Choice', map: {
        center_provided: 'Center-provided beverage',
        parent_provided_compliant: 'Parent provides (compliant)',
        parent_provided_noncompliant: 'Parent provides (non-compliant)',
      }},
      { key: 'signed_date', label: 'Signed' },
    ],
    signatureField: 'parent_signature_img',
    detail: [
      ['Center/Provider', 'center_name'],
      ['Center Provides Non-Dairy', (r) => r.center_provides ? 'Yes' : 'No'],
      ['Substitute(s) Offered', 'center_substitutes'],
      ['Center Declines to Provide', (r) => r.center_declines ? 'Yes' : 'No'],
      ['Child Full Name', 'child_name'],
      ['Dietary Need', 'dietary_need'],
      ['Parent Choice', (r) => ({
        center_provided: 'Requests center-provided beverage',
        parent_provided_compliant: 'Will provide compliant beverage',
        parent_provided_noncompliant: 'Will provide non-compliant beverage',
      } as Record<string, string>)[r.parent_choice] ?? r.parent_choice],
      ['Signed Date', 'signed_date'],
    ],
  },
  {
    id: 'infant_meal_preferences',
    label: 'Infant Meals',
    columns: [
      { key: 'infant_name', label: 'Infant' },
      { key: 'infant_birthdate', label: 'Birthdate' },
      { key: 'formula_choice', label: 'Formula', map: {
        center_provides_formula: 'Center provides',
        parent_brings_formula: 'Parent brings formula',
        parent_brings_breast_milk: 'Expressed breast milk',
        parent_breastfeeds_onsite: 'Breastfeeds on site',
      }},
      { key: 'solid_food_choice', label: 'Solid Food', map: {
        center_provides_solids: 'Center provides',
        parent_brings_one_solid: 'Parent brings one item',
      }},
      { key: 'signed_date', label: 'Signed' },
    ],
    signatureField: 'parent_signature_img',
    detail: [
      ['Center/Provider', 'center_name'],
      ['Formula Offered by Center', 'formula_name'],
      ['Formula/Breast Milk Choice', (r) => ({
        center_provides_formula: 'Center provides formula',
        parent_brings_formula: 'Parent brings iron-fortified formula',
        parent_brings_breast_milk: 'Parent brings expressed breast milk',
        parent_breastfeeds_onsite: 'Parent breastfeeds on site',
      } as Record<string, string>)[r.formula_choice] ?? r.formula_choice],
      ['Formula Parent Will Provide', 'parent_formula_name'],
      ['Solid Food Choice', (r) => ({
        center_provides_solids: 'Center provides all solid foods',
        parent_brings_one_solid: 'Parent brings one solid food item',
      } as Record<string, string>)[r.solid_food_choice] ?? r.solid_food_choice],
      ['Infant Name', 'infant_name'],
      ['Infant Birthdate', 'infant_birthdate'],
      ['Signed Date', 'signed_date'],
    ],
  },
]

// ---------- ?type= → вкладка ----------
// Dispatch-чипы ссылаются на /submissions?type=<code>. Коды диспетчера не
// совпадают с id таблиц-вкладок, поэтому маппим известные алиасы на вкладку.
// Неизвестный/пустой type → дефолтная вкладка (первая).
const TYPE_ALIASES: Record<string, string> = {
  special_diet_statement: 'special_diet_forms',
  special_diet:           'special_diet_forms',
  milk_substitution:      'milk_substitutions',
  infant_meals:           'infant_meal_preferences',
}

function resolveTab(type: string | null): string {
  if (!type) return TABS[0].id
  if (TABS.some(t => t.id === type)) return type   // прямой id вкладки
  return TYPE_ALIASES[type] ?? TABS[0].id          // алиас или дефолт
}

// ---------- стили (палитра MenuMaker: #0f4c35 / #7ee8b0, DM Sans) ----------
const S: Record<string, React.CSSProperties> = {
  page:      { padding: '32px 36px', fontFamily: "'DM Sans', sans-serif" },
  title:     { fontSize: 24, fontWeight: 600, color: '#0f4c35', marginBottom: 4 },
  subtitle:  { color: '#888', fontSize: 14, marginBottom: 20 },
  tabs:      { display: 'flex', gap: 6, marginBottom: 16, borderBottom: '2px solid #e3e8e4',
               alignItems: 'center' },
  count:     { marginLeft: 7, fontSize: 11, background: '#e3f3e9', color: '#0f4c35',
               borderRadius: 10, padding: '1px 8px', fontWeight: 600 },
  table:     { width: '100%', borderCollapse: 'collapse', background: '#fff',
               borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,.07)' },
  th:        { textAlign: 'left', fontSize: 11, textTransform: 'uppercase',
               letterSpacing: '.5px', color: '#888', padding: '11px 16px',
               background: '#f7faf8', borderBottom: '1px solid #e3e8e4' },
  td:        { padding: '11px 16px', fontSize: 13.5, borderBottom: '1px solid #f0f4f1',
               color: '#23332a' },
  empty:     { padding: 48, textAlign: 'center', color: '#aab4ad', fontSize: 14 },
  overlay:   { position: 'fixed', inset: 0, background: 'rgba(10,51,32,.38)',
               display: 'flex', justifyContent: 'flex-end', zIndex: 200 },
  panel:     { width: 540, maxWidth: '94vw', background: '#fff', height: '100%',
               overflowY: 'auto', padding: '24px 28px',
               boxShadow: '-6px 0 22px rgba(0,0,0,.18)' },
  panelHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center',
               marginBottom: 16 },
  panelTitle:{ fontSize: 18, fontWeight: 600, color: '#0f4c35' },
  close:     { fontSize: 24, border: 'none', background: 'none', cursor: 'pointer',
               color: '#888', lineHeight: 1, padding: 4 },
  dl:        { display: 'grid', gridTemplateColumns: '180px 1fr', rowGap: 9, columnGap: 14,
               fontSize: 13.5 },
  dt:        { color: '#888' },
  dd:        { color: '#23332a', whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
  sigBox:    { marginTop: 20, padding: 14, border: '1px solid #e3e8e4', borderRadius: 10,
               background: '#fbfdfb' },
  sigLabel:  { fontSize: 11, textTransform: 'uppercase', letterSpacing: '.5px',
               color: '#888', marginBottom: 8 },
  sigImg:    { maxWidth: '100%', height: 72, objectFit: 'contain', display: 'block' },
  meta:      { marginTop: 16, fontSize: 12, color: '#aab4ad' },
  err:       { background: '#fdf0ef', color: '#c0392b', padding: '10px 14px',
               borderRadius: 10, fontSize: 13, marginBottom: 14 },
}

const tabBtn = (active: boolean): React.CSSProperties => ({
  padding: '9px 18px', cursor: 'pointer', fontWeight: 600, fontSize: 13.5,
  color: active ? '#0f4c35' : '#888',
  borderBottom: active ? '3px solid #0f4c35' : '3px solid transparent',
  marginBottom: -2, background: 'none', border: 'none',
  borderBottomStyle: 'solid', fontFamily: 'inherit',
})

// ---------- утилиты ----------
const fmtDate = (d: unknown): string => {
  if (!d) return '—'
  const [y, m, day] = String(d).slice(0, 10).split('-')
  return m && day ? `${Number(m)}/${Number(day)}/${y}` : String(d)
}
const fmtTs = (ts: unknown): string =>
  ts ? new Date(String(ts)).toLocaleString('en-US') : '—'

const cellValue = (row: Row, col: Column): string => {
  const v = row[col.key]
  if (v == null || v === '') return '—'
  if (col.map) return col.map[v] ?? String(v)
  if (/date|birthdate/.test(col.key)) return fmtDate(v)
  return String(v)
}

// ---------- компонент ----------
export default function FormSubmissionsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [tabId, setTabId] = useState<string>(() => resolveTab(searchParams.get('type')))
  const [rows, setRows] = useState<Row[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<Row | null>(null)

  const tab = TABS.find(t => t.id === tabId)!

  // синхронизация при внешней навигации (например, клик по чипу из Dispatch,
  // когда страница уже открыта) — ?type= меняется → выбираем вкладку
  useEffect(() => {
    setTabId(resolveTab(searchParams.get('type')))
  }, [searchParams])

  // выбор вкладки вручную: обновляем и состояние, и ?type= в URL
  function selectTab(id: string) {
    setTabId(id)
    const next = new URLSearchParams(searchParams)
    next.set('type', id)
    setSearchParams(next, { replace: true })
  }

  // загрузка записей активной вкладки + счётчики всех вкладок
  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data, error: e } = await supabase
        .schema('menumaker')
        .from(tabId)
        .select('*')
        .order('created_at', { ascending: false })
      if (e) throw e
      setRows(data ?? [])

      // счётчики вкладок (head-запросы, дёшево)
      const entries = await Promise.all(TABS.map(async (t) => {
        const { count } = await supabase
          .schema('menumaker')
          .from(t.id)
          .select('*', { count: 'exact', head: true })
        return [t.id, count ?? 0] as const
      }))
      setCounts(Object.fromEntries(entries))
    } catch (e: any) {
      setError('Failed to load submissions — ' + (e?.message ?? String(e)))
    } finally {
      setLoading(false)
    }
  }, [tabId])

  useEffect(() => { load() }, [load])

  // удаление записи (с подтверждением)
  async function remove(row: Row) {
    if (!window.confirm('Delete this submission permanently?')) return
    const { error: e } = await supabase
      .schema('menumaker')
      .from(tabId)
      .delete()
      .eq('id', row.id)
    if (e) { setError('Delete failed — ' + e.message); return }
    setSelected(null)
    load()
  }

  return (
    <div style={S.page}>
      <div style={S.title}>Form Submissions</div>
      <div style={S.subtitle}>Parent forms submitted online — Group 1 · Data Sources</div>

      {error && <div style={S.err}>{error}</div>}

      <div style={S.tabs}>
        {TABS.map(t => (
          <button key={t.id} style={tabBtn(t.id === tabId)} onClick={() => selectTab(t.id)}>
            {t.label}
            <span style={S.count}>{counts[t.id] ?? '…'}</span>
          </button>
        ))}
        <button
          onClick={load}
          style={{
            marginLeft: 'auto', padding: '6px 14px', border: '1px solid #d6ddd8',
            borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 13,
            color: '#0f4c35', fontFamily: 'inherit',
          }}
        >
          ↻ Refresh
        </button>
      </div>

      <table style={S.table}>
        <thead>
          <tr>
            {tab.columns.map(c => <th key={c.key} style={S.th}>{c.label}</th>)}
            <th style={S.th}>Received</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={tab.columns.length + 1} style={S.empty}>Loading…</td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={tab.columns.length + 1} style={S.empty}>No submissions yet</td></tr>
          ) : rows.map(row => (
            <tr
              key={row.id}
              style={{ cursor: 'pointer' }}
              onClick={() => setSelected(row)}
              onMouseEnter={e => (e.currentTarget.style.background = '#f7faf8')}
              onMouseLeave={e => (e.currentTarget.style.background = '')}
            >
              {tab.columns.map(c => (
                <td key={c.key} style={S.td}>
                  {cellValue(row, c)}
                  {c.key === 'review_date' && row.review_date && new Date(row.review_date) < new Date() && (
                    <span style={{ marginLeft: 6, fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#fff0f0', color: '#c0392b', fontWeight: 600 }}>⚠ Expired</span>
                  )}
                  {c.key === 'review_date' && row.review_date && new Date(row.review_date) >= new Date() && (
                    <span style={{ marginLeft: 6, fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#f0fff4', color: '#0f4c35', fontWeight: 600 }}>✓</span>
                  )}
                </td>
              ))}
              <td style={S.td}>{fmtTs(row.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ---------- детальная панель ---------- */}
      {selected && (
        <div style={S.overlay} onClick={() => setSelected(null)}>
          <div style={S.panel} onClick={e => e.stopPropagation()}>
            <div style={S.panelHead}>
              <div style={S.panelTitle}>{tab.label} — Details</div>
              <button style={S.close} onClick={() => setSelected(null)}>×</button>
            </div>

            <div style={S.dl}>
              {tab.detail.map(([label, source]) => {
                const raw = typeof source === 'function' ? source(selected) : selected[source]
                const isDate = typeof source === 'string' && /date|birthdate/i.test(source)
                const val = (raw == null || raw === '') ? '—'
                  : isDate ? fmtDate(raw) : String(raw)
                return (
                  <FragmentRow key={label} label={label} value={val} />
                )
              })}
            </div>

            {selected[tab.signatureField] && (
              <div style={S.sigBox}>
                <div style={S.sigLabel}>Signature</div>
                <img src={selected[tab.signatureField]} alt="signature" style={S.sigImg} />
              </div>
            )}

            <div style={S.meta}>
              Received: {fmtTs(selected.created_at)} · ID: {selected.id}
            </div>

            <button
              onClick={() => remove(selected)}
              style={{
                marginTop: 22, padding: '8px 18px', border: '1px solid #c0392b',
                color: '#c0392b', background: '#fff', borderRadius: 8, cursor: 'pointer',
                fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
              }}
            >
              Delete submission
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// пара ячеек "метка — значение" для грида детальной панели
function FragmentRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <div style={S.dt}>{label}</div>
      <div style={S.dd}>{value}</div>
    </>
  )
}
