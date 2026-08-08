import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { centerOfficialName } from '@/lib/centerLabels'
import { useAuth } from '@/hooks/useAuth'
import type { NavModule } from '@/lib/modules'
import { warnIf } from '../lib/queryError'

export interface Center {
  id: string
  slug: string
  name: string
  is_active: boolean
}

export interface Org {
  id: string
  slug: string
  name: string
}

// 'center' = a single concrete center is active (currentCenter set).
// 'org'    = Organization view (admin/office_manager only; currentCenter null).
export type ViewMode = 'center' | 'org'

interface OrgContextType {
  org: Org | null
  centers: Center[]                 // centers THIS user can access (admin = all org centers)
  orgRole: 'admin' | 'director' | null
  isOrgAdmin: boolean               // admin / office_manager → Organization Mode available
  modules: string[]
  navModules: NavModule[] | null    // Variant B: permission-driven nav (null = not loaded → role fallback)
  currentCenter: Center | null      // active center; null = Organization view
  viewMode: ViewMode                // 'org' iff currentCenter is null (only reachable when isOrgAdmin)
  setCurrentCenter: (c: Center | null) => void   // pass null → Organization view
  loading: boolean
}

const OrgContext = createContext<OrgContextType | undefined>(undefined)

// ─── ПАМЯТЬ О ВЫБРАННОМ ЦЕНТРЕ ───────────────────────────────────────────────
// Выбор центра ПЕРЕЖИВАЕТ перезагрузку и прямой заход по адресу: человек, открывший
// закладку на отчёт, оказывался в Main Office и молча смотрел на пустой экран
// «выберите центр» — а он центр уже выбирал, полчаса назад.
//
// Ключ ПРИВЯЗАН К ПОЛЬЗОВАТЕЛЮ: на одном планшете сменяются повар и директор, и
// центр одного не должен становиться центром другого.
//
// 'org' хранится ЯВНО, а не как отсутствие ключа: у админа Main Office — это тоже
// выбор, и он обязан пережить перезагрузку так же, как выбор центра.
const CENTER_KEY = (userId: string) => `mm.currentCenter.${userId}`

function readSavedCenter(userId: string | null): string | null {
  if (!userId) return null
  try { return localStorage.getItem(CENTER_KEY(userId)) } catch { return null }
}
function saveCenter(userId: string | null, value: string | null) {
  if (!userId) return
  try {
    if (value) localStorage.setItem(CENTER_KEY(userId), value)
    else localStorage.removeItem(CENTER_KEY(userId))
  } catch { /* приватный режим — просто не помним */ }
}

