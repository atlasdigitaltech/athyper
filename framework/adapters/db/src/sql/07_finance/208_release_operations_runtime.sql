/* ============================================================================
   Athyper v2.7 — Release Operations Runtime
   Schema: fin
   Dependencies: 207_governed_release_orchestration.sql,
                 206_publication_certification_integrity.sql,
                 205_governance_consistency.sql, 204_governance_lifecycle.sql,
                 197_pack_governance.sql, 196_management_pack.sql,
                 notify.notification (110_notify.sql),
                 evt.event (150_event_store.sql)

   Shifts from governance structure to runtime operations. After this
   migration, the release pipeline has:
     - Clean command functions that compose policy + transitions + activity
     - Immutable decision evidence for audit replay
     - Structured notification handoff for operational alerting
     - SLA / aging analytics for control tower dashboards

   Sections:
     A. Release Command Functions
        - fin.assemble_pack_release(): create and link components
        - fin.mark_release_ready(): evaluate governance, set READY
        - fin.release_pack(): final release with all gates enforced
        - fin.cancel_pack_release(): governed cancellation
        - fin.supersede_pack_release(): replace with correction release
     B. Release Decision Log
        - fin.release_decision_log: immutable decision evidence
        - Automatic logging from command functions
     C. Release Notification Events
        - fin.release_notification_event: handoff to notify infrastructure
        - Automatic emission on governance-critical transitions
     D. Release SLA Metrics & Aging Analytics
        - fin.release_sla_snapshot: materialized timing breakdown
        - fin.capture_release_sla(): captures stage durations
        - Cross-release trending view
     E. Tactical Guards
        - Release gate enforcement on READY→RELEASED
        - Exception signoff timing guard
        - Retroactive signoff prevention
   ============================================================================ */


-- ############################################################################
-- A. RELEASE COMMAND FUNCTIONS
-- ############################################################################

