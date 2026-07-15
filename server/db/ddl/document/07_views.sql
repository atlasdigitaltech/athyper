-- ============================================================================
-- document/07_views.sql
-- Concept: Document Views - read projections over physical tables
-- Depends on: 01c_tables_commitment.sql (commitment + commitment_procurement)
-- ============================================================================

-- ============================================================================
-- document.purchase_order
-- ----------------------------------------------------------------------------
-- Thin view over document.commitment filtered to commitment_type='purchase_order'.
-- Native column names — no aliasing — so entity_field.column_name maps 1:1
-- to commitment columns (Purchase Invoice convention).
--
-- Sub-type is carried on commitment.order_type
-- (standard | blanket | service | emergency).
--
-- Write path: INSTEAD OF INSERT/UPDATE/DELETE triggers forward to commitment
-- with commitment_type='purchase_order' and party_type='SUPPLIER' fixed by
-- the view semantics.
-- ============================================================================

CREATE OR REPLACE VIEW document.purchase_order AS
SELECT
    c.id,
    c.tenant_id,
    c.company_code_id,
    c.code,
    c.name,
    c.order_type,
    c.status,

    c.party_type,
    c.party_id,
    c.parent_commitment_id,
    c.release_sequence_no,

    c.requested_by,
    c.responsible_person_id,
    c.approved_by,
    c.approved_at,
    c.workflow_request_id,

    c.document_date,
    c.effective_date,
    c.expiry_date,
    c.fiscal_year,
    c.period_number,

    c.currency_code,
    c.base_currency_code,
    c.exchange_rate,
    c.fx_rate_snapshot,
    c.fx_policy,

    c.total_amount,
    c.scheduled_amount,
    c.released_amount,
    c.fulfilled_amount,
    c.invoiced_amount,
    c.paid_amount,

    c.payment_term_id,
    c.budget_check_result,
    c.encumbrance_je_id,

    c.renewal_terms,
    c.renewal_count,
    c.renewed_from_id,

    c.is_provisional,
    c.draft_expires_at,
    c.draft_started_at,
    c.draft_started_by,

    c.tags,
    c.metadata,
    c.is_active,
    c.status_changed_at,
    c.status_changed_by,
    c.row_version,
    c.created_at,
    c.created_by,
    c.updated_at,
    c.updated_by
FROM document.commitment c
WHERE c.commitment_type = 'purchase_order';

COMMENT ON VIEW document.purchase_order IS
    'Thin view over document.commitment filtered to commitment_type=''purchase_order''. Native column names; sub-type on order_type. Writes route through INSTEAD-OF triggers.';


-- ============================================================================
-- document.purchase_order — INSTEAD-OF write triggers
-- ----------------------------------------------------------------------------
-- Enforce commitment_type='purchase_order' and party_type='SUPPLIER' on write.
-- ============================================================================

