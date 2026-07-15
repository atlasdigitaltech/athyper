-- ============================================================================
-- document/01v_tables_schedule_line.sql
-- Concept: Polymorphic schedule_line carrier (P2P scheduling)
-- Depends on: 01j_tables_p2p.sql, 01c_tables_commitment.sql, 01e_tables_invoice.sql
--
-- §SCHEDULE_LINE  —  delivery / billing-milestone / release-window schedule
-- ----------------------------------------------------------------------------
-- Polymorphic child carrier — mirrors document.pricing_component pattern.
-- Source line owner can be PR / commitment(PO) / PI; the carrier holds a
-- repeatable schedule split for that line.
--
-- Versioning lifecycle (locked):
--   create:    on source-line insert OR on conversion (PR→PO, PO→PI)
--   supersede: on POC amendment-accepted / PI amendment publish
--              (old rows: is_current_version=false, supersedes_at=now())
--   retire:    on PO cancel / short_close — terminal_status='CANCELED'
--              on PI reverse — preserved as history (no retirement)
--
-- Read contract for PO approve dispatcher:
--   WHERE source_doc_type='commitment_line'
--     AND source_doc_id   = :commitment_id
--     AND source_line_id  = :commitment_line_id
--     AND is_current_version = true
--     AND terminal_status IS NULL
--
-- Fulfillment cache (fulfilled_quantity, fulfillment_status) is trigger-synced
-- from downstream consumers — source of truth is receipt_line /
-- service_sheet_line / purchase_invoice_line aggregates.
-- ============================================================================

CREATE TABLE IF NOT EXISTS document.schedule_line (
    -- Identity
    id                      uuid          NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid          NOT NULL,

    -- Polymorphic source (mirrors pricing_component.source_doc_type)
    source_doc_type         text          NOT NULL,
    source_doc_id           uuid          NOT NULL,    -- parent header id
    source_line_id          uuid          NOT NULL,    -- owning line id

    -- Schedule identity within source line
    schedule_no             smallint      NOT NULL,
    schedule_kind           text          NOT NULL DEFAULT 'delivery',

    -- Planned values
    scheduled_quantity      numeric(18,4) NOT NULL,
    scheduled_amount        numeric(18,4),
    scheduled_date          date          NOT NULL,
    currency_code           character(3),

    -- Fulfillment caches (trigger-synced; source of truth is downstream line aggregates)
    fulfilled_quantity      numeric(18,4) NOT NULL DEFAULT 0,
    fulfilled_amount        numeric(18,4) NOT NULL DEFAULT 0,
    remaining_quantity      numeric(18,4) GENERATED ALWAYS AS (
                                  scheduled_quantity - fulfilled_quantity
                              ) STORED,
    fulfillment_status      text          NOT NULL DEFAULT 'open',

    -- Versioning (universal — see docs/architecture/p2p.md §Universal-Columns)
    row_version             bigint        NOT NULL DEFAULT 1,
    version_number          int           NOT NULL DEFAULT 1,
    previous_version_id     uuid,
    is_current_version      boolean       NOT NULL DEFAULT true,
    supersedes_at           timestamptz,

    -- Closure (universal)
    terminal_status         text,
    status_source           text          NOT NULL DEFAULT 'manual',

    -- Lifecycle
    status                  text          NOT NULL DEFAULT 'active',

    -- Tags & Metadata
    tags                    jsonb         NOT NULL DEFAULT '[]'::jsonb,
    metadata                jsonb         NOT NULL DEFAULT '{}'::jsonb,

    -- Audit
    created_at              timestamptz   NOT NULL DEFAULT now(),
    created_by              uuid          NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT schl_pkey                PRIMARY KEY (id),
    CONSTRAINT schl_tenant_id_uq        UNIQUE (tenant_id, id),
    CONSTRAINT schl_source_no_uq        UNIQUE (tenant_id, source_line_id, schedule_no, version_number),
    CONSTRAINT schl_source_type_chk     CHECK (source_doc_type IN (
        'purchase_requisition_line','commitment_line','purchase_invoice_line')),
    CONSTRAINT schl_kind_chk            CHECK (schedule_kind IN (
        'delivery','billing_milestone','release_window')),
    CONSTRAINT schl_qty_pos             CHECK (scheduled_quantity > 0),
    CONSTRAINT schl_fulfilled_nonneg    CHECK (fulfilled_quantity >= 0),
    CONSTRAINT schl_fulfilled_le_sched  CHECK (fulfilled_quantity <= scheduled_quantity),
    CONSTRAINT schl_amount_nonneg       CHECK (
        scheduled_amount IS NULL OR scheduled_amount >= 0),
    CONSTRAINT schl_fulfilled_amt_nonneg CHECK (fulfilled_amount >= 0),
    CONSTRAINT schl_fulfillment_status_chk CHECK (fulfillment_status IN (
        'open','partial','fulfilled','closed','cancelled')),
    CONSTRAINT schl_status_chk          CHECK (status IN (
        'active','superseded','retired','cancelled')),
    CONSTRAINT schl_terminal_status_chk CHECK (
        terminal_status IS NULL OR terminal_status IN ('CANCELED','REJECTED')),
    CONSTRAINT schl_status_source_chk   CHECK (
        status_source IN ('manual','derived','system','terminal')),
    CONSTRAINT schl_version_self_chk    CHECK (previous_version_id IS DISTINCT FROM id),
    CONSTRAINT schl_schedule_no_chk     CHECK (schedule_no > 0),
    CONSTRAINT schl_version_pos         CHECK (version_number >= 1)
);

