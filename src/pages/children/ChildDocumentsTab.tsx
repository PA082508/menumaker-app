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
import ApprovedFormViewer from '@/pages/enrollment/ApprovedFormViewer'

type FileRow = { name: string; id?: string; created_at?: string; metadata?: { size?: number } | null }

const fmtSize = (b?: number) => b == null ? '' : b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1048576).toFixed(1)} MB`
const fmtDate = (s?: string) => s ? new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''
// Uploaded name is "{epoch}_{original}" — strip the ts prefix for display.
const cleanName = (n: string) => n.replace(/^\d{10,}_/, '')
const iconFor = (n: string) => /\.(png|jpe?g|gif|webp|heic)$/i.test(n) ? '🖼️' : /\.pdf$/i.test(n) ? '📄' : '📎'

export default function ChildDocumentsTab({ childDbId, rosterId }: { childDbId: string; rosterId?: string }) {
  const dir = `children/${childDbId}`
  const [files, setFiles] = useState<FileRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string>('')   // status line during upload/delete
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { load() }, [childDbId])

  async function load() {
    setLoading(true)
    const { data } = await supabase.storage.from('org-files').list(dir, {
      limit: 100, sortBy: { column: 'created_at', order: 'desc' },
    })
    // storage.list returns a phantom ".emptyFolderPlaceholder" for empty dirs — drop it
    setFiles((data ?? []).filter(f => f.name !== '.emptyFolderPlaceholder') as FileRow[])
    setLoading(false)
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? [])
    if (e.target) e.target.value = ''   // allow re-picking the same file
    for (const raw of picked) {
      setBusy(`Uploading ${raw.name}…`)
      const file = await detectAndCrop(raw)
      const path = `${dir}/${Date.now()}_${file.name}`
      const { error } = await supabase.storage.from('org-files').upload(path, file, { upsert: true })
      if (error) { setBusy(`✗ ${error.message}`); await new Promise(r => setTimeout(r, 2500)) }
    }
    setBusy('')
    load()
  }

  async function view(name: string) {
    const { data } = await supabase.storage.from('org-files').createSignedUrl(`${dir}/${name}`, 3600)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  async function remove(name: string) {
    if (!window.confirm(`Delete "${cleanName(name)}"? This cannot be undone.`)) return
    setBusy(`Deleting…`)
    await supabase.storage.from('org-files').remove([`${dir}/${name}`])
    setBusy('')
    load()
  }

  return (
    <div>
      {/* Step 3: approved enrollment forms → view/print the frozen original (child → document → print). */}
      <ApprovedEnrollmentForms rosterId={rosterId ?? childDbId} />
      <div style={{ fontSize: 13, fontWeight: 700, color: '#0f4c35', marginBottom: 12, paddingBottom: 6, borderBottom: '1.5px solid #e8f0e8' }}>Child Documents</div>

      {/* Upload dropzone */}
      <div onClick={() => inputRef.current?.click()}
        style={{ border: '2px dashed #c0d8c0', borderRadius: 12, padding: '20px 16px', textAlign: 'center', cursor: 'pointer', background: '#f8faf8', marginBottom: 14 }}>
        <div style={{ fontSize: 26, marginBottom: 4 }}>⤒</div>
        <div style={{ fontSize: 13, color: '#0f4c35', fontWeight: 600 }}>Click to upload a document or photo</div>
        <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 3 }}>Photos of forms are auto-cropped · PDF, images accepted</div>
        <input ref={inputRef} type="file" multiple accept="image/*,application/pdf" onChange={onPick} style={{ display: 'none' }} />
      </div>
      {busy && <div style={{ fontSize: 12, color: busy.startsWith('✗') ? '#dc2626' : '#0f4c35', marginBottom: 10 }}>{busy}</div>}

      {/* File list */}
      {loading ? (
        <div style={{ color: '#aaa', fontSize: 13, padding: '12px 0' }}>Loading…</div>
      ) : files.length === 0 ? (
        <div style={{ color: '#aaa', fontSize: 13, padding: '16px 0', textAlign: 'center' }}>No documents on file yet.</div>
      ) : files.map(f => (
        <div key={f.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e8f0e8', marginBottom: 8, background: '#fff' }}>
          <span style={{ fontSize: 18 }}>{iconFor(f.name)}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#1a2e1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cleanName(f.name)}</div>
            <div style={{ fontSize: 11, color: '#9ca3af' }}>{fmtDate(f.created_at)}{f.metadata?.size ? ` · ${fmtSize(f.metadata.size)}` : ''}</div>
          </div>
          <button onClick={() => view(f.name)} style={{ padding: '5px 12px', borderRadius: 6, border: '1.5px solid #0f4c35', background: '#fff', color: '#0f4c35', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}>View</button>
          <button onClick={() => remove(f.name)} title="Delete" style={{ padding: '5px 10px', borderRadius: 6, border: '1.5px solid #f0c0c0', background: '#fff', color: '#dc2626', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>🗑</button>
        </div>
      ))}
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
      .select('id,submission_type,form_data,signatures,reviewed_at,created_at')
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
      // Visible result — never a silent no-op. A persisted snapshot shows its sha here and the
      // row flips to "🔒 Snapshot on file".
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
          formData={viewer.form_data} signatures={viewer.signatures} onClose={() => setViewer(null)} />
      )}
    </div>
  )
}
