BEGIN;

ALTER TABLE master.address
    ADD COLUMN IF NOT EXISTS street_name text,
    ADD COLUMN IF NOT EXISTS house_number text,
    ADD COLUMN IF NOT EXISTS house_number_suffix text,
    ADD COLUMN IF NOT EXISTS building_name text,
    ADD COLUMN IF NOT EXISTS floor text,
    ADD COLUMN IF NOT EXISTS room text,
    ADD COLUMN IF NOT EXISTS entrance text,
    ADD COLUMN IF NOT EXISTS unit text,
    ADD COLUMN IF NOT EXISTS po_box text,
    ADD COLUMN IF NOT EXISTS po_box_postal_code text,
    ADD COLUMN IF NOT EXISTS po_box_city text,
    ADD COLUMN IF NOT EXISTS delivery_service_type text,
    ADD COLUMN IF NOT EXISTS delivery_service_number text,
    ADD COLUMN IF NOT EXISTS validation_status text NOT NULL DEFAULT 'unverified',
    ADD COLUMN IF NOT EXISTS validation_provider text,
    ADD COLUMN IF NOT EXISTS validation_confidence numeric(5,2),
    ADD COLUMN IF NOT EXISTS validated_at timestamptz,
    ADD COLUMN IF NOT EXISTS current_validation_event_id uuid;

ALTER TABLE master.address
    ALTER COLUMN address_kind SET DEFAULT 'street';
UPDATE master.address SET address_kind = 'street' WHERE address_kind IS NULL;
ALTER TABLE master.address ALTER COLUMN address_kind SET NOT NULL;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM master.address WHERE country_code IS NULL) THEN
        RAISE EXCEPTION 'Cannot enforce master.address.country_code NOT NULL while null addresses exist';
    END IF;
END;
$$;
ALTER TABLE master.address ALTER COLUMN country_code SET NOT NULL;
ALTER TABLE master.address ALTER COLUMN status SET DEFAULT 'draft';
UPDATE master.address SET status = 'retired' WHERE status::text = 'deprecated';
UPDATE master.address SET validation_status = 'unverified' WHERE validation_status IS NULL;

CREATE TABLE IF NOT EXISTS master.address_event (
    id uuid NOT NULL DEFAULT shared.uuidv7(),
    tenant_id uuid NOT NULL,
    event_type text NOT NULL,
    subject_address_id uuid NOT NULL,
    related_address_id uuid,
    correlation_id uuid,
    evidence_event_id uuid,
    provider text,
    provider_reference text,
    result_status text,
    confidence numeric(5,2),
    reason_code text,
    evidence_hash char(64),
    payload jsonb,
    effective_at timestamptz,
    occurred_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL,
    CONSTRAINT address_event_pkey PRIMARY KEY (id),
    CONSTRAINT address_event_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT address_event_type_chk CHECK (event_type IN (
        'VALIDATION_RECORDED', 'GEOCODE_RECORDED', 'STANDARDIZATION_PROPOSED',
        'CORRECTION_ACCEPTED', 'CORRECTION_REJECTED', 'POSTAL_OVERRIDE_ACCEPTED',
        'MANUALLY_VERIFIED', 'MOVED', 'CORRECTED', 'MERGED', 'RETIRED'
    )),
    CONSTRAINT address_event_confidence_chk CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 100),
    CONSTRAINT address_event_evidence_hash_chk CHECK (evidence_hash IS NULL OR evidence_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT address_event_payload_chk CHECK (payload IS NULL OR jsonb_typeof(payload) IN ('object', 'array')),
    CONSTRAINT address_event_direction_chk CHECK (
        (event_type IN ('VALIDATION_RECORDED', 'GEOCODE_RECORDED', 'STANDARDIZATION_PROPOSED', 'CORRECTION_ACCEPTED', 'CORRECTION_REJECTED', 'POSTAL_OVERRIDE_ACCEPTED', 'MANUALLY_VERIFIED', 'RETIRED') AND related_address_id IS NULL)
        OR (event_type IN ('MOVED', 'CORRECTED', 'MERGED') AND related_address_id IS NOT NULL AND subject_address_id IS DISTINCT FROM related_address_id)
    ),
    CONSTRAINT address_event_transition_effective_chk CHECK (event_type NOT IN ('MOVED', 'CORRECTED', 'MERGED') OR effective_at IS NOT NULL),
    CONSTRAINT address_event_validation_fields_chk CHECK (event_type NOT IN ('VALIDATION_RECORDED', 'GEOCODE_RECORDED') OR (provider IS NOT NULL AND result_status IS NOT NULL)),
    CONSTRAINT address_event_override_reason_chk CHECK (event_type <> 'POSTAL_OVERRIDE_ACCEPTED' OR reason_code IS NOT NULL)
);

