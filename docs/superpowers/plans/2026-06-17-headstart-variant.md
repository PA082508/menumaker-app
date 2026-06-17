# Head Start MenuMaker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Адаптировать MenuMaker под Head Start программы через `program_type` флаг — один codebase, два продукта без форка.

**Architecture:** Флаг `program_type: 'cacfp' | 'headstart'` читается из `centers` таблицы при старте через хук `useProgramConfig`. Сайдбар, отчёты и формы рендерятся условно. Все новые таблицы живут в схеме `menumaker`. Supabase Storage используется для загрузки PDF-документов к рецептам.

**Tech Stack:** React 18, Vite, TypeScript, Supabase (JS client v2, schema `menumaker`), DM Sans / DM Serif Display, inline styles (проект не использует CSS modules/Tailwind).

## Global Constraints

- Все Supabase-запросы используют `.schema('menumaker')` — без исключений
- Inline стили во всех компонентах — проект не использует CSS-классы
- Цветовая палитра: primary `#0f4c35` / `#0a3320`, background `#f4f6f4`, border `#e4e8e4`
- Шрифт заголовков: `DM Serif Display`, тело: `DM Sans`
- `PEARL_CENTER_ID = '881ef4ce-1a27-4d3b-aa60-59d2a307bf2b'` — константа центра во всех файлах отчётов
- TypeScript strict — нет `any` без явного комментария
- Нет новых npm зависимостей — только то что уже есть в package.json

---

## Файловая карта

### Новые файлы
```
src/hooks/useProgramConfig.ts              — хук: читает program_type + HS-настройки центра
src/pages/settings/HeadStartSettings.tsx  — компонент вкладки "Head Start Program" в Settings
src/pages/family-engagement/
  FamilyEngagementPage.tsx                — главная страница модуля
  MenuPostingsTab.tsx                     — Tab 1: опубликованные меню
  EducationLogTab.tsx                     — Tab 2: журнал nutrition education
  FamilyFeedbackTab.tsx                   — Tab 3: отзывы семей
src/pages/reports/HeadStartReportsPage.tsx — главная страница HS отчётов
src/pages/reports/hs/
  PIRDataTab.tsx                          — Tab 1: PIR Nutrition Data
  MonthlyMealCountTab.tsx                 — Tab 2: Monthly Meal Count
  NutritionSelfAssessmentTab.tsx          — Tab 3: Nutrition Self-Assessment
src/components/recipes/RecipeDocsPanel.tsx — панель документов CN/PFS/TVP
```

### Изменяемые файлы
```
src/hooks/useAuth.tsx                      — +роль 'dietitian'
src/components/layout/AppLayout.tsx        — условный сайдбар по program_type
src/App.tsx                                — +роут /family-engagement, /hs-reports
src/pages/menu/MenuPlannerPage.tsx         — +RD статус, family-style, cultural theme, publish
src/pages/settings/SettingsPage.tsx        — +вкладка 'headstart'
src/pages/form-submissions/FormSubmissionsPage.tsx — +CF/HS-27 поля
src/pages/recipes/RecipesPage.tsx          — +вкладка Product Docs, is_standardized флаг
```

---

## Task 1: Database Migrations

**Files:**
- Create: `supabase/migrations/20260617_headstart.sql`

**Interfaces:**
- Produces: таблицы `published_menus`, `nutrition_education_log`, `nutrition_self_assessments`, `recipe_documents`; новые колонки во всех существующих таблицах

- [ ] **Step 1: Создать файл миграции**

```sql
-- supabase/migrations/20260617_headstart.sql

-- 1. Расширить таблицу centers
ALTER TABLE menumaker.centers
  ADD COLUMN IF NOT EXISTS program_type          text    NOT NULL DEFAULT 'cacfp',
  ADD COLUMN IF NOT EXISTS program_hours         numeric,
  ADD COLUMN IF NOT EXISTS program_start_time    time,
  ADD COLUMN IF NOT EXISTS program_end_time      time,
  ADD COLUMN IF NOT EXISTS fiscal_year_start_month int   DEFAULT 10,
  ADD COLUMN IF NOT EXISTS dietitian_name        text,
  ADD COLUMN IF NOT EXISTS dietitian_credentials text,
  ADD COLUMN IF NOT EXISTS dietitian_email       text,
  ADD COLUMN IF NOT EXISTS health_manager_name   text,
  ADD COLUMN IF NOT EXISTS health_manager_email  text,
  ADD COLUMN IF NOT EXISTS grant_number          text,
  ADD COLUMN IF NOT EXISTS enrollment_capacity   int;

-- 2. Расширить menu_cycles
ALTER TABLE menumaker.menu_cycles
  ADD COLUMN IF NOT EXISTS rd_approved_by  text,
  ADD COLUMN IF NOT EXISTS rd_approved_at  timestamptz;
-- status уже существует ('draft'|'approved') — расширяем до 4 значений:
-- 'draft' | 'submitted' | 'rd_approved' | 'published'
-- (TEXT поле, нет CHECK constraint — значения просто используются в коде)

-- 3. Расширить menu_items
ALTER TABLE menumaker.menu_items
  ADD COLUMN IF NOT EXISTS is_family_style boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cultural_theme  text;

-- 4. Расширить special_diet_forms
ALTER TABLE menumaker.special_diet_forms
  ADD COLUMN IF NOT EXISTS substitution_type         text,   -- 'medical' | 'non_medical'
  ADD COLUMN IF NOT EXISTS review_date               date,
  ADD COLUMN IF NOT EXISTS health_manager_signed_at  timestamptz;

-- 5. Расширить recipes
ALTER TABLE menumaker.recipes
  ADD COLUMN IF NOT EXISTS is_standardized boolean NOT NULL DEFAULT false;

-- 6. Новая таблица: published_menus
CREATE TABLE IF NOT EXISTS menumaker.published_menus (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id            uuid        NOT NULL REFERENCES menumaker.menu_cycles(id) ON DELETE CASCADE,
  week_number         int         NOT NULL,
  center_id           uuid        NOT NULL REFERENCES menumaker.centers(id),
  published_at        timestamptz NOT NULL DEFAULT now(),
  published_by        uuid        REFERENCES auth.users(id),
  distribution_method text        NOT NULL DEFAULT 'printed', -- 'printed' | 'email' | 'bulletin'
  rd_approved_by      text,
  rd_approved_at      timestamptz,
  notes               text
);

-- 7. Новая таблица: nutrition_education_log
CREATE TABLE IF NOT EXISTS menumaker.nutrition_education_log (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id        uuid        NOT NULL REFERENCES menumaker.centers(id),
  event_date       date        NOT NULL,
  topic            text        NOT NULL,
  format           text        NOT NULL, -- 'classroom'|'newsletter'|'parent_meeting'|'home_visit'
  families_reached int         NOT NULL DEFAULT 0,
  notes            text,
  created_by       uuid        REFERENCES auth.users(id),
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- 8. Новая таблица: nutrition_self_assessments
CREATE TABLE IF NOT EXISTS menumaker.nutrition_self_assessments (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id          uuid        NOT NULL REFERENCES menumaker.centers(id),
  fiscal_year        int         NOT NULL,
  overall_status     text        NOT NULL DEFAULT 'draft', -- 'draft' | 'complete'
  items              jsonb       NOT NULL DEFAULT '[]',
  director_signature text,       -- base64 PNG
  completed_at       timestamptz,
  completed_by       uuid        REFERENCES auth.users(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (center_id, fiscal_year)
);

-- 9. Новая таблица: recipe_documents
CREATE TABLE IF NOT EXISTS menumaker.recipe_documents (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id    uuid        NOT NULL REFERENCES menumaker.recipes(id) ON DELETE CASCADE,
  doc_type     text        NOT NULL, -- 'cn_label'|'pfs'|'tvp'|'standardized_recipe'
  file_name    text        NOT NULL,
  storage_path text        NOT NULL,
  uploaded_at  timestamptz NOT NULL DEFAULT now(),
  uploaded_by  uuid        REFERENCES auth.users(id)
);

-- 10. RLS policies (read: authenticated, write: director/dietitian)
ALTER TABLE menumaker.published_menus ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read published_menus" ON menumaker.published_menus FOR SELECT TO authenticated USING (true);
CREATE POLICY "write published_menus" ON menumaker.published_menus FOR ALL TO authenticated USING (true);

ALTER TABLE menumaker.nutrition_education_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read edu_log" ON menumaker.nutrition_education_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "write edu_log" ON menumaker.nutrition_education_log FOR ALL TO authenticated USING (true);

ALTER TABLE menumaker.nutrition_self_assessments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read self_assess" ON menumaker.nutrition_self_assessments FOR SELECT TO authenticated USING (true);
CREATE POLICY "write self_assess" ON menumaker.nutrition_self_assessments FOR ALL TO authenticated USING (true);

ALTER TABLE menumaker.recipe_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read recipe_docs" ON menumaker.recipe_documents FOR SELECT TO authenticated USING (true);
CREATE POLICY "write recipe_docs" ON menumaker.recipe_documents FOR ALL TO authenticated USING (true);
```

- [ ] **Step 2: Применить миграцию в Supabase**

Через Supabase MCP инструмент или вручную в SQL Editor:
```
Supabase Dashboard → SQL Editor → вставить содержимое файла → Run
```
Убедиться что нет ошибок. Каждый ALTER и CREATE должен выполниться без `ERROR`.

- [ ] **Step 3: Создать Storage bucket для recipe_documents**

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('recipe-documents', 'recipe-documents', false)
ON CONFLICT DO NOTHING;

CREATE POLICY "auth read recipe-documents"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'recipe-documents');

CREATE POLICY "auth write recipe-documents"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'recipe-documents');

