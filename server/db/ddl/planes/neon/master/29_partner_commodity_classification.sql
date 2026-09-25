-- Partner facts are independent of commercial roles, decisions and company scope.
CREATE TABLE master.business_partner_commodity_classification (
 id uuid PRIMARY KEY DEFAULT shared.uuidv7(),
 tenant_id uuid NOT NULL,
 business_partner_id uuid NOT NULL,
 commodity_category_id uuid NOT NULL,
 assignment_kind text NOT NULL DEFAULT 'declared' CHECK (assignment_kind IN ('declared','imported','verified')),
 effective_from date NOT NULL DEFAULT CURRENT_DATE,
 effective_until date,
 source_system text NOT NULL CHECK (length(btrim(source_system)) BETWEEN 1 AND 128),
 source_reference text NOT NULL CHECK (length(btrim(source_reference)) BETWEEN 1 AND 256),
 notes text CHECK (length(notes)<=4000),
 status master.partner_extension_status_d NOT NULL DEFAULT 'draft',
 verified_at timestamptz,
 verified_by uuid,
 record_version bigint NOT NULL DEFAULT 1 CHECK (record_version>0),
 created_at timestamptz NOT NULL DEFAULT now(),
 created_by uuid NOT NULL,
 updated_at timestamptz,
 updated_by uuid,
 UNIQUE(tenant_id,id),
 UNIQUE(tenant_id,business_partner_id,id),
 UNIQUE(tenant_id,business_partner_id,source_system,source_reference),
 FOREIGN KEY(tenant_id,business_partner_id) REFERENCES master.business_partner(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,commodity_category_id) REFERENCES master.commodity_category(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,created_by) REFERENCES master.principal(tenant_id,id),
 FOREIGN KEY(tenant_id,updated_by) REFERENCES master.principal(tenant_id,id),
 FOREIGN KEY(tenant_id,verified_by) REFERENCES master.principal(tenant_id,id),
 CHECK(effective_until IS NULL OR effective_until>effective_from),
 CHECK((updated_at IS NULL)=(updated_by IS NULL)),
 CHECK((verified_at IS NULL)=(verified_by IS NULL)),
 CHECK((assignment_kind='verified')=(verified_at IS NOT NULL)),
 CHECK(verified_by IS NULL OR verified_by<>created_by)
);
COMMENT ON TABLE master.business_partner_commodity_classification IS
 'Partner-owned commodity fact. Active or verified never means commercially qualified or approved. No role/company/organization prerequisite.';
CREATE INDEX business_partner_commodity_classification_owner_idx
 ON master.business_partner_commodity_classification(tenant_id,business_partner_id,status,effective_from);

-- A qualification may reference several classifications without owning their lifecycle.
CREATE UNIQUE INDEX business_partner_qualification_owner_id_uq
 ON control.business_partner_qualification(tenant_id,business_partner_id,id);

CREATE FUNCTION master.guard_partner_commodity_classification() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Archive classification facts instead of deleting their history' USING ERRCODE='23514'; END IF;
 IF (NEW.id,NEW.tenant_id,NEW.business_partner_id,NEW.commodity_category_id,NEW.source_system,NEW.source_reference,NEW.created_at,NEW.created_by)
 IS DISTINCT FROM (OLD.id,OLD.tenant_id,OLD.business_partner_id,OLD.commodity_category_id,OLD.source_system,OLD.source_reference,OLD.created_at,OLD.created_by)
 THEN RAISE EXCEPTION 'Classification identity and provenance are immutable' USING ERRCODE='23514'; END IF;
 IF NEW.record_version<>OLD.record_version+1 OR NEW.updated_by IS NULL OR NEW.updated_at IS NULL
 THEN RAISE EXCEPTION 'Classification updates require a version increment and actor evidence' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION master.guard_partner_commodity_classification() FROM PUBLIC;
CREATE TRIGGER partner_commodity_classification_guard BEFORE UPDATE OR DELETE
 ON master.business_partner_commodity_classification FOR EACH ROW EXECUTE FUNCTION master.guard_partner_commodity_classification();
CREATE TRIGGER trg_zz_audit_row_change AFTER INSERT OR UPDATE OR DELETE
 ON master.business_partner_commodity_classification FOR EACH ROW EXECUTE FUNCTION audit.trg_capture_row_change();

ALTER TABLE master.business_partner_commodity_classification ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.business_partner_commodity_classification FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_access ON master.business_partner_commodity_classification
 USING(tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id=shared.current_tenant_id());
REVOKE ALL ON master.business_partner_commodity_classification FROM PUBLIC;
GRANT SELECT ON master.business_partner_commodity_classification TO athyperapp;
-- Native commands only; no generic entity writer or delete authority.
GRANT INSERT ON master.business_partner_commodity_classification TO athyperapp;
GRANT UPDATE(status,assignment_kind,verified_at,verified_by,record_version,updated_at,updated_by)
 ON master.business_partner_commodity_classification TO athyperapp;

CREATE TABLE master.business_partner_classification_command (
 tenant_id uuid NOT NULL,
 principal_id uuid NOT NULL,
 idempotency_key text NOT NULL CHECK(length(idempotency_key) BETWEEN 8 AND 200),
 fingerprint text NOT NULL CHECK(fingerprint ~ '^[a-f0-9]{64}$'),
 result jsonb NOT NULL CHECK(jsonb_typeof(result)='object'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,principal_id,idempotency_key),
 FOREIGN KEY(tenant_id,principal_id) REFERENCES master.principal(tenant_id,id)
);
ALTER TABLE master.business_partner_classification_command ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.business_partner_classification_command FORCE ROW LEVEL SECURITY;
CREATE POLICY actor_access ON master.business_partner_classification_command
 USING(tenant_id=shared.current_tenant_id_soft() AND principal_id=master.current_principal_id_soft())
 WITH CHECK(tenant_id=shared.current_tenant_id() AND principal_id=master.current_principal_id_soft());
REVOKE ALL ON master.business_partner_classification_command FROM PUBLIC;
GRANT SELECT,INSERT ON master.business_partner_classification_command TO athyperapp;

INSERT INTO master.audit_event_contract(code,event_code_pattern,priority,allowed_operations,default_severity,
 allowed_actor_types,allowed_scope,reason_required,capture_mode,max_payload_bytes,schema_version,metadata,status)
VALUES('business_partner_classification','^business_partner[.]classification[.](declared|verified|archived)$',34,
 ARRAY['execute']::audit.operation_d[],'info',ARRAY['user']::audit.actor_type_d[],
 'tenant',false,'metadata',4096,1,'{"owner":"master-data","commercialApproval":false}'::jsonb,'active')
ON CONFLICT(code) DO NOTHING;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM master.audit_event_contract WHERE code='business_partner_classification'
  AND event_code_pattern='^business_partner[.]classification[.](declared|verified|archived)$'
  AND allowed_operations=ARRAY['execute']::audit.operation_d[] AND allowed_actor_types=ARRAY['user']::audit.actor_type_d[]
  AND allowed_scope='tenant' AND capture_mode='metadata' AND status='active')
 THEN RAISE EXCEPTION 'Classification audit contract drift'; END IF;
END $$;
