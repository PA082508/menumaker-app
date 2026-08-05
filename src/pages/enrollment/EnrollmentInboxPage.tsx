// EnrollmentInboxPage.tsx — Director's Inbox (Enrollment Approval Loop, Phase 1).
//
// Slice A (read-only): lists pending enrollment_submissions scoped to the active
// center (or org-wide in Organization view), each graded by a live 🟢/🟡/🔴
// validation badge. Rows expand to show what's missing / warnings. No writes to
// roster yet — diff-view + Approve/Reject land in Slice B/C.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/contexts/OrgContext'
import { useAuth } from '@/hooks/useAuth'
import {
  validateSubmission, submissionTypeLabel, isStaffType,
  type ValidationResult, type ValStatus,
} from '@/lib/enrollmentValidationRules'
import EnrollmentReviewModal from './EnrollmentReviewModal'
import BackBar from '@/components/BackBar'
import { ocrFailed as isOcrFailed, reRunOcr } from '@/lib/enrollmentScan'
import { scoreMatch, nameForms } from '@/lib/childSearch'
import { warnIf } from '../../lib/queryError'

// Backup approvers: when the director is absent, office managers, admins and the
// owner can also review/approve enrollment submissions.
const STAFF_ROLES = ['director', 'office_manager', 'admin', 'owner']

type Submission = {
  id: string
  org_id: string
  center_id: string
  child_id: string | null
  submission_type: string
  form_data: any
  signatures: any
  signature_date: string | null
  status: string
  source: string
  created_at: string
}

const BADGE: Record<ValStatus, { dot: string; bg: string; fg: string; label: string }> = {
  ready:    { dot: '🟢', bg: '#f0fff4', fg: '#0f4c35', label: 'Ready' },
  warnings: { dot: '🟡', bg: '#fffbeb', fg: '#92400e', label: 'Warnings' },
  errors:   { dot: '🔴', bg: '#fef2f2', fg: '#991b1b', label: 'Incomplete' },
  unknown:  { dot: '⚪', bg: '#f4f4f5', fg: '#6b7280', label: 'Unvalidated' },
}