-- ============================================================================
-- A1. fin.assemble_pack_release — Create and link components
-- ============================================================================
-- The entry point for the release pipeline. Creates a pack_release and
-- links it to its component objects. Returns the release ID.
--
-- This is the "begin release" command. After calling this, the release
-- is in ASSEMBLING state and components can be attached or swapped.
-- ============================================================================
DROP FUNCTION IF EXISTS fin.assemble_pack_release(uuid, varchar, varchar, varchar, varchar, smallint, smallint, smallint, varchar, uuid, uuid, uuid, uuid, uuid) CASCADE;
CREATE OR REPLACE FUNCTION fin.assemble_pack_release(
    p_tenant_id         uuid,
    p_entity_code       varchar(20),
    p_release_code      varchar(50),
    p_release_name      varchar(200),
    p_release_type      varchar(20) DEFAULT 'MANAGEMENT_PACK',
    p_fiscal_year       smallint DEFAULT NULL,
    p_period_from       smallint DEFAULT NULL,
    p_period_to         smallint DEFAULT NULL,
    p_book_code         varchar(20) DEFAULT 'STAT',
    p_pack_instance_id  uuid DEFAULT NULL,
    p_pub_batch_id      uuid DEFAULT NULL,
    p_certification_id  uuid DEFAULT NULL,
    p_close_run_id      uuid DEFAULT NULL,
    p_created_by        uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
    v_release_id    uuid;
    v_pack          fin.report_pack_instance;
BEGIN
    -- If pack instance provided, derive scope from it
    IF p_pack_instance_id IS NOT NULL AND p_fiscal_year IS NULL THEN
        SELECT * INTO v_pack FROM fin.report_pack_instance WHERE id = p_pack_instance_id;
        IF v_pack IS NOT NULL THEN
            p_fiscal_year := v_pack.fiscal_year;
            p_period_from := v_pack.period_from;
            p_period_to   := v_pack.period_to;
            p_book_code   := v_pack.book_code;
        END IF;
    END IF;

    INSERT INTO fin.pack_release (
        tenant_id, entity_code, release_code, release_name,
        release_type, fiscal_year, period_from, period_to, book_code,
        pack_instance_id, publication_batch_id, certification_id, close_run_id,
        status, assembled_at, created_by
    ) VALUES (
        p_tenant_id, p_entity_code, p_release_code, p_release_name,
        p_release_type, p_fiscal_year, coalesce(p_period_from, 1),
        coalesce(p_period_to, p_period_from, 12), p_book_code,
        p_pack_instance_id, p_pub_batch_id, p_certification_id, p_close_run_id,
        'ASSEMBLING', now(), p_created_by
    ) RETURNING id INTO v_release_id;

    -- Emit creation activity
    INSERT INTO fin.pack_release_activity (
        tenant_id, entity_code, release_id,
        event_type, actor_id, actor_type, payload
    ) VALUES (
        p_tenant_id, p_entity_code, v_release_id,
        'RELEASE_CREATED', p_created_by, 'USER',
        jsonb_build_object(
            'release_code', p_release_code,
            'release_type', p_release_type,
            'pack_instance_id', p_pack_instance_id,
            'publication_batch_id', p_pub_batch_id,
            'certification_id', p_certification_id,
            'close_run_id', p_close_run_id
        )
    );

    RETURN v_release_id;
END;
$$;

COMMENT ON FUNCTION fin.assemble_pack_release(uuid, varchar, varchar, varchar, varchar, smallint, smallint, smallint, varchar, uuid, uuid, uuid, uuid, uuid) IS
    'Creates a pack release in ASSEMBLING state with linked components. Entry point for the governed release pipeline.';

-- ============================================================================
-- A2. fin.mark_release_ready — Evaluate governance and set READY
-- ============================================================================
-- Evaluates clean close designation, captures governance posture, and
-- transitions the release to READY if all components are in place.
-- If not clean, sets requires_exception_signoff = true.
-- ============================================================================
DROP FUNCTION IF EXISTS fin.mark_release_ready(uuid, uuid) CASCADE;
CREATE OR REPLACE FUNCTION fin.mark_release_ready(
    p_release_id    uuid,
    p_actor_id      uuid
) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
    v_release       fin.pack_release;
    v_batch         fin.publication_batch;
    v_cert          fin.pack_certification;
    v_clean         jsonb;
    v_readiness_id  uuid;
    v_readiness     decimal(5,2);
    v_blockers      text[] := '{}';
BEGIN
    SELECT * INTO v_release FROM fin.pack_release WHERE id = p_release_id;
    IF v_release IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Release not found');
    END IF;

    IF v_release.status != 'ASSEMBLING' THEN
        RETURN jsonb_build_object('success', false, 'error',
            format('Release must be ASSEMBLING to mark ready (current: %s)', v_release.status));
    END IF;

    -- Validate components are linked
    IF v_release.pack_instance_id IS NULL THEN
        v_blockers := array_append(v_blockers, 'No pack instance linked');
    END IF;
    IF v_release.publication_batch_id IS NULL THEN
        v_blockers := array_append(v_blockers, 'No publication batch linked');
    END IF;
    IF v_release.certification_id IS NULL THEN
        v_blockers := array_append(v_blockers, 'No certification linked');
    END IF;

    -- Validate publication batch is at least FINALIZED
    IF v_release.publication_batch_id IS NOT NULL THEN
        SELECT * INTO v_batch FROM fin.publication_batch WHERE id = v_release.publication_batch_id;
        IF v_batch.status NOT IN ('FINALIZED', 'PUBLISHED') THEN
            v_blockers := array_append(v_blockers,
                format('Publication batch must be FINALIZED or PUBLISHED (current: %s)', v_batch.status));
        END IF;
    END IF;

    IF array_length(v_blockers, 1) IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Release cannot be marked ready',
            'blockers', to_jsonb(v_blockers)
        );
    END IF;

    -- Evaluate clean close
    v_clean := fin.evaluate_clean_close(
        v_release.tenant_id, v_release.entity_code,
        v_release.fiscal_year, v_release.period_to
    );

    -- Capture readiness snapshot reference
    IF v_release.close_run_id IS NOT NULL THEN
        SELECT s.id, s.readiness_score INTO v_readiness_id, v_readiness
        FROM fin.close_readiness_snapshot s
        WHERE s.run_id = v_release.close_run_id
        ORDER BY s.captured_at DESC
        LIMIT 1;
    END IF;

    -- Transition to READY with governance posture
    UPDATE fin.pack_release
    SET status = 'READY',
        is_clean_close = (v_clean->>'is_clean')::boolean,
        override_count = (v_clean->>'override_count')::integer,
        override_impact_total = (v_clean->>'override_impact')::decimal(18,4),
        readiness_score = coalesce(v_readiness, 0),
        readiness_snapshot_id = v_readiness_id,
        requires_exception_signoff = coalesce(NOT (v_clean->>'is_clean')::boolean, true),
        updated_at = now()
    WHERE id = p_release_id;

    -- Log the clean close evaluation
    INSERT INTO fin.pack_release_activity (
        tenant_id, entity_code, release_id,
        event_type, actor_id, actor_type, payload
    ) VALUES (
        v_release.tenant_id, v_release.entity_code, p_release_id,
        'CLEAN_CLOSE_EVALUATED', p_actor_id, 'USER', v_clean
    );

    RETURN jsonb_build_object(
        'success', true,
        'release_id', p_release_id,
        'is_clean_close', (v_clean->>'is_clean')::boolean,
        'requires_exception_signoff', coalesce(NOT (v_clean->>'is_clean')::boolean, true),
        'clean_close_evaluation', v_clean
    );
END;
$$;

COMMENT ON FUNCTION fin.mark_release_ready(uuid, uuid) IS
    'Evaluates governance posture (clean close, readiness, overrides), captures context, and transitions release to READY.';

