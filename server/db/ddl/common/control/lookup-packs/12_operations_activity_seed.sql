-- seed-contract-version: 1
-- seed-pack: common.control.lookup.operations_activity
-- seed-pack-version: 1.0.0
-- seed-dataset: common.control.lookup.operations_activity
-- seed-data-class: production_reference
-- seed-provenance: {"source":"Wave 3 legacy lookup rationalization","publisher":"Athyper","source_version":"wave3-lookup-ledger.v1","retrieved_at":"2026-08-03","license":"internal"}
-- seed-plane: common
-- seed-tenant-scope: none
-- seed-natural-key: control.lookup_domain(code);control.lookup_value(domain_code,code)
-- seed-cross-file-ids: false
-- seed-id-strategy: database-generated
-- seed-expected-row-count: exact:139
-- seed-assertions: expected-count,orphan,uniqueness,semantic
-- seed-demo-data: false
-- source-files: server/db/seed/platform/000_lookups/LookupDomain/event/evt_event_type.sql,server/db/seed/platform/000_lookups/LookupDomain/event/task_type.sql,server/db/seed/platform/000_lookups/LookupDomain/event/workflow_type.sql,server/db/seed/platform/000_lookups/LookupDomain/log/activity_domain.sql,server/db/seed/platform/000_lookups/LookupDomain/log/activity_type.sql,server/db/seed/platform/000_lookups/LookupDomain/log/attachment_access_type.sql,server/db/seed/platform/000_lookups/LookupDomain/log/close_activity_type.sql,server/db/seed/platform/000_lookups/LookupDomain/log/export_type.sql,server/db/seed/platform/000_lookups/LookupDomain/log/finance_setup_activity.sql,server/db/seed/platform/000_lookups/LookupDomain/master/attachment_kind.sql

DO $guard$ BEGIN
  IF current_setting('app.database_plane', true) NOT IN ('studio', 'neon', 'mesh') THEN
    RAISE EXCEPTION 'common.control.lookup.operations_activity: invalid database plane';
  END IF;
END $guard$;

INSERT INTO control.lookup_domain
  (code, name, description, source_schema, is_extensible, metadata, status, created_by)
