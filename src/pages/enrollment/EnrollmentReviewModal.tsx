// EnrollmentReviewModal.tsx — diff-view for one pending submission (Phase 1
// slice B). Left = submitted form_data; right = current roster/medical record
// (resolved via childFieldRegistry). Director can fix parent typos in place;
// Save writes back to enrollment_submissions.form_data with an edit-log entry.
// No roster writes here — Approve/Reject land in slice C.

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { type RecordCtx } from '@/lib/childFieldRegistry'
import { buildDiff, getPath, setPath, type DiffRow } from '@/lib/enrollmentFieldMap'
import { validateSubmission, submissionTypeLabel, type ValStatus } from '@/lib/enrollmentValidationRules'
import { resolveScanUrl, lowConfidenceSet, ocrMeta, hasScan } from '@/lib/enrollmentScan'
import ReturnWindow from '@/pages/children/ReturnWindow'
import {
  buildCacfpPatch, decideSchedule, formAsOf, buildIeaFrp, loadCenterRoster, matchRoster,
  approveCacfpInsert, approveCacfpUpdate, approveIea, approveDocument, rejectSubmission,
  setFeeReceived, isProspect,
  parseIeaFiscalYear, frpExpiryDefault,
  type RosterLite, type ApproveResult,
} from '@/lib/enrollmentApprove'
import { countersignSlot, loadSample, adoptSample, type SignatureSample, type SampleOwner } from '@/lib/signatureSamples'
import SignaturePad from '@/components/signing/SignaturePad'

// roster.sched_days bitmask — Mon=1 Tue=2 Wed=4 Thu=8 Fri=16 (20260716c)
const SCHED_DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']

type Submission = {
  id: string; org_id: string; center_id: string; child_id: string | null
  submission_type: string; form_data: any; signature_date: string | null
  status: string; source: string; created_at: string
  signatures?: Record<string, any> | null
  fee_received_at?: string | null
}

const isUuid = (v: any): v is string =>
  typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)

const BADGE: Record<ValStatus, { dot: string; label: string; fg: string }> = {
  ready:    { dot: '🟢', label: 'Ready', fg: '#0f4c35' },
  warnings: { dot: '🟡', label: 'Warnings', fg: '#92400e' },
  errors:   { dot: '🔴', label: 'Incomplete', fg: '#991b1b' },
  unknown:  { dot: '⚪', label: 'Unvalidated', fg: '#6b7280' },
}