UPDATE master.address a
   SET street_name = p.street_name,
       house_number = p.house_number,
       house_number_suffix = p.house_number_suffix,
       building_name = p.building_name,
       floor = p.floor,
       room = p.room,
       entrance = p.entrance,
       unit = p.unit
  FROM master.address_premise p
 WHERE p.tenant_id = a.tenant_id AND p.address_id = a.id;

UPDATE master.address a
   SET po_box = p.po_box,
       po_box_postal_code = p.po_box_postal_code,
       po_box_city = p.po_box_city,
       delivery_service_type = p.delivery_service_type,
       delivery_service_number = p.delivery_service_number
  FROM master.address_postal_delivery p
 WHERE p.tenant_id = a.tenant_id AND p.address_id = a.id;

INSERT INTO master.address_event (
    id, tenant_id, event_type, subject_address_id, provider, provider_reference,
    result_status, confidence, reason_code, evidence_hash, payload,
    effective_at, occurred_at, created_at, created_by
)
SELECT v.id, v.tenant_id, 'VALIDATION_RECORDED', v.address_id, v.provider,
       v.provider_reference, v.validation_status, v.confidence, v.reason_code,
       v.evidence_hash,
       jsonb_build_object('standardized_payload', v.standardized_payload, 'raw_payload', v.raw_payload),
       v.validated_at, v.validated_at, v.created_at, v.created_by
  FROM master.address_validation v
ON CONFLICT (id) DO NOTHING;

INSERT INTO master.address_event (
    tenant_id, event_type, subject_address_id, related_address_id,
    evidence_event_id, reason_code, payload, effective_at, occurred_at,
    created_at, created_by
)
SELECT t.tenant_id,
       CASE t.transition_kind WHEN 'moved' THEN 'MOVED' WHEN 'merged' THEN 'MERGED' ELSE 'CORRECTED' END,
       t.prior_address_id, t.successor_address_id, t.evidence_id,
       t.reason_code, t.metadata, t.effective_at, t.created_at,
       t.created_at, t.created_by
  FROM master.address_transition t;

WITH latest AS (
    SELECT DISTINCT ON (v.tenant_id, v.address_id)
           v.tenant_id, v.address_id, v.id,
           CASE v.validation_status
               WHEN 'passed' THEN 'valid'
               WHEN 'deferred' THEN 'pending'
               WHEN 'failed' THEN 'invalid'
               WHEN 'corrected' THEN 'valid_with_correction'
               WHEN 'overridden' THEN 'overridden'
               ELSE 'unverified'
           END AS validation_status,
           v.provider, v.confidence, v.validated_at
      FROM master.address_validation v
     ORDER BY v.tenant_id, v.address_id, v.validated_at DESC, v.created_at DESC
)
UPDATE master.address a
   SET validation_status = latest.validation_status,
       validation_provider = latest.provider,
       validation_confidence = latest.confidence,
       validated_at = latest.validated_at,
       current_validation_event_id = latest.id
  FROM latest
 WHERE latest.tenant_id = a.tenant_id AND latest.address_id = a.id;

ALTER TABLE master.address DROP CONSTRAINT IF EXISTS address_status_chk;
ALTER TABLE master.address ADD CONSTRAINT address_status_chk CHECK (status IN ('draft', 'active', 'retired', 'merged'));
ALTER TABLE master.address DROP CONSTRAINT IF EXISTS address_kind_chk;
ALTER TABLE master.address ADD CONSTRAINT address_kind_chk CHECK (address_kind IN ('street', 'po_box', 'rural', 'military', 'other'));
ALTER TABLE master.address DROP CONSTRAINT IF EXISTS address_po_box_chk;
ALTER TABLE master.address ADD CONSTRAINT address_po_box_chk CHECK (address_kind <> 'po_box' OR po_box IS NOT NULL);
ALTER TABLE master.address DROP CONSTRAINT IF EXISTS address_validation_status_chk;
ALTER TABLE master.address ADD CONSTRAINT address_validation_status_chk CHECK (validation_status IN ('unverified', 'pending', 'valid', 'valid_with_correction', 'invalid', 'overridden'));
ALTER TABLE master.address DROP CONSTRAINT IF EXISTS address_validation_confidence_chk;
ALTER TABLE master.address ADD CONSTRAINT address_validation_confidence_chk CHECK (validation_confidence IS NULL OR validation_confidence BETWEEN 0 AND 100);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'address_country_fk') THEN
        ALTER TABLE master.address ADD CONSTRAINT address_country_fk FOREIGN KEY (country_code) REFERENCES shared.country(code) ON DELETE RESTRICT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'address_current_validation_event_fk') THEN
        ALTER TABLE master.address ADD CONSTRAINT address_current_validation_event_fk FOREIGN KEY (tenant_id, current_validation_event_id) REFERENCES master.address_event(tenant_id, id) ON DELETE RESTRICT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'address_event_tenant_fk') THEN
        ALTER TABLE master.address_event ADD CONSTRAINT address_event_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'address_event_subject_address_fk') THEN
        ALTER TABLE master.address_event ADD CONSTRAINT address_event_subject_address_fk FOREIGN KEY (tenant_id, subject_address_id) REFERENCES master.address(tenant_id, id) ON DELETE RESTRICT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'address_event_related_address_fk') THEN
        ALTER TABLE master.address_event ADD CONSTRAINT address_event_related_address_fk FOREIGN KEY (tenant_id, related_address_id) REFERENCES master.address(tenant_id, id) ON DELETE RESTRICT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'address_event_evidence_event_fk') THEN
        ALTER TABLE master.address_event ADD CONSTRAINT address_event_evidence_event_fk FOREIGN KEY (tenant_id, evidence_event_id) REFERENCES master.address_event(tenant_id, id) ON DELETE RESTRICT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'address_event_created_by_fk') THEN
        ALTER TABLE master.address_event ADD CONSTRAINT address_event_created_by_fk FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT;
    END IF;
