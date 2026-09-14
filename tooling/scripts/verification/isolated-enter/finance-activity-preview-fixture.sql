-- Synthetic draft journals for rollback-only engineering qualification.
-- This is not a posting workflow or an authorization grant.
INSERT INTO master.gl_account(id,tenant_id,chart_of_account_id,code,name,account_class,normal_balance,created_by)
VALUES('b19c9b40-398c-4b73-a5c4-e2d13f541501','44444444-4444-4444-8444-444444444444','b5a46d17-ae45-53f9-b51b-caf8dc481843','BP-PREVIEW-ONLY','Synthetic rollback-only BP journal fixture','asset','debit','cca94907-7519-5871-8e3c-6b11aa545c93');
INSERT INTO document.journal_entry(id,tenant_id,company_code_id,ledger_book_id,fiscal_period_id,journal_number,document_date,posting_date,source_entity_type,transaction_currency_code,base_currency_code,idempotency_key,created_by,total_debit,total_credit,line_count)
SELECT id::uuid,'44444444-4444-4444-8444-444444444444','793b6cb3-3c61-57c0-9562-2cbc288bd4cf','e3bd4294-5a65-55b8-a26d-88e88578d69b','22e59561-dafc-5e0d-99b2-b96146dc5404',code,business_date::date,business_date::date,'qualification.bp_journal','GBP','GBP',code,'cca94907-7519-5871-8e3c-6b11aa545c93',10,10,2
FROM (VALUES
('b19c9b40-398c-4b73-a5c4-e2d13f541511','BP-PREVIEW-MATCH','2026-09-12'),
('b19c9b40-398c-4b73-a5c4-e2d13f541512','BP-PREVIEW-NO-BP','2026-09-12'),
('b19c9b40-398c-4b73-a5c4-e2d13f541513','BP-PREVIEW-FUTURE','2026-09-13')) v(id,code,business_date);
INSERT INTO document.journal_line(tenant_id,journal_entry_id,line_no,gl_account_id,transaction_currency_code,transaction_debit,transaction_credit,base_currency_code,base_debit,base_credit,business_partner_id,created_by)
SELECT '44444444-4444-4444-8444-444444444444',j.id,n,'b19c9b40-398c-4b73-a5c4-e2d13f541501','GBP',CASE WHEN n=1 THEN 10 ELSE 0 END,CASE WHEN n=2 THEN 10 ELSE 0 END,'GBP',CASE WHEN n=1 THEN 10 ELSE 0 END,CASE WHEN n=2 THEN 10 ELSE 0 END,CASE WHEN j.journal_number='BP-PREVIEW-NO-BP' THEN NULL ELSE '01a092d1-8242-7948-9ce9-6f19c38c4b27'::uuid END,'cca94907-7519-5871-8e3c-6b11aa545c93'
FROM document.journal_entry j CROSS JOIN generate_series(1,2) n WHERE j.id IN ('b19c9b40-398c-4b73-a5c4-e2d13f541511','b19c9b40-398c-4b73-a5c4-e2d13f541512','b19c9b40-398c-4b73-a5c4-e2d13f541513');
