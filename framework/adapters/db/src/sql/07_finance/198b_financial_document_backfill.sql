/* ============================================================================
   Athyper v2.1 — Financial Document Registry: Backfill
   Schema: fin
   Dependencies: 198_financial_document_registry.sql

   One-time backfill of existing purchase invoices, payment entries, and
   manual journal entries into the financial document registry.
   Safe to re-run (uses ON CONFLICT DO NOTHING).
   ============================================================================ */

-- ============================================================================
-- Backfill: Purchase Invoices
-- ============================================================================
insert into fin.financial_document (
    tenant_id, doc_id, txn_id, doc_type, doc_no,
    entity_code, source_module, source_table, source_ref_id,
    status, source_status,
    doc_date, posting_date,
    currency_code, total_amount,
    counterparty_type, counterparty_id,
    je_id, posted_at, posted_by,
    created_by, created_at, updated_by, updated_at
)
select
    pi.tenant_id,
    pi.id,
    pi.txn_id,
    'PURCHASE_INVOICE',
    pi.invoice_number,
    pi.entity_code,
    'finance.accounting',
    'fin.purchase_invoice',
    pi.id,
    fin.map_canonical_status('PURCHASE_INVOICE', pi.status),
    pi.status,
    pi.invoice_date,
    pi.posting_date,
    pi.currency_code,
    pi.total_amount,
    'SUPPLIER',
    pi.supplier_id,
    pi.je_id,
    pi.posted_at,
    pi.posted_by,
    coalesce(pi.submitted_by, pi.approved_by),
    pi.created_at,
    coalesce(pi.approved_by, pi.submitted_by),
    pi.updated_at
from fin.purchase_invoice pi
on conflict (tenant_id, source_table, source_ref_id) do nothing;

-- ============================================================================
-- Backfill: Payment Entries
-- ============================================================================
insert into fin.financial_document (
    tenant_id, doc_id, txn_id, doc_type, doc_no,
    entity_code, source_module, source_table, source_ref_id,
    status, source_status,
    doc_date, posting_date,
    currency_code, total_amount,
    counterparty_type, counterparty_id,
    je_id, posted_at, posted_by,
    created_by, created_at, updated_by, updated_at
)
select
    pe.tenant_id,
    pe.id,
    pe.txn_id,
    'PAYMENT_ENTRY',
    pe.payment_number,
    pe.entity_code,
    'finance.payments',
    'fin.payment_entry',
    pe.id,
    fin.map_canonical_status('PAYMENT_ENTRY', pe.status),
    pe.status,
    pe.payment_date,
    pe.payment_date,
    pe.currency_code,
    pe.total_amount,
    'SUPPLIER',
    pe.supplier_id,
    pe.je_id,
    pe.posted_at,
    pe.posted_by,
    coalesce(pe.submitted_by, pe.approved_by),
    pe.created_at,
    coalesce(pe.approved_by, pe.submitted_by),
    pe.updated_at
from fin.payment_entry pe
on conflict (tenant_id, source_table, source_ref_id) do nothing;

-- ============================================================================
-- Backfill: Manual Journal Entries (standalone documents only)
-- A JE is "manual/standalone" when doc_id = id (self-referential).
--
-- Note: book_code is added to fin.journal_entry via ALTER TABLE in
-- 192_ledger_book.sql. We read it conditionally — if the column hasn't
-- been added yet the DO block handles the fallback gracefully.
-- ============================================================================
do $$
declare
    v_has_book_code boolean;
begin
    select exists (
        select 1 from information_schema.columns
        where table_schema = 'fin'
          and table_name = 'journal_entry'
          and column_name = 'book_code'
    ) into v_has_book_code;

    if v_has_book_code then
        execute $q$
            insert into fin.financial_document (
                tenant_id, doc_id, txn_id, doc_type, doc_no,
                entity_code, source_module, source_table, source_ref_id,
                status, source_status,
                doc_date, posting_date,
                currency_code, total_amount,
                counterparty_type,
                je_id, book_code, posted_at, posted_by,
                created_by, created_at, updated_at
            )
            select
                je.tenant_id, je.id, je.txn_id, 'JOURNAL_ENTRY', je.je_number,
                je.entity_code, 'finance.accounting', 'fin.journal_entry', je.id,
                fin.map_canonical_status('JOURNAL_ENTRY', je.status), je.status,
                je.posting_date, je.posting_date,
                je.currency_code, je.total_debit,
                'INTERNAL',
                je.id, je.book_code, je.posted_at, je.posted_by,
                je.posted_by, je.created_at, coalesce(je.posted_at, je.created_at)
            from fin.journal_entry je
            where je.doc_id = je.id or je.doc_type like 'MANUAL%'
            on conflict (tenant_id, source_table, source_ref_id) do nothing
        $q$;
    else
        execute $q$
            insert into fin.financial_document (
                tenant_id, doc_id, txn_id, doc_type, doc_no,
                entity_code, source_module, source_table, source_ref_id,
                status, source_status,
                doc_date, posting_date,
                currency_code, total_amount,
                counterparty_type,
                je_id, posted_at, posted_by,
                created_by, created_at, updated_at
            )
            select
                je.tenant_id, je.id, je.txn_id, 'JOURNAL_ENTRY', je.je_number,
                je.entity_code, 'finance.accounting', 'fin.journal_entry', je.id,
                fin.map_canonical_status('JOURNAL_ENTRY', je.status), je.status,
                je.posting_date, je.posting_date,
                je.currency_code, je.total_debit,
                'INTERNAL',
                je.id, je.posted_at, je.posted_by,
                je.posted_by, je.created_at, coalesce(je.posted_at, je.created_at)
            from fin.journal_entry je
            where je.doc_id = je.id or je.doc_type like 'MANUAL%'
            on conflict (tenant_id, source_table, source_ref_id) do nothing
        $q$;
    end if;
end
$$;