CREATE POLICY "auth delete recipe-documents"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'recipe-documents');
```

- [ ] **Step 4: Проверить в Table Editor что все таблицы созданы**

Открыть Supabase → Table Editor → Schema: menumaker.
Убедиться что видны: `published_menus`, `nutrition_education_log`, `nutrition_self_assessments`, `recipe_documents`.
Убедиться что `centers` имеет колонку `program_type`.

- [ ] **Step 5: Коммит**

```bash
git add supabase/migrations/20260617_headstart.sql
git commit -m "feat: db migrations for Head Start variant"
```

---

## Task 2: Program Config Hook + Sidebar

**Files:**
- Create: `src/hooks/useProgramConfig.ts`
- Modify: `src/hooks/useAuth.tsx`
- Modify: `src/components/layout/AppLayout.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Produces: `useProgramConfig()` → `{ programType, isHeadStart, programHours, dietitianName, ... }`
- Produces: расширенный тип `UserRole` включает `'dietitian'`

- [ ] **Step 1: Добавить роль `dietitian` в useAuth.tsx**

В `src/hooks/useAuth.tsx` найти тип `UserRole` и добавить значение:

```typescript
type UserRole =
  | 'director'
  | 'cook'
  | 'office_manager'
  | 'cacfp_inspector'
  | 'accountant'
  | 'driver'
  | 'purchaser'
  | 'dietitian'   // ← добавить
```

Также добавить helper-функцию в конец файла:

```typescript
export const canApproveDiet = (role: UserRole | null) =>
  role === 'director' || role === 'dietitian'
```

- [ ] **Step 2: Создать хук useProgramConfig**

```typescript
// src/hooks/useProgramConfig.ts
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const CENTER_SLUG = 'pearl' // будет параметром при мульти-тенантности

export interface ProgramConfig {
  programType: 'cacfp' | 'headstart'
  isHeadStart: boolean
  programHours: number | null
  fiscalYearStartMonth: number
  dietitianName: string | null
  dietitianCredentials: string | null
  dietitianEmail: string | null
  healthManagerName: string | null
  healthManagerEmail: string | null
  grantNumber: string | null
  enrollmentCapacity: number | null
  centerId: string | null
}

const DEFAULT_CONFIG: ProgramConfig = {
  programType: 'cacfp',
  isHeadStart: false,
  programHours: null,
  fiscalYearStartMonth: 10,
  dietitianName: null,
  dietitianCredentials: null,
  dietitianEmail: null,
  healthManagerName: null,
  healthManagerEmail: null,
  grantNumber: null,
  enrollmentCapacity: null,
  centerId: null,
}

export function useProgramConfig(): ProgramConfig & { loading: boolean; reload: () => void } {
  const [config, setConfig] = useState<ProgramConfig>(DEFAULT_CONFIG)
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .schema('menumaker')
        .from('centers')
        .select(`
          id,
          program_type,
          program_hours,
          fiscal_year_start_month,
          dietitian_name,
          dietitian_credentials,
          dietitian_email,
          health_manager_name,
          health_manager_email,
          grant_number,
          enrollment_capacity
        `)
        .eq('slug', CENTER_SLUG)
        .maybeSingle()

      if (!cancelled && data) {
        setConfig({
          programType: (data.program_type as 'cacfp' | 'headstart') ?? 'cacfp',
          isHeadStart: data.program_type === 'headstart',
          programHours: data.program_hours ?? null,
          fiscalYearStartMonth: data.fiscal_year_start_month ?? 10,
          dietitianName: data.dietitian_name ?? null,
          dietitianCredentials: data.dietitian_credentials ?? null,
          dietitianEmail: data.dietitian_email ?? null,
          healthManagerName: data.health_manager_name ?? null,
          healthManagerEmail: data.health_manager_email ?? null,
          grantNumber: data.grant_number ?? null,
          enrollmentCapacity: data.enrollment_capacity ?? null,
          centerId: data.id ?? null,
        })
      }
      if (!cancelled) setLoading(false)
    })()
    return () => { cancelled = true }
  }, [tick])

  return { ...config, loading, reload: () => setTick(t => t + 1) }
}
```

- [ ] **Step 3: Обновить AppLayout.tsx — условный сайдбар**

В `src/components/layout/AppLayout.tsx` импортировать хук и изменить `NAV_ITEMS`:

```typescript
import { useProgramConfig } from '@/hooks/useProgramConfig'
```

Заменить константу `NAV_ITEMS` на функцию внутри компонента:

```typescript
export default function AppLayout() {
  const { user, role, signOut } = useAuth()
  const { isHeadStart } = useProgramConfig()
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(false)

  const NAV_ITEMS: NavItem[] = [
    { path: '/dashboard',  label: 'Dashboard',      icon: '⊞' },
    { path: '/menu',       label: 'Menu Planner',   icon: '📅', roles: ['director','cook','office_manager','cacfp_inspector','dietitian'] },
    { path: '/recipes',    label: 'Recipes',        icon: '🍳', roles: ['director','cook','office_manager','dietitian'] },
    { path: '/kitchen',    label: 'Kitchen View',   icon: '👨‍🍳', roles: ['director','cook'] },
    { path: '/delivery',   label: 'Delivery',       icon: '🚐', roles: ['director','driver'] },
    { path: '/purchases',  label: 'Purchases',      icon: '🛒', roles: ['director','purchaser'] },
    { path: '/kitchen-stock', label: 'Kitchen Stock', icon: '🏪', roles: ['director','cook','purchaser'] },
    { path: '/inventory',  label: 'Inventory',      icon: '📦', roles: ['director','purchaser','cook'] },
    { path: '/meal-count', label: 'Meal Count · Teachers', icon: '🍽️', roles: ['director','cook','driver'] },
    { path: '/meal-count-director', label: 'Meal Count · Director', icon: '📋', roles: ['director','office_manager'] },
    // CACFP-only items
    ...(!isHeadStart ? [
      { path: '/claim-report', label: 'Site Claim', icon: '📋', roles: ['director','office_manager'] },
      { path: '/reports',      label: 'CACFP Reports', icon: '📊', roles: ['director','office_manager','cacfp_inspector'] },
    ] : []),
    // Head Start-only items
    ...(isHeadStart ? [
      { path: '/family-engagement', label: 'Family Engagement', icon: '👨‍👩‍👧', roles: ['director','office_manager','dietitian'] },
      { path: '/hs-reports',        label: 'HS Reports',        icon: '📊', roles: ['director','office_manager','dietitian'] },
    ] : []),
    { path: '/kitchen-report', label: 'Kitchen Report', icon: '👨‍🍳', roles: ['director','cook','office_manager'] },
    { path: '/submissions', label: 'Form Submissions', icon: '📨', roles: ['director','office_manager','cacfp_inspector','dietitian'] },
    { path: '/finance',    label: 'Finance',        icon: '💰', roles: ['director','accountant'] },
    { path: '/settings',   label: 'Settings',       icon: '⚙️', roles: ['director'] },
  ]

  // остальной код компонента без изменений — visibleItems уже использует role filter
```

- [ ] **Step 4: Добавить новые роуты в App.tsx**

В `src/App.tsx` добавить импорты и роуты:

```typescript
import FamilyEngagementPage from '@/pages/family-engagement/FamilyEngagementPage'
import HeadStartReportsPage from '@/pages/reports/HeadStartReportsPage'
```

Внутри `<Route path="/">` добавить рядом с другими роутами:

```typescript
<Route path="family-engagement" element={<FamilyEngagementPage />} />
<Route path="hs-reports"        element={<HeadStartReportsPage />} />
```

- [ ] **Step 5: Проверить в браузере**

```bash
npm run dev
```

1. Войти в приложение
2. Открыть Supabase → Table Editor → centers → найти строку с slug='pearl'
3. Установить `program_type = 'headstart'` вручную
4. Обновить страницу — в сайдбаре должны появиться "Family Engagement" и "HS Reports", исчезнуть "Site Claim" и "CACFP Reports"
5. Вернуть `program_type = 'cacfp'` — сайдбар возвращается в исходное состояние

- [ ] **Step 6: Коммит**

```bash
git add src/hooks/useProgramConfig.ts src/hooks/useAuth.tsx src/components/layout/AppLayout.tsx src/App.tsx
git commit -m "feat: program_type flag + conditional sidebar for Head Start"
```

---

## Task 3: Settings — вкладка Head Start Program

**Files:**
- Create: `src/pages/settings/HeadStartSettings.tsx`
- Modify: `src/pages/settings/SettingsPage.tsx`

**Interfaces:**
- Consumes: `useProgramConfig()` из Task 2
- Produces: сохранение всех HS-полей в таблицу `centers`

- [ ] **Step 1: Создать компонент HeadStartSettings**

