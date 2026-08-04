-- Neon accounting determination protocol. Stable profile identities live in
-- master.accounting_profile; these domains govern effective control policy.

CREATE DOMAIN control.accounting_policy_status_d AS text
    CHECK (VALUE IN ('draft', 'scheduled', 'active', 'expired', 'retired'));

CREATE DOMAIN control.accounting_journal_action_d AS text
    CHECK (VALUE IN ('post', 'reverse', 'none'));

CREATE DOMAIN control.accounting_posting_side_d AS text
    CHECK (VALUE IN ('debit', 'credit'));

CREATE DOMAIN control.accounting_amount_source_d AS text
    CHECK (VALUE IN (
        'line_net', 'document_net', 'document_gross', 'tax_amount',
        'withholding_amount', 'discount_amount', 'retention_amount',
        'advance_amount', 'advance_recovery', 'net_payable', 'remainder',
        'pricing_component'
    ));

CREATE DOMAIN control.cross_book_posting_mode_d AS text
    CHECK (VALUE IN ('mirror', 'translate'));

CREATE DOMAIN control.cross_book_recognition_d AS text
    CHECK (VALUE IN ('simultaneous', 'deferred'));
