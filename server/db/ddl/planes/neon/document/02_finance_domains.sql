-- Neon finance and procure-to-pay document vocabularies.

CREATE DOMAIN document.workflow_request_status_d AS text
    CHECK (VALUE IN ('pending','active','approved','rejected','escalated','cancelled'));
CREATE DOMAIN document.workflow_decision_d AS text
    CHECK (VALUE IN ('approve','reject','escalate','cancel'));
CREATE DOMAIN document.workflow_stage_mode_d AS text
    CHECK (VALUE IN ('serial','parallel'));
CREATE DOMAIN document.workflow_stage_status_d AS text
    CHECK (VALUE IN ('pending','active','completed','skipped','cancelled'));

CREATE DOMAIN document.commitment_type_d AS text
    CHECK (VALUE IN (
        'purchase_order','contract','lease','subscription','standing_order',
        'framework_agreement','grant_award','internal_order'
    ));
CREATE DOMAIN document.commitment_status_d AS text
    CHECK (VALUE IN (
        'draft','pending_approval','approved','active','suspended',
        'closed','cancelled','expired','rejected'
    ));
CREATE DOMAIN document.commitment_line_status_d AS text
    CHECK (VALUE IN ('open','closed','cancelled'));
CREATE DOMAIN document.procurement_type_d AS text
    CHECK (VALUE IN ('goods','services'));
CREATE DOMAIN document.commercial_line_type_d AS text
    CHECK (VALUE IN ('contract','catalog','marketplace','noncatalog'));
CREATE DOMAIN document.fx_policy_d AS text
    CHECK (VALUE IN ('spot_on_event','fixed_at_commitment','manual_contract_rate'));
CREATE DOMAIN document.budget_check_result_d AS text
    CHECK (VALUE IN ('passed','warned','override','blocked','exempt'));
CREATE DOMAIN document.release_allocation_kind_d AS text
    CHECK (VALUE IN ('release','reversal'));

CREATE DOMAIN document.distribution_basis_d AS text
    CHECK (VALUE IN ('percent','amount','quantity'));
CREATE DOMAIN document.distribution_amount_status_d AS text
    CHECK (VALUE IN ('provisional','final','posted'));
CREATE DOMAIN document.account_resolution_source_d AS text
    CHECK (VALUE IN ('pending','override','profile','fallback'));

CREATE DOMAIN document.purchase_invoice_source_d AS text
    CHECK (VALUE IN ('po_based','contract_based','non_po','one_time_supplier'));
CREATE DOMAIN document.purchase_invoice_type_d AS text
    CHECK (VALUE IN (
        'standard','credit_note','debit_note','advance',
        'retention_release','self_billed','final'
    ));
CREATE DOMAIN document.purchase_invoice_direction_d AS text
    CHECK (VALUE IN ('payable','credit'));
CREATE DOMAIN document.purchase_invoice_status_d AS text
    CHECK (VALUE IN (
        'proforma','draft','pending_approval','approved','posted',
        'on_hold','cancelled','rejected'
    ));
CREATE DOMAIN document.tax_mode_d AS text
    CHECK (VALUE IN ('exclusive','inclusive','out_of_scope'));
CREATE DOMAIN document.invoice_match_type_d AS text
    CHECK (VALUE IN ('three_way','two_way','no_match','evaluated_receipt'));
CREATE DOMAIN document.invoice_match_status_d AS text
    CHECK (VALUE IN ('unmatched','partially_matched','fully_matched','exception'));
CREATE DOMAIN document.invoice_match_result_d AS text
    CHECK (VALUE IN (
        'pending','matched','matched_with_tolerance',
        'exception','force_matched','rejected'
    ));
CREATE DOMAIN document.invoice_match_case_status_d AS text
    CHECK (VALUE IN ('pending','in_progress','completed','exception','resolved','cancelled'));

CREATE DOMAIN document.term_application_status_d AS text
    CHECK (VALUE IN ('applied','skipped','clamped','exhausted','not_yet_eligible','reversed'));
CREATE DOMAIN document.term_application_type_d AS text
    CHECK (VALUE IN (
        'advance','advance_recovery','retention',
        'retention_release','due_date','discount'
    ));
CREATE DOMAIN document.override_decision_d AS text
    CHECK (VALUE IN ('approve','reject','escalate'));

CREATE DOMAIN document.payment_type_d AS text
    CHECK (VALUE IN (
        'standard','advance','retention_release','partial',
        'final','down_payment','urgent','netting'
    ));
CREATE DOMAIN document.payment_direction_d AS text
    CHECK (VALUE IN ('outbound','inbound'));
CREATE DOMAIN document.payment_status_d AS text
    CHECK (VALUE IN (
        'draft','pending_approval','approved','posted',
        'transmitted','cleared','cancelled','rejected'
    ));
CREATE DOMAIN document.payment_allocation_kind_d AS text
    CHECK (VALUE IN ('allocation','reversal'));

CREATE DOMAIN document.journal_status_d AS text
    CHECK (VALUE IN ('draft','pending_approval','approved','posted','rejected','cancelled'));
CREATE DOMAIN document.journal_reference_kind_d AS text
    CHECK (VALUE IN (
        'source','settlement','matching','clearing',
        'capitalization','tax','budget','other'
    ));

