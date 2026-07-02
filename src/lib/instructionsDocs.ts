/**
 * Loads the in-app Instructions content from docs/instructions/*.md at build time.
 *
 * Each file has YAML-ish frontmatter:
 *   ---
 *   title: Menu Planner
 *   module: menu
 *   order: 3
 *   roles: [director, cook, teacher, admin]
 *   video: https://...        # optional — embedded player at top of the doc
 *   icon: 📅                   # optional
 *   ---
 *   <markdown body>
 *
 * Definition of Done (platform-standards §4): every feature adds/updates one of
 * these in the same commit.
 */

export interface InstructionDoc {
  slug: string        // module id, e.g. "menu"
  title: string
  order: number
  roles: string[]     // lowercased; empty = visible to everyone
  video: string | null
  icon: string | null
  body: string        // markdown (frontmatter stripped)
  headings: string[]  // H1–H3 text, for search
}

// Vite bundles every markdown file under docs/instructions as a raw string.
const RAW = import.meta.glob('/docs/instructions/*.md', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>

function parseFrontmatter(raw: string): { data: Record<string, any>; body: string } {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!m) return { data: {}, body: raw }
  const data: Record<string, any> = {}
  for (const line of m[1].split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue          // skip blanks / comments
    const i = line.indexOf(':')
    if (i < 0) continue
    const key = line.slice(0, i).trim()
    let val = line.slice(i + 1).trim()
    if (val.startsWith('[') && val.endsWith(']')) {
      data[key] = val.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
    } else {
      data[key] = val.replace(/^["']|["']$/g, '')
    }
  }
  return { data, body: m[2] }
}

function fileSlug(path: string): string {
  return path.split('/').pop()!.replace(/\.md$/, '')
}

let cached: InstructionDoc[] | null = null

export function getInstructionDocs(): InstructionDoc[] {
  if (cached) return cached
  const docs: InstructionDoc[] = Object.entries(RAW).map(([path, raw]) => {
    const { data, body } = parseFrontmatter(raw)
    const headings = (body.match(/^#{1,3}\s+(.+)$/gm) || []).map(h => h.replace(/^#{1,3}\s+/, '').trim())
    return {
      slug: (data.module as string) || fileSlug(path),
      title: (data.title as string) || fileSlug(path),
      order: data.order != null ? Number(data.order) : 999,
      roles: Array.isArray(data.roles) ? data.roles.map((r: string) => r.toLowerCase()) : [],
      video: (data.video as string) || null,
      icon: (data.icon as string) || null,
      body,
      headings,
    }
  })
  docs.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title))
  cached = docs
  return docs
}

/** True when a doc is visible for the active role ('all' = no filter). */
export function docVisibleForRole(doc: InstructionDoc, role: string): boolean {
  if (role === 'all' || !doc.roles.length) return true
  return doc.roles.includes(role.toLowerCase())
}
