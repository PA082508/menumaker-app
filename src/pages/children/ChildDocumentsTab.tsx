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

type FileRow = { name: string; id?: string; created_at?: string; metadata?: { size?: number } | null }

const fmtSize = (b?: number) => b == null ? '' : b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1048576).toFixed(1)} MB`
const fmtDate = (s?: string) => s ? new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''
// Uploaded name is "{epoch}_{original}" — strip the ts prefix for display.
const cleanName = (n: string) => n.replace(/^\d{10,}_/, '')
const iconFor = (n: string) => /\.(png|jpe?g|gif|webp|heic)$/i.test(n) ? '🖼️' : /\.pdf$/i.test(n) ? '📄' : '📎'

export default function ChildDocumentsTab({ childDbId }: { childDbId: string }) {
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
