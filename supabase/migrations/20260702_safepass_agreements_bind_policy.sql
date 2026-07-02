-- Bind each SafePass signature to a policy (code + version) in policy_documents.
-- safepass_agreements already carries document_version; add the policy code and a
-- composite FK to policy_documents(org_id, key, version) so a signature can only
-- reference a real policy code+version. When a new version is activated, existing
-- signatures no longer match the current version → re-sign required.
-- Applied to project menumaker (trrmyqfpxntmgxnqkikp) 2026-07-02. (0 rows at apply.)
alter table menumaker.safepass_agreements
  add column if not exists policy_code text not null default 'safepass_addendum';

alter table menumaker.safepass_agreements
  add constraint safepass_agreements_policy_fk
  foreign key (org_id, policy_code, document_version)
  references menumaker.policy_documents (org_id, key, version);
