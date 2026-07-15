import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useAuth } from '@/hooks/useAuth'
import { getInstructionDocs, docVisibleForRole, type InstructionDoc } from '@/lib/instructionsDocs'

/**
 * Instructions — permanent, in-app documentation rendered from
 * docs/instructions/*.md. Left TOC by module, heading search, role filtering
 * (?role= like the Help pages, else the signed-in user's roles), and video
 * support (frontmatter `video:` or a `![video](url)` in the body).
 */

const GREEN = '#0f4c35'

// ── video helpers ──────────────────────────────────────────────────────────
function youTubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{11})/)
  return m ? m[1] : null
}
function isVideoUrl(url: string): boolean {
  return !!youTubeId(url) || /\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(url)
}
function VideoEmbed({ url }: { url: string }) {
  const yt = youTubeId(url)
  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: 720, aspectRatio: '16 / 9', margin: '12px 0', borderRadius: 10, overflow: 'hidden', background: '#000' }}>
      {yt ? (
        <iframe
          src={`https://www.youtube.com/embed/${yt}`} title="Video" allowFullScreen
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        />
      ) : (
        <video controls src={url} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
      )}
    </div>
  )
}

// ── markdown component overrides ───────────────────────────────────────────
const MD_COMPONENTS = {
  // `![video](url)` in the body → embedded player; other images render normally.
  img: ({ src = '', alt = '' }: any) =>
    alt.toLowerCase() === 'video' || isVideoUrl(src)
      ? <VideoEmbed url={src} />
      : <img src={src} alt={alt} style={{ maxWidth: '100%', borderRadius: 8 }} />,
  a: ({ href = '', children }: any) => {
    const ext = /^https?:\/\//.test(href)
    return <a href={href} {...(ext ? { target: '_blank', rel: 'noreferrer' } : {})} style={{ color: GREEN, fontWeight: 500 }}>{children}</a>
  },
  h1: ({ children }: any) => <h1 style={{ fontFamily: "'DM Serif Display',serif", fontSize: 26, color: '#0a3320', margin: '4px 0 12px' }}>{children}</h1>,
  h2: ({ children }: any) => <h2 style={{ fontSize: 18, color: GREEN, margin: '22px 0 8px', fontWeight: 700 }}>{children}</h2>,
  h3: ({ children }: any) => <h3 style={{ fontSize: 15, color: '#0a3320', margin: '16px 0 6px', fontWeight: 700 }}>{children}</h3>,
  p: ({ children }: any) => <p style={{ fontSize: 14, lineHeight: 1.7, color: '#374151', margin: '8px 0' }}>{children}</p>,
  ul: ({ children }: any) => <ul style={{ fontSize: 14, lineHeight: 1.7, color: '#374151', paddingLeft: 22, margin: '8px 0' }}>{children}</ul>,
  ol: ({ children }: any) => <ol style={{ fontSize: 14, lineHeight: 1.7, color: '#374151', paddingLeft: 22, margin: '8px 0' }}>{children}</ol>,
  li: ({ children }: any) => <li style={{ margin: '3px 0' }}>{children}</li>,
  code: ({ children }: any) => <code style={{ background: '#f3f4f6', borderRadius: 4, padding: '1px 5px', fontSize: 12.5, fontFamily: 'ui-monospace,Menlo,monospace', color: '#0a3320' }}>{children}</code>,
  blockquote: ({ children }: any) => <blockquote style={{ borderLeft: `3px solid ${GREEN}`, background: '#f0fff4', margin: '12px 0', padding: '2px 14px', borderRadius: '0 8px 8px 0' }}>{children}</blockquote>,
  table: ({ children }: any) => <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13, margin: '10px 0' }}>{children}</table>,
  th: ({ children }: any) => <th style={{ border: '1px solid #e4e8e4', background: '#f0fff4', padding: '6px 10px', textAlign: 'left', color: '#0a3320' }}>{children}</th>,
  td: ({ children }: any) => <td style={{ border: '1px solid #e4e8e4', padding: '6px 10px', color: '#374151' }}>{children}</td>,
}