export default function EnrollmentReviewModal({
  submission, reviewerId, reviewerName, onClose, onSaved, onDone,
}: {
  submission: Submission
  reviewerId: string
  reviewerName: string
  onClose: () => void
  onSaved: () => void
  onDone: (result: ApproveResult) => void
}) {
  const [fd, setFd] = useState<any>(submission.form_data ?? {})
  const [ctx, setCtx] = useState<RecordCtx | null>(null)
  const [ctxLoading, setCtxLoading] = useState(true)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const isCacfp = submission.submission_type === 'cacfp_enrollment'
  const isIea = submission.submission_type === 'iea'
  const [dateIn, setDateIn] = useState('')
  const [paperSigned, setPaperSigned] = useState(false)
  const [busy, setBusy] = useState(false)
  const [candidates, setCandidates] = useState<RosterLite[]>([])
  const [chosenMatch, setChosenMatch] = useState<string | 'new' | null>(null)
  const [rejecting, setRejecting] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [showWarnings, setShowWarnings] = useState(false)
  // Reactivate-from-Review: a chosen inactive match must go through the return
  // window (reactivate & admit → admission_log) BEFORE Approve attaches the scan.
  const [readmitOpen, setReadmitOpen] = useState(false)

  // ─── documents (Consent, DCY 01234, Release Auth…) ─────────────────────────
  // Until now the panel threw «This submission type cannot be approved yet» on
  // every one of them. Izabella's consent and DCY 01234 have sat pending since
  // 15.07 for exactly that reason.
  const isDocument = !isCacfp && !isIea
  const slot = countersignSlot(submission.submission_type)
  const alreadyCountersigned = !!slot && !!submission.form_data && !!submission.signatures?.[slot]
  const [docChild, setDocChild] = useState<string | ''>('')      // manual link — no token, no guessing
  const [sigDraw, setSigDraw] = useState<string | null>(null)     // this session's stroke
  const [mySample, setMySample] = useState<SignatureSample | null>(null)
  const [useSample, setUseSample] = useState(true)
  const [adoptMine, setAdoptMine] = useState(false)               // remember it as my shelf
  const [feeOn, setFeeOn] = useState(!!submission.fee_received_at)

  // The signer's OWN shelf — read under their login, never from a form on the
  // shared kiosk. A pad reads only its own scope and never falls back.
  //
  // sponsor_sig (IEA, кусок 2) is the GENERAL DIRECTOR's slot, a distinct signing
  // role from a center director — "the shelf is the signing role, not the person".
  // Since 20260722b it has its OWN `sponsor` shelf, so we load THAT for sponsor_sig
  // (never the center `director` shelf — that would be the exact collapse the shelves
  // forbid). Every other slot (program_sig/admin_sig) keeps the director shelf.
  useEffect(() => {
    if (!slot) { setMySample(null); setUseSample(false); return }
    const owner: SampleOwner = slot === 'sponsor_sig'
      ? { scope: 'sponsor', authId: reviewerId }
      : { scope: 'director', authId: reviewerId }
    let cancelled = false
    ;(async () => {
      try {
        const s = await loadSample(owner)
        if (!cancelled) { setMySample(s); setUseSample(!!s) }
      } catch { /* no sample is a fact, not a failure — the pad still draws */ }
    })()
    return () => { cancelled = true }
  }, [slot, reviewerId])

  const prospect = isProspect({
    submission_type: submission.submission_type,
    status: submission.status,
    fee_received_at: submission.fee_received_at,
  })
  const countersignImage = useSample && mySample ? mySample.signature_image : sigDraw

  // Resolve the existing child (matched by child_id column, or a uuid inside
  // form_data). New applicants have neither → right column stays empty.
  const resolvedChildId = useMemo(() => {
    if (isUuid(submission.child_id)) return submission.child_id
    if (isUuid(submission.form_data?.child_id)) return submission.form_data.child_id
    return null
  }, [submission])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setCtxLoading(true)
      if (!resolvedChildId) { setCtx(null); setCtxLoading(false); return }
      const s = supabase.schema('menumaker')
      const [{ data: roster }, { data: medical }, { data: view }] = await Promise.all([
        s.from('roster').select('*').eq('id', resolvedChildId).maybeSingle(),
        s.from('child_medical').select('*').eq('child_id', resolvedChildId).maybeSingle(),
        s.from('v_child_age_profile').select('*').eq('id', resolvedChildId).maybeSingle(),
      ])
      if (cancelled) return
      setCtx({ roster: roster ?? null, medical: medical ?? null, view: view ?? null })
      setCtxLoading(false)
    })()
    return () => { cancelled = true }
  }, [resolvedChildId])

  // Phase 1.5 — photographed paper form. Resolve the scan for side-by-side review,
  // and collect the OCR low-confidence field set so those rows read "verify".
  const [scanUrl, setScanUrl] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const url = hasScan(fd) ? await resolveScanUrl(fd.scan_ref) : null
      if (!cancelled) setScanUrl(url)
    })()
    return () => { cancelled = true }
  }, [fd?.scan_ref])
  const lowConf = useMemo(() => lowConfidenceSet(fd), [fd])
  const scanDocType = ocrMeta(fd).docType

  // Center's active Meal Slots — drives the 🟡 "meal not served here" / CACFP-cap
  // warnings. null until loaded (or on error) → validation fails open (skips the
  // slot check), never a false warning.
  const [activeMealSlots, setActiveMealSlots] = useState<string[] | null>(null)
  useEffect(() => {
    if (!isCacfp) { setActiveMealSlots(null); return }
    let cancelled = false
    ;(async () => {
      const { data } = await supabase.schema('menumaker')
        .from('meal_count_settings')
        .select('active_slots')
        .eq('center_id', submission.center_id)
        .maybeSingle()
      if (!cancelled) setActiveMealSlots(Array.isArray(data?.active_slots) ? data.active_slots : null)
    })()
    return () => { cancelled = true }
  }, [isCacfp, submission.center_id])

  const rows = useMemo(() => buildDiff(submission.submission_type, fd, ctx), [submission.submission_type, fd, ctx])
  const v = useMemo(
    () => validateSubmission(submission.submission_type, fd, { signatureDate: submission.signature_date, activeMealSlots, source: submission.source }),
    [submission.submission_type, fd, submission.signature_date, activeMealSlots, submission.source],
  )
  const badge = BADGE[v.status]

  // Load center roster for duplicate / child matching (new CACFP applicant, or IEA).
  useEffect(() => {
    const need = isIea || ((isCacfp || isDocument) && !resolvedChildId)
    if (!need) return
    let cancelled = false
    ;(async () => {
      const list = await loadCenterRoster(submission.center_id)
      if (!cancelled) setCandidates(list)
    })()
    return () => { cancelled = true }
  }, [submission.center_id, resolvedChildId, isCacfp, isIea, isDocument])

  // CACFP new-applicant duplicate matches (name + DOB).
  const cacfpMatches = useMemo(
    () => (isCacfp && !resolvedChildId ? matchRoster(candidates, fd?.child_name, fd?.birthdate) : []),
    [isCacfp, resolvedChildId, candidates, fd?.child_name, fd?.birthdate],
  )

  // IEA: FRP determination + per-child roster matches.
  const frpInfo = useMemo(() => (isIea ? buildIeaFrp(fd) : null), [isIea, fd])
  const ieaChildren = useMemo<{ name: string; matches: RosterLite[] }[]>(() => {
    if (!isIea) return []
    const kids = Array.isArray(fd?.children) ? fd.children : []
    return kids.filter((c: any) => c?.name).map((c: any) => ({
      name: String(c.name), matches: matchRoster(candidates, c.name, c.dob),
    }))
  }, [isIea, fd, candidates])
  const ieaMatchedIds = useMemo(
    () => Array.from(new Set(ieaChildren.flatMap(c => c.matches.slice(0, 1).map(m => m.id)))),
    [ieaChildren],
  )

  // IEA F/R/P determination editor (Layer 1). The selector defaults to the OCR /
  // Sponsor value; the director confirms or overrides it. When Sponsor is empty
  // the director can still pick a value — that unblocks accumulated forms.
  const today = new Date().toISOString().slice(0, 10)
  const [frpChoice, setFrpChoice] = useState('')
  const [frpExpiry, setFrpExpiry] = useState('')
  const [frpTouched, setFrpTouched] = useState(false)
  useEffect(() => {
    if (!isIea) return
    setFrpChoice(frpInfo?.frp ?? '')
    setFrpExpiry(frpExpiryDefault(today, frpInfo?.frp_expires ?? null))
    setFrpTouched(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isIea, frpInfo?.frp, frpInfo?.frp_expires])

  // Fiscal year is the FORM EDITION, never date math. Embed forms carry
  // form_data.type ('iea_fy2026_27'); scanned paper doesn't → resolve the
  // registry's current IEA edition (…/IEA_FY2026-27_v5.html).
  const [ieaFiscalYear, setIeaFiscalYear] = useState<string | null>(null)
  useEffect(() => {
    if (!isIea) { setIeaFiscalYear(null); return }
    const fromType = parseIeaFiscalYear(fd?.type)
    if (fromType) { setIeaFiscalYear(fromType); return }
    let cancelled = false
    ;(async () => {
      try {
        const r = await fetch('/enroll-registry.json?t=' + Date.now(), { cache: 'no-store' })
        const j = await r.json()
        const iea = j?.forms?.iea
        const url = iea?.versions?.[iea?.current] ?? iea?.fallbackUrl
        if (!cancelled) setIeaFiscalYear(parseIeaFiscalYear(url))
      } catch { if (!cancelled) setIeaFiscalYear(null) }
    })()
    return () => { cancelled = true }
  }, [isIea, fd?.type])

  const frpOverridden = frpTouched && frpChoice !== (frpInfo?.frp ?? '')
  const eligibilitySource = frpOverridden ? 'manual'
    : frpInfo?.source === 'sponsor' ? 'ocr_sponsor'
    : frpInfo?.source === 'helper' ? 'ocr_helper'
    : 'manual'

  // A chosen match that is still inactive must be reactivated & admitted first.
  const chosenMatchObj = chosenMatch && chosenMatch !== 'new' ? candidates.find(c => c.id === chosenMatch) ?? null : null
  // What Approve will do with days/hours — computed from the same function the
  // patch uses, so the panel cannot promise something the write won't do. The
  // recency rule needs the row we're about to write: the resolved child's own
  // record, else the chosen match from the roster list.
  const schedTarget = useMemo(() => {
    if (ctx?.roster) return ctx.roster
    if (chosenMatch && chosenMatch !== 'new') return candidates.find(c => c.id === chosenMatch) ?? null
    return null
  }, [ctx, chosenMatch, candidates])
  const schedulePort = useMemo(
    () => decideSchedule(fd, formAsOf(submission), schedTarget),
    [fd, submission, schedTarget],
  )

  const chosenInactive = isCacfp && !!chosenMatchObj && chosenMatchObj.is_active === false

  // Approve gating: 🔴 blocks; unresolved CACFP duplicate blocks; a chosen
  // inactive match blocks until it's reactivated & admitted via the return window.
  const dupUnresolved = isCacfp && !resolvedChildId && cacfpMatches.length > 0 && !chosenMatch
  const docNeedsChild = isDocument && !resolvedChildId && !docChild
  const docNeedsSig = isDocument && !!slot && !alreadyCountersigned && !countersignImage
  // IEA carries the General Director's sponsor_sig slot — her countersignature is
  // required to approve (unless already on file), same rule as a document's slot.
  const ieaNeedsSig = isIea && !!slot && !alreadyCountersigned && !countersignImage
  const approveBlocked = v.status === 'errors' || dupUnresolved || chosenInactive || busy
    || (isIea && (!frpChoice || !ieaFiscalYear || ieaMatchedIds.length === 0))
    || docNeedsChild || docNeedsSig || ieaNeedsSig

  async function doApprove() {
    if (v.status === 'errors') return
    // Warnings → open a review modal listing them (not a native confirm).
    if (v.status === 'warnings') { setShowWarnings(true); return }
    // Anti-misclick: if the reviewer never edited the diff, confirm the roster
    // write first. Editing (dirty) already signals a deliberate review.
    const what = isDocument
      ? `File ${childName}'s ${submissionTypeLabel(submission.submission_type)}${slot ? ', countersigned by you' : ''}?`
      : `Approve ${childName}? This creates or updates the roster.`
    if (!dirty && !window.confirm(what)) return
    runApprove()
  }

  // The actual roster write. Reached with no warnings (after the misclick confirm)
  // or via the warnings modal's "Approve anyway".
  async function runApprove() {
    setShowWarnings(false)
    setBusy(true); setErr(null)
    try {
      let result: ApproveResult
      if (isCacfp) {
        const patch = buildCacfpPatch(fd, dateIn, { formDate: formAsOf(submission), existing: schedTarget })
        const target = resolvedChildId ?? (chosenMatch && chosenMatch !== 'new' ? chosenMatch : null)
        // Reactivate when the chosen match is a departed (inactive) child.
        const reactivate = !!target && candidates.find(c => c.id === target)?.is_active === false
        result = target
          ? await approveCacfpUpdate(submission, target, patch, reviewerId, paperSigned, reactivate)
          : await approveCacfpInsert(submission, patch, reviewerId, paperSigned)
      } else if (isIea) {
        if (!frpChoice) throw new Error('Choose an F/R/P determination')
        if (!ieaFiscalYear) throw new Error('Could not resolve the IEA form edition / fiscal year')
        if (ieaMatchedIds.length === 0) throw new Error('No roster children matched — add them via CACFP enrollment first')
        // The General Director's sponsor_sig — written into signatures.sponsor_sig
        // by approveIea (merge, never replace). Applied from her sponsor shelf, or
        // drawn/typed here as fallback.
        const ieaCs = slot && countersignImage && !alreadyCountersigned
          ? { slot, image: countersignImage, signedBy: reviewerId, signedName: reviewerName }
          : null
        result = await approveIea(
          submission,
          {
            frp: frpChoice, frp_expires: frpExpiry || null, fiscal_year: ieaFiscalYear,
            eligibility_source: eligibilitySource, determined_by: reviewerId, determined_by_name: reviewerName,
          },
          ieaMatchedIds, reviewerId, paperSigned, ieaCs,
        )

        // Remember it as MY sponsor sample, if asked — onto the `sponsor` shelf, never
        // the center director shelf. Deliberate: adoption is not a side effect of one
        // signature. The determination is already applied; a failed remember is not fatal.
        if (ieaCs && adoptMine && !useSample && sigDraw) {
          try {
            await adoptSample({
              owner: { scope: 'sponsor', authId: reviewerId },
              orgId: submission.org_id, centerId: submission.center_id,
              ownerName: reviewerName, image: sigDraw, method: 'drawn',
              sourceSubmissionId: null,   // the GD mints under her login, not from a form
              adoptedBy: reviewerId,
            })
          } catch (e: any) {
            setErr(`Countersigned and approved, but your signature was not saved for next time: ${e?.message ?? e}`)
          }
        }
      } else {
        // A document: file it against a child, optionally countersigned. No
        // roster write — that is the CACFP/IEA path.
        const target = resolvedChildId ?? (docChild || null)
        const cs = slot && countersignImage
          ? { slot, image: countersignImage, signedBy: reviewerId, signedName: reviewerName }
          : null
        result = await approveDocument(submission, target, reviewerId, paperSigned, cs)

        // Remember it as MY shelf, if asked. Adoption is deliberate: the sample
        // is what later forms will apply without redrawing, so it is never a
        // side effect of one signature.
        if (cs && adoptMine && !useSample && sigDraw) {
          try {
            await adoptSample({
              owner: { scope: 'director', authId: reviewerId },
              orgId: submission.org_id, centerId: submission.center_id,
              ownerName: reviewerName, image: sigDraw, method: 'drawn',
              sourceSubmissionId: null,   // a director mints under their login, not from a form
              adoptedBy: reviewerId,
            })
          } catch (e: any) {
            // The form IS countersigned and filed; only remembering failed. Say
            // so — swallowing it would leave the shelf silently empty next time.
            setErr(`Filed and countersigned, but your signature was not saved for next time: ${e?.message ?? e}`)
          }
        }
      }
      onDone(result)
    } catch (e: any) { setErr(e?.message ?? String(e)); setBusy(false) }
  }

  async function doReject() {
    if (!rejectReason.trim()) return
    setBusy(true); setErr(null)
    try {
      onDone(await rejectSubmission(submission, rejectReason.trim(), reviewerId))
    } catch (e: any) { setErr(e?.message ?? String(e)); setBusy(false) }
  }

  const sections = useMemo(() => {
    const order: string[] = []
    const map = new Map<string, DiffRow[]>()
    for (const r of rows) {
      if (!map.has(r.section)) { map.set(r.section, []); order.push(r.section) }
      map.get(r.section)!.push(r)
    }
    return order.map(s => ({ section: s, rows: map.get(s)! }))
  }, [rows])

  const editField = (path: string, value: string) => {
    setFd((prev: any) => setPath(prev, path, value))
    setDirty(true)
  }

  async function save() {
    setSaving(true); setErr(null)
    // Record which mapped fields changed vs the original submission.
    const orig = submission.form_data ?? {}
    const changes = rows
      .filter(r => r.editPath)
      .map(r => ({ path: r.editPath!, from: getPath(orig, r.editPath!) ?? '', to: getPath(fd, r.editPath!) ?? '' }))
      .filter(c => String(c.from) !== String(c.to))
    const log = Array.isArray(fd._edit_log) ? fd._edit_log : []
    const nextFd = changes.length
      ? { ...fd, _edit_log: [...log, { at: new Date().toISOString(), by: reviewerId, changes }] }
      : fd
    const { error } = await supabase.schema('menumaker').from('enrollment_submissions')
      .update({ form_data: nextFd }).eq('id', submission.id)
    setSaving(false)
    if (error) { setErr(error.message); return }
    setDirty(false)
    onSaved()
  }

  const childName = fd?.child_name || rows.find(r => r.key.startsWith('child_'))?.formValue || '(no name)'

  return (
    <div onClick={() => (dirty ? null : onClose())} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      fontFamily: "'DM Sans', sans-serif",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: 16, width: '100%', maxWidth: scanUrl ? 980 : 720,
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
      }}>
        {/* header */}
        <div style={{ background: '#0f4c35', padding: '18px 22px', borderRadius: '16px 16px 0 0', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 17 }}>{childName}</div>
            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 2 }}>
              {submissionTypeLabel(submission.submission_type)} · {resolvedChildId ? 'existing record' : 'new applicant'}
            </div>
          </div>
          <span style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>{badge.dot} {badge.label}</span>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        {/* body — scan (Phase 1.5) alongside the diff */}
        <div style={{ display: 'flex', overflow: 'hidden', flex: 1 }}>
          {scanUrl && (
            <div style={{ width: 300, flexShrink: 0, borderRight: '1px solid #f3f4f6', background: '#0b1f17', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#e5e7eb', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span>📷 Scanned form{scanDocType ? ` · ${scanDocType}` : ''}</span>
                <a href={scanUrl} target="_blank" rel="noreferrer" style={{ color: '#7ee8b0', fontSize: 11, fontWeight: 600, textDecoration: 'none' }}>Open ↗</a>
              </div>
              <div style={{ flex: 1, overflow: 'auto', padding: 8 }}>
                <img src={scanUrl} alt="Scanned enrollment form" style={{ width: '100%', borderRadius: 8, display: 'block' }} />
              </div>
              {lowConf.size > 0 && (
                <div style={{ padding: '8px 12px', borderTop: '1px solid rgba(255,255,255,0.1)', color: '#fcd34d', fontSize: 11 }}>
                  🔍 {lowConf.size} field{lowConf.size === 1 ? '' : 's'} marked <strong>verify</strong> — check against the scan.
                </div>
              )}
            </div>
          )}
          <div style={{ padding: '16px 22px', overflowY: 'auto', flex: 1 }}>
          {(v.missing.length > 0 || v.warnings.length > 0) && (
            <div style={{ marginBottom: 14, padding: '10px 14px', background: v.status === 'errors' ? '#fef2f2' : '#fffbeb', borderRadius: 10, fontSize: 12.5 }}>
              {[...v.missing.map(m => ({ t: m, c: '#991b1b', s: '✕' })), ...v.warnings.map(w => ({ t: w, c: '#92400e', s: '⚠︎' }))].map((d, i) => (
                <div key={i} style={{ color: d.c }}>{d.s} {d.t}</div>
              ))}
            </div>
          )}

          {ctxLoading && <div style={{ color: '#888', fontSize: 13, marginBottom: 8 }}>Loading current record…</div>}

          {/* column headers */}
          <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr 1fr', gap: 10, fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.4, padding: '0 0 6px' }}>
            <div />
            <div>Submitted</div>
            <div>Current record</div>
          </div>

          {sections.map(({ section, rows }) => (
            <div key={section} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#0f4c35', margin: '8px 0 4px' }}>{section}</div>
              {rows.map(r => {
                // OCR flagged this field low-confidence → "verify" against the scan.
                const verify = !r.missing && (lowConf.has(r.key) || (!!r.editPath && lowConf.has(r.editPath)))
                return (
                <div key={r.key} style={{
                  display: 'grid', gridTemplateColumns: '150px 1fr 1fr', gap: 10, alignItems: 'center',
                  padding: '6px 8px', borderRadius: 8,
                  background: r.missing ? '#fef2f2' : verify ? '#fff7ed' : r.changed ? '#fffbeb' : 'transparent',
                  boxShadow: r.missing ? 'inset 3px 0 0 #ef4444' : verify ? 'inset 3px 0 0 #f59e0b' : undefined,
                }}>
                  <div style={{ fontSize: 12.5, color: r.missing ? '#991b1b' : '#6b7280', display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                    <span>{r.label}{r.required && <span title="Required" style={{ color: '#ef4444', fontWeight: 700 }}> ★</span>}</span>
                    {verify && <span title="OCR was unsure — check this value against the scan" style={{ fontSize: 9, fontWeight: 700, color: '#92400e', background: '#fef3c7', padding: '1px 5px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>🔍 verify</span>}
                    {r.rateLocked && <span title="This value decides reimbursement, so only the signed form may state it. To change it, ask the parent for a corrected form — they sign it, and it supersedes this one." style={{ fontSize: 9, fontWeight: 700, color: '#0f4c35', background: '#dcfce7', padding: '1px 5px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>🔒 signed</span>}
                  </div>
                  <div style={{ fontSize: 13 }}>
                    {r.editPath ? (
                      <input
                        value={getPath(fd, r.editPath) ?? ''}
                        onChange={e => editField(r.editPath!, e.target.value)}
                        placeholder={r.missing ? 'required — fill in' : ''}
                        style={{
                          width: '100%', padding: '4px 8px', borderRadius: 6, fontSize: 13, fontFamily: 'inherit',
                          border: `1px solid ${r.missing ? '#fca5a5' : '#e5e7eb'}`,
                        }}
                      />
                    ) : (
                      <span style={{ color: r.formValue ? '#111827' : r.missing ? '#ef4444' : '#d1d5db' }}>
                        {r.formValue || (r.missing
                          ? (r.rateLocked ? 'required — only a signed form may state this' : 'required — edit on original form')
                          : '—')}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 13, color: r.currentValue ? '#111827' : '#d1d5db' }}>
                    {r.currentValue || (resolvedChildId ? '—' : 'new')}
                  </div>
                </div>
              )})}
            </div>
          ))}
          </div>
        </div>

        {/* approve action panel */}
        <div style={{ padding: '12px 22px', borderTop: '1px solid #f3f4f6', background: '#fafafa', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {isCacfp && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, color: '#374151' }}>
              <span style={{ width: 130, color: '#6b7280' }}>Date In (start date)</span>
              <input type="date" value={dateIn} onChange={e => setDateIn(e.target.value)}
                style={{ padding: '4px 8px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 13, fontFamily: 'inherit' }} />
              <span style={{ color: '#9ca3af', fontSize: 11 }}>optional — director sets the enrollment start</span>
            </label>
          )}

          {/* Days and hours: say what Approve will do with them, either way. A
              silent refusal would read as "ported" and print an empty Hours cell
              weeks later, with nobody knowing why. */}
          {isCacfp && fd?.schedule && (
            schedulePort.write ? (
              <div style={{ fontSize: 12.5, color: '#166534' }}>
                ✓ Schedule ported — {SCHED_DAY_LABELS.filter((_, i) => schedulePort.sched_days & (1 << i)).join(' ')}
                {' · '}{schedulePort.sched_in}–{schedulePort.sched_out}
              </div>
            ) : (
              <div style={{ fontSize: 12.5, color: '#92400e' }}>
                ⚠︎ Schedule not ported — {schedulePort.reason}.{' '}
                <span style={{ color: '#6b7280' }}>
                  Nothing is overwritten. Set it on the child’s Enrollment tab and the next sheet prints it.
                </span>
              </div>
            )
          )}

          {/* ── Prospect: signed packet #1, the fee was never recorded ─────── */}
          {prospect && (
            <div style={{ fontSize: 12.5, padding: '8px 10px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8 }}>
              <div style={{ fontWeight: 600, color: '#92400e', marginBottom: 4 }}>◷ Potential family</div>
              <span style={{ color: '#6b7280' }}>
                Signed packet #1, but the registration fee is not recorded. Packet #2/#3 is not issued yet.
              </span>
            </div>
          )}

          {(submission.submission_type === 'start_form' || submission.submission_type === 'parent_consent') && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, color: '#374151' }}>
              <input type="checkbox" checked={feeOn} disabled={busy}
                onChange={async e => {
                  const on = e.target.checked
                  setFeeOn(on)                       // optimistic — reverted below if the write is refused
                  try { await setFeeReceived(submission.id, on, reviewerId) }
                  catch (er: any) { setFeeOn(!on); setErr(er?.message ?? String(er)) }
                }} />
              <span>Registration fee received</span>
              <span style={{ color: '#9ca3af', fontSize: 11 }}>
                a fact you record — payments are a later feature
              </span>
            </label>
          )}

          {/* ── Documents: link to a child, then countersign ────────────────── */}
          {isDocument && !resolvedChildId && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, color: '#374151' }}>
              <span style={{ width: 130, color: '#6b7280' }}>Child</span>
              <select value={docChild} onChange={e => setDocChild(e.target.value)}
                style={{ flex: 1, padding: '4px 8px', border: `1px solid ${docChild ? '#e5e7eb' : '#fca5a5'}`, borderRadius: 6, fontSize: 13, fontFamily: 'inherit' }}>
                <option value="">— choose the child this document belongs to —</option>
                {candidates.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.child_name}{c.birthday ? ` · ${c.birthday}` : ''}{c.is_active ? '' : ' · departed'}
                  </option>
                ))}
              </select>
            </label>
          )}
          {isDocument && !resolvedChildId && (
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: -4 }}>
              This form arrived without a personal link, so nobody can tell whose it is —
              {' '}the name on it does not match the roster on its own. Choose the child by hand.
            </div>
          )}

          {isDocument && slot && !alreadyCountersigned && (
            <div style={{ fontSize: 12.5 }}>
              <div style={{ fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                Your signature <span style={{ color: '#9ca3af', fontWeight: 400 }}>— this form has a director's slot ({slot})</span>
              </div>
              {mySample && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <input type="checkbox" checked={useSample} onChange={e => setUseSample(e.target.checked)} />
                  <span>Apply my signature</span>
                  <img src={mySample.signature_image} alt="" style={{ height: 28, background: '#fafff9', border: '1px solid #e5e7eb', borderRadius: 4 }} />
                </label>
              )}
              {!useSample && (
                <>
                  <SignaturePad onChange={setSigDraw} hint={`Sign as ${reviewerName}`} disabled={busy} />
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                    <input type="checkbox" checked={adoptMine} onChange={e => setAdoptMine(e.target.checked)} />
                    <span style={{ color: '#6b7280' }}>Remember this as my signature — apply it with one tap next time</span>
                  </label>
                </>
              )}
            </div>
          )}

          {isDocument && slot && alreadyCountersigned && (
            <div style={{ fontSize: 12.5, color: '#0f4c35' }}>✓ Already countersigned — a signature is never written twice.</div>
          )}

          {isDocument && !slot && (
            <div style={{ fontSize: 12.5, color: '#6b7280' }}>
              Filing only — this form declares no director's signature slot, so none is written into it.
            </div>
          )}

          {isCacfp && !resolvedChildId && cacfpMatches.length > 0 && (
            <div style={{ fontSize: 12.5 }}>
              <div style={{ color: '#92400e', fontWeight: 600, marginBottom: 4 }}>
                ⚠︎ Possible existing {cacfpMatches.length === 1 ? 'match' : 'matches'} — choose one:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {cacfpMatches.map(m => (
                  <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input type="radio" name="dupmatch" checked={chosenMatch === m.id} onChange={() => setChosenMatch(m.id)} />
                    {m.is_active === false ? 'Reactivate' : 'Update'} <strong>{m.child_name || `${m.last_name ?? ''} ${m.first_name ?? ''}`}</strong>
                    {m.birthday ? <span style={{ color: '#9ca3af' }}>· {String(m.birthday).slice(0, 10)}</span> : null}
                    {m.is_active === false ? <span style={{ color: '#b45309', fontWeight: 600 }}>· inactive</span> : null}
                  </label>
                ))}
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="radio" name="dupmatch" checked={chosenMatch === 'new'} onChange={() => setChosenMatch('new')} />
                  Create a new child
                </label>
              </div>
            </div>
          )}

          {chosenInactive && (
            <div style={{ fontSize: 12.5, background: '#fffbeb', border: '1.5px solid #fde68a', borderRadius: 10, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1, color: '#92400e' }}>
                <strong>{chosenMatchObj?.child_name || 'This child'}</strong> left the center. Reactivate &amp; admit them
                (records the admission + document snapshot), then Approve attaches this scan.
              </div>
              <button onClick={() => setReadmitOpen(true)} style={{
                padding: '8px 14px', borderRadius: 8, border: 'none', background: '#16a34a', color: '#fff',
                fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
              }}>↩ Reactivate &amp; admit</button>
            </div>
          )}

          {isIea && (
            <div style={{ fontSize: 12.5, color: '#374151', display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px', background: '#f9fafb', border: '1px solid #eef2f7', borderRadius: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <strong>F/R/P determination</strong>
                <select value={frpChoice} onChange={e => { setFrpChoice(e.target.value); setFrpTouched(true) }}
                  style={{ padding: '5px 8px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', background: '#fff' }}>
                  <option value="">— choose —</option>
                  <option value="F">Free</option>
                  <option value="R">Reduced</option>
                  <option value="P">Paid</option>
                </select>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#6b7280' }}>
                  expires
                  <input type="date" value={frpExpiry} onChange={e => setFrpExpiry(e.target.value)}
                    style={{ padding: '4px 6px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 12.5, fontFamily: 'inherit' }} />
                </label>
              </div>
              <div style={{ fontSize: 11.5, color: '#6b7280' }}>
                {ieaFiscalYear
                  ? <>Fiscal year <strong>{ieaFiscalYear}</strong> · </>
                  : <span style={{ color: '#991b1b' }}>Fiscal year unresolved (form edition unknown) · </span>}
                {/* Category source, signed in the UI (Nikolay 22.07): make the
                    provenance of the F/R/P legible — form-stated vs form-calculated
                    vs a human override — so the GD signs knowing where it came from. */}
                Category source: {frpOverridden
                  ? <strong style={{ color: '#92400e' }}>✎ manual override</strong>
                  : frpInfo?.source === 'sponsor' ? <strong style={{ color: '#0f4c35' }}>form-stated · Sponsor section</strong>
                  : frpInfo?.source === 'helper' ? <strong style={{ color: '#0f4c35' }}>form-calculated · income helper</strong>
                  : <span style={{ color: '#92400e' }}>⚠︎ manual entry (form stated none)</span>}
              </div>
              {frpChoice && (
                <div style={{ fontSize: 11.5, color: '#0f4c35' }}>
                  Determination set by <strong>{reviewerName || 'director'}</strong> on {today}
                </div>
              )}
              <div style={{ color: ieaMatchedIds.length ? '#0f4c35' : '#991b1b' }}>
                Applies to {ieaMatchedIds.length} matched child{ieaMatchedIds.length === 1 ? '' : 'ren'}
                {ieaChildren.some(c => c.matches.length === 0) &&
                  ` · skipped (no roster match): ${ieaChildren.filter(c => !c.matches.length).map(c => c.name).join(', ')}`}
              </div>
            </div>
          )}

          {/* ── IEA countersignature — the General Director's sponsor_sig (кусок 2) ──
              Reads her OWN `sponsor` shelf (not the center director shelf). Apply a
              saved sample with one tap, or draw/type as fallback and optionally adopt
              it. Written into signatures.sponsor_sig on Approve (approveIea, merge). */}
          {isIea && slot && !alreadyCountersigned && (
            <div style={{ fontSize: 12.5 }}>
              <div style={{ fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                Your countersignature
                <span style={{ color: '#9ca3af', fontWeight: 400 }}> — General Director's slot ({slot})</span>
              </div>
              {mySample && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <input type="checkbox" checked={useSample} onChange={e => setUseSample(e.target.checked)} />
                  <span>Apply my signature</span>
                  <img src={mySample.signature_image} alt="" style={{ height: 28, background: '#fafff9', border: '1px solid #e5e7eb', borderRadius: 4 }} />
                </label>
              )}
              {!useSample && (
                <>
                  <SignaturePad onChange={setSigDraw} hint={`Sign as ${reviewerName}`} disabled={busy} />
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                    <input type="checkbox" checked={adoptMine} onChange={e => setAdoptMine(e.target.checked)} />
                    <span style={{ color: '#6b7280' }}>Remember this as my signature — apply it with one tap next time</span>
                  </label>
                </>
              )}
            </div>
          )}
          {isIea && slot && alreadyCountersigned && (
            <div style={{ fontSize: 12.5, color: '#0f4c35' }}>✓ Already countersigned — a signature is never written twice.</div>
          )}

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: '#374151' }}>
            <input type="checkbox" checked={paperSigned} onChange={e => setPaperSigned(e.target.checked)} />
            Paper form signed &amp; filed
          </label>

          {rejecting && (
            <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Reason for rejection (sent context for follow-up)…"
              style={{ padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', minHeight: 56, resize: 'vertical' }} />
          )}
        </div>

        {/* footer */}
        <div style={{ padding: '12px 22px', borderTop: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: 8 }}>
          {err && <span style={{ color: '#991b1b', fontSize: 12.5, flex: 1 }}>{err}</span>}
          {!err && <span style={{ flex: 1, fontSize: 11.5, color: '#9ca3af' }}>
            {rejecting
              ? 'Rejecting doesn’t require valid fields — just add a reason and confirm.'
              : v.status === 'errors' ? 'Resolve required fields before approving.' : dupUnresolved ? 'Choose a duplicate resolution above.' : chosenInactive ? 'Reactivate & admit the matched child first, then Approve attaches this scan.' : 'Nothing is written to the roster until you Approve.'}
          </span>}
          <button onClick={onClose} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Close</button>
          <button onClick={save} disabled={!dirty || saving} style={{
            padding: '8px 14px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13, fontWeight: 600,
            background: '#fff', color: dirty && !saving ? '#0f4c35' : '#d1d5db',
            cursor: dirty && !saving ? 'pointer' : 'default',
          }}>{saving ? 'Saving…' : 'Save edits'}</button>
          <button disabled title="Phase 3 — sends the parent a pre-filled link to complete their own submission"
            style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', color: '#d1d5db', fontSize: 13, fontWeight: 600, cursor: 'not-allowed' }}>
            Request completion
          </button>
          {rejecting ? (
            <button onClick={doReject} disabled={!rejectReason.trim() || busy} style={{
              padding: '8px 16px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 700,
              background: rejectReason.trim() && !busy ? '#991b1b' : '#d1d5db', color: '#fff',
              cursor: rejectReason.trim() && !busy ? 'pointer' : 'default',
            }}>Confirm reject</button>
          ) : (
            // Solid red — an equal-weight destructive action opposite green Approve.
            <button onClick={() => setRejecting(true)} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#991b1b', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>✕ Reject</button>
          )}
          {/* Deliberate gap so Approve is never mistaken for / adjacent to Reject. */}
          <div style={{ width: 22 }} />
          <button onClick={doApprove} disabled={approveBlocked} style={{
            padding: '8px 20px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 700,
            background: approveBlocked ? '#d1d5db' : '#0f4c35', color: '#fff',
            cursor: approveBlocked ? 'default' : 'pointer',
          }}>{busy ? 'Working…' : '✓ Approve'}</button>
        </div>
      </div>

      {readmitOpen && chosenMatchObj && (
        <div onClick={() => setReadmitOpen(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 3000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#fff', borderRadius: 16, width: '100%', maxWidth: 560, maxHeight: '90vh',
            display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
            fontFamily: "'DM Sans', sans-serif", overflow: 'hidden',
          }}>
            <div style={{ background: '#0f4c35', padding: '18px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div style={{ color: '#fff', fontWeight: 700, fontSize: 17 }}>↩ {chosenMatchObj.child_name || 'Reactivate & admit'}</div>
              <button onClick={() => setReadmitOpen(false)} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', width: 30, height: 30, borderRadius: '50%', cursor: 'pointer', fontSize: 18 }}>×</button>
            </div>
            <div style={{ padding: 22, overflowY: 'auto' }}>
              <ReturnWindow
                child={{ id: chosenMatchObj.id, name: chosenMatchObj.child_name ?? undefined, is_active: false }}
                reviewerId={reviewerId} reviewerName={reviewerName}
                pendingScan={{ submissionType: submission.submission_type, dcyForm: fd?.dcy_form ?? null }}
                onDone={() => {
                  // Now active — flip locally so Approve runs as a plain Update
                  // (attach scan), not another reactivate; then close the window.
                  setCandidates(cs => cs.map(c => c.id === chosenMatchObj.id ? { ...c, is_active: true } : c))
                  setReadmitOpen(false)
                }}
              />
            </div>
          </div>
        </div>
      )}

      {showWarnings && (
        <div onClick={() => setShowWarnings(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 3000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#fff', borderRadius: 14, width: '100%', maxWidth: 440,
            boxShadow: '0 20px 60px rgba(0,0,0,0.25)', fontFamily: "'DM Sans', sans-serif", overflow: 'hidden',
          }}>
            <div style={{ padding: '16px 20px', background: '#fffbeb', borderBottom: '1px solid #fde68a' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#92400e' }}>🟡 Approve with warnings?</div>
              <div style={{ fontSize: 12.5, color: '#92400e', marginTop: 3 }}>
                {childName} — please review before writing to the roster.
              </div>
            </div>
            <ul style={{ listStyle: 'none', margin: 0, padding: '14px 20px', maxHeight: 260, overflowY: 'auto' }}>
              {v.warnings.map((w, i) => (
                <li key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, color: '#374151', padding: '4px 0' }}>
                  <span style={{ color: '#d97706' }}>⚠︎</span><span>{w}</span>
                </li>
              ))}
            </ul>
            <div style={{ display: 'flex', gap: 10, padding: '14px 20px', borderTop: '1px solid #f3f4f6' }}>
              <button onClick={() => setShowWarnings(false)} style={{
                flex: 1, padding: '10px', borderRadius: 9, border: '1.5px solid #c0d8c0',
                background: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600, color: '#0f4c35',
              }}>Review warnings</button>
              <button onClick={runApprove} style={{
                flex: 1, padding: '10px', borderRadius: 9, border: 'none',
                background: '#0f4c35', color: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 700,
              }}>Approve anyway</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