END;
$$;

DROP TABLE IF EXISTS master.address_transition;
DROP TABLE IF EXISTS master.address_validation;
DROP TABLE IF EXISTS master.address_postal_delivery;
DROP TABLE IF EXISTS master.address_premise;
DROP TABLE IF EXISTS master.address_representation;

DROP FUNCTION IF EXISTS master.trg_normalize_address_representation();
DROP FUNCTION IF EXISTS master.trg_normalize_address_premise();
DROP FUNCTION IF EXISTS master.trg_normalize_address_postal_delivery();
DROP FUNCTION IF EXISTS master.trg_normalize_address_validation();
DROP FUNCTION IF EXISTS master.trg_normalize_address_transition();

CREATE OR REPLACE FUNCTION master.trg_normalize_address()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, master AS $$
BEGIN
    NEW.address_type := nullif(btrim(NEW.address_type), '');
    NEW.address_kind := nullif(lower(btrim(NEW.address_kind)), '');
    NEW.street_name := nullif(btrim(NEW.street_name), '');
    NEW.house_number := nullif(btrim(NEW.house_number), '');
    NEW.house_number_suffix := nullif(btrim(NEW.house_number_suffix), '');
    NEW.building_name := nullif(btrim(NEW.building_name), '');
    NEW.floor := nullif(btrim(NEW.floor), '');
    NEW.room := nullif(btrim(NEW.room), '');
    NEW.entrance := nullif(btrim(NEW.entrance), '');
    NEW.unit := nullif(btrim(NEW.unit), '');
    NEW.line1 := nullif(btrim(NEW.line1), ''); NEW.line2 := nullif(btrim(NEW.line2), ''); NEW.line3 := nullif(btrim(NEW.line3), '');
    NEW.city := nullif(btrim(NEW.city), ''); NEW.dependent_locality := nullif(btrim(NEW.dependent_locality), ''); NEW.region := nullif(btrim(NEW.region), '');
    NEW.state_region_code := nullif(upper(btrim(NEW.state_region_code)), ''); NEW.postal_code := nullif(btrim(NEW.postal_code), '');
    NEW.po_box := nullif(btrim(NEW.po_box), ''); NEW.po_box_postal_code := nullif(btrim(NEW.po_box_postal_code), ''); NEW.po_box_city := nullif(btrim(NEW.po_box_city), '');
    NEW.delivery_service_type := nullif(btrim(NEW.delivery_service_type), ''); NEW.delivery_service_number := nullif(btrim(NEW.delivery_service_number), '');
    NEW.country_code := nullif(upper(NEW.country_code::text), '')::character(2); NEW.timezone_code := nullif(lower(btrim(NEW.timezone_code)), '');
    NEW.normalization_version := COALESCE(NEW.normalization_version, 'v1'); NEW.format_version := COALESCE(NEW.format_version, 'v1'); NEW.formatted_address := nullif(btrim(NEW.formatted_address), '');
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_guard_address_identity()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, master AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND OLD.status <> 'draft' AND (
        NEW.id IS DISTINCT FROM OLD.id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.address_type IS DISTINCT FROM OLD.address_type OR NEW.address_kind IS DISTINCT FROM OLD.address_kind
        OR NEW.street_name IS DISTINCT FROM OLD.street_name OR NEW.house_number IS DISTINCT FROM OLD.house_number OR NEW.house_number_suffix IS DISTINCT FROM OLD.house_number_suffix
        OR NEW.building_name IS DISTINCT FROM OLD.building_name OR NEW.floor IS DISTINCT FROM OLD.floor OR NEW.room IS DISTINCT FROM OLD.room OR NEW.entrance IS DISTINCT FROM OLD.entrance OR NEW.unit IS DISTINCT FROM OLD.unit
        OR NEW.line1 IS DISTINCT FROM OLD.line1 OR NEW.line2 IS DISTINCT FROM OLD.line2 OR NEW.line3 IS DISTINCT FROM OLD.line3 OR NEW.dependent_locality IS DISTINCT FROM OLD.dependent_locality
        OR NEW.city IS DISTINCT FROM OLD.city OR NEW.state_region_code IS DISTINCT FROM OLD.state_region_code OR NEW.region IS DISTINCT FROM OLD.region
        OR NEW.postal_code IS DISTINCT FROM OLD.postal_code OR NEW.po_box IS DISTINCT FROM OLD.po_box OR NEW.po_box_postal_code IS DISTINCT FROM OLD.po_box_postal_code OR NEW.po_box_city IS DISTINCT FROM OLD.po_box_city
        OR NEW.delivery_service_type IS DISTINCT FROM OLD.delivery_service_type OR NEW.delivery_service_number IS DISTINCT FROM OLD.delivery_service_number OR NEW.country_code IS DISTINCT FROM OLD.country_code
        OR NEW.timezone_code IS DISTINCT FROM OLD.timezone_code OR NEW.normalized_hash IS DISTINCT FROM OLD.normalized_hash OR NEW.normalization_version IS DISTINCT FROM OLD.normalization_version
        OR NEW.formatted_address IS DISTINCT FROM OLD.formatted_address OR NEW.format_version IS DISTINCT FROM OLD.format_version OR NEW.latitude IS DISTINCT FROM OLD.latitude OR NEW.longitude IS DISTINCT FROM OLD.longitude
        OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.created_by IS DISTINCT FROM OLD.created_by
    ) THEN
        RAISE EXCEPTION 'Published master.address identity and semantic fields are immutable' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_guard_address_event_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, master AS $$