export default function InstructionsPage() {
  const docs = getInstructionDocs()
  const { roles, role } = useAuth()
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState('')

  // Active role: ?role= (Help-page pattern) → else the user's most-privileged role.
  const roleParam = (params.get('role') || '').toLowerCase()
  const activeRole = roleParam || 'all'

  const roleVisible = useMemo(
    () => docs.filter(d => {
      if (roleParam) return docVisibleForRole(d, roleParam)
      // no explicit ?role= → union of the user's roles (empty roles doc = everyone)
      if (!roles.length) return true
      return !d.roles.length || roles.some(r => d.roles.includes(r.toLowerCase()))
    }),
    [docs, roleParam, roles])

  const q = query.trim().toLowerCase()
  const shown = useMemo(
    () => !q ? roleVisible : roleVisible.filter(d =>
      d.title.toLowerCase().includes(q) ||
      d.headings.some(h => h.toLowerCase().includes(q)) ||
      d.body.toLowerCase().includes(q)),
    [roleVisible, q])

  // ?doc=<slug> so a Document Hub card can land on ITS guide, not on whichever doc
  // happens to sort first. Falls back to the first visible doc for a bare /instructions.
  const [selectedSlug, setSelectedSlug] = useState<string | null>(params.get('doc'))
  const selected: InstructionDoc | undefined =
    shown.find(d => d.slug === selectedSlug) || shown[0]

  const setRole = (r: string) => {
    if (r === 'all') params.delete('role'); else params.set('role', r)
    setParams(params, { replace: true })
  }

  const ROLE_CHOICES = ['all', 'director', 'cook', 'teacher', 'admin']

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: "'DM Sans',sans-serif", background: '#f4f6f4' }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Serif+Display&display=swap" rel="stylesheet" />

      {/* Left: TOC + search + role filter */}
      <aside style={{ width: 260, flexShrink: 0, borderRight: '1px solid #e4e8e4', background: '#fff', padding: '20px 14px', position: 'sticky', top: 0, alignSelf: 'flex-start', height: '100vh', overflowY: 'auto' }}>
        <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 20, color: '#0a3320', marginBottom: 4 }}>📖 Instructions</div>
        <div style={{ fontSize: 11, color: '#888', marginBottom: 14 }}>How every feature works</div>

        <input
          value={query} onChange={e => setQuery(e.target.value)} placeholder="Search headings…"
          style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #d0d5d0', fontSize: 13, fontFamily: 'inherit', marginBottom: 12 }}
        />

        <div style={{ fontSize: 10, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>For role</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 16 }}>
          {ROLE_CHOICES.map(r => (
            <button key={r} onClick={() => setRole(r)} style={{
              padding: '3px 10px', borderRadius: 20, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
              border: 'none', textTransform: 'capitalize',
              background: activeRole === r ? GREEN : '#f3f4f6', color: activeRole === r ? '#fff' : '#374151',
              fontWeight: activeRole === r ? 600 : 400,
            }}>{r === 'all' ? 'Everyone' : r}</button>
          ))}
        </div>

        <div style={{ fontSize: 10, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Modules</div>
        {shown.length === 0 && <div style={{ fontSize: 12, color: '#aaa' }}>No guides for this role yet.</div>}
        {shown.map(d => (
          <button key={d.slug} onClick={() => { setSelectedSlug(d.slug); params.set('doc', d.slug); setParams(params, { replace: true }) }} style={{
            display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 8,
            border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, marginBottom: 2,
            background: selected?.slug === d.slug ? '#f0fff4' : 'transparent',
            color: selected?.slug === d.slug ? GREEN : '#374151',
            fontWeight: selected?.slug === d.slug ? 600 : 400,
          }}>
            {d.icon ? `${d.icon} ` : ''}{d.title}
          </button>
        ))}
      </aside>

      {/* Right: rendered markdown */}
      <main style={{ flex: 1, padding: '28px 40px', maxWidth: 900 }}>
        {!selected ? (
          <div style={{ color: '#888', fontSize: 14 }}>Select a module on the left.</div>
        ) : (
          <>
            {selected.video && <VideoEmbed url={selected.video} />}
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS as any}>
              {selected.body}
            </ReactMarkdown>
            {role && (
              <div style={{ marginTop: 28, paddingTop: 12, borderTop: '1px solid #eef1ee', fontSize: 11, color: '#aaa' }}>
                Showing guidance relevant to: {roleParam || role}. Content updates with each new feature.
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
