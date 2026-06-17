-- Head Start variant migrations
-- Run in Supabase SQL Editor (schema: menumaker)

-- 1. Расширить таблицу centers
ALTER TABLE menumaker.centers
  ADD COLUMN IF NOT EXISTS program_type            text    NOT NULL DEFAULT 'cacfp',
  ADD COLUMN IF NOT EXISTS program_hours           numeric,
  ADD COLUMN IF NOT EXISTS program_start_time      time,
  ADD COLUMN IF NOT EXISTS program_end_time        time,
  ADD COLUMN IF NOT EXISTS fiscal_year_start_month int     DEFAULT 10,
  ADD COLUMN IF NOT EXISTS dietitian_name          text,
  ADD COLUMN IF NOT EXISTS dietitian_credentials   text,
  ADD COLUMN IF NOT EXISTS dietitian_email         text,
  ADD COLUMN IF NOT EXISTS health_manager_name     text,
  ADD COLUMN IF NOT EXISTS health_manager_email    text,
  ADD COLUMN IF NOT EXISTS grant_number            text,
  ADD COLUMN IF NOT EXISTS enrollment_capacity     int;

-- 2. Расширить menu_cycles
-- status уже существует ('draft'|'approved') — расширяем до 4 значений:
-- 'draft' | 'submitted' | 'rd_approved' | 'published'
ALTER TABLE menumaker.menu_cycles
  ADD COLUMN IF NOT EXISTS rd_approved_by  text,
  ADD COLUMN IF NOT EXISTS rd_approved_at  timestamptz;

-- 3. Расширить menu_items
ALTER TABLE menumaker.menu_items
  ADD COLUMN IF NOT EXISTS is_family_style boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cultural_theme  text;

-- 4. Расширить special_diet_forms
ALTER TABLE menumaker.special_diet_forms
  ADD COLUMN IF NOT EXISTS substitution_type         text,
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
  distribution_method text        NOT NULL DEFAULT 'printed',
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
  format           text        NOT NULL,
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
  overall_status     text        NOT NULL DEFAULT 'draft',
  items              jsonb       NOT NULL DEFAULT '[]',
  director_signature text,
  completed_at       timestamptz,
  completed_by       uuid        REFERENCES auth.users(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (center_id, fiscal_year)
);

-- 9. Новая таблица: recipe_documents
CREATE TABLE IF NOT EXISTS menumaker.recipe_documents (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id    uuid        NOT NULL REFERENCES menumaker.recipes(id) ON DELETE CASCADE,
  doc_type     text        NOT NULL,
  file_name    text        NOT NULL,
  storage_path text        NOT NULL,
  uploaded_at  timestamptz NOT NULL DEFAULT now(),
  uploaded_by  uuid        REFERENCES auth.users(id)
);

-- 10. RLS policies
ALTER TABLE menumaker.published_menus ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read published_menus"  ON menumaker.published_menus FOR SELECT TO authenticated USING (true);
CREATE POLICY "write published_menus" ON menumaker.published_menus FOR ALL    TO authenticated USING (true);

ALTER TABLE menumaker.nutrition_education_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read edu_log"  ON menumaker.nutrition_education_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "write edu_log" ON menumaker.nutrition_education_log FOR ALL    TO authenticated USING (true);

ALTER TABLE menumaker.nutrition_self_assessments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read self_assess"  ON menumaker.nutrition_self_assessments FOR SELECT TO authenticated USING (true);
CREATE POLICY "write self_assess" ON menumaker.nutrition_self_assessments FOR ALL    TO authenticated USING (true);

ALTER TABLE menumaker.recipe_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read recipe_docs"  ON menumaker.recipe_documents FOR SELECT TO authenticated USING (true);
CREATE POLICY "write recipe_docs" ON menumaker.recipe_documents FOR ALL    TO authenticated USING (true);

-- 11. Storage bucket для recipe-documents
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
