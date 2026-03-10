/* ============================================================================
   Athyper — Reclassify kind='fin' to broad kind types (ent, doc, ref)

   Finance entities previously used a module-specific kind='fin'.
   This migration reclassifies them to standard broad kinds:
     - Document entities (lifecycle-managed transactional docs) → 'doc'
     - Master data entities → 'ent'
     - Config/rule/reference entities → 'ref'

   Safe to re-run (idempotent).
   ============================================================================ */

DO $$
BEGIN

    -- ── Finance Documents → kind='doc' ──
    -- Lifecycle-managed transactional documents and their child lines
    UPDATE meta.entity SET kind = 'doc'
    WHERE kind = 'fin'
      AND name IN (
        'PurchaseInvoice', 'ManualJournalEntry', 'PaymentEntry', 'BankStatement',
        'CreditNote', 'DebitNote', 'AccrualDocument', 'ReclassDocument',
        'PurchaseInvoiceLine', 'PaymentAllocation',
        'CreditNoteLine', 'DebitNoteLine',
        'BankStatementLine'
      );

    -- ── Finance Config/Rules → kind='ref' ──
    -- Setup tables, rate tables, mapping rules
    UPDATE meta.entity SET kind = 'ref'
    WHERE kind = 'fin'
      AND name IN (
        'PolicyModule', 'SmartDefaultRule', 'IntercompanyAgreement',
        'FxRate', 'TaxRate', 'BillOfMaterials', 'Routing',
        'CommissionAssignment', 'SpendCategoryCommodityMap',
        'CategoryIntentRule', 'DocumentSequence'
      );

    -- ── All remaining kind='fin' → kind='ent' ──
    -- Master data and immutable ledger/transaction entities
    UPDATE meta.entity SET kind = 'ent'
    WHERE kind = 'fin';

    RAISE NOTICE 'Reclassified all kind=fin entities to broad kinds (ent/doc/ref). Remaining fin: %',
        (SELECT count(*) FROM meta.entity WHERE kind = 'fin');

END $$;
