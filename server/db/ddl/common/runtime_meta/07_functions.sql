CREATE OR REPLACE FUNCTION runtime_meta.trg_validate_entity_number_counter()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, runtime_meta, control
AS $$
DECLARE
    v_policy control.numbering_policy%ROWTYPE;
BEGIN
    SELECT * INTO v_policy FROM control.numbering_policy WHERE id = NEW.numbering_policy_id;
    IF NOT FOUND OR v_policy.status <> 'active' THEN
        RAISE EXCEPTION 'Entity number counter requires an active numbering policy' USING ERRCODE='foreign_key_violation';
    END IF;
    IF v_policy.tenant_id IS NOT NULL AND v_policy.tenant_id <> NEW.tenant_id THEN
        RAISE EXCEPTION 'Tenant numbering counter cannot reference another tenant policy' USING ERRCODE='foreign_key_violation';
    END IF;
    IF v_policy.scope_kind = 'tenant' AND NEW.scope_key <> NEW.tenant_id::text THEN
        RAISE EXCEPTION 'Tenant-scoped numbering counter scope_key must equal tenant_id' USING ERRCODE='check_violation';
    END IF;
    IF (v_policy.reset_kind = 'never' AND NEW.reset_bucket <> 'never')
       OR (v_policy.reset_kind = 'calendar_year' AND NEW.reset_bucket !~ '^[0-9]{4}$')
       OR (v_policy.reset_kind = 'calendar_month' AND NEW.reset_bucket !~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
       OR (v_policy.reset_kind = 'calendar_day' AND NEW.reset_bucket !~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$')
       OR (v_policy.reset_kind = 'fiscal_year' AND NEW.reset_bucket !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,126}$') THEN
        RAISE EXCEPTION 'Counter reset_bucket does not match numbering policy reset_kind' USING ERRCODE='check_violation';
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF NEW.next_value <> v_policy.start_value OR NEW.allocation_count <> 0 OR NEW.row_version <> 0
           OR NEW.last_allocated_value IS NOT NULL OR NEW.last_allocation_id IS NOT NULL
           OR NEW.last_allocated_at IS NOT NULL OR NEW.last_allocated_by IS NOT NULL
           OR NEW.last_correlation_id IS NOT NULL THEN
            RAISE EXCEPTION 'New numbering counters must begin at the policy start value with no allocation state'
                USING ERRCODE='check_violation';
        END IF;
        RETURN NEW;
    END IF;

    IF NEW.id <> OLD.id OR NEW.tenant_id <> OLD.tenant_id
       OR NEW.numbering_policy_id <> OLD.numbering_policy_id
       OR NEW.scope_key <> OLD.scope_key OR NEW.reset_bucket <> OLD.reset_bucket
       OR NEW.created_at <> OLD.created_at OR NEW.created_by <> OLD.created_by THEN
        RAISE EXCEPTION 'Entity number counter identity is immutable' USING ERRCODE='integrity_constraint_violation';
    END IF;
    IF v_policy.maximum_value IS NOT NULL AND OLD.next_value > v_policy.maximum_value THEN
        RAISE EXCEPTION 'NUMBERING_POLICY_EXHAUSTED' USING ERRCODE='program_limit_exceeded';
    END IF;
    IF NEW.next_value <> OLD.next_value + v_policy.increment_by
       OR NEW.allocation_count <> OLD.allocation_count + 1
       OR NEW.row_version <> OLD.row_version + 1
       OR NEW.last_allocated_value <> OLD.next_value
       OR NEW.last_allocation_id IS NULL OR NEW.last_allocated_at IS NULL OR NEW.last_allocated_by IS NULL THEN
        RAISE EXCEPTION 'Counter updates must represent exactly one numbering allocation'
            USING ERRCODE='integrity_constraint_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION runtime_meta.fn_stage_release(
    p_publication_key text, p_source_release_id uuid, p_source_release_no bigint,
    p_deployment_id uuid, p_artifact_hash text, p_manifest jsonb
) RETURNS runtime_meta.applied_release
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,runtime_meta
AS $$
DECLARE v_row runtime_meta.applied_release%ROWTYPE;
BEGIN
    INSERT INTO runtime_meta.applied_release(publication_key,source_release_id,source_release_no,deployment_id,artifact_hash,manifest)
    VALUES(p_publication_key,p_source_release_id,p_source_release_no,p_deployment_id,p_artifact_hash,p_manifest)
    ON CONFLICT(publication_key,source_release_id) DO NOTHING RETURNING * INTO v_row;
    IF NOT FOUND THEN
      SELECT * INTO STRICT v_row FROM runtime_meta.applied_release WHERE publication_key=p_publication_key AND source_release_id=p_source_release_id;
      IF v_row.deployment_id<>p_deployment_id OR v_row.artifact_hash<>p_artifact_hash OR v_row.manifest<>p_manifest THEN
        RAISE EXCEPTION 'RELEASE_STAGE_IDEMPOTENCY_CONFLICT' USING ERRCODE='unique_violation';
      END IF;
    END IF;
    RETURN v_row;
END; $$;

CREATE OR REPLACE FUNCTION runtime_meta.fn_verify_release(
    p_applied_release_id uuid, p_computed_artifact_hash text, p_evidence jsonb DEFAULT '{}'::jsonb
) RETURNS runtime_meta.applied_release
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,runtime_meta
AS $$
DECLARE v_row runtime_meta.applied_release%ROWTYPE;
BEGIN
    SELECT * INTO v_row FROM runtime_meta.applied_release WHERE id=p_applied_release_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'APPLIED_RELEASE_NOT_FOUND' USING ERRCODE='no_data_found'; END IF;
    IF v_row.status='verified' THEN RETURN v_row; END IF;
    IF v_row.status<>'staged' THEN RAISE EXCEPTION 'RELEASE_NOT_STAGED' USING ERRCODE='object_not_in_prerequisite_state'; END IF;
    IF v_row.artifact_hash<>p_computed_artifact_hash THEN
      UPDATE runtime_meta.applied_release SET status='rejected',rejected_at=clock_timestamp(),failure_code='ARTIFACT_HASH_MISMATCH',verification_evidence=COALESCE(p_evidence,'{}'::jsonb) WHERE id=v_row.id RETURNING * INTO v_row;
      RETURN v_row;
    END IF;
    IF COALESCE((p_evidence->>'signature_verified')::boolean,false) IS NOT TRUE
       OR COALESCE((p_evidence->>'manifest_valid')::boolean,false) IS NOT TRUE
       OR COALESCE((p_evidence->>'runtime_compatible')::boolean,false) IS NOT TRUE THEN
      RAISE EXCEPTION 'RELEASE_VERIFICATION_EVIDENCE_INCOMPLETE' USING ERRCODE='check_violation';
    END IF;
    UPDATE runtime_meta.applied_release SET status='verified',verified_at=clock_timestamp(),verification_evidence=COALESCE(p_evidence,'{}'::jsonb) WHERE id=v_row.id RETURNING * INTO v_row;
    RETURN v_row;
END; $$;

CREATE OR REPLACE FUNCTION runtime_meta.fn_activate_release(
    p_applied_release_id uuid, p_evidence jsonb DEFAULT '{}'::jsonb
) RETURNS runtime_meta.release_activation_head
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,runtime_meta
AS $$
DECLARE v_candidate runtime_meta.applied_release%ROWTYPE; v_head runtime_meta.release_activation_head%ROWTYPE; v_previous uuid;
BEGIN
    SELECT * INTO v_candidate FROM runtime_meta.applied_release WHERE id=p_applied_release_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'APPLIED_RELEASE_NOT_FOUND' USING ERRCODE='no_data_found'; END IF;
    IF v_candidate.status='active' THEN SELECT * INTO STRICT v_head FROM runtime_meta.release_activation_head WHERE applied_release_id=v_candidate.id; RETURN v_head; END IF;
    IF v_candidate.status<>'verified' THEN RAISE EXCEPTION 'RELEASE_NOT_VERIFIED' USING ERRCODE='object_not_in_prerequisite_state'; END IF;

    SELECT * INTO v_head FROM runtime_meta.release_activation_head WHERE publication_key=v_candidate.publication_key FOR UPDATE;
    IF FOUND THEN
      IF v_candidate.source_release_no<=v_head.source_release_no THEN RAISE EXCEPTION 'RELEASE_SEQUENCE_NOT_FORWARD' USING ERRCODE='object_not_in_prerequisite_state'; END IF;
      v_previous:=v_head.applied_release_id;
      UPDATE runtime_meta.applied_release SET status='superseded' WHERE id=v_previous AND status='active';
      UPDATE runtime_meta.release_activation_head SET applied_release_id=v_candidate.id,source_release_no=v_candidate.source_release_no,
        artifact_hash=v_candidate.artifact_hash,activated_at=clock_timestamp(),row_version=row_version+1
      WHERE publication_key=v_candidate.publication_key RETURNING * INTO v_head;
    ELSE
      INSERT INTO runtime_meta.release_activation_head(publication_key,applied_release_id,source_release_no,artifact_hash,activated_at)
      VALUES(v_candidate.publication_key,v_candidate.id,v_candidate.source_release_no,v_candidate.artifact_hash,clock_timestamp()) RETURNING * INTO v_head;
    END IF;
    UPDATE runtime_meta.applied_release SET status='active',activated_at=v_head.activated_at WHERE id=v_candidate.id;
    INSERT INTO runtime_meta.release_activation_event(publication_key,previous_applied_release_id,applied_release_id,activated_at,evidence)
    VALUES(v_candidate.publication_key,v_previous,v_candidate.id,v_head.activated_at,COALESCE(p_evidence,'{}'::jsonb));
    RETURN v_head;
END; $$;

CREATE OR REPLACE FUNCTION runtime_meta.fn_active_release(p_publication_key text)
RETURNS TABLE(applied_release_id uuid,source_release_id uuid,source_release_no bigint,artifact_hash text,manifest jsonb,activated_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,runtime_meta
AS $$ SELECT a.id,a.source_release_id,a.source_release_no,a.artifact_hash,a.manifest,h.activated_at
       FROM runtime_meta.release_activation_head h JOIN runtime_meta.applied_release a ON a.id=h.applied_release_id
       WHERE h.publication_key=p_publication_key AND a.status='active' $$;

COMMENT ON FUNCTION runtime_meta.fn_active_release(text) IS 'Offline-safe runtime read: returns only the last locally verified and atomically activated release.';
