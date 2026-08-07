CREATE OR REPLACE FUNCTION ops.certify_authorization_operation_parity(
  p_plane_code text,p_entity_code text,p_source_entity_operation_id uuid,
  p_source_release_hash text,p_source_artifact_hash text,p_actor_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,ops,shared AS $$
DECLARE q record; v_id uuid; v_status text; v_fingerprint text;
BEGIN
  SELECT * INTO q FROM ops.authorization_shadow_qualification_v
   WHERE plane_code=p_plane_code AND entity_code=p_entity_code
     AND source_entity_operation_id=p_source_entity_operation_id
     AND source_release_hash=p_source_release_hash AND source_artifact_hash=p_source_artifact_hash;
  IF NOT FOUND THEN RAISE EXCEPTION 'authorization_parity.evidence_missing'; END IF;
  v_status := CASE WHEN q.qualifies_default THEN 'qualified' ELSE 'rejected' END;
  v_fingerprint := encode(public.digest(convert_to(concat_ws('|',p_plane_code,p_entity_code,
    p_source_entity_operation_id,p_source_release_hash,p_source_artifact_hash,q.sample_count,
    q.mismatch_count,q.candidate_error_count,q.required_cohort_count,q.covered_cohort_count,
    q.observed_from,q.observed_through),'UTF8'),'sha256'),'hex');
  INSERT INTO ops.authorization_parity_certification (
    plane_code,entity_code,source_entity_operation_id,source_release_hash,source_artifact_hash,
    sample_count,mismatch_count,candidate_error_count,required_cohort_count,covered_cohort_count,observed_from,observed_through,status,
    evidence_fingerprint,certified_by)
  VALUES (p_plane_code,p_entity_code,p_source_entity_operation_id,p_source_release_hash,p_source_artifact_hash,
    q.sample_count,q.mismatch_count,q.candidate_error_count,q.required_cohort_count,q.covered_cohort_count,q.observed_from,q.observed_through,v_status,
    v_fingerprint,p_actor_id)
  ON CONFLICT (plane_code,entity_code,source_entity_operation_id,source_release_hash,source_artifact_hash,evidence_fingerprint)
  DO NOTHING RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM ops.authorization_parity_certification
     WHERE plane_code=p_plane_code AND entity_code=p_entity_code
       AND source_entity_operation_id=p_source_entity_operation_id
       AND source_release_hash=p_source_release_hash AND source_artifact_hash=p_source_artifact_hash
       AND evidence_fingerprint=v_fingerprint;
  END IF;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION ops.set_authorization_operation_rollout(
  p_plane_code text,p_entity_code text,p_source_entity_operation_id uuid,
  p_source_release_hash text,p_source_artifact_hash text,p_mode text,
  p_actor_id uuid,p_reason text,p_ticket text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,ops,shared AS $$
DECLARE c ops.authorization_parity_certification%ROWTYPE; old_mode text;
BEGIN
  IF p_mode NOT IN ('legacy','shadow','active') THEN RAISE EXCEPTION 'authorization_rollout.mode_invalid'; END IF;
  IF btrim(coalesce(p_reason,''))='' THEN RAISE EXCEPTION 'authorization_rollout.reason_required'; END IF;
  SELECT mode INTO old_mode FROM ops.authorization_operation_rollout
   WHERE plane_code=p_plane_code AND source_entity_operation_id=p_source_entity_operation_id FOR UPDATE;
  IF p_mode='active' THEN
    SELECT * INTO c FROM ops.authorization_parity_certification
     WHERE plane_code=p_plane_code AND entity_code=p_entity_code
       AND source_entity_operation_id=p_source_entity_operation_id
       AND source_release_hash=p_source_release_hash AND source_artifact_hash=p_source_artifact_hash
       AND status='qualified' ORDER BY certified_at DESC LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'authorization_rollout.qualified_certification_required'; END IF;
  END IF;
  PERFORM set_config('ops.authorization_rollout_writer','on',true);
  INSERT INTO ops.authorization_operation_rollout AS r (
    plane_code,entity_code,source_entity_operation_id,source_release_hash,source_artifact_hash,mode,
    certification_id,change_reason,change_ticket,activated_at,activated_by,rolled_back_at,rolled_back_by,
    created_by,updated_by)
  VALUES (p_plane_code,p_entity_code,p_source_entity_operation_id,p_source_release_hash,p_source_artifact_hash,p_mode,
    CASE WHEN p_mode='active' THEN c.id END,p_reason,p_ticket,
    CASE WHEN p_mode='active' THEN now() END,CASE WHEN p_mode='active' THEN p_actor_id END,
    NULL,NULL,p_actor_id,p_actor_id)
  ON CONFLICT (plane_code,source_entity_operation_id) DO UPDATE SET
    entity_code=EXCLUDED.entity_code,source_release_hash=EXCLUDED.source_release_hash,
    source_artifact_hash=EXCLUDED.source_artifact_hash,mode=EXCLUDED.mode,
    certification_id=EXCLUDED.certification_id,change_reason=EXCLUDED.change_reason,
    change_ticket=EXCLUDED.change_ticket,
    activated_at=CASE WHEN EXCLUDED.mode='active' THEN now() ELSE r.activated_at END,
    activated_by=CASE WHEN EXCLUDED.mode='active' THEN p_actor_id ELSE r.activated_by END,
    rolled_back_at=CASE WHEN r.mode='active' AND EXCLUDED.mode<>'active' THEN now() ELSE r.rolled_back_at END,
    rolled_back_by=CASE WHEN r.mode='active' AND EXCLUDED.mode<>'active' THEN p_actor_id ELSE r.rolled_back_by END,
    updated_at=now(),updated_by=p_actor_id;
END $$;

CREATE OR REPLACE FUNCTION ops.trg_guard_authorization_parity_certification()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,ops AS $$ BEGIN
  RAISE EXCEPTION 'authorization_parity_certification is append-only';
END $$;

CREATE OR REPLACE FUNCTION ops.trg_guard_authorization_rollout_write()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,ops AS $$ BEGIN
  IF current_setting('ops.authorization_rollout_writer',true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'use ops.set_authorization_operation_rollout';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION ops.trg_guard_authorization_operation_cutover_drill()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,ops AS $$ BEGIN
  RAISE EXCEPTION 'authorization_operation_cutover_drill is append-only';
END $$;

CREATE OR REPLACE FUNCTION ops.trg_guard_authorization_shadow_comparison()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, ops
AS $$ BEGIN
    RAISE EXCEPTION 'Authorization shadow comparison evidence is append-only'
      USING ERRCODE='55000';
END; $$;
CREATE OR REPLACE FUNCTION ops.trg_guard_identity_admission_shadow_comparison()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN RAISE EXCEPTION 'identity_admission_shadow_comparison is append-only' USING ERRCODE='integrity_constraint_violation'; END $$;