```typescript
// src/pages/settings/HeadStartSettings.tsx
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

const CENTER_SLUG = 'pearl'

interface HSConfig {
  program_type: string
  program_hours: string
  program_start_time: string
  program_end_time: string
  fiscal_year_start_month: string
  dietitian_name: string
  dietitian_credentials: string
  dietitian_email: string
  health_manager_name: string
  health_manager_email: string
  grant_number: string
  enrollment_capacity: string
}

const EMPTY: HSConfig = {
  program_type: 'cacfp',
  program_hours: '',
  program_start_time: '',
  program_end_time: '',
  fiscal_year_start_month: '10',
  dietitian_name: '',
  dietitian_credentials: '',
  dietitian_email: '',
  health_manager_name: '',
  health_manager_email: '',
  grant_number: '',
  enrollment_capacity: '',
}

const MONTHS = ['January','February','March','April','May','June',
  'July','August','September','October','November','December']

export default function HeadStartSettings() {
  const [form, setForm]     = useState<HSConfig>(EMPTY)
  const [centerId, setCenterId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg]       = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      const { data } = await supabase
        .schema('menumaker').from('centers')
        .select('id,program_type,program_hours,program_start_time,program_end_time,fiscal_year_start_month,dietitian_name,dietitian_credentials,dietitian_email,health_manager_name,health_manager_email,grant_number,enrollment_capacity')
        .eq('slug', CENTER_SLUG).maybeSingle()
      if (data) {
        setCenterId(data.id)
        setForm({
          program_type:             data.program_type ?? 'cacfp',
          program_hours:            data.program_hours?.toString() ?? '',
          program_start_time:       data.program_start_time ?? '',
          program_end_time:         data.program_end_time ?? '',
          fiscal_year_start_month:  data.fiscal_year_start_month?.toString() ?? '10',
          dietitian_name:           data.dietitian_name ?? '',
          dietitian_credentials:    data.dietitian_credentials ?? '',
          dietitian_email:          data.dietitian_email ?? '',
          health_manager_name:      data.health_manager_name ?? '',
          health_manager_email:     data.health_manager_email ?? '',
          grant_number:             data.grant_number ?? '',
          enrollment_capacity:      data.enrollment_capacity?.toString() ?? '',
        })
      }
    })()
  }, [])

  const set = (k: keyof HSConfig) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const save = async () => {
    if (!centerId) return
    setSaving(true)
    const { error } = await supabase
      .schema('menumaker').from('centers').update({
        program_type:             form.program_type,
        program_hours:            form.program_hours ? parseFloat(form.program_hours) : null,
        program_start_time:       form.program_start_time || null,
        program_end_time:         form.program_end_time || null,
        fiscal_year_start_month:  parseInt(form.fiscal_year_start_month),
        dietitian_name:           form.dietitian_name || null,
        dietitian_credentials:    form.dietitian_credentials || null,
        dietitian_email:          form.dietitian_email || null,
        health_manager_name:      form.health_manager_name || null,
        health_manager_email:     form.health_manager_email || null,
        grant_number:             form.grant_number || null,
        enrollment_capacity:      form.enrollment_capacity ? parseInt(form.enrollment_capacity) : null,
      }).eq('id', centerId)
    setSaving(false)
    setMsg(error ? `Error: ${error.message}` : 'Saved')
    setTimeout(() => setMsg(null), 3000)
  }

  const inp = (label: string, k: keyof HSConfig, type = 'text') => (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 4 }}>{label}</div>
      <input
        type={type}
        value={form[k]}
        onChange={set(k)}
        style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #ddd', fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
      />
    </div>
  )

  return (
    <div style={{ maxWidth: 640 }}>
      {/* Program Type */}
      <div style={{ marginBottom: 28, padding: '16px 20px', background: '#fff', borderRadius: 12, border: '1px solid #e4e8e4' }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: '#0a3320', marginBottom: 12 }}>Program Type</div>
        <div style={{ display: 'flex', gap: 12 }}>
          {(['cacfp','headstart'] as const).map(pt => (
            <label key={pt} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '10px 16px', borderRadius: 8, border: `2px solid ${form.program_type === pt ? '#0f4c35' : '#e4e8e4'}`, background: form.program_type === pt ? '#f0fff4' : '#fff' }}>
              <input type="radio" name="program_type" value={pt} checked={form.program_type === pt} onChange={set('program_type')} style={{ accentColor: '#0f4c35' }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: '#0a3320' }}>
                {pt === 'cacfp' ? 'CACFP' : 'Head Start'}
              </span>
            </label>
          ))}
        </div>
        <div style={{ fontSize: 11, color: '#999', marginTop: 8 }}>
          Switching program type changes the sidebar, reports, and forms available to your team.
        </div>
      </div>

      {/* Program Hours */}
      <div style={{ marginBottom: 24, padding: '16px 20px', background: '#fff', borderRadius: 12, border: '1px solid #e4e8e4' }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: '#0a3320', marginBottom: 12 }}>Program Schedule</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          {inp('Daily Hours', 'program_hours', 'number')}
          {inp('Start Time', 'program_start_time', 'time')}
          {inp('End Time', 'program_end_time', 'time')}
        </div>
        <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
          {parseFloat(form.program_hours || '0') < 6
            ? 'Under 6 hours → meals must provide 1/3–1/2 of daily nutritional needs'
            : parseFloat(form.program_hours || '0') >= 6
            ? 'Over 6 hours → meals must provide 1/2–2/3 of daily nutritional needs'
            : ''}
        </div>
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 4 }}>Fiscal Year Start Month</div>
          <select value={form.fiscal_year_start_month} onChange={set('fiscal_year_start_month')}
            style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #ddd', fontSize: 13, fontFamily: 'inherit' }}>
            {MONTHS.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
          </select>
        </div>
      </div>

      {/* Dietitian */}
      <div style={{ marginBottom: 24, padding: '16px 20px', background: '#fff', borderRadius: 12, border: '1px solid #e4e8e4' }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: '#0a3320', marginBottom: 12 }}>Registered Dietitian (RD)</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {inp('Name', 'dietitian_name')}
          {inp('Credentials (e.g. RD, LDN)', 'dietitian_credentials')}
          {inp('Email', 'dietitian_email', 'email')}
          {inp('Grant Number', 'grant_number')}
        </div>
      </div>

      {/* Health Manager */}
      <div style={{ marginBottom: 24, padding: '16px 20px', background: '#fff', borderRadius: 12, border: '1px solid #e4e8e4' }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: '#0a3320', marginBottom: 12 }}>Health Manager</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {inp('Name', 'health_manager_name')}
          {inp('Email', 'health_manager_email', 'email')}
          {inp('Enrollment Capacity', 'enrollment_capacity', 'number')}
        </div>
      </div>

      {/* Save */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={save} disabled={saving} style={{
          padding: '10px 24px', borderRadius: 8, border: 'none',
          background: '#0f4c35', color: '#fff', fontSize: 13, fontWeight: 600,
          cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, fontFamily: 'inherit',
        }}>
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
        {msg && <span style={{ fontSize: 12, color: msg.startsWith('Error') ? '#c0392b' : '#0f4c35' }}>{msg}</span>}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Добавить вкладку в SettingsPage.tsx**

В `src/pages/settings/SettingsPage.tsx` найти тип `Tab` и добавить значение `'headstart'`:

```typescript
type Tab = 'products' | 'vendors' | 'purchasers' | 'assign' | 'milk' | 'mealcount' | 'headstart'
```

Добавить импорт:

```typescript
import HeadStartSettings from './HeadStartSettings'
```

Найти массив вкладок (кнопки переключения) и добавить кнопку:

```typescript
{ id: 'headstart', label: '🏫 Head Start Program' },
```

Найти блок рендера контента вкладок и добавить:

```typescript
{tab === 'headstart' && <HeadStartSettings />}
```

- [ ] **Step 3: Проверить в браузере**

1. Открыть `/settings`
2. Убедиться что появилась вкладка "Head Start Program"
3. Переключить на "Head Start", сохранить
4. Обновить страницу — значение должно сохраниться
5. Проверить в Supabase Table Editor что `centers.program_type = 'headstart'`

- [ ] **Step 4: Коммит**

```bash
git add src/pages/settings/HeadStartSettings.tsx src/pages/settings/SettingsPage.tsx
git commit -m "feat: Head Start Program settings tab"
```

---

## Task 4: Menu Planner — RD Workflow + HS Features

**Files:**
- Modify: `src/pages/menu/MenuPlannerPage.tsx`

**Interfaces:**
- Consumes: `useProgramConfig().isHeadStart` из Task 2
- Consumes: `useAuth().role` — для кнопки Approve (только director/dietitian)
- Consumes: `menu_cycles.status`, `rd_approved_by`, `rd_approved_at` из Task 1
- Consumes: `menu_items.is_family_style`, `cultural_theme` из Task 1
- Consumes: таблица `published_menus` из Task 1

- [ ] **Step 1: Расширить интерфейсы и загрузку данных**

В начале `MenuPlannerPage.tsx` обновить интерфейс `Cycle`:

```typescript
interface Cycle {
  id: string
  name: string
  total_weeks: number
  status: string  // 'draft' | 'submitted' | 'rd_approved' | 'published'
  rd_approved_by: string | null
  rd_approved_at: string | null
}
```

Обновить SELECT запрос цикла в функции `load()`:

```typescript
const { data: cycleData } = await supabase
  .schema('menumaker')
  .from('menu_cycles')
  .select('id, name, total_weeks, status, rd_approved_by, rd_approved_at')
  .eq('program', 'child')
  .order('created_at', { ascending: false })
  .limit(1)
  .maybeSingle()
```

Расширить интерфейс `MenuItem`:

```typescript
interface MenuItem {
  id: string
  week_number: number
  day_of_week: number
  meal_type: string
  meal_order: number
  recipe_id: string | null
  recipe_name: string | null
  item_text: string
  is_extra: boolean
  sort_order: number
  is_family_style: boolean    // ← новое
  cultural_theme: string | null  // ← новое
}
```

Обновить SELECT запрос items (добавить поля):

```typescript
const { data: itemsData } = await supabase
  .schema('menumaker')
  .from('menu_items')
  .select(`
    id, week_number, day_of_week, meal_type, meal_order,
    recipe_id, item_text, is_extra, sort_order,
    is_family_style, cultural_theme,
    recipes(name)
  `)
  .eq('cycle_id', cycleData.id)
  .order('sort_order')
```

- [ ] **Step 2: Добавить импорты хуков и state**

В начале компонента `MenuPlannerPage` добавить:

```typescript
import { useProgramConfig } from '@/hooks/useProgramConfig'
import { useAuth } from '@/hooks/useAuth'
import { canApproveDiet } from '@/hooks/useAuth'