const fmtDate = (iso: string | null) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`
}

function StatusBadge({ v }: { v: ValidationResult }) {
  const b = BADGE[v.status]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px',
      borderRadius: 999, background: b.bg, color: b.fg, fontSize: 12, fontWeight: 600,
      whiteSpace: 'nowrap',
    }}>
      <span style={{ fontSize: 10 }}>{b.dot}</span>{b.label}
    </span>
  )
}

function SourceTag({ source }: { source: string }) {
  const online = source !== 'paper_entry'
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, color: '#6b7280', background: '#f4f4f5',
      padding: '2px 8px', borderRadius: 6,
    }}>
      {online ? '🌐 Online' : '📷 Paper'}
    </span>
  )
}

export default function EnrollmentInboxPage() {
  const { org, currentCenter, centers, isOrgAdmin, loading: orgLoading } = useOrg()
  // ПИТАНИЕ И ДОХОД — СТОЛ ТАТЬЯНЫ (канон 05.08). Директору эти типы не
  // показываются и не считаются: он их не разбирает и не может закрыть, а число,
  // которое нельзя обнулить, читается как «ты не доделал». У него остаются
  // Release и DCY. Признак тот же, которым решает бейдж, — орг-роль.
  const ORG_DESK_TYPES = ['cacfp_enrollment', 'iea', 'usda_waiver']
  const { roles, user } = useAuth()

  const [rows, setRows] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [reviewing, setReviewing] = useState<Submission | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [toast, setToast] = useState<{ msg: string; undo?: () => Promise<void> } | null>(null)
  const [rerunning, setRerunning] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  // The queue defaults to what needs a person. Auto-filed rows are a FACT to look up,
  // not a task — "видно ≠ actionable" (spec §1.1).
  const [view, setView] = useState<'todo' | 'auto' | 'all' | 'countersign' | 'orgdesk'>('todo')
  // Forms that ALWAYS need a director signature and NEVER auto-file (spec §2b).
  // Single source of truth = the DB function, which matches the registry flags
  // (renewal_countersign_types(): transition_into_program · dcy_01234 ·
  // child_release_authorization). Empty until loaded / if the RPC fails — in which
  // case the tab simply doesn't appear and those rows still sit in "Needs a person".
  const [countersignTypes, setCountersignTypes] = useState<string[]>([])
  // Auto-open the signature queue on first load when it is non-empty (spec §2b:
  // "включённым по умолчанию"). One-shot — a manual tab change afterwards sticks.
  const autoViewedRef = useRef(false)

  const isStaff = useMemo(
    () => (roles ?? []).some(r => STAFF_ROLES.includes(r)),
    [roles],
  )
  const centerName = useMemo(() => {
    const map = new Map((centers ?? []).map(c => [c.id, c.name]))
    return (id: string) => map.get(id) ?? '—'
  }, [centers])

  // Реестр форм здесь БОЛЬШЕ НЕ ЧИТАЕТСЯ: его единственным потребителем была
  // кнопка «Open the enrollment form ↗», убранная 04.08. Оставлять загрузку
  // ради ничего — это запрос, который однажды объяснят как нужный.

  // Which submission types require a director signature. RPC is authenticated-only
  // (revoked from PUBLIC in step 0) — this page is staff-gated, so the director's
  // session can call it.
  useEffect(() => {
    let cancelled = false
    supabase.schema('menumaker').rpc('renewal_countersign_types')
      .then(({ data, error }) => {
        if (cancelled) return
        if (warnIf(error, 'EnrollmentInbox/renewal_countersign_types')) return
        if (Array.isArray(data)) setCountersignTypes(data as string[])
      })
    return () => { cancelled = true }
  }, [])


  useEffect(() => {
    if (orgLoading || !org?.id || !isStaff) return
    let cancelled = false
    ;(async () => {
      setLoading(true); setErr(null)
      let q = supabase.schema('menumaker').from('enrollment_submissions')
        // fee_received_at rides along: it is what tells a POTENTIAL family (signed
        // packet #1, fee never recorded) from one that is actually enrolling.
        .select('id,org_id,center_id,child_id,submission_type,form_data,signatures,signature_date,status,source,created_at,fee_received_at')
        // pending AND received. `received` = auto-filed by enrollment-autofile (no human
        // Approve). It must be VISIBLE — a row that vanished from every screen the moment
        // it was filed would read as a lost document, not as work saved. It is kept OUT
        // of the work list by the view toggle below, not by hiding it from the query.
        .in('status', ['pending', 'received'])
        // A rehearsal probe is not a document. It is a real sealed row written by
        // the recording rehearsal through the live anon channel to prove the
        // submit path is open, and the seal forbids deleting it — so it is kept
        // OUT of the director's list rather than rejected, which would make a
        // machine artefact look like a family whose application was refused.
        // The badge does the same at its own source (enrollment_action_counts).
        //
        // Этап Б: маркером служит record_origin, который ставит СИСТЕМА (гард
        // на строке), а не form_data->>'smoke_tag', который ставила форма.
        // NULL здесь означает «неизвестно» и должен ПРОХОДИТЬ: 94 записи старше
        // колонки, и прятать их было бы хуже, чем показать.
        //
        // Вторая строка — единственная запись, помеченная до появления колонки.
        // Проставить ей record_origin НЕЛЬЗЯ: она запечатана, а печать этапа А
        // морозит провенанс. Клауза историческая и расти не может — новые пробы
        // получают record_origin от гарда.
        .or('record_origin.is.null,record_origin.neq.rehearsal')
        .filter('form_data->>smoke_tag', 'is', null)
        .order('created_at', { ascending: false })
      // Scope: active center, or org-wide in Organization view.
      q = currentCenter?.id ? q.eq('center_id', currentCenter.id) : q.eq('org_id', org.id)
      const { data, error } = await q
      if (cancelled) return
      if (error) setErr(error.message)
      else setRows((data ?? []) as Submission[])
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [orgLoading, org?.id, currentCenter?.id, isStaff, reloadKey])

  // "Approved · Undo" toast auto-dismisses after 10s.
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 10000)
    return () => clearTimeout(t)
  }, [toast])

  async function handleUndo() {
    const u = toast?.undo
    setToast(null)
    if (u) { await u(); setReloadKey(k => k + 1) }
  }

  async function handleReRun(row: Submission) {
    if (rerunning) return
    setRerunning(row.id)
    try {
      const r = await reRunOcr(row)
      setToast({
        msg: r.ocrFailed
          ? 'Re-run OCR failed again — the scan may be unreadable. Try re-shooting.'
          : `Re-run OCR: recognized as ${submissionTypeLabel(r.submissionType)}.`,
      })
      setReloadKey(k => k + 1)
    } catch (e: any) {
      setToast({ msg: `Re-run OCR error: ${e?.message ?? e}` })
    } finally {
      setRerunning(null)
    }
  }

  // IA v2 — this page is hidden; reached only via a button on Children/Staff. `from`
  // drives the "← Back" breadcrumb AND scopes the list (children vs staff submissions).
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const from = searchParams.get('from')  // 'children' | 'staff' | null

  // Rows in scope for the current entry point (Children vs Staff vs org-wide).
  // Tab counts are computed from THIS, so a tab's number always matches what its
  // list will actually show — a countersign form is a child form, so it must not
  // count toward a badge in the Staff view where it can never appear.
  const scoped = useMemo(
    () => rows
      .filter(r => isOrgAdmin || !ORG_DESK_TYPES.includes(r.submission_type))
      .filter(r => from === 'staff' ? isStaffType(r.submission_type)
                 : from === 'children' ? !isStaffType(r.submission_type)
                 : true),
    [rows, from, isOrgAdmin],
  )

  // Live validation per row (Phase 1 computes client-side; no trigger yet).
  const counts = useMemo(() => {
    const cs = new Set(countersignTypes)
    return {
      todo: scoped.filter(r => r.status === 'pending').length,
      auto: scoped.filter(r => r.status === 'received').length,
      // A subset of pending — countersign forms stay in "Needs a person" too
      // (they still need a human); this is a focused lens, not a separate bucket.
      countersign: scoped.filter(r => r.status === 'pending' && cs.has(r.submission_type)).length,
      // Стол Татьяны: питание и доход. Считается по тем же `scoped`, поэтому
      // у директора он всегда 0 — эти строки к нему не приходят вовсе.
      orgdesk: scoped.filter(r => r.status === 'pending' && ORG_DESK_TYPES.includes(r.submission_type)).length,
    }
  }, [scoped, countersignTypes])

  const graded = useMemo(
    () => scoped
      .filter(r => view === 'all' ? true
                 : view === 'auto' ? r.status === 'received'
                 : view === 'countersign' ? (r.status === 'pending' && countersignTypes.includes(r.submission_type))
                 : view === 'orgdesk' ? (r.status === 'pending' && ORG_DESK_TYPES.includes(r.submission_type))
                 // «Needs a person» больше НЕ показывает питание и доход: у них
                 // своя вкладка, иначе одна и та же работа лежала бы в двух местах.
                 : (r.status === 'pending' && !ORG_DESK_TYPES.includes(r.submission_type)))
      .map(r => ({
        row: r,
        v: validateSubmission(r.submission_type, r.form_data, { signatureDate: r.signature_date, source: r.source }),
      })),
    [scoped, view, countersignTypes],
  )

  // Default-open the signature queue once, when it is non-empty. And if it empties
  // out (the last form got signed) while it is the active tab, fall back to the
  // work list — otherwise the active tab would vanish from under the director.
  useEffect(() => {
    if (!autoViewedRef.current && counts.countersign > 0) {
      autoViewedRef.current = true
      setView('countersign')
    } else if (view === 'countersign' && counts.countersign === 0) {
      setView('todo')
    }
  }, [counts.countersign, view])

  // Tab set. The countersign tab appears only while its queue is non-empty.
  const tabs = useMemo(() => {
    const t: [typeof view, string][] = [
      ['todo', `Needs a person${counts.todo ? ` · ${counts.todo}` : ''}`],
    ]
    if (counts.countersign) t.push(['countersign', `Awaiting director signature · ${counts.countersign}`])
    // ВКЛАДКА СТОЛА — только орг-уровню. Директор её не видит, потому что и строк
    // за ней для него нет: одно правило, один ответ, никаких «видно, но нельзя».
    if (isOrgAdmin) t.push(['orgdesk', `Meals & income${counts.orgdesk ? ` · ${counts.orgdesk}` : ''}`])
    t.push(['auto', `Filed automatically${counts.auto ? ` · ${counts.auto}` : ''}`])
    t.push(['all', 'All'])
    return t
  }, [counts.todo, counts.auto, counts.countersign, counts.orgdesk, isOrgAdmin])

  // search-v2: filter the pending list by child name (scoreMatch), ranked when set.
  const visible = useMemo(() => {
    const q = search.trim()
    if (!q) return graded
    return graded
      .map(g => ({ g, s: scoreMatch(nameForms(null, null, String(g.row.form_data?.child_name ?? '')), q) }))
      .filter(x => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .map(x => x.g)
  }, [graded, search])

  if (!orgLoading && !isStaff) {
    return (
      <div style={{ padding: 40, fontFamily: "'DM Sans', sans-serif", color: '#6b7280' }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#0f4c35', marginBottom: 8 }}>Enrollment Inbox</div>
        Only directors, office managers, admins and the owner can review enrollment submissions.
      </div>
    )
  }

  const scopeLabel = currentCenter?.id ? currentCenter.name : `All centers · ${org?.name ?? ''}`

  return (
    <div style={{ padding: '28px 32px', fontFamily: "'DM Sans', sans-serif", maxWidth: 980 }}>
      {/* Entered by a button → leave by a button. Never rely on the browser back arrow. */}
      {from && (
        <div style={{ margin: '-28px -32px 18px' }}>
          <BackBar to={from === 'staff' ? '/staff' : '/children'} label={from === 'staff' ? 'Staff' : 'Children'} />
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f4c35', margin: 0 }}>Enrollment Inbox</h1>
          <span style={{ fontSize: 13, color: '#6b7280' }}>{scopeLabel}</span>
        </div>
        {/* Active center → open the real form directly (new tab). Org view → pick
            a center first (slim picker, no broken in-app embed). */}
        {/* «Open the enrollment form ↗» УБРАНА (владелец, 04.08).
            Директору она не нужна: заполняет форму СЕМЬЯ, со своего телефона, по
            ссылке или QR из витрины. Кнопка на разборе входящих звала директора
            открыть чистый бланк — то есть предлагала ему заполнить за родителя
            то, что родитель подписывает сам. Родительские ссылки не тронуты:
            витрина, QR и пакеты работают как работали. */}
      </div>
      <div style={{ fontSize: 13, color: '#888', marginBottom: 20 }}>
        Pending enrollment packet submissions awaiting director review.
      </div>

      {/* search-v2: filter pending submissions by child name */}
      {!loading && !orgLoading && rows.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by child name…"
            style={{
              flex: '1 1 260px', minWidth: 200, maxWidth: 360, padding: '8px 12px',
              border: '1.5px solid #e5e7eb', borderRadius: 9, fontSize: 13.5,
              fontFamily: 'inherit', color: '#111827',
            }}
          />
          {search.trim() && (
            <span style={{ fontSize: 12.5, color: '#6b7280' }}>{visible.length} of {rows.length}</span>
          )}

          {/* The queue is what needs a person; auto-filed is a separate shelf. Splitting
              them here is what keeps the signal from becoming "150" again. */}
          <div style={{ display: 'flex', gap: 6, marginLeft: 'auto', flexWrap: 'wrap' }}>
            {tabs.map(([k, label]) => {
              const active = view === k
              // The signature queue reads as attention (amber) rather than the
              // neutral green of the other tabs — it is the one that blocks a renewal.
              const accent = k === 'countersign'
              const activeBg = accent ? '#92400e' : '#0f4c35'
              return (
                <button key={k} onClick={() => setView(k)} style={{
                  padding: '6px 12px', borderRadius: 20, fontSize: 12.5, fontWeight: 600,
                  fontFamily: 'inherit', cursor: 'pointer',
                  border: `1.5px solid ${active ? activeBg : accent ? '#fcd9a8' : '#e5e7eb'}`,
                  background: active ? activeBg : accent ? '#fffbeb' : '#fff',
                  color: active ? '#fff' : accent ? '#92400e' : '#6b7280',
                }}>{label}</button>
              )
            })}
          </div>
        </div>
      )}

      {/* ДВЕ ДВЕРИ В ОДНУ РАБОТУ. Стопка бумаг разбирается домохозяйствами на
          Paper applications, отдельные формы — здесь. Ссылка стоит в обе стороны,
          чтобы вторую дверь не искали наощупь. */}
      {view === 'orgdesk' && (
        <div style={{ fontSize: 12.5, color: '#6b7280', margin: '0 0 10px' }}>
          Paper income applications are entered by household on{' '}
          <a href="/iea-confirm" style={{ color: '#0f4c35', fontWeight: 600 }}>Paper applications</a>
          {' · '}
          <a href="/instructions?doc=income-categories" target="_blank" rel="noreferrer" style={{ color: '#0f4c35', fontWeight: 600 }}>How this works</a>
        </div>
      )}

      {(loading || orgLoading) && <div style={{ color: '#888', fontSize: 14 }}>Loading…</div>}
      {err && <div style={{ color: '#991b1b', fontSize: 14 }}>Error: {err}</div>}

      {!loading && !orgLoading && !err && graded.length === 0 && (
        <div style={{
          padding: '40px 24px', textAlign: 'center', color: '#9ca3af', fontSize: 14,
          background: '#fafafa', borderRadius: 12, border: '1px dashed #e5e7eb',
        }}>
          {view === 'orgdesk' ? 'Nothing waiting on the meals & income desk.'
           : view === 'auto' ? 'Nothing has been filed automatically yet.'
           : view === 'countersign' ? 'No forms are waiting for a director signature.'
           : view === 'all' ? 'No submissions.'
           : 'Nothing needs a person right now.'}
        </div>
      )}
      {!loading && !orgLoading && !err && graded.length > 0 && visible.length === 0 && (
        <div style={{
          padding: '32px 24px', textAlign: 'center', color: '#9ca3af', fontSize: 14,
          background: '#fafafa', borderRadius: 12, border: '1px dashed #e5e7eb',
        }}>
          Nothing here matches “{search.trim()}”.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {visible.map(({ row, v }) => {
          // Already filed by the auto-file pass. It must not offer Approve: approving it
          // again would re-run the roster write on a row that is already done.
          const filed = row.status === 'received'
          const isNew = !row.child_id && !filed
          const childName = row.form_data?.child_name || '(no name)'
          const details = [...v.missing.map(m => ({ kind: 'missing', text: m })),
                           ...v.errors.map(m => ({ kind: 'error', text: m })),
                           ...v.warnings.map(m => ({ kind: 'warning', text: m }))]
          const open = expanded === row.id
          return (
            <div key={row.id} style={{
              border: `1px solid ${filed ? '#d1fae5' : '#e5e7eb'}`, borderRadius: 12,
              background: filed ? '#f6fdf9' : '#fff',
              boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
            }}>
              <div
                onClick={() => setExpanded(open ? null : row.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px',
                  cursor: details.length ? 'pointer' : 'default',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: '#111827', display: 'flex', gap: 8, alignItems: 'center' }}>
                    {childName}
                    {isNew && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#0f4c35', background: '#f0fff4', padding: '1px 7px', borderRadius: 6 }}>
                        NEW
                      </span>
                    )}
                    {filed && (
                      <span title="Matched to this child by the link we issued, validated, and filed — no review needed"
                        style={{ fontSize: 11, fontWeight: 700, color: '#166534', background: '#dcfce7', padding: '1px 7px', borderRadius: 6 }}>
                        ✓ FILED AUTOMATICALLY
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 3, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span>{submissionTypeLabel(row.submission_type)}</span>
                    <span>·</span>
                    <span>{fmtDate(row.created_at)}</span>
                    {!currentCenter?.id && <><span>·</span><span>{centerName(row.center_id)}</span></>}
                  </div>
                </div>
                {row.form_data?.scan_ref && (
                  <span title="A scanned form is attached" style={{
                    fontSize: 11, fontWeight: 600, color: '#0f4c35', background: '#f0fff4',
                    padding: '2px 8px', borderRadius: 6,
                  }}>📎 Scan</span>
                )}
                {isOcrFailed(row.form_data) && (
                  <span title="OCR could not read this scan — re-run or re-shoot" style={{
                    fontSize: 11, fontWeight: 700, color: '#991b1b', background: '#fef2f2',
                    padding: '2px 8px', borderRadius: 6,
                  }}>⚠️ OCR failed</span>
                )}
                {row.form_data?.scan_ref && (
                  <button
                    onClick={e => { e.stopPropagation(); handleReRun(row) }}
                    disabled={rerunning === row.id}
                    title="Re-run OCR on the stored scan"
                    style={{
                      padding: '6px 12px', borderRadius: 8, border: '1px solid #e5e7eb',
                      background: rerunning === row.id ? '#f3f4f6' : '#fff', color: '#374151',
                      fontSize: 12, fontWeight: 600, cursor: rerunning === row.id ? 'default' : 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {rerunning === row.id ? '↻ Running…' : '↻ Re-run OCR'}
                  </button>
                )}
                <SourceTag source={row.source} />
                <StatusBadge v={v} />
                {filed ? (
                  // No Approve: it is done. The row is here to be FOUND, not worked.
                  <span style={{ fontSize: 12, color: '#166534', whiteSpace: 'nowrap', fontWeight: 600 }}>
                    on file · no action needed
                  </span>
                ) : (
                  <button
                    onClick={e => { e.stopPropagation(); setReviewing(row) }}
                    style={{
                      padding: '6px 14px', borderRadius: 8, border: 'none', background: '#0f4c35',
                      color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                    }}
                  >
                    Review
                  </button>
                )}
                {details.length > 0 && (
                  <span style={{ color: '#9ca3af', fontSize: 12, width: 14, textAlign: 'center' }}>{open ? '▾' : '▸'}</span>
                )}
              </div>

              {open && details.length > 0 && (
                <div style={{ borderTop: '1px solid #f3f4f6', padding: '12px 18px 16px' }}>
                  <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {details.map((d, i) => (
                      <li key={i} style={{
                        fontSize: 13,
                        color: d.kind === 'warning' ? '#92400e' : d.kind === 'error' ? '#991b1b' : '#6b7280',
                      }}>
                        {d.kind === 'warning' ? '⚠︎ ' : d.kind === 'error' ? '✕ ' : '○ '}{d.text}
                      </li>
                    ))}
                  </ul>
                  <div style={{ marginTop: 12, fontSize: 12, color: '#9ca3af', fontStyle: 'italic' }}>
                    Open <strong>Review</strong> to see the full submission side-by-side with the current record.
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {reviewing && (
        <EnrollmentReviewModal
          submission={reviewing}
          reviewerId={user?.id ?? ''}
          reviewerName={(user?.user_metadata?.full_name as string) || (user?.email?.split('@')[0]) || 'Director'}
          isOrgAdmin={isOrgAdmin}
          onClose={() => setReviewing(null)}
          onSaved={() => { setReviewing(null); setReloadKey(k => k + 1) }}
          onDone={(result) => {
            setReviewing(null)
            setReloadKey(k => k + 1)
            setToast({ msg: result.message, undo: result.undo })
          }}
        />
      )}

      {/* Org view has no active center, so the form needs one before opening.
          Slim picker only — choosing a center opens the real form in a new tab. */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: '#111827', color: '#fff', padding: '12px 16px 12px 18px', borderRadius: 12,
          display: 'flex', alignItems: 'center', gap: 16, fontSize: 13.5, fontFamily: "'DM Sans', sans-serif",
          boxShadow: '0 10px 30px rgba(0,0,0,0.25)', zIndex: 1100,
        }}>
          <span>{toast.msg}</span>
          {toast.undo && (
            <button onClick={handleUndo} style={{
              background: 'transparent', border: 'none', color: '#7ee8b0', fontWeight: 700,
              fontSize: 13.5, cursor: 'pointer', padding: 0,
            }}>Undo</button>
          )}
        </div>
      )}
    </div>
  )
}
