import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

const CENTER_ID = '881ef4ce-1a27-4d3b-aa60-59d2a307bf2b'
const BUCKET = 'recipe-documents'

const DOC_TYPE_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  standardized_recipe: { label: 'Standardized Recipe', color: '#0f4c35', bg: '#f0fff4' },
  cn_label:            { label: 'CN Label',             color: '#2980b9', bg: '#f0f6ff' },
  product_spec:        { label: 'Product Spec',         color: '#7c3aed', bg: '#f5f3ff' },
  other:               { label: 'Other',                color: '#666',    bg: '#f5f5f5' },
}

interface DocRow {
  id: string
  name: string
  file_path: string
  doc_type: string
  uploaded_at: string
}

export default function RecipeDocsPanel({ recipeId }: { recipeId: string }) {
  const [docs, setDocs]         = useState<DocRow[]>([])
  const [loading, setLoading]   = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadMsg, setUploadMsg] = useState<string | null>(null)
  const [docType, setDocType]   = useState<string>('standardized_recipe')
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    const { data } = await supabase
      .schema('menumaker').from('recipe_documents')
      .select('id,name,file_path,doc_type,uploaded_at')
      .eq('recipe_id', recipeId)
      .eq('center_id', CENTER_ID)
      .order('uploaded_at', { ascending: false })
    setDocs(data ?? [])
    setLoading(false)
  }, [recipeId])

  useEffect(() => { load() }, [load])

  const download = async (filePath: string, name: string) => {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(filePath, 60)
    if (!data?.signedUrl) return
    const a = document.createElement('a')
    a.href = data.signedUrl
    a.download = name
    a.click()
  }

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadMsg(null)

    const ext = file.name.split('.').pop()
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const filePath = `${CENTER_ID}/${recipeId}/${Date.now()}_${safeName}`

    const { error: uploadErr } = await supabase.storage.from(BUCKET).upload(filePath, file)
    if (uploadErr) {
      setUploadMsg(`Upload failed: ${uploadErr.message}`)
      setUploading(false)
      return
    }

    const { error: dbErr } = await supabase.schema('menumaker').from('recipe_documents').insert({
      recipe_id: recipeId,
      center_id: CENTER_ID,
      name: file.name,
      file_path: filePath,
      doc_type: docType,
    })
    if (dbErr) {
      setUploadMsg(`Saved file but failed to record: ${dbErr.message}`)
    } else {
      setUploadMsg('Uploaded successfully')
      await load()
    }
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
    setTimeout(() => setUploadMsg(null), 3000)
  }

  const remove = async (doc: DocRow) => {
    await supabase.storage.from(BUCKET).remove([doc.file_path])
    await supabase.schema('menumaker').from('recipe_documents').delete().eq('id', doc.id)
    setDocs(d => d.filter(x => x.id !== doc.id))
  }

  if (loading) return <div style={{ fontSize: 13, color: '#aaa', padding: '8px 0' }}>Loading…</div>

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <select value={docType} onChange={e => setDocType(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid #ddd', fontSize: 12, fontFamily: 'inherit' }}>
          {Object.entries(DOC_TYPE_LABELS).map(([v, { label }]) => (
            <option key={v} value={v}>{label}</option>
          ))}
        </select>
        <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.jpg,.png,.xlsx"
          onChange={upload} style={{ display: 'none' }} />
        <button onClick={() => fileRef.current?.click()} disabled={uploading}
          style={{ padding: '6px 14px', borderRadius: 7, border: 'none', background: '#0f4c35', color: '#fff', fontSize: 12, fontWeight: 600, cursor: uploading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: uploading ? 0.6 : 1 }}>
          {uploading ? 'Uploading…' : '+ Upload Document'}
        </button>
        {uploadMsg && (
          <span style={{ fontSize: 12, color: uploadMsg.startsWith('Upload') ? '#c0392b' : '#0f4c35', fontWeight: 500 }}>
            {uploadMsg}
          </span>
        )}
      </div>

      {docs.length === 0 ? (
        <div style={{ padding: '16px', borderRadius: 8, background: '#f9fbf9', border: '1px solid #e4e8e4', fontSize: 13, color: '#aaa', textAlign: 'center' }}>
          No documents uploaded yet. Upload a standardized recipe card, CN label, or product spec.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {docs.map(doc => {
            const meta = DOC_TYPE_LABELS[doc.doc_type] ?? DOC_TYPE_LABELS.other
            return (
              <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, background: '#fff', border: '1px solid #e8ece9' }}>
                <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: meta.bg, color: meta.color, fontWeight: 600, whiteSpace: 'nowrap' }}>
                  {meta.label}
                </span>
                <span style={{ fontSize: 13, color: '#333', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {doc.name}
                </span>
                <span style={{ fontSize: 11, color: '#aaa', whiteSpace: 'nowrap' }}>
                  {new Date(doc.uploaded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
                <button onClick={() => download(doc.file_path, doc.name)}
                  style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #0f4c35', background: '#fff', color: '#0f4c35', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                  ↓ Download
                </button>
                <button onClick={() => remove(doc)}
                  title="Delete"
                  style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #f0d0d0', background: '#fff', color: '#c0392b', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                  ✕
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
