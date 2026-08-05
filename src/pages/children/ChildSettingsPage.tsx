// src/pages/children/ChildSettingsPage.tsx
// Full child record — 7 tabs with completeness badges
// Profile | Family | Enrollment | Health | CACFP | SafePass | Billing

import { useState, useEffect, useRef, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import {
  completeness as regCompleteness, tabCounts as regTabCounts,
  FIELDS, fieldsForTab, isFieldActive, fieldValue,
  type TabKey, type RecordCtx, type FieldDef,
} from '@/lib/childFieldRegistry'
import { displayChildName } from '@/lib/childName'
import Avatar from '@/components/Avatar'
import AvatarUpload from '@/components/AvatarUpload'
import ScheduleEditor from '@/components/ScheduleEditor'
import { useAuth } from '@/hooks/useAuth'
import { parseIeaFiscalYear, frpExpiryDefault, recordDetermination } from '@/lib/enrollmentApprove'
import { IEA_DOC_TYPE, PAPER_DOC_TYPE_BY_FIELD, expiryOverrideNote } from '@/lib/ieaOnFile'
import { ATTACH_SCANS_KEY, readBoolSetting } from '@/lib/appSettings'
import { recordRoomTransfer, transferRefusal } from '@/lib/roomTransfer'
import {
  changedFields, provenanceProblem, writeChildField, loadFieldHistory, loadFieldProvenance, toText,
  loadFieldLocks, lockRefusal,
  type Provenance, type WriteResult, type FieldEvent, type FieldProvenance, type FieldLock,
} from '@/lib/childFieldWrite'
import ChildExportPanel from './ChildExportPanel'
import ChildDocumentsTab from './ChildDocumentsTab'
import { fmtDateOnly } from '@/lib/dateOnly'
import { similarChildren, candidateLine, type DedupCandidate } from '@/lib/childDedup'
import { milkByAgeLine } from '@/lib/milkByAge'

// registry helpers don't export isEmpty — mirror it locally for the filled-indicator.
const isEmptyVal = (v: any) => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0)
const todayStr = new Date().toISOString().slice(0, 10)

// tab order → registry TabKeys
const TAB_KEYS: TabKey[] = ['profile','family','enrollment','health','cacfp','safepass','billing','documents']

// ─── Types ────────────────────────────────────────────────────────────────────

interface Child {
  id: string; org_id: string; center_id: string; classroom_id: string | null
  child_id: string | null   // FK → menumaker.child.id (bridge to child_guardian)
  first_name: string | null; last_name: string | null; child_name: string | null
  birthday: string | null; date_in: string | null; date_out: string | null
  frp: string | null; frp_expires: string | null; milk_kind: string | null
  substitute_milk: string | null   // чем заменено по справке; пусто = расчёт по возрасту
  allergies: string | null; is_active: boolean
  child_address: string | null; has_health_condition: boolean | null
  development_notes: string | null; accommodations: string | null
  specialized_services: string | null; emergency_transport_auth: boolean | null
  enrollment_reviewed_at: string | null; age_group_food: string | null
  photo_url: string | null
}

interface Guardian {
  id: string; first_name: string | null; last_name: string | null
  email: string | null; mobile_phone: string | null; phone_1: string | null
  phone_2: string | null; address: string | null
  role?: string; relationship?: string; can_pickup?: boolean
  is_emergency_contact?: boolean; emergency_contact_order?: number; ordinal?: number
}

// Legacy role encodes pickup right (can_pickup default-true is unreliable in v1).
const canPickupFromRole = (role?: string) => role === 'pickup' || role === 'parent'
// relationship stored in mixed case (father/Father, grandma/Grandmother) — tidy on display.
const capWords = (s?: string | null) =>
  (s ?? '').split(/\s+/).filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')

interface ChildMedical {
  id?: string; allergies: string | null; medications: string | null
  doctor_name: string | null; doctor_phone: string | null
  health_condition_name: string | null; condition_symptoms: string | null
  foods_to_avoid: string | null; activities_to_avoid: string | null
  care_instructions: string | null; emergency_action: string | null
  evacuation_notes: string | null; medication_details: any
  parent_signed_at: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const inp: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 8,
  border: '1.5px solid #c0d8c0', fontSize: 14, fontFamily: 'inherit',
  background: '#fff', boxSizing: 'border-box' as const, outline: 'none',
  color: '#1a2e1a'
}
const lbl: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: '#6b7280',
  textTransform: 'uppercase' as const, letterSpacing: '0.06em',
  display: 'block', marginBottom: 4
}
const section = (title: string) => (
  <div style={{ fontSize: 13, fontWeight: 700, color: '#0f4c35', marginBottom: 12,
    paddingBottom: 6, borderBottom: '1.5px solid #e8f0e8', marginTop: 4 }}>{title}</div>
)
// ─── Badge counter ────────────────────────────────────────────────────────────

