/* ============================================================================
   Athyper v2.5 — Pack Governance: Certification, Distribution & Forecast
   Schema: fin
   Dependencies: core.tenant, wf.approval_instance, notify.message,
                 fin.report_pack_instance, fin.budget_line

   Three layers:
     A. Certification — structured sign-off chain linked to wf.approval_*
     B. Distribution — governed delivery registry with download audit
     C. Forecast Scenarios — extends budget model for multi-scenario variance

   Table topology:
     fin.pack_certification          → Sign-off metadata per pack instance
     fin.pack_activity               → Append-only audit timeline
     fin.pack_distribution           → Distribution registry
     fin.pack_distribution_recipient → Per-recipient tracking
     fin.pack_download_log           → Download/view audit trail
     fin.forecast_scenario           → Scenario definitions
     fin.forecast_line               → Per-account/period/scenario forecast data

   Architectural notes:
     - Approval workflow: delegates to wf.approval_instance (same pattern
       as fin.period_close_checklist.approval_instance_id)
     - Delivery: triggers notify.message for actual delivery; this table
       is the finance-side registry
     - Forecast: extends budget_line pattern; scenario_code differentiates
       BASE, OPTIMISTIC, PESSIMISTIC, STRETCH, custom
   ============================================================================ */

-- ============================================================================
-- A. CERTIFICATION
-- ============================================================================

-- ============================================================================
-- fin.pack_certification — Sign-off chain per pack instance
-- ============================================================================
-- Links a pack instance to the structured preparer → reviewer → approver
-- sign-off chain. Optionally ties into wf.approval_instance for formal
-- approval workflow.

CREATE TABLE IF NOT EXISTS fin.pack_certification (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL REFERENCES core.tenant(id),
    pack_instance_id        UUID NOT NULL REFERENCES fin.report_pack_instance(id),

    -- Prepared by (the person who generated / assembled the pack)
    prepared_by             UUID,
    prepared_by_name        VARCHAR(200),
    prepared_at             TIMESTAMPTZ,

    -- Reviewed by (first-level review)
    reviewed_by             UUID,
    reviewed_by_name        VARCHAR(200),
    reviewed_at             TIMESTAMPTZ,
    review_notes            TEXT,

    -- Approved by (formal approval — may link to wf.approval_instance)
    approved_by             UUID,
    approved_by_name        VARCHAR(200),
    approved_at             TIMESTAMPTZ,
    approval_notes          TEXT,

    -- Formal approval workflow (optional — links to wf.approval_*)
    approval_instance_id    UUID REFERENCES wf.approval_instance(id),

    -- Final certification / sign-off
    certified_by            UUID,
    certified_by_name       VARCHAR(200),
    certified_at            TIMESTAMPTZ,
    certification_notes     TEXT,

    -- Certification status
    certification_status    VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                            CHECK (certification_status IN (
                                'PENDING',          -- not yet started
                                'IN_REVIEW',        -- reviewer has it
                                'REVIEWED',         -- reviewed, awaiting approval
                                'APPROVED',         -- formally approved
                                'CERTIFIED',        -- signed off for distribution
                                'REJECTED'          -- sent back
                            )),

    -- Disclosure / disclaimer notes (appear on cover page)
    disclosure_notes        TEXT,

    -- Metadata
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_fin_pack_cert UNIQUE (pack_instance_id)
);

CREATE INDEX IF NOT EXISTS idx_fin_pack_cert_tenant
    ON fin.pack_certification(tenant_id);
CREATE INDEX IF NOT EXISTS idx_fin_pack_cert_status
    ON fin.pack_certification(certification_status)
    WHERE certification_status NOT IN ('CERTIFIED', 'REJECTED');
CREATE INDEX IF NOT EXISTS idx_fin_pack_cert_approval
    ON fin.pack_certification(approval_instance_id)
    WHERE approval_instance_id IS NOT NULL;

-- ============================================================================
-- fin.pack_activity — Append-only audit timeline
-- ============================================================================
-- Follows the exact pattern of fin.period_close_activity.
-- Records every lifecycle event on a pack instance.

