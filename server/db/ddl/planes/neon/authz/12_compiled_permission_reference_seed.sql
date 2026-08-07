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

INSERT INTO authz.permission (id,canonical_code,permission_kind,resource_code,operation_code,module_id,risk_tier,requires_mfa,
 provenance_ref,metadata,status,created_by)
SELECT md5('neon:permission:' || s.canonical_code)::uuid,s.canonical_code,s.permission_kind::authz.permission_kind_d,
 s.resource_code,s.operation_code,m.id,s.risk_tier::authz.risk_tier_d,s.requires_mfa,
 'wave4:legacy-permission:' || s.legacy_code,
 jsonb_build_object('_seed',jsonb_build_object('pack','neon.compiled-legacy-permissions','version','1.0.0'),'name',s.name,'legacy_scope_type',s.scope_type),
 'draft','00000000-0000-0000-0000-000000000000'::uuid
FROM (VALUES
    ('legacy.action.read','legacy.action','read','fnd','entity_operation','low',false,'Read','read','record'),
    ('legacy.action.create','legacy.action','create','fnd','entity_operation','low',false,'Create','create','record'),
    ('legacy.action.update','legacy.action','update','fnd','entity_operation','low',false,'Update','update','record'),
    ('legacy.action.edit','legacy.action','edit','fnd','entity_operation','low',false,'Edit','edit','record'),
    ('legacy.action.replace','legacy.action','replace','fnd','entity_operation','medium',false,'Replace with New Version','replace','record'),
    ('legacy.action.exit','legacy.action','exit','fnd','entity_operation','low',false,'Exit','exit','record'),
    ('legacy.action.delete_draft','legacy.action','delete_draft','fnd','entity_operation','low',false,'Delete Draft','delete_draft','record'),
    ('legacy.action.delete','legacy.action','delete','fnd','entity_operation','high',false,'Delete','delete','record'),
    ('legacy.action.add_line','legacy.action','add_line','fnd','entity_operation','low',false,'Add Line','add_line','record'),
    ('legacy.action.edit_line','legacy.action','edit_line','fnd','entity_operation','low',false,'Edit Line','edit_line','record'),
    ('legacy.action.close_line','legacy.action','close_line','fnd','entity_operation','medium',false,'Close Line','close_line','record'),
    ('legacy.action.cancel_line','legacy.action','cancel_line','fnd','entity_operation','medium',false,'Cancel Line','cancel_line','record'),
    ('legacy.action.submit','legacy.action','submit','fnd','capability','low',false,'Submit','submit','record'),
    ('legacy.action.amend','legacy.action','amend','fnd','capability','low',false,'Amend','amend','record'),
    ('legacy.action.revise','legacy.action','revise','fnd','capability','medium',false,'Revise Document','revise','record'),
    ('legacy.action.cancel','legacy.action','cancel','fnd','capability','medium',false,'Cancel','cancel','record'),
    ('legacy.action.close','legacy.action','close','fnd','capability','medium',false,'Close','close','record'),
    ('legacy.action.reopen','legacy.action','reopen','fnd','capability','medium',false,'Reopen','reopen','record'),
    ('legacy.action.withdraw','legacy.action','withdraw','fnd','capability','low',false,'Withdraw','withdraw','record'),
    ('legacy.action.escalate','legacy.action','escalate','fnd','capability','low',false,'Escalate','escalate','record'),
    ('legacy.action.approve','legacy.action','approve','fnd','capability','medium',false,'Approve','approve','record'),
    ('legacy.action.deny','legacy.action','deny','fnd','capability','medium',false,'Deny','deny','record'),
    ('legacy.action.void','legacy.action','void','fnd','capability','high',false,'Void','void','record'),
    ('legacy.action.return','legacy.action','return','fnd','capability','low',false,'Return Document for Revision','return','record'),
    ('legacy.action.request_info','legacy.action','request_info','fnd','capability','low',false,'Request More Information','request_info','record'),
    ('legacy.action.post','legacy.action','post','fnd','capability','high',false,'Post','post','record'),
    ('legacy.action.reverse','legacy.action','reverse','fnd','capability','critical',true,'Reverse','reverse','record'),
    ('legacy.action.reconcile','legacy.action','reconcile','fnd','capability','high',false,'Reconcile','reconcile','record'),
    ('legacy.action.transmit','legacy.action','transmit','fnd','capability','high',false,'Transmit Payment','transmit','record'),
    ('legacy.action.clear','legacy.action','clear','fnd','capability','high',false,'Clear Payment','clear','record'),
    ('supplier.tax.submit','supplier.tax','submit','fnd','capability','low',false,'Submit Tax Profile','supplier.tax.submit','record'),
    ('supplier.tax.verify','supplier.tax','verify','fnd','capability','medium',false,'Verify Tax Profile','supplier.tax.verify','record'),
    ('supplier.tax.restricted','supplier.tax','restricted','fnd','capability','high',false,'Restricted Tax Access','supplier.tax.restricted','record'),
    ('supplier.banking.submit','supplier.banking','submit','fnd','capability','medium',false,'Submit Bank Details','supplier.banking.submit','record'),
    ('supplier.banking.verify','supplier.banking','verify','fnd','capability','high',false,'Verify Bank Account','supplier.banking.verify','record'),
    ('supplier.banking.admin','supplier.banking','admin','fnd','capability','high',false,'Administer Banking','supplier.banking.admin','record'),
    ('legacy.ap.override_tax_mode','legacy.ap','override_tax_mode','fnd','capability','medium',false,'Override Invoice Tax Mode','ap.override_tax_mode','record'),
    ('legacy.ap.promote_proforma','legacy.ap','promote_proforma','fnd','capability','medium',false,'Promote Proforma Invoice to Draft','ap.promote_proforma','record'),
    ('legacy.action.copy','legacy.action','copy','fnd','capability','low',false,'Copy','copy','record'),
    ('legacy.action.merge','legacy.action','merge','fnd','capability','critical',true,'Merge','merge','record'),
    ('legacy.action.report','legacy.action','report','fnd','capability','low',false,'Report','report','record'),
    ('legacy.action.print','legacy.action','print','fnd','capability','low',false,'Print','print','record'),
    ('legacy.action.import','legacy.action','import','fnd','capability','medium',true,'Import','import','record'),
    ('legacy.action.export','legacy.action','export','fnd','capability','low',false,'Export','export','record'),
    ('legacy.action.view_je','legacy.action','view_je','fnd','capability','low',false,'View Journal Entry','view_je','record'),
    ('legacy.action.bulk_import','legacy.action','bulk_import','fnd','capability','high',true,'Bulk Import','bulk_import','tenant'),
    ('legacy.action.bulk_export','legacy.action','bulk_export','fnd','capability','high',true,'Bulk Export','bulk_export','tenant'),
    ('legacy.action.bulk_update','legacy.action','bulk_update','fnd','capability','critical',true,'Bulk Update','bulk_update','tenant'),
    ('legacy.action.bulk_delete','legacy.action','bulk_delete','fnd','capability','critical',true,'Bulk Delete','bulk_delete','tenant'),
    ('legacy.action.delegate','legacy.action','delegate','fnd','system_action','medium',false,'Delegate','delegate','record'),
    ('legacy.action.share_read','legacy.action','share_read','fnd','system_action','low',false,'Share Read-Only','share_read','record'),
    ('legacy.action.share_edit','legacy.action','share_edit','fnd','system_action','medium',false,'Share Editable','share_edit','record'),
    ('legacy.action.add_comment','legacy.action','add_comment','fnd','capability','low',false,'Add Comment','add_comment','record'),
    ('legacy.action.add_attachment','legacy.action','add_attachment','fnd','capability','low',false,'Add Attachment','add_attachment','record'),
    ('legacy.attachment.read','legacy.attachment','read','fnd','capability','low',false,'Read Attachments','attachment.read','record'),
    ('legacy.attachment.create','legacy.attachment','create','fnd','capability','low',false,'Create Attachments','attachment.create','record'),
    ('legacy.attachment.update','legacy.attachment','update','fnd','capability','medium',false,'Update Attachments','attachment.update','record'),
    ('legacy.attachment.delete','legacy.attachment','delete','fnd','capability','high',false,'Delete Attachments','attachment.delete','record'),
    ('legacy.attachment.reindex','legacy.attachment','reindex','fnd','capability','high',true,'Reindex Attachment Content','attachment.reindex','record'),
    ('legacy.action.del_others_comment','legacy.action','del_others_comment','fnd','capability','medium',false,'Delete Others Comment','del_others_comment','record'),
    ('legacy.action.del_others_attach','legacy.action','del_others_attach','fnd','capability','medium',false,'Delete Others Attachment','del_others_attach','record'),
    ('legacy.action.follow','legacy.action','follow','fnd','capability','low',false,'Follow','follow','record'),
    ('legacy.action.tag','legacy.action','tag','fnd','capability','low',false,'Tag','tag','record'),
    ('records.lock.force_release','records.lock','force_release','fnd','capability','high',false,'Force Release Record Lock','records.lock.force_release','tenant'),
    ('legacy.action.feature_diagnostic','legacy.action','feature_diagnostic','fnd','capability','critical',false,'Self Diagnostic Tool','feature_diagnostic','special'),
    ('legacy.action.feature_theme','legacy.action','feature_theme','fnd','capability','low',false,'Theme Change','feature_theme','special'),
    ('legacy.action.feature_view','legacy.action','feature_view','fnd','capability','low',false,'View Access Features','feature_view','special'),
    ('legacy.action.feature_edit','legacy.action','feature_edit','fnd','capability','medium',false,'Create/Edit Features','feature_edit','special'),
    ('supplier.governance.write','supplier.governance','write','fnd','capability','high',false,'Write Governance Record','supplier.governance.write','record'),
    ('supplier.qualification.admin','supplier.qualification','admin','fnd','capability','critical',false,'Administer Qualification','supplier.qualification.admin','record'),
    ('legacy.finance_setup.view','legacy.finance_setup','view','fnd','capability','low',false,'View Finance Setup','FINANCE_SETUP.VIEW','tenant'),
    ('legacy.finance_setup.configure','legacy.finance_setup','configure','fnd','capability','high',false,'Configure Finance Setup','FINANCE_SETUP.CONFIGURE','tenant'),
    ('legacy.finance_setup.advanced_configure','legacy.finance_setup','advanced_configure','fnd','capability','high',false,'Advanced Finance Setup','FINANCE_SETUP.ADVANCED_CONFIGURE','tenant'),
    ('address_contact.company_code.manage','address_contact.company_code','manage','fnd','capability','medium',false,'Manage Company Addresses and Contacts','ADDRESS_CONTACT.COMPANY_CODE.MANAGE','tenant'),
    ('address_contact.legal_entity.manage','address_contact.legal_entity','manage','fnd','capability','high',false,'Manage Legal Entity Addresses and Contacts','ADDRESS_CONTACT.LEGAL_ENTITY.MANAGE','tenant'),
    ('address_contact.tenant.manage','address_contact.tenant','manage','fnd','capability','high',false,'Manage Tenant Addresses and Contacts','ADDRESS_CONTACT.TENANT.MANAGE','tenant'),
    ('ai.agent.use','ai.agent','use','fnd','capability','medium',true,'Use Atlas Agent','ai.agent.use','tenant'),
    ('ai.agent.provider_diagnostics','ai.agent','provider_diagnostics','fnd','capability','high',true,'Use Atlas Provider Diagnostics','ai.agent.provider_diagnostics','tenant'),
    ('ai.agent.feedback.submit','ai.agent.feedback','submit','fnd','capability','low',false,'Submit Atlas Agent Feedback','ai.agent.feedback.submit','tenant'),
    ('ai.agent.history.read','ai.agent.history','read','fnd','capability','medium',true,'Read Own Atlas History','ai.agent.history.read','tenant'),
    ('ai.agent.history.manage','ai.agent.history','manage','fnd','capability','medium',true,'Manage Own Atlas History','ai.agent.history.manage','tenant'),
    ('ai.agent.history.delete','ai.agent.history','delete','fnd','capability','high',true,'Delete Own Atlas History','ai.agent.history.delete','tenant'),
    ('ai.agent.history.export','ai.agent.history','export','fnd','capability','high',true,'Export Own Atlas History','ai.agent.history.export','tenant'),
    ('ai.agent.tools.read','ai.agent.tools','read','fnd','capability','medium',true,'Use Read-Only Atlas Tools','ai.agent.tools.read','tenant'),
    ('ai.agent.admin.support_session','ai.agent.admin','support_session','fnd','capability','high',true,'Start Atlas Support Session','ai.agent.admin.support_session','tenant'),
    ('legacy.ai.use_extraction','legacy.ai','use_extraction','fnd','capability','medium',true,'Use AI Extraction','ai.use_extraction','tenant'),
    ('legacy.ai.review_ai_output','legacy.ai','review_ai_output','fnd','capability','low',false,'Review AI Output','ai.review_ai_output','tenant'),
    ('legacy.ai.calibrate_thresholds','legacy.ai','calibrate_thresholds','fnd','capability','high',true,'Calibrate AI Thresholds','ai.calibrate_thresholds','tenant'),
    ('legacy.action.convert','legacy.action','convert','fnd','capability','low',false,'Convert','convert','record'),
    ('legacy.action.confirm','legacy.action','confirm','fnd','capability','low',false,'Confirm','confirm','record'),
    ('legacy.action.propose_changes','legacy.action','propose_changes','fnd','capability','low',false,'Propose Changes','propose_changes','record'),
    ('legacy.action.reject','legacy.action','reject','fnd','capability','medium',false,'Reject','reject','record'),
    ('legacy.action.accept_changes','legacy.action','accept_changes','fnd','capability','medium',false,'Accept Changes','accept_changes','record'),
    ('legacy.action.reject_changes','legacy.action','reject_changes','fnd','capability','medium',false,'Reject Changes','reject_changes','record'),
    ('legacy.action.dispatch','legacy.action','dispatch','fnd','capability','low',false,'Dispatch','dispatch','record'),
    ('legacy.action.mark_arrived','legacy.action','mark_arrived','fnd','capability','low',false,'Mark Arrived','mark_arrived','record'),
    ('legacy.action.receipt','legacy.action','receipt','fnd','capability','low',false,'Open Receipt','receipt','record'),
    ('legacy.action.submit_for_acceptance','legacy.action','submit_for_acceptance','fnd','capability','low',false,'Submit for Acceptance','submit_for_acceptance','record'),
    ('legacy.action.accept','legacy.action','accept','fnd','capability','low',false,'Accept','accept','record'),
    ('legacy.action.reject_acceptance','legacy.action','reject_acceptance','fnd','capability','low',false,'Reject Acceptance','reject_acceptance','record'),
    ('legacy.pr.approve','legacy.pr','approve','fnd','capability','medium',false,'Approve Requisition','PR.APPROVE','record'),
    ('legacy.pr.convert','legacy.pr','convert','fnd','capability','medium',false,'Convert Requisition to PO','PR.CONVERT','record'),
    ('legacy.po.approve','legacy.po','approve','fnd','capability','medium',false,'Approve Purchase Order','PO.APPROVE','record'),
    ('legacy.po.place_order','legacy.po','place_order','fnd','capability','medium',false,'Place Order with Supplier','PO.PLACE_ORDER','record'),
    ('legacy.po.retry_send','legacy.po','retry_send','fnd','capability','low',false,'Retry Send Order','PO.RETRY_SEND','record'),
    ('legacy.po.short_close','legacy.po','short_close','fnd','capability','high',false,'Short-Close Open PO','PO.SHORT_CLOSE','record'),
    ('legacy.po.hold','legacy.po','hold','fnd','capability','high',false,'Place Purchase Order on Hold','PO.HOLD','record'),
    ('legacy.po.release_hold','legacy.po','release_hold','fnd','capability','high',false,'Release Purchase Order Hold','PO.RELEASE_HOLD','record'),
    ('legacy.po.expire','legacy.po','expire','fnd','capability','high',false,'Expire Purchase Order','PO.EXPIRE','record'),
    ('legacy.poc.accept','legacy.poc','accept','fnd','capability','medium',false,'Accept PO Confirmation','POC.ACCEPT','record'),
    ('legacy.poc.dispute','legacy.poc','dispute','fnd','capability','medium',false,'Dispute PO Confirmation','POC.DISPUTE','record'),
    ('legacy.dn.mark_arrived','legacy.dn','mark_arrived','fnd','capability','low',false,'Mark Delivery Note Arrived','DN.MARK_ARRIVED','record'),
    ('legacy.receipt.approve','legacy.receipt','approve','fnd','capability','medium',false,'Approve Receipt','RECEIPT.APPROVE','record'),
    ('legacy.receipt.post','legacy.receipt','post','fnd','capability','high',false,'Post Receipt','RECEIPT.POST','record'),
    ('legacy.receipt.reverse','legacy.receipt','reverse','fnd','capability','critical',true,'Reverse Posted Receipt','RECEIPT.REVERSE','record'),
    ('legacy.receipt.quality_hold','legacy.receipt','quality_hold','fnd','capability','medium',false,'Place Receipt on Quality Hold','RECEIPT.QUALITY_HOLD','record'),
    ('legacy.service_sheet.approve','legacy.service_sheet','approve','fnd','capability','medium',false,'Approve Service Sheet','SERVICE_SHEET.APPROVE','record'),
    ('legacy.service_sheet.post','legacy.service_sheet','post','fnd','capability','high',false,'Post Service Sheet','SERVICE_SHEET.POST','record'),
    ('legacy.service_sheet.reverse','legacy.service_sheet','reverse','fnd','capability','critical',true,'Reverse Posted Service Sheet','SERVICE_SHEET.REVERSE','record'),
    ('legacy.pi.approve','legacy.pi','approve','fnd','capability','medium',false,'Approve Purchase Invoice','PI.APPROVE','record'),
    ('legacy.pi.post','legacy.pi','post','fnd','capability','high',false,'Post Purchase Invoice','PI.POST','record'),
    ('legacy.pi.reverse','legacy.pi','reverse','fnd','capability','critical',true,'Reverse Posted Invoice','PI.REVERSE','record'),
    ('legacy.pi.match_override','legacy.pi','match_override','fnd','capability','high',false,'Override Three-Way Match Exception','PI.MATCH_OVERRIDE','record'),
    ('legacy.pi.snapshot_restore','legacy.pi','snapshot_restore','fnd','capability','critical',false,'Restore Invoice From Snapshot','PI.SNAPSHOT_RESTORE','record'),
    ('legacy.pi.discard_session','legacy.pi','discard_session','fnd','capability','medium',false,'Legacy Revert To Baseline Alias','PI.DISCARD_SESSION','record'),
    ('legacy.pi.revert_to_baseline','legacy.pi','revert_to_baseline','fnd','capability','high',false,'Revert Invoice To Baseline','PI.REVERT_TO_BASELINE','record')
) AS s(canonical_code,resource_code,operation_code,module_code,permission_kind,risk_tier,requires_mfa,name,legacy_code,scope_type)
JOIN control.module m ON m.code=s.module_code
ON CONFLICT (canonical_code) DO UPDATE SET permission_kind=excluded.permission_kind,resource_code=excluded.resource_code,
 operation_code=excluded.operation_code,module_id=excluded.module_id,risk_tier=excluded.risk_tier,requires_mfa=excluded.requires_mfa,
 provenance_ref=excluded.provenance_ref,metadata=excluded.metadata,status='suspended',status_changed_at=now(),status_changed_by=excluded.created_by,
 updated_at=now(),updated_by=excluded.created_by