BEGIN
    RAISE EXCEPTION 'master.address_event is append-only; create a new event instead' USING ERRCODE = 'object_not_in_prerequisite_state';
END;
$$;

DROP TRIGGER IF EXISTS trg_address_05_normalize ON master.address;
CREATE TRIGGER trg_address_05_normalize BEFORE INSERT OR UPDATE OF address_type,address_kind,street_name,house_number,house_number_suffix,building_name,floor,room,entrance,unit,line1,line2,line3,city,dependent_locality,region,state_region_code,postal_code,po_box,po_box_postal_code,po_box_city,delivery_service_type,delivery_service_number,country_code,timezone_code,normalization_version,format_version,formatted_address ON master.address FOR EACH ROW EXECUTE FUNCTION master.trg_normalize_address();
DROP TRIGGER IF EXISTS trg_address_10_postal_validation ON master.address;
CREATE TRIGGER trg_address_10_postal_validation BEFORE INSERT OR UPDATE OF country_code,postal_code ON master.address FOR EACH ROW EXECUTE FUNCTION master.trg_validate_address_postal_code();
DROP TRIGGER IF EXISTS trg_address_20_identity_immutable ON master.address;
CREATE TRIGGER trg_address_20_identity_immutable BEFORE UPDATE ON master.address FOR EACH ROW EXECUTE FUNCTION master.trg_guard_address_identity();
DROP TRIGGER IF EXISTS trg_address_event_immutable ON master.address_event;
CREATE TRIGGER trg_address_event_immutable BEFORE UPDATE OR DELETE ON master.address_event FOR EACH ROW EXECUTE FUNCTION master.trg_guard_address_event_immutable();

CREATE INDEX IF NOT EXISTS address_event_subject_idx ON master.address_event (tenant_id, subject_address_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS address_event_related_idx ON master.address_event (tenant_id, related_address_id, occurred_at DESC) WHERE related_address_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS address_event_type_idx ON master.address_event (tenant_id, event_type, occurred_at DESC);
CREATE INDEX IF NOT EXISTS address_event_correlation_idx ON master.address_event (tenant_id, correlation_id, occurred_at DESC) WHERE correlation_id IS NOT NULL;

ALTER TABLE master.address_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.address_event FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_access ON master.address_event;
CREATE POLICY tenant_access ON master.address_event FOR ALL USING (tenant_id = shared.current_tenant_id_soft()) WITH CHECK (tenant_id = shared.current_tenant_id());
DROP POLICY IF EXISTS seed_write ON master.address_event;
CREATE POLICY seed_write ON master.address_event FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

SELECT audit.install_schema_row_triggers('master');
COMMIT;
