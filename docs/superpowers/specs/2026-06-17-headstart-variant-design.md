# Head Start MenuMaker — Полная спецификация продукта

**Дата:** 2026-06-17  
**Статус:** Draft — ожидает подтверждения  
**Основа:** MenuMaker v0.1 (CACFP Pearl build)  
**Цель:** Коммерческий вариант для Head Start центров

---

## 1. Обзор и принцип

Текущее приложение построено под один CACFP-центр (Pearl). Head Start вариант — это **отдельный продукт** с той же технической базой (React + Vite + Supabase + DM Sans + зелёная палитра), но с другим набором модулей, форм и отчётов.

### Стратегия: Program Type Flag

В настройках центра добавляется поле `program_type: 'cacfp' | 'headstart'`. Приложение один раз читает это значение при загрузке и:
- скрывает/показывает нужные пункты сайдбара
- подставляет нужные компоненты отчётов
- применяет Head Start-специфичную валидацию

Это позволяет один codebase → два продукта без форка.

---

## 2. Что остаётся без изменений

| Модуль | Роут | Статус |
|--------|------|--------|
| Kitchen View | `/kitchen` | без изменений |
| Kitchen Stock | `/kitchen-stock` | без изменений |
| Purchases | `/purchases` | без изменений |
| Inventory | `/inventory` | без изменений |
| Meal Count (Teacher) | `/meal-count` | без изменений |
| Meal Count (Director) | `/meal-count-director` | без изменений |
| Login | `/login` | без изменений |

---

## 3. Модифицированные модули

### 3.1 Menu Planner (`/menu`)

**Текущее состояние:** Планировщик цикличного меню по неделям, типы блюд Breakfast / AM Snack / Lunch / Supper, печать.

**Что меняется:**

#### 3.1.1 RD Sign-Off (Одобрение диетолога)
- Каждый цикл меню получает статус: `draft → submitted → rd_approved → published`
- В шапке страницы — индикатор статуса текущего цикла
- Кнопка **"Submit for RD Review"** → статус переходит в `submitted`
- RD (Registered Dietitian) получает уведомление (email или внутренний флаг)
- После одобрения — кнопка **"Approve Menu"** (доступна только роли `dietitian` или `director`)
- Цикл нельзя опубликовать родителям без статуса `rd_approved`
- В печатной форме меню — строка "Approved by RD: [Имя] · [Дата]"

#### 3.1.2 Family-Style Flag
- На каждый день/приём пищи — чекбокс **"Family-style service"**
- Семейный стиль = тарелки и миски на стол, дети накладывают сами (Head Start Performance Standards 1302.44)
- В кухонном отчёте (Kitchen Planning Report) — отметка "FS" на днях с family-style

#### 3.1.3 Публикация для родителей
- Кнопка **"Publish to Families"** (активна только при статусе `rd_approved`)
- Создаёт запись в таблице `published_menus` с датой и ссылкой
- Генерирует **печатную версию** меню с шапкой центра для отправки домой
- (v2) Отправка на email из списка Family Engagement

#### 3.1.4 Культурная пометка
- На карточке меню — поле "Cultural Theme" (свободный текст, опционально)
- Пример: "Hispanic Heritage Month", "Soul Food Week"
- Отображается в печатной версии для родителей

#### 3.1.5 Расчёт % дневной нормы
- В настройках — поле `program_hours_per_day` (< 6 ч или ≥ 6 ч)
- В правой колонке меню — целевой % от дневной нормы питания:
  - < 6 ч: 33–50% (1/3 – 1/2)
  - ≥ 6 ч: 50–67% (1/2 – 2/3)
- Если рецепт имеет данные о нутриентах — автоматический расчёт, иначе — ручной ввод

---

### 3.2 Recipes (`/recipes`)

**Что меняется:**

#### 3.2.1 Документация CN / PFS
- Вкладка **"Product Docs"** в детальной панели рецепта
- Три типа документов (по требованиям Head Start):
  - **CN Label** — Child Nutrition Label (фото/PDF загрузки)
  - **PFS** — Product Formulation Statement
  - **TVP** — Textured Vegetable Protein documentation
  - **Standardized Recipe** — стандартизированный рецепт (уже есть, но нужен статус "on file")
