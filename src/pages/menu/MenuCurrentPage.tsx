import { Navigate } from 'react-router-dom'
import { useOrg } from '@/contexts/OrgContext'

/**
 * /menu/current — permanent link to the latest published version of the CURRENT
 * calendar month's official menu for the active center. Permanent link for the
 * website (playacademyusa.com) and the parent app.
 *
 * Implemented as a redirect resolver, not a renderer: MenuPublishedPage already
 * resolves "latest version" for a given center/year/month, so /menu/current just
 * computes (center, current year, current month) and redirects there. Center =
 * OrgContext currentCenter, falling back to the first accessible center for
 * org-view admins (currentCenter null).
 *
 * NOTE: this route currently sits under ProtectedRoute — it is the in-app
 * permanent link. Public/anon exposure (so the website can embed it without a
 * login) is a separate step; see BACKLOG "Publish v2" #2.
 */
export default function MenuCurrentPage() {
  const { currentCenter, centers, loading } = useOrg()

  if (loading) return <Msg>Loading current menu…</Msg>

  const center = currentCenter ?? centers[0] ?? null
  if (!center) return <Msg>No center available — pick a center from the header first.</Msg>

  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1

  return <Navigate to={`/menu/published/${center.slug}/${year}/${month}`} replace />
}

function Msg({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: 40, fontFamily: "'DM Sans',sans-serif", color: '#666', fontSize: 14 }}>{children}</div>
}
