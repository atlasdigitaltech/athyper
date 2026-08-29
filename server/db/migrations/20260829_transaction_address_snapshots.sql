BEGIN;

ALTER TABLE document.commitment_line
    ADD COLUMN IF NOT EXISTS address_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS address_snapshot_hash char(64),
    ADD COLUMN IF NOT EXISTS address_snapshot_captured_at timestamptz,
    ADD COLUMN IF NOT EXISTS address_snapshot_captured_by uuid;

ALTER TABLE document.purchase_invoice_line
    ADD COLUMN IF NOT EXISTS address_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS address_snapshot_hash char(64),
    ADD COLUMN IF NOT EXISTS address_snapshot_captured_at timestamptz,
    ADD COLUMN IF NOT EXISTS address_snapshot_captured_by uuid;

CREATE OR REPLACE FUNCTION document.fn_address_snapshot(uuid, uuid)
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = pg_catalog, document, master
AS $$
    SELECT CASE WHEN a.id IS NULL THEN NULL::jsonb ELSE jsonb_strip_nulls(jsonb_build_object(
        'address_id', a.id, 'address_kind', a.address_kind, 'line1', a.line1,
        'line2', a.line2, 'line3', a.line3, 'dependent_locality', a.dependent_locality,
        'city', a.city, 'state_region_code', a.state_region_code, 'region', a.region,
        'postal_code', a.postal_code, 'country_code', a.country_code,
        'timezone_code', a.timezone_code, 'formatted_address', a.formatted_address,
        'normalized_hash', a.normalized_hash, 'normalization_version', a.normalization_version
    )) END
      FROM master.address a WHERE a.tenant_id = $1 AND a.id = $2;
$$;

CREATE OR REPLACE FUNCTION document.fn_build_address_snapshot(uuid, uuid, uuid, uuid, uuid, uuid)
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = pg_catalog, document, master
AS $$
    SELECT jsonb_build_object(
        'ship_to', COALESCE(document.fn_address_snapshot($1, $2), '{}'::jsonb),
        'bill_to', COALESCE(document.fn_address_snapshot($1, $3), '{}'::jsonb),
        'bill_from', COALESCE(document.fn_address_snapshot($1, $4), '{}'::jsonb),
        'ship_from', COALESCE(document.fn_address_snapshot($1, $5), '{}'::jsonb),
        'remit_to', COALESCE(document.fn_address_snapshot($1, $6), '{}'::jsonb)
    );
$$;

UPDATE document.commitment_line cl
   SET address_snapshot = document.fn_build_address_snapshot(cl.tenant_id, cl.ship_to_address_id, cl.bill_to_address_id, cl.bill_from_address_id, cl.ship_from_address_id, cl.remit_to_address_id),
       address_snapshot_captured_at = COALESCE(cl.created_at, now()), address_snapshot_captured_by = cl.created_by;
UPDATE document.commitment_line cl SET address_snapshot_hash = encode(digest(cl.address_snapshot::text, 'sha256'), 'hex')::char(64);
UPDATE document.purchase_invoice_line il
   SET address_snapshot = document.fn_build_address_snapshot(il.tenant_id, il.ship_to_address_id, il.bill_to_address_id, il.bill_from_address_id, il.ship_from_address_id, il.remit_to_address_id),
       address_snapshot_captured_at = COALESCE(il.created_at, now()), address_snapshot_captured_by = il.created_by;
UPDATE document.purchase_invoice_line il SET address_snapshot_hash = encode(digest(il.address_snapshot::text, 'sha256'), 'hex')::char(64);

CREATE OR REPLACE FUNCTION document.trg_capture_line_address_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document, master
AS $$
DECLARE v_snapshot jsonb; v_actor uuid;
BEGIN
    IF TG_OP = 'UPDATE'
       AND NEW.ship_to_address_id IS NOT DISTINCT FROM OLD.ship_to_address_id
       AND NEW.bill_to_address_id IS NOT DISTINCT FROM OLD.bill_to_address_id
       AND NEW.bill_from_address_id IS NOT DISTINCT FROM OLD.bill_from_address_id
       AND NEW.ship_from_address_id IS NOT DISTINCT FROM OLD.ship_from_address_id
       AND NEW.remit_to_address_id IS NOT DISTINCT FROM OLD.remit_to_address_id
       AND (NEW.address_snapshot IS DISTINCT FROM OLD.address_snapshot OR NEW.address_snapshot_hash IS DISTINCT FROM OLD.address_snapshot_hash OR NEW.address_snapshot_captured_at IS DISTINCT FROM OLD.address_snapshot_captured_at OR NEW.address_snapshot_captured_by IS DISTINCT FROM OLD.address_snapshot_captured_by)
    THEN RAISE EXCEPTION 'Transaction address snapshot is immutable; change the source address reference in a draft document' USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    IF TG_OP = 'INSERT'
       OR NEW.ship_to_address_id IS DISTINCT FROM OLD.ship_to_address_id
       OR NEW.bill_to_address_id IS DISTINCT FROM OLD.bill_to_address_id
       OR NEW.bill_from_address_id IS DISTINCT FROM OLD.bill_from_address_id
       OR NEW.ship_from_address_id IS DISTINCT FROM OLD.ship_from_address_id
       OR NEW.remit_to_address_id IS DISTINCT FROM OLD.remit_to_address_id
    THEN
        v_snapshot := document.fn_build_address_snapshot(NEW.tenant_id, NEW.ship_to_address_id, NEW.bill_to_address_id, NEW.bill_from_address_id, NEW.ship_from_address_id, NEW.remit_to_address_id);
        v_actor := COALESCE(NULLIF(current_setting('app.current_principal_id', true), '')::uuid, NEW.created_by);
        NEW.address_snapshot := v_snapshot; NEW.address_snapshot_hash := encode(digest(v_snapshot::text, 'sha256'), 'hex')::char(64);
        NEW.address_snapshot_captured_at := clock_timestamp(); NEW.address_snapshot_captured_by := v_actor;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS commitment_line_address_snapshot ON document.commitment_line;
