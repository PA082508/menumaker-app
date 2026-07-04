# Phase 1.5 — Photo intake of paper enrollment forms

**Status: PREPARATION / staged. Nothing here is deployed.** Deploy is a separate,
explicit step to run only after Nikolay's "deploy ok" (and once he provides
`ANTHROPIC_API_KEY`). Slice E and Block 2 stay ahead in the execution queue; these
artifacts are a parallel заготовка.

## What this delivers

The office photographs a signed **paper** enrollment form in the director mobile app;
OCR reads the fields and the form lands in the existing **Enrollment Inbox** as a
`source='paper_entry'` submission with the scan attached — same validation, same
diff, same duplicate detector, same Approve/Reject. Removes manual re-typing and is
the channel by which the 3–4 hand-added children (minimal fields) get completed
("update existing child"). Extensible to any document type (voucher printouts, …).

Hosting decision (confirmed): everything runs on the **menumaker** project
(`trrmyqfpxntmgxnqkikp`), where enrollment is already consolidated.

## The three artifacts (all version-controlled, not deployed)

| Artifact | Path | What it is |
|---|---|---|
| Storage bucket | `supabase/migrations/20260704_enrollment_scans_bucket.sql` | Private `enrollment-scans` bucket + authenticated-read policy |
| OCR edge function | `supabase/functions/enrollment-scan-ocr/index.ts` | Uploads the photo (service role) + Claude-vision OCR per form type → ready-to-submit `form_data` |
| Mobile module | `mobile/scan-child-form.html` | Standalone "Scan child form" flow to drop into the `cacfp-receipt` repo |

Review side (already shipped in the web app, commit `dda4a95`): the Inbox shows a
`📎 Scan` chip and the review modal renders the scan beside the fields with
low-confidence fields tagged **🔍 verify** — driven by the `form_data.scan_ref` /
`form_data._ocr` contract in `src/lib/enrollmentScan.ts`.

## Data contract (already live on the review side)

`submit_enrollment_form(..., p_source='paper_entry', p_form_data=<below>)`:

```jsonc
{
  // …extracted packet fields (child_name, birthdate, mailing{…}, schedule{…}, …)
  "scan_ref": { "bucket": "enrollment-scans", "path": "<centerId>/<uuid>.jpg" },
  "_ocr": {
    "docType": "cacfp_enrollment",
    "engine": "claude-sonnet-5",
    "at": "2026-07-04T…Z",
    "lowConfidence": ["child_name", "mailing.zip"]   // dotted paths flagged "verify"
  }
}
```
No schema/RPC change was needed — the scan + OCR metadata ride inside `form_data`.

## Deploy checklist — RUN ONLY AFTER "deploy ok" (separate step)

1. **Secret** — set the Claude key (from Nikolay) on menumaker:
   `supabase secrets set ANTHROPIC_API_KEY=… --project-ref trrmyqfpxntmgxnqkikp`
   (optional: `OCR_MODEL`, default `claude-sonnet-5`).
2. **Bucket** — apply `20260704_enrollment_scans_bucket.sql` (SQL editor or
   `supabase db push`).
3. **Edge function** —
   `supabase functions deploy enrollment-scan-ocr --project-ref trrmyqfpxntmgxnqkikp`
4. **Mobile module** — copy `scan-child-form.html` into the `cacfp-receipt` repo,
   fill the two CONFIG blocks (menumaker anon key = web `VITE_SUPABASE_ANON_KEY`;
   real `org_id` + `center_id` per center from `menumaker.centers`), link it as a
   second action ("Scan child form") next to the receipt uploader, publish to Pages.
5. **Smoke** — scan one CACFP form → confirm it appears in the Inbox with 📎, the
   scan renders in Review, and any unclear field shows 🔍 verify.

Only after this smoke passes on prod may Phase 1.5 be described as live (fair-advertising rule, spec §3).
