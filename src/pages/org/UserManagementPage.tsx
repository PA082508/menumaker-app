// Organization User Management — read-only directory of org users with their
// roles and per-center access. Data comes from menumaker.org_users(), which is
// guarded server-side to admin/office_manager callers. Editing (roles, access,
// invites) is a planned follow-up.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/contexts/OrgContext'

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
  const { org, isOrgAdmin } = useOrg()
  const [users, setUsers] = useState<OrgUser[]>([])
  const [loading, setLoading] = useState(true)

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
  }, [org?.id])

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
      <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 26, color: '#0a3320', margin: '6px 0 2px' }}>
        User Management
      </h1>
      <div style={{ fontSize: 13, color: '#888', marginBottom: 22 }}>
        {loading ? 'Loading…' : `${users.length} user${users.length !== 1 ? 's' : ''} in ${org?.name ?? 'organization'}`}
        <span style={{ marginLeft: 10, fontSize: 11, color: '#b06a00', background: '#fff4e5', padding: '2px 8px', borderRadius: 12 }}>
          Read-only
        </span>
      </div>

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