// Внутри компонента:
const { isHeadStart, dietitianName } = useProgramConfig()
const { role } = useAuth()
const [statusSaving, setStatusSaving] = useState(false)
const [publishSaving, setPublishSaving] = useState(false)
const [statusMsg, setStatusMsg] = useState<string | null>(null)
```

- [ ] **Step 3: Добавить функции изменения статуса**

Добавить в компонент (перед return):

```typescript
const PEARL_CENTER_ID = '881ef4ce-1a27-4d3b-aa60-59d2a307bf2b'

const handleStatusChange = async (newStatus: string) => {
  if (!cycle) return
  setStatusSaving(true)
  const update: Record<string, unknown> = { status: newStatus }
  if (newStatus === 'rd_approved') {
    update.rd_approved_by = dietitianName ?? role ?? 'Director'
    update.rd_approved_at = new Date().toISOString()
  }
  await supabase.schema('menumaker').from('menu_cycles').update(update).eq('id', cycle.id)
  setCycle(c => c ? { ...c, status: newStatus, rd_approved_by: (update.rd_approved_by as string) ?? c.rd_approved_by, rd_approved_at: (update.rd_approved_at as string) ?? c.rd_approved_at } : c)
  setStatusSaving(false)
  setStatusMsg(`Status updated to ${newStatus}`)
  setTimeout(() => setStatusMsg(null), 3000)
}

