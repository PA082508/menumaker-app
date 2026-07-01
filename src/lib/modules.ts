// src/lib/modules.ts
// Variant B — maps menumaker.app_modules.module_code → existing app routes.
//
// The permission RPCs (user_modules / role_module_matrix) return module_code +
// label + icon; the frontend only needs to know which route each code opens.
// Codes confirmed by the task spec are mapped explicitly; the remaining nav
// modules use best-guess codes (// TODO: confirm) and there is a derive-from-code
// fallback so an unmapped code still resolves to a sensible route.

export type ModuleAccess = 'none' | 'view' | 'edit'

export interface NavModule {
  module_code: string
  label: string
  category: string | null
  icon: string | null
  sort_order: number
  access: ModuleAccess
}

export const MODULE_ROUTE: Record<string, string> = {
  dashboard:        '/dashboard',
  menu_planner:     '/menu',
  recipes:          '/recipes',        // TODO: confirm module_code
  kitchen_view:     '/kitchen',        // TODO: confirm module_code
  delivery:         '/delivery',       // TODO: confirm module_code
  purchases:        '/purchases',      // TODO: confirm module_code
  kitchen_stock:    '/kitchen-stock',  // TODO: confirm module_code
  inventory:        '/inventory',      // TODO: confirm module_code
  meal_count:       '/meal-count',
  documents:        '/documents',
  dispatch:         '/dispatch',
  custom_export:    '/export',
  site_claim:       '/claim-report',
  cacfp_reports:    '/reports',
  receipt_review:   '/receipt-review',
  kitchen_report:   '/kitchen-report',
  form_submissions: '/submissions',
  finance:          '/finance',
  settings:         '/settings',
  messages:         '/messages',
}

// Fallback emoji per code when the RPC does not supply an icon.
export const MODULE_ICON_FALLBACK: Record<string, string> = {
  dashboard: '⊞', menu_planner: '📅', recipes: '🍳', kitchen_view: '👨‍🍳',
  delivery: '🚐', purchases: '🛒', kitchen_stock: '🏪', inventory: '📦',
  meal_count: '🍽️', documents: '📁', dispatch: '📨', custom_export: '📤',
  messages: '📨', site_claim: '📋', cacfp_reports: '📊', receipt_review: '🧾',
  kitchen_report: '👨‍🍳', form_submissions: '📨', finance: '💰', settings: '⚙️',
}

// Resolve a module_code to a route; unmapped codes derive `/kebab-case`.
export function routeForModule(code: string): string {
  return MODULE_ROUTE[code] ?? '/' + code.replace(/_/g, '-')
}

// The set of routes that are guarded by the permission system.
export const KNOWN_MODULE_ROUTES = new Set(Object.values(MODULE_ROUTE))
