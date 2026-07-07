-- 20260707b_income_eligibility_determination_signature
--
-- IEA F/R/P determination signature + audit trail on the authoritative FY record.
-- Layer 1 of the F/R/P editor: when a director confirms/overrides the F/R/P in the
-- IEA Review modal (EnrollmentReviewModal) and Approves, approveIea() writes the
-- determination to menumaker.income_eligibility as a NEW fiscal-year row (the FY
-- string comes from the form edition, e.g. FY2026-27 — the prior-cycle FY2026 rows
-- from the fiscal import are left as history) with who/when + an append-only log.

alter table menumaker.income_eligibility
  add column if not exists eligibility_source text,      -- 'ocr_sponsor' | 'ocr_helper' | 'manual'
  add column if not exists determined_by uuid,           -- reviewer auth uid
  add column if not exists determined_by_name text,      -- human-readable director name (signature line)
  add column if not exists determined_at timestamptz,
  add column if not exists determination_log jsonb not null default '[]'::jsonb;

comment on column menumaker.income_eligibility.eligibility_source is
  'How the eligibility value was set: ocr_sponsor (paper Sponsor section), ocr_helper (income calculator fallback), or manual (director override).';
comment on column menumaker.income_eligibility.determination_log is
  'Append-only audit of determination changes: [{at, by, by_name, from, to, source}].';