- Каждый документ: тип, название, дата загрузки, файл (Supabase Storage)
- Индикатор на карточке рецепта: ✓ "Docs complete" / ⚠ "Missing docs"

#### 3.2.2 Standardized Recipe статус
- Флаг `is_standardized: boolean` на рецепте
- Если рецепт используется в опубликованном меню без флага — предупреждение

---

### 3.3 Settings (`/settings`)

**Что меняется:** Новые секции в существующих вкладках + новая вкладка.

#### 3.3.1 Новая вкладка "Head Start Program"
Поля:
- `program_type` — Head Start / CACFP (глобальный переключатель)
- `program_hours_per_day` — длительность программы (для расчёта норм)
- `program_start_time` / `program_end_time`
- `fiscal_year_start` — начало фискального года (для PIR)
- `dietitian_name`, `dietitian_credentials`, `dietitian_email` — данные RD
- `health_manager_name`, `health_manager_email` — Health Manager
- `grant_number` — номер Head Start гранта (для PIR)
- `enrollment_capacity` — лицензионная мощность

#### 3.3.2 Meal Count Settings (существующие)
- Добавить `pm_snack` как опциональный слот (Head Start часто использует PM Snack вместо Supper)

---

### 3.4 Form Submissions (`/submissions`)

**Текущее состояние:** 3 вкладки — Special Diet · Milk Substitution · Infant Meals.

**Что меняется:**

#### 3.4.1 CF/HS-27 вместо текущей Special Diet формы
Head Start использует форму CF/HS-27 для особых диетических потребностей. Структура отличается:

| Поле | CACFP (сейчас) | Head Start CF/HS-27 |
|------|----------------|---------------------|
| Basis | disability / no_disability | Medical (disability) / Non-medical |
| Medical authority | Physician/RD signature | **Licensed healthcare provider** only для медицинских |
| Non-medical substitution | Нет | Да — родитель может запросить без медзаключения |
| Review date | Нет | Обязательна дата пересмотра (ежегодно) |
| Health manager sign-off | Нет | Обязательно |

Реализация:
- Вкладка переименовывается в **"Special Dietary Needs (CF/HS-27)"**
- Добавляются поля: `substitution_type` (medical/non_medical), `review_date`, `health_manager_signed_at`
- Форма для родителей адаптируется под CF/HS-27 структуру
- Индикатор просроченных форм (review_date прошла)

---

## 4. Новые модули

### 4.1 Family Engagement (`/family-engagement`)

**Цель:** Head Start требует документировать взаимодействие с семьями по вопросам питания (45 CFR 1302.46).

**Три вкладки:**

#### Tab 1: Menu Postings
- Список опубликованных меню (из `published_menus`)
- Статус: posted to families / not yet posted
- Дата отправки, способ (printed / email / bulletin board)
- Кнопка печати меню для родителей (тот же компонент что в MenuPlanner)

#### Tab 2: Nutrition Education Log
- Журнал мероприятий по нутриционному образованию
- Поля: дата, тема, формат (classroom / newsletter / parent meeting / home visit), кол-во семей
- Примеры тем: "Healthy Snacks at Home", "Reading Food Labels", "MyPlate for Kids"
- Вывод: итог за год для Self-Assessment

#### Tab 3: Family Feedback
- Простая форма: дата, ребёнок (опционально), тема, заметка
- Используется как доказательство вовлечённости семей при проверке

---

### 4.2 Head Start Reports (`/reports`) — замена CACFP Reports

**Текущее состояние:** CACFPReportsPage — финансовый отчёт для CACFP возмещений (Regular / Beginning / Ending inventory / Other Costs).

**Что меняется:** Страница получает новую вкладочную структуру для Head Start.

#### Tab 1: PIR Nutrition Data
PIR (Program Information Report) — ежегодный федеральный отчёт. Из него приложение заполняет **только нутриционный блок** (Section III Health Services):

