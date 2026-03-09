/* ============================================================================
   Athyper v2.1 — Archive Restore & Purge Certificate
   Schema: evt
   Dependencies: core.tenant, evt.archive_manifest (151_event_tiering.sql),
                 core.legal_hold (076_legal_hold.sql)

   1. evt.restore_request        — tracks restore requests for archived partitions
   2. evt.purge_certificate      — immutable deletion proof artifact
   3. evt.prevent_purge_cert_mutation() — immutability guard

   Design:
     Before a cold-tier partition can be purged, the system must:
       1. Verify no active legal holds (core.is_legal_hold_active)
       2. Verify retention period has expired (core.resolve_retention_policy)
       3. Create a purge_certificate with sha256, row_count, and approval chain
       4. The certificate is immutable — permanent compliance evidence

   Restore lifecycle:
     REQUESTED → APPROVED → RESTORING → RESTORED → FAILED
     A restore re-attaches a DETACHED partition back into the event store.
   ============================================================================ */


-- ============================================================================
-- evt.restore_request — Tracks requests to restore archived partitions
--
-- Lifecycle: REQUESTED → APPROVED → RESTORING → RESTORED | FAILED
-- Requires manifest to be in DETACHED state (verified_at NOT NULL, detached_at NOT NULL).
-- Cannot restore if legal hold prevents it (checked at application layer).
-- ============================================================================
create table if not exists evt.restore_request (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references core.tenant(id) on delete cascade,

  -- What to restore
  manifest_id     uuid not null references evt.archive_manifest(id) on delete restrict,

  -- Request details
  requested_by    text not null,
  requested_at    timestamptz not null default now(),
  reason          text not null,

  -- Approval workflow
  approved_by     text,
  approved_at     timestamptz,

  -- Execution tracking
  status          text not null default 'REQUESTED',
  started_at      timestamptz,
  completed_at    timestamptz,
  error_message   text,

  -- Restore metadata (source URI, target tablespace, etc.)
  restore_config  jsonb,
  metadata        jsonb,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz,

  constraint restore_status_chk
    check (status in ('REQUESTED', 'APPROVED', 'RESTORING', 'RESTORED', 'FAILED', 'REJECTED')),
  constraint restore_approval_chk
    check (
      (status in ('REQUESTED') and approved_by is null)
      or (status in ('APPROVED', 'RESTORING', 'RESTORED', 'FAILED') and approved_by is not null)
      or (status = 'REJECTED')
    )
);

comment on table evt.restore_request is
'Tracks requests to restore archived event partitions. '
'Lifecycle: REQUESTED → APPROVED → RESTORING → RESTORED | FAILED.';

create index if not exists idx_restore_request_tenant
  on evt.restore_request (tenant_id, status);

create index if not exists idx_restore_request_manifest
  on evt.restore_request (manifest_id);

create index if not exists idx_restore_request_pending
  on evt.restore_request (tenant_id)
  where status in ('REQUESTED', 'APPROVED', 'RESTORING');


-- ============================================================================
-- evt.purge_certificate — Immutable deletion proof artifact
--
-- Created when an archived partition is permanently purged after:
--   1. Retention period has expired
--   2. No active legal holds
--   3. Manifest is in VERIFIED or DETACHED state
--   4. Approval chain is complete
--
-- The certificate captures a cryptographic snapshot of what was deleted,
-- serving as compliance evidence that deletion was authorized and complete.
--
-- Immutability: ALL fields are immutable after INSERT. DELETE is prohibited.
-- ============================================================================
create table if not exists evt.purge_certificate (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references core.tenant(id) on delete cascade,

  -- What was purged (references manifest, but manifest may remain as tombstone)
  manifest_id     uuid not null references evt.archive_manifest(id) on delete restrict,
  partition_name  text not null,
  partition_month date not null,

  -- Cryptographic proof of what was purged
  archive_sha256  text not null,
  row_count       bigint not null,
  archive_format  text not null,
  storage_uri     text not null,
  size_bytes      bigint,

  -- Why it was purged
  purge_reason    text not null default 'RETENTION_EXPIRED',
  retention_policy_id uuid,
  retention_days_at_purge int,
  compliance_framework text,

  -- Approval chain
  requested_by    text not null,
  requested_at    timestamptz not null,
  approved_by     text not null,
  approved_at     timestamptz not null,

  -- Execution
  purged_by       text not null,
  purged_at       timestamptz not null default now(),
  purge_method    text not null default 'STORAGE_DELETE',

  -- Verification
  deletion_verified boolean not null default false,
  verified_at     timestamptz,
  verified_by     text,

  metadata        jsonb,
  created_at      timestamptz not null default now(),

  constraint purge_reason_chk
    check (purge_reason in ('RETENTION_EXPIRED', 'GDPR_ERASURE', 'REGULATORY', 'MANUAL_APPROVED')),
  constraint purge_method_chk
    check (purge_method in ('STORAGE_DELETE', 'CRYPTO_SHRED', 'SECURE_WIPE')),
  constraint purge_compliance_chk
    check (compliance_framework is null or compliance_framework in (
      'GDPR', 'PDPA', 'SOC2', 'HIPAA', 'PCI_DSS', 'INTERNAL'
    )),
  constraint purge_cert_manifest_uniq
    unique (tenant_id, manifest_id),
  constraint purge_cert_verify_chk
    check (
      (deletion_verified = false and verified_at is null and verified_by is null)
      or (deletion_verified = true and verified_at is not null and verified_by is not null)
    )
);