-- ============================================================================
-- A3. fin.release_pack — Final release with all gates enforced
-- ============================================================================
-- The "go live" command. Validates all preconditions, captures final
-- integrity check, and transitions to RELEASED.
--
-- Preconditions enforced:
--   1. Release is READY
--   2. Publication batch is PUBLISHED
--   3. Certification is APPROVED or CERTIFIED
--   4. Exception signoff exists if required
--   5. Integrity verification passes
-- ============================================================================
DROP FUNCTION IF EXISTS fin.release_pack(uuid, uuid, uuid) CASCADE;
CREATE OR REPLACE FUNCTION fin.release_pack(
    p_release_id    uuid,
    p_released_by   uuid,
    p_correlation_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
    v_release       fin.pack_release;
    v_batch         fin.publication_batch;
    v_cert          fin.pack_certification;
    v_integrity     jsonb;
    v_blockers      text[] := '{}';
    v_period_status varchar(20);
    v_decision_id   uuid;
BEGIN
    SELECT * INTO v_release FROM fin.pack_release WHERE id = p_release_id;
    IF v_release IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Release not found');
    END IF;

    -- Gate 1: Must be READY
    IF v_release.status != 'READY' THEN
        v_blockers := array_append(v_blockers,
            format('Release must be READY (current: %s)', v_release.status));
    END IF;

    -- Gate 2: Publication batch must be PUBLISHED
    IF v_release.publication_batch_id IS NOT NULL THEN
        SELECT * INTO v_batch FROM fin.publication_batch WHERE id = v_release.publication_batch_id;
        IF v_batch.status != 'PUBLISHED' THEN
            v_blockers := array_append(v_blockers,
                format('Publication batch must be PUBLISHED (current: %s)', v_batch.status));
        END IF;
    ELSE
        v_blockers := array_append(v_blockers, 'No publication batch linked');
    END IF;

    -- Gate 3: Certification must be APPROVED or CERTIFIED
    IF v_release.certification_id IS NOT NULL THEN
        SELECT * INTO v_cert FROM fin.pack_certification WHERE id = v_release.certification_id;
        IF v_cert.certification_status NOT IN ('APPROVED', 'CERTIFIED') THEN
            v_blockers := array_append(v_blockers,
                format('Certification must be APPROVED or CERTIFIED (current: %s)', v_cert.certification_status));
        END IF;
    ELSE
        v_blockers := array_append(v_blockers, 'No certification linked');
    END IF;

    -- Gate 4: Exception signoff if required
    IF v_release.requires_exception_signoff AND v_release.exception_signoff_by IS NULL THEN
        v_blockers := array_append(v_blockers,
            'Exception signoff is required but not provided (non-clean close)');
    END IF;

    -- Gate 5: Integrity verification
    v_integrity := fin.verify_release_integrity(p_release_id);
    IF NOT (v_integrity->>'valid')::boolean THEN
        v_blockers := array_append(v_blockers, 'Integrity verification failed');
    END IF;

    -- Get period status
    SELECT fp.status INTO v_period_status
    FROM fin.fiscal_period fp
    WHERE fp.tenant_id = v_release.tenant_id
      AND fp.entity_code = v_release.entity_code
      AND fp.fiscal_year = v_release.fiscal_year
      AND fp.period_number = v_release.period_to;

    -- Log the decision (pass or fail)
    INSERT INTO fin.release_decision_log (
        tenant_id, entity_code, release_id,
        command, actor_id,
        policy_evaluation, result, correlation_id,
        publication_batch_id, certification_id
    ) VALUES (
        v_release.tenant_id, v_release.entity_code, p_release_id,
        'RELEASE', p_released_by,
        jsonb_build_object(
            'blockers', to_jsonb(v_blockers),
            'integrity', v_integrity,
            'is_clean_close', v_release.is_clean_close,
            'override_count', v_release.override_count,
            'requires_exception_signoff', v_release.requires_exception_signoff,
            'exception_signoff_provided', v_release.exception_signoff_by IS NOT NULL
        ),
        CASE WHEN array_length(v_blockers, 1) IS NULL THEN 'APPROVED' ELSE 'BLOCKED' END,
        p_correlation_id,
        v_release.publication_batch_id, v_release.certification_id
    ) RETURNING id INTO v_decision_id;

    -- Reject if blockers
    IF array_length(v_blockers, 1) IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Release blocked by policy gates',
            'blockers', to_jsonb(v_blockers),
            'integrity', v_integrity,
            'decision_id', v_decision_id
        );
    END IF;

    -- All gates passed — execute release
    UPDATE fin.pack_release
    SET status = 'RELEASED',
        released_by = p_released_by,
        period_status_at_release = v_period_status,
        updated_at = now()
    WHERE id = p_release_id;

    -- Log integrity verification result
    INSERT INTO fin.pack_release_activity (
        tenant_id, entity_code, release_id,
        event_type, actor_id, actor_type, payload
    ) VALUES (
        v_release.tenant_id, v_release.entity_code, p_release_id,
        'INTEGRITY_VERIFIED', p_released_by, 'SYSTEM', v_integrity
    );

    -- Emit notification event
    INSERT INTO fin.release_notification_event (
        tenant_id, entity_code, release_id,
        event_code, severity, summary, detail_payload
    ) VALUES (
        v_release.tenant_id, v_release.entity_code, p_release_id,
        'RELEASE_COMPLETED',
        CASE WHEN v_release.is_clean_close THEN 'INFO' ELSE 'WARNING' END,
        format('Pack release %s completed (%s)',
            v_release.release_code,
            CASE WHEN v_release.is_clean_close THEN 'clean close' ELSE 'with exceptions' END),
        jsonb_build_object(
            'release_code', v_release.release_code,
            'is_clean_close', v_release.is_clean_close,
            'override_count', v_release.override_count,
            'released_by', p_released_by
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'release_id', p_release_id,
        'decision_id', v_decision_id,
        'integrity', v_integrity,
        'period_status_at_release', v_period_status
    );
END;
$$;

COMMENT ON FUNCTION fin.release_pack(uuid, uuid, uuid) IS
    'Executes a governed pack release. Enforces all gates (batch published, certification valid, exception signoff, integrity), logs decision, emits notification.';

-- ============================================================================
-- A4. fin.cancel_pack_release — Governed cancellation
-- ============================================================================
DROP FUNCTION IF EXISTS fin.cancel_pack_release(uuid, uuid, text) CASCADE;
CREATE OR REPLACE FUNCTION fin.cancel_pack_release(
    p_release_id    uuid,
    p_cancelled_by  uuid,
    p_reason        text
) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
    v_release   fin.pack_release;
BEGIN
    SELECT * INTO v_release FROM fin.pack_release WHERE id = p_release_id;
    IF v_release IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Release not found');
    END IF;

    IF v_release.status NOT IN ('ASSEMBLING', 'READY') THEN
        RETURN jsonb_build_object('success', false, 'error',
            format('Can only cancel ASSEMBLING or READY releases (current: %s)', v_release.status));
    END IF;

    UPDATE fin.pack_release
    SET status = 'CANCELLED',
        supersession_reason = p_reason,
        updated_at = now()
    WHERE id = p_release_id;

    -- Log decision
    INSERT INTO fin.release_decision_log (
        tenant_id, entity_code, release_id,
        command, actor_id,
        policy_evaluation, result
    ) VALUES (
        v_release.tenant_id, v_release.entity_code, p_release_id,
        'CANCEL', p_cancelled_by,
        jsonb_build_object('reason', p_reason, 'prior_status', v_release.status),
        'APPROVED'
    );

    RETURN jsonb_build_object('success', true, 'release_id', p_release_id);
END;
$$;

COMMENT ON FUNCTION fin.cancel_pack_release(uuid, uuid, text) IS
    'Cancels an ASSEMBLING or READY pack release with reason logging.';

-- ============================================================================
-- A5. fin.supersede_pack_release — Replace with correction release
-- ============================================================================
DROP FUNCTION IF EXISTS fin.supersede_pack_release(uuid, uuid, text, uuid) CASCADE;
CREATE OR REPLACE FUNCTION fin.supersede_pack_release(
    p_old_release_id    uuid,
    p_new_release_id    uuid,
    p_reason            text,
    p_superseded_by     uuid
) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
    v_old   fin.pack_release;
    v_new   fin.pack_release;
BEGIN
    SELECT * INTO v_old FROM fin.pack_release WHERE id = p_old_release_id;
    SELECT * INTO v_new FROM fin.pack_release WHERE id = p_new_release_id;

    IF v_old IS NULL OR v_new IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Both releases must exist');
    END IF;

    IF v_old.status != 'RELEASED' THEN
        RETURN jsonb_build_object('success', false, 'error',
            format('Can only supersede RELEASED releases (current: %s)', v_old.status));
    END IF;

    -- Supersede old release
    UPDATE fin.pack_release
    SET status = 'SUPERSEDED',
        supersession_reason = p_reason,
        updated_at = now()
    WHERE id = p_old_release_id;

    -- Link new to old
    UPDATE fin.pack_release
    SET supersedes_id = p_old_release_id,
        updated_at = now()
    WHERE id = p_new_release_id;

    -- Supersede the publication batch if both releases reference one
    IF v_old.publication_batch_id IS NOT NULL AND v_new.publication_batch_id IS NOT NULL THEN
        PERFORM fin.supersede_publication_batch(
            v_old.publication_batch_id,
            v_new.publication_batch_id,
            p_reason,
            true,   -- invalidate cert
            true,   -- require redistribution
            false   -- no auto-recall (release-level control)
        );
    END IF;

    -- Log decision
    INSERT INTO fin.release_decision_log (
        tenant_id, entity_code, release_id,
        command, actor_id,
        policy_evaluation, result
    ) VALUES (
        v_old.tenant_id, v_old.entity_code, p_old_release_id,
        'SUPERSEDE', p_superseded_by,
        jsonb_build_object(
            'reason', p_reason,
            'replacement_release_id', p_new_release_id,
            'replacement_release_code', v_new.release_code
        ),
        'APPROVED'
    );

    -- Emit notification
    INSERT INTO fin.release_notification_event (
        tenant_id, entity_code, release_id,
        event_code, severity, summary, detail_payload
    ) VALUES (
        v_old.tenant_id, v_old.entity_code, p_old_release_id,
        'RELEASE_SUPERSEDED', 'HIGH',
        format('Pack release %s superseded by %s: %s',
            v_old.release_code, v_new.release_code, p_reason),
        jsonb_build_object(
            'old_release_code', v_old.release_code,
            'new_release_code', v_new.release_code,
            'reason', p_reason,
            'superseded_by', p_superseded_by
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'old_release_id', p_old_release_id,
        'new_release_id', p_new_release_id
    );
END;
$$;

COMMENT ON FUNCTION fin.supersede_pack_release(uuid, uuid, text, uuid) IS
    'Supersedes a RELEASED pack release with a correction release. Cascades to publication batch supersession.';


-- ############################################################################
-- B. RELEASE DECISION LOG
-- ############################################################################

-- ============================================================================
-- B1. fin.release_decision_log — Immutable decision evidence
-- ============================================================================
-- Every governed action (release, cancel, supersede, mark-ready) logs
-- the full decision context: what was the policy evaluation, who acted,
-- what was the result. This is the audit replay surface.
--
-- Distinct from activity tables: activity captures "what happened",
-- decisions capture "why it was allowed to happen."
-- ============================================================================
CREATE TABLE IF NOT EXISTS fin.release_decision_log (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES core.tenant(id),
    entity_code     varchar(20) NOT NULL,

    -- What release was this about?
    release_id      uuid REFERENCES fin.pack_release(id),

    -- What command was attempted?
    command         varchar(30) NOT NULL
                    CHECK (command IN (
                        'ASSEMBLE',
                        'MARK_READY',
                        'RELEASE',
                        'CANCEL',
                        'SUPERSEDE',
                        'EXCEPTION_SIGNOFF',
                        'INTEGRITY_CHECK'
                    )),

    -- Who acted?
    actor_id        uuid,

    -- Full policy evaluation at decision time (deterministic snapshot)
    policy_evaluation jsonb NOT NULL DEFAULT '{}'::jsonb,

    -- Decision result
    result          varchar(20) NOT NULL
                    CHECK (result IN (
                        'APPROVED',     -- action proceeded
                        'BLOCKED',      -- action blocked by policy
                        'DEFERRED'      -- action deferred for later
                    )),

    -- Cross-system correlation
    correlation_id  uuid,

    -- Related objects at decision time
    publication_batch_id uuid,
    certification_id     uuid,
    distribution_id      uuid,

    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fin_decision_log_release
    ON fin.release_decision_log(release_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fin_decision_log_tenant
    ON fin.release_decision_log(tenant_id, entity_code, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fin_decision_log_command
    ON fin.release_decision_log(command, result, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fin_decision_log_correlation
    ON fin.release_decision_log(correlation_id)
    WHERE correlation_id IS NOT NULL;

-- Immutability
DROP FUNCTION IF EXISTS fin.trg_decision_log_immutable() CASCADE;
CREATE OR REPLACE FUNCTION fin.trg_decision_log_immutable()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'release_decision_log rows are immutable — % is not permitted', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS trg_decision_log_no_update ON fin.release_decision_log;
CREATE TRIGGER trg_decision_log_no_update
    BEFORE UPDATE ON fin.release_decision_log
    FOR EACH ROW
    EXECUTE FUNCTION fin.trg_decision_log_immutable();

DROP TRIGGER IF EXISTS trg_decision_log_no_delete ON fin.release_decision_log;
CREATE TRIGGER trg_decision_log_no_delete
    BEFORE DELETE ON fin.release_decision_log
    FOR EACH ROW
    EXECUTE FUNCTION fin.trg_decision_log_immutable();

COMMENT ON TABLE fin.release_decision_log IS
    'Immutable decision evidence for governed release actions. Captures command, full policy evaluation, actor, result, and correlation ID for audit replay.';


-- ############################################################################
-- C. RELEASE NOTIFICATION EVENTS
-- ############################################################################

-- ============================================================================
-- C1. fin.release_notification_event — Handoff to notify infrastructure
-- ============================================================================
-- Structured event rows that the platform notification orchestrator
-- picks up via polling or trigger. This is NOT a notification system —
-- it is a handoff table using Athyper's existing notify.* infrastructure.
--
-- The notification orchestrator reads unprocessed events and:
--   1. Resolves recipients from role/tenant config
--   2. Creates notify.notification rows per recipient
--   3. Dispatches via configured channels (email, in-app, webhook)
--   4. Marks the event as processed
-- ============================================================================
CREATE TABLE IF NOT EXISTS fin.release_notification_event (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES core.tenant(id),
    entity_code     varchar(20) NOT NULL,

    -- Release reference
    release_id      uuid REFERENCES fin.pack_release(id),

    -- Event classification
    event_code      varchar(40) NOT NULL
                    CHECK (event_code IN (
                        -- Release lifecycle
                        'RELEASE_READY',
                        'RELEASE_COMPLETED',
                        'RELEASE_SUPERSEDED',
                        'RELEASE_CANCELLED',
                        -- Governance alerts
                        'EXCEPTION_SIGNOFF_REQUIRED',
                        'EXCEPTION_SIGNOFF_GRANTED',
                        'INTEGRITY_VERIFICATION_FAILED',
                        'CLEAN_CLOSE_FAILED',
                        -- Publication/certification
                        'CERTIFICATION_INVALIDATED',
                        'DISTRIBUTION_RECALLED',
                        'BATCH_SUPERSEDED'
                    )),

    -- Severity drives notification urgency
    severity        varchar(10) NOT NULL DEFAULT 'INFO'
                    CHECK (severity IN ('INFO', 'WARNING', 'HIGH', 'CRITICAL')),

    -- Human-readable summary (for notification body)
    summary         text NOT NULL,

    -- Structured detail (for rich notifications / dashboards)
    detail_payload  jsonb NOT NULL DEFAULT '{}'::jsonb,

    -- Processing state
    processed       boolean NOT NULL DEFAULT false,
    processed_at    timestamptz,
    processed_by    varchar(100),   -- orchestrator instance ID

    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fin_release_notif_unprocessed
    ON fin.release_notification_event(tenant_id, created_at)
    WHERE processed = false;
CREATE INDEX IF NOT EXISTS idx_fin_release_notif_release
    ON fin.release_notification_event(release_id, created_at DESC)
    WHERE release_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fin_release_notif_code
    ON fin.release_notification_event(event_code, created_at DESC);

COMMENT ON TABLE fin.release_notification_event IS
    'Handoff table for release governance notifications. The platform notification orchestrator polls for unprocessed events and dispatches via notify.* infrastructure.';

-- ============================================================================
-- C2. Automatic notification emission on exception signoff requirement
-- ============================================================================
DROP FUNCTION IF EXISTS fin.trg_release_exception_notification() CASCADE;
CREATE OR REPLACE FUNCTION fin.trg_release_exception_notification()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    -- When release transitions to READY and requires exception signoff
    IF NEW.status = 'READY' AND OLD.status = 'ASSEMBLING'
       AND NEW.requires_exception_signoff = true THEN
        INSERT INTO fin.release_notification_event (
            tenant_id, entity_code, release_id,
            event_code, severity, summary, detail_payload
        ) VALUES (
            NEW.tenant_id, NEW.entity_code, NEW.id,
            'EXCEPTION_SIGNOFF_REQUIRED', 'HIGH',
            format('Pack release %s requires exception signoff (non-clean close: %s overrides, readiness %.1f%%)',
                NEW.release_code, NEW.override_count, coalesce(NEW.readiness_score, 0)),
            jsonb_build_object(
                'release_code', NEW.release_code,
                'override_count', NEW.override_count,
                'override_impact_total', NEW.override_impact_total,
                'readiness_score', NEW.readiness_score,
                'is_clean_close', NEW.is_clean_close
            )
        );
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_release_exception_notification ON fin.pack_release;
CREATE TRIGGER trg_release_exception_notification
    AFTER UPDATE ON fin.pack_release
    FOR EACH ROW
    WHEN (NEW.status = 'READY' AND OLD.status = 'ASSEMBLING')
    EXECUTE FUNCTION fin.trg_release_exception_notification();


-- ############################################################################
-- D. RELEASE SLA METRICS & AGING ANALYTICS
-- ############################################################################

-- ============================================================================
-- D1. fin.release_sla_snapshot — Materialized timing breakdown
-- ============================================================================
-- Captures stage durations for a release at completion or on demand.
-- Enables "how fast was our close-to-release pipeline this month?"
-- ============================================================================
CREATE TABLE IF NOT EXISTS fin.release_sla_snapshot (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES core.tenant(id),
    entity_code     varchar(20) NOT NULL,

    release_id      uuid NOT NULL REFERENCES fin.pack_release(id),
    fiscal_year     smallint NOT NULL,
    period_number   smallint NOT NULL,

    -- Close timing (from close_run and close_calendar)
    close_start_date        date,
    close_hard_close_target date,
    close_hard_close_actual date,

    -- Stage durations (hours)
    close_duration_hours        decimal(10,2),   -- close start → hard close
    assembly_duration_hours     decimal(10,2),   -- release created → READY
    certification_wait_hours    decimal(10,2),   -- certification created → CERTIFIED
    exception_signoff_wait_hours decimal(10,2),  -- READY → exception signoff granted
    release_to_distribution_hours decimal(10,2), -- RELEASED → first distribution sent
    total_pipeline_hours        decimal(10,2),   -- close start → first distribution

    -- SLA compliance
    close_sla_met           boolean,    -- completed within target working days
    release_type            varchar(20),

    -- Override / governance metrics
    override_count          integer NOT NULL DEFAULT 0,
    is_clean_close          boolean,

    captured_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fin_release_sla_tenant
    ON fin.release_sla_snapshot(tenant_id, entity_code, fiscal_year, period_number);
CREATE INDEX IF NOT EXISTS idx_fin_release_sla_release
    ON fin.release_sla_snapshot(release_id);

COMMENT ON TABLE fin.release_sla_snapshot IS
    'Materialized timing breakdown for release pipeline SLA analytics. Captures stage durations, SLA compliance, and governance metrics.';

-- ============================================================================
-- D2. fin.capture_release_sla — Captures SLA metrics for a release
-- ============================================================================
DROP FUNCTION IF EXISTS fin.capture_release_sla(uuid) CASCADE;
CREATE OR REPLACE FUNCTION fin.capture_release_sla(
    p_release_id    uuid
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
    v_release       fin.pack_release;
    v_run           fin.close_run;
    v_cal           fin.close_calendar;
    v_cert          fin.pack_certification;
    v_first_dist_at timestamptz;
    v_snapshot_id   uuid;
BEGIN
    SELECT * INTO v_release FROM fin.pack_release WHERE id = p_release_id;
    IF v_release IS NULL THEN
        RAISE EXCEPTION 'Release % not found', p_release_id;
    END IF;

    -- Get close run
    IF v_release.close_run_id IS NOT NULL THEN
        SELECT * INTO v_run FROM fin.close_run WHERE id = v_release.close_run_id;
    END IF;

    -- Get close calendar
    SELECT * INTO v_cal
    FROM fin.close_calendar
    WHERE tenant_id = v_release.tenant_id
      AND entity_code = v_release.entity_code
      AND fiscal_year = v_release.fiscal_year
      AND period_number = v_release.period_to;

    -- Get certification
    IF v_release.certification_id IS NOT NULL THEN
        SELECT * INTO v_cert FROM fin.pack_certification WHERE id = v_release.certification_id;
    END IF;

    -- Get first distribution sent
    SELECT min(distributed_at) INTO v_first_dist_at
    FROM fin.pack_distribution
    WHERE pack_instance_id = v_release.pack_instance_id
      AND status = 'SENT';

    INSERT INTO fin.release_sla_snapshot (
        tenant_id, entity_code, release_id,
        fiscal_year, period_number,
        close_start_date, close_hard_close_target, close_hard_close_actual,
        close_duration_hours,
        assembly_duration_hours,
        certification_wait_hours,
        exception_signoff_wait_hours,
        release_to_distribution_hours,
        total_pipeline_hours,
        close_sla_met,
        release_type,
        override_count, is_clean_close
    ) VALUES (
        v_release.tenant_id, v_release.entity_code, p_release_id,
        v_release.fiscal_year, v_release.period_to,
        v_cal.close_start_date, v_cal.hard_close_target, v_cal.hard_close_actual,
        -- Close duration
        CASE WHEN v_run IS NOT NULL AND v_run.hard_closed_at IS NOT NULL
            THEN extract(epoch FROM v_run.hard_closed_at - v_run.started_at) / 3600
        END,
        -- Assembly duration
        CASE WHEN v_release.ready_at IS NOT NULL
            THEN extract(epoch FROM v_release.ready_at - v_release.created_at) / 3600
        END,
        -- Certification wait
        CASE WHEN v_cert IS NOT NULL AND v_cert.certified_at IS NOT NULL
            THEN extract(epoch FROM v_cert.certified_at - v_cert.created_at) / 3600
        END,
        -- Exception signoff wait
        CASE WHEN v_release.requires_exception_signoff AND v_release.exception_signoff_at IS NOT NULL
            THEN extract(epoch FROM v_release.exception_signoff_at - v_release.ready_at) / 3600
        END,
        -- Release to distribution
        CASE WHEN v_release.released_at IS NOT NULL AND v_first_dist_at IS NOT NULL
            THEN extract(epoch FROM v_first_dist_at - v_release.released_at) / 3600
        END,
        -- Total pipeline
        CASE WHEN v_run IS NOT NULL AND v_first_dist_at IS NOT NULL
            THEN extract(epoch FROM v_first_dist_at - v_run.started_at) / 3600
        END,
        -- SLA met
        CASE WHEN v_cal IS NOT NULL AND v_cal.hard_close_actual IS NOT NULL
            THEN v_cal.hard_close_actual <= v_cal.hard_close_target
        END,
        v_release.release_type,
        v_release.override_count, v_release.is_clean_close
    ) RETURNING id INTO v_snapshot_id;

    RETURN v_snapshot_id;
END;
$$;

COMMENT ON FUNCTION fin.capture_release_sla(uuid) IS
    'Captures stage-by-stage timing metrics for a release pipeline. Call after distribution or on demand.';

-- ============================================================================
-- D3. Release SLA trending view
-- ============================================================================
DROP VIEW IF EXISTS fin.vw_release_sla_trend CASCADE;
CREATE OR REPLACE VIEW fin.vw_release_sla_trend AS
SELECT
    s.tenant_id,
    s.entity_code,
    s.fiscal_year,
    s.period_number,
    s.release_type,
    s.is_clean_close,
    s.close_sla_met,
    s.override_count,
    -- Stage durations
    s.close_duration_hours,
    s.assembly_duration_hours,
    s.certification_wait_hours,
    s.exception_signoff_wait_hours,
    s.release_to_distribution_hours,
    s.total_pipeline_hours,
    -- Running averages (over last 6 periods)
    avg(s.total_pipeline_hours) OVER w AS avg_pipeline_hours_6p,
    avg(s.close_duration_hours) OVER w AS avg_close_hours_6p,
    avg(s.certification_wait_hours) OVER w AS avg_cert_wait_hours_6p,
    -- Trend direction
    CASE
        WHEN s.total_pipeline_hours < avg(s.total_pipeline_hours) OVER w
            THEN 'IMPROVING'
        WHEN s.total_pipeline_hours > avg(s.total_pipeline_hours) OVER w * 1.1
            THEN 'DEGRADING'
        ELSE 'STABLE'
    END AS pipeline_trend,
    -- Clean close rate over rolling window
    avg(CASE WHEN s.is_clean_close THEN 1.0 ELSE 0.0 END) OVER w * 100
        AS clean_close_rate_6p,
    -- Override density trend
    avg(s.override_count) OVER w AS avg_overrides_6p,
    s.captured_at
FROM fin.release_sla_snapshot s
WINDOW w AS (
    PARTITION BY s.tenant_id, s.entity_code
    ORDER BY s.fiscal_year, s.period_number
    ROWS BETWEEN 5 PRECEDING AND CURRENT ROW
);

COMMENT ON VIEW fin.vw_release_sla_trend IS
    'Cross-release SLA trending with rolling 6-period averages, pipeline trend direction, clean close rate, and override density.';


-- ############################################################################
-- E. TACTICAL GUARDS
-- ############################################################################

-- ============================================================================
-- E1. Strengthen release lifecycle guard for READY → RELEASED
-- ============================================================================
-- The lifecycle trigger (207) allows READY→RELEASED but does NOT check
-- component states. That enforcement is in release_pack() command function.
-- However, for defense-in-depth, we also harden the trigger to prevent
-- raw UPDATEs from bypassing gates.
-- ============================================================================
DROP FUNCTION IF EXISTS fin.trg_pack_release_lifecycle() CASCADE;
CREATE OR REPLACE FUNCTION fin.trg_pack_release_lifecycle()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_valid         boolean := false;
    v_batch_status  varchar(20);
    v_cert_status   varchar(20);
BEGIN
    IF OLD.status = NEW.status THEN
        RETURN NEW;
    END IF;

    v_valid := CASE OLD.status
        WHEN 'ASSEMBLING' THEN NEW.status IN ('READY', 'CANCELLED')
        WHEN 'READY'      THEN NEW.status IN ('RELEASED', 'ASSEMBLING', 'CANCELLED')
        WHEN 'RELEASED'   THEN NEW.status = 'SUPERSEDED'
        WHEN 'SUPERSEDED' THEN false
        WHEN 'CANCELLED'  THEN false
        ELSE false
    END;

    IF NOT v_valid THEN
        RAISE EXCEPTION 'Invalid pack release transition: % → %', OLD.status, NEW.status;
    END IF;

    -- Defense-in-depth: enforce component gates on READY → RELEASED
    IF NEW.status = 'RELEASED' THEN
        -- Publication batch must be PUBLISHED
        IF NEW.publication_batch_id IS NOT NULL THEN
            SELECT status INTO v_batch_status
            FROM fin.publication_batch WHERE id = NEW.publication_batch_id;
            IF v_batch_status != 'PUBLISHED' THEN
                RAISE EXCEPTION 'Cannot release: publication batch is % (must be PUBLISHED)', v_batch_status;
            END IF;
        ELSE
            RAISE EXCEPTION 'Cannot release: no publication batch linked';
        END IF;

        -- Certification must be APPROVED or CERTIFIED
        IF NEW.certification_id IS NOT NULL THEN
            SELECT certification_status INTO v_cert_status
            FROM fin.pack_certification WHERE id = NEW.certification_id;
            IF v_cert_status NOT IN ('APPROVED', 'CERTIFIED') THEN
                RAISE EXCEPTION 'Cannot release: certification is % (must be APPROVED or CERTIFIED)', v_cert_status;
            END IF;
        ELSE
            RAISE EXCEPTION 'Cannot release: no certification linked';
        END IF;

        -- Exception signoff if required
        IF NEW.requires_exception_signoff AND NEW.exception_signoff_by IS NULL THEN
            RAISE EXCEPTION 'Cannot release: exception signoff required but not provided';
        END IF;
    END IF;

    -- Auto-fill timestamps
    IF NEW.status = 'READY' AND NEW.ready_at IS NULL THEN
        NEW.ready_at := now();
    END IF;
    IF NEW.status = 'RELEASED' AND NEW.released_at IS NULL THEN
        NEW.released_at := now();
    END IF;
    IF NEW.status = 'SUPERSEDED' AND NEW.superseded_at IS NULL THEN
        NEW.superseded_at := now();
    END IF;

    RETURN NEW;
END;
$$;

-- Trigger already exists from 207, function replacement takes effect

-- ============================================================================
-- E2. Exception signoff timing guard
-- ============================================================================
-- Prevents retroactive exception signoff on already-RELEASED releases.
-- Exception signoff must happen BEFORE release, not after. If an
-- exception needs to be documented after the fact, it goes through a
-- separate post-release audit process (not exception signoff).
-- ============================================================================
DROP FUNCTION IF EXISTS fin.trg_release_exception_signoff_guard() CASCADE;
CREATE OR REPLACE FUNCTION fin.trg_release_exception_signoff_guard()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    -- Block setting exception_signoff_by on RELEASED or SUPERSEDED releases
    IF OLD.exception_signoff_by IS NULL AND NEW.exception_signoff_by IS NOT NULL
       AND NEW.status IN ('RELEASED', 'SUPERSEDED') THEN
        RAISE EXCEPTION 'Cannot add exception signoff to a % release. Signoff must precede release.', NEW.status;
    END IF;

    -- Auto-fill timestamp when signoff is added
    IF OLD.exception_signoff_by IS NULL AND NEW.exception_signoff_by IS NOT NULL THEN
        NEW.exception_signoff_at := coalesce(NEW.exception_signoff_at, now());

        -- Emit notification
        INSERT INTO fin.release_notification_event (
            tenant_id, entity_code, release_id,
            event_code, severity, summary, detail_payload
        ) VALUES (
            NEW.tenant_id, NEW.entity_code, NEW.id,
            'EXCEPTION_SIGNOFF_GRANTED', 'INFO',
            format('Exception signoff granted for release %s by actor', NEW.release_code),
            jsonb_build_object(
                'release_code', NEW.release_code,
                'signoff_by', NEW.exception_signoff_by,
                'override_count', NEW.override_count,
                'override_impact', NEW.override_impact_total,
                'notes', NEW.exception_signoff_notes
            )
        );

        -- Log the decision
        INSERT INTO fin.release_decision_log (
            tenant_id, entity_code, release_id,
            command, actor_id,
            policy_evaluation, result
        ) VALUES (
            NEW.tenant_id, NEW.entity_code, NEW.id,
            'EXCEPTION_SIGNOFF', NEW.exception_signoff_by,
            jsonb_build_object(
                'override_count', NEW.override_count,
                'override_impact', NEW.override_impact_total,
                'is_clean_close', NEW.is_clean_close,
                'notes', NEW.exception_signoff_notes
            ),
            'APPROVED'
        );
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_release_exception_signoff_guard ON fin.pack_release;
CREATE TRIGGER trg_release_exception_signoff_guard
    BEFORE UPDATE ON fin.pack_release
    FOR EACH ROW
    EXECUTE FUNCTION fin.trg_release_exception_signoff_guard();

COMMENT ON FUNCTION fin.trg_release_exception_signoff_guard() IS
    'Prevents retroactive exception signoff on RELEASED releases. Signoff must precede release. Also auto-emits notification and decision log.';

-- ============================================================================
-- E3. Decision analytics view
-- ============================================================================
DROP VIEW IF EXISTS fin.vw_release_decision_analytics CASCADE;
CREATE OR REPLACE VIEW fin.vw_release_decision_analytics AS
SELECT
    d.tenant_id,
    d.entity_code,
    r.fiscal_year,
    r.period_to AS period_number,
    d.command,
    d.result,
    d.actor_id,
    r.release_code,
    r.release_type,
    r.is_clean_close,
    -- Policy evaluation summary
    jsonb_array_length(coalesce(d.policy_evaluation->'blockers', '[]'::jsonb)) AS blocker_count,
    d.policy_evaluation->>'integrity' IS NOT NULL AS had_integrity_check,
    -- Timing
    d.created_at AS decision_at,
    r.released_at,
    -- Decision lag (time from READY to decision)
    CASE WHEN r.ready_at IS NOT NULL
        THEN extract(epoch FROM d.created_at - r.ready_at) / 3600
    END AS hours_since_ready,
    d.correlation_id
FROM fin.release_decision_log d
JOIN fin.pack_release r ON r.id = d.release_id;

COMMENT ON VIEW fin.vw_release_decision_analytics IS
    'Decision analytics across releases. Shows blocker counts, integrity check presence, decision timing, and correlation IDs.';
