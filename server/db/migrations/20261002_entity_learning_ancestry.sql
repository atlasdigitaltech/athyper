-- Studio-only forward upgrade; retains existing sources and grants no approval.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$ BEGIN IF current_database()<>'athyper_studio' THEN RAISE EXCEPTION 'Studio database required'; END IF; END $$;
-- Draft ancestry only. No approvals, delivery grants or runtime activation.
-- Bounded read of signed global catalog content; no tenant or record data.
CREATE FUNCTION metadata.fn_product_learning_source(p_release uuid,p_entity_code text,p_plane text)
RETURNS TABLE(entity_id uuid,entity_code text,module_code text,authoring_release_id uuid,
  publication_release_id uuid,release_no bigint,release_hash text,contract_hash text,compiled_hash text,
  graph jsonb,descriptor jsonb,snapshot_hash_matches boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
SELECT e.id entity_id,e.entity_code,m.code module_code,r.id authoring_release_id,
      link.publication_release_id,r.release_no,r.release_hash,r.contract_hash,a.compiled_hash,
      snapshot.contract_json graph,a.compiled_json descriptor,
      snapshot.contract_hash=snapshot.fn_compute_entity_contract_hash(snapshot.contract_json) snapshot_hash_matches
    FROM metadata.entity_release r
    JOIN metadata.entity e ON e.id=r.entity_id AND e.tenant_id IS NULL AND e.ownership_model='system'
    JOIN control.module m ON m.id=e.module_id AND m.status='active'
    JOIN metadata.entity_change_set cs ON cs.id=r.change_set_id AND cs.entity_id=e.id AND cs.tenant_id IS NULL
    JOIN snapshot.entity_contract_revision snapshot ON snapshot.id=r.revision_id
      AND snapshot.entity_id=e.id AND snapshot.change_set_id=cs.id AND snapshot.tenant_id IS NULL
    JOIN snapshot.entity_release_artifact a ON a.source_release_id=r.id AND a.source_revision_id=snapshot.id
      AND a.entity_id=e.id AND a.tenant_id IS NULL AND a.plane_key=p_plane
    JOIN publication.entity_release_link link ON link.entity_release_id=r.id
    WHERE r.tenant_id IS NULL AND link.publication_release_id=p_release::uuid
      AND e.entity_code=p_entity_code AND r.release_kind='publish' AND cs.status='published'
      AND p_plane=ANY(r.target_planes)
      AND snapshot.validation_status='valid' AND snapshot.contract_hash=r.contract_hash
      AND a.contract_hash=r.contract_hash AND a.release_hash=r.release_hash
      AND r.contract_signature IS NOT NULL AND r.signature_algorithm='Ed25519'
      AND cs.approved_by IS NOT NULL AND cs.approved_by<>cs.created_by AND cs.approved_by IS DISTINCT FROM cs.submitted_by
      AND NOT EXISTS(SELECT 1 FROM metadata.entity_release newer WHERE newer.entity_id=e.id
        AND newer.tenant_id IS NULL AND newer.release_no>r.release_no)

      AND EXISTS(SELECT 1 FROM master.principal actor WHERE actor.id=master.current_principal_id_soft()
        AND actor.tenant_id=shared.current_tenant_id_soft() AND actor.status='active')
      AND EXISTS(SELECT 1 FROM master.tenant tenant WHERE tenant.id=shared.current_tenant_id_soft() AND tenant.status='active');
$$;
REVOKE ALL ON FUNCTION metadata.fn_product_learning_source(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION metadata.fn_product_learning_source(uuid,text,text) TO athyperapp;

CREATE TABLE metadata.entity_learning_ancestry (
  tenant_id uuid NOT NULL REFERENCES master.tenant(id),
  entity_id uuid NOT NULL,
  change_set_id uuid PRIMARY KEY,
  baseline_revision bigint NOT NULL CHECK (baseline_revision>=0),
  baseline_graph_hash text NOT NULL CHECK (baseline_graph_hash ~ '^[a-f0-9]{64}$'),
  product_release_id uuid NOT NULL REFERENCES metadata.entity_release(id),
  product_release_no bigint NOT NULL CHECK (product_release_no>0),
  product_contract_hash text NOT NULL CHECK (product_contract_hash ~ '^[a-f0-9]{64}$'),
  product_descriptor_hash text NOT NULL CHECK (product_descriptor_hash ~ '^[a-f0-9]{64}$'),
  ancestry jsonb NOT NULL CHECK (jsonb_typeof(ancestry)='object' AND pg_column_size(ancestry)<=4096),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(entity_id) REFERENCES metadata.entity(id),
  FOREIGN KEY(tenant_id,change_set_id) REFERENCES metadata.entity_change_set(tenant_id,id),
  FOREIGN KEY(change_set_id,baseline_revision) REFERENCES snapshot.entity_draft_save(change_set_id,lock_version),
  FOREIGN KEY(tenant_id,created_by) REFERENCES master.principal(tenant_id,id)
);
CREATE UNIQUE INDEX entity_learning_ancestry_proposal_uq ON metadata.entity_learning_ancestry
  (tenant_id,(ancestry->>'proposalHash'));

CREATE FUNCTION metadata.trg_entity_learning_ancestry() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF TG_OP<>'INSERT' THEN
    RAISE EXCEPTION 'Learning ancestry is immutable' USING ERRCODE='check_violation';
  END IF;
  IF NEW.tenant_id IS DISTINCT FROM shared.current_tenant_id()
    OR NEW.created_by IS DISTINCT FROM master.current_principal_id_soft()
    OR NOT NEW.ancestry ?& ARRAY['schema','tenantId','entityCode','plane','productEntityId','productAuthoringReleaseId',
       'productPublicationReleaseId','productReleaseNo','productContractHash','productDescriptorHash',
       'originContractHash','originDescriptorHash','proposalHash']::text[]
    OR jsonb_typeof(NEW.ancestry->'productReleaseNo') IS DISTINCT FROM 'number'
    OR NEW.ancestry->>'schema' IS DISTINCT FROM 'athyper.tenant-learning-ancestry/1'
    OR NEW.ancestry->>'tenantId' IS DISTINCT FROM NEW.tenant_id::text
    OR NEW.ancestry->>'productAuthoringReleaseId' IS DISTINCT FROM NEW.product_release_id::text
    OR NEW.ancestry->>'productReleaseNo' IS DISTINCT FROM NEW.product_release_no::text
    OR NEW.ancestry->>'productContractHash' IS DISTINCT FROM NEW.product_contract_hash
    OR NEW.ancestry->>'productDescriptorHash' IS DISTINCT FROM NEW.product_descriptor_hash
    OR (NEW.ancestry->>'plane') NOT IN ('studio','neon','mesh')
    OR (NEW.ancestry->>'originContractHash') !~ '^[a-f0-9]{64}$'
    OR (NEW.ancestry->>'originDescriptorHash') !~ '^[a-f0-9]{64}$'
    OR (NEW.ancestry->>'proposalHash') !~ '^[a-f0-9]{64}$'
    OR (NEW.ancestry - ARRAY['schema','tenantId','entityCode','plane','productEntityId','productAuthoringReleaseId',
       'productPublicationReleaseId','productReleaseNo','productContractHash','productDescriptorHash',
       'originContractHash','originDescriptorHash','proposalHash']::text[])<>'{}'::jsonb
    OR NOT EXISTS (
      SELECT 1 FROM metadata.entity_change_set cs
      JOIN metadata.entity e ON e.id=cs.entity_id AND e.tenant_id IS NULL AND e.ownership_model='system'
      JOIN snapshot.entity_draft_save baseline ON baseline.change_set_id=cs.id
        AND baseline.lock_version=NEW.baseline_revision AND baseline.tenant_id=cs.tenant_id
      WHERE cs.id=NEW.change_set_id AND cs.tenant_id=NEW.tenant_id AND cs.entity_id=NEW.entity_id
        AND cs.status='draft' AND cs.created_by=NEW.created_by AND cs.lock_version=NEW.baseline_revision
        AND cs.base_release_id=NEW.product_release_id
        AND e.entity_code=NEW.ancestry->>'entityCode' AND baseline.graph_hash=NEW.baseline_graph_hash
    ) OR NOT EXISTS (
      SELECT 1 FROM metadata.entity_release source
      JOIN metadata.entity e ON e.id=source.entity_id AND e.tenant_id IS NULL AND e.ownership_model='system'
      JOIN metadata.entity_change_set cs ON cs.id=source.change_set_id AND cs.entity_id=e.id AND cs.tenant_id IS NULL
      JOIN publication.entity_release_link link ON link.entity_release_id=source.id
      JOIN snapshot.entity_release_artifact artifact ON artifact.source_release_id=source.id
        AND artifact.source_revision_id=source.revision_id AND artifact.entity_id=e.id
        AND artifact.tenant_id IS NULL AND artifact.plane_key=NEW.ancestry->>'plane'
      WHERE source.id=NEW.product_release_id AND source.entity_id=NEW.entity_id
        AND source.tenant_id IS NULL AND source.release_kind='publish'
        AND source.release_no=NEW.product_release_no AND source.contract_hash=NEW.product_contract_hash
        AND artifact.contract_hash=source.contract_hash AND artifact.release_hash=source.release_hash
        AND source.contract_signature IS NOT NULL AND source.signature_algorithm='Ed25519'
        AND source.entity_id::text=NEW.ancestry->>'productEntityId' AND e.entity_code=NEW.ancestry->>'entityCode'
        AND link.publication_release_id::text=NEW.ancestry->>'productPublicationReleaseId'
        AND cs.status='published' AND cs.approved_by IS NOT NULL
        AND cs.approved_by<>cs.created_by AND cs.approved_by IS DISTINCT FROM cs.submitted_by
        AND NOT EXISTS(SELECT 1 FROM metadata.entity_release newer WHERE newer.entity_id=e.id
          AND newer.tenant_id IS NULL AND newer.release_no>source.release_no)
    ) THEN
    RAISE EXCEPTION 'Learning ancestry must bind the current product and authenticated tenant draft' USING ERRCODE='check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER entity_learning_ancestry_guard BEFORE INSERT OR UPDATE OR DELETE
  ON metadata.entity_learning_ancestry FOR EACH ROW EXECUTE FUNCTION metadata.trg_entity_learning_ancestry();

ALTER TABLE metadata.entity_learning_ancestry ENABLE ROW LEVEL SECURITY;
ALTER TABLE metadata.entity_learning_ancestry FORCE ROW LEVEL SECURITY;
CREATE POLICY entity_learning_ancestry_read ON metadata.entity_learning_ancestry
  FOR SELECT TO athyperapp USING (tenant_id=shared.current_tenant_id_soft());
CREATE POLICY entity_learning_ancestry_insert ON metadata.entity_learning_ancestry
  FOR INSERT TO athyperapp WITH CHECK (tenant_id=shared.current_tenant_id() AND created_by=master.current_principal_id_soft());
GRANT SELECT,INSERT ON metadata.entity_learning_ancestry TO athyperapp;

-- Preserve ordinary scope, immutable identity and lifecycle checks; admit only
-- product-based tenant knowledge drafts with transactionally retained ancestry.
CREATE OR REPLACE FUNCTION metadata.trg_guard_entity_change_set()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, metadata
AS $$
DECLARE
    v_entity_tenant uuid;
    v_parent metadata.entity_change_set%ROWTYPE;
    v_base metadata.entity_release%ROWTYPE;
    v_actor uuid;
    v_substantive_change boolean := false;
    v_product_extension boolean := false;
BEGIN
    SELECT tenant_id
      INTO v_entity_tenant
      FROM metadata.entity
     WHERE id = NEW.entity_id;

    -- A tenant owns the knowledge change set, while the product identity stays
    -- global. Deferred ancestry enforcement below prevents an unanchored commit.
    IF FOUND AND v_entity_tenant IS NULL AND NEW.tenant_id IS NOT NULL THEN
        PERFORM pg_advisory_xact_lock(hashtextextended('system-entity-release:'||NEW.entity_id,0));
        SELECT EXISTS (
          SELECT 1 FROM metadata.entity_release source
          JOIN metadata.entity product ON product.id=source.entity_id AND product.ownership_model='system' AND product.tenant_id IS NULL
          JOIN metadata.entity_change_set reviewed ON reviewed.id=source.change_set_id AND reviewed.tenant_id IS NULL
          WHERE source.id=NEW.base_release_id AND source.entity_id=NEW.entity_id AND source.tenant_id IS NULL
            AND source.release_kind='publish' AND source.contract_signature IS NOT NULL AND source.signature_algorithm='Ed25519'
            AND reviewed.status='published' AND reviewed.approved_by IS NOT NULL
            AND reviewed.approved_by<>reviewed.created_by AND reviewed.approved_by IS DISTINCT FROM reviewed.submitted_by
            AND ((NOT EXISTS(SELECT 1 FROM metadata.entity_release newer
              WHERE newer.entity_id=source.entity_id AND newer.tenant_id IS NULL AND newer.release_no>source.release_no))
              OR (TG_OP='UPDATE' AND EXISTS(SELECT 1 FROM metadata.entity_learning_ancestry pin
                WHERE pin.change_set_id=NEW.id AND pin.tenant_id=NEW.tenant_id AND pin.entity_id=NEW.entity_id AND pin.product_release_id=source.id)))
        ) INTO v_product_extension;
    END IF;

    IF (v_entity_tenant IS DISTINCT FROM NEW.tenant_id AND NOT v_product_extension)
       OR NOT EXISTS(SELECT 1 FROM metadata.entity WHERE id=NEW.entity_id) THEN
        RAISE EXCEPTION 'Change-set scope must match its Entity scope'
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF NEW.parent_change_set_id IS NOT NULL THEN
        SELECT * INTO v_parent
          FROM metadata.entity_change_set
         WHERE id = NEW.parent_change_set_id;
        IF NOT FOUND
           OR v_parent.tenant_id IS DISTINCT FROM NEW.tenant_id
           OR v_parent.entity_id <> NEW.entity_id THEN
            RAISE EXCEPTION 'Parent change set must belong to the same scoped Entity'
                USING ERRCODE = 'foreign_key_violation';
        END IF;
    END IF;

    IF NEW.base_release_id IS NOT NULL THEN
        SELECT * INTO v_base
          FROM metadata.entity_release
         WHERE id = NEW.base_release_id;
        IF NOT FOUND
           OR (v_base.tenant_id IS DISTINCT FROM NEW.tenant_id AND NOT (v_product_extension AND v_base.tenant_id IS NULL))
           OR v_base.entity_id <> NEW.entity_id THEN
            RAISE EXCEPTION 'Base release must belong to the same scoped Entity'
                USING ERRCODE = 'foreign_key_violation';
        END IF;
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF NEW.status <> 'draft' THEN
            RAISE EXCEPTION 'A change set must be created in draft status'
                USING ERRCODE = 'invalid_parameter_value';
        END IF;
        RETURN NEW;
    END IF;

    IF ROW(NEW.id, NEW.tenant_id, NEW.entity_id, NEW.change_set_code,
           NEW.branch_code, NEW.base_release_id, NEW.parent_change_set_id,
           NEW.created_at, NEW.created_by)
       IS DISTINCT FROM
       ROW(OLD.id, OLD.tenant_id, OLD.entity_id, OLD.change_set_code,
           OLD.branch_code, OLD.base_release_id, OLD.parent_change_set_id,
           OLD.created_at, OLD.created_by) THEN
        RAISE EXCEPTION 'Change-set identity, ancestry, base release, and creation evidence are immutable'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    v_substantive_change := ROW(
        NEW.title, NEW.change_summary, NEW.change_reason_code, NEW.ticket_reference
    ) IS DISTINCT FROM ROW(
        OLD.title, OLD.change_summary, OLD.change_reason_code, OLD.ticket_reference
    );

    IF v_substantive_change AND OLD.status NOT IN ('draft', 'rejected') THEN
        RAISE EXCEPTION 'Only draft or rejected change sets may be edited'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    IF v_substantive_change AND OLD.status = 'rejected' AND NEW.status <> 'draft' THEN
        RAISE EXCEPTION 'Editing a rejected change set must return it to draft'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    IF OLD.status IS DISTINCT FROM NEW.status THEN
        IF (OLD.status = 'draft' AND NEW.status NOT IN ('in_review', 'abandoned'))
           OR (OLD.status = 'in_review' AND NEW.status NOT IN ('draft', 'approved', 'rejected', 'abandoned'))
           OR (OLD.status = 'rejected' AND NEW.status NOT IN ('draft', 'abandoned'))
           OR (OLD.status = 'approved' AND NEW.status <> 'published')
           OR OLD.status IN ('abandoned', 'published') THEN
            RAISE EXCEPTION 'Invalid change-set transition: % -> %', OLD.status, NEW.status
                USING ERRCODE = 'invalid_parameter_value';
        END IF;

        v_actor := metadata.current_actor_id(NEW.status_changed_by);
        IF v_actor IS NULL THEN
            RAISE EXCEPTION 'Current principal context is required for a change-set transition'
                USING ERRCODE = 'insufficient_privilege';
        END IF;

        NEW.status_changed_at := clock_timestamp();
        NEW.status_changed_by := v_actor;

        IF NEW.status = 'draft' THEN
            NEW.submitted_at := NULL;
            NEW.submitted_by := NULL;
            NEW.reviewed_at := NULL;
            NEW.reviewed_by := NULL;
            NEW.approved_at := NULL;
            NEW.approved_by := NULL;
            NEW.rejected_at := NULL;
            NEW.rejected_by := NULL;
            NEW.rejection_reason := NULL;
            NEW.published_at := NULL;
            NEW.published_by := NULL;
        ELSIF NEW.status = 'in_review' THEN
            NEW.submitted_at := clock_timestamp();
            NEW.submitted_by := v_actor;
        ELSIF NEW.status = 'approved' THEN
            NEW.reviewed_at := coalesce(NEW.reviewed_at, clock_timestamp());
            NEW.reviewed_by := coalesce(NEW.reviewed_by, v_actor);
            NEW.approved_at := clock_timestamp();
            NEW.approved_by := v_actor;
        ELSIF NEW.status = 'rejected' THEN
            IF nullif(btrim(NEW.rejection_reason), '') IS NULL THEN
                RAISE EXCEPTION 'A rejection reason is required'
                    USING ERRCODE = 'not_null_violation';
            END IF;
            NEW.reviewed_at := coalesce(NEW.reviewed_at, clock_timestamp());
            NEW.reviewed_by := coalesce(NEW.reviewed_by, v_actor);
            NEW.rejected_at := clock_timestamp();
            NEW.rejected_by := v_actor;
        ELSIF NEW.status = 'published' THEN
            IF NOT EXISTS (
                SELECT 1 FROM metadata.entity_release
                 WHERE change_set_id = NEW.id
            ) THEN
                RAISE EXCEPTION 'A change set becomes published only through an Entity release'
                    USING ERRCODE = 'object_not_in_prerequisite_state';
            END IF;
            NEW.published_at := coalesce(NEW.published_at, clock_timestamp());
            NEW.published_by := coalesce(NEW.published_by, v_actor);
        END IF;
    END IF;

    NEW.lock_version := OLD.lock_version + 1;
    RETURN NEW;
END;
$$;

CREATE FUNCTION metadata.trg_require_entity_learning_ancestry() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF NEW.tenant_id IS NOT NULL AND EXISTS(SELECT 1 FROM metadata.entity e
    WHERE e.id=NEW.entity_id AND e.tenant_id IS NULL) AND NOT EXISTS(
      SELECT 1 FROM metadata.entity_learning_ancestry pin WHERE pin.tenant_id=NEW.tenant_id
        AND pin.change_set_id=NEW.id AND pin.entity_id=NEW.entity_id AND pin.product_release_id=NEW.base_release_id
        AND pin.created_by=NEW.created_by
  ) THEN
    RAISE EXCEPTION 'A tenant product knowledge draft requires retained immutable ancestry' USING ERRCODE='check_violation';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER entity_learning_ancestry_required AFTER INSERT ON metadata.entity_change_set
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION metadata.trg_require_entity_learning_ancestry();

COMMIT;