COMMENT ON TABLE document.schedule_line IS
    'ARCHETYPE=B_LITE;SCOPE=T;PENDING_ACTIVE_SET. Polymorphic schedule carrier — mirrors pricing_component pattern. '
    'source_doc_type IN (purchase_requisition_line, commitment_line, purchase_invoice_line). '
    'fulfilled_quantity is a trigger-synced cache; source of truth is downstream line aggregates '
    '(receipt_line / service_sheet_line / purchase_invoice_line). '
    'Versioning: supersede on amendment (is_current_version flip), retire on PO cancel/short_close.';

COMMENT ON COLUMN document.schedule_line.source_doc_type IS
    'Polymorphic source type. Same enum as accounting_distribution.source_doc_type / '
    'pricing_component.source_doc_type (sans receipt/service_sheet lines — schedules attach '
    'only to authoring documents).';

COMMENT ON COLUMN document.schedule_line.fulfilled_quantity IS
    'Cached running total of consumed quantity. Derived by trg_schedule_line_fulfilled '
    'from downstream lines: receipt_line + service_sheet_line + purchase_invoice_line '
    'aggregated by (source_doc_type, source_line_id). Not authoritative — recompute on demand.';

COMMENT ON COLUMN document.schedule_line.is_current_version IS
    'True for the active row; false for superseded rows kept as history. '
    'PO approve dispatcher reads ONLY rows with is_current_version=true AND terminal_status IS NULL.';


-- ── Indexes ─────────────────────────────────────────────────────────────────
-- Primary read path: PO approve dispatcher reads current schedules per line
CREATE INDEX IF NOT EXISTS schl_source_current_idx
    ON document.schedule_line (tenant_id, source_doc_type, source_line_id)
    WHERE is_current_version = true AND terminal_status IS NULL;

-- Date-range queries: open schedules by due date
CREATE INDEX IF NOT EXISTS schl_open_by_date_idx
    ON document.schedule_line (tenant_id, scheduled_date)
    WHERE is_current_version = true AND fulfillment_status IN ('open','partial');

-- Lookup superseded chain (audit / history)
CREATE INDEX IF NOT EXISTS schl_previous_version_idx
    ON document.schedule_line (tenant_id, previous_version_id)
    WHERE previous_version_id IS NOT NULL;

-- Source-doc fan-out (for retire / cancel scans)
CREATE INDEX IF NOT EXISTS schl_source_doc_idx
    ON document.schedule_line (tenant_id, source_doc_id);
