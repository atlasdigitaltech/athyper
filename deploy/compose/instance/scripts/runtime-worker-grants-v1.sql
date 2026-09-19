BEGIN;

DO $reconcile$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyper_jobs_service') THEN
        RAISE EXCEPTION 'required role is absent: athyper_jobs_service';
    END IF;
END
$reconcile$;

GRANT USAGE ON SCHEMA shared, event TO athyper_jobs_service;
GRANT EXECUTE ON FUNCTION shared.uuidv7(),
    shared.current_tenant_id(), shared.current_tenant_id_soft()
    TO athyper_jobs_service;

GRANT SELECT, UPDATE ON event.authorization_invalidation_outbox,
    event.descriptor_invalidation_outbox TO athyper_jobs_service;
GRANT SELECT, INSERT ON event.invalidation_dead_letter TO athyper_jobs_service;
GRANT EXECUTE ON FUNCTION
    event.fn_authorization_claim_invalidations(text, integer, integer),
    event.fn_authorization_complete_invalidation(uuid, text),
    event.fn_authorization_fail_invalidation(uuid, text, text, integer)
    TO athyper_jobs_service;

DROP POLICY IF EXISTS authorization_invalidation_jobs_service_access
    ON event.authorization_invalidation_outbox;
CREATE POLICY authorization_invalidation_jobs_service_access
    ON event.authorization_invalidation_outbox
    FOR ALL TO athyper_jobs_service USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS descriptor_invalidation_jobs_service_access
    ON event.descriptor_invalidation_outbox;
CREATE POLICY descriptor_invalidation_jobs_service_access
    ON event.descriptor_invalidation_outbox
    FOR ALL TO athyper_jobs_service USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS invalidation_dead_letter_jobs_service_access
    ON event.invalidation_dead_letter;
CREATE POLICY invalidation_dead_letter_jobs_service_access
    ON event.invalidation_dead_letter
    FOR SELECT TO athyper_jobs_service USING (true);
DROP POLICY IF EXISTS invalidation_dead_letter_jobs_service_insert
    ON event.invalidation_dead_letter;
CREATE POLICY invalidation_dead_letter_jobs_service_insert
    ON event.invalidation_dead_letter
    FOR INSERT TO athyper_jobs_service WITH CHECK (true);

COMMIT;
