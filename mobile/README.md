# Phase 1.5 — Photo intake of paper enrollment forms

**Status (2026-07-04): LIVE — OCR smoke PASSED.**
- ✅ `enrollment-scans` bucket — applied (migration `enrollment_scans_bucket`).
- ✅ `enrollment-scan-ocr` edge function — deployed to menumaker (**v4**, ACTIVE).
- ✅ `ANTHROPIC_API_KEY` secret — set (Claude vision via `claude-sonnet-5`).
- ✅ Mobile module — PR **#1** on `PA082508/cacfp-receipt` (merging publishes to Pages).

Full OCR smoke passed end to end: a synthetic hand-filled CACFP form → edge fn
(upload + OCR) extracted child_name / mailing / Mon–Fri schedule, flagged the
uncertain fields (`birthdate, day_phone, mailing.zip, signature_date`) — including
two genuine misreads it correctly caught — then `submit_enrollment_form` created a
`paper_entry` pending row viewable in Review with the scan + 🔍 verify tags.

Fix found during the smoke: Claude may return a non-text (thinking) content block
first, so the function concatenates all `type==='text'` blocks (not `content[0]`).

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

1. ✅ **Secret** — `ANTHROPIC_API_KEY` set on menumaker (optional `OCR_MODEL`,
   default `claude-sonnet-5`). No redeploy needed when rotating it.
2. ✅ **Bucket** — applied (`enrollment_scans_bucket` migration).
3. ✅ **Edge function** — deployed (`enrollment-scan-ocr`, v4 ACTIVE).
4. 🔵 **Mobile module (remaining)** — PR **#1** on `PA082508/cacfp-receipt`. **Merge to
   publish** to GitHub Pages (config is pre-filled: menumaker public anon key + the 3
   center IDs).
5. ✅ **OCR smoke** — passed via a synthetic hand-filled form (see status above). The
   real-form acceptance test (handwriting + duplicate-match on a minimal-data child)
   runs from the phone after step 4 merges.

Only after this smoke passes on prod may Phase 1.5 be described as live (fair-advertising rule, spec §3).