CREATE OR REPLACE FUNCTION document.purchase_order_view_insert()
RETURNS trigger AS $$
BEGIN
    INSERT INTO document.commitment (
        id, tenant_id, company_code_id,
        code, name,
        commitment_type, order_type,
        party_type, party_id,
        parent_commitment_id, release_sequence_no,
        requested_by, responsible_person_id, approved_by, approved_at,
        workflow_request_id,
        document_date, effective_date, expiry_date,
        currency_code, base_currency_code, exchange_rate,
        fx_rate_snapshot, fx_policy,
        total_amount, scheduled_amount, released_amount,
        fulfilled_amount, invoiced_amount, paid_amount,
        payment_term_id, budget_check_result, encumbrance_je_id,
        renewal_terms, renewal_count, renewed_from_id,
        is_provisional, draft_expires_at, draft_started_at, draft_started_by,
        tags, metadata,
        status, status_changed_at, status_changed_by,
        created_at, created_by, updated_at, updated_by
    ) VALUES (
        COALESCE(NEW.id, shared.uuidv7()),
        NEW.tenant_id, NEW.company_code_id,
        NEW.code, NEW.name,
        'purchase_order',
        COALESCE(NEW.order_type, 'standard'),
        COALESCE(NEW.party_type, 'SUPPLIER'), NEW.party_id,
        NEW.parent_commitment_id, NEW.release_sequence_no,
        NEW.requested_by, NEW.responsible_person_id, NEW.approved_by, NEW.approved_at,
        NEW.workflow_request_id,
        NEW.document_date, NEW.effective_date, NEW.expiry_date,
        NEW.currency_code, NEW.base_currency_code, NEW.exchange_rate,
        NEW.fx_rate_snapshot, COALESCE(NEW.fx_policy, 'spot_on_event'),
        COALESCE(NEW.total_amount, 0), COALESCE(NEW.scheduled_amount, 0), COALESCE(NEW.released_amount, 0),
        COALESCE(NEW.fulfilled_amount, 0), COALESCE(NEW.invoiced_amount, 0), COALESCE(NEW.paid_amount, 0),
        NEW.payment_term_id, NEW.budget_check_result, NEW.encumbrance_je_id,
        NEW.renewal_terms, COALESCE(NEW.renewal_count, 0), NEW.renewed_from_id,
        COALESCE(NEW.is_provisional, false), NEW.draft_expires_at, NEW.draft_started_at, NEW.draft_started_by,
        COALESCE(NEW.tags, '[]'::jsonb), COALESCE(NEW.metadata, '{}'::jsonb),
        COALESCE(NEW.status, 'draft'), NEW.status_changed_at, NEW.status_changed_by,
        COALESCE(NEW.created_at, now()), NEW.created_by, NEW.updated_at, NEW.updated_by
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_purchase_order_view_insert ON document.purchase_order;
CREATE TRIGGER trg_purchase_order_view_insert
    INSTEAD OF INSERT ON document.purchase_order
    FOR EACH ROW EXECUTE FUNCTION document.purchase_order_view_insert();


CREATE OR REPLACE FUNCTION document.purchase_order_view_update()
RETURNS trigger AS $$
BEGIN
    UPDATE document.commitment SET
        code                    = NEW.code,
        name                    = NEW.name,
        order_type              = NEW.order_type,
        party_id                = NEW.party_id,
        party_type              = COALESCE(NEW.party_type, 'SUPPLIER'),
        parent_commitment_id    = NEW.parent_commitment_id,
        release_sequence_no     = NEW.release_sequence_no,
        requested_by            = NEW.requested_by,
        responsible_person_id   = NEW.responsible_person_id,
        approved_by             = NEW.approved_by,
        approved_at             = NEW.approved_at,
        workflow_request_id     = NEW.workflow_request_id,
        document_date           = NEW.document_date,
        effective_date          = NEW.effective_date,
        expiry_date             = NEW.expiry_date,
        currency_code           = NEW.currency_code,
        base_currency_code      = NEW.base_currency_code,
        exchange_rate           = NEW.exchange_rate,
        fx_rate_snapshot        = NEW.fx_rate_snapshot,
        fx_policy               = NEW.fx_policy,
        total_amount            = NEW.total_amount,
        scheduled_amount        = NEW.scheduled_amount,
        released_amount         = NEW.released_amount,
        fulfilled_amount        = NEW.fulfilled_amount,
        invoiced_amount         = NEW.invoiced_amount,
        paid_amount             = NEW.paid_amount,
        payment_term_id         = NEW.payment_term_id,
        budget_check_result     = NEW.budget_check_result,
        encumbrance_je_id       = NEW.encumbrance_je_id,
        renewal_terms           = NEW.renewal_terms,
        renewal_count           = NEW.renewal_count,
        renewed_from_id         = NEW.renewed_from_id,
        is_provisional          = NEW.is_provisional,
        draft_expires_at        = NEW.draft_expires_at,
        draft_started_at        = NEW.draft_started_at,
        draft_started_by        = NEW.draft_started_by,
        tags                    = NEW.tags,
        metadata                = NEW.metadata,
        status                  = NEW.status,
        status_changed_at       = NEW.status_changed_at,
        status_changed_by       = NEW.status_changed_by,
        updated_at              = now(),
        updated_by              = NEW.updated_by
      WHERE id = OLD.id
        AND commitment_type = 'purchase_order';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_purchase_order_view_update ON document.purchase_order;
CREATE TRIGGER trg_purchase_order_view_update
    INSTEAD OF UPDATE ON document.purchase_order
    FOR EACH ROW EXECUTE FUNCTION document.purchase_order_view_update();


CREATE OR REPLACE FUNCTION document.purchase_order_view_delete()
RETURNS trigger AS $$
BEGIN
    DELETE FROM document.commitment
     WHERE id = OLD.id
       AND commitment_type = 'purchase_order';
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_purchase_order_view_delete ON document.purchase_order;
CREATE TRIGGER trg_purchase_order_view_delete
    INSTEAD OF DELETE ON document.purchase_order
    FOR EACH ROW EXECUTE FUNCTION document.purchase_order_view_delete();

-- ============================================================================
-- document.v_commitment_line_pricing_summary
-- ----------------------------------------------------------------------------
-- Read projection for item-level pricing amounts. The commitment_line table owns
-- the base line math, while pricing_component owns discounts, charges, tax, and
-- withholding. Keep the list surface on this projection so Net/Tax/Total reflect
-- the current component waterfall without duplicating stored totals.
-- ============================================================================

CREATE OR REPLACE VIEW document.v_commitment_line_pricing_summary AS
WITH component_rollup AS (
    SELECT
        pc.tenant_id,
        pc.source_doc_id AS commitment_id,
        pc.source_line_id AS commitment_line_id,
        COALESCE(SUM(CASE WHEN pc.term_type = 'discount'    THEN pc.computed_amount ELSE 0 END), 0)::numeric(18,4) AS pricing_discount_amount,
        COALESCE(SUM(CASE WHEN pc.term_type = 'charge'      THEN pc.computed_amount ELSE 0 END), 0)::numeric(18,4) AS pricing_charge_amount,
        COALESCE(SUM(CASE WHEN pc.term_type = 'tax'         THEN pc.computed_amount ELSE 0 END), 0)::numeric(18,4) AS pricing_component_tax_amount,
        COALESCE(SUM(CASE WHEN pc.term_type = 'withholding' THEN pc.computed_amount ELSE 0 END), 0)::numeric(18,4) AS pricing_component_withholding_amount
    FROM document.pricing_component pc
    WHERE pc.source_doc_type = 'commitment_line'
      AND pc.source_line_id IS NOT NULL
      AND pc.superseded_by_id IS NULL
    GROUP BY pc.tenant_id, pc.source_doc_id, pc.source_line_id
)
SELECT
    cl.tenant_id,
    cl.commitment_id,
    cl.id AS commitment_line_id,
    cl.net_amount::numeric(18,4) AS pricing_base_amount,
    COALESCE(cr.pricing_discount_amount, 0)::numeric(18,4) AS pricing_discount_amount,
    COALESCE(cr.pricing_charge_amount, 0)::numeric(18,4) AS pricing_charge_amount,
    (cl.net_amount - COALESCE(cr.pricing_discount_amount, 0) + COALESCE(cr.pricing_charge_amount, 0))::numeric(18,4) AS pricing_net_amount,
    (CASE WHEN cr.commitment_line_id IS NULL THEN cl.tax_amount ELSE cr.pricing_component_tax_amount END)::numeric(18,4) AS pricing_tax_amount,
    (CASE WHEN cr.commitment_line_id IS NULL THEN cl.withholding_tax_amount ELSE cr.pricing_component_withholding_amount END)::numeric(18,4) AS pricing_withholding_amount,
    (
        cl.net_amount
        - COALESCE(cr.pricing_discount_amount, 0)
        + COALESCE(cr.pricing_charge_amount, 0)
        + CASE WHEN cr.commitment_line_id IS NULL THEN cl.tax_amount ELSE cr.pricing_component_tax_amount END
        - CASE WHEN cr.commitment_line_id IS NULL THEN cl.withholding_tax_amount ELSE cr.pricing_component_withholding_amount END
    )::numeric(18,4) AS pricing_total_amount
FROM document.commitment_line cl
LEFT JOIN component_rollup cr
       ON cr.tenant_id = cl.tenant_id
      AND cr.commitment_line_id = cl.id
      AND cr.commitment_id = cl.commitment_id;
