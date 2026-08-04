CREATE OR REPLACE VIEW document.v_party_advance_balance
WITH (security_invoker = true, security_barrier = true) AS
WITH invoice_balance AS (
    SELECT
        tenant_id,
        company_code_id,
        supplier_id,
        currency_code,
        sum(payable_amount) FILTER (WHERE invoice_type='advance') AS advance_issued_amount,
        sum(retention_amount) AS retention_withheld_amount,
        count(*) FILTER (WHERE invoice_type='advance')::bigint AS advance_invoice_count,
        count(*) FILTER (WHERE retention_amount>0)::bigint AS retention_invoice_count
    FROM document.purchase_invoice
    WHERE status='posted' AND supplier_id IS NOT NULL
    GROUP BY tenant_id,company_code_id,supplier_id,currency_code
), settlement_balance AS (
    SELECT
        pi.tenant_id,
        pi.company_code_id,
        pi.supplier_id,
        pea.currency_code,
        sum(CASE WHEN pea.allocation_kind='reversal' THEN -pea.advance_recovery_amount ELSE pea.advance_recovery_amount END)
            AS advance_recovered_amount,
        sum(CASE WHEN pea.allocation_kind='reversal' THEN -pea.retention_amount ELSE pea.retention_amount END)
            AS retention_settled_amount
    FROM document.payment_entry_allocation pea
    JOIN document.payment_entry pe
      ON pe.tenant_id=pea.tenant_id AND pe.id=pea.payment_entry_id
    JOIN document.purchase_invoice pi
      ON pi.tenant_id=pea.tenant_id AND pi.id=pea.purchase_invoice_id
    WHERE pe.status IN ('posted','transmitted','cleared')
    GROUP BY pi.tenant_id,pi.company_code_id,pi.supplier_id,pea.currency_code
)
SELECT
    i.tenant_id,
    i.company_code_id,
    i.supplier_id,
    i.currency_code,
    coalesce(i.advance_issued_amount,0) AS advance_issued_amount,
    coalesce(s.advance_recovered_amount,0) AS advance_recovered_amount,
    coalesce(i.advance_issued_amount,0)-coalesce(s.advance_recovered_amount,0) AS advance_balance,
    coalesce(i.retention_withheld_amount,0) AS retention_withheld_amount,
    coalesce(s.retention_settled_amount,0) AS retention_settled_amount,
    coalesce(i.retention_withheld_amount,0)-coalesce(s.retention_settled_amount,0) AS retention_balance,
    i.advance_invoice_count,
    i.retention_invoice_count
FROM invoice_balance i
LEFT JOIN settlement_balance s
  ON s.tenant_id=i.tenant_id
 AND s.company_code_id=i.company_code_id
 AND s.supplier_id=i.supplier_id
 AND s.currency_code=i.currency_code;

COMMENT ON VIEW document.v_party_advance_balance IS
  'Tenant-safe supplier advance and retention projection derived from posted invoices and cash-effective payment allocations. Replaces mutable document.party_advance_balance.';
