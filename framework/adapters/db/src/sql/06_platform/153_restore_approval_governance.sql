/* ============================================================================
   Athyper v2.1 — Restore Approval Governance
   Schema: evt
   Dependencies: evt.data_tiering_policy (151), evt.restore_request (152)

   Adds role-based approval governance to the restore workflow:
     1. approval_config JSONB on evt.data_tiering_policy
     2. evt.validate_restore_approval() — checks approval authority

   approval_config structure:
   {
     "requester_roles": ["admin", "dba"],
     "approver_roles": ["admin", "compliance_officer"],
     "dual_approval_required": false,
     "compliance_review_frameworks": ["GDPR", "SOC2"],
     "auto_approve_if_no_hold": false
   }

   When compliance_review_frameworks is set and the partition's retention
   policy uses one of those frameworks, dual approval is ALWAYS required
   regardless of the dual_approval_required flag.
   ============================================================================ */

-- Add approval_config to tiering policy
alter table evt.data_tiering_policy
  add column if not exists approval_config jsonb;

comment on column evt.data_tiering_policy.approval_config is
'Role-based approval governance for restore/purge operations. '
'Structure: { requester_roles, approver_roles, dual_approval_required, '
'compliance_review_frameworks, auto_approve_if_no_hold }';

-- Add secondary approver to restore request for dual-approval workflows
alter table evt.restore_request
  add column if not exists secondary_approved_by text,
  add column if not exists secondary_approved_at timestamptz;

comment on column evt.restore_request.secondary_approved_by is
'Second approver for dual-approval workflows (compliance-sensitive restores).';


-- ============================================================================
-- FUNCTION: evt.validate_restore_approval()
-- Checks whether a restore request has sufficient approval authority.
--
-- Returns:
--   approved: boolean (are all required approvals present?)
--   missing: text[]   (what is still needed)
--   requires_dual: boolean (does this request need dual approval?)
-- ============================================================================
create or replace function evt.validate_restore_approval(
  p_restore_request_id uuid
) returns table (
  approved       boolean,
  missing        text[],
  requires_dual  boolean
) as $$
declare
  v_request     record;
  v_config      jsonb;
  v_policy      record;
  v_retention   record;
  v_dual        boolean := false;
  v_missing     text[] := '{}';
begin
  -- Fetch request details
  select rr.*, am.tenant_id as manifest_tenant_id
  into v_request
  from evt.restore_request rr
  join evt.archive_manifest am on rr.manifest_id = am.id
  where rr.id = p_restore_request_id;

  if not found then
    return query select false, ARRAY['restore_request_not_found']::text[], false;
    return;
  end if;

  -- Fetch tiering policy with approval config
  select tp.approval_config
  into v_config
  from evt.data_tiering_policy tp
  where tp.tenant_id = v_request.tenant_id
    and tp.is_active = true
    and tp.source_schema = 'evt'
    and tp.source_table = 'event'
  order by tp.priority desc
  limit 1;

  -- No approval config → simple: just need approved_by
  if v_config is null then
    if v_request.approved_by is null then
      return query select false, ARRAY['primary_approval_required']::text[], false;
    else
      return query select true, '{}'::text[], false;
    end if;
    return;
  end if;

  -- Check primary approval
  if v_request.approved_by is null then
    v_missing := array_append(v_missing, 'primary_approval_required');
  end if;

  -- Determine if dual approval is required
  v_dual := coalesce((v_config->>'dual_approval_required')::boolean, false);

  -- Check compliance-framework-driven dual approval
  if not v_dual and v_config ? 'compliance_review_frameworks' then
    -- Look up the retention policy for evt.event
    select rp.compliance_framework
    into v_retention
    from core.data_retention_policy rp
    where rp.tenant_id = v_request.tenant_id
      and rp.target_schema = 'evt'
      and (rp.target_table = 'event' or rp.target_table is null)
      and rp.is_active = true
    order by
      case rp.policy_scope when 'entity' then 1 when 'table' then 2 when 'schema' then 3 end,
      rp.priority desc
    limit 1;

    if v_retention.compliance_framework is not null then
      -- Check if this framework requires review
      if v_config->'compliance_review_frameworks' @> to_jsonb(v_retention.compliance_framework) then
        v_dual := true;
      end if;
    end if;
  end if;

  -- Check dual approval if required
  if v_dual and v_request.secondary_approved_by is null then
    v_missing := array_append(v_missing, 'secondary_approval_required');
  end if;

  -- Check legal hold
  if core.is_legal_hold_active(v_request.tenant_id, 'evt', 'event') then
    v_missing := array_append(v_missing, 'legal_hold_active');
  end if;

  return query select
    (array_length(v_missing, 1) is null or array_length(v_missing, 1) = 0),
    v_missing,
    v_dual;
end;
$$ language plpgsql stable;

comment on function evt.validate_restore_approval is
'Validates restore request approval chain against tiering policy approval_config. '
'Checks primary/dual approval, compliance framework review requirements, and legal holds.';
