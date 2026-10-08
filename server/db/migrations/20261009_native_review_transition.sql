BEGIN;
SET LOCAL lock_timeout='5s';
-- Exact native lifecycle command. Aggregate constraints execute inside this
-- restricted definer command; the control login receives no graph-table grants.
CREATE FUNCTION publication.transition_native_product_review(p_draft uuid,p_revision bigint,p_from text,p_to text,p_actor uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c metadata.entity_change_set; source_hash text; action_name text;
BEGIN
 IF p_actor IS NULL OR p_actor IS DISTINCT FROM master.current_principal_id_soft()
 OR NOT ((p_from='draft' AND p_to='in_review') OR (p_from='in_review' AND p_to='approved'))
 OR p_from IS NULL OR p_to IS NULL THEN RAISE EXCEPTION 'NATIVE_REVIEW_TRANSITION_DENIED' USING ERRCODE='42501'; END IF;
 -- Independently authenticates current human scope and restricts native product.
 SELECT graph_hash INTO STRICT source_hash FROM publication.read_native_product_review_source(p_draft,4194304);
 SELECT * INTO STRICT c FROM metadata.entity_change_set WHERE id=p_draft FOR UPDATE;
 action_name:=CASE WHEN p_to='in_review' THEN 'submit' ELSE 'approve' END;
 IF c.lock_version IS DISTINCT FROM p_revision OR c.status::text IS DISTINCT FROM p_from
 OR (action_name='submit' AND c.created_by IS DISTINCT FROM p_actor)
 OR (action_name='approve' AND (c.created_by=p_actor OR c.submitted_by IS NULL OR c.submitted_by=p_actor))
 OR NOT EXISTS(SELECT 1 FROM metadata.entity_product_review_receipt r
   WHERE r.authority_tenant_id=shared.current_tenant_id_soft() AND r.change_set_id=c.id AND r.actor_id=p_actor
     AND r.action=action_name AND r.expected_revision=p_revision AND r.contract_hash=source_hash)
 OR (action_name='approve' AND NOT EXISTS(SELECT 1 FROM metadata.entity_product_review_receipt r
   WHERE r.authority_tenant_id=shared.current_tenant_id_soft() AND r.change_set_id=c.id AND r.actor_id=c.submitted_by
     AND r.action='submit' AND r.expected_revision=p_revision-1 AND r.contract_hash=source_hash))
 THEN RAISE EXCEPTION 'NATIVE_REVIEW_TRANSITION_EVIDENCE_CHANGED' USING ERRCODE='42501'; END IF;
 UPDATE metadata.entity_change_set SET status=p_to::metadata.entity_change_set_status_d,status_changed_by=p_actor WHERE id=c.id;
 -- Validate the complete canonical graph while definer-only reads are in scope.
 -- No constraint is disabled and no caller-selected SQL/table is executed.
 SET CONSTRAINTS metadata.native_layout_final_guard,metadata.native_core_final_guard,metadata.native_root_final_guard,metadata.native_snapshot_final_guard,metadata.settings_locale_check IMMEDIATE;
 RETURN c.id;
END $$;
REVOKE ALL ON FUNCTION publication.transition_native_product_review(uuid,bigint,text,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION publication.transition_native_product_review(uuid,bigint,text,text,uuid) TO athyper_control_api;

COMMIT;
