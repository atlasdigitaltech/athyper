-- Native/legacy compatibility. Pending native guards are deliberately retained.
-- nullable and id_field_id are required native discriminators, not user grants.
ALTER TABLE metadata.entity_field DROP CONSTRAINT entity_field_computation_chk;
ALTER TABLE metadata.entity_field ADD CONSTRAINT entity_field_computation_chk CHECK (
  (nullable IS NULL AND (
    (value_origin='computed' AND write_mode='computed' AND computation_spec IS NOT NULL)
    OR (value_origin<>'computed' AND write_mode<>'computed' AND computation_spec IS NULL)
  )) OR (nullable IS NOT NULL AND computation_spec IS NULL AND (
    (value_origin='computed' AND write_mode='read_only')
    OR (value_origin<>'computed' AND write_mode<>'computed' AND computed_contract_key IS NULL AND (value_origin<>'runtime' OR write_mode='read_only'))
  ) AND ((computed_contract_key IS NULL)=(computed_contract_version IS NULL)))
);
ALTER TABLE metadata.entity_runtime_profile DROP CONSTRAINT entity_runtime_profile_version_field_chk;
ALTER TABLE metadata.entity_runtime_profile ADD CONSTRAINT entity_runtime_profile_version_field_chk CHECK (
  (id_field_id IS NULL AND record_version_field_id IS NULL AND (
    (concurrency_mode='optimistic' AND record_version_field_key IS NOT NULL)
    OR (concurrency_mode<>'optimistic' AND record_version_field_key IS NULL)
  )) OR (id_field_id IS NOT NULL AND record_version_field_key IS NULL AND (
    concurrency_mode='optimistic' OR record_version_field_id IS NULL
  ))
);
-- Missing computed/version references remain P completeness findings for native
-- drafts; supplied partial pairs and wrong variants reject at save time.
ALTER DOMAIN metadata.entity_surface_section_kind_d DROP CONSTRAINT entity_surface_section_kind_d_check;
ALTER DOMAIN metadata.entity_surface_section_kind_d ADD CONSTRAINT entity_surface_section_kind_d_check
  CHECK (VALUE IN ('section','group','fieldset','tab','columns','subsection'));
ALTER TABLE metadata.entity_surface_section ADD CONSTRAINT entity_section_kind_representation_ck CHECK (
  (content_kind IS NULL AND section_kind IN ('section','group','fieldset','tab','columns'))
  OR (content_kind IS NOT NULL AND section_kind IN ('section','subsection','fieldset','columns'))
);

-- Native position scopes match the typed layout validator. Legacy sections
-- retain their narrower scope through a deferred final-state constraint below.
ALTER TABLE metadata.entity_surface_section DROP CONSTRAINT entity_surface_section_position_uq;
ALTER TABLE metadata.entity_surface_section ADD CONSTRAINT entity_surface_section_position_uq
  UNIQUE NULLS NOT DISTINCT (tenant_id,entity_surface_id,navigation_group_id,parent_section_id,position)
  DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE metadata.entity_surface_field_binding DROP CONSTRAINT entity_surface_field_binding_position_uq;
ALTER TABLE metadata.entity_surface_field_binding ADD CONSTRAINT entity_surface_field_binding_position_uq
  UNIQUE NULLS NOT DISTINCT (tenant_id,entity_surface_id,overlay_id,entity_surface_section_id,binding_kind,position)
  DEFERRABLE INITIALLY IMMEDIATE;

CREATE OR REPLACE FUNCTION metadata.guard_legacy_section_position() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,metadata AS $$
DECLARE draft uuid;
BEGIN
  draft:=COALESCE(NEW.change_set_id,OLD.change_set_id);
  -- Existing graph mutation guards serialize writers through the draft root.
  IF EXISTS(SELECT 1 FROM metadata.entity_surface_section s
    WHERE s.change_set_id=draft AND s.content_kind IS NULL
    GROUP BY s.tenant_id,s.entity_surface_id,s.parent_section_id,s.position HAVING count(*)>1)
  THEN RAISE EXCEPTION 'LEGACY_SECTION_POSITION_CONFLICT' USING ERRCODE='23505'; END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER legacy_section_position_guard
AFTER INSERT OR UPDATE OR DELETE ON metadata.entity_surface_section
DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION metadata.guard_legacy_section_position();