WHERE (authz.permission.permission_kind,authz.permission.resource_code,authz.permission.operation_code,authz.permission.module_id,
 authz.permission.risk_tier,authz.permission.requires_mfa,authz.permission.provenance_ref,authz.permission.metadata,authz.permission.status)
 IS DISTINCT FROM (excluded.permission_kind,excluded.resource_code,excluded.operation_code,excluded.module_id,excluded.risk_tier,
 excluded.requires_mfa,excluded.provenance_ref,excluded.metadata,'published'::authz.catalog_status_d);

INSERT INTO authz.permission_scope_policy (permission_id,scope_kind,propagation_mode,created_by)
SELECT permission.id,'tenant','exact','00000000-0000-0000-0000-000000000000'::uuid
FROM authz.permission permission
WHERE permission.provenance_ref LIKE 'wave4:legacy-permission:%'
  AND permission.status IN ('draft','suspended')
ON CONFLICT (permission_id,scope_kind) DO UPDATE SET
 propagation_mode=excluded.propagation_mode,updated_at=now(),updated_by=excluded.created_by
WHERE authz.permission_scope_policy.propagation_mode IS DISTINCT FROM excluded.propagation_mode;

UPDATE authz.permission
SET status='published',status_changed_at=now(),status_changed_by='00000000-0000-0000-0000-000000000000'::uuid,
    updated_at=now(),updated_by='00000000-0000-0000-0000-000000000000'::uuid
WHERE provenance_ref LIKE 'wave4:legacy-permission:%'
  AND status IN ('draft','suspended');

DO $assertions$ BEGIN
 IF (SELECT count(*) FROM authz.permission WHERE provenance_ref LIKE 'wave4:legacy-permission:%' AND status='published') <> 126 THEN
   RAISE EXCEPTION 'neon compiled permission count mismatch'; END IF;
 IF EXISTS (SELECT 1 FROM authz.permission p LEFT JOIN control.module m ON m.id=p.module_id WHERE p.provenance_ref LIKE 'wave4:legacy-permission:%' AND m.id IS NULL) THEN
   RAISE EXCEPTION 'neon compiled permission module orphan'; END IF;
END $assertions$;
