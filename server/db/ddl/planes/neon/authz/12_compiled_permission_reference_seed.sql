-- seed-contract-version: 1
-- seed-pack: neon.compiled-legacy-permissions
-- seed-pack-version: 1.0.0
-- seed-dataset: authz.compiled-permission-catalog
-- seed-data-class: production_reference
-- seed-provenance: {"source":"Wave 4 legacy permission compiler","publisher":"Athyper","source_version":"wave4-platform-catalog.v1","retrieved_at":"2026-08-03","license":"internal"}
-- seed-plane: neon
-- seed-tenant-scope: none
-- seed-natural-key: authz.permission(canonical_code)
-- seed-cross-file-ids: true
-- seed-id-strategy: deterministic-uuid:athyper-wave4-neon-permission-v1
-- seed-expected-row-count: exact:126
-- seed-assertions: expected-count,orphan,uniqueness,semantic
-- seed-demo-data: false
-- seed-assertion: expected-count
-- seed-assertion: orphan
-- seed-assertion: uniqueness
-- seed-assertion: semantic

DO $guard$ BEGIN IF current_setting('app.database_plane', true) <> 'neon' THEN
 RAISE EXCEPTION 'compiled permission pack requires app.database_plane=neon'; END IF; END $guard$;

INSERT INTO authz.permission (id,canonical_code,permission_kind,module_id,risk_tier,requires_mfa,
 metadata,status,created_by)
SELECT md5('neon:permission:' || s.canonical_code)::uuid,s.canonical_code,s.permission_kind::authz.permission_kind_d,
 m.id,s.risk_tier::authz.risk_tier_d,s.requires_mfa,
 jsonb_build_object('_seed',jsonb_build_object('pack','neon.compiled-legacy-permissions','version','1.0.0'),'name',s.name),
 'draft','00000000-0000-0000-0000-000000000000'::uuid