Поля для заполнения:
- Кол-во детей получивших dental screening, vision, hearing (отдельные модули — не в scope)
- **Nutrition (scope этого приложения):**
  - Кол-во детей с особыми диетическими потребностями (из CF/HS-27)
  - Кол-во детей с хроническими заболеваниями (из health records)
  - Число дней когда подавались горячие завтраки
  - Подтверждение что меню одобрено RD
  - Подтверждение family-style meal service

Выход: печатная форма / экспорт данных для вставки в official PIR system (HSES — Head Start Enterprise System).

#### Tab 2: Monthly Meal Count Report
Аналог текущего Site Claim Report, но без финансового расчёта:
- Подсчёт блюд по типам за месяц
- Разбивка по классам
- Разбивка: Head Start enrolled / extended day child care (если оба типа)
- Нет расчёта возмещений (финансирование через грант, не CACFP)
- Экспорт PDF

#### Tab 3: Nutrition Self-Assessment
Ежегодная самооценка нутриционных сервисов (Head Start Performance Standards).

Чеклист по разделам (заполняется раз в год, хранится с датой):
```
□ Menu Planning
  □ Menus meet USDA meal pattern requirements
  □ Menus approved by RD/nutritionist annually
  □ Menus posted/distributed to families
  □ Menus are culturally and linguistically appropriate
  □ Variety: no main dish repeated more than once per week

□ Meal Service
  □ Family-style meal service implemented
  □ Adequate time for meals (20+ min for lunch)
  □ Staff eat with children

□ Special Dietary Needs
  □ CF/HS-27 forms on file for all children with special needs
  □ Forms reviewed annually
  □ Health manager sign-off current

□ Documentation
  □ CN Labels / PFS on file for manufactured products
  □ Standardized recipes available for all scratch-cooked items

□ Family Engagement
  □ Nutrition education activities conducted
  □ Menus sent home to families
  □ Families included in menu planning feedback
```

Каждый пункт: ✓ Met / ✗ Not met / N/A + поле для заметки.
Статус формы сохраняется в БД с датой заполнения и подписью директора.

---

### 4.3 Site Claim Report — отключается

Роут `/claim-report` скрывается в сайдбаре при `program_type = 'headstart'`. Head Start получает финансирование через грант, CACFP claim forms не подаются.

Вместо него — **Monthly Meal Count Report** (Tab 2 в Head Start Reports).

---

## 5. Навигация — изменения в сайдбаре

### CACFP (текущий)
```
Dashboard · Menu · Recipes · Kitchen · Kitchen Stock
Purchases · Inventory · Submissions · Meal Count
Reports (CACFP) · Site Claim · Kitchen Report · Settings
```

### Head Start (новый)
```
Dashboard · Menu · Recipes · Kitchen · Kitchen Stock
Purchases · Inventory · Submissions (CF/HS-27) · Meal Count
Family Engagement  ← НОВЫЙ
Reports (Head Start) · Kitchen Report · Settings
```

Убирается: Site Claim Report (не нужен)  
Добавляется: Family Engagement

---

## 6. База данных — новые таблицы и поля

### Новые таблицы

```sql
-- Публикации меню для родителей
published_menus (
  id uuid PK,
  cycle_id uuid FK → menu_cycles,
  week_number int,
  published_at timestamptz,
  published_by uuid FK → auth.users,
  distribution_method text, -- 'printed' | 'email' | 'bulletin'
  rd_approved_by text,
  rd_approved_at timestamptz
)

-- Журнал nutrition education
nutrition_education_log (
  id uuid PK,
  center_id uuid FK,
  event_date date,
  topic text,
  format text, -- 'classroom' | 'newsletter' | 'parent_meeting' | 'home_visit'
  families_reached int,
  notes text,
  created_by uuid FK → auth.users
)

-- Nutrition Self-Assessment
nutrition_self_assessments (
  id uuid PK,
  center_id uuid FK,
  fiscal_year int,
  completed_at timestamptz,
  completed_by uuid FK → auth.users,
  director_signature text, -- base64
  items jsonb, -- { section: string, item_id: string, status: 'met'|'not_met'|'na', note: string }[]
  overall_status text -- 'complete' | 'draft'
)

-- Документы к рецептам (CN Label, PFS, TVP)
recipe_documents (
  id uuid PK,
  recipe_id uuid FK → recipes,
  doc_type text, -- 'cn_label' | 'pfs' | 'tvp' | 'standardized_recipe'
  file_name text,
  storage_path text,
  uploaded_at timestamptz,
  uploaded_by uuid FK → auth.users
)
```