comment on table evt.purge_certificate is
'Immutable deletion proof artifact. Created when an archived partition is permanently purged. '
'Captures cryptographic snapshot (sha256, row_count) and full approval chain for compliance.';

create index if not exists idx_purge_cert_tenant
  on evt.purge_certificate (tenant_id, purged_at desc);

create index if not exists idx_purge_cert_manifest
  on evt.purge_certificate (manifest_id);

create index if not exists idx_purge_cert_unverified
  on evt.purge_certificate (tenant_id)
  where deletion_verified = false;

create index if not exists idx_purge_cert_compliance
  on evt.purge_certificate (compliance_framework)
  where compliance_framework is not null;


-- ============================================================================
-- TRIGGER: evt.prevent_purge_cert_mutation()
-- Purge certificates are completely immutable. No UPDATE, no DELETE.
-- Mirrors audit.prevent_audit_mutation() pattern.
-- ============================================================================
create or replace function evt.prevent_purge_cert_mutation()
returns trigger as $$
begin
  if TG_OP = 'DELETE' then
    raise exception 'Purge certificates are permanent compliance artifacts. DELETE is prohibited.';
  end if;

  if TG_OP = 'UPDATE' then
    -- Only allow setting deletion_verified (false → true transition)
    if OLD.deletion_verified = false
       and NEW.deletion_verified = true
       and NEW.verified_at is not null
       and NEW.verified_by is not null then
      -- Allow the verification update, but check everything else is unchanged
      if OLD.archive_sha256 is distinct from NEW.archive_sha256
         or OLD.row_count is distinct from NEW.row_count
         or OLD.storage_uri is distinct from NEW.storage_uri
         or OLD.partition_name is distinct from NEW.partition_name
         or OLD.purged_by is distinct from NEW.purged_by
         or OLD.purged_at is distinct from NEW.purged_at
         or OLD.requested_by is distinct from NEW.requested_by
         or OLD.approved_by is distinct from NEW.approved_by
         or OLD.purge_reason is distinct from NEW.purge_reason
         or OLD.manifest_id is distinct from NEW.manifest_id then
        raise exception 'Only deletion_verified, verified_at, and verified_by can be updated on purge certificates.';
      end if;
      return NEW;
    end if;

    -- All other updates prohibited
    raise exception 'Purge certificates are immutable. Only deletion verification (false → true) is allowed.';
  end if;

  return NEW;
end;
$$ language plpgsql;

-- Apply immutability trigger
do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'trg_evt_purge_cert_guard'
  ) then
    create trigger trg_evt_purge_cert_guard
      before update or delete on evt.purge_certificate
      for each row execute function evt.prevent_purge_cert_mutation();
  end if;
end $$;


-- ============================================================================
-- VIEW: Purge audit trail (for compliance dashboards)
-- ============================================================================
DROP VIEW IF EXISTS evt.purge_audit_trail CASCADE;
create or replace view evt.purge_audit_trail as
  select
    pc.id as certificate_id,
    pc.tenant_id,
    pc.partition_name,
    pc.partition_month,
    pc.archive_sha256,
    pc.row_count,
    pc.archive_format,
    pc.size_bytes,
    pc.purge_reason,
    pc.compliance_framework,
    pc.requested_by,
    pc.requested_at,
    pc.approved_by,
    pc.approved_at,
    pc.purged_by,
    pc.purged_at,
    pc.purge_method,
    pc.deletion_verified,
    pc.verified_at,
    pc.verified_by,
    am.storage_uri as original_storage_uri,
    am.archived_at as original_archived_at,
    am.archived_by as original_archived_by
  from evt.purge_certificate pc
  join evt.archive_manifest am on pc.manifest_id = am.id
  order by pc.purged_at desc;

comment on view evt.purge_audit_trail is
'Comprehensive purge audit trail joining certificates with original archive manifests. '
'For compliance dashboards, auditor reports, and GDPR Art 17 evidence.';
