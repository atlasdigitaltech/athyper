-- NULL doc_class in ai_action_policy / ai_confidence_threshold = catch-all (applies to any class).

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('purchase_invoice',
     'Purchase Invoice',
     'control.ai_doc_class',
     'AP supplier invoice. Maps to document.purchase_invoice. '
     'Financial posting document — all AI actions capped at assist.',
     10),

    ('purchase_quotation',
     'Purchase Quotation',
     'control.ai_doc_class',
     'Supplier price quotation for procurement decision-making. '
     'Non-posting; extraction used for PR/PO pre-fill.',
     20),

    ('purchase_requisition',
     'Purchase Requisition',
     'control.ai_doc_class',
     'Internal procurement request. Maps to document.purchase_requisition. '
     'Non-posting; assists spend-category classification.',
     30),

    ('expense_receipt',
     'Expense Receipt',
     'control.ai_doc_class',
     'Employee expense receipts (fuel, meals, travel). '
     'Financial posting document — extraction capped at assist.',
     40),

    ('supplier_onboarding_doc',
     'Supplier Onboarding Document',
     'control.ai_doc_class',
     'Documents submitted during supplier onboarding (registration, trade license, etc.). '
     'Non-posting; feeds master.supplier record pre-fill.',
     50),

    ('journal_narration',
     'Journal Narration',
     'control.ai_doc_class',
     'Free-text journal entry narrations. Used for entity extraction and '
     'account suggestion. Journal posting is capped at assist.',
     60),

    ('regulatory_filing',
     'Regulatory Filing',
     'control.ai_doc_class',
     'Government-submitted documents (VAT returns, customs declarations). '
     'High-risk; all actions capped at assist regardless of policy.',
     70),

    ('master_data_record',
     'Master Data Record',
     'control.ai_doc_class',
     'Structured master data imports (COA, cost-centre hierarchy, customer list). '
     'Used for autofill and match_record actions during bulk import.',
     80)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
