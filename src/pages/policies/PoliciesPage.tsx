import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/contexts/OrgContext'
import { useAuth } from '@/hooks/useAuth'

/**
 * Policies (Director's App) — manage versioned policy_documents and see acknowledgment
 * coverage. Announce → activate → supersede lifecycle (director / office_manager).
 * Policy body text is the source-of-truth **file** in docs/policies/*.md — imported
 * into a version's body here (no in-app text editor).
 */

// Bundled policy source files (source of truth for body text).
const POLICY_FILES = import.meta.glob('/docs/policies/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const fileList = Object.entries(POLICY_FILES).map(([path, body]) => ({ name: path.split('/').pop()!, body }))

interface Policy {
  id: string; key: string; version: string; title: string; body: string | null
  status: 'draft' | 'announced' | 'active' | 'retired'
  effective_date: string | null; announced_at: string | null; activated_at: string | null
}
interface Family { person_id: string; person_name: string }

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  draft:     { bg: '#f3f4f6', color: '#6b7280' },
  announced: { bg: '#fff8e6', color: '#b45309' },
  active:    { bg: '#f0fff4', color: '#0f7a3d' },
  retired:   { bg: '#fbeaea', color: '#b91c1c' },
}

export default function PoliciesPage() {
  const { org, orgRole } = useOrg()
  const { roles } = useAuth()
  const canManage = ['director', 'office_manager', 'admin'].includes(orgRole ?? '') ||
    (roles as string[]).some(r => ['director', 'office_manager', 'admin'].includes(r))

  const [policies, setPolicies] = useState<Policy[]>([])
  const [families, setFamilies] = useState<Family[]>([])   // active trusted-person "families"
  const [signed, setSigned] = useState<Set<string>>(new Set())  // person_ids who signed the active addendum
  const [activeAddendum, setActiveAddendum] = useState<Policy | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [showNonSigners, setShowNonSigners] = useState(false)
  const [importFor, setImportFor] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    const { data: pol } = await supabase.schema('menumaker').from('policy_documents')
      .select('id,key,version,title,body,status,effective_date,announced_at,activated_at')
      .order('key').order('version', { ascending: false })
    const list = (pol ?? []) as Policy[]
    setPolicies(list)
    const active = list.find(p => p.key === 'safepass_addendum' && p.status === 'active') ?? null
    setActiveAddendum(active)

    // Coverage: families = distinct active trusted-person phones; signed = agreements on the active version.
    const { data: tp } = await supabase.schema('menumaker').from('safepass_trusted_persons')
      .select('phone,person_name').eq('org_id', org?.id ?? '').eq('is_active', true)
    const famMap = new Map<string, string>()
    for (const t of (tp ?? []) as any[]) if (t.phone) famMap.set(t.phone, t.person_name ?? t.phone)
    setFamilies([...famMap].map(([person_id, person_name]) => ({ person_id, person_name })))

    if (active) {
      const { data: sig } = await supabase.schema('menumaker').from('safepass_agreements')
        .select('person_id').eq('org_id', org?.id ?? '').eq('person_type', 'parent')
        .eq('policy_code', 'safepass_addendum').eq('document_version', active.version)
      setSigned(new Set((sig ?? []).map((s: any) => s.person_id)))
    } else setSigned(new Set())
    setLoading(false)
  }
  useEffect(() => { if (org?.id) load() /* eslint-disable-next-line */ }, [org?.id])

  const setStatus = async (p: Policy, status: Policy['status']) => {
    setBusy(p.id)
    // Activating supersedes any currently-active version of the same key.
    if (status === 'active') {
      await supabase.schema('menumaker').from('policy_documents')
        .update({ status: 'retired' }).eq('key', p.key).eq('status', 'active').neq('id', p.id)
    }
    const patch: any = { status }
    if (status === 'announced') patch.announced_at = new Date().toISOString()
    if (status === 'active') patch.activated_at = new Date().toISOString()
    const { error } = await supabase.schema('menumaker').from('policy_documents').update(patch).eq('id', p.id)
    setBusy(null)
    if (error) { alert('Failed: ' + error.message); return }
    load()
  }

  const importBody = async (p: Policy, fileName: string) => {
    const f = fileList.find(x => x.name === fileName)
    if (!f) return
    setBusy(p.id)
    const { error } = await supabase.schema('menumaker').from('policy_documents').update({ body: f.body }).eq('id', p.id)
    setBusy(null); setImportFor(null)
    if (error) { alert('Failed: ' + error.message); return }
    load()
  }

  const nonSigners = useMemo(
    () => families.filter(f => !signed.has(f.person_id)),
    [families, signed])

  if (loading) return <Msg>Loading policies…</Msg>

  return (
    <div style={{ padding: '28px 32px', fontFamily: "'DM Sans',sans-serif", background: '#f4f6f4', minHeight: '100vh' }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Serif+Display&display=swap" rel="stylesheet" />
      <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 26, color: '#0a3320', marginBottom: 2 }}>Policies</div>
      <div style={{ fontSize: 12, color: '#888', marginBottom: 22 }}>Versioned policy documents · announce → activate → supersede</div>

      {/* Coverage — active SafePass addendum */}
      <div style={{ background: '#fff', border: '1px solid #e0e8e0', borderRadius: 12, padding: '16px 20px', marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#0f4c35', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
          SafePass addendum coverage
        </div>
        {activeAddendum ? (
          <>
            <div style={{ fontSize: 14, color: '#374151' }}>
              <strong style={{ color: '#0f4c35' }}>{signed.size}</strong> of <strong>{families.length}</strong> active families signed the current version (<strong>v{activeAddendum.version}</strong>).
            </div>
            {nonSigners.length > 0 && (
              <button onClick={() => setShowNonSigners(v => !v)} style={{ marginTop: 8, background: 'none', border: 'none', color: '#0f4c35', fontSize: 13, cursor: 'pointer', padding: 0, fontFamily: 'inherit', fontWeight: 600 }}>
                {showNonSigners ? '▾' : '▸'} {nonSigners.length} not signed
              </button>
            )}
            {showNonSigners && (
              <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {nonSigners.map(f => (
                  <span key={f.person_id} style={{ fontSize: 12, background: '#fbeaea', color: '#b91c1c', padding: '3px 10px', borderRadius: 20 }}>
                    {f.person_name} · {f.person_id}
                  </span>
                ))}
              </div>
            )}
          </>
        ) : (
          <div style={{ fontSize: 13, color: '#b45309' }}>No active SafePass addendum version.</div>
        )}
      </div>

      {/* Policy versions */}
      <div style={{ background: '#fff', border: '1px solid #e0e8e0', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.6fr 0.8fr 1fr 1.6fr', padding: '10px 18px', background: '#f0f4f1', borderBottom: '1px solid #e0e8e0' }}>
          {['Policy', 'Version', 'Status', 'Effective', 'Actions'].map(h => (
            <div key={h} style={{ fontSize: 10, fontWeight: 700, color: '#0f4c35', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</div>
          ))}
        </div>
        {policies.length === 0 && <Msg>No policies yet.</Msg>}
        {policies.map((p, i) => {
          const ss = STATUS_STYLE[p.status]
          const hasBody = !!p.body && !p.body.startsWith('[')
          return (
            <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.6fr 0.8fr 1fr 1.6fr', padding: '11px 18px', borderBottom: '1px solid #f0f4f1', alignItems: 'center', background: i % 2 ? '#fafbfa' : '#fff' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1a2e1a' }}>{p.title}</div>
                <div style={{ fontSize: 11, color: '#888' }}>{p.key} · body {hasBody ? '✓ from file' : '⚠ placeholder'}</div>
              </div>
              <div style={{ fontSize: 13, color: '#374151' }}>v{p.version}</div>
              <div><span style={{ fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 20, background: ss.bg, color: ss.color }}>{p.status}</span></div>
              <div style={{ fontSize: 12, color: '#555' }}>{p.effective_date ?? '—'}</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                {canManage ? (
                  <>
                    {p.status === 'draft' && <Act onClick={() => setStatus(p, 'announced')} busy={busy === p.id}>Announce</Act>}
                    {(p.status === 'draft' || p.status === 'announced') && <Act onClick={() => setStatus(p, 'active')} busy={busy === p.id}>Activate</Act>}
                    {p.status === 'active' && <Act onClick={() => setStatus(p, 'retired')} busy={busy === p.id}>Supersede</Act>}
                    {importFor === p.id ? (
                      <select autoFocus defaultValue="" onChange={e => e.target.value && importBody(p, e.target.value)}
                        style={{ fontSize: 12, padding: '4px 6px', borderRadius: 6, border: '1px solid #c0d8c0', fontFamily: 'inherit' }}>
                        <option value="" disabled>{fileList.length ? 'Import from…' : 'no files in docs/policies/'}</option>
                        {fileList.map(f => <option key={f.name} value={f.name}>{f.name}</option>)}
                      </select>
                    ) : (
                      <Act onClick={() => setImportFor(p.id)} busy={false}>Import body</Act>
                    )}
                  </>
                ) : <span style={{ fontSize: 11, color: '#aaa' }}>view only</span>}
              </div>
            </div>
          )
        })}
      </div>
      <div style={{ fontSize: 11, color: '#aaa', marginTop: 10 }}>
        Body text comes from <code>docs/policies/*.md</code> (source of truth). Drop a policy file there, then <em>Import body</em> into the version.
      </div>
    </div>
  )
}

function Act({ children, onClick, busy }: { children: React.ReactNode; onClick: () => void; busy: boolean }) {
  return (
    <button onClick={onClick} disabled={busy} style={{ fontSize: 12, fontWeight: 600, padding: '5px 11px', borderRadius: 7, border: '1.5px solid #c0d8c0', background: '#fff', color: '#0f4c35', cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit' }}>
      {busy ? '…' : children}
    </button>
  )
}
function Msg({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: 40, fontFamily: "'DM Sans',sans-serif", color: '#666', fontSize: 14 }}>{children}</div>
}
