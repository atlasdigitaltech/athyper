-- GENERATED. DO NOT EDIT.
-- wave2.neon-admin.catalog.v1
-- Resolution is exact by permission UUID; this file contains no suffix/token inference.
BEGIN;

CREATE TEMP TABLE wave2_compiled_catalog (
    operation_id uuid NOT NULL,
    permission_id uuid NOT NULL,
    entity_code text NOT NULL,
    operation_code text NOT NULL,
    canonical_permission_code text NOT NULL,
    operation_kind text NOT NULL,
    idempotency_mode text NOT NULL,
    risk_tier text NOT NULL,
    requires_mfa boolean NOT NULL,
    requires_sod boolean NOT NULL,
    is_shareable boolean NOT NULL,
    is_delegable boolean NOT NULL,
    definition_sha256 text NOT NULL,
    planes_csv text NOT NULL,
    PRIMARY KEY (operation_id),
    UNIQUE (permission_id),
    UNIQUE (canonical_permission_code),
    UNIQUE (entity_code, operation_code)
) ON COMMIT DROP;

INSERT INTO wave2_compiled_catalog VALUES
;


DO $wave2$
DECLARE
    v_ambiguous bigint;
    v_missing bigint;
BEGIN
    SELECT count(*) INTO v_ambiguous
    FROM (
        SELECT c.entity_code
        FROM wave2_compiled_catalog c
        JOIN control.entity e ON e.entity_code = c.entity_code
        GROUP BY c.entity_code
        HAVING count(DISTINCT e.id) <> 1
    ) anomaly;
    SELECT count(*) INTO v_missing
    FROM wave2_compiled_catalog c
    LEFT JOIN control.entity e ON e.entity_code = c.entity_code
    WHERE e.id IS NULL;
    IF v_ambiguous <> 0 OR v_missing <> 0 THEN
        RAISE EXCEPTION 'Wave 2 entity resolution failed: ambiguous=%, missing=%',
            v_ambiguous, v_missing;
    END IF;
END
$wave2$;

-- The apply phase is intentionally generated after the exact entity-resolution
-- preflight. Installation remains a separate, approval-gated deployment step.
-- catalog_owner_id=00000000-0000-7000-8000-000000000010

ROLLBACK;
