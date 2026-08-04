// ============================================================
// childFieldWrite.ts — the ONE protected path into a child's card.
//
// WHAT IT REPLACES. Three bare `.update()` calls in ChildSettingsPage that wrote
// straight to PostgREST: no history, no provenance, no idea whether the paper in
// the director's hand was newer or older than what was already on file. Measured
// 2026-07-28: zero triggers on roster / child_medical / child_guardian /
// income_eligibility, and no audit table anywhere — nobody could say who changed
// what, or when, or on what authority.
//
// AND ONE BUG IT CLOSES ON THE WAY. child_medical.child_id references
// menumaker.child(id), NOT roster.id — the page passed roster.id. Measured: of
// 70 medical rows, ZERO matched the page's query, and an insert was refused by
// the foreign key. The Health tab could neither read nor write, and said nothing
// about it. The RPC resolves the key once, at the boundary, so no caller can get
// it wrong again.
//
// THE TWO DATES ARE NOT THE SAME DATE. `document_date` is the date ON THE PAPER;
// `entered_at` is when someone typed it in. A form signed 15.07 and filed 28.07
// is one event with two dates, and the value applies by the FIRST of them.
// ============================================================
import { supabase } from '@/lib/supabase'

/** Where a value came from. `verbal` = told to us, no document — always marked. */
export type FieldSource = 'library_form' | 'free_document' | 'verbal'

export type Provenance = {
  source: FieldSource
  /** The date printed on the document. Required unless the source is `verbal`. */
  documentDate: string | null
  /** Registry key of the library form, e.g. 'dcy_01234'. Required for library_form. */
  formKey?: string | null
  submissionId?: string | null
  note?: string | null
}

export type FieldWrite = {
  fieldKey: string
  table: 'roster' | 'child_medical' | 'child'
  column: string
  value: string | null
}

export type WriteResult = {
  fieldKey: string
  applied: boolean
  reason: string | null
  oldValue: string | null
  newValue: string | null
  isVerbal: boolean
  error?: string
}

/** Normalise a card value to the text the RPC stores. Empty → null (absent). */
export function toText(v: unknown): string | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  const s = String(v).trim()
  return s === '' ? null : s
}

/** Fields whose value differs from the loaded baseline. Absence is not a change:
 *  a field the editor never touched must not be written, or every save would
 *  restate the whole card as if it had all just been decided. */
export function changedFields(
  fields: { key: string; table: 'roster' | 'child_medical'; column: string }[],
  baseline: Record<string, any>,
  current: Record<string, any>,
): FieldWrite[] {
  const out: FieldWrite[] = []
  for (const f of fields) {
    const before = toText(baseline?.[f.column])
    const after = toText(current?.[f.column])
    if (before === after) continue
    out.push({ fieldKey: f.key, table: f.table, column: f.column, value: after })
  }
  return out
}

/** Is this provenance complete enough to write with? Returns the reason if not. */
export function provenanceProblem(p: Provenance): string | null {
  if (p.source === 'verbal') {
    return p.documentDate ? 'A verbal note cannot carry a document date — there is no document.' : null
  }
  if (!p.documentDate) return 'Enter the date printed on the document — not today’s date.'
  if (p.source === 'library_form' && !p.formKey) return 'Choose which library form this is.'
  return null
}

/** Write one field through the protected path. */
export async function writeChildField(
  rosterId: string, w: FieldWrite, p: Provenance, enteredByName: string,
): Promise<WriteResult> {
  const { data, error } = await (supabase.schema('menumaker').rpc as any)('record_child_field_change', {
    p_roster_id: rosterId,
    p_field_key: w.fieldKey,
    p_table: w.table,
    p_column: w.column,
    p_new_value: w.value,
    p_source: p.source,
    p_document_date: p.documentDate,
    p_source_form_key: p.formKey ?? null,
    p_source_submission_id: p.submissionId ?? null,
    p_note: p.note ?? null,
    p_entered_by_name: enteredByName,
  })
  if (error) {
    return { fieldKey: w.fieldKey, applied: false, reason: null, oldValue: null,
             newValue: w.value, isVerbal: p.source === 'verbal', error: error.message }
  }
  const d = (data ?? {}) as any
  return {
    fieldKey: w.fieldKey,
    applied: !!d.applied,
    reason: d.reason ?? null,
    oldValue: d.old_value ?? null,
    newValue: d.new_value ?? null,
    isVerbal: !!d.is_verbal,
  }
}

export type FieldEvent = {
  id: string
  field_key: string
  column_name: string
  old_value: string | null
  new_value: string | null
  source: FieldSource
  source_form_key: string | null
  document_date: string | null
  entered_at: string
  entered_by_name: string | null
  note: string | null
  applied: boolean
  not_applied_reason: string | null
}

