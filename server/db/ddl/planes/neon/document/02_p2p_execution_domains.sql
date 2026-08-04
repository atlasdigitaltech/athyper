-- Neon procure-to-pay authoring, supplier evidence, and fulfillment vocabulary.

CREATE DOMAIN document.requisition_type_d AS text
    CHECK (VALUE IN ('standard','urgent','blanket','framework_call_off','capex'));
CREATE DOMAIN document.requisition_priority_d AS text
    CHECK (VALUE IN ('low','normal','high','urgent'));
CREATE DOMAIN document.requisition_status_d AS text
    CHECK (VALUE IN ('draft','pending_approval','approved','rejected','partially_converted','fully_converted','closed','cancelled'));
CREATE DOMAIN document.requisition_line_status_d AS text
    CHECK (VALUE IN ('open','partially_converted','converted','cancelled'));

CREATE DOMAIN document.confirmation_type_d AS text
    CHECK (VALUE IN ('FULL_CONFIRM','PARTIAL_CONFIRM','CHANGE_PROPOSAL','REJECTION'));
CREATE DOMAIN document.confirmation_status_d AS text
    CHECK (VALUE IN ('received','confirmed','changes_proposed','changes_accepted','changes_rejected','rejected','cancelled'));
CREATE DOMAIN document.confirmation_line_status_d AS text
    CHECK (VALUE IN ('confirmed','changed','rejected','partial'));

CREATE DOMAIN document.delivery_note_status_d AS text
    CHECK (VALUE IN ('draft','in_transit','arrived','partially_receipted','fully_receipted','returned','cancelled'));
CREATE DOMAIN document.inspection_status_d AS text
    CHECK (VALUE IN ('pending','in_progress','passed','partially_accepted','failed','waived'));

CREATE DOMAIN document.receipt_status_d AS text
    CHECK (VALUE IN ('draft','pending_approval','approved','posted','reversed','cancelled','rejected'));
CREATE DOMAIN document.service_sheet_status_d AS text
    CHECK (VALUE IN ('draft','pending_acceptance','accepted','pending_approval','approved','posted','reversed','cancelled','rejected'));