FROM (VALUES
    ('legacy.action.read','fnd','entity_operation','low',false,'Read'),
    ('legacy.action.create','fnd','entity_operation','low',false,'Create'),
    ('legacy.action.update','fnd','entity_operation','low',false,'Update'),
    ('legacy.action.edit','fnd','entity_operation','low',false,'Edit'),
    ('legacy.action.replace','fnd','entity_operation','medium',false,'Replace with New Version'),
    ('legacy.action.exit','fnd','entity_operation','low',false,'Exit'),
    ('legacy.action.delete_draft','fnd','entity_operation','low',false,'Delete Draft'),
    ('legacy.action.delete','fnd','entity_operation','high',false,'Delete'),
    ('legacy.action.add_line','fnd','entity_operation','low',false,'Add Line'),
    ('legacy.action.edit_line','fnd','entity_operation','low',false,'Edit Line'),
    ('legacy.action.close_line','fnd','entity_operation','medium',false,'Close Line'),
    ('legacy.action.cancel_line','fnd','entity_operation','medium',false,'Cancel Line'),
    ('legacy.action.submit','fnd','capability','low',false,'Submit'),
    ('legacy.action.amend','fnd','capability','low',false,'Amend'),
    ('legacy.action.revise','fnd','capability','medium',false,'Revise Document'),
    ('legacy.action.cancel','fnd','capability','medium',false,'Cancel'),
    ('legacy.action.close','fnd','capability','medium',false,'Close'),
    ('legacy.action.reopen','fnd','capability','medium',false,'Reopen'),
    ('legacy.action.withdraw','fnd','capability','low',false,'Withdraw'),
    ('legacy.action.escalate','fnd','capability','low',false,'Escalate'),
    ('legacy.action.approve','fnd','capability','medium',false,'Approve'),
    ('legacy.action.deny','fnd','capability','medium',false,'Deny'),
    ('legacy.action.void','fnd','capability','high',false,'Void'),
    ('legacy.action.return','fnd','capability','low',false,'Return Document for Revision'),
    ('legacy.action.request_info','fnd','capability','low',false,'Request More Information'),
    ('legacy.action.post','fnd','capability','high',false,'Post'),
    ('legacy.action.reverse','fnd','capability','critical',true,'Reverse'),
    ('legacy.action.reconcile','fnd','capability','high',false,'Reconcile'),
    ('legacy.action.transmit','fnd','capability','high',false,'Transmit Payment'),
    ('legacy.action.clear','fnd','capability','high',false,'Clear Payment'),
    ('supplier.tax.submit','fnd','capability','low',false,'Submit Tax Profile'),
    ('supplier.tax.verify','fnd','capability','medium',false,'Verify Tax Profile'),
    ('supplier.tax.restricted','fnd','capability','high',false,'Restricted Tax Access'),
    ('supplier.banking.submit','fnd','capability','medium',false,'Submit Bank Details'),
    ('supplier.banking.verify','fnd','capability','high',false,'Verify Bank Account'),
    ('supplier.banking.admin','fnd','capability','high',false,'Administer Banking'),
    ('legacy.ap.override_tax_mode','fnd','capability','medium',false,'Override Invoice Tax Mode'),
    ('legacy.ap.promote_proforma','fnd','capability','medium',false,'Promote Proforma Invoice to Draft'),
    ('legacy.action.copy','fnd','capability','low',false,'Copy'),
    ('legacy.action.merge','fnd','capability','critical',true,'Merge'),
    ('legacy.action.report','fnd','capability','low',false,'Report'),
    ('legacy.action.print','fnd','capability','low',false,'Print'),
    ('legacy.action.import','fnd','capability','medium',true,'Import'),
    ('legacy.action.export','fnd','capability','low',false,'Export'),
    ('legacy.action.view_je','fnd','capability','low',false,'View Journal Entry'),
    ('legacy.action.bulk_import','fnd','capability','high',true,'Bulk Import'),
    ('legacy.action.bulk_export','fnd','capability','high',true,'Bulk Export'),
    ('legacy.action.bulk_update','fnd','capability','critical',true,'Bulk Update'),
    ('legacy.action.bulk_delete','fnd','capability','critical',true,'Bulk Delete'),
    ('legacy.action.delegate','fnd','system_action','medium',false,'Delegate'),
    ('legacy.action.share_read','fnd','system_action','low',false,'Share Read-Only'),
    ('legacy.action.share_edit','fnd','system_action','medium',false,'Share Editable'),
    ('legacy.action.add_comment','fnd','capability','low',false,'Add Comment'),
    ('legacy.action.add_attachment','fnd','capability','low',false,'Add Attachment'),
    ('legacy.attachment.read','fnd','capability','low',false,'Read Attachments'),
    ('legacy.attachment.create','fnd','capability','low',false,'Create Attachments'),
    ('legacy.attachment.update','fnd','capability','medium',false,'Update Attachments'),
    ('legacy.attachment.delete','fnd','capability','high',false,'Delete Attachments'),
    ('legacy.attachment.reindex','fnd','capability','high',true,'Reindex Attachment Content'),
    ('legacy.action.del_others_comment','fnd','capability','medium',false,'Delete Others Comment'),
    ('legacy.action.del_others_attach','fnd','capability','medium',false,'Delete Others Attachment'),
    ('legacy.action.follow','fnd','capability','low',false,'Follow'),
    ('legacy.action.tag','fnd','capability','low',false,'Tag'),
    ('records.lock.force_release','fnd','capability','high',false,'Force Release Record Lock'),
    ('legacy.action.feature_diagnostic','fnd','capability','critical',false,'Self Diagnostic Tool'),
    ('legacy.action.feature_theme','fnd','capability','low',false,'Theme Change'),
    ('legacy.action.feature_view','fnd','capability','low',false,'View Access Features'),
    ('legacy.action.feature_edit','fnd','capability','medium',false,'Create/Edit Features'),
    ('supplier.governance.write','fnd','capability','high',false,'Write Governance Record'),
    ('supplier.qualification.admin','fnd','capability','critical',false,'Administer Qualification'),
    ('legacy.finance_setup.view','fnd','capability','low',false,'View Finance Setup'),
    ('legacy.finance_setup.configure','fnd','capability','high',false,'Configure Finance Setup'),
    ('legacy.finance_setup.advanced_configure','fnd','capability','high',false,'Advanced Finance Setup'),
    ('address_contact.company_code.manage','fnd','capability','medium',false,'Manage Company Addresses and Contacts'),
    ('address_contact.legal_entity.manage','fnd','capability','high',false,'Manage Legal Entity Addresses and Contacts'),
    ('address_contact.tenant.manage','fnd','capability','high',false,'Manage Tenant Addresses and Contacts'),
    ('ai.agent.use','fnd','capability','medium',true,'Use Atlas Agent'),
    ('ai.agent.provider_diagnostics','fnd','capability','high',true,'Use Atlas Provider Diagnostics'),
    ('ai.agent.feedback.submit','fnd','capability','low',false,'Submit Atlas Agent Feedback'),
    ('ai.agent.history.read','fnd','capability','medium',true,'Read Own Atlas History'),
    ('ai.agent.history.manage','fnd','capability','medium',true,'Manage Own Atlas History'),
    ('ai.agent.history.delete','fnd','capability','high',true,'Delete Own Atlas History'),
    ('ai.agent.history.export','fnd','capability','high',true,'Export Own Atlas History'),
    ('ai.agent.tools.read','fnd','capability','medium',true,'Use Read-Only Atlas Tools'),
    ('ai.agent.admin.support_session','fnd','capability','high',true,'Start Atlas Support Session'),
    ('legacy.ai.use_extraction','fnd','capability','medium',true,'Use AI Extraction'),
    ('legacy.ai.review_ai_output','fnd','capability','low',false,'Review AI Output'),
    ('legacy.ai.calibrate_thresholds','fnd','capability','high',true,'Calibrate AI Thresholds'),
    ('legacy.action.convert','fnd','capability','low',false,'Convert'),
    ('legacy.action.confirm','fnd','capability','low',false,'Confirm'),
    ('legacy.action.propose_changes','fnd','capability','low',false,'Propose Changes'),
    ('legacy.action.reject','fnd','capability','medium',false,'Reject'),
    ('legacy.action.accept_changes','fnd','capability','medium',false,'Accept Changes'),
    ('legacy.action.reject_changes','fnd','capability','medium',false,'Reject Changes'),
    ('legacy.action.dispatch','fnd','capability','low',false,'Dispatch'),
    ('legacy.action.mark_arrived','fnd','capability','low',false,'Mark Arrived'),
    ('legacy.action.receipt','fnd','capability','low',false,'Open Receipt'),
    ('legacy.action.submit_for_acceptance','fnd','capability','low',false,'Submit for Acceptance'),
    ('legacy.action.accept','fnd','capability','low',false,'Accept'),
    ('legacy.action.reject_acceptance','fnd','capability','low',false,'Reject Acceptance'),
    ('legacy.pr.approve','fnd','capability','medium',false,'Approve Requisition'),
    ('legacy.pr.convert','fnd','capability','medium',false,'Convert Requisition to PO'),
    ('legacy.po.approve','fnd','capability','medium',false,'Approve Purchase Order'),
    ('legacy.po.place_order','fnd','capability','medium',false,'Place Order with Supplier'),
    ('legacy.po.retry_send','fnd','capability','low',false,'Retry Send Order'),
    ('legacy.po.short_close','fnd','capability','high',false,'Short-Close Open PO'),
    ('legacy.po.hold','fnd','capability','high',false,'Place Purchase Order on Hold'),
    ('legacy.po.release_hold','fnd','capability','high',false,'Release Purchase Order Hold'),
    ('legacy.po.expire','fnd','capability','high',false,'Expire Purchase Order'),
    ('legacy.poc.accept','fnd','capability','medium',false,'Accept PO Confirmation'),
    ('legacy.poc.dispute','fnd','capability','medium',false,'Dispute PO Confirmation'),
    ('legacy.dn.mark_arrived','fnd','capability','low',false,'Mark Delivery Note Arrived'),
    ('legacy.receipt.approve','fnd','capability','medium',false,'Approve Receipt'),
    ('legacy.receipt.post','fnd','capability','high',false,'Post Receipt'),
    ('legacy.receipt.reverse','fnd','capability','critical',true,'Reverse Posted Receipt'),
    ('legacy.receipt.quality_hold','fnd','capability','medium',false,'Place Receipt on Quality Hold'),
    ('legacy.service_sheet.approve','fnd','capability','medium',false,'Approve Service Sheet'),
    ('legacy.service_sheet.post','fnd','capability','high',false,'Post Service Sheet'),
    ('legacy.service_sheet.reverse','fnd','capability','critical',true,'Reverse Posted Service Sheet'),
    ('legacy.pi.approve','fnd','capability','medium',false,'Approve Purchase Invoice'),
    ('legacy.pi.post','fnd','capability','high',false,'Post Purchase Invoice'),
    ('legacy.pi.reverse','fnd','capability','critical',true,'Reverse Posted Invoice'),
    ('legacy.pi.match_override','fnd','capability','high',false,'Override Three-Way Match Exception'),
    ('legacy.pi.snapshot_restore','fnd','capability','critical',false,'Restore Invoice From Snapshot'),
    ('legacy.pi.discard_session','fnd','capability','medium',false,'Legacy Revert To Baseline Alias'),
    ('legacy.pi.revert_to_baseline','fnd','capability','high',false,'Revert Invoice To Baseline')
) AS s(canonical_code,module_code,permission_kind,risk_tier,requires_mfa,name)
JOIN control.module m ON m.code=s.module_code
ON CONFLICT (canonical_code) DO UPDATE SET permission_kind=excluded.permission_kind,
 module_id=excluded.module_id,risk_tier=excluded.risk_tier,requires_mfa=excluded.requires_mfa,
 metadata=excluded.metadata,status='suspended',status_changed_at=now(),status_changed_by=excluded.created_by,
 updated_at=now(),updated_by=excluded.created_by