CREATE TABLE IF NOT EXISTS fin.pack_activity (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES core.tenant(id),
    entity_code         VARCHAR(20) NOT NULL,

    pack_instance_id    UUID NOT NULL REFERENCES fin.report_pack_instance(id),

    -- Event classification
    activity_type       VARCHAR(40) NOT NULL
                        CHECK (activity_type IN (
                            -- Generation
                            'PACK_GENERATED',
                            'ITEM_GENERATED',
                            'ITEM_FAILED',
                            'ITEM_SKIPPED',
                            -- Certification lifecycle
                            'REVIEW_STARTED',
                            'REVIEW_COMPLETED',
                            'APPROVAL_REQUESTED',
                            'APPROVAL_GRANTED',
                            'APPROVAL_REJECTED',
                            'CERTIFICATION_GRANTED',
                            'CERTIFICATION_REVOKED',
                            -- Status transitions
                            'STATUS_CHANGED',
                            'SUPERSEDED',
                            -- Distribution
                            'DISTRIBUTION_CREATED',
                            'DISTRIBUTION_SENT',
                            'DISTRIBUTION_DOWNLOADED',
                            'DISTRIBUTION_VIEWED',
                            -- Commentary
                            'COMMENTARY_ADDED',
                            'COMMENTARY_UPDATED',
                            -- Export
                            'EXPORTED'
                        )),

    -- Actor
    actor_type          VARCHAR(20) NOT NULL DEFAULT 'user'
                        CHECK (actor_type IN (
                            'user', 'system', 'approval_engine', 'scheduler'
                        )),
    actor_id            UUID,

    -- Human-readable summary
    message             TEXT,

    -- Structured payload (varies by activity_type)
    payload             JSONB DEFAULT '{}',

    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fin_pack_activity_instance
    ON fin.pack_activity(pack_instance_id, created_at);
CREATE INDEX IF NOT EXISTS idx_fin_pack_activity_tenant
    ON fin.pack_activity(tenant_id, entity_code, created_at);

-- Immutability: pack activity log is append-only
CREATE OR REPLACE FUNCTION fin.trg_pack_activity_immutable()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Pack activity log is append-only. UPDATE and DELETE are not permitted.';
END $$;

DROP TRIGGER IF EXISTS trg_pack_activity_no_update ON fin.pack_activity;
CREATE TRIGGER trg_pack_activity_no_update
    BEFORE UPDATE OR DELETE ON fin.pack_activity
    FOR EACH ROW
    EXECUTE FUNCTION fin.trg_pack_activity_immutable();


-- ============================================================================
-- B. DISTRIBUTION
-- ============================================================================

-- ============================================================================
-- fin.pack_distribution — Distribution registry
-- ============================================================================
-- Tracks each distribution event (who sent what version to whom).

CREATE TABLE IF NOT EXISTS fin.pack_distribution (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES core.tenant(id),
    pack_instance_id    UUID NOT NULL REFERENCES fin.report_pack_instance(id),

    -- Distribution identity
    distribution_code   VARCHAR(50) NOT NULL,
    name                VARCHAR(200) NOT NULL,
    description         TEXT,

    -- What was distributed
    format              VARCHAR(20) NOT NULL DEFAULT 'LINK'
                        CHECK (format IN (
                            'LINK',         -- secure link to view online
                            'PDF',          -- PDF attachment
                            'EXCEL',        -- Excel workbook
                            'ZIP',          -- ZIP bundle (PDF + Excel + CSV)
                            'EMAIL_BODY'    -- inline in email body
                        )),

    -- Which version / certification
    certification_id    UUID REFERENCES fin.pack_certification(id),

    -- Distribution metadata
    distributed_by      UUID,
    distributed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Notification linkage (optional — links to notify.message for actual delivery)
    notify_message_id   UUID,

    -- Status
    status              VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
                        CHECK (status IN (
                            'DRAFT',        -- recipients being assembled
                            'SENDING',      -- delivery in progress
                            'SENT',         -- all deliveries dispatched
                            'PARTIAL',      -- some deliveries failed
                            'FAILED',       -- all deliveries failed
                            'RECALLED'      -- distribution recalled
                        )),

    -- Recall
    recalled_by         UUID,
    recalled_at         TIMESTAMPTZ,
    recall_reason       TEXT,

    -- Counts
    recipient_count     SMALLINT NOT NULL DEFAULT 0,
    delivered_count     SMALLINT NOT NULL DEFAULT 0,
    viewed_count        SMALLINT NOT NULL DEFAULT 0,
    downloaded_count    SMALLINT NOT NULL DEFAULT 0,

    -- Secure link (if format = LINK)
    secure_link_token   VARCHAR(128),
    link_expires_at     TIMESTAMPTZ,

    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_fin_pack_dist UNIQUE (tenant_id, pack_instance_id, distribution_code)
);

CREATE INDEX IF NOT EXISTS idx_fin_pack_dist_instance
    ON fin.pack_distribution(pack_instance_id);
CREATE INDEX IF NOT EXISTS idx_fin_pack_dist_tenant
    ON fin.pack_distribution(tenant_id, distributed_at DESC);
CREATE INDEX IF NOT EXISTS idx_fin_pack_dist_token
    ON fin.pack_distribution(secure_link_token)
    WHERE secure_link_token IS NOT NULL;

-- ============================================================================
-- fin.pack_distribution_recipient — Per-recipient tracking
-- ============================================================================

CREATE TABLE IF NOT EXISTS fin.pack_distribution_recipient (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    distribution_id     UUID NOT NULL REFERENCES fin.pack_distribution(id) ON DELETE CASCADE,

    -- Recipient identity
    recipient_id        UUID,                   -- principal ID (if known)
    recipient_name      VARCHAR(200) NOT NULL,
    recipient_email     VARCHAR(320),
    recipient_role      VARCHAR(50),            -- e.g., CFO, Board Member, Audit Committee

    -- Delivery status
    delivery_status     VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                        CHECK (delivery_status IN (
                            'PENDING', 'SENT', 'DELIVERED', 'BOUNCED', 'FAILED'
                        )),
    sent_at             TIMESTAMPTZ,
    delivered_at        TIMESTAMPTZ,
    bounced_at          TIMESTAMPTZ,

    -- Engagement
    first_viewed_at     TIMESTAMPTZ,
    last_viewed_at      TIMESTAMPTZ,
    view_count          SMALLINT NOT NULL DEFAULT 0,
    first_downloaded_at TIMESTAMPTZ,
    download_count      SMALLINT NOT NULL DEFAULT 0,

    -- Notification delivery linkage
    notify_delivery_id  UUID,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_fin_pack_dist_recip UNIQUE (distribution_id, recipient_id)
);

CREATE INDEX IF NOT EXISTS idx_fin_pack_dist_recip_dist
    ON fin.pack_distribution_recipient(distribution_id);

-- ============================================================================
-- fin.pack_download_log — Download / view audit trail
-- ============================================================================
-- Immutable audit of every view/download event.

CREATE TABLE IF NOT EXISTS fin.pack_download_log (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES core.tenant(id),
    distribution_id     UUID NOT NULL REFERENCES fin.pack_distribution(id),
    recipient_id        UUID REFERENCES fin.pack_distribution_recipient(id),

    -- Event
    event_type          VARCHAR(20) NOT NULL
                        CHECK (event_type IN ('VIEW', 'DOWNLOAD')),

    -- Details
    format              VARCHAR(20),            -- PDF, EXCEL, ZIP
    ip_address          INET,
    user_agent          TEXT,

    occurred_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fin_pack_dl_log_dist
    ON fin.pack_download_log(distribution_id, occurred_at);

-- Immutability
CREATE OR REPLACE FUNCTION fin.trg_download_log_immutable()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Download log is append-only. UPDATE and DELETE are not permitted.';
END $$;

DROP TRIGGER IF EXISTS trg_download_log_no_update ON fin.pack_download_log;
CREATE TRIGGER trg_download_log_no_update
    BEFORE UPDATE OR DELETE ON fin.pack_download_log
    FOR EACH ROW
    EXECUTE FUNCTION fin.trg_download_log_immutable();


-- ============================================================================
-- C. FORECAST SCENARIOS
-- ============================================================================

-- ============================================================================
-- fin.forecast_scenario — Scenario definitions
-- ============================================================================
-- Each scenario is a named set of assumptions that drive forecast lines.
-- Examples: BASE, OPTIMISTIC, PESSIMISTIC, STRETCH, COVID_IMPACT

CREATE TABLE IF NOT EXISTS fin.forecast_scenario (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES core.tenant(id),
    entity_code     VARCHAR(20) NOT NULL,

    scenario_code   VARCHAR(50) NOT NULL,
    name            VARCHAR(200) NOT NULL,
    description     TEXT,

    -- Scenario classification
    scenario_type   VARCHAR(20) NOT NULL DEFAULT 'CUSTOM'
                    CHECK (scenario_type IN (
                        'BASE',             -- baseline / most-likely
                        'OPTIMISTIC',       -- upside case
                        'PESSIMISTIC',      -- downside case
                        'STRETCH',          -- aggressive target
                        'CUSTOM'            -- user-defined
                    )),

    -- Linkage to budget (optional — scenarios can override a budget)
    base_budget_code VARCHAR(50),

    -- Version control
    version         SMALLINT NOT NULL DEFAULT 1,

    -- Assumptions (structured data for driver-based forecasting)
    assumptions     JSONB DEFAULT '{}',

    -- Lifecycle
    status          VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
                    CHECK (status IN ('DRAFT', 'ACTIVE', 'FROZEN', 'ARCHIVED')),

    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by      UUID,

    CONSTRAINT uq_fin_forecast_scenario UNIQUE (tenant_id, entity_code, scenario_code, version)
);

CREATE INDEX IF NOT EXISTS idx_fin_forecast_scenario_tenant
    ON fin.forecast_scenario(tenant_id, entity_code);

-- ============================================================================
-- fin.forecast_line — Per-account/period/scenario forecast data
-- ============================================================================
-- Mirrors fin.budget_line structure but adds scenario_id and
-- supports revised forecasts via forecast_version.

CREATE TABLE IF NOT EXISTS fin.forecast_line (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES core.tenant(id),
    entity_code         VARCHAR(20) NOT NULL,

    -- Scenario identity
    scenario_id         UUID NOT NULL REFERENCES fin.forecast_scenario(id),

    -- Forecast identity
    forecast_code       VARCHAR(50) NOT NULL,       -- e.g., 'FC-2026-Q2-REV1'
    forecast_version    SMALLINT NOT NULL DEFAULT 1,

    -- Account scope
    account_id          UUID NOT NULL REFERENCES fin.chart_of_accounts(id),

    -- Period scope
    fiscal_year         SMALLINT NOT NULL,
    period_number       SMALLINT NOT NULL,

    -- Book
    book_code           VARCHAR(20) NOT NULL DEFAULT 'STAT',

    -- Dimension scope (NULL = undimensioned)
    dimension_set_id    UUID REFERENCES fin.dimension_set(id),

    -- Amount (MC-4: DECIMAL(18,4))
    forecast_amount     DECIMAL(18,4) NOT NULL DEFAULT 0,

    -- Driver-based details (optional)
    driver_type         VARCHAR(30),
    driver_value        DECIMAL(18,4),
    driver_formula      TEXT,

    -- Status
    is_approved         BOOLEAN NOT NULL DEFAULT FALSE,
    approved_by         UUID,
    approved_at         TIMESTAMPTZ,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by          UUID
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_fin_forecast_line
    ON fin.forecast_line (
        tenant_id, entity_code, scenario_id, forecast_code, forecast_version,
        account_id, fiscal_year, period_number, book_code,
        COALESCE(dimension_set_id, '00000000-0000-0000-0000-000000000000')
    );

CREATE INDEX IF NOT EXISTS idx_fin_forecast_line_tenant
    ON fin.forecast_line(tenant_id, entity_code, fiscal_year);
CREATE INDEX IF NOT EXISTS idx_fin_forecast_line_scenario
    ON fin.forecast_line(scenario_id, fiscal_year, period_number);
CREATE INDEX IF NOT EXISTS idx_fin_forecast_line_account
    ON fin.forecast_line(account_id, fiscal_year, period_number);

-- ============================================================================
-- Forecast resolution function
-- ============================================================================
-- Resolves forecast amounts for statement lines, matching the shape of
-- fin.resolve_statement_budget().

CREATE OR REPLACE FUNCTION fin.resolve_statement_forecast(
    p_tenant_id         UUID,
    p_entity_code       VARCHAR(20),
    p_definition_id     UUID,
    p_fiscal_year       SMALLINT,
    p_period_from       SMALLINT,
    p_period_to         SMALLINT,
    p_scenario_id       UUID,
    p_book_code         VARCHAR(20) DEFAULT 'STAT',
    p_forecast_code     VARCHAR(50) DEFAULT NULL,
    p_dimension_set_id  UUID DEFAULT NULL
) RETURNS TABLE (
    line_code       VARCHAR(50),
    account_id      UUID,
    account_code    VARCHAR(20),
    forecast_amount DECIMAL(18,4)
) LANGUAGE sql STABLE AS $fn$
    SELECT
        sl.line_code,
        a.id AS account_id,
        a.account_code,
        COALESCE(SUM(fl.forecast_amount), 0) AS forecast_amount
    FROM fin.statement_line sl
    JOIN fin.statement_line_account sla ON sla.line_id = sl.id
    JOIN fin.chart_of_accounts a ON (
        (sla.mapping_mode = 'EXACT' AND a.account_code = sla.account_code)
        OR (sla.mapping_mode = 'RANGE' AND a.account_code >= sla.range_from
            AND a.account_code <= sla.range_to)
        OR (sla.mapping_mode = 'TYPE' AND a.account_type = sla.account_type)
    )
    LEFT JOIN fin.forecast_line fl ON (
        fl.tenant_id = p_tenant_id
        AND fl.entity_code = p_entity_code
        AND fl.account_id = a.id
        AND fl.scenario_id = p_scenario_id
        AND fl.fiscal_year = p_fiscal_year
        AND fl.period_number BETWEEN p_period_from AND p_period_to
        AND fl.book_code = p_book_code
        AND fl.is_approved = TRUE
        AND (p_forecast_code IS NULL OR fl.forecast_code = p_forecast_code)
        AND (p_dimension_set_id IS NULL OR fl.dimension_set_id = p_dimension_set_id)
    )
    WHERE sl.definition_id = p_definition_id
      AND sl.line_type IN ('ACCOUNT', 'MOVEMENT')
      AND sl.is_active = TRUE
      AND a.tenant_id = p_tenant_id
      AND a.entity_code = p_entity_code
      AND a.is_active = TRUE
      AND (sla.subledger_type IS NULL OR a.subledger_type = sla.subledger_type)
    GROUP BY sl.line_code, a.id, a.account_code
    ORDER BY sl.line_code, a.account_code;
$fn$;

-- ============================================================================
-- Extend report_pack_item: add FORECAST variance source
-- ============================================================================
-- Update the CHECK constraint on variance_source to include FORECAST scenarios

ALTER TABLE fin.report_pack_item
    DROP CONSTRAINT IF EXISTS report_pack_item_variance_source_check;
ALTER TABLE fin.report_pack_item
    ADD CONSTRAINT report_pack_item_variance_source_check
    CHECK (variance_source IS NULL OR variance_source IN (
        'PRIOR_YEAR', 'BUDGET', 'FORECAST', 'PRIOR_PERIOD'
    ));

-- Add scenario_id to pack items for forecast-based variance
ALTER TABLE fin.report_pack_item
    ADD COLUMN IF NOT EXISTS scenario_id UUID REFERENCES fin.forecast_scenario(id);

-- Add KPI item type support
ALTER TABLE fin.report_pack_item
    DROP CONSTRAINT IF EXISTS report_pack_item_item_type_check;
ALTER TABLE fin.report_pack_item
    ADD CONSTRAINT report_pack_item_item_type_check
    CHECK (item_type IN (
        'STATEMENT', 'COMPARISON', 'NARRATIVE', 'SEPARATOR', 'KPI'
    ));
