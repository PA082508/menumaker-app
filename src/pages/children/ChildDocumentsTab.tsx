// ============================================================
// ChildDocumentsTab.tsx — Documents tab for a child (B.4).
// Storage: org-files/children/{childDbId}/{ts}_{filename}. Images are
// auto-cropped on upload (shared detectAndCrop). List / view (signed URL) /
// delete. childDbId = child.child_id (FK to child.id) when present, else the
// roster id as a fallback for fiscal rows that were never linked to a child.
// ============================================================

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { detectAndCrop } from '@/lib/detectAndCrop'
import { hasOriginalReplica, originalReplica } from '@/lib/originalFormReplicas'
import { captureAndUploadSnapshot, getLatestSnapshot } from '@/lib/enrollmentSnapshot'
import { documentDateOf } from '@/lib/enrollmentApprove'
import {
  CHILD_DOCS_BUCKET, hasFile, loadChildDocs, loadDocTypes, fileUploadedDoc, unfiledNames,
  type ChildDocRow, type DocTypeRow,
} from '@/lib/childDocuments'
import ApprovedFormViewer from '@/pages/enrollment/ApprovedFormViewer'

type FileRow = { name: string; id?: string; created_at?: string; metadata?: { size?: number } | null }

const fmtSize = (b?: number) => b == null ? '' : b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1048576).toFixed(1)} MB`
// Документная дата — date-only: через new Date() она в нью-йоркской зоне
// съезжает на день назад (STANDING-правило репозитория).
const fmtDateOnlyISO = (s?: string | null) => {
  if (!s) return ''
  const [y, m, d] = s.slice(0, 10).split('-')
  return `${Number(m)}/${Number(d)}/${y}`
}
const fmtDate = (s?: string) => s ? new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''
// Uploaded name is "{epoch}_{original}" — strip the ts prefix for display.
const cleanName = (n: string) => n.replace(/^\d{10,}_/, '')
const iconFor = (n: string) => /\.(png|jpe?g|gif|webp|heic)$/i.test(n) ? '🖼️' : /\.pdf$/i.test(n) ? '📄' : '📎'

export default function ChildDocumentsTab({ childDbId, rosterId, orgId, centerId }: {
  childDbId: string; rosterId?: string; orgId?: string; centerId?: string | null
}) {
  const dir = `children/${childDbId}`
  const listId = rosterId ?? childDbId
  const [docs, setDocs] = useState<ChildDocRow[]>([])
  const [storageNames, setStorageNames] = useState<string[]>([])
  const [types, setTypes] = useState<DocTypeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string>('')
  const inputRef = useRef<HTMLInputElement>(null)
  // Разбор файла: какой файл сейчас заводим и с какими типом/датой.
  const [filing, setFiling] = useState<{ name: string; docType: string; date: string } | null>(null)

  useEffect(() => { load() }, [childDbId, listId])
  useEffect(() => { loadDocTypes().then(setTypes) }, [])

  async function load() {
    setLoading(true)
    const [rows, { data: files }] = await Promise.all([
      loadChildDocs(listId),
      supabase.storage.from(CHILD_DOCS_BUCKET).list(dir, { limit: 100, sortBy: { column: 'created_at', order: 'desc' } }),
    ])
    setDocs(rows)
    // storage.list возвращает призрачный ".emptyFolderPlaceholder" у пустой папки
    setStorageNames((files ?? []).map(f => f.name).filter(n => n !== '.emptyFolderPlaceholder'))
    setLoading(false)
  }

  // Загрузка кладёт файл и СРАЗУ открывает разбор: тип и документная дата
  // спрашиваются здесь, пока файл в руках. Спросить их позже — значит не
  // спросить никогда: так и накопилась папка файлов без типа и без даты.
  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? [])
    if (e.target) e.target.value = ''
    let last = ''
    for (const raw of picked) {
      setBusy(`Uploading ${raw.name}…`)
      const file = await detectAndCrop(raw)
      const name = `${Date.now()}_${file.name}`
      const { error } = await supabase.storage.from(CHILD_DOCS_BUCKET).upload(`${dir}/${name}`, file, { upsert: true })
      if (error) { setBusy(`✗ ${error.message}`); await new Promise(r => setTimeout(r, 2500)); continue }
      last = name
    }
    setBusy('')
    await load()
    if (last) setFiling({ name: last, docType: types[0]?.code ?? '', date: '' })
  }

  async function fileIt() {
    if (!filing || !filing.docType || !filing.date) return
    if (!orgId) { setBusy('✗ This card has no organisation id — nothing was filed.'); return }
    setBusy('Filing…')
    const err = await fileUploadedDoc({
      orgId, centerId: centerId ?? null, rosterId: listId,
      docType: filing.docType, documentDate: filing.date,
      storagePath: `${dir}/${filing.name}`, title: cleanName(filing.name),
    })
    // Отказ здесь = файл лежит, а строки нет: ровно то состояние, из которого
    // мы выходим. Молчать про него нельзя.
    setBusy(err ? `✗ Not filed: ${err}` : '')
    if (!err) { setFiling(null); await load() }
  }

  async function signedUrl(path: string): Promise<string | null> {
    const { data, error } = await supabase.storage.from(CHILD_DOCS_BUCKET).createSignedUrl(path, 3600)
    if (error || !data?.signedUrl) {
      alert(`This document could not be opened: ${error?.message ?? 'no link was returned'}`)
      return null
    }
    return data.signedUrl
  }
  async function download(path: string) { const u = await signedUrl(path); if (u) window.open(u, '_blank') }
  async function print(path: string) {
    const u = await signedUrl(path)
    if (!u) return
    // Печать через отдельное окно: у PDF в iframe печать перехватывает вьюер
    // браузера и печатает не тот документ.
    const w = window.open(u, '_blank')
    setTimeout(() => { try { w?.print() } catch { /* браузер сам покажет вьюер */ } }, 900)
  }

  async function removeUnfiled(name: string) {
    if (!window.confirm(`Delete "${cleanName(name)}"? This cannot be undone.`)) return
    setBusy('Deleting…')
    const { error } = await supabase.storage.from(CHILD_DOCS_BUCKET).remove([`${dir}/${name}`])
    setBusy(error ? `✗ ${error.message}` : '')
    await load()
  }

  const unfiled = unfiledNames(storageNames, dir, docs)
  const typeName = (code: string) => types.find(t => t.code === code)?.name ?? code
  const btn: React.CSSProperties = { padding: '5px 12px', borderRadius: 6, border: '1.5px solid #0f4c35', background: '#fff', color: '#0f4c35', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }
  const rowBox: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e8f0e8', marginBottom: 8, background: '#fff' }

  return (
    <div>
      <ApprovedEnrollmentForms rosterId={listId} />
      <div style={{ fontSize: 13, fontWeight: 700, color: '#0f4c35', marginBottom: 12, paddingBottom: 6, borderBottom: '1.5px solid #e8f0e8' }}>Child Documents</div>

      {/* Зона догрузки работает ВСЕГДА, при любом положении настройки о сканах:
          запретить приложить документ — это не настройка, это поломка. */}
      <div onClick={() => inputRef.current?.click()}
        style={{ border: '2px dashed #c0d8c0', borderRadius: 12, padding: '20px 16px', textAlign: 'center', cursor: 'pointer', background: '#f8faf8', marginBottom: 14 }}>
        <div style={{ fontSize: 26, marginBottom: 4 }}>⤒</div>
        <div style={{ fontSize: 13, color: '#0f4c35', fontWeight: 600 }}>Click to upload a document or photo</div>
        <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 3 }}>You'll be asked what it is and the date printed on it</div>
        <input ref={inputRef} type="file" multiple accept="image/*,application/pdf" onChange={onPick} style={{ display: 'none' }} />
      </div>
      {busy && <div style={{ fontSize: 12, color: busy.startsWith('✗') ? '#dc2626' : '#0f4c35', marginBottom: 10 }}>{busy}</div>}

      {/* Разбор файла: тип из реестра + ДАТА С ДОКУМЕНТА (не сегодняшняя). */}
      {filing && (
        <div style={{ border: '1.5px solid #f0c674', background: '#fff8e6', borderRadius: 10, padding: '10px 12px', marginBottom: 12 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: '#7a4a00', marginBottom: 8 }}>
            What is “{cleanName(filing.name)}”?
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <select value={filing.docType} onChange={e => setFiling(f => f ? { ...f, docType: e.target.value } : f)}
              style={{ padding: '6px 9px', border: '1.5px solid #c0d8c0', borderRadius: 8, fontSize: 12.5, fontFamily: 'inherit', background: '#fff' }}>
              <option value="">— document type —</option>
              {types.map(t => <option key={t.code} value={t.code}>{t.name}</option>)}
            </select>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#374151' }}>
              Date ON THE DOCUMENT
              <input type="date" value={filing.date} onChange={e => setFiling(f => f ? { ...f, date: e.target.value } : f)}
                style={{ padding: '5px 8px', border: '1.5px solid #c0d8c0', borderRadius: 8, fontSize: 12.5, fontFamily: 'inherit' }} />
            </label>
            <button onClick={fileIt} disabled={!filing.docType || !filing.date}
              style={{ ...btn, background: filing.docType && filing.date ? '#0f4c35' : '#e5e7eb', color: filing.docType && filing.date ? '#fff' : '#9ca3af', borderColor: 'transparent' }}>
              File it
            </button>
            <button onClick={() => setFiling(null)} style={{ ...btn, borderColor: '#e5e7eb', color: '#6b7280' }}>Later</button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ color: '#aaa', fontSize: 13, padding: '12px 0' }}>Loading…</div>
      ) : docs.length === 0 && unfiled.length === 0 ? (
        <div style={{ color: '#aaa', fontSize: 13, padding: '16px 0', textAlign: 'center' }}>No documents on file yet.</div>
      ) : null}

      {/* ОДИН список, три источника, порядок по документной дате. */}
      {docs.map(d => (
        <div key={d.id} style={rowBox}>
          <span style={{ fontSize: 18 }}>{d.source === 'paper' ? '📄' : iconFor(d.storage_path ?? '')}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#1a2e1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {typeName(d.doc_type)}
            </div>
            <div style={{ fontSize: 11, color: '#9ca3af' }}>
              {d.valid_from ? `Document date ${fmtDateOnlyISO(d.valid_from)}` : 'No document date'}
              {d.valid_until ? ` · valid to ${fmtDateOnlyISO(d.valid_until)}` : ''}
            </div>
          </div>
          {d.source === 'paper' ? (
            // У бумаги НЕТ кнопок файла — их и нечем обслужить. Плашка говорит,
            // почему их нет, иначе строка читается как сломанная.
            <span title={d.attested_at ? `Attested ${fmtDate(d.attested_at)}` : undefined}
              style={{ fontSize: 11.5, fontWeight: 700, color: '#0f4c35', background: '#f0fff4', border: '1.5px solid #bbf7d0', borderRadius: 999, padding: '4px 10px', whiteSpace: 'nowrap' }}>
              📄 Paper form is in the safe
            </span>
          ) : hasFile(d) ? (
            <>
              <button onClick={() => download(d.storage_path!)} style={btn}>Download</button>
              <button onClick={() => print(d.storage_path!)} style={btn}>Print</button>
            </>
          ) : (
            <span style={{ fontSize: 11.5, color: '#b45309' }}>file missing</span>
          )}
        </div>
      ))}

      {/* Файлы без строки. Автоматически им тип и дату никто не проставляет:
          угадать их может только человек, открыв файл. */}
      {unfiled.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: '#b45309', marginBottom: 6 }}>
            Unfiled uploads · {unfiled.length}
            <span style={{ fontWeight: 400, color: '#9ca3af' }}> — a file with no type and no document date. Nothing is broken; tell us what it is.</span>
          </div>
          {unfiled.map(n => (
            <div key={n} style={{ ...rowBox, borderColor: '#f0c674', background: '#fffdf6' }}>
              <span style={{ fontSize: 18 }}>{iconFor(n)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1a2e1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cleanName(n)}</div>
                <div style={{ fontSize: 11, color: '#9ca3af' }}>not filed</div>
              </div>
              <button onClick={() => download(`${dir}/${n}`)} style={{ ...btn, borderColor: '#e5e7eb', color: '#6b7280' }}>Open</button>
              <button onClick={() => setFiling({ name: n, docType: types[0]?.code ?? '', date: '' })} style={btn}>File it</button>
              <button onClick={() => removeUnfiled(n)} title="Delete" style={{ padding: '5px 10px', borderRadius: 6, border: '1.5px solid #f0c0c0', background: '#fff', color: '#dc2626', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>🗑</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Step 3: approved enrollment forms with a replica → view/print the frozen original ─────────
// Lists the child's APPROVED submissions that have an original-form replica. "View original
// form" opens the frozen snapshot (or a live render if none yet). When a snapshot is missing
// (older approval / capture failed), a one-tap "Create snapshot" backfills it — same client
// capture the Approve flow uses. enrollment_submissions.child_id references roster(id); this
// resolves for roster-linked children (the enrollment path).
type ApprovedSub = { id: string; submission_type: string; form_data: any; signatures: any; reviewed_at: string | null; created_at: string; hasSnap: boolean }

// rosterId = menumaker.roster.id — this is what enrollment_submissions.child_id references
// (NOT child.child_id / the child-table link). ChildSettingsPage passes its roster row id here;
// filtering on the wrong id silently hid the section whenever roster.child_id was set.
function ApprovedEnrollmentForms({ rosterId }: { rosterId: string }) {
  const [subs, setSubs] = useState<ApprovedSub[] | null>(null)
  const [viewer, setViewer] = useState<ApprovedSub | null>(null)
  const [busyId, setBusyId] = useState<string>('')
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  async function load() {
    const { data } = await supabase.schema('menumaker').from('enrollment_submissions')
      .select('id,submission_type,form_data,signatures,signature_date,reviewed_at,created_at')
      .eq('child_id', rosterId).eq('status', 'approved')
      .order('reviewed_at', { ascending: false })
    const withReplica = (data ?? []).filter((s: any) => hasOriginalReplica(s.submission_type))
    const rows: ApprovedSub[] = []
    for (const s of withReplica as any[]) {
      const snap = await getLatestSnapshot(s.id)
      rows.push({ ...s, hasSnap: !!snap })
    }
    setSubs(rows)
  }
  useEffect(() => { load() }, [rosterId])

  async function backfill(s: ApprovedSub) {
    setBusyId(s.id); setMsg(null)
    try {
      const res = await captureAndUploadSnapshot({ submissionId: s.id, submissionType: s.submission_type, formData: s.form_data, signatures: s.signatures })
      await load()
      // OPTIMISTIC flip — we KNOW it persisted (res returned with a content_sha). Don't depend on
      // the read-back: an authenticated getLatestSnapshot right after the service-role write can
      // race and return null, leaving the row stale ("no snapshot yet") — which made the badge lie
      // and invited duplicate taps. The row now flips to "🔒 Snapshot on file" immediately (and the
      // "Create snapshot" button disappears), so the artifact declares its source without a reload.
      setSubs(prev => prev ? prev.map(x => x.id === s.id ? { ...x, hasSnap: true } : x) : prev)
      setMsg({ kind: 'ok', text: `🔒 Snapshot on file · Snapshot at Approve · sha ${String(res?.content_sha ?? '').slice(0, 10)}…` })
    } catch (e: any) {
      setMsg({ kind: 'err', text: `Snapshot failed: ${e?.message ?? String(e)}` })
    } finally {
      setBusyId('')
    }
  }

  if (!subs || subs.length === 0) return null
  const btn: React.CSSProperties = { padding: '5px 12px', borderRadius: 6, border: '1.5px solid #0f4c35', background: '#fff', color: '#0f4c35', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#0f4c35', marginBottom: 12, paddingBottom: 6, borderBottom: '1.5px solid #e8f0e8' }}>Enrollment forms (approved)</div>
      {msg && (
        <div style={{ fontSize: 12, fontWeight: 600, padding: '8px 12px', borderRadius: 8, marginBottom: 8,
          background: msg.kind === 'ok' ? '#f0fff4' : '#fef2f2', color: msg.kind === 'ok' ? '#0f4c35' : '#dc2626',
          border: `1.5px solid ${msg.kind === 'ok' ? '#bbf7d0' : '#fecaca'}` }}>{msg.text}</div>
      )}
      {subs.map(s => (
        <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e8f0e8', marginBottom: 8, background: '#fff' }}>
          <span style={{ fontSize: 18 }}>📄</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#1a2e1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{originalReplica(s.submission_type)?.title ?? s.submission_type}</div>
            <div style={{ fontSize: 11, color: s.hasSnap ? '#0f4c35' : '#b45309' }}>{s.hasSnap ? '🔒 Snapshot on file' : 'Live render — no snapshot yet'}</div>
          </div>
          {!s.hasSnap && (
            <button onClick={() => backfill(s)} disabled={busyId === s.id}
              style={{ ...btn, borderColor: '#e5e7eb', color: '#6b7280' }}>{busyId === s.id ? 'Capturing…' : 'Create snapshot'}</button>
          )}
          <button onClick={() => setViewer(s)} style={btn}>View original form</button>
        </div>
      ))}
      {viewer && (
        <ApprovedFormViewer submissionId={viewer.id} submissionType={viewer.submission_type}
          formData={viewer.form_data} signatures={viewer.signatures}
          signatureDate={documentDateOf(viewer as any)} onClose={() => setViewer(null)} />
      )}
    </div>
  )
}