function Badge({ empty, overdue }: { empty: number; overdue: number }) {
  if (!empty && !overdue) return null
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, marginLeft: 6 }}>
      {empty > 0 && <span style={{ background: '#ef4444', color: '#fff', borderRadius: 10,
        fontSize: 10, fontWeight: 700, padding: '1px 5px', lineHeight: 1.4 }}>{empty}</span>}
      {overdue > 0 && <span style={{ background: '#1a2e1a', color: '#fff', borderRadius: 10,
        fontSize: 10, fontWeight: 700, padding: '1px 5px', lineHeight: 1.4 }}>{overdue}</span>}
    </span>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ChildSettingsPage({
  childId, onClose, classrooms, initialTab = 0, focusField, createIn, onCreated, onUseExisting,
}: {
  childId?: string
  onClose: () => void
  classrooms: { id: string; name: string }[]
  initialTab?: number
  focusField?: string   // registry field key to scroll to + highlight on open (e.g. 'date_out')
  /** РЕЖИМ СОЗДАНИЯ: строки ростера ещё нет, поля копятся в черновике.
   *  Форма ввода — ЭТА ЖЕ карточка: второе окно разошлось бы с ней на первой правке. */
  createIn?: { centerId: string; orgId: string; centerName?: string }
  onCreated?: (rosterId: string) => void
  /** «Это он» из плашки двойника — уводит в карточку существующего, ничего не пишет. */
  onUseExisting?: (rosterId: string) => void
}) {
  const isCreate = !!createIn && !childId
  const [tab, setTab] = useState(initialTab)
  const [highlightKey, setHighlightKey] = useState<string | null>(null)
  const [child, setChild] = useState<Child | null>(null)
  const [guardians, setGuardians] = useState<Guardian[]>([])
  const [medical, setMedical] = useState<ChildMedical | null>(null)
  const [view, setView] = useState<Record<string, any> | null>(null)   // v_child_age_profile (read-only)
  const [viewError, setViewError] = useState<string | null>(null)      // почему профиль не пришёл
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [showExport, setShowExport] = useState(false)
  const [confirmDeact, setConfirmDeact] = useState(false)   // deactivate confirm overlay
  const [deactReason, setDeactReason] = useState('')
  const [deactBusy, setDeactBusy] = useState(false)
  const [deactDocDate, setDeactDocDate] = useState('')   // дата НА документе о выбытии
  const [deactError, setDeactError] = useState<string | null>(null)
  const { user } = useAuth()
  // Layer 2 — F/R/P late corrections: capture the eligibility as loaded so a
  // change on save is recorded as a determination (income_eligibility + log),
  // and surface the current-cycle determination signature on the CACFP tab.
  const [orig, setOrig] = useState<{ frp: string | null; expires: string | null }>({ frp: null, expires: null })

  // ─── Этап Б: провенанс ───────────────────────────────────────────────────
  // baseline = карточка КАК ЗАГРУЖЕНА. Пишется только то, что от неё отличается:
  // поле, которого никто не касался, — не изменение, и восстанавливать его как
  // «только что решённое» нельзя.
  const [baseline, setBaseline] = useState<{ roster: Record<string, any>; medical: Record<string, any> }>({ roster: {}, medical: {} })
  // УМОЛЧАНИЕ «СО СЛОВ» — по асимметрии цен, а не по удобству (владелец, 29.07).
  // Умолчание не может быть верным для обоих путей; какое ни поставь, один
  // будет помечен неверно молча. Но ошибки разной цены:
  //   «со слов» + документ на руках → запись ЗАНИЖАЕТ основание, документная
  //     дата потеряна. ПОПРАВИМО: внесённое позже из документа перекрывает —
  //     замер 29.07 подтвердил, что перекрывает, и по ДОКУМЕНТНОЙ дате;
  //   «документ» + документа нет → путь БЛОКИРУЕТСЯ. Это стоило владельцу дня:
  //     аллергии не вносились вовсе.
  // Первая теряет ТОЧНОСТЬ и чинится, вторая теряет САМУ ЗАПИСЬ.
  // 🔒-полей это не касается: они отказывают «со слов» своим текстом, видимо,
  // и директор переключает источник — потери записи здесь нет.
  const [prov, setProv] = useState<Provenance>({ source: 'verbal', documentDate: '', formKey: 'dcy_01234', note: '' })
  // «Бумага в деле» — подтверждение человека, а не догадка программы: только
  // он знает, лежит ли лист в сейфе. По умолчанию снято.
  const [paperInSafe, setPaperInSafe] = useState(false)
  // Просит ли организация скан. Только подсказка — см. lib/appSettings.ts.
  const [askForScans, setAskForScans] = useState(false)
  useEffect(() => {
    // org берётся у самого ребёнка: карточка открыта по ссылке и знает свою
    // организацию точнее, чем контекст выбранного центра.
    if (!child?.org_id) return
    let off = false
    readBoolSetting(ATTACH_SCANS_KEY, child.org_id, false).then(v => { if (!off) setAskForScans(v) })
    return () => { off = true }
  }, [child?.org_id])
  const [writeResults, setWriteResults] = useState<WriteResult[] | null>(null)
  // Баннер результата стоит НАВЕРХУ вкладки, а кнопка «Save» — в подвале. На
  // Health полей полтора десятка, поэтому ответ экрана оказывался ЗА ПРЕДЕЛАМИ
  // ЭКРАНА: с места директора это неотличимо от «ничего не произошло». Замер
  // 29.07 — это и был механизм «тихого» отказа, отдельный от отсутствия ключа.
  const resultsRef = useRef<HTMLDivElement | null>(null)
  // ТРИ ИСХОДА SAVE РАЗЛИЧАЮТСЯ СЛОВАМИ, И СТРОКА СТОИТ У КНОПКИ (владелец, 31.07).
  // Баннер наверху вкладки остаётся подробным, но человек смотрит туда, куда нажал:
  // «выглядит так же, ошибки нет» — это и есть тихий отказ, даже когда ответ где-то
  // отрисован. Исходы: применено · записано в историю, карточка не изменена · отказ.
  const saveOutcome = useMemo(() => {
    if (!writeResults || writeResults.length === 0) return null
    const err = writeResults.find(r => r.error)
    if (err) return { kind: 'error' as const, icon: '⚠', text: err.error! }
    const applied = writeResults.filter(r => r.applied)
    const held = writeResults.filter(r => !r.applied)
    if (applied.length && !held.length)
      return { kind: 'applied' as const, icon: '✓', text: `Saved: ${applied.map(r => r.fieldKey).join(', ')}` }
    if (applied.length && held.length)
      return { kind: 'held' as const, icon: '◑',
               text: `Saved ${applied.length}; ${held.length} not applied — ${held[0].reason ?? 'see the banner above'}` }
    return { kind: 'held' as const, icon: '⏸',
             text: held[0].fieldKey
               ? `Nothing changed on the card — ${held[0].fieldKey}: ${held[0].reason ?? 'not applied'}`
               : `Nothing was written — ${held[0].reason ?? 'no field differs from what was loaded'}` }
  }, [writeResults])
  const provRef = useRef<HTMLDivElement | null>(null)
  const [fieldProv, setFieldProv] = useState<Record<string, FieldProvenance>>({})
  const [history, setHistory] = useState<FieldEvent[]>([])
  const [showHistory, setShowHistory] = useState(false)
  // Этап В: уровни замка приходят ИЗ БАЗЫ. Экран их только показывает — решает
  // save-путь, поэтому гашение поля здесь есть вторая петля, а не правило.
  const [fieldLocks, setFieldLocks] = useState<Record<string, FieldLock>>({})
  const [fiscalYear, setFiscalYear] = useState<string | null>(null)
  // Фоновый дедуп — только в режиме создания: подсказка на вводе имени, та же,
  // что была в коротком окне. Проверка, которую надо запускать, не запускается.
  const [dedupPool, setDedupPool] = useState<DedupCandidate[]>([])
  const [dedupOff, setDedupOff] = useState(false)
  const [detSig, setDetSig] = useState<{ eligibility: string | null; by: string | null; at: string | null; source: string | null } | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const r = await fetch('/enroll-registry.json?t=' + Date.now(), { cache: 'no-store' })
        const j = await r.json(); const iea = j?.forms?.iea
        if (!cancelled) setFiscalYear(parseIeaFiscalYear(iea?.versions?.[iea?.current] ?? iea?.fallbackUrl))
      } catch { if (!cancelled) setFiscalYear(null) }
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => { loadAll() }, [childId])

  useEffect(() => {
    if (!isCreate || !createIn) return
    let cancelled = false
    ;(async () => {
      const { data, error } = await supabase.schema('menumaker').from('roster')
        .select('id, child_name, first_name, last_name, birthday, classroom_id, is_active')
        .eq('center_id', createIn.centerId).limit(1000)
      // Отказ молчит НАРОЧНО: дедуп — подсказка, а не замок; сорванная подсказка
      // не должна мешать заводить ребёнка. Но и «двойников нет» она не скажет.
      if (cancelled || error || !data) return
      const roomName = new Map(classrooms.map(c => [c.id, c.name]))
      setDedupPool(data.map((r: any) => ({
        rosterId: r.id, childName: r.child_name ?? `${r.last_name ?? ''} ${r.first_name ?? ''}`.trim(),
        firstName: r.first_name, lastName: r.last_name, birthday: r.birthday,
        room: roomName.get(r.classroom_id) ?? null, isActive: r.is_active !== false,
      })))
    })()
    return () => { cancelled = true }
  }, [isCreate, createIn?.centerId, classrooms])

  const dedupHits = useMemo(
    () => (!isCreate || dedupOff ? [] : similarChildren(dedupPool, {
      first: child?.first_name ?? '', last: child?.last_name ?? '', birthday: child?.birthday ?? null,
    })),
    [isCreate, dedupOff, dedupPool, child?.first_name, child?.last_name, child?.birthday],
  )

  // Scroll to + highlight a specific field when opened with focusField
  // (e.g. the Deactivate shortcut jumps to END DATE on the Profile tab).
  useEffect(() => {
    if (!focusField || !child) return
    const t = setTimeout(() => {
      document.getElementById(`field-${focusField}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setHighlightKey(focusField)
      setTimeout(() => setHighlightKey(k => (k === focusField ? null : k)), 2600)
    }, 120)
    return () => clearTimeout(t)
  }, [focusField, child])

  async function loadAll() {
    // РЕЖИМ СОЗДАНИЯ: грузить нечего. Черновик — та же форма Child, только пустая;
    // все вкладки и поля рисуются как обычно, красные бейджи показывают, чего нет.
    if (isCreate) {
      setChild({
        id: '', org_id: createIn!.orgId, center_id: createIn!.centerId, classroom_id: null,
        child_id: null, first_name: null, last_name: null, child_name: null,
        birthday: null, date_in: todayStr, date_out: null,
        // Категория при заводе ВСЕГДА Paid: F/R ставится только через определение
        // с документной датой (recordDetermination), как и в карточке.
        frp: 'P', frp_expires: null, milk_kind: null,
        allergies: null, is_active: true, child_address: null, has_health_condition: null,
        development_notes: null, accommodations: null, specialized_services: null,
        emergency_transport_auth: null, enrollment_reviewed_at: null, age_group_food: null,
        photo_url: null,
      } as Child)
      setMedical({} as ChildMedical)
      setGuardians([])
      setBaseline({ roster: {}, medical: {} })
      return
    }
    // roster.id (childId) ≠ child.id. Guardians hang off child_guardian.child_id
    // which FKs to menumaker.child.id — reached via roster.child_id. Load the
    // roster row first, then fetch guardians by its child_id.
    const { data: c } = await supabase.schema('menumaker').from('roster').select('*').eq('id', childId).single()
    if (c) { setChild(c as Child); setOrig({ frp: (c as any).frp ?? null, expires: (c as any).frp_expires ?? null }) }
    const cid = (c as any)?.child_id as string | null

    let guardianRows: any[] = []
    if (cid) {
      const { data: g } = await supabase.schema('menumaker').from('child_guardian')
        .select('*, guardian:guardian_id(*)')
        .eq('child_id', cid)
        .order('emergency_contact_order', { ascending: true, nullsFirst: false })
        .order('ordinal', { ascending: true })
      guardianRows = g ?? []
    }
    setGuardians(guardianRows.map((row: any) => ({
      ...row.guardian, role: row.role, relationship: row.relationship, can_pickup: row.can_pickup,
      is_emergency_contact: row.is_emergency_contact, emergency_contact_order: row.emergency_contact_order, ordinal: row.ordinal,
    })))

    // ЛОВУШКА КЛЮЧА (закрыта 2026-07-28). child_medical.child_id ссылается на
    // menumaker.child(id), а НЕ на roster.id — сюда годами передавался roster.id,
    // и запрос находил 0 строк ВСЕГДА (замерено: 0 из 70), а вставку отвергал
    // внешний ключ. Директор не видел ни данных, ни ошибки. Правильный ключ —
    // roster.child_id; у строк без него медкарты быть не может в принципе.
    const medKey = (c as any)?.child_id ?? null
    const { data: m } = medKey
      ? await supabase.schema('menumaker').from('child_medical').select('*').eq('child_id', medKey).maybeSingle()
      : { data: null }
    setMedical(m as ChildMedical ?? { allergies: null, medications: null, doctor_name: null, doctor_phone: null, health_condition_name: null, condition_symptoms: null, foods_to_avoid: null, activities_to_avoid: null, care_instructions: null, emergency_action: null, evacuation_notes: null, medication_details: null, parent_signed_at: null })

    // Снимок «как загружено» — от него считается, что именно правил человек.
    setBaseline({ roster: { ...(c ?? {}) }, medical: { ...((m as any) ?? {}) } })
    try { setFieldProv(await loadFieldProvenance(childId!)) } catch { setFieldProv({}) }
    try { setFieldLocks(await loadFieldLocks()) } catch { setFieldLocks({}) }

    // read-only age/milk profile for CACFP tab + registry export
    // 🔴 31.07: ошибка тут ГЛОТАЛАСЬ, и «Age group / Milk (oz) = —» выглядело как
    // «у ребёнка нет возраста», хотя причина другая: у представления
    // v_child_age_profile НЕТ ГРАНТА роли authenticated (замер 31.07 — права
    // только у postgres и service_role). Отказ прав неотличим от пустоты, пока
    // его не связали. Теперь он виден словами.
    const { data: vw, error: vwErr } = await supabase.schema('menumaker')
      .from('v_child_age_profile').select('*').eq('id', childId).maybeSingle()
    setView(vw ?? null)
    setViewError(vwErr ? vwErr.message : null)
  }

  // Load the current-cycle determination signature for the CACFP tab.
  useEffect(() => {
    if (!childId || !fiscalYear) { setDetSig(null); return }
    let cancelled = false
    ;(async () => {
      const { data } = await supabase.schema('menumaker').from('income_eligibility')
        .select('eligibility,determined_by_name,determined_at,eligibility_source')
        .eq('roster_id', childId).eq('fiscal_year', fiscalYear)
        .order('updated_at', { ascending: false }).limit(1).maybeSingle()
      if (!cancelled) setDetSig(data ? {
        eligibility: (data as any).eligibility, by: (data as any).determined_by_name,
        at: (data as any).determined_at ? String((data as any).determined_at).slice(0, 10) : null,
        source: (data as any).eligibility_source,
      } : null)
    })()
    return () => { cancelled = true }
  }, [childId, fiscalYear])

  // doSaveRoster / doSaveMedical УДАЛЕНЫ 2026-07-28 (этап Б). Они писали в карточку
  // мимо журнала и мимо documentной даты, а doSaveMedical к тому же промахивался
  // мимо child_medical по неверному ключу и падал молча. Два пути записи в одну
  // карточку — это и есть способ, которым правило стирается: остаётся ОДИН,
  // saveCurrent → record_child_field_change.

  // ⚠ ЗНАЕМ И НЕ ЗАКРЫЛИ (этап Б, для этапа В): Deactivate / Reactivate — ещё
  // два ГОЛЫХ update(), и они пишут `date_out`, а это 🔒-поле замка, ведущее
  // границу возмещения в клейме. Пока они идут мимо журнала, замок этапа В
  // обходится через кнопку «Deactivate». Правильный ход — провести их тем же
  // защищённым путём (или дать журналу событие жизненного цикла), но это
  // отдельная работа со своим read-back, а не довесок к карточным полям.
  //
  // Deactivate: stop the child being countable (meal count / reports filter
  // is_active=true). Also stamps date_out (if unset) so date_out-honoring queries
  // agree, plus an audit trail. Reactivate reverses it and clears date_out so the
  // active-roster filter shows the child again.
  // Этап В: деактивация идёт ЧЕРЕЗ ТОТ ЖЕ защищённый путь. Она пишет date_out —
  // 🔒-поле, ведущее границу возмещения, — и раньше делала это голым update()
  // мимо журнала и мимо замка. Замок с обходной калиткой не сдаётся.
  async function doDeactivate() {
    if (!child) return
    setDeactBusy(true); setDeactError(null)
    const { error } = await (supabase.schema('menumaker').rpc as any)('set_child_active_state', {
      p_roster_id: childId, p_active: false,
      p_last_day: child.date_out || deactDocDate || todayStr,
      p_reason: deactReason.trim() || null,
      p_source: 'free_document',
      p_document_date: deactDocDate || null,
      p_entered_by_name: (user?.user_metadata?.full_name as string) || (user?.email?.split('@')[0]) || 'Staff',
    })
    if (error) { setDeactError(error.message); setDeactBusy(false); return }
    setDeactBusy(false); setConfirmDeact(false); setDeactReason(''); setDeactDocDate('')
    loadAll()
  }

  async function doReactivate() {
    if (!child) return
    setDeactBusy(true); setDeactError(null)
    const { error } = await (supabase.schema('menumaker').rpc as any)('set_child_active_state', {
      p_roster_id: childId, p_active: true,
      p_reason: 'returned',
      p_source: 'free_document',
      p_document_date: todayStr,   // возвращение фиксируется днём записи о возврате
      p_entered_by_name: (user?.user_metadata?.full_name as string) || (user?.email?.split('@')[0]) || 'Staff',
    })
    if (error) { setDeactError(error.message); setDeactBusy(false); return }
    setDeactBusy(false); loadAll()
  }


  // ─── Этап Б: сохранение идёт ПОЛЕ ЗА ПОЛЕМ через защищённый путь ─────────
  // Раньше здесь стояли два «сохрани всю таблицу» вызова: они не оставляли
  // следа, не знали о documentной дате и молча промахивались мимо child_medical.
  // Теперь каждое ИЗМЕНЁННОЕ поле уходит отдельным событием с провенансом,
  // и база сама решает, применять ли значение — по дате ДОКУМЕНТА, не ввода.
  /** Ответ экрана обязан попасть в поле зрения — иначе он равен молчанию. */
  function showResults() {
    setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0)
  }

  // ─── СОЗДАНИЕ РЕБЁНКА ИЗ ЭТОЙ ЖЕ КАРТОЧКИ ─────────────────────────────────
  // Обязательный минимум — имя · фамилия · ДР · комната · дата поступления.
  // МОЛОКА ЗДЕСЬ НЕТ (канон 05.08): оно выводится из даты рождения, и требовать
  // его отдельно значило бы просить человека повторить то, что система знает.
  const CREATE_MIN: { key: string; label: string; get: () => any }[] = [
    { key: 'first_name',   label: 'First name',  get: () => child?.first_name },
    { key: 'last_name',    label: 'Last name',   get: () => child?.last_name },
    { key: 'birthday',     label: 'Birthday',    get: () => child?.birthday },
    { key: 'classroom_id', label: 'Classroom',   get: () => child?.classroom_id },
    { key: 'date_in',      label: 'Start date',  get: () => child?.date_in },
  ]

  async function createChild() {
    if (!child || !createIn) return
    const missing = CREATE_MIN.filter(f => isEmptyVal(f.get()))
    if (missing.length) {
      setWriteResults([{ fieldKey: '', applied: false, reason: null, oldValue: null, newValue: null, isVerbal: false,
        error: `NOTHING WAS SAVED. A child cannot sit in the meal grid without these: ${missing.map(m => m.label).join(' · ')}. ` +
               'Everything else on the other tabs can be filled in later.' }])
      showResults()
      // Недостающее живёт на вкладке Profile (и молоко — на CACFP): уводим туда,
      // где оно вводится, а не оставляем человека искать самому.
      setTab(0)
      return
    }
    setSaving(true); setWriteResults(null)
    try {
      // Ключ ребёнка — той же функцией, что и на всех остальных путях: вернувшийся
      // переиспользует свою личность, новый получает её. По одному имени не склеиваем.
      const { data: kid, error: kidErr } = await (supabase.schema('menumaker').rpc as any)(
        'resolve_or_create_child',
        { p_org: createIn.orgId, p_first: child.first_name, p_last: child.last_name, p_birthdate: child.birthday || null },
      )
      if (kidErr) throw kidErr
      const key = (kid as any)?.child_id ?? null
      if (!key) {
        throw new Error('This child could not be given an identity key, so nothing was written. ' +
                        'A roster row without a key can hold neither guardians nor a medical record.')
      }

      // В строку идут ВСЕ заполненные поля ростера из реестра — человек мог
      // заполнить хоть все вкладки сразу, и терять это было бы обманом.
      const rosterCols: Record<string, any> = {}
      for (const f of FIELDS.filter(f => f.table === 'roster' && !f.readOnly)) {
        const v = (child as any)[f.column]
        if (!isEmptyVal(v)) rosterCols[f.column] = v
      }
      const { data: row, error: insErr } = await supabase.schema('menumaker').from('roster').insert({
        ...rosterCols,
        org_id: createIn.orgId, center_id: createIn.centerId, child_id: key,
        child_name: `${child.first_name} ${child.last_name}`,   // First Last (канон 23.07)
        frp: 'P',                                              // F/R — только определением с датой
        is_active: true,
      }).select('id').single()
      if (insErr) throw insErr
      const newId = (row as any)?.id as string

      // Медицинские поля, если их успели заполнить, ложатся своей строкой.
      const medCols: Record<string, any> = {}
      for (const f of FIELDS.filter(f => f.table === 'child_medical' && !f.readOnly)) {
        const v = (medical as any)?.[f.column]
        if (!isEmptyVal(v)) medCols[f.column] = v
      }
      if (Object.keys(medCols).length && key) {
        const { error: medErr } = await supabase.schema('menumaker').from('child_medical')
          .insert({ ...medCols, child_id: key })
        // Ребёнок уже заведён — про медкарту говорим отдельно, но не притворяемся,
        // что записи не было вовсе.
        if (medErr) {
          setWriteResults([{ fieldKey: '', applied: true, reason: null, oldValue: null, newValue: null, isVerbal: false,
            error: `The child was added, but the health fields were not saved: ${medErr.message}. Open the Health tab and save them again.` }])
          showResults()
        }
      }
      setSaving(false)
      onCreated?.(newId)
    } catch (e: any) {
      setSaving(false)
      setWriteResults([{ fieldKey: '', applied: false, reason: null, oldValue: null, newValue: null, isVerbal: false,
        error: `NOTHING WAS SAVED — ${e?.message ?? String(e)}` }])
      showResults()
    }
  }

  async function saveCurrent() {
    try { await saveCurrentInner() }
    catch (e: any) {
      // Ни один путь отсюда не уходит молча: исключение — тоже ответ экрана.
      setSaving(false)
      setWriteResults([{ fieldKey: '', applied: false, reason: null, oldValue: null, newValue: null, isVerbal: false,
        error: `NOTHING WAS SAVED — the save failed before it reached the record: ${e?.message ?? String(e)}` }])
      showResults()
    }
  }

  async function saveCurrentInner() {
    const defs = fieldsForTab(TAB_KEYS[tab]).filter(f => !f.readOnly)
    if (defs.length === 0) {
      setWriteResults([{ fieldKey: '', applied: false, reason: 'this tab has no editable fields',
                         oldValue: null, newValue: null, isVerbal: false }])
      showResults(); return
    }

    // ПЕРЕВОД БЕЗ ДАТЫ ДЕЙСТВИЯ отбивается ДО записи: без неё нельзя сказать,
    // с какого дня ребёнок в новой комнате, а от этого дня читаются недельные
    // счёты и ратио. Дата берётся из того же поля, что и документная — здесь
    // она означает Transfer Date.
    const roomChanged = toText(child?.classroom_id) !== toText(baseline.roster?.classroom_id)
    const transferProblem = roomChanged
      ? transferRefusal(toText(child?.classroom_id), prov.documentDate ?? null)
      : null
    if (transferProblem) {
      setWriteResults([{ fieldKey: 'classroom_id', applied: false, reason: null, oldValue: null,
                         newValue: null, isVerbal: false, error: transferProblem }])
      showResults(); return
    }

    const problem = provenanceProblem(prov)
    if (problem) {
      setWriteResults([{ fieldKey: '', applied: false, reason: null, oldValue: null, newValue: null, isVerbal: false, error: problem }])
      showResults(); return
    }

    // F/R/P нормализуется ДО диффа (одна заглавная буква), и просроченная дата
    // для F/R подставляется по правилу CACFP — ровно как это делал прежний путь.
    const frpNorm = (child?.frp ?? '').trim().toUpperCase().slice(0, 1) || null
    // 🔴 БАЗА СРОКА — ДАТА ДОКУМЕНТА, А НЕ СЕГОДНЯ (правка 01.08).
    // Канон 22.07: 12 месяцев от подписи домохозяйства, до конца месяца. Дверь IEA
    // Review это исполняет (`frpExpiryDefault(formAsOf(submission) ?? today, …)`), а
    // здесь стояло `todayStr` — то есть срок отсчитывался от дня ВВОДА.
    // Пока бумагу вносят в том же месяце, разницы в деньгах нет: клейм сравнивает
    // `frp_expires >= m_start`, и любой день внутри месяца даёт месяц целиком.
    // Но бумагу, подписанную в ИЮНЕ и внесённую в АВГУСТЕ, это растягивало на два
    // лишних месяца — переклайм в тех месяцах, и ровно тот, что аудит уже находил.
    // `prov.documentDate` — то самое поле «дата документа», которое директор здесь
    // и заполняет; для устного источника его нет, и тогда честно остаётся день ввода.
    const expiresNorm = (frpNorm === 'F' || frpNorm === 'R')
      ? (child?.frp_expires || frpExpiryDefault(prov.documentDate || todayStr, null))
      : child?.frp_expires ?? null

    const current: Record<string, any> = {
      ...(child ?? {}), ...(medical ?? {}),
      frp: frpNorm, frp_expires: expiresNorm,
    }
    const base: Record<string, any> = { ...baseline.roster, ...baseline.medical }
    const writes = changedFields(defs.map(f => ({ key: f.key, table: f.table as 'roster' | 'child_medical', column: f.column })), base, current)
    // «Сохранено» без записи — тихий отказ в самой честной одежде. Если менять
    // нечего, так и говорим: экран не имеет права намекать, что что-то легло.
    if (writes.length === 0) {
      setWriteResults([{ fieldKey: '', applied: false, reason: 'nothing changed — no field differs from what was loaded',
                         oldValue: null, newValue: null, isVerbal: false }])
      showResults(); return
    }

    setSaving(true); setWriteResults(null)
    const results: WriteResult[] = []
    const who = (user?.user_metadata?.full_name as string) || (user?.email?.split('@')[0]) || 'Staff'

    // КЛЮЧ ВЫДАЁТСЯ ЗДЕСЬ ЖЕ, ЕСЛИ ЕГО НЕТ. Замер 29.07: 369 строк ростера из 623
    // не несут child_id, а медкарта привязывается ИМЕННО к нему — значит для
    // 59 % детей сохранение аллергии отбивалось базой с длинным объяснением про
    // key-backfill, которое директору нечего делать. Ключ у нас уже выдаётся при
    // зачислении обоими путями; здесь он выдаётся той же функцией и для строки,
    // заведённой до починки. Ничего массового: одна строка, по явному «сохранить».
    if (child && !(child as any).child_id && writes.some(w => w.table === 'child_medical')) {
      const { data: kid, error: kidErr } = await (supabase.schema('menumaker').rpc as any)(
        'resolve_or_create_child',
        { p_org: child.org_id, p_first: child.first_name, p_last: child.last_name,
          p_birthdate: child.birthday ?? null },
      )
      const newKey = (kid as any)?.child_id ?? null
      if (kidErr || !newKey) {
        setWriteResults([{ fieldKey: '', applied: false, reason: null, oldValue: null, newValue: null, isVerbal: false,
          error: `NOTHING WAS SAVED. This child has no identity key yet, and one could not be issued: ${kidErr?.message ?? 'the database returned no key'}. Medical details attach to that key, so they cannot be stored until it exists.` }])
        setSaving(false); showResults(); return
      }
      const { error: linkErr } = await supabase.schema('menumaker').from('roster')
        .update({ child_id: newKey }).eq('id', childId)
      if (linkErr) {
        setWriteResults([{ fieldKey: '', applied: false, reason: null, oldValue: null, newValue: null, isVerbal: false,
          error: `NOTHING WAS SAVED. The identity key could not be attached to this child's row: ${linkErr.message}` }])
        setSaving(false); showResults(); return
      }
      setChild(p => p ? ({ ...p, child_id: newKey } as any) : p)
    }

    // Срок, который дало бы правило CACFP от даты документа. Нужен не для записи
    // (пишется то, что в поле), а для СРАВНЕНИЯ: разница между вычисленным и
    // введённым — факт о документе, и он уходит в журнал вместе со значением.
    const computedExpiry = (frpNorm === 'F' || frpNorm === 'R')
      ? frpExpiryDefault(prov.documentDate || todayStr, null)
      : null
    const expiryNote = expiryOverrideNote(computedExpiry, expiresNorm ?? null)

    for (const w of writes) {
      // У поля срока — своя приписка к провенансу. Через год, когда ребёнок
      // окажется просрочен раньше ожидаемого, единственный способ понять почему —
      // найти в журнале, что срок взят С БЛАНКА, а не выведен правилом.
      const noteForField = w.fieldKey === 'frp_expires' && expiryNote
        ? [prov.note, expiryNote].filter(Boolean).join(' · ')
        : prov.note
      results.push(await writeChildField(childId!, w, {
        ...prov, note: noteForField,
        documentDate: prov.source === 'verbal' ? null : (prov.documentDate || null),
      }, who))
    }
    // Побочный эффект прежнего пути, который нельзя потерять: изменение F/R/P
    // записывается ОТДЕЛЬНОЙ определительной записью (income_eligibility +
    // append-only log), чтобы поздняя правка несла тот же аудит-след, что и
    // апрув IEA. Только если поле реально применилось — иначе мы записали бы
    // определение, которого в карточке нет.
    const frpApplied = results.some(r => (r.fieldKey === 'frp' || r.fieldKey === 'frp_expires') && r.applied)
    if (frpApplied && frpNorm && fiscalYear && child) {
      try {
        await recordDetermination({
          roster_id: childId!, org_id: child.org_id, center_id: child.center_id,
          frp: frpNorm, frp_expires: expiresNorm ?? null, fiscal_year: fiscalYear,
          eligibility_source: 'manual', ieSource: 'profile_edit',
          determined_by: user?.id ?? '',
          determined_by_name: (user?.user_metadata?.full_name as string) || (user?.email?.split('@')[0]) || 'Staff',
        })
        setOrig({ frp: frpNorm, expires: expiresNorm ?? null })
        setDetSig({ eligibility: frpNorm, by: (user?.user_metadata?.full_name as string) || (user?.email?.split('@')[0]) || 'Staff', at: todayStr, source: 'manual' })
      } catch (e: any) {
        results.push({ fieldKey: 'frp', applied: true, reason: null, oldValue: null, newValue: frpNorm,
                       isVerbal: false, error: `F/R/P saved to the card, but the determination record was not written: ${e?.message ?? e}` })
      }
    }

    // ─── Перевод: строка истории рядом с правкой поля ─────────────────────
    // Поле хранит ГДЕ ребёнок сейчас; история — С КАКОГО ДНЯ и почему. Без
    // второго «кто был в Red 15 июля» отвечается только глазами.
    if (roomChanged && child && prov.documentDate
        && results.some(r => r.fieldKey === 'classroom_id' && r.applied)) {
      const err = await recordRoomTransfer({
        orgId: child.org_id, centerId: child.center_id, rosterId: childId!,
        fromClassroomId: (baseline.roster?.classroom_id as string) ?? null,
        toClassroomId: child.classroom_id as string,
        effectiveFrom: prov.documentDate,
        reason: prov.note || null,
        enteredBy: user?.id ?? null, enteredByName: who,
      })
      // Комната в карточке уже поменялась. Если история не легла — молчать
      // нельзя: снаружи это выглядит как обычный перевод, а даты действия у него
      // нет, и через месяц её неоткуда взять.
      if (err) {
        results.push({ fieldKey: 'classroom_id', applied: true, reason: null, oldValue: null,
          newValue: null, isVerbal: true,
          error: `The room was changed, but the transfer was NOT written to the room history: ${err}` })
      }
    }

    // ─── Третье состояние: «бумага в деле» ────────────────────────────────
    // Канон владельца 01.08. Значение документного поля внесено руками, скана
    // нет и сегодня не будет — но бумага СУЩЕСТВУЕТ и лежит в сейфе. Пока это
    // состояние негде было записать, директор выбирал между «соврать, что
    // загружено» и «оставить пустым», и оставлял пустым: ребёнок с действующей
    // бумагой числился недокументированным до самой проверки.
    //
    // Строка пишется ТОЛЬКО когда: источник документный, дата с бумаги названа,
    // человек подтвердил галочкой, и поле действительно применилось. Дата с
    // бумаги ложится в valid_from, срок — в valid_until: ровно так их читает
    // claim_packet_manifest, и своего второго источника периода не заводится.
    if (paperInSafe && prov.source !== 'verbal' && prov.documentDate && child) {
      const paperFields = results.filter(r => r.applied && PAPER_DOC_TYPE_BY_FIELD[r.fieldKey])
      const types = [...new Set(paperFields.map(r => PAPER_DOC_TYPE_BY_FIELD[r.fieldKey]))]
      for (const docType of types) {
        const { error } = await supabase.schema('menumaker').from('documents').insert({
          org_id: child.org_id, center_id: child.center_id, doc_type: docType,
          title: `${docType} — paper on file`, roster_id: childId,
          source: 'paper', storage_path: null,
          valid_from: prov.documentDate,
          valid_until: docType === IEA_DOC_TYPE ? (expiresNorm ?? null) : null,
          status: 'active',
          attested_by: user?.id ?? null, attested_at: new Date().toISOString(),
          notes: prov.note || null,
        })
        // Отказ здесь = карточка изменилась, а бумага НЕ засвидетельствована:
        // жёлтая плашка останется гореть, и человек решит, что подтверждение не
        // сработало вовсе. Молчать нельзя.
        if (error) {
          results.push({ fieldKey: docType, applied: false, reason: null, oldValue: null, newValue: null,
            isVerbal: false, error: `The value was saved, but «paper in the safe» was NOT recorded: ${error.message}` })
        }
      }
    }

    setWriteResults(results)
    setSaving(false)
    showResults()
    if (results.every(r => r.applied && !r.error)) { setSaved(true); setTimeout(() => setSaved(false), 2000) }
    loadAll()  // refresh view (age/milk) + badges + provenance after write
  }

  // ─── Completeness counters — driven by childFieldRegistry (B.1) ───────────
  function counts() {
    if (!child) return Array(7).fill({ e: 0, o: 0 })
    const ctx: RecordCtx = { roster: child, medical, view }
    return TAB_KEYS.map(k => {
      const c = regTabCounts(k, ctx, guardians)
      return { e: c.empty, o: c.overdue }
    })
  }

  const badges = counts()
  const totalEmpty = badges.reduce((s, b) => s + b.e, 0)
  const totalOverdue = badges.reduce((s, b) => s + b.o, 0)
  const completePct = child ? regCompleteness({ roster: child, medical, view }, guardians).pct : 0

  const TABS = ['👤 Profile','👨‍👩‍👧 Family','📋 Enrollment','🏥 Health','🍽️ CACFP','🔒 SafePass','💰 Billing','📁 Documents']

  if (!child) return <div style={{ padding: 24, color: '#888', fontFamily:"'DM Sans',sans-serif" }}>Loading…</div>

  const set = (k: keyof Child, v: any) => setChild(p => p ? { ...p, [k]: v } : p)
  const setMed = (k: keyof ChildMedical, v: any) => setMedical(p => p ? { ...p, [k]: v } : p)

  const fullName = displayChildName(child)

  // ─── Registry-driven field rendering (B.2) ───────────────────────────────
  // NOTE: these are plain functions, NOT nested <Components>. Calling them as
  // functions keeps the inputs part of THIS component's tree — declaring a
  // component inside render would remount on every keystroke and drop focus.
  const ctx: RecordCtx = { roster: child, medical, view }

  const writeField = (f: FieldDef, val: any) => {
    if (f.table === 'roster') set(f.column as keyof Child, val)
    else if (f.table === 'child_medical') setMed(f.column as keyof ChildMedical, val)
    // 'view' fields are read-only — never written
  }

  const roVal: React.CSSProperties = {
    ...inp, background: '#f4f7f4', color: '#4b5563', display: 'flex', alignItems: 'center',
  }

  const renderEditor = (f: FieldDef) => {
    const v = fieldValue(f, ctx)
    // ─── МОЛОКО: СТРОКА-РАСЧЁТ, А НЕ ВВОД ────────────────────────────────────
    // Считается из ДР и пересчитывается живьём, пока её вводят (в том числе в
    // режиме создания). Единственный ввод — медицинская замена: она бьёт расчёт
    // и показывается вместо него, с пометкой, чем именно она обоснована.
    if (f.key === 'milk_kind') {
      // Признак замены — САМО ЗНАЧЕНИЕ `substitute_milk`, а не отдельный флаг:
      // отдельный флаг однажды разойдётся с текстом, и карточка скажет «замена»,
      // не сумев назвать, чем именно. Так же читает и сетка питания.
      const subText = ((child as any)?.substitute_milk ?? '') as string
      const sub = !!subText.trim()
      return (
        <div>
          <div style={{ ...roVal }}>
            {sub
              ? <span><strong style={{ color: '#0a3320' }}>{subText}</strong><span style={{ color: '#92400e' }}> — medical substitution</span></span>
              : <span>{milkByAgeLine(child?.birthday ?? null, todayStr)}</span>}
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: '#374151', marginTop: 6 }}>
            <input type="checkbox" checked={sub} data-milk-sub="1"
              onChange={e => {
                if (e.target.checked) {
                  // Включение только ОТКРЫВАЕТ ввод: пока не сказано, чем заменено,
                  // замены нет — обещание «медзамена» без названия ничего не значит.
                  setTimeout(() => document.getElementById('field-substitute_milk')
                    ?.querySelector('input')?.focus(), 30)
                } else {
                  set('substitute_milk' as keyof Child, null)
                }
              }} />
            Medical substitution — served by a doctor’s note
          </label>
          <div style={{ fontSize: 11.5, color: '#6b7280', marginTop: 4 }}>
            {sub
              ? 'The doctor’s note is the document behind this — its date goes in the panel above, the paper itself on Documents.'
              : 'Milk and ounces follow from the birthday. Fill the substitution field below only when a doctor’s note says otherwise.'}
          </div>
        </div>
      )
    }
    if (f.readOnly) return <div style={roVal}>{v ?? '—'}</div>
    switch (f.type) {
      case 'textarea':
        return <textarea style={{ ...inp, minHeight: 64, resize: 'vertical' }} value={v ?? ''} onChange={e => writeField(f, e.target.value)} />
      case 'date':
        return <input type="date" style={inp} value={v ?? ''} onChange={e => writeField(f, e.target.value)} />
      case 'boolean': {
        const opts = f.options ?? [{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }]
        const cur = v === true ? 'true' : v === false ? 'false' : ''
        return (
          <select style={inp} value={cur} onChange={e => writeField(f, e.target.value === '' ? null : e.target.value === 'true')}>
            <option value="">— Select —</option>
            {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        )
      }
      case 'select': {
        const opts = f.column === 'classroom_id'
          ? classrooms.map(c => ({ value: c.id, label: c.name }))
          : (f.options ?? [])
        return (
          <select style={inp} value={v ?? ''} onChange={e => writeField(f, e.target.value)}>
            <option value="">— Select —</option>
            {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        )
      }
      default: // text | phone | email
        return <input style={inp} value={v ?? ''} onChange={e => writeField(f, e.target.value)} />
    }
  }

  const renderFieldRow = (f: FieldDef) => {
    const v = fieldValue(f, ctx)
    const filled = !isEmptyVal(v)
    const showStar = !!f.required && !filled && !f.readOnly
    const isOverdue = !!f.overdue && !!v && String(v).slice(0, 10) < todayStr
    const highlighted = highlightKey === f.key
    return (
      <div key={f.key} id={`field-${f.key}`} style={{
        marginBottom: 14,
        ...(highlighted ? { background: '#fef9c3', borderRadius: 8, padding: 8, boxShadow: '0 0 0 2px #fde047', transition: 'background 0.3s' } : {}),
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
          <span style={{ fontSize: 15, lineHeight: 1, color: filled ? '#16a34a' : '#c0c8c0' }}>{filled ? '☑' : '☐'}</span>
          <label style={{ ...lbl, margin: 0 }}>{f.label}</label>
          {showStar && <span style={{ color: '#ef4444', fontSize: 13, fontWeight: 700 }} title="Required">★</span>}
          {isOverdue && <span style={{ fontSize: 10, background: '#1a2e1a', color: '#fff', borderRadius: 6, padding: '1px 6px', fontWeight: 700 }}>OVERDUE</span>}
          {f.readOnly && <span style={{ fontSize: 10, color: '#9ca3af' }}>· auto</span>}
          {/* Откуда взялось ТЕКУЩЕЕ значение. «Со слов» — видимый маркер, а не
              примечание: значение записано без документа, и это должно быть
              видно тому, кто на него смотрит. */}
          {fieldLocks[f.key]?.lock_level === 'document' && (
            <span title="Document only — see the note under the field"
              style={{ fontSize: 10, background:'#eef2ff', color:'#3730a3', border:'1px solid #c7d2fe', borderRadius:6, padding:'1px 6px', fontWeight:700 }}>
              🔒 document only
            </span>
          )}
          {fieldProv[f.key] && (
            fieldProv[f.key].is_verbal
              ? <span title={`Said, no document · entered by ${fieldProv[f.key].entered_by_name ?? '—'} ${String(fieldProv[f.key].entered_at).slice(0,10)}`}
                  style={{ fontSize: 10, background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d', borderRadius: 6, padding: '1px 6px', fontWeight: 700 }}>
                  SAID · no document
                </span>
              : <span title={`${fieldProv[f.key].source_form_key ?? 'document'} · entered by ${fieldProv[f.key].entered_by_name ?? '—'} ${String(fieldProv[f.key].entered_at).slice(0,10)}`}
                  style={{ fontSize: 10, background: '#f0f7f4', color: '#0f4c35', border: '1px solid #c0d8c0', borderRadius: 6, padding: '1px 6px', fontWeight: 600 }}>
                  📄 {fmtDateOnly(fieldProv[f.key].document_date)}
                </span>
          )}
        </div>
        {renderEditor(f)}
        {/* «Взято с бланка» — видимая пометка расхождения ДО сохранения.
            Правило CACFP даёт 12 месяцев от даты документа до конца месяца, но на
            бланке бывает напечатан свой срок, и тогда прав бланк. Разница — не
            ошибка ввода, а факт о документе; здесь он виден, а в журнал уходит
            вместе со значением. */}
        {f.key === 'frp_expires' && (() => {
          const frpNow = (child?.frp ?? '').trim().toUpperCase().slice(0, 1)
          if (frpNow !== 'F' && frpNow !== 'R') return null
          const computed = frpExpiryDefault(prov.documentDate || todayStr, null)
          const note = expiryOverrideNote(computed, (child?.frp_expires ?? null) as string | null)
          if (!note) return null
          return (
            <div style={{ marginTop: 5, fontSize: 12, color: '#7a4a00', background: '#fff8e6',
              border: '1px solid #f0c674', borderRadius: 8, padding: '7px 10px', lineHeight: 1.45 }}>
              📄 Taken from the form — the 12-month rule from the document date would give <b>{computed}</b>.
              This difference is written to the change history.
            </div>
          )
        })()}
        {/* Вторая петля: тот же текст, что скажет save-путь, но до сети.
            Решает база — здесь только слышно раньше. */}
        {lockRefusal(fieldLocks[f.key], prov.source, {
          oldValue: baseline.roster?.[f.column] ?? baseline.medical?.[f.column] ?? null,
          newValue: (child as any)?.[f.column] ?? (medical as any)?.[f.column] ?? null,
          note: prov.note,
        }) && (
          <div style={{ marginTop: 5, fontSize: 12, color: '#3730a3', background: '#eef2ff',
            border: '1px solid #c7d2fe', borderRadius: 8, padding: '7px 10px', lineHeight: 1.45 }}>
            {lockRefusal(fieldLocks[f.key], prov.source, {
          oldValue: baseline.roster?.[f.column] ?? baseline.medical?.[f.column] ?? null,
          newValue: (child as any)?.[f.column] ?? (medical as any)?.[f.column] ?? null,
          note: prov.note,
        })}
          </div>
        )}
      </div>
    )
  }

  // Render all active fields for a tab, grouped by section (order preserved).
  const renderFieldsTab = (tabKey: TabKey) => {
    const fields = fieldsForTab(tabKey).filter(f => isFieldActive(f, ctx))
    if (fields.length === 0) return <div style={{ color: '#aaa', fontSize: 13 }}>No fields on this tab yet.</div>
    const provBar = (
      <div ref={provRef} style={{ background:'#f8fbf9', border:'1.5px solid #c0d8c0', borderRadius:10, padding:'10px 12px', marginBottom:14 }}>
        <div style={{ fontSize:12, fontWeight:700, color:'#0f4c35', marginBottom:7, display:'flex', alignItems:'baseline', gap:8, flexWrap:'wrap' }}>
          <span>Where this change comes from <span style={{ fontWeight:400, color:'#6b7280' }}>— applies to everything you change and save</span></span>
          {/* Вторая дверь названа ЗДЕСЬ же: человек, ставящий категорию в карточке,
              должен знать про стопку — и наоборот. Правила за обеими дверями одни. */}
          <a href="/instructions?doc=income-categories" target="_blank" rel="noreferrer"
             style={{ fontWeight:600, fontSize:11.5, color:'#0f4c35', textDecoration:'underline' }}>
            How this works
          </a>
        </div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
          <select value={prov.source} onChange={e => setProv(p => ({ ...p, source: e.target.value as Provenance['source'],
                    documentDate: e.target.value === 'verbal' ? '' : p.documentDate }))}
            style={{ padding:'6px 9px', border:'1.5px solid #c0d8c0', borderRadius:8, fontSize:12.5, fontFamily:'inherit', background:'#fff' }}>
            <option value="library_form">Library form</option>
            <option value="free_document">Free document</option>
            <option value="verbal">Said, no document</option>
          </select>
          {prov.source === 'library_form' && (
            <input value={prov.formKey ?? ''} onChange={e => setProv(p => ({ ...p, formKey: e.target.value }))}
              placeholder="form key, e.g. dcy_01234"
              style={{ padding:'6px 9px', border:'1.5px solid #c0d8c0', borderRadius:8, fontSize:12.5, fontFamily:'inherit', width:180 }} />
          )}
          {prov.source !== 'verbal' && (
            <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:12.5, color:'#374151' }}>
              Date ON THE DOCUMENT
              <input type="date" value={prov.documentDate ?? ''} onChange={e => setProv(p => ({ ...p, documentDate: e.target.value }))}
                style={{ padding:'5px 8px', border:'1.5px solid #c0d8c0', borderRadius:8, fontSize:12.5, fontFamily:'inherit' }} />
            </label>
          )}
          {/* ТРЕТЬЕ СОСТОЯНИЕ ДОКУМЕНТА (канон владельца 01.08).
              Скана нет и сегодня не будет — но бумага существует и лежит в деле.
              Подтверждает ЧЕЛОВЕК: только он это знает, программе догадаться
              неоткуда. Галочка снята по умолчанию — молчание не может значить
              «поручился». Показывается лишь при документном источнике: над
              записью «со слов» подтверждать нечего. */}
          {prov.source !== 'verbal' && (
            <label title="Records that the signed paper exists and is filed. No file needed."
              style={{ display:'flex', alignItems:'center', gap:6, fontSize:12.5, color:'#0f4c35',
                       background:'#f4fdf7', border:'1.5px solid #c0d8c0', borderRadius:8, padding:'5px 10px' }}>
              <input type="checkbox" checked={paperInSafe} onChange={e => setPaperInSafe(e.target.checked)}
                style={{ accentColor:'#0f4c35' }} />
              📄 Paper form is in the safe
            </label>
          )}
          {/* МЯГКАЯ ПОДСКАЗКА, А НЕ ТРЕБОВАНИЕ. Настройка организации включена —
              напоминаем, что скан желателен; выключена — НИ СЛОВА о сканах.
              Ни в одном положении она не помечает запись неполной и ничего не
              блокирует: бумага в сейфе полноценна без файла. */}
          {askForScans && paperInSafe && prov.source !== 'verbal' && (
            <span style={{ fontSize: 11.5, color: '#6b7280' }}>
              A scan is welcome later — Documents tab. Nothing is waiting on it.
            </span>
          )}
          <button type="button" onClick={async () => { setShowHistory(v => !v); if (!showHistory) { try { setHistory(await loadFieldHistory(childId!)) } catch { setHistory([]) } } }}
            style={{ marginLeft:'auto', padding:'6px 12px', borderRadius:8, border:'1.5px solid #c0d8c0', background:'#fff', fontSize:12.5, fontFamily:'inherit', cursor:'pointer', color:'#0f4c35', fontWeight:600 }}>
            {showHistory ? 'Hide history' : '🕘 Change history'}
          </button>
        </div>
        <div style={{ fontSize:11, color:'#6b7280', marginTop:6 }}>
          The document date is the one printed on the paper, not today. Values apply by it: a document older
          than the one already applied is written to the history and leaves the card untouched.
        </div>
      </div>
    )
    const results = writeResults && writeResults.length > 0 && (
      <div ref={resultsRef} style={{ marginBottom:14 }}>
        {writeResults.map((r, i) => (
          <div key={i} style={{ fontSize:12.5, padding:'8px 11px', borderRadius:8, marginBottom:6,
            background: r.error ? '#fef2f2' : r.applied ? '#f0fff4' : '#fff7ed',
            border: `1px solid ${r.error ? '#fecaca' : r.applied ? '#bbf7d0' : '#fed7aa'}`,
            color: r.error ? '#991b1b' : r.applied ? '#0f4c35' : '#9a3412' }}>
            {r.error ? <>⚠ {r.error}</>
              : r.applied ? <>✓ <strong>{r.fieldKey}</strong> saved{r.isVerbal ? ' — said, no document' : ''}</>
              : <>⏸ <strong>{r.fieldKey}</strong> — {r.reason}</>}
          </div>
        ))}
      </div>
    )
    const historyPanel = showHistory && (
      <div style={{ marginBottom:14, border:'1.5px solid #e8f0e8', borderRadius:10, overflow:'hidden' }}>
        {history.length === 0
          ? <div style={{ padding:'10px 12px', fontSize:12.5, color:'#9ca3af' }}>No events yet — the journal started on 28 Jul 2026 and is never filled in retroactively.</div>
          : history.map(h => (
            <div key={h.id} style={{ padding:'8px 12px', borderBottom:'1px solid #f1f5f1', fontSize:12.5, display:'flex', gap:10, flexWrap:'wrap', alignItems:'baseline' }}>
              <span style={{ fontWeight:700, color:'#0f4c35', minWidth:150 }}>{h.field_key}</span>
              <span style={{ color:'#6b7280' }}>{h.old_value ?? '—'} → <strong style={{ color:'#111' }}>{h.new_value ?? '—'}</strong></span>
              <span style={{ marginLeft:'auto', color:'#6b7280' }}>
                {h.source === 'verbal'
                  ? <span style={{ color:'#92400e', fontWeight:600 }}>said, no document</span>
                  : <>📄 {fmtDateOnly(h.document_date)}{h.source_form_key ? ` · ${h.source_form_key}` : ''}</>}
                {' · '}entered by {h.entered_by_name ?? '—'} {String(h.entered_at).slice(0,10)}
                {!h.applied && <span style={{ color:'#9a3412' }}> · not applied: {h.not_applied_reason}</span>}
              </span>
            </div>
          ))}
      </div>
    )
    // Merge by section (first-seen order) so non-consecutive same-section fields share one header.
    const groups = new Map<string, FieldDef[]>()
    for (const f of fields) (groups.get(f.section) ?? groups.set(f.section, []).get(f.section)!).push(f)
    return <div>{provBar}{results}{historyPanel}{[...groups].map(([title, items]) => <div key={title}>{section(title)}{items.map(renderFieldRow)}</div>)}</div>
  }

  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:2000, padding:20, fontFamily:"'DM Sans',sans-serif" }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:'#fff', borderRadius:16, width:'100%', maxWidth:680, maxHeight:'92vh', display:'flex', flexDirection:'column', overflow:'hidden', boxShadow:'0 24px 80px rgba(0,0,0,0.25)' }}>

        {/* Header */}
        <div style={{ background:'#0f4c35', padding:'16px 20px', display:'flex', alignItems:'center', gap:14, flexShrink:0 }}>
          <Avatar name={fullName} path={child.photo_url} size={44} fontSize={17} />
          <div style={{ flex:1 }}>
            <div style={{ color:'#fff', fontWeight:700, fontSize:17, display:'flex', alignItems:'center', gap:8 }}>
              {isCreate ? (fullName?.trim() ? fullName : 'New child') : fullName}
              {isCreate && <span style={{ fontSize:10, fontWeight:800, letterSpacing:'0.06em', background:'#fbbf24', color:'#3b2600', padding:'2px 8px', borderRadius:6 }}>NOT SAVED YET</span>}
              {!isCreate && !child.is_active && <span style={{ fontSize:10, fontWeight:800, letterSpacing:'0.06em', background:'#dc2626', color:'#fff', padding:'2px 8px', borderRadius:6 }}>INACTIVE</span>}
            </div>
            <div style={{ color:'rgba(255,255,255,0.6)', fontSize:12, marginTop:2 }}>
              {isCreate
                ? `${createIn?.centerName ?? 'this centre'} · fill what you have — name, birthday, classroom, start date and milk are enough to save`
                : <>
                    {classrooms.find(c=>c.id===child.classroom_id)?.name ?? '—'}
                    {child.birthday ? ` · b. ${fmtDateOnly(child.birthday)}` : ''}
                  </>}
            </div>
          </div>
          {/* Progress */}
          <div style={{ textAlign:'center', marginRight:8 }}>
            <div style={{ fontSize:11, color:'rgba(255,255,255,0.55)', marginBottom:4 }}>Complete</div>
            <div style={{ position:'relative', width:80, height:6, background:'rgba(255,255,255,0.2)', borderRadius:3 }}>
              <div style={{ position:'absolute', left:0, top:0, height:6, borderRadius:3, width:`${completePct}%`, background: completePct>80?'#7ee8b0':completePct>50?'#fbbf24':'#f87171', transition:'width 0.3s' }}/>
            </div>
            <div style={{ fontSize:12, color:'rgba(255,255,255,0.8)', marginTop:3 }}>{completePct}%</div>
          </div>
          {!isCreate && <button onClick={() => setShowExport(true)} title="Export / print this child"
            style={{ background:'rgba(255,255,255,0.15)', border:'none', color:'#fff', height:32, padding:'0 12px', borderRadius:16, cursor:'pointer', fontSize:12, fontWeight:600, marginRight:8 }}>⤓ Export</button>}
          <button onClick={onClose} style={{ background:'rgba(255,255,255,0.15)', border:'none', color:'#fff', width:32, height:32, borderRadius:'50%', cursor:'pointer', fontSize:18 }}>×</button>
        </div>

        {/* Tabs */}
        <div style={{ display:'flex', overflowX:'auto', background:'#f8faf8', borderBottom:'1.5px solid #e8f0e8', flexShrink:0 }}>
          {TABS.map((t, i) => (
            <button key={i} onClick={() => setTab(i)} style={{
              padding:'10px 14px', border:'none', cursor:'pointer', fontFamily:'inherit',
              fontSize:12, fontWeight:600, whiteSpace:'nowrap',
              background: tab===i ? '#fff' : 'transparent',
              color: tab===i ? '#0f4c35' : '#6b7280',
              borderBottom: tab===i ? '2px solid #0f4c35' : '2px solid transparent',
              display:'flex', alignItems:'center'
            }}>
              {t}
              <Badge empty={badges[i].e} overdue={badges[i].o} />
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex:1, overflowY:'auto', padding:20 }}>
          {/* ПЛАШКА ДВОЙНИКА — на вводе имени, без кнопки «проверить». Ничего не
              решает за человека: «это он» уводит в существующую карточку, «новый»
              гасит подсказку. */}
          {isCreate && dedupHits.length > 0 && (
            <div data-dedup="1" style={{ background:'#fffbeb', border:'1.5px solid #fcd34d', borderRadius:10, padding:'10px 12px', fontSize:13, color:'#78350f', marginBottom:14 }}>
              <div style={{ fontWeight:700, marginBottom:6 }}>
                Similar child{dedupHits.length > 1 ? 'ren' : ''} found — is this the same child?
              </div>
              {dedupHits.slice(0, 4).map(c => (
                <div key={c.rosterId} style={{ display:'flex', alignItems:'center', gap:10, padding:'3px 0', flexWrap:'wrap' }}>
                  <span>{candidateLine(c)}</span>
                  <button onClick={() => onUseExisting?.(c.rosterId)} style={{
                    padding:'4px 10px', borderRadius:7, border:'none', background:'#0f4c35', color:'#fff',
                    fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>Use this child</button>
                </div>
              ))}
              <button onClick={() => setDedupOff(true)} style={{
                marginTop:6, padding:'4px 10px', borderRadius:7, border:'1px solid #d6bb7a', background:'#fff',
                color:'#78350f', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
                Keep creating new
              </button>
            </div>
          )}

          {/* ── TAB 0: Profile (registry-driven) ── */}
          {tab === 0 && (
            <>
              <div style={{ marginBottom:18, paddingBottom:16, borderBottom:'1px solid #f0f0f0' }}>
                <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.05em', color:'#888', marginBottom:8 }}>Photo</div>
                {/* facing="environment" — rear camera: you photograph a child, not yourself. */}
                <AvatarUpload entity="child" id={child.id} name={fullName} path={child.photo_url} facing="environment"
                  onChange={p => setChild(c => c ? { ...c, photo_url: p } : c)} />
              </div>
              {renderFieldsTab('profile')}
            </>
          )}

          {/* ── TAB 1: Family ── */}
          {tab === 1 && (
            <div>
              {section('Parents & Guardians')}
              {guardians.length === 0 ? (
                <div style={{ color:'#aaa', fontSize:13, padding:'20px 0' }}>No guardians on file. Add via Enrollment form.</div>
              ) : guardians.map((g, i) => (
                <div key={g.id} style={{ background:'#f8faf8', borderRadius:10, padding:14, marginBottom:10, border:'1.5px solid #e8f0e8' }}>
                  <div style={{ fontWeight:700, fontSize:13, color:'#0f4c35', marginBottom:8 }}>
                    {capWords(g.role) || `Guardian ${i+1}`}{g.relationship ? ` · ${capWords(g.relationship)}` : ''}
                    {canPickupFromRole(g.role) && <span style={{ marginLeft:8, fontSize:11, background:'#dcfce7', color:'#16a34a', padding:'1px 8px', borderRadius:6 }}>✓ Pickup</span>}
                    {g.is_emergency_contact && <span style={{ marginLeft:6, fontSize:11, background:'#fef3c7', color:'#d97706', padding:'1px 8px', borderRadius:6 }}>🚨 Emergency</span>}
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, fontSize:13 }}>
                    <div><span style={{ color:'#888', fontSize:11 }}>Name</span><br/>{g.first_name} {g.last_name}</div>
                    <div><span style={{ color:'#888', fontSize:11 }}>Phone</span><br/>{g.mobile_phone ?? g.phone_1 ?? '—'}</div>
                    <div><span style={{ color:'#888', fontSize:11 }}>Email</span><br/>{g.email ?? '—'}</div>
                    <div><span style={{ color:'#888', fontSize:11 }}>Address</span><br/>{g.address ?? '—'}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── TAB 2: Enrollment (registry-driven) ── */}
          {tab === 2 && (
            <>
              {/* Schedule saves on its own verified path (see ScheduleEditor) — it does
                  NOT ride doSaveRoster, which inspects nothing after its update. */}
              <ScheduleEditor
                childId={child.id}
                value={{
                  sched_days: (child as any).sched_days ?? null,
                  sched_in: (child as any).sched_in ?? null,
                  sched_out: (child as any).sched_out ?? null,
                  sched_source: (child as any).sched_source ?? null,
                  sched_updated_at: (child as any).sched_updated_at ?? null,
                }}
                onSaved={s => setChild(c => c ? ({ ...c, ...s } as Child) : c)}
              />
              {renderFieldsTab('enrollment')}
            </>
          )}

          {/* ── TAB 3: Health (registry-driven; DCY 01236 detail auto-reveals when has_health_condition) ── */}
          {tab === 3 && renderFieldsTab('health')}

          {/* ── TAB 4: CACFP (registry-driven) ── */}
          {tab === 4 && (
            <div>
              {renderFieldsTab('cacfp')}
              <div style={{ borderRadius:10, padding:'10px 14px', fontSize:12.5, marginTop:4,
                background: detSig ? '#f0fff4' : '#fff3cd', border: `1px solid ${detSig ? '#bbf7d0' : '#ffc107'}`,
                color: detSig ? '#0f4c35' : '#856404' }}>
                {detSig
                  ? <>Determination on file ({fiscalYear}): <strong>{detSig.eligibility}</strong> — set by {detSig.by ?? 'unknown'} on {detSig.at ?? '—'}{detSig.source ? ` · ${detSig.source}` : ''}. Changing FRP here records a new manual determination.</>
                  : <>⚠️ No current-cycle IEA determination on file{fiscalYear ? ` (${fiscalYear})` : ''}. Changing FRP here records a manual determination; prefer approving the IEA form when available.</>}
              </div>
              <div style={{ background:'#f0f7f4', borderRadius:10, padding:14, fontSize:13, color:'#0f4c35', marginTop:8 }}>
                <strong>Note:</strong> Age group and milk (oz) are auto-calculated from birthday via v_child_age_profile (read-only). Edit birthday on the Profile tab to change them.{viewError && <div style={{ marginTop:6, color:'#991b1b', fontWeight:600 }}>⚠ The age profile could not be read, so age group and milk show “—” even when the birthday is on file: {viewError}</div>}
              </div>
            </div>
          )}

          {/* ── TAB 5: SafePass ── */}
          {tab === 5 && (
            <div>
              {section('Authorized Pickup')}
              {guardians.length === 0 ? (
                <div style={{ color:'#aaa', fontSize:13 }}>No guardians on file.</div>
              ) : guardians.map((g,i) => (
                <div key={g.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 14px', borderRadius:8, border:'1.5px solid #e8f0e8', marginBottom:8, background:'#fafbfa' }}>
                  <div>
                    <div style={{ fontWeight:600, fontSize:13 }}>{g.first_name} {g.last_name}</div>
                    <div style={{ fontSize:11, color:'#888' }}>{g.role} · {g.mobile_phone ?? g.phone_1 ?? '—'}</div>
                  </div>
                  <div style={{ display:'flex', gap:8 }}>
                    <span style={{ fontSize:12, padding:'3px 10px', borderRadius:6, background: g.can_pickup?'#dcfce7':'#f3f4f6', color: g.can_pickup?'#16a34a':'#888', fontWeight:600 }}>
                      {g.can_pickup ? '✓ Can pickup' : '✗ No pickup'}
                    </span>
                    {g.is_emergency_contact && <span style={{ fontSize:12, padding:'3px 10px', borderRadius:6, background:'#fef3c7', color:'#d97706', fontWeight:600 }}>Emergency</span>}
                  </div>
                </div>
              ))}
              {section('SafePass History')}
              <div style={{ color:'#aaa', fontSize:13, padding:'8px 0' }}>SafePass log available in SafePass module.</div>
            </div>
          )}

          {/* ── TAB 6: Billing ── */}
          {tab === 6 && (
            <div>
              {section('Tuition & Billing')}
              <div style={{ background:'#f8faf8', borderRadius:10, padding:20, textAlign:'center', color:'#aaa', fontSize:13 }}>
                <div style={{ fontSize:24, marginBottom:8 }}>💰</div>
                Billing module coming soon.<br/>Will include: tuition rate, payment schedule, sponsor, balance, payment history.
              </div>
            </div>
          )}

          {/* ── TAB 7: Documents ── */}
          {tab === 7 && !isCreate && <ChildDocumentsTab childDbId={child.child_id ?? childId!} rosterId={childId!}
            orgId={child.org_id} centerId={child.center_id} />}
        </div>

        {/* Footer */}
        <div style={{ padding:'12px 20px', borderTop:'1.5px solid #e8f0e8', display:'flex', justifyContent:'space-between', alignItems:'center', background:'#f8faf8', flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ fontSize:12, color:saved?'#16a34a':'#888' }}>
              {saved ? '✓ Saved' : `${totalEmpty} fields empty · ${totalOverdue} overdue`}
            </div>
            {/* Ни отчислить, ни вернуть нечего, пока строки нет. */}
            {isCreate ? null : child.is_active ? (
              <button onClick={() => setConfirmDeact(true)}
                style={{ padding:'7px 14px', borderRadius:8, border:'1.5px solid #fecaca', background:'#fff', color:'#dc2626', cursor:'pointer', fontFamily:'inherit', fontSize:12, fontWeight:600 }}>
                Deactivate
              </button>
            ) : (
              <button onClick={doReactivate} disabled={deactBusy}
                style={{ padding:'7px 14px', borderRadius:8, border:'1.5px solid #86efac', background:'#f0fdf4', color:'#16a34a', cursor:'pointer', fontFamily:'inherit', fontSize:12, fontWeight:700, opacity:deactBusy?0.6:1 }}>
                {deactBusy ? '…' : '↩ Reactivate'}
              </button>
            )}
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={onClose} style={{ padding:'9px 18px', borderRadius:8, border:'1.5px solid #c0d8c0', background:'#fff', cursor:'pointer', fontFamily:'inherit', fontSize:13 }}>
              Close
            </button>
            {/* ИСТОЧНИК ВИДЕН ТАМ, ГДЕ НАЖИМАЮТ (владелец, 29.07). Переключатель
                живёт наверху вкладки, а подписывают внизу — тот же изъян, что у
                баннера: сведения в недостижимом месте равны их отсутствию.
                Директор с бумагой в руках обязан видеть, ЧЕМ подпишется запись,
                ДО нажатия, и попасть к переключателю одним касанием. */}
            {fieldsForTab(TAB_KEYS[tab]).length > 0 && (
              <button type="button" onClick={() => provRef.current?.scrollIntoView({ behavior:'smooth', block:'center' })}
                title="Change how this entry is sourced"
                style={{ padding:'8px 12px', borderRadius:8, border:'1.5px dashed #c0d8c0', background:'#fff',
                         fontSize:12.5, fontFamily:'inherit', cursor:'pointer', color:'#374151' }}>
                {prov.source === 'verbal'
                  ? '🗣 Saving as: said, no document ✎'
                  : `📄 Saving as: ${prov.source === 'library_form' ? 'library form' : 'document'}${prov.documentDate ? ' · ' + prov.documentDate : ' · DATE MISSING'} ✎`}
              </button>
            )}
            {saveOutcome && (
              <span style={{ fontSize:12, fontWeight:600, maxWidth:330, lineHeight:1.35,
                color: saveOutcome.kind==='error' ? '#991b1b' : saveOutcome.kind==='applied' ? '#0f4c35' : '#9a3412' }}>
                {saveOutcome.icon} {saveOutcome.text}
              </span>
            )}
            {(isCreate || fieldsForTab(TAB_KEYS[tab]).length > 0) && (
              <button onClick={isCreate ? createChild : saveCurrent} disabled={saving}
                style={{ padding:'9px 20px', borderRadius:8, background:'#0f4c35', color:'#fff', border:'none', cursor:'pointer', fontWeight:700, fontSize:13, fontFamily:'inherit', opacity:saving?0.6:1 }}>
                {saving ? 'Saving…' : isCreate ? '✓ Add child' : '✓ Save'}
              </button>
            )}
          </div>
        </div>
      </div>

      {confirmDeact && (
        <div onClick={() => !deactBusy && setConfirmDeact(false)}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:2100, padding:20 }}>
          <div onClick={e=>e.stopPropagation()} style={{ background:'#fff', borderRadius:14, width:'100%', maxWidth:420, padding:22, boxShadow:'0 24px 80px rgba(0,0,0,0.3)' }}>
            <div style={{ fontSize:16, fontWeight:700, color:'#dc2626', marginBottom:8 }}>Deactivate {fullName}?</div>
            <div style={{ fontSize:13, color:'#4b5563', lineHeight:1.5, marginBottom:14 }}>
              The child stops being countable in meal count and reports. You can Reactivate later.
            </div>
            {/* End date decides the claim boundary, so it is 🔒 document-only —
                the same rule and the same refusal as on the card. The director
                reads the last day off the withdrawal record; they do not recall it. */}
            <label style={{ ...lbl }}>Date on the withdrawal record</label>
            <input type="date" value={deactDocDate} onChange={e=>setDeactDocDate(e.target.value)}
              style={{ ...inp, marginBottom:6 }} />
            <div style={{ fontSize:11.5, color:'#6b7280', marginBottom:14, lineHeight:1.45 }}>
              The end date can only be set from a document — enter the date printed on the withdrawal
              notice or the record of the last day. It becomes the child’s end date.
            </div>
            {deactError && (
              <div style={{ fontSize:12.5, color:'#991b1b', background:'#fef2f2', border:'1px solid #fecaca',
                borderRadius:8, padding:'8px 11px', marginBottom:12, lineHeight:1.45 }}>{deactError}</div>
            )}
            <label style={{ ...lbl }}>Reason (optional)</label>
            <textarea value={deactReason} onChange={e=>setDeactReason(e.target.value)} placeholder="e.g. withdrew, moved, aged out"
              style={{ ...inp, minHeight:56, resize:'vertical', marginBottom:16 }} />
            <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
              <button onClick={() => setConfirmDeact(false)} disabled={deactBusy}
                style={{ padding:'9px 16px', borderRadius:8, border:'1.5px solid #c0d8c0', background:'#fff', cursor:'pointer', fontFamily:'inherit', fontSize:13 }}>Cancel</button>
              <button onClick={doDeactivate} disabled={deactBusy}
                style={{ padding:'9px 18px', borderRadius:8, background:'#dc2626', color:'#fff', border:'none', cursor:'pointer', fontWeight:700, fontSize:13, fontFamily:'inherit', opacity:deactBusy?0.6:1 }}>
                {deactBusy ? 'Deactivating…' : 'Deactivate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showExport && (
        <ChildExportPanel
          childName={fullName}
          child={child}
          medical={medical}
          view={view}
          guardians={guardians}
          classrooms={classrooms}
          onClose={() => setShowExport(false)}
        />
      )}
    </div>
  )
}
