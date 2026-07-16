// Organization User Management — read-only directory of org users with their
// roles and per-center access. Data comes from menumaker.org_users(), which is
// guarded server-side to admin/office_manager callers. Editing (roles, access,
// invites) is a planned follow-up.
import { useEffect, useState, type CSSProperties } from 'react'
import Button from '@/components/ui/Button'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useOrg, type Center } from '@/contexts/OrgContext'

interface OrgUser {
  user_id: string
  email: string
  membership_role: string | null
  functional_roles: string[]
  centers: string[]
}

const ROLE_COLOR: Record<string, string> = {
  admin: '#8e44ad', office_manager: '#2980b9', director: '#0f4c35',
  cook: '#1a6b4a', cacfp_inspector: '#8e44ad', accountant: '#c0392b',
  driver: '#e67e22', purchaser: '#16a085',
}
const short = (n: string) => n.replace(/^Play Academy\s+/i, '').trim()
const titleCase = (r: string) => r.split('_').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')

function Badge({ role }: { role: string }) {
  const c = ROLE_COLOR[role] || '#666'
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
      background: c + '18', color: c, border: `1px solid ${c}40`, marginRight: 4, marginBottom: 2,
    }}>
      {titleCase(role)}
    </span>
  )
}

export default function UserManagementPage() {
  const { org, isOrgAdmin, centers } = useOrg()
  const [users, setUsers] = useState<OrgUser[]>([])
  const [loading, setLoading] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)
  const [showAdd, setShowAdd] = useState(false)

  useEffect(() => {
    if (!org?.id) return
    let cancelled = false
    setLoading(true)
    ;(async () => {
      const { data } = await (supabase.schema('menumaker').rpc as any)('org_users', { p_org_id: org.id })
      if (cancelled) return
      setUsers((data ?? []) as OrgUser[])
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [org?.id, reloadKey])

  if (!isOrgAdmin) {
    return (
      <div style={{ padding: 40, fontFamily: "'DM Sans', sans-serif", color: '#666' }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>🔒</div>
        User Management is available to organization admins only.
      </div>
    )
  }

  const centerLabel = (u: OrgUser) => {
    if (u.centers.length) return u.centers.map(short).join(' · ')
    if (u.membership_role === 'admin' || u.membership_role === 'office_manager') return 'All centers'
    return '—'
  }

  return (
    <div style={{ padding: '28px 32px', fontFamily: "'DM Sans', sans-serif", maxWidth: 1000 }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Serif+Display&display=swap" rel="stylesheet"/>

      <Link to="/dashboard" style={{ fontSize: 12, color: '#1a6b4a', textDecoration: 'none' }}>← Organization</Link>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 26, color: '#0a3320', margin: '6px 0 2px' }}>
            User Management
          </h1>
          <div style={{ fontSize: 13, color: '#888', marginBottom: 22 }}>
            {loading ? 'Loading…' : `${users.length} user${users.length !== 1 ? 's' : ''} in ${org?.name ?? 'organization'}`}
          </div>
        </div>
        <Button variant="primary" onClick={() => setShowAdd(true)} style={{ marginTop: 8 }}>＋ Add director / cook</Button>
      </div>

      {showAdd && (
        <AddUserModal
          orgName={org?.name ?? 'organization'}
          centers={centers}
          onClose={() => setShowAdd(false)}
          onCreated={() => setReloadKey(k => k + 1)}
        />
      )}

      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e8e8e8', overflow: 'hidden' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '2fr 1.6fr 1.4fr', gap: 12, padding: '12px 18px',
          background: '#0a3320', color: '#7ee8b0', fontSize: 11, fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: '0.05em',
        }}>
          <div>Email</div><div>Roles</div><div>Center access</div>
        </div>

        {loading ? (
          <div style={{ padding: 28, textAlign: 'center', color: '#aaa', fontSize: 13 }}>Loading users…</div>
        ) : users.length === 0 ? (
          <div style={{ padding: 28, textAlign: 'center', color: '#aaa', fontSize: 13 }}>No users found.</div>
        ) : (
          users.map((u, i) => {
            // De-dupe membership role into the functional-role badge list.
            const roles = Array.from(new Set([u.membership_role, ...u.functional_roles].filter(Boolean) as string[]))
            return (
              <div key={u.user_id} style={{
                display: 'grid', gridTemplateColumns: '2fr 1.6fr 1.4fr', gap: 12,
                padding: '13px 18px', alignItems: 'center', fontSize: 13,
                borderTop: i === 0 ? 'none' : '1px solid #f0f0f0',
              }}>
                <div style={{ color: '#1a1a1a', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.email}</div>
                <div>{roles.length ? roles.map(r => <Badge key={r} role={r} />) : <span style={{ color: '#bbb' }}>—</span>}</div>
                <div style={{ color: '#555' }}>{centerLabel(u)}</div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

// ─── Add director / cook ──────────────────────────────────────────────────────
// Calls the `provision-access` edge function (admin/office_manager only, enforced
// server-side). Creates the login + org membership + per-center functional role +
// per-center access, then shows the credentials ONCE for the admin to hand over.
function AddUserModal({
  orgName, centers, onClose, onCreated,
}: {
  orgName: string
  centers: Center[]
  onClose: () => void
  onCreated: () => void
}) {
  const [email, setEmail] = useState('')
  const [category, setCategory] = useState<'director' | 'cook'>('director')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [autogen, setAutogen] = useState(true)
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ email: string; password: string; category: string } | null>(null)

  const toggle = (id: string) =>
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  function validate(): string | null {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return 'Enter a valid email.'
    if (selected.size === 0) return 'Pick at least one center.'
    if (!autogen && password.length < 8) return 'Password must be at least 8 characters (or auto-generate).'
    return null
  }

  async function handleSubmit() {
    setError(null)
    const v = validate()
    if (v) { setError(v); return }
    setSubmitting(true)
    try {
      const { data, error: fnError } = await supabase.functions.invoke('provision-access', {
        body: {
          email: email.trim(),
          category,                                  // lowercased server-side too
          center_ids: Array.from(selected),
          ...(autogen ? {} : { password }),          // omit → function generates a temp one
        },
      })
      if (fnError) {
        let msg = fnError.message || 'Could not create the account.'
        try {
          const j = await (fnError as any)?.context?.json?.()
          if (j?.error) msg = j.error
        } catch { /* keep default */ }
        setError(/exists|существует|занят/i.test(msg) ? 'An account with this email already exists.' : msg)
        return
      }
      if (data?.error) { setError(data.error); return }
      if (data?.ok) {
        setResult({ email: email.trim(), password: data.temp_password ?? password, category })
        onCreated()
      } else {
        setError('Could not create the account.')
      }
    } catch (e: any) {
      setError(e?.message || 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const overlay: CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(10,30,20,0.45)', zIndex: 1000,
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
  }
  const card: CSSProperties = {
    background: '#fff', borderRadius: 16, width: 'min(460px, 100%)', maxHeight: '90vh',
    overflow: 'auto', padding: 24, fontFamily: "'DM Sans', sans-serif",
    boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
  }
  const label: CSSProperties = { fontSize: 12, fontWeight: 600, color: '#0a3320', display: 'block', margin: '14px 0 6px' }
  const input: CSSProperties = {
    width: '100%', padding: '9px 11px', borderRadius: 9, border: '1px solid #d6d6d6',
    fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box',
  }

  // ── Success view: show credentials once ──
  if (result) {
    return (
      <div style={overlay} onClick={onClose}>
        <div style={card} onClick={e => e.stopPropagation()}>
          <div style={{ fontSize: 30 }}>✅</div>
          <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 21, color: '#0a3320', margin: '4px 0 4px' }}>
            {result.category === 'director' ? 'Director' : 'Cook'} account created
          </h2>
          <div style={{ fontSize: 13, color: '#777', marginBottom: 16 }}>
            Give these to the person now — the password is shown <b>only this once</b>. They can change it after logging in.
          </div>
          <div style={{ background: '#f4f9f6', border: '1px solid #d9ece2', borderRadius: 11, padding: 14, fontSize: 14 }}>
            <div style={{ color: '#666', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Email</div>
            <div style={{ fontFamily: 'monospace', fontSize: 15, marginBottom: 10, userSelect: 'all' }}>{result.email}</div>
            <div style={{ color: '#666', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Temporary password</div>
            <div style={{ fontFamily: 'monospace', fontSize: 17, fontWeight: 700, color: '#0f4c35', userSelect: 'all' }}>{result.password}</div>
          </div>
          <button
            onClick={() => { navigator.clipboard?.writeText(`${result.email} / ${result.password}`).catch(() => {}) }}
            style={{ ...input, cursor: 'pointer', marginTop: 12, background: '#f0f0f0', fontWeight: 600 }}>
            📋 Copy email + password
          </button>
          <button
            onClick={onClose}
            style={{ width: '100%', marginTop: 10, padding: '10px', borderRadius: 9, border: 'none', cursor: 'pointer', background: '#0f4c35', color: '#fff', fontSize: 14, fontWeight: 600 }}>
            Done
          </button>
        </div>
      </div>
    )
  }

  // ── Form view ──
  return (
    <div style={overlay} onClick={submitting ? undefined : onClose}>
      <div style={card} onClick={e => e.stopPropagation()}>
        <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 21, color: '#0a3320', margin: '0 0 2px' }}>
          Add a login
        </h2>
        <div style={{ fontSize: 12, color: '#888' }}>in {orgName}</div>

        <label style={label}>Email</label>
        <input style={input} type="email" autoFocus value={email} placeholder="person@example.com"
          onChange={e => setEmail(e.target.value)} />

        <label style={label}>Role</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['director', 'cook'] as const).map(c => (
            <button key={c} onClick={() => setCategory(c)}
              style={{
                flex: 1, padding: '9px', borderRadius: 9, cursor: 'pointer', fontSize: 13, fontWeight: 600,
                border: category === c ? '2px solid #0f4c35' : '1px solid #d6d6d6',
                background: category === c ? '#eef7f2' : '#fff', color: '#0a3320',
              }}>
              {c === 'director' ? 'Director' : 'Cook'}
            </button>
          ))}
        </div>

        <label style={label}>Center access {selected.size > 0 && <span style={{ color: '#888', fontWeight: 400 }}>· {selected.size} selected</span>}</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {centers.length === 0 && <div style={{ fontSize: 13, color: '#bbb' }}>No centers available.</div>}
          {centers.map(c => (
            <label key={c.id} style={{
              display: 'flex', alignItems: 'center', gap: 9, padding: '8px 11px', borderRadius: 9, cursor: 'pointer', fontSize: 14,
              border: selected.has(c.id) ? '1px solid #0f4c35' : '1px solid #ececec',
              background: selected.has(c.id) ? '#f4f9f6' : '#fff',
            }}>
              <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
              {c.name}
            </label>
          ))}
        </div>

        <label style={{ ...label, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginTop: 16 }}>
          <input type="checkbox" checked={autogen} onChange={e => setAutogen(e.target.checked)} />
          Auto-generate a temporary password
        </label>
        {!autogen && (
          <input style={input} type="text" value={password} placeholder="At least 8 characters"
            onChange={e => setPassword(e.target.value)} />
        )}

        {error && (
          <div style={{ marginTop: 14, padding: '9px 12px', borderRadius: 9, background: '#fdeaea', color: '#b02525', fontSize: 13 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button onClick={onClose} disabled={submitting}
            style={{ flex: 1, padding: '10px', borderRadius: 9, border: '1px solid #d6d6d6', cursor: 'pointer', background: '#fff', fontSize: 14, fontWeight: 600, color: '#555' }}>
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={submitting}
            style={{ flex: 2, padding: '10px', borderRadius: 9, border: 'none', cursor: submitting ? 'default' : 'pointer', background: submitting ? '#9bbcac' : '#0f4c35', color: '#fff', fontSize: 14, fontWeight: 600 }}>
            {submitting ? 'Creating…' : 'Create account'}
          </button>
        </div>
      </div>
    </div>
  )
}
