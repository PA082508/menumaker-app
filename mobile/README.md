# Phase 1.5 — Photo intake of paper enrollment forms

**Status (2026-07-04): DEPLOYED except the OCR secret.**
- ✅ `enrollment-scans` bucket — applied (migration `enrollment_scans_bucket`).
- ✅ `enrollment-scan-ocr` edge function — deployed to menumaker (v1, ACTIVE).
- ✅ Mobile module — PR **#1** on `PA082508/cacfp-receipt` (merging publishes to Pages).
- ⛔ `ANTHROPIC_API_KEY` secret — **NOT set** (the key never came through). Until it
  is, OCR returns empty fields; the upload + submission path (incl. type "Other")
  works. Set it with the command in step 1 below — no redeploy needed afterward.

Plumbing smoke passed: edge fn (auth → upload → bucket) + `submit_enrollment_form`
created a real `paper_entry` pending row with `object_exists=1`, then the test row
was removed. Full OCR smoke (fields + confidence in Review) is pending the key.

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

## Deploy checklist

1. ⛔ **Secret (remaining)** — set the Claude key on menumaker:
   `supabase secrets set ANTHROPIC_API_KEY=… --project-ref trrmyqfpxntmgxnqkikp`
   (optional: `OCR_MODEL`, default `claude-sonnet-5`). No redeploy needed after.
2. ✅ **Bucket** — applied (`enrollment_scans_bucket` migration).
3. ✅ **Edge function** — deployed (`enrollment-scan-ocr`, v1 ACTIVE).
4. 🔵 **Mobile module** — PR **#1** on `PA082508/cacfp-receipt`. **Merge to publish**
   to GitHub Pages (config is pre-filled: menumaker public anon key + the 3 center IDs).
5. ⛔ **OCR smoke (after step 1 + merge)** — scan one CACFP form → confirm it appears
   in the Inbox with 📎, the scan renders in Review, and any unclear field shows
   🔍 verify. (Plumbing already smoked via the "Other" path.)

Only after this smoke passes on prod may Phase 1.5 be described as live (fair-advertising rule, spec §3).
