-- ============================================================================
-- document/07_views.sql
-- Concept: Document Views - read projections over physical tables
-- Depends on: 01c_tables_commitment.sql (commitment + commitment_procurement)
-- ============================================================================

-- ============================================================================
-- document.purchase_order
-- ----------------------------------------------------------------------------
-- Read-projection view over commitment + commitment_procurement (1:1).
-- Filters to PO-type commitments: PURCHASE_ORDER and BLANKET_PO.
--
-- po_status projects commitment.status to PO-facing vocabulary:
--   active              -> sent_to_supplier
--   partially_fulfilled -> partially_received
--   fully_fulfilled     -> fully_received
--   expired             -> closed
--   suspended           -> on_hold       (reversible operational hold)
--   (draft | pending_approval | approved | closed | cancelled pass through)
--
-- Hold signal for the orchestrator is po_status = 'on_hold' (NOT a boolean
-- column). commitment does not carry is_on_hold/hold_reason columns; that
-- pattern exists only on purchase_invoice.
--
-- Write operations route through PurchaseOrderFacade, which translates
-- PO-facing status values back to physical commitment status and writes to
-- both commitment and commitment_procurement tables.
-- ============================================================================

CREATE OR REPLACE VIEW document.purchase_order AS
SELECT
    c.id,
    c.tenant_id,
    c.company_code_id,

    c.commitment_number         AS po_number,

    CASE c.commitment_type
        WHEN 'PURCHASE_ORDER' THEN 'standard'
        WHEN 'BLANKET_PO'     THEN 'blanket'
    END                         AS po_type,
    c.commitment_type           AS commitment_type_raw,

    -- PO-facing projected status
    CASE c.status
        WHEN 'active'              THEN 'sent_to_supplier'
        WHEN 'partially_fulfilled' THEN 'partially_received'
        WHEN 'fully_fulfilled'     THEN 'fully_received'
        WHEN 'expired'             THEN 'closed'
        WHEN 'suspended'           THEN 'on_hold'
        ELSE c.status
    END                         AS po_status,
    c.status                    AS commitment_status_raw,

    c.description,

    -- Dates
    c.document_date,
    c.effective_date,
    c.expiry_date,

    -- Amounts
    c.currency_code,
    c.base_currency_code,
    c.exchange_rate,
    c.total_amount,
    c.scheduled_amount,
    c.fulfilled_amount,
    c.released_amount,
    c.outstanding_amount,

    -- Retention / Advance
    c.retention_pct,
    c.retention_amount,
    c.advance_pct,
    c.advance_amount,

    -- Budget / Encumbrance
    c.budget_allocation_id,
    c.intent_id,
    c.budget_check_result,
    c.encumbrance_type,
    c.is_encumbered,
    c.encumbrance_je_id,

    -- Fiscal
    c.fiscal_year,
    c.period_number,

    -- Dimensions
    c.cost_center_id,
    c.profit_center_id,
    c.project_id,
    c.site_id,
    c.dimension_set_id,

    -- Payment terms (selected on commitment)
    c.payment_term_id           AS commitment_payment_term_id,
    c.payment_term_version      AS commitment_payment_term_version,
    c.payment_term_snapshot     AS commitment_payment_term_snapshot,

    -- Renewal / Amendment
    c.is_auto_renew,
    c.renewal_count,
    c.renewed_from_id,
    c.amendment_count,
    c.original_amount,
    c.variance_to_original,

    -- Workflow
    c.workflow_request_id,
    c.approved_at,
    c.approved_by,
    c.requested_by,

    -- Close / Cancellation
    c.closed_at,
    c.closed_by,
    c.close_reason,

    -- Tags / Metadata
    c.tags,
    c.metadata,

    -- Lifecycle
    c.is_active,
    c.status_changed_at,
    c.status_changed_by,

    -- Audit
    c.created_at,
    c.created_by,
    c.updated_at,
    c.updated_by,

    -- Procurement extension (1:1 join)
    cp.id                       AS procurement_ext_id,
    cp.supplier_id,
    cp.supplier_contact_name,
    cp.buyer_id,
    cp.requisition_id,
    cp.parent_contract_id,
    cp.is_release_order,
    cp.release_sequence_no,
    cp.incoterms_code,
    cp.incoterms_location,
    cp.freight_terms,
    cp.delivery_address_id,
    cp.billing_address_id,
    cp.payment_term_id,
    cp.payment_method_id,
    cp.tax_treatment,
    cp.withholding_tax_applicable,
    cp.gr_based_iv,
    cp.service_based_iv,
    cp.evaluated_receipt,
    cp.line_count,
    cp.total_received_amount,
    cp.total_invoiced_amount,
    cp.total_paid_amount

FROM document.commitment c
JOIN document.commitment_procurement cp ON cp.commitment_id = c.id
WHERE c.commitment_type IN ('PURCHASE_ORDER', 'BLANKET_PO');

COMMENT ON VIEW document.purchase_order IS
    'Read-projection over commitment + commitment_procurement. '
    'Filters to PURCHASE_ORDER and BLANKET_PO commitment types. '
    'po_status projects physical commitment.status to PO vocabulary '
    '(suspended -> on_hold reversible, expired -> closed terminal). '
    'Write operations route through PurchaseOrderFacade.';