VALUES
  ('evt.event_type', 'Resolution Pipeline Event Type', 'Domain event type codes emitted by the resolution engine pipeline. Classifies what the engine produced or decided at each processing step (e.g. intent.resolved, profile.resolved, entry.generated). Used in log.resolution_log.event_type. is_extensible=false ??? event types are engine-governed.', 'log', false, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('log.activity_domain', 'Activity Log Domain', 'Top-level domain discriminator for activity_log.domain. Groups all activity rows by functional area. is_extensible=true ??? tenants can register custom activity domains.', 'log', true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('log.activity_type', 'Activity Log Type', 'Activity type within a domain for activity_log.activity_type. Paired with domain ??? e.g. domain=kpi + activity_type=calculation. is_extensible=true ??? new activity types added as features expand.', 'log', true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('log.attachment_access_type', 'Attachment Access Type', 'Type of access recorded in attachment_access_log.access_type. is_extensible=true ??? platform can add new access types (e.g. watermarked_download) without DDL changes.', 'log', true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('log.close_activity_type', 'Close Activity Type', 'Activity type discriminator for close_activity_log.activity_type. Represents the 5 merged source tables. is_extensible=false ??? finance close activity types are a compliance-audited sealed vocabulary.', 'log', false, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('log.export_type', 'Export Log Type', 'Export type discriminator for export_log.export_type. is_extensible=true ??? new export destinations (PDF, API, S3 push) registered without DDL changes.', 'log', true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('master.attachment_kind', 'Attachment Kind', 'Functional classification of an attachment. Used in master.attachment.kind. is_extensible=true ??? tenants register custom file categories.', 'master', true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('work_item.task_type', 'Work Item Task Type', 'Classifies the nature of a human task in event.work_item. Drives valid decision values, blocking behaviour, and reassignment rules. is_extensible=true ??? new task types added without DDL.', 'event', true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('work_request.workflow_type', 'Workflow Request Type', 'Classifies the nature of a workflow process in document.workflow_request. is_extensible=true ??? new workflow types added without DDL.', 'document', true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid)
ON CONFLICT (code) DO UPDATE SET
  name = excluded.name, description = excluded.description,
  source_schema = excluded.source_schema, is_extensible = excluded.is_extensible,
  metadata = excluded.metadata, status = excluded.status,
  updated_at = now(), updated_by = excluded.created_by
WHERE (control.lookup_domain.name, control.lookup_domain.description,
       control.lookup_domain.source_schema, control.lookup_domain.is_extensible,
       control.lookup_domain.metadata, control.lookup_domain.status)
  IS DISTINCT FROM
      (excluded.name, excluded.description, excluded.source_schema,
       excluded.is_extensible, excluded.metadata, excluded.status);

INSERT INTO control.lookup_value
  (code, name, domain_code, description, category, sort_order, is_system, metadata, status, created_by)
VALUES
  ('intent.resolved', 'Intent Resolved', 'evt.event_type', 'Business intent successfully resolved by control.resolve_business_intent().', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('profile.resolved', 'Profile Resolved', 'evt.event_type', 'Accounting profile successfully resolved by control.resolve_accounting_profile().', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('entry.generated', 'JE Entries Expanded', 'evt.event_type', 'Journal entry lines generated by control.generate_event_entries().', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('obligation.planned', 'Obligation Created', 'evt.event_type', 'Obligation horizon row created in PLANNED tier by the resolution engine.', NULL, 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('obligation.promoted', 'Obligation Tier Advanced', 'evt.event_type', 'Obligation promoted from PLANNED ??? FORECAST or FORECAST ??? RESERVED by promote_obligation_tier().', NULL, 50, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('revenue.recognized', 'Revenue Recognised', 'evt.event_type', 'Revenue recognition entry generated upon obligation_satisfied or period_recognition event.', NULL, 60, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('cogs.matched', 'COGS Paired to Revenue', 'evt.event_type', 'Symmetric COGS entry generated as paired counterpart to a revenue recognition entry.', NULL, 70, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('settlement.arranged', 'Payment Arranged', 'evt.event_type', 'Settlement or payment entry generated following a settlement event code.', NULL, 80, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('document', 'Document', 'log.activity_domain', 'Document lifecycle events: create, update, submit, approve, cancel, reopen.', NULL, 5, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('workflow', 'Workflow', 'log.activity_domain', 'Workflow routing events: submission, approvals, rejections, delegations, escalations.', NULL, 6, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('accounting', 'Accounting', 'log.activity_domain', 'Accounting events: journal posting, reversal, revaluation, period assignment.', NULL, 7, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('payment', 'Payment', 'log.activity_domain', 'Payment processing events: payment run, clearance, remittance, bank confirmation.', NULL, 8, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('system', 'System', 'log.activity_domain', 'System-generated events: imports, migrations, automated background processing.', NULL, 9, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('kpi', 'KPI', 'log.activity_domain', 'KPI calculation, threshold breach, and execution activities.', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('pack', 'Report Pack', 'log.activity_domain', 'Report pack generation, publishing, and distribution activities.', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('release', 'Release', 'log.activity_domain', 'Pack release and approval workflow activities.', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('planning', 'Planning', 'log.activity_domain', 'Budget and forecast planning model activities.', NULL, 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('close', 'Period Close', 'log.activity_domain', 'Period close process orchestration activities (distinct from close_activity_log which covers compliance-critical close audit records).', NULL, 50, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('approval', 'Approval', 'log.activity_domain', 'Approval workflow instance events (submitted, approved, rejected, escalated).', NULL, 60, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('user', 'User', 'log.activity_domain', 'User interaction activities: comment reads, responses, record views.', NULL, 70, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('finance_setup', 'Finance Setup', 'log.activity_domain', 'Configuration activity performed through the Finance Setup Workbench (GL controls, chart/book assignments, house-bank toggles).', NULL, 200, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('document.created', 'Document Created', 'log.activity_type', 'Document record created in draft state.', NULL, 1, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('document.updated', 'Document Updated', 'log.activity_type', 'Document header fields updated.', NULL, 2, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('document.deleted', 'Document Deleted', 'log.activity_type', 'Document record deleted.', NULL, 3, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('document.item_created', 'Document Item Created', 'log.activity_type', 'Document line item added.', NULL, 4, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('document.item_updated', 'Document Item Updated', 'log.activity_type', 'Document line item fields updated.', NULL, 5, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('document.item_deleted', 'Document Item Deleted', 'log.activity_type', 'Document line item removed.', NULL, 6, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('document.ready', 'Document Ready', 'log.activity_type', 'Document completed draft checks and moved to ready state.', NULL, 7, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('document.submitted', 'Document Submitted', 'log.activity_type', 'Document submitted for approval or processing.', NULL, 8, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('document.approved', 'Document Approved', 'log.activity_type', 'Document approved and advanced to next state.', NULL, 9, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('document.rejected', 'Document Rejected', 'log.activity_type', 'Document rejected; returned to submitter.', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('kpi.calculation', 'KPI Calculation', 'log.activity_type', 'KPI value calculated for a period.', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('document.cancelled', 'Document Cancelled', 'log.activity_type', 'Document cancelled and closed from further processing.', NULL, 11, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('document.reopened', 'Document Reopened', 'log.activity_type', 'Cancelled or rejected document reopened for editing.', NULL, 12, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('document.amended', 'Document Amended', 'log.activity_type', 'New amendment version created from an approved document.', NULL, 13, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('accounting.posted', 'Journal Posted', 'log.activity_type', 'Accounting journal entry posted to the ledger.', NULL, 15, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('accounting.reversed', 'Journal Reversed', 'log.activity_type', 'Posted journal entry reversed.', NULL, 16, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('accounting.revalued', 'Currency Revalued', 'log.activity_type', 'Document revalued at a new exchange rate.', NULL, 17, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('payment.initiated', 'Payment Initiated', 'log.activity_type', 'Payment run initiated for the document.', NULL, 18, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('payment.cleared', 'Payment Cleared', 'log.activity_type', 'Payment confirmed cleared by bank.', NULL, 19, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('kpi.threshold_breach', 'KPI Threshold Breach', 'log.activity_type', 'KPI value breached a defined threshold.', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('payment.reversed', 'Payment Reversed', 'log.activity_type', 'Payment reversed or recalled.', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('workflow.initiated', 'Workflow Initiated', 'log.activity_type', 'Approval workflow routing initiated for the document.', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('system.import', 'Record Imported', 'log.activity_type', 'Record created via bulk import.', NULL, 21, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('workflow.approved', 'Workflow Approved', 'log.activity_type', 'Approver approved the workflow step.', NULL, 21, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('system.migration', 'Record Migrated', 'log.activity_type', 'Record migrated from a legacy system.', NULL, 22, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('workflow.rejected', 'Workflow Rejected', 'log.activity_type', 'Approver rejected the workflow step.', NULL, 22, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('system.auto_action', 'Automated Action', 'log.activity_type', 'Background automation applied an action to the record.', NULL, 23, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('workflow.delegated', 'Workflow Delegated', 'log.activity_type', 'Approval task delegated to another principal.', NULL, 23, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('workflow.escalated', 'Workflow Escalated', 'log.activity_type', 'Approval task auto-escalated due to SLA breach.', NULL, 24, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('workflow.recalled', 'Workflow Recalled', 'log.activity_type', 'Submitted workflow recalled by the originator.', NULL, 25, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('kpi.published', 'KPI Published', 'log.activity_type', 'KPI result published to a report pack.', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('pack.generated', 'Pack Generated', 'log.activity_type', 'Report pack instance generated.', NULL, 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('pack.published', 'Pack Published', 'log.activity_type', 'Report pack published to recipients.', NULL, 50, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('pack.recalled', 'Pack Recalled', 'log.activity_type', 'Published pack recalled by author.', NULL, 60, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('release.submitted', 'Release Submitted', 'log.activity_type', 'Release submitted for approval.', NULL, 70, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('release.approved', 'Release Approved', 'log.activity_type', 'Release approved by authorised reviewer.', NULL, 80, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('release.rejected', 'Release Rejected', 'log.activity_type', 'Release rejected.', NULL, 90, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('planning.line_saved', 'Planning Line Saved', 'log.activity_type', 'Budget/forecast line created or updated.', NULL, 100, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('planning.model_run', 'Planning Model Run', 'log.activity_type', 'Planning model calculation run triggered.', NULL, 110, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('close.step_completed', 'Close Step Completed', 'log.activity_type', 'A period-close checklist step completed.', NULL, 120, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('close.step_waived', 'Close Step Waived', 'log.activity_type', 'A period-close checklist step waived by authorised user.', NULL, 130, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('approval.submitted', 'Approval Submitted', 'log.activity_type', 'Approval request submitted.', NULL, 140, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('approval.approved', 'Approval Approved', 'log.activity_type', 'Approval request approved by reviewer.', NULL, 150, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('approval.rejected', 'Approval Rejected', 'log.activity_type', 'Approval request rejected.', NULL, 160, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('approval.escalated', 'Approval Escalated', 'log.activity_type', 'Approval request escalated due to SLA breach.', NULL, 170, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('user.comment_read', 'Comment Read', 'log.activity_type', 'Principal read a comment. Migrated from log.comment_read.', NULL, 180, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('user.comment_response', 'Comment Response', 'log.activity_type', 'Principal responded to a comment.', NULL, 190, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('finance_setup.control_assigned', 'Company Control Assigned', 'log.activity_type', 'A company_code_gl_account row was created to assign posting controls to a GL account.', NULL, 200, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('user.record_view', 'Record Viewed', 'log.activity_type', 'Principal viewed a record. Replaces log.recent_activity.', NULL, 200, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('finance_setup.control_updated', 'Company Control Updated', 'log.activity_type', 'A company_code_gl_account row was updated (posting flags, requires_*, reconciliation type, tax category).', NULL, 201, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('finance_setup.control_deactivated', 'Company Control Deactivated', 'log.activity_type', 'A company_code_gl_account row was soft-deactivated (posting_allowed=false).', NULL, 202, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('finance_setup.chart_assignment_changed', 'Chart Assignment Changed', 'log.activity_type', 'A company_code_chart_assignment was activated, promoted to primary, or reassigned.', NULL, 203, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('finance_setup.book_assignment_changed', 'Book Assignment Changed', 'log.activity_type', 'A Company Book assignment or explicit Company default Book was changed.', NULL, 204, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('finance_setup.house_bank_toggled', 'House Bank Toggled', 'log.activity_type', 'A bank_account_house_config was activated or deactivated.', NULL, 205, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('user.record_selected', 'Record Selected', 'log.activity_type', 'Principal selected a record from an entity picker. Feeds recently-used entity chooser sections.', NULL, 205, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('finance_setup.fiscal_calendar_created', 'Fiscal Calendar Created', 'log.activity_type', 'A fiscal-calendar version was created.', NULL, 206, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('finance_setup.fiscal_calendar_updated', 'Fiscal Calendar Updated', 'log.activity_type', 'A fiscal-calendar draft or successor version was updated.', NULL, 207, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('finance_setup.fiscal_calendar_assigned', 'Fiscal Calendar Assigned', 'log.activity_type', 'A fiscal-calendar version was assigned to a company.', NULL, 208, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('finance_setup.fiscal_periods_generated', 'Fiscal Periods Generated', 'log.activity_type', 'Fiscal periods and governance book gates were generated.', NULL, 209, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('finance_setup.posting_role_map_assigned', 'Posting Role Account Assigned', 'log.activity_type', 'A posting role was assigned to a GL account for a company and ledger book.', NULL, 210, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('upupr.submitted', 'UPUPR Submitted', 'log.activity_type', 'UPUPR request submitted by principal.', NULL, 210, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('finance_setup.posting_role_map_updated', 'Posting Role Account Updated', 'log.activity_type', 'A posting-role account assignment was superseded by a new version.', NULL, 211, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('finance_setup.posting_role_map_retired', 'Posting Role Account Retired', 'log.activity_type', 'A posting-role account assignment was retired.', NULL, 212, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('finance_setup.controls_bulk_updated', 'Company Controls Bulk Updated', 'log.activity_type', 'Posting and dimension controls were applied to a governed set of Company GL Accounts.', NULL, 213, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('finance_setup.fx_policy_saved', 'FX Policy Saved', 'log.activity_type', 'An approved or draft FX resolution policy was created or changed.', NULL, 214, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('finance_setup.fx_rates_imported', 'FX Rates Imported', 'log.activity_type', 'A validated batch of FX rates was posted and matching active keys were superseded.', NULL, 215, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('finance_setup.tax_group_version_saved', 'Tax Group Version Saved', 'log.activity_type', 'A governed Tax Group Version and its ordered components were saved.', NULL, 216, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('finance_setup.tax_registration_saved', 'Tax Registration Saved', 'log.activity_type', 'An effective Legal Entity or Company Tax Registration was saved.', NULL, 217, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('finance_setup.wht_threshold_saved', 'WHT Threshold Saved', 'log.activity_type', 'An effective withholding-tax threshold was saved.', NULL, 218, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('finance_setup.payment_term_saved', 'Payment Term Saved', 'log.activity_type', 'A Payment Term aggregate version was saved.', NULL, 219, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('finance_setup.payment_policy_saved', 'Payment Policy Saved', 'log.activity_type', 'A Company payment-method policy was saved.', NULL, 220, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('upupr.assigned', 'UPUPR Assigned to Supervisor', 'log.activity_type', 'UPUPR assigned to supervisor for review.', NULL, 220, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('finance_setup.interface_binding_saved', 'Interface Binding Saved', 'log.activity_type', 'A deterministic payment interface binding was saved.', NULL, 221, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('finance_setup.settlement_rule_saved', 'Settlement Rule Saved', 'log.activity_type', 'A payment settlement accounting rule was saved.', NULL, 222, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('finance_setup.house_bank_saved', 'House Bank Saved', 'log.activity_type', 'A governed House Bank aggregate was created or updated.', NULL, 223, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('finance_setup.bank_link_ended', 'Bank Link Ended', 'log.activity_type', 'A Company Bank Account Link was ended after lifecycle checks.', NULL, 224, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('finance_setup.bank_account_verified', 'Bank Account Verified', 'log.activity_type', 'A Bank Account verification status was recorded.', NULL, 225, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('finance_setup.bank_interface_tested', 'Bank Interface Tested', 'log.activity_type', 'A secure Bank Interface connection test was recorded without credential material.', NULL, 226, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('finance_setup.fx_rate_replaced', 'FX Rate Replaced', 'log.activity_type', 'An immutable active FX quote was superseded by a lineage-linked successor.', NULL, 227, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('finance_setup.fx_tenant_policy_created', 'Tenant FX Policy Created', 'log.activity_type', 'An append-only Tenant FX default policy was created.', NULL, 228, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('finance_setup.fx_policy_replaced', 'FX Policy Replaced', 'log.activity_type', 'An FX policy was replaced by a scope-preserving lineage successor.', NULL, 229, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('finance_setup.fx_policy_ended', 'FX Policy Ended', 'log.activity_type', 'A Company or Book FX override was ended without deleting history.', NULL, 230, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('upupr.approved', 'UPUPR Approved', 'log.activity_type', 'UPUPR request approved by supervisor.', NULL, 230, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('finance_setup.fx_rate_created', 'FX Rate Created', 'log.activity_type', 'A new immutable FX quote was created through the governed command.', NULL, 231, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('upupr.rejected', 'UPUPR Rejected', 'log.activity_type', 'UPUPR request rejected by supervisor.', NULL, 240, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('upupr.returned', 'UPUPR Returned for Revision', 'log.activity_type', 'UPUPR returned to requestor for revision.', NULL, 250, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('upupr.resubmitted', 'UPUPR Resubmitted', 'log.activity_type', 'UPUPR resubmitted after revision.', NULL, 260, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('upupr.cancelled', 'UPUPR Cancelled', 'log.activity_type', 'UPUPR request cancelled.', NULL, 270, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('upupr.provisioned', 'UPUPR Provisioned', 'log.activity_type', 'UPUPR changes provisioned to target tables.', NULL, 280, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('upupr.supervisor_fallback', 'UPUPR Supervisor Fallback', 'log.activity_type', 'UPUPR supervisor fallback triggered.', NULL, 290, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('download', 'Download', 'log.attachment_access_type', 'Full file download to client device.', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('preview', 'Preview', 'log.attachment_access_type', 'In-browser preview render (PDF viewer, image display).', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('metadata_read', 'Metadata Read', 'log.attachment_access_type', 'Filename, size, MIME type read without file content transfer.', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('thumbnail', 'Thumbnail', 'log.attachment_access_type', 'Thumbnail or low-resolution preview generation.', NULL, 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('stream', 'Stream', 'log.attachment_access_type', 'Streaming access (video/audio playback via range requests).', NULL, 50, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('template_preview', 'Template Preview', 'log.attachment_access_type', 'Template preview access.', NULL, 60, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('template_download', 'Template Download', 'log.attachment_access_type', 'Template download access.', NULL, 70, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('automation_audit', 'Automation Audit', 'log.close_activity_type', 'Close automation rule evaluation result. Migrated from log.close_automation_audit. detail: {automation_rule_id, policy_id, verdict, gate_evidence, execution_result}.', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('task_duration', 'Task Duration', 'log.close_activity_type', 'Period-close task timing record. Migrated from log.close_task_duration_history. detail: {task_id, task_code, started_at, completed_at, duration_minutes, close_type}.', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('period_close', 'Period Close Step', 'log.close_activity_type', 'Period-close checklist step activity. Migrated from log.period_close_activity. detail: {close_step, step_status}.', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('release_decision', 'Release Decision', 'log.close_activity_type', 'Pack release command and policy evaluation result. Migrated from log.release_decision_log. detail: {release_id, certification_id, distribution_id, result, publication_batch_id}.', NULL, 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('remediation_preview', 'Remediation Preview', 'log.close_activity_type', 'Remediation action impact preview. Migrated from log.remediation_preview_log. detail: {action_id, campaign_id, impact_summary, blocking_reasons, can_execute}.', NULL, 50, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('release', 'Release Export', 'log.export_type', 'Full report pack release exported. detail carries release_id, certification_id, is_clean_close_at_export, is_integrity_valid_at_export, export_version.', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('statement', 'Statement Export', 'log.export_type', 'Financial statement instance exported (P&L, Balance Sheet, Cash Flow). detail carries instance_id, period_id, statement_type.', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('pack_download', 'Pack Download', 'log.export_type', 'Report pack downloaded by a recipient. detail carries distribution_id, format.', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('attachment', 'Attachment', 'master.attachment_kind', 'Generic file attachment on a business entity.', NULL, 10, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('letterhead', 'Letterhead', 'master.attachment_kind', 'Branded page header/footer asset for document generation.', NULL, 20, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('template_asset', 'Template Asset', 'master.attachment_kind', 'Image or resource file embedded in a document template.', NULL, 30, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('avatar', 'Avatar', 'master.attachment_kind', 'Principal or entity profile picture.', NULL, 40, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('evidence', 'Evidence', 'master.attachment_kind', 'Compliance or audit evidence file attached to a governance record.', NULL, 50, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('report', 'Report', 'master.attachment_kind', 'Generated report output (PDF, Excel).', NULL, 60, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('signature', 'Signature', 'master.attachment_kind', 'Digital or scanned signature asset.', NULL, 70, true, '{}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('approval', 'Approval', 'work_item.task_type', 'A human must make a binding decision on a business entity. Supports quorum (any N of M approvers). Blocking ??? the workflow stage cannot advance until quorum is met or rejection is final. Decision: approve (proceed) | reject (halt) | escalate (raise to next level).', NULL, 10, true, '{"is_blocking":true,"quorum_applies":true,"valid_decisions":["approve","reject","return","escalate"],"requires_decision":true,"allows_reassignment":true,"auto_complete_on_read":false}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('review', 'Review', 'work_item.task_type', 'A human must acknowledge and optionally flag issues with a document or entity. Soft blocking ??? workflow can be configured to proceed after partial review. Decision: acknowledge (reviewed, no issues) | flag (issues noted) | escalate.', NULL, 20, true, '{"is_blocking":true,"quorum_applies":true,"valid_decisions":["acknowledge","flag","escalate"],"requires_decision":true,"allows_reassignment":true,"auto_complete_on_read":false}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('watcher', 'Watcher', 'work_item.task_type', 'A human is subscribed to receive structured FYI updates on a workflow. Non-blocking ??? watcher tasks never prevent the workflow from advancing. Decision: read (implicit on open). No quorum. Distinct from master.notification ??? watcher tasks have explicit assignment and a trackable read receipt for audit/SLA reporting.', NULL, 30, true, '{"is_blocking":false,"quorum_applies":false,"valid_decisions":["read"],"requires_decision":false,"allows_reassignment":false,"auto_complete_on_read":true}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('approval', 'Approval', 'work_request.workflow_type', 'Structured approval workflow. Creates workflow_stages from the template. Each stage has work_items of task_type=approval. Final outcome (approved/rejected) is derived from stage quorum results. Used for: invoice approval, close override authorisation, delegation grants.', NULL, 10, true, '{"creates_stages":true,"work_item_types":["approval"],"requires_template":true,"derives_outcome_from_stages":true}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('review', 'Review', 'work_request.workflow_type', 'Review and sign-off workflow. May or may not have stages. Each stage has work_items of task_type=review. Used for: close pack review, certification attestation, release sign-off.', NULL, 20, true, '{"creates_stages":true,"work_item_types":["review"],"requires_template":true,"derives_outcome_from_stages":true}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('watcher', 'Watcher', 'work_request.workflow_type', 'Notification workflow. No stages. Creates work_items of task_type=watcher directly on the workflow_request. Non-blocking ??? watcher workflow completes as soon as it is created. Used for: FYI distribution, audit trail of notification delivery.', NULL, 30, true, '{"creates_stages":false,"work_item_types":["watcher"],"requires_template":false,"derives_outcome_from_stages":false}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid)
ON CONFLICT (domain_code, code) WHERE tenant_id IS NULL DO UPDATE SET
  name = excluded.name, description = excluded.description, category = excluded.category,
  sort_order = excluded.sort_order, is_system = excluded.is_system,
  metadata = excluded.metadata, status = excluded.status,
  updated_at = now(), updated_by = excluded.created_by
WHERE (control.lookup_value.name, control.lookup_value.description,
       control.lookup_value.category, control.lookup_value.sort_order,
       control.lookup_value.is_system, control.lookup_value.metadata,
       control.lookup_value.status)
  IS DISTINCT FROM
      (excluded.name, excluded.description, excluded.category, excluded.sort_order,
       excluded.is_system, excluded.metadata, excluded.status);

-- seed-assertion: expected-count
-- seed-assertion: orphan
-- seed-assertion: uniqueness
-- seed-assertion: semantic
DO $assertions$ BEGIN
  IF (SELECT count(*) FROM control.lookup_value WHERE tenant_id IS NULL AND domain_code = ANY(ARRAY['evt.event_type', 'log.activity_domain', 'log.activity_type', 'log.attachment_access_type', 'log.close_activity_type', 'log.export_type', 'master.attachment_kind', 'work_item.task_type', 'work_request.workflow_type'])) <> 139 THEN
    RAISE EXCEPTION 'common.control.lookup.operations_activity: expected-count assertion failed';
  END IF;
  IF EXISTS (SELECT 1 FROM control.lookup_value v LEFT JOIN control.lookup_domain d ON d.code=v.domain_code WHERE v.tenant_id IS NULL AND v.domain_code = ANY(ARRAY['evt.event_type', 'log.activity_domain', 'log.activity_type', 'log.attachment_access_type', 'log.close_activity_type', 'log.export_type', 'master.attachment_kind', 'work_item.task_type', 'work_request.workflow_type']) AND d.id IS NULL) THEN
    RAISE EXCEPTION 'common.control.lookup.operations_activity: orphan assertion failed';
  END IF;
  IF EXISTS (SELECT domain_code, code FROM control.lookup_value WHERE tenant_id IS NULL AND domain_code = ANY(ARRAY['evt.event_type', 'log.activity_domain', 'log.activity_type', 'log.attachment_access_type', 'log.close_activity_type', 'log.export_type', 'master.attachment_kind', 'work_item.task_type', 'work_request.workflow_type']) GROUP BY domain_code, code HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'common.control.lookup.operations_activity: uniqueness assertion failed';
  END IF;
  IF EXISTS (SELECT 1 FROM control.lookup_value WHERE tenant_id IS NULL AND domain_code = ANY(ARRAY['evt.event_type', 'log.activity_domain', 'log.activity_type', 'log.attachment_access_type', 'log.close_activity_type', 'log.export_type', 'master.attachment_kind', 'work_item.task_type', 'work_request.workflow_type']) AND (code <> lower(btrim(code)) OR btrim(name) = '' OR status NOT IN ('active','inactive','deprecated'))) THEN
    RAISE EXCEPTION 'common.control.lookup.operations_activity: semantic assertion failed';
  END IF;
END $assertions$;
