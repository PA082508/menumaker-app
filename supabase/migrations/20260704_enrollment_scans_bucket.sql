-- Phase 1.5 (photo intake) — private Storage bucket for photographed paper forms.
--
-- The mobile "Scan child form" flow never touches Storage directly: it POSTs the
-- image to the enrollment-scan-ocr edge function, which uploads with the service
-- role (bypassing RLS) and returns a scan_ref. Reviewers (director / office
-- manager / admin, all authenticated) mint short-lived signed URLs to view the
-- scan in the Inbox — so the only policy we need is authenticated SELECT.
--
-- Bucket is PRIVATE (public=false): scans of children's records must never be
-- reachable by URL guessing.

insert into storage.buckets (id, name, public)
values ('enrollment-scans', 'enrollment-scans', false)
on conflict (id) do nothing;

-- Authenticated app users can read (→ createSignedUrl works in review). The app
-- surfaces the Inbox to staff roles only; org isolation on the submission row is
-- the record-level gate. Object paths are namespaced by center_id.
drop policy if exists enrollment_scans_read on storage.objects;
create policy enrollment_scans_read on storage.objects
  for select to authenticated
  using (bucket_id = 'enrollment-scans');

-- No insert/update/delete policies: writes happen only via the edge function's
-- service-role client, which is exempt from RLS. anon has no access at all.