/** The child's change history, newest first. */
export async function loadFieldHistory(rosterId: string, limit = 100): Promise<FieldEvent[]> {
  const { data, error } = await supabase.schema('menumaker').from('child_field_events')
    .select('id,field_key,column_name,old_value,new_value,source,source_form_key,document_date,entered_at,entered_by_name,note,applied,not_applied_reason')
    .eq('roster_id', rosterId)
    .order('entered_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as FieldEvent[]
}

// ─── Этап В: замок ──────────────────────────────────────────────────────────
// Уровни и тексты живут в БАЗЕ (menumaker.child_field_locks). Здесь их только
// ЧИТАЮТ — чтобы показать состояние и отказать до сети. Это ВТОРАЯ петля:
// решает save-путь, а гашение поля на экране обходится любым другим клиентом.
export type LockLevel = 'document' | 'marked' | 'free'
export type FieldLock = {
  field_key: string; lock_level: LockLevel; needs_document_text: string | null
  /** Лестница выгоды от НИЗШЕЙ к высшей, напр. ['P','R','F']. null — направления нет. */
  benefit_ladder?: string[] | null
  /** Отказ, когда понижение вносят со слов без причины. */
  needs_reason_text?: string | null
}

export async function loadFieldLocks(): Promise<Record<string, FieldLock>> {
  const { data, error } = await supabase.schema('menumaker').from('child_field_locks')
    .select('field_key,lock_level,needs_document_text,benefit_ladder,needs_reason_text')
  if (error) throw error
  const out: Record<string, FieldLock> = {}
  for (const row of (data ?? []) as FieldLock[]) out[row.field_key] = row
  return out
}

/** Направление изменения по лестнице выгоды. Чистое — сервер считает так же. */
export type BenefitDirection = 'increase' | 'decrease' | 'same' | 'unknown'

export function benefitDirection(
  ladder: readonly string[] | null | undefined, oldValue: string | null, newValue: string | null,
): BenefitDirection {
  if (!ladder || ladder.length === 0) return 'unknown'
  const rank = (v: string | null) => {
    const k = (v ?? '').trim().slice(0, 1).toUpperCase()
    const i = ladder.indexOf(k)
    return i < 0 ? null : i
  }
  const nr = rank(newValue)
  if (nr === null) return 'unknown'
  const or = rank(oldValue)
  // Значения не было вовсе → это НАЗНАЧЕНИЕ. Низшая ступень назначением выгоды
  // не является и идёт как понижение; всё выше требует бумаги. Иначе через
  // пустое значение открылся бы обход: стереть и назначить льготу со слов.
  if (or === null) return nr === 0 ? 'decrease' : 'increase'
  return nr > or ? 'increase' : nr < or ? 'decrease' : 'same'
}

/**
 * Отказ, который даст save-путь, посчитанный НА ЭКРАНЕ — чтобы человек услышал
 * его до сети. Решает всё равно база; здесь только слышно раньше, и тексты
 * берутся ИЗ ТЕХ ЖЕ КОЛОНОК, а не пишутся в клиенте второй раз.
 *
 * НАПРАВЛЕННЫЙ ЗАМОК (04.08): у поля с лестницей выгоды правило асимметрично —
 * повышение требует подписанного документа, понижение можно со слов, но с
 * НАЗВАННОЙ ПРИЧИНОЙ. До этой правки экран отказывал и на понижении: он врал,
 * запрещая то, что сервер пропускает, и директор не мог снять льготу, которой
 * семья больше не соответствует.
 */
export function lockRefusal(
  lock: FieldLock | undefined, source: FieldSource,
  ctx?: { oldValue?: string | null; newValue?: string | null; note?: string | null },
): string | null {
  if (!lock) return null

  if (lock.benefit_ladder && lock.benefit_ladder.length > 0) {
    if (source !== 'verbal') return null
    const dir = benefitDirection(lock.benefit_ladder, ctx?.oldValue ?? null, ctx?.newValue ?? null)
    if (dir === 'increase') {
      return lock.needs_document_text
        ?? 'Raising a benefit needs a signed document — attach it and enter the date printed on it.'
    }
    if (dir === 'decrease' && !(ctx?.note ?? '').trim()) {
      return lock.needs_reason_text
        ?? 'Lowering a category from what the family told you needs a reason in your own words.'
    }
    return null
  }

  if (lock.lock_level !== 'document') return null
  if (source !== 'verbal') return null
  return lock.needs_document_text
    ?? 'This field can only be changed from a signed document — attach it and enter the date printed on it.'
}

export type FieldProvenance = {
  field_key: string
  source: FieldSource
  source_form_key: string | null
  document_date: string | null
  entered_at: string
  entered_by_name: string | null
  is_verbal: boolean
}

/** Where each field's CURRENT value came from — keyed by FieldDef.key. */
export async function loadFieldProvenance(rosterId: string): Promise<Record<string, FieldProvenance>> {
  const { data, error } = await supabase.schema('menumaker').from('v_child_field_provenance')
    .select('field_key,source,source_form_key,document_date,entered_at,entered_by_name,is_verbal')
    .eq('roster_id', rosterId)
  if (error) throw error
  const out: Record<string, FieldProvenance> = {}
  for (const row of (data ?? []) as FieldProvenance[]) out[row.field_key] = row
  return out
}