CREATE TRIGGER commitment_line_address_snapshot
BEFORE INSERT OR UPDATE OF ship_to_address_id, bill_to_address_id, bill_from_address_id, ship_from_address_id, remit_to_address_id, address_snapshot, address_snapshot_hash, address_snapshot_captured_at, address_snapshot_captured_by
ON document.commitment_line FOR EACH ROW EXECUTE FUNCTION document.trg_capture_line_address_snapshot();
DROP TRIGGER IF EXISTS purchase_invoice_line_address_snapshot ON document.purchase_invoice_line;
CREATE TRIGGER purchase_invoice_line_address_snapshot
BEFORE INSERT OR UPDATE OF ship_to_address_id, bill_to_address_id, bill_from_address_id, ship_from_address_id, remit_to_address_id, address_snapshot, address_snapshot_hash, address_snapshot_captured_at, address_snapshot_captured_by
ON document.purchase_invoice_line FOR EACH ROW EXECUTE FUNCTION document.trg_capture_line_address_snapshot();

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'commitment_line_address_snapshot_json_chk') THEN ALTER TABLE document.commitment_line ADD CONSTRAINT commitment_line_address_snapshot_json_chk CHECK (jsonb_typeof(address_snapshot) = 'object'); END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'commitment_line_address_snapshot_hash_chk') THEN ALTER TABLE document.commitment_line ADD CONSTRAINT commitment_line_address_snapshot_hash_chk CHECK (address_snapshot_hash IS NULL OR address_snapshot_hash ~ '^[a-f0-9]{64}$'); END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'commitment_line_address_snapshot_capture_pair_chk') THEN ALTER TABLE document.commitment_line ADD CONSTRAINT commitment_line_address_snapshot_capture_pair_chk CHECK ((address_snapshot_captured_at IS NULL) = (address_snapshot_captured_by IS NULL)); END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_invoice_line_address_snapshot_json_chk') THEN ALTER TABLE document.purchase_invoice_line ADD CONSTRAINT purchase_invoice_line_address_snapshot_json_chk CHECK (jsonb_typeof(address_snapshot) = 'object'); END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_invoice_line_address_snapshot_hash_chk') THEN ALTER TABLE document.purchase_invoice_line ADD CONSTRAINT purchase_invoice_line_address_snapshot_hash_chk CHECK (address_snapshot_hash IS NULL OR address_snapshot_hash ~ '^[a-f0-9]{64}$'); END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_invoice_line_address_snapshot_capture_pair_chk') THEN ALTER TABLE document.purchase_invoice_line ADD CONSTRAINT purchase_invoice_line_address_snapshot_capture_pair_chk CHECK ((address_snapshot_captured_at IS NULL) = (address_snapshot_captured_by IS NULL)); END IF;
END;
$$;

CREATE OR REPLACE VIEW document.v_purchase_order_header
WITH (security_invoker = true, security_barrier = true) AS
SELECT c.*, COALESCE((SELECT jsonb_agg(jsonb_build_object('line_id', cl.id, 'line_no', cl.line_no, 'address_snapshot', cl.address_snapshot, 'address_snapshot_hash', cl.address_snapshot_hash, 'captured_at', cl.address_snapshot_captured_at) ORDER BY cl.line_no) FROM document.commitment_line cl WHERE cl.tenant_id = c.tenant_id AND cl.commitment_id = c.id), '[]'::jsonb) AS line_address_snapshots
FROM document.commitment c WHERE c.commitment_type = 'purchase_order';

CREATE OR REPLACE VIEW document.v_purchase_invoice_header
WITH (security_invoker = true, security_barrier = true) AS
SELECT i.*, COALESCE((SELECT jsonb_agg(jsonb_build_object('line_id', il.id, 'line_no', il.line_no, 'address_snapshot', il.address_snapshot, 'address_snapshot_hash', il.address_snapshot_hash, 'captured_at', il.address_snapshot_captured_at) ORDER BY il.line_no) FROM document.purchase_invoice_line il WHERE il.tenant_id = i.tenant_id AND il.purchase_invoice_id = i.id), '[]'::jsonb) AS line_address_snapshots
FROM document.purchase_invoice i;

COMMIT;