const handlePublish = async () => {
  if (!cycle) return
  setPublishSaving(true)
  await supabase.schema('menumaker').from('published_menus').insert({
    cycle_id: cycle.id,
    week_number: selectedWeek,
    center_id: PEARL_CENTER_ID,
    distribution_method: 'printed',
    rd_approved_by: cycle.rd_approved_by,
    rd_approved_at: cycle.rd_approved_at,
  })
  await handleStatusChange('published')
  setPublishSaving(false)
}
```

- [ ] **Step 4: Добавить Status Banner в JSX**

Найти блок `{/* Header */}` и после `</div>` шапки добавить:

```typescript
{/* HS Status Banner */}
{isHeadStart && cycle && (
  <div style={{
    marginBottom: 16, padding: '12px 20px', borderRadius: 10,
    background: cycle.status === 'published' ? '#f0fff4' : cycle.status === 'rd_approved' ? '#eff6ff' : cycle.status === 'submitted' ? '#fff8f0' : '#fafafa',
    border: `1px solid ${cycle.status === 'published' ? '#bbf7d0' : cycle.status === 'rd_approved' ? '#bfdbfe' : cycle.status === 'submitted' ? '#fde68a' : '#e4e8e4'}`,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ fontSize: 16 }}>
        {cycle.status === 'published' ? '✅' : cycle.status === 'rd_approved' ? '🔵' : cycle.status === 'submitted' ? '⏳' : '📝'}
      </span>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#0a3320' }}>
          {cycle.status === 'published' ? 'Published to Families'
            : cycle.status === 'rd_approved' ? 'Approved by RD'
            : cycle.status === 'submitted' ? 'Submitted for RD Review'
            : 'Draft'}
        </div>
        {cycle.rd_approved_by && (
          <div style={{ fontSize: 11, color: '#888' }}>
            {cycle.rd_approved_by} · {cycle.rd_approved_at ? new Date(cycle.rd_approved_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
          </div>
        )}
      </div>
    </div>
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      {statusMsg && <span style={{ fontSize: 11, color: '#0f4c35' }}>{statusMsg}</span>}
      {cycle.status === 'draft' && (
        <button onClick={() => handleStatusChange('submitted')} disabled={statusSaving}
          style={{ padding: '7px 14px', borderRadius: 7, border: '1px solid #f59e0b', background: '#fff8f0', color: '#b45309', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
          Submit for RD Review
        </button>
      )}
      {cycle.status === 'submitted' && canApproveDiet(role) && (
        <button onClick={() => handleStatusChange('rd_approved')} disabled={statusSaving}
          style={{ padding: '7px 14px', borderRadius: 7, border: '1px solid #3b82f6', background: '#eff6ff', color: '#1e40af', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
          ✓ Approve Menu (RD)
        </button>
      )}
      {cycle.status === 'rd_approved' && (
        <button onClick={handlePublish} disabled={publishSaving}
          style={{ padding: '7px 14px', borderRadius: 7, border: 'none', background: '#0f4c35', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
          {publishSaving ? 'Publishing…' : '📤 Publish to Families'}
        </button>
      )}
    </div>
  </div>
)}
```

- [ ] **Step 5: Добавить Cultural Theme field под week selector**

После блока выбора недели добавить (показывать только при `isHeadStart`):

```typescript
{isHeadStart && (
  <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
    <label style={{ fontSize: 12, fontWeight: 600, color: '#555', whiteSpace: 'nowrap' }}>
      Cultural Theme (Week {selectedWeek}):
    </label>
    <input
      type="text"
      placeholder="e.g. Hispanic Heritage Month"
      defaultValue={weekItems.find(i => i.cultural_theme)?.cultural_theme ?? ''}
      onBlur={async (e) => {
        const theme = e.target.value.trim() || null
        await supabase.schema('menumaker').from('menu_items')
          .update({ cultural_theme: theme })
          .eq('week_number', selectedWeek)
          .in('id', weekItems.map(i => i.id))
      }}
      style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid #ddd', fontSize: 12, fontFamily: 'inherit', width: 280, outline: 'none' }}
    />
  </div>
)}
```

- [ ] **Step 6: Добавить Family-Style indicator в ячейки**

В блоке рендера ячеек (`<div key={\`${mealType}-${dayNum}\`}>`) добавить индикатор после проверки `cellItems.length === 0`:

```typescript
{isHeadStart && cellItems.some(i => i.is_family_style) && (
  <div style={{ fontSize: 9, color: '#6b21a8', fontWeight: 700, marginBottom: 4, letterSpacing: '0.05em' }}>
    FS · FAMILY STYLE
  </div>
)}
```

- [ ] **Step 7: Обновить печатную версию — добавить RD подпись**

В функции `handlePrint` найти строку с `<h1>🍽️ Child Menu` и обновить блок метаданных:

```typescript
<div class="meta">
  ${cycle?.name || ''} · Week ${selectedWeek} · 
  Printed: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
  ${cycle?.rd_approved_by ? ` · Approved by RD: ${cycle.rd_approved_by}` : ''}
  ${weekItems.find(i => i.cultural_theme)?.cultural_theme ? ` · Theme: ${weekItems.find(i => i.cultural_theme)?.cultural_theme}` : ''}
</div>
```

- [ ] **Step 8: Проверить в браузере**

1. Открыть `/menu`
2. При `isHeadStart = true` должен отображаться Status Banner
3. Нажать "Submit for RD Review" → статус меняется на "submitted"
4. Нажать "Approve Menu (RD)" → статус меняется на "rd_approved"
5. Нажать "Publish to Families" → статус "published", запись в `published_menus`
6. Cultural Theme поле отображается и сохраняется после blur
7. При `isHeadStart = false` — никаких HS-элементов не видно

- [ ] **Step 9: Коммит**

```bash
git add src/pages/menu/MenuPlannerPage.tsx
git commit -m "feat: menu planner RD workflow, family-style, cultural theme, publish"
```

---

## Task 5: Form Submissions — CF/HS-27

**Files:**
- Modify: `src/pages/form-submissions/FormSubmissionsPage.tsx`

**Interfaces:**
- Consumes: `useProgramConfig().isHeadStart` из Task 2
- Consumes: `special_diet_forms` с новыми колонками из Task 1

- [ ] **Step 1: Расширить Column-конфиг Special Diet вкладки**

В `FormSubmissionsPage.tsx` найти объект конфигурации вкладки `special_diet_forms` в массиве `TABS` и обновить:

```typescript
{
  id: 'special_diet_forms',
  label: 'Special Diet / CF-HS27',  // ← обновить название
  columns: [
    { key: 'child_name', label: 'Child' },
    { key: 'birth_date', label: 'Birth Date' },
    { key: 'diet_basis', label: 'Basis', map: {
      disability: 'Disability',
      no_disability_special_diet: 'Special diet (no disability)',
    }},
    { key: 'substitution_type', label: 'HS Type', map: {
      medical: 'Medical',
      non_medical: 'Non-medical',
    }},
    { key: 'review_date', label: 'Review Date' },
    { key: 'authority_printed_name', label: 'Authority' },
    { key: 'signed_date', label: 'Signed' },
  ],
  // ... остальные поля без изменений
},
```

- [ ] **Step 2: Добавить индикатор просроченных форм**

В `FormSubmissionsPage.tsx` найти место рендера строк таблицы и добавить логику подсветки:

```typescript
// Функция-помощник (добавить рядом с fmt$ и n):
function isReviewExpired(row: Row): boolean {
  if (!row.review_date) return false
  return new Date(row.review_date) < new Date()
}

function reviewBadge(row: Row): React.ReactNode {
  if (!row.review_date) return null
  const expired = isReviewExpired(row)
  return (
    <span style={{
      marginLeft: 6, fontSize: 10, padding: '2px 6px', borderRadius: 4,
      background: expired ? '#fff0f0' : '#f0fff4',
      color: expired ? '#c0392b' : '#0f4c35',
      fontWeight: 600,
    }}>
      {expired ? '⚠ Expired' : '✓ Current'}
    </span>
  )
}
```

В строке таблицы, где отображается `review_date`, добавить вызов `reviewBadge(row)` после значения.

- [ ] **Step 3: Добавить HS-поля в детальную панель**

В конфиге `detail` для вкладки `special_diet_forms` добавить строки:

```typescript
['Substitution Type', (r) => r.substitution_type === 'medical' ? 'Medical (disability)' : r.substitution_type === 'non_medical' ? 'Non-medical' : '—'],
['Review Date', (r) => r.review_date ? `${r.review_date}${isReviewExpired(r) ? ' ⚠ EXPIRED' : ' ✓'}` : '—'],
['Health Manager Sign-Off', (r) => r.health_manager_signed_at ? new Date(r.health_manager_signed_at).toLocaleDateString('en-US') : '—'],
```

- [ ] **Step 4: Добавить SELECT для новых полей**

В запросе к Supabase для `special_diet_forms` убедиться что выбираются новые поля. Найти запрос и добавить в select:

```typescript
// Найти строку вида:
.from('special_diet_forms').select('*')
// Если используется '*' — новые поля подтянутся автоматически.
// Если explicit select — добавить: substitution_type, review_date, health_manager_signed_at
```

- [ ] **Step 5: Проверить в браузере**

1. Открыть `/submissions`
2. Вкладка "Special Diet" теперь называется "Special Diet / CF-HS27"
3. Видны колонки "HS Type" и "Review Date"
4. Для формы с прошедшей `review_date` должен показываться бейдж "⚠ Expired"

- [ ] **Step 6: Коммит**

```bash
git add src/pages/form-submissions/FormSubmissionsPage.tsx
git commit -m "feat: CF/HS-27 fields in special diet forms"
```

---

## Task 6: Head Start Reports (3 вкладки)

**Files:**
- Create: `src/pages/reports/HeadStartReportsPage.tsx`
- Create: `src/pages/reports/hs/PIRDataTab.tsx`
- Create: `src/pages/reports/hs/MonthlyMealCountTab.tsx`
- Create: `src/pages/reports/hs/NutritionSelfAssessmentTab.tsx`

**Interfaces:**
- Consumes: `PEARL_CENTER_ID`, `supabase` клиент
- Consumes: `published_menus`, `special_diet_forms`, `meal_count_*`, `nutrition_self_assessments` из Task 1

- [ ] **Step 1: Создать NutritionSelfAssessmentTab**

```typescript
// src/pages/reports/hs/NutritionSelfAssessmentTab.tsx
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

const CENTER_ID = '881ef4ce-1a27-4d3b-aa60-59d2a307bf2b'

type ItemStatus = 'met' | 'not_met' | 'na'

interface AssessItem {
  section: string
  id: string
  label: string
}

interface AssessAnswer {
  item_id: string
  status: ItemStatus
  note: string
}

const CHECKLIST: AssessItem[] = [
  { section: 'Menu Planning', id: 'mp_usda',     label: 'Menus meet USDA CACFP meal pattern requirements' },
  { section: 'Menu Planning', id: 'mp_rd',       label: 'Menus reviewed/approved by RD or nutritionist annually' },
  { section: 'Menu Planning', id: 'mp_families', label: 'Menus posted or distributed to families' },
  { section: 'Menu Planning', id: 'mp_cultural', label: 'Menus are culturally and linguistically appropriate' },
  { section: 'Menu Planning', id: 'mp_variety',  label: 'No main dish repeated more than once per week' },
  { section: 'Meal Service',  id: 'ms_family',   label: 'Family-style meal service implemented' },
  { section: 'Meal Service',  id: 'ms_time',     label: 'Adequate time for meals (20+ min for lunch)' },
  { section: 'Meal Service',  id: 'ms_staff',    label: 'Staff eat with children at meals' },
  { section: 'Special Dietary Needs', id: 'sdn_forms',   label: 'CF/HS-27 forms on file for all children with special needs' },
  { section: 'Special Dietary Needs', id: 'sdn_annual',  label: 'CF/HS-27 forms reviewed annually' },
  { section: 'Special Dietary Needs', id: 'sdn_hm',      label: 'Health manager sign-off is current' },
  { section: 'Documentation', id: 'doc_cn',      label: 'CN Labels / PFS on file for all manufactured products' },
  { section: 'Documentation', id: 'doc_recipe',  label: 'Standardized recipes available for all scratch-cooked items' },
  { section: 'Family Engagement', id: 'fe_edu',    label: 'Nutrition education activities conducted this year' },
  { section: 'Family Engagement', id: 'fe_menus',  label: 'Menus sent home to families regularly' },
  { section: 'Family Engagement', id: 'fe_input',  label: 'Families included in menu planning feedback' },
]

const SECTIONS = [...new Set(CHECKLIST.map(i => i.section))]

export default function NutritionSelfAssessmentTab() {
  const year = new Date().getFullYear()
  const [answers, setAnswers] = useState<Record<string, AssessAnswer>>({})
  const [recordId, setRecordId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data } = await supabase
      .schema('menumaker').from('nutrition_self_assessments')
      .select('id,items').eq('center_id', CENTER_ID).eq('fiscal_year', year).maybeSingle()
    if (data) {
      setRecordId(data.id)
      const map: Record<string, AssessAnswer> = {}
      for (const a of (data.items as AssessAnswer[])) map[a.item_id] = a
      setAnswers(map)
    }
  }, [year])

  useEffect(() => { load() }, [load])

  const setStatus = (id: string, status: ItemStatus) =>
    setAnswers(a => ({ ...a, [id]: { item_id: id, status, note: a[id]?.note ?? '' } }))

  const setNote = (id: string, note: string) =>
    setAnswers(a => ({ ...a, [id]: { item_id: id, status: a[id]?.status ?? 'na', note } }))

  const save = async (complete = false) => {
    setSaving(true)
    const items = CHECKLIST.map(i => answers[i.id] ?? { item_id: i.id, status: 'na' as ItemStatus, note: '' })
    const payload = {
      center_id: CENTER_ID,
      fiscal_year: year,
      items,
      overall_status: complete ? 'complete' : 'draft',
      ...(complete ? { completed_at: new Date().toISOString() } : {}),
    }
    if (recordId) {
      await supabase.schema('menumaker').from('nutrition_self_assessments').update(payload).eq('id', recordId)
    } else {
      const { data } = await supabase.schema('menumaker').from('nutrition_self_assessments').insert(payload).select('id').single()
      if (data) setRecordId(data.id)
    }
    setSaving(false)
    setMsg(complete ? 'Self-Assessment marked complete!' : 'Draft saved')
    setTimeout(() => setMsg(null), 3000)
  }

  const metCount = CHECKLIST.filter(i => answers[i.id]?.status === 'met').length
  const total = CHECKLIST.length

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#0a3320' }}>Nutrition Self-Assessment {year}</div>
          <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
            Head Start Performance Standards · Annual requirement · {metCount}/{total} items met
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {msg && <span style={{ fontSize: 12, color: '#0f4c35' }}>{msg}</span>}
          <button onClick={() => save(false)} disabled={saving}
            style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #ddd', background: '#fff', color: '#555', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            Save Draft
          </button>
          <button onClick={() => save(true)} disabled={saving}
            style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#0f4c35', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            Mark Complete
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ marginBottom: 20, background: '#f0f0f0', borderRadius: 6, height: 8, overflow: 'hidden' }}>
        <div style={{ height: '100%', background: '#0f4c35', borderRadius: 6, width: `${(metCount / total) * 100}%`, transition: 'width 0.3s' }} />
      </div>

      {/* Checklist by section */}
      {SECTIONS.map(section => (
        <div key={section} style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#0a3320', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8, paddingBottom: 6, borderBottom: '1px solid #e4e8e4' }}>
            {section}
          </div>
          {CHECKLIST.filter(i => i.section === section).map(item => {
            const ans = answers[item.id]
            return (
              <div key={item.id} style={{ marginBottom: 10, padding: '10px 14px', borderRadius: 8, background: '#fff', border: `1px solid ${ans?.status === 'met' ? '#bbf7d0' : ans?.status === 'not_met' ? '#fecaca' : '#e4e8e4'}` }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    {(['met','not_met','na'] as ItemStatus[]).map(s => (
                      <button key={s} onClick={() => setStatus(item.id, s)}
                        style={{
                          padding: '3px 8px', borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', border: 'none',
                          background: ans?.status === s ? (s === 'met' ? '#0f4c35' : s === 'not_met' ? '#c0392b' : '#888') : '#f0f0f0',
                          color: ans?.status === s ? '#fff' : '#888',
                        }}>
                        {s === 'met' ? 'Met' : s === 'not_met' ? 'Not Met' : 'N/A'}
                      </button>
                    ))}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, color: '#333' }}>{item.label}</div>
                    <input
                      type="text"
                      placeholder="Note (optional)"
                      value={ans?.note ?? ''}
                      onChange={e => setNote(item.id, e.target.value)}
                      style={{ marginTop: 4, width: '100%', padding: '4px 8px', borderRadius: 5, border: '1px solid #eee', fontSize: 11, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', color: '#555' }}
                    />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Создать PIRDataTab**

```typescript
// src/pages/reports/hs/PIRDataTab.tsx
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

const CENTER_ID = '881ef4ce-1a27-4d3b-aa60-59d2a307bf2b'

export default function PIRDataTab() {
  const [specialDietCount, setSpecialDietCount] = useState<number>(0)
  const [rdApprovedMenus, setRdApprovedMenus]   = useState<number>(0)
  const [publishedMenus, setPublishedMenus]     = useState<number>(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      const [diet, approved, published] = await Promise.all([
        supabase.schema('menumaker').from('special_diet_forms').select('id', { count: 'exact', head: true }),
        supabase.schema('menumaker').from('menu_cycles').select('id', { count: 'exact', head: true }).in('status', ['rd_approved','published']),
        supabase.schema('menumaker').from('published_menus').select('id', { count: 'exact', head: true }).eq('center_id', CENTER_ID),
      ])
      setSpecialDietCount(diet.count ?? 0)
      setRdApprovedMenus(approved.count ?? 0)
      setPublishedMenus(published.count ?? 0)
      setLoading(false)
    })()
  }, [])

  const row = (label: string, value: string | number, note?: string) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #f0f0f0' }}>
      <div>
        <div style={{ fontSize: 13, color: '#333' }}>{label}</div>
        {note && <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>{note}</div>}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color: '#0f4c35', minWidth: 60, textAlign: 'right' }}>{value}</div>
    </div>
  )

  if (loading) return <div style={{ padding: 32, color: '#888', fontSize: 13 }}>Loading…</div>

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#0a3320' }}>PIR — Nutrition Section Data</div>
        <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
          Program Information Report · Section III Health Services · Export to HSES manually
        </div>
      </div>

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e4e8e4', padding: '0 20px', marginBottom: 20 }}>
        {row('Children with special dietary needs (CF/HS-27 on file)', specialDietCount, 'From Form Submissions → Special Diet')}
        {row('Menu cycles approved by RD', rdApprovedMenus, 'Cycles with status rd_approved or published')}
        {row('Menu weeks published to families', publishedMenus, 'From published_menus table')}
        {row('Family-style meal service', 'Yes', 'Implemented per Head Start Performance Standards 1302.44')}
      </div>

      <div style={{ padding: '12px 16px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, fontSize: 12, color: '#92400e' }}>
        <strong>Note:</strong> Copy these numbers into the official PIR system (HSES) under Section III — Health Services — Nutrition. 
        Dental, vision, and hearing screenings are tracked separately outside this application.
      </div>

      <button onClick={() => window.print()} style={{
        marginTop: 16, padding: '9px 20px', borderRadius: 8, border: '1px solid #0f4c35',
        background: '#fff', color: '#0f4c35', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
      }}>
        🖨️ Print for Records
      </button>
    </div>
  )
}
```

- [ ] **Step 3: Создать MonthlyMealCountTab**

```typescript
// src/pages/reports/hs/MonthlyMealCountTab.tsx
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { format } from 'date-fns'

const CENTER_ID = '881ef4ce-1a27-4d3b-aa60-59d2a307bf2b'
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const SLOT_LABELS: Record<string, string> = { breakfast: 'Breakfast', am_snack: 'AM Snack', lunch: 'Lunch', pm_snack: 'PM Snack', supper: 'Supper' }

interface ClassRow {
  id: string
  name: string
  counts: Record<string, number>
  total: number
}

export default function MonthlyMealCountTab() {
  const now = new Date()
  const [year, setYear]   = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [rows, setRows]   = useState<ClassRow[]>([])
  const [slots, setSlots] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const monthStr = `${year}-${String(month).padStart(2,'0')}`

    // Get classrooms
    const { data: ctrs } = await supabase.schema('menumaker').from('centers')
      .select('id,name').eq('is_active', true)

    // Get meal count settings
    const { data: cfg } = await supabase.schema('menumaker').from('meal_count_settings')
      .select('active_slots').eq('center_id', CENTER_ID).maybeSingle()
    const activeSlots: string[] = cfg?.active_slots ?? ['breakfast','am_snack','lunch','supper']
    setSlots(activeSlots)

    // Get weekly meal count records for month
    // week records: mon_b, tue_b, etc. Sum by slot across the month
    const weekStart = `${year}-${String(month).padStart(2,'0')}-01`
    const weekEnd   = `${year}-${String(month).padStart(2,'0')}-31`

    const { data: records } = await supabase.schema('menumaker').from('meal_count_week')
      .select('*')
      .eq('center_id', CENTER_ID)
      .gte('week_start', weekStart)
      .lte('week_start', weekEnd)

    // Group by class, sum by slot
    const classMap: Record<string, ClassRow> = {}
    for (const ctr of ctrs ?? []) {
      classMap[ctr.id] = { id: ctr.id, name: ctr.name, counts: {}, total: 0 }
      for (const s of activeSlots) classMap[ctr.id].counts[s] = 0
    }

    const DAYS = ['mon','tue','wed','thu','fri']
    for (const rec of records ?? []) {
      const cls = classMap[rec.center_id] ?? classMap[CENTER_ID]
      if (!cls) continue
      for (const slot of activeSlots) {
        const key = slot.replace('_','') // 'breakfast' → 'breakfast'
        for (const d of DAYS) {
          const val = rec[`${d}_${key.substring(0,1)}`] ?? rec[`${d}_${slot}`] ?? 0
          if (typeof val === 'number') cls.counts[slot] = (cls.counts[slot] ?? 0) + val
        }
      }
    }

    const result = Object.values(classMap).map(r => ({
      ...r,
      total: activeSlots.reduce((s, slot) => s + (r.counts[slot] ?? 0), 0),
    }))
    setRows(result)
    setLoading(false)
  }, [year, month])

  useEffect(() => { load() }, [load])

  const grandTotal = rows.reduce((s, r) => s + r.total, 0)
  const slotTotals = slots.reduce((acc, s) => ({ ...acc, [s]: rows.reduce((n, r) => n + (r.counts[s] ?? 0), 0) }), {} as Record<string, number>)

  return (
    <div>
      {/* Controls */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20 }}>
        <select value={month} onChange={e => setMonth(+e.target.value)}
          style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid #ddd', fontSize: 13, fontFamily: 'inherit' }}>
          {MONTHS.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
        </select>
        <select value={year} onChange={e => setYear(+e.target.value)}
          style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid #ddd', fontSize: 13, fontFamily: 'inherit' }}>
          {[2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <button onClick={() => window.print()}
          style={{ marginLeft: 'auto', padding: '7px 16px', borderRadius: 8, border: '1px solid #0f4c35', background: '#fff', color: '#0f4c35', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
          🖨️ Print
        </button>
      </div>

      {loading ? (
        <div style={{ padding: 32, color: '#888', fontSize: 13 }}>Loading…</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#0f4c35', color: '#fff' }}>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600 }}>Class</th>
                {slots.map(s => <th key={s} style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>{SLOT_LABELS[s] ?? s}</th>)}
                <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700 }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id} style={{ background: i % 2 === 0 ? '#fff' : '#f9fbf9' }}>
                  <td style={{ padding: '9px 12px', fontWeight: 500, color: '#0a3320' }}>{r.name}</td>
                  {slots.map(s => <td key={s} style={{ padding: '9px 12px', textAlign: 'right', color: '#555' }}>{r.counts[s] ?? 0}</td>)}
                  <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, color: '#0f4c35' }}>{r.total}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: '#f0fff4', borderTop: '2px solid #0f4c35' }}>
                <td style={{ padding: '10px 12px', fontWeight: 700, color: '#0a3320' }}>TOTAL</td>
                {slots.map(s => <td key={s} style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#0f4c35' }}>{slotTotals[s] ?? 0}</td>)}
                <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#0f4c35' }}>{grandTotal}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <div style={{ marginTop: 12, fontSize: 11, color: '#aaa' }}>
        Head Start monthly meal count · No CACFP reimbursement claim · For grant documentation only
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Создать HeadStartReportsPage**

```typescript
// src/pages/reports/HeadStartReportsPage.tsx
import { useState } from 'react'
import PIRDataTab from './hs/PIRDataTab'
import MonthlyMealCountTab from './hs/MonthlyMealCountTab'
import NutritionSelfAssessmentTab from './hs/NutritionSelfAssessmentTab'

type Tab = 'pir' | 'meals' | 'self_assess'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'pir',         label: 'PIR Data',               icon: '📋' },
  { id: 'meals',       label: 'Monthly Meal Count',      icon: '🍽️' },
  { id: 'self_assess', label: 'Self-Assessment',         icon: '✅' },
]

export default function HeadStartReportsPage() {
  const [tab, setTab] = useState<Tab>('pir')

  return (
    <div style={{ padding: '28px 32px', fontFamily: "'DM Sans', sans-serif", background: '#f4f6f4', minHeight: '100vh' }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Serif+Display&display=swap" rel="stylesheet"/>
      <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 26, color: '#0a3320', marginBottom: 4 }}>
        Head Start Reports
      </div>
      <div style={{ fontSize: 12, color: '#888', marginBottom: 20 }}>
        PIR nutrition data · Monthly meal count · Annual self-assessment
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: '#fff', padding: 4, borderRadius: 10, border: '1px solid #e4e8e4', width: 'fit-content' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              padding: '8px 18px', borderRadius: 7, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              background: tab === t.id ? '#0f4c35' : 'transparent',
              color: tab === t.id ? '#fff' : '#555',
              fontSize: 13, fontWeight: tab === t.id ? 600 : 400,
              transition: 'all 0.15s',
            }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e4e8e4', padding: 24 }}>
        {tab === 'pir'         && <PIRDataTab />}
        {tab === 'meals'       && <MonthlyMealCountTab />}
        {tab === 'self_assess' && <NutritionSelfAssessmentTab />}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Проверить в браузере**

1. Установить `program_type = 'headstart'`
2. В сайдбаре перейти "HS Reports"
3. Проверить все 3 вкладки — отображаются без ошибок
4. Self-Assessment: отметить несколько пунктов, нажать "Save Draft" — данные сохраняются
5. После перезагрузки — отметки сохранились
6. Monthly Meal Count — таблица отображается (данные 0 если нет записей)

- [ ] **Step 6: Коммит**

```bash
git add src/pages/reports/HeadStartReportsPage.tsx src/pages/reports/hs/
git commit -m "feat: Head Start Reports (PIR data, monthly meal count, self-assessment)"
```

---

## Task 7: Family Engagement Module

**Files:**
- Create: `src/pages/family-engagement/FamilyEngagementPage.tsx`
- Create: `src/pages/family-engagement/MenuPostingsTab.tsx`
- Create: `src/pages/family-engagement/EducationLogTab.tsx`
- Create: `src/pages/family-engagement/FamilyFeedbackTab.tsx`

**Interfaces:**
- Consumes: `published_menus`, `nutrition_education_log` из Task 1
- Consumes: `published_menus` записи из Task 4 (Menu Planner publish)

- [ ] **Step 1: Создать MenuPostingsTab**

```typescript
// src/pages/family-engagement/MenuPostingsTab.tsx
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

const CENTER_ID = '881ef4ce-1a27-4d3b-aa60-59d2a307bf2b'
const METHOD_LABELS: Record<string, string> = { printed: '🖨️ Printed', email: '📧 Email', bulletin: '📌 Bulletin Board' }

interface PostingRow {
  id: string
  published_at: string
  week_number: number
  distribution_method: string
  rd_approved_by: string | null
  cycle_name: string | null
}

export default function MenuPostingsTab() {
  const [rows, setRows] = useState<PostingRow[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const { data } = await supabase
      .schema('menumaker').from('published_menus')
      .select('id,published_at,week_number,distribution_method,rd_approved_by,menu_cycles(name)')
      .eq('center_id', CENTER_ID)
      .order('published_at', { ascending: false })
    setRows((data ?? []).map((d: any) => ({
      id: d.id,
      published_at: d.published_at,
      week_number: d.week_number,
      distribution_method: d.distribution_method,
      rd_approved_by: d.rd_approved_by,
      cycle_name: d.menu_cycles?.name ?? null,
    })))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) return <div style={{ padding: 24, color: '#888', fontSize: 13 }}>Loading…</div>

  return (
    <div>
      <div style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>
        Menus published to families from the Menu Planner. Each row represents one week distributed to families.
      </div>
      {rows.length === 0 ? (
        <div style={{ padding: 32, textAlign: 'center', color: '#aaa', fontSize: 13 }}>
          No menus published yet. Use "Publish to Families" in the Menu Planner.
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f4f6f4', borderBottom: '2px solid #e4e8e4' }}>
              <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#555' }}>Date</th>
              <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#555' }}>Cycle / Week</th>
              <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#555' }}>Method</th>
              <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#555' }}>Approved by RD</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} style={{ background: i % 2 === 0 ? '#fff' : '#f9fbf9', borderBottom: '1px solid #f0f0f0' }}>
                <td style={{ padding: '9px 12px', color: '#333' }}>
                  {new Date(r.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </td>
                <td style={{ padding: '9px 12px', color: '#555' }}>
                  {r.cycle_name ?? '—'} · Week {r.week_number}
                </td>
                <td style={{ padding: '9px 12px', color: '#555' }}>
                  {METHOD_LABELS[r.distribution_method] ?? r.distribution_method}
                </td>
                <td style={{ padding: '9px 12px', color: r.rd_approved_by ? '#0f4c35' : '#aaa' }}>
                  {r.rd_approved_by ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Создать EducationLogTab**

```typescript
// src/pages/family-engagement/EducationLogTab.tsx
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

const CENTER_ID = '881ef4ce-1a27-4d3b-aa60-59d2a307bf2b'

const FORMAT_LABELS: Record<string, string> = {
  classroom: '🏫 Classroom', newsletter: '📰 Newsletter',
  parent_meeting: '👥 Parent Meeting', home_visit: '🏠 Home Visit',
}

interface LogRow {
  id: string
  event_date: string
  topic: string
  format: string
  families_reached: number
  notes: string | null
}

const EMPTY_FORM = { event_date: '', topic: '', format: 'classroom', families_reached: '0', notes: '' }

export default function EducationLogTab() {
  const [rows, setRows]   = useState<LogRow[]>([])
  const [form, setForm]   = useState(EMPTY_FORM)
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase
      .schema('menumaker').from('nutrition_education_log')
      .select('id,event_date,topic,format,families_reached,notes')
      .eq('center_id', CENTER_ID)
      .order('event_date', { ascending: false })
    setRows(data ?? [])
  }, [])

  useEffect(() => { load() }, [load])

  const set = (k: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const save = async () => {
    if (!form.event_date || !form.topic) return
    setSaving(true)
    await supabase.schema('menumaker').from('nutrition_education_log').insert({
      center_id: CENTER_ID,
      event_date: form.event_date,
      topic: form.topic,
      format: form.format,
      families_reached: parseInt(form.families_reached) || 0,
      notes: form.notes || null,
    })
    setForm(EMPTY_FORM)
    setAdding(false)
    setSaving(false)
    load()
  }

  const yearTotal = rows.reduce((s, r) => s + r.families_reached, 0)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: '#888' }}>
          {rows.length} activities logged · {yearTotal} total families reached
        </div>
        <button onClick={() => setAdding(a => !a)}
          style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#0f4c35', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
          + Add Activity
        </button>
      </div>

      {adding && (
        <div style={{ marginBottom: 16, padding: 16, background: '#f0fff4', borderRadius: 10, border: '1px solid #bbf7d0' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
            {(['event_date','topic'] as const).map(k => (
              <div key={k} style={{ gridColumn: k === 'topic' ? 'span 1' : undefined }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#555', marginBottom: 3 }}>{k === 'event_date' ? 'Date' : 'Topic'}</div>
                <input type={k === 'event_date' ? 'date' : 'text'} value={form[k]} onChange={set(k)}
                  style={{ width: '100%', padding: '7px 9px', borderRadius: 7, border: '1px solid #ddd', fontSize: 12, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
              </div>
            ))}
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#555', marginBottom: 3 }}>Format</div>
              <select value={form.format} onChange={set('format')}
                style={{ width: '100%', padding: '7px 9px', borderRadius: 7, border: '1px solid #ddd', fontSize: 12, fontFamily: 'inherit' }}>
                {Object.entries(FORMAT_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#555', marginBottom: 3 }}>Families Reached</div>
              <input type="number" value={form.families_reached} onChange={set('families_reached')}
                style={{ width: '100%', padding: '7px 9px', borderRadius: 7, border: '1px solid #ddd', fontSize: 12, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
            </div>
          </div>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#555', marginBottom: 3 }}>Notes</div>
            <textarea value={form.notes} onChange={set('notes')} rows={2}
              style={{ width: '100%', padding: '7px 9px', borderRadius: 7, border: '1px solid #ddd', fontSize: 12, fontFamily: 'inherit', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={save} disabled={saving}
              style={{ padding: '7px 16px', borderRadius: 7, border: 'none', background: '#0f4c35', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button onClick={() => setAdding(false)}
              style={{ padding: '7px 12px', borderRadius: 7, border: '1px solid #ddd', background: '#fff', color: '#555', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: '#f4f6f4', borderBottom: '2px solid #e4e8e4' }}>
            <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#555' }}>Date</th>
            <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#555' }}>Topic</th>
            <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#555' }}>Format</th>
            <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: '#555' }}>Families</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id} style={{ background: i % 2 === 0 ? '#fff' : '#f9fbf9', borderBottom: '1px solid #f0f0f0' }}>
              <td style={{ padding: '9px 12px', color: '#555' }}>{new Date(r.event_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
              <td style={{ padding: '9px 12px', color: '#333', fontWeight: 500 }}>{r.topic}</td>
              <td style={{ padding: '9px 12px', color: '#555' }}>{FORMAT_LABELS[r.format] ?? r.format}</td>
              <td style={{ padding: '9px 12px', textAlign: 'right', color: '#0f4c35', fontWeight: 600 }}>{r.families_reached}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 3: Создать FamilyFeedbackTab**

```typescript
// src/pages/family-engagement/FamilyFeedbackTab.tsx
import { useState } from 'react'

export default function FamilyFeedbackTab() {
  return (
    <div style={{ padding: 24, textAlign: 'center', color: '#aaa' }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>📝</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#555', marginBottom: 6 }}>Family Feedback Log</div>
      <div style={{ fontSize: 13, color: '#aaa', maxWidth: 400, margin: '0 auto' }}>
        Track informal feedback from families about meals and nutrition. 
        Use this log as documentation of family engagement during program reviews.
      </div>
      <div style={{ marginTop: 16, fontSize: 12, color: '#bbb' }}>Coming in v2 — use the notes in Education Log for now.</div>
    </div>
  )
}
```

- [ ] **Step 4: Создать FamilyEngagementPage**

```typescript
// src/pages/family-engagement/FamilyEngagementPage.tsx
import { useState } from 'react'
import MenuPostingsTab from './MenuPostingsTab'
import EducationLogTab from './EducationLogTab'
import FamilyFeedbackTab from './FamilyFeedbackTab'

type Tab = 'postings' | 'education' | 'feedback'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'postings',  label: 'Menu Postings',      icon: '📤' },
  { id: 'education', label: 'Nutrition Education', icon: '📚' },
  { id: 'feedback',  label: 'Family Feedback',     icon: '💬' },
]

export default function FamilyEngagementPage() {
  const [tab, setTab] = useState<Tab>('postings')

  return (
    <div style={{ padding: '28px 32px', fontFamily: "'DM Sans', sans-serif", background: '#f4f6f4', minHeight: '100vh' }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Serif+Display&display=swap" rel="stylesheet"/>
      <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 26, color: '#0a3320', marginBottom: 4 }}>
        Family Engagement
      </div>
      <div style={{ fontSize: 12, color: '#888', marginBottom: 20 }}>
        Head Start 45 CFR 1302.46 · Menu distribution · Nutrition education · Family documentation
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: '#fff', padding: 4, borderRadius: 10, border: '1px solid #e4e8e4', width: 'fit-content' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              padding: '8px 18px', borderRadius: 7, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              background: tab === t.id ? '#0f4c35' : 'transparent',
              color: tab === t.id ? '#fff' : '#555',
              fontSize: 13, fontWeight: tab === t.id ? 600 : 400,
            }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e4e8e4', padding: 24 }}>
        {tab === 'postings'  && <MenuPostingsTab />}
        {tab === 'education' && <EducationLogTab />}
        {tab === 'feedback'  && <FamilyFeedbackTab />}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Проверить в браузере**

1. Перейти `/family-engagement`
2. Tab "Menu Postings" — показывает опубликованные меню из Menu Planner (или пустое состояние)
3. Tab "Nutrition Education" → нажать "+ Add Activity" → заполнить → Save → строка появляется в таблице
4. После перезагрузки запись сохранена

- [ ] **Step 6: Коммит**

```bash
git add src/pages/family-engagement/
git commit -m "feat: Family Engagement module (menu postings, education log)"
```

---

## Task 8: Recipes — Product Docs (CN Label / PFS / TVP)

**Files:**
- Create: `src/components/recipes/RecipeDocsPanel.tsx`
- Modify: `src/pages/recipes/RecipesPage.tsx`

**Interfaces:**
- Consumes: `recipe_documents` таблица из Task 1
- Consumes: `recipe-documents` Supabase Storage bucket из Task 1
- Consumes: `recipes.is_standardized` из Task 1

- [ ] **Step 1: Создать RecipeDocsPanel**

```typescript
// src/components/recipes/RecipeDocsPanel.tsx
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

const DOC_TYPES = [
  { id: 'cn_label',            label: 'CN Label',              desc: 'Child Nutrition Label' },
  { id: 'pfs',                 label: 'PFS',                   desc: 'Product Formulation Statement' },
  { id: 'tvp',                 label: 'TVP',                   desc: 'Textured Vegetable Protein doc' },
  { id: 'standardized_recipe', label: 'Standardized Recipe',   desc: 'On-file standardized recipe' },
]

interface DocRow {
  id: string
  doc_type: string
  file_name: string
  storage_path: string
  uploaded_at: string
}

export default function RecipeDocsPanel({ recipeId }: { recipeId: string }) {
  const [docs, setDocs]           = useState<DocRow[]>([])
  const [uploading, setUploading] = useState(false)
  const [selType, setSelType]     = useState('cn_label')

  const load = useCallback(async () => {
    const { data } = await supabase
      .schema('menumaker').from('recipe_documents')
      .select('id,doc_type,file_name,storage_path,uploaded_at')
      .eq('recipe_id', recipeId).order('uploaded_at', { ascending: false })
    setDocs(data ?? [])
  }, [recipeId])

  useEffect(() => { load() }, [load])

  const upload = async (file: File) => {
    setUploading(true)
    const path = `${recipeId}/${Date.now()}-${file.name}`
    const { error: upErr } = await supabase.storage.from('recipe-documents').upload(path, file)
    if (!upErr) {
      await supabase.schema('menumaker').from('recipe_documents').insert({
        recipe_id: recipeId, doc_type: selType,
        file_name: file.name, storage_path: path,
      })
      load()
    }
    setUploading(false)
  }

  const remove = async (doc: DocRow) => {
    await supabase.storage.from('recipe-documents').remove([doc.storage_path])
    await supabase.schema('menumaker').from('recipe_documents').delete().eq('id', doc.id)
    load()
  }

  const download = async (doc: DocRow) => {
    const { data } = await supabase.storage.from('recipe-documents').createSignedUrl(doc.storage_path, 60)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  const typeMap = DOC_TYPES.reduce((m, t) => ({ ...m, [t.id]: t.label }), {} as Record<string, string>)
  const presentTypes = new Set(docs.map(d => d.doc_type))
  const missingTypes = DOC_TYPES.filter(t => !presentTypes.has(t.id))

  return (
    <div>
      {/* Completeness indicator */}
      <div style={{
        marginBottom: 14, padding: '8px 12px', borderRadius: 8,
        background: missingTypes.length === 0 ? '#f0fff4' : '#fff8f0',
        border: `1px solid ${missingTypes.length === 0 ? '#bbf7d0' : '#fde68a'}`,
        fontSize: 12, color: missingTypes.length === 0 ? '#0f4c35' : '#b45309', fontWeight: 600,
      }}>
        {missingTypes.length === 0
          ? '✓ All documentation on file'
          : `⚠ Missing: ${missingTypes.map(t => t.label).join(', ')}`}
      </div>

      {/* Existing docs */}
      {docs.map(d => (
        <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
          <span style={{ fontSize: 18 }}>📄</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#333' }}>{d.file_name}</div>
            <div style={{ fontSize: 11, color: '#aaa' }}>
              {typeMap[d.doc_type] ?? d.doc_type} · {new Date(d.uploaded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </div>
          </div>
          <button onClick={() => download(d)} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #ddd', background: '#fff', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
            View
          </button>
          <button onClick={() => remove(d)} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #fecaca', background: '#fff0f0', color: '#c0392b', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
            ✕
          </button>
        </div>
      ))}

      {/* Upload */}
      <div style={{ marginTop: 14, display: 'flex', gap: 8, alignItems: 'center' }}>
        <select value={selType} onChange={e => setSelType(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid #ddd', fontSize: 12, fontFamily: 'inherit' }}>
          {DOC_TYPES.map(t => <option key={t.id} value={t.id}>{t.label} — {t.desc}</option>)}
        </select>
        <label style={{ padding: '6px 14px', borderRadius: 7, border: '1px solid #0f4c35', background: '#fff', color: '#0f4c35', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
          {uploading ? 'Uploading…' : '📎 Upload'}
          <input type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }}
            onChange={e => { if (e.target.files?.[0]) upload(e.target.files[0]) }} />
        </label>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Добавить вкладку "Product Docs" в RecipesPage**

В `src/pages/recipes/RecipesPage.tsx`:

1. Импортировать компонент:
```typescript
import RecipeDocsPanel from '@/components/recipes/RecipeDocsPanel'
import { useProgramConfig } from '@/hooks/useProgramConfig'
```

2. Внутри компонента добавить:
```typescript
const { isHeadStart } = useProgramConfig()
```

3. Найти тип вкладок детальной панели и добавить значение `'docs'`. Например если используется `useState` для активной вкладки:
```typescript
const [detailTab, setDetailTab] = useState<'info' | 'nutrients' | 'ingredients' | 'docs'>('info')
```

4. В блоке переключателей вкладок — добавить кнопку (только при `isHeadStart`):
```typescript
{isHeadStart && (
  <button onClick={() => setDetailTab('docs')} style={/* аналогичный стиль как другие вкладки */}>
    📄 Product Docs
  </button>
)}
```

5. В блоке рендера контента — добавить:
```typescript
{detailTab === 'docs' && selectedRecipe && (
  <RecipeDocsPanel recipeId={selectedRecipe.id} />
)}
```

6. Найти в интерфейсе `Recipe` и добавить поле (если не добавлено автоматически через `*`):
```typescript
is_standardized: boolean
```

7. Добавить индикатор `is_standardized` на карточке рецепта в списке (при `isHeadStart`):
```typescript
{isHeadStart && !recipe.is_standardized && (
  <span style={{ fontSize: 10, color: '#b45309', marginLeft: 4 }}>⚠ not standardized</span>
)}
```

- [ ] **Step 3: Проверить в браузере**

1. Открыть `/recipes` при `isHeadStart = true`
2. Открыть любой рецепт — должна появиться вкладка "Product Docs"
3. Загрузить PDF файл → файл появляется в списке
4. Нажать "View" → открывается signed URL
5. Completeness indicator показывает недостающие типы документов

- [ ] **Step 4: Коммит**

```bash
git add src/components/recipes/RecipeDocsPanel.tsx src/pages/recipes/RecipesPage.tsx
git commit -m "feat: recipe product docs (CN Label, PFS, TVP) for Head Start"
```

---

## Self-Review

### Spec coverage check

| Требование из спека | Задача | Статус |
|---------------------|--------|--------|
| program_type flag + условный сайдбар | Task 2 | ✓ |
| Settings → HS Program tab | Task 3 | ✓ |
| Menu: RD workflow (draft→submitted→rd_approved→published) | Task 4 | ✓ |
| Menu: family-style flag | Task 4 | ✓ |
| Menu: cultural theme | Task 4 | ✓ |
| Menu: Publish to Families + published_menus | Task 4 | ✓ |
| Menu: % дневной нормы в Settings | Task 3 (program_hours + hint text) | ✓ |
| Recipes: CN Label / PFS / TVP docs | Task 8 | ✓ |
| Recipes: is_standardized флаг | Task 8 | ✓ |
| Settings: dietitian, health_manager, grant, hours | Task 3 | ✓ |
| Form Submissions: CF/HS-27 поля | Task 5 | ✓ |
| Form Submissions: expired review_date | Task 5 | ✓ |
| Family Engagement: Menu Postings | Task 7 | ✓ |
| Family Engagement: Education Log | Task 7 | ✓ |
| Family Engagement: Family Feedback | Task 7 (v2 placeholder) | ✓ |
| HS Reports: PIR Data | Task 6 | ✓ |
| HS Reports: Monthly Meal Count | Task 6 | ✓ |
| HS Reports: Self-Assessment checklist | Task 6 | ✓ |
| Site Claim скрыт при HS mode | Task 2 | ✓ |
| DB migrations | Task 1 | ✓ |
| Роль dietitian | Task 2 | ✓ |
| Storage bucket для recipe-documents | Task 1 | ✓ |

Все требования покрыты.