export function OrgProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const [org, setOrg]                       = useState<Org | null>(null)
  const [centers, setCenters]               = useState<Center[]>([])
  const [orgRole, setOrgRole]               = useState<'admin' | 'director' | null>(null)
  const [isOrgAdmin, setIsOrgAdmin]         = useState(false)
  const [modules, setModules]               = useState<string[]>([])
  const [navModules, setNavModules]         = useState<NavModule[] | null>(null)
  const [currentCenter, setCurrentCenterState] = useState<Center | null>(null)
  const [loading, setLoading]               = useState(true)
  const userId = session?.user?.id ?? null

  // Смена центра — единственное место, где память обновляется. Пока человек не
  // выбрал другое, он остаётся там, где был.
  const setCurrentCenter = (c: Center | null) => {
    setCurrentCenterState(c)
    saveCenter(userId, c ? c.id : 'org')
  }

  useEffect(() => {
    if (!session) {
      setOrg(null)
      setCenters([])
      setOrgRole(null)
      setIsOrgAdmin(false)
      setModules([])
      setNavModules(null)
      setCurrentCenterState(null)
      setLoading(false)
      return
    }

    let cancelled = false
    ;(async () => {
      setLoading(true)
      const { data, error } = await (supabase.rpc as any)('app_bootstrap')
      if (cancelled) return
      let orgId: string | null = null
      if (!error && data) {
        const allCenters: Center[] = data.centers ?? []
        const oRole: 'admin' | 'director' | null = data.org_role ?? null
        const funcRoles: string[] = data.functional_roles ?? []
        const orgAdmin =
          oRole === 'admin' ||
          funcRoles.includes('admin') ||
          funcRoles.includes('office_manager')
        orgId = data.org?.id ?? null

        // Access-filter the centers: admin/office_manager → all org centers,
        // director/cook/teacher → only their assigned center(s). Without this,
        // app_bootstrap returns ALL org centers and a center-mode user would be
        // pinned to the wrong center (and pages could leak other centers' data).
        let accessible = allCenters
        if (orgId) {
          const { data: ac, error: acErr } = await (supabase.schema('menumaker').rpc as any)(
            'accessible_centers', { p_org_id: orgId }
          )
          // Отказ здесь = «центров нет» на всём приложении. Пустой список молча
          // тут страшнее ошибки: человек решит, что у него отобрали доступ.
          warnIf(acErr, 'OrgContext/accessible_centers')
          if (!cancelled && Array.isArray(ac)) {
            const ids = new Set((ac as { center_id: string }[]).map(r => r.center_id))
            accessible = allCenters.filter(c => ids.has(c.id))
          }
        }
        if (cancelled) return

        // ИМЯ ЦЕНТРА ПЕРЕВОДИТСЯ ОДИН РАЗ — ЗДЕСЬ, НА ВХОДЕ. Канон владельца
        // 08.08: наружу центр зовётся городом, а `centers.name` в базе пока
        // несёт рабочую кличку («Play Academy Ridge»). Десятки экранов читают
        // `currentCenter.name` — заголовки, письма, документы, выгрузки; чинить
        // их поштучно значит завести десятки мест, где завтра снова вылезет
        // кличка. Поэтому имя правится в ОДНОЙ точке входа, и все читатели
        // получают уже официальное.
        //
        // Когда имя в базе станет городом (переименование двух строк ждёт
        // слова), этот перевод схлопнется сам: `centerOfficialName` отдаёт
        // `name` как есть, если кличка ему незнакома.
        // ⚠️ slug НЕ трогается — он ключ, по нему всё и опознаётся.
        const named = accessible.map(c => ({ ...c, name: centerOfficialName(c) }))

        setOrg(data.org ?? null)
        setOrgRole(oRole)
        setIsOrgAdmin(orgAdmin)
        setModules(data.modules ?? [])
        setCenters(named)
        // Org admins / office managers land in the Organization view by default
        // (currentCenter = null); they can pick a concrete center from the header.
        // Everyone else defaults to their (first) accessible center so center-scoped
        // pages (Meal Count, Reports, Menu…) filter correctly out of the box.
        // Сохранённый выбор ВЫИГРЫВАЕТ у умолчания — но только если центр всё ещё
        // доступен этому человеку. Центр, к которому доступ отобрали, тихо
        // подставлять нельзя: страницы читали бы чужой центр.
        const saved = readSavedCenter(userId)
        const savedCenter = saved && saved !== 'org' ? named.find(c => c.id === saved) ?? null : null
        if (savedCenter) setCurrentCenterState(savedCenter)
        else if (saved === 'org' && orgAdmin) setCurrentCenterState(null)
        else setCurrentCenterState(orgAdmin ? null : (named[0] ?? null))
      }

      // Variant B — permission-driven navigation. On failure leave navModules
      // null so AppLayout falls back to the legacy role-based gating.
      if (orgId) {
        const { data: mods, error: mErr } =
          await (supabase.schema('menumaker').rpc as any)('user_modules', { p_org_id: orgId })
        if (!cancelled && !mErr && Array.isArray(mods)) {
          // RPC returns 'code' column; NavModule interface expects 'module_code'
          const mapped = mods.map((m: any) => ({ ...m, module_code: m.module_code ?? m.code }))
          setNavModules(mapped as NavModule[])
        }
      }

      if (!cancelled) setLoading(false)
    })()

    return () => { cancelled = true }
  }, [session])

  const viewMode: ViewMode = currentCenter ? 'center' : 'org'

  return (
    <OrgContext.Provider value={{
      org, centers, orgRole, isOrgAdmin, modules, navModules,
      currentCenter, viewMode, setCurrentCenter, loading,
    }}>
      {children}
    </OrgContext.Provider>
  )
}

export function useOrg() {
  const ctx = useContext(OrgContext)
  if (!ctx) throw new Error('useOrg must be used within OrgProvider')
  return ctx
}
