/* ============================================================================
   Seed: Document Defect Risk Rules for Close Orchestration
   Schema: fin.close_risk_rule

   Adds document_defect_detected risk rules that fire when the document
   registry has defects blocking period close (failed postings, approved
   but unposted documents, accrual reversal gaps, etc.).
   ============================================================================ */

DO $$
DECLARE
    v_tenant_id uuid;
BEGIN
    SELECT id INTO v_tenant_id FROM core.tenant WHERE code = 'demo' LIMIT 1;
    IF v_tenant_id IS NULL THEN
        RAISE NOTICE 'Demo tenant not found — skipping document defect risk rule seeding';
        RETURN;
    END IF;

    -- document_defect_detected: HIGH severity defects (failed, approved-not-posted)
    INSERT INTO fin.close_risk_rule (
        tenant_id, entity_code, rule_code, rule_name, description,
        rule_type, parameters, severity,
        escalation_role, cooldown_minutes, target_status,
        auto_resolve_when_clear, sort_order
    ) VALUES (
        v_tenant_id, 'ACME', 'DOC_DEFECT_HIGH', 'Document Registry Defects (High Severity)',
        'Fires when financial documents with high-severity defects (failed postings, approved but unposted) exist in the closing period.',
        'document_defect_detected',
        '{"min_severity": "HIGH", "min_defect_count": 1}'::jsonb,
        'critical',
        'CONTROLLER', 120, NULL,
        true, 95
    ) ON CONFLICT (tenant_id, entity_code, rule_code) DO NOTHING;

    -- document_defect_detected: ANY severity defects approaching hard close
    INSERT INTO fin.close_risk_rule (
        tenant_id, entity_code, rule_code, rule_name, description,
        rule_type, parameters, severity,
        cooldown_minutes, target_status,
        auto_resolve_when_clear, sort_order
    ) VALUES (
        v_tenant_id, 'ACME', 'DOC_DEFECT_ALL_HC', 'Document Registry Defects (Hard Close)',
        'Fires when any document defects exist while approaching hard close. All documents must be finalized before hard close.',
        'document_defect_detected',
        '{"min_severity": "LOW", "min_defect_count": 1}'::jsonb,
        'high',
        240, 'HARD_CLOSE',
        true, 96
    ) ON CONFLICT (tenant_id, entity_code, rule_code) DO NOTHING;

    RAISE NOTICE 'Seeded 2 document defect risk rules for ACME entity';
END $$;