WHERE (authz.permission.permission_kind,authz.permission.module_id,
 authz.permission.risk_tier,authz.permission.requires_mfa,authz.permission.metadata,authz.permission.status)
 IS DISTINCT FROM (excluded.permission_kind,excluded.module_id,excluded.risk_tier,
 excluded.requires_mfa,excluded.metadata,'published'::authz.catalog_status_d);

UPDATE authz.permission
SET status='published',status_changed_at=now(),status_changed_by='00000000-0000-0000-0000-000000000000'::uuid,
    updated_at=now(),updated_by='00000000-0000-0000-0000-000000000000'::uuid
WHERE metadata->'_seed'->>'pack' = 'neon.compiled-legacy-permissions'
  AND status IN ('draft','suspended');

DO $assertions$ BEGIN
 IF (SELECT count(*) FROM authz.permission WHERE metadata->'_seed'->>'pack' = 'neon.compiled-legacy-permissions' AND status='published') <> 126 THEN
   RAISE EXCEPTION 'neon compiled permission count mismatch'; END IF;
 IF EXISTS (SELECT 1 FROM authz.permission p LEFT JOIN control.module m ON m.id=p.module_id WHERE p.metadata->'_seed'->>'pack' = 'neon.compiled-legacy-permissions' AND m.id IS NULL) THEN
   RAISE EXCEPTION 'neon compiled permission module orphan'; END IF;
END $assertions$;