### Новые поля в существующих таблицах

```sql
-- menu_cycles
ALTER TABLE menu_cycles ADD COLUMN status text DEFAULT 'draft';
-- 'draft' | 'submitted' | 'rd_approved' | 'published'
ALTER TABLE menu_cycles ADD COLUMN rd_approved_by text;
ALTER TABLE menu_cycles ADD COLUMN rd_approved_at timestamptz;

-- menu_items (или связанная таблица по дням)
ALTER TABLE menu_items ADD COLUMN is_family_style boolean DEFAULT false;
ALTER TABLE menu_items ADD COLUMN cultural_theme text;

-- centers (настройки центра)
ALTER TABLE centers ADD COLUMN program_type text DEFAULT 'cacfp';
ALTER TABLE centers ADD COLUMN program_hours numeric;
ALTER TABLE centers ADD COLUMN dietitian_name text;
ALTER TABLE centers ADD COLUMN dietitian_credentials text;
ALTER TABLE centers ADD COLUMN dietitian_email text;
ALTER TABLE centers ADD COLUMN health_manager_name text;
ALTER TABLE centers ADD COLUMN health_manager_email text;
ALTER TABLE centers ADD COLUMN grant_number text;
ALTER TABLE centers ADD COLUMN fiscal_year_start_month int DEFAULT 10; -- October

-- special_diet_forms (CF/HS-27 расширение)
ALTER TABLE special_diet_forms ADD COLUMN substitution_type text; -- 'medical' | 'non_medical'
ALTER TABLE special_diet_forms ADD COLUMN review_date date;
ALTER TABLE special_diet_forms ADD COLUMN health_manager_signed_at timestamptz;

-- recipes
ALTER TABLE recipes ADD COLUMN is_standardized boolean DEFAULT false;
```

---

## 7. Роли пользователей

Добавляется роль `dietitian` (RD):
- Может просматривать все меню
- Может менять статус цикла на `rd_approved`
- Не имеет доступа к финансовым данным

Существующие роли остаются без изменений.

---

## 8. Что НЕ входит в scope (v1)

- Email-рассылка меню родителям (только печать)
- Интеграция с HSES (Head Start Enterprise System) — только экспорт данных
- Полный PIR (только нутриционный блок)
- Dental / vision / hearing tracking
- Child development records
- Individualized nutrition plans (только CF/HS-27 форма)

---

## 9. Порядок реализации (предлагаемый)

| Этап | Что | Почему в первую очередь |
|------|-----|------------------------|
| 1 | Settings → Head Start Program tab | Разблокирует все остальное (program_type flag) |
| 2 | Menu Planner → RD workflow + publish | Центральная фича, блокирует Family Engagement |
| 3 | Form Submissions → CF/HS-27 | Часто первое что проверяют при аудите |
| 4 | Head Start Reports → Meal Count + Self-Assessment | Нужны для работы центра |
| 5 | Family Engagement | Последнее — зависит от Menu publishing |
| 6 | Recipes → CN Label / PFS docs | Полезно но не блокирует работу |

---

## 10. Резюме изменений по модулям

| Модуль | Действие | Трудоёмкость |
|--------|----------|-------------|
| Settings | +новая вкладка HS Program | S |
| Menu Planner | +статус/RD/publish/family-style/cultural | M |
| Recipes | +вкладка документов | S |
| Form Submissions | Расширить CF/HS-27 | M |
| Family Engagement | Новый модуль (3 вкладки) | M |
| Head Start Reports | Новый модуль (3 вкладки) | L |
| Site Claim | Скрыть при HS mode | XS |
| DB migrations | 4 новые таблицы + ALTER fields | M |
| Navigation | +1 пункт, -1 пункт при HS mode | XS |
