-- 035_version_fields/099_fix_entity_field_column_mappings.sql
-- Comprehensive fix: align control.entity_field.column_name with actual DB table columns.
-- Covers all mismatches discovered across the entity_field registry.
--
-- Three operation types:
--   UPDATE — rename column_name alias to the real column (idempotent: WHERE column_name = 'old')
--   DELETE — remove fields that reference non-existent columns with no valid remap
--   (DDL ADD COLUMNs live in master/03_constraints.sql, appended at the end)
--
-- Run order: after all 000–008 seed files in this directory.
-- Idempotent: safe to run multiple times.

DO $$
BEGIN

-- =============================================================================
-- §1  master.cost_center
--     cost_center_type → cost_center_category
--     manager_id       → responsible_person_id
-- =============================================================================
UPDATE control.entity_field ef
SET    column_name = 'cost_center_category'
FROM   control.entity_version ev
JOIN   control.entity e ON e.id = ev.entity_id
WHERE  ef.entity_version_id = ev.id
  AND  e.name = 'cost_center' AND ev.version_no = 1
  AND  ef.name = 'cost_center_type'
  AND  ef.column_name = 'cost_center_type';

UPDATE control.entity_field ef
SET    column_name = 'responsible_person_id'
FROM   control.entity_version ev
JOIN   control.entity e ON e.id = ev.entity_id
WHERE  ef.entity_version_id = ev.id
  AND  e.name = 'cost_center' AND ev.version_no = 1
  AND  ef.name = 'manager_id'
  AND  ef.column_name = 'manager_id';


-- =============================================================================
-- §2  master.profit_center
--     pc_type    → profit_center_type
--     manager_id → responsible_person_id
-- =============================================================================
UPDATE control.entity_field ef
SET    column_name = 'profit_center_type'
FROM   control.entity_version ev
JOIN   control.entity e ON e.id = ev.entity_id
WHERE  ef.entity_version_id = ev.id
  AND  e.name = 'profit_center' AND ev.version_no = 1
  AND  ef.name = 'pc_type'
  AND  ef.column_name = 'pc_type';

UPDATE control.entity_field ef
SET    column_name = 'responsible_person_id'
FROM   control.entity_version ev
JOIN   control.entity e ON e.id = ev.entity_id
WHERE  ef.entity_version_id = ev.id
  AND  e.name = 'profit_center' AND ev.version_no = 1
  AND  ef.name = 'manager_id'
  AND  ef.column_name = 'manager_id';


-- =============================================================================
-- §3  master.project
--     start_date        → planned_start
--     end_date          → planned_end
--     budget_amount     → planned_cost
--     currency_id       → currency_code
--     project_manager_id → responsible_person_id
-- =============================================================================
UPDATE control.entity_field ef
SET    column_name = 'planned_start'
FROM   control.entity_version ev
JOIN   control.entity e ON e.id = ev.entity_id
WHERE  ef.entity_version_id = ev.id
  AND  e.name = 'project' AND ev.version_no = 1
  AND  ef.name = 'start_date'
  AND  ef.column_name = 'start_date';

UPDATE control.entity_field ef
SET    column_name = 'planned_end'
FROM   control.entity_version ev
JOIN   control.entity e ON e.id = ev.entity_id
WHERE  ef.entity_version_id = ev.id
  AND  e.name = 'project' AND ev.version_no = 1
  AND  ef.name = 'end_date'
  AND  ef.column_name = 'end_date';

UPDATE control.entity_field ef
SET    column_name = 'planned_cost'
FROM   control.entity_version ev
JOIN   control.entity e ON e.id = ev.entity_id
WHERE  ef.entity_version_id = ev.id
  AND  e.name = 'project' AND ev.version_no = 1
  AND  ef.name = 'budget_amount'
  AND  ef.column_name = 'budget_amount';

UPDATE control.entity_field ef
SET    column_name = 'currency_code'
FROM   control.entity_version ev
JOIN   control.entity e ON e.id = ev.entity_id
WHERE  ef.entity_version_id = ev.id
  AND  e.name = 'project' AND ev.version_no = 1
  AND  ef.name = 'currency_id'
  AND  ef.column_name = 'currency_id';

UPDATE control.entity_field ef
SET    column_name = 'responsible_person_id'
FROM   control.entity_version ev
JOIN   control.entity e ON e.id = ev.entity_id
WHERE  ef.entity_version_id = ev.id
  AND  e.name = 'project' AND ev.version_no = 1
  AND  ef.name = 'project_manager_id'
  AND  ef.column_name = 'project_manager_id';


-- =============================================================================
-- §4  master.project_item
--     planned_amount → planned_cost
--     currency_id    → currency_code
-- =============================================================================
UPDATE control.entity_field ef
SET    column_name = 'planned_cost'
FROM   control.entity_version ev
JOIN   control.entity e ON e.id = ev.entity_id
WHERE  ef.entity_version_id = ev.id
  AND  e.name = 'project_item' AND ev.version_no = 1
  AND  ef.name = 'planned_amount'
  AND  ef.column_name = 'planned_amount';

UPDATE control.entity_field ef
SET    column_name = 'currency_code'
FROM   control.entity_version ev
JOIN   control.entity e ON e.id = ev.entity_id
WHERE  ef.entity_version_id = ev.id
  AND  e.name = 'project_item' AND ev.version_no = 1
  AND  ef.name = 'currency_id'
  AND  ef.column_name = 'currency_id';


-- =============================================================================
-- §5  master.gl_account
--     account_nature → account_class
--     account_level  → level_no
--     account_path   → path
--     currency_id    → currency_code
--     DELETE balance_type (duplicate of normal_balance which is already registered)
-- =============================================================================
UPDATE control.entity_field ef
SET    column_name = 'account_class'
FROM   control.entity_version ev
JOIN   control.entity e ON e.id = ev.entity_id
WHERE  ef.entity_version_id = ev.id
  AND  e.name = 'gl_account' AND ev.version_no = 1
  AND  ef.name = 'account_nature'
  AND  ef.column_name = 'account_nature';

UPDATE control.entity_field ef
SET    column_name = 'level_no'
FROM   control.entity_version ev
JOIN   control.entity e ON e.id = ev.entity_id
WHERE  ef.entity_version_id = ev.id
  AND  e.name = 'gl_account' AND ev.version_no = 1
  AND  ef.name = 'account_level'
  AND  ef.column_name = 'account_level';

UPDATE control.entity_field ef
SET    column_name = 'path'
FROM   control.entity_version ev
JOIN   control.entity e ON e.id = ev.entity_id
WHERE  ef.entity_version_id = ev.id
  AND  e.name = 'gl_account' AND ev.version_no = 1
  AND  ef.name = 'account_path'
  AND  ef.column_name = 'account_path';

UPDATE control.entity_field ef
SET    column_name = 'currency_code'
FROM   control.entity_version ev
JOIN   control.entity e ON e.id = ev.entity_id
WHERE  ef.entity_version_id = ev.id
  AND  e.name = 'gl_account' AND ev.version_no = 1
  AND  ef.name = 'currency_id'
  AND  ef.column_name = 'currency_id';

-- Remove balance_type: it duplicates normal_balance (same column, different field name).
-- normal_balance is already registered separately and is the canonical field.
DELETE FROM control.entity_field ef
USING control.entity_version ev
JOIN  control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.name = 'gl_account' AND ev.version_no = 1
  AND ef.name = 'balance_type';


-- =============================================================================
-- §6  master.chart_of_account
--     coa_type → framework
-- =============================================================================
UPDATE control.entity_field ef
SET    column_name = 'framework'
FROM   control.entity_version ev
JOIN   control.entity e ON e.id = ev.entity_id
WHERE  ef.entity_version_id = ev.id
  AND  e.name = 'chart_of_account' AND ev.version_no = 1
  AND  ef.name = 'coa_type'
  AND  ef.column_name = 'coa_type';


-- =============================================================================
-- §7  master.legal_entity
--     tax_identifier field: column_name tax_id → tax_registration_number
--     DELETE currency_id (legal_entity uses char(3) functional_currency, not a uuid FK)
-- =============================================================================
UPDATE control.entity_field ef
SET    column_name = 'tax_registration_number'
FROM   control.entity_version ev
JOIN   control.entity e ON e.id = ev.entity_id
WHERE  ef.entity_version_id = ev.id
  AND  e.name = 'legal_entity' AND ev.version_no = 1
  AND  ef.name = 'tax_identifier'
  AND  ef.column_name = 'tax_id';

-- currency_id registered as uuid/reference but legal_entity has no uuid currency FK.
-- Functional currency is char(3) functional_currency — remove the orphaned field.
DELETE FROM control.entity_field ef
USING control.entity_version ev
JOIN  control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.name = 'legal_entity' AND ev.version_no = 1
  AND ef.name = 'currency_id';


-- =============================================================================
-- §8  master.fiscal_period
--     period_no      → period_number
--     posting_status → status
-- =============================================================================
UPDATE control.entity_field ef
SET    column_name = 'period_number'
FROM   control.entity_version ev
JOIN   control.entity e ON e.id = ev.entity_id
WHERE  ef.entity_version_id = ev.id
  AND  e.name = 'fiscal_period' AND ev.version_no = 1
  AND  ef.name = 'period_no'
  AND  ef.column_name = 'period_no';

UPDATE control.entity_field ef
SET    column_name = 'status'
FROM   control.entity_version ev
JOIN   control.entity e ON e.id = ev.entity_id
WHERE  ef.entity_version_id = ev.id
  AND  e.name = 'fiscal_period' AND ev.version_no = 1
  AND  ef.name = 'posting_status'
  AND  ef.column_name = 'posting_status';


-- =============================================================================
-- §9  master.dimension_set
--     company_code_id and is_mandatory do not exist on dimension_set.
--     dimension_set is a content-addressed composite key table; these fields
--     belong to dimension_entry or dimension_type, not the set header.
-- =============================================================================
DELETE FROM control.entity_field ef
USING control.entity_version ev
JOIN  control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.name = 'dimension_set' AND ev.version_no = 1
  AND ef.name IN ('company_code_id', 'is_mandatory');


-- =============================================================================
-- §10  master.warehouse
--      company_code_id — warehouse is scoped via site_id (site → company_code).
--      address_id      — address inherited from parent site, not inline.
--      Both columns do not exist on master.warehouse.
-- =============================================================================
DELETE FROM control.entity_field ef
USING control.entity_version ev
JOIN  control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.name = 'warehouse' AND ev.version_no = 1
  AND ef.name IN ('company_code_id', 'address_id');


-- =============================================================================
-- §11  master.attachment
--      file_size → size_bytes
--      mime_type → content_type
--      checksum  → sha256
--      owner_type and owner_id: attachment ownership is via entity_document_link,
--      not inline columns (per table design). Remove these orphaned fields.
--      is_public: column does not exist on master.attachment.
-- =============================================================================
UPDATE control.entity_field ef
SET    column_name = 'size_bytes'
FROM   control.entity_version ev
JOIN   control.entity e ON e.id = ev.entity_id
WHERE  ef.entity_version_id = ev.id
  AND  e.name = 'attachment' AND ev.version_no = 1
  AND  ef.name = 'file_size'
  AND  ef.column_name = 'file_size';

UPDATE control.entity_field ef
SET    column_name = 'content_type'
FROM   control.entity_version ev
JOIN   control.entity e ON e.id = ev.entity_id
WHERE  ef.entity_version_id = ev.id
  AND  e.name = 'attachment' AND ev.version_no = 1
  AND  ef.name = 'mime_type'
  AND  ef.column_name = 'mime_type';

UPDATE control.entity_field ef
SET    column_name = 'sha256'
FROM   control.entity_version ev
JOIN   control.entity e ON e.id = ev.entity_id
WHERE  ef.entity_version_id = ev.id
  AND  e.name = 'attachment' AND ev.version_no = 1
  AND  ef.name = 'checksum'
  AND  ef.column_name = 'checksum';

DELETE FROM control.entity_field ef
USING control.entity_version ev
JOIN  control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.name = 'attachment' AND ev.version_no = 1
  AND ef.name IN ('owner_type', 'owner_id', 'is_public');


-- =============================================================================
-- §12  master.multipart_upload
--      mime_type   → content_type
--      total_parts — column does not exist on master.multipart_upload (uses part_etags jsonb)
-- =============================================================================
UPDATE control.entity_field ef
SET    column_name = 'content_type'
FROM   control.entity_version ev
JOIN   control.entity e ON e.id = ev.entity_id
WHERE  ef.entity_version_id = ev.id
  AND  e.name = 'multipart_upload' AND ev.version_no = 1
  AND  ef.name = 'mime_type'
  AND  ef.column_name = 'mime_type';

DELETE FROM control.entity_field ef
USING control.entity_version ev
JOIN  control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.name = 'multipart_upload' AND ev.version_no = 1
  AND ef.name = 'total_parts';


-- =============================================================================
-- §13  master.comment
--      parent_id   → parent_comment_id
--      body        → comment_text
--      body_format, is_flagged, is_pinned — not in master.comment DDL; remove.
-- =============================================================================
UPDATE control.entity_field ef
SET    column_name = 'parent_comment_id'
FROM   control.entity_version ev
JOIN   control.entity e ON e.id = ev.entity_id
WHERE  ef.entity_version_id = ev.id
  AND  e.name = 'comment' AND ev.version_no = 1
  AND  ef.name = 'parent_id'
  AND  ef.column_name = 'parent_id';

UPDATE control.entity_field ef
SET    column_name = 'comment_text'
FROM   control.entity_version ev
JOIN   control.entity e ON e.id = ev.entity_id
WHERE  ef.entity_version_id = ev.id
  AND  e.name = 'comment' AND ev.version_no = 1
  AND  ef.name = 'body'
  AND  ef.column_name = 'body';

DELETE FROM control.entity_field ef
USING control.entity_version ev
JOIN  control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.name = 'comment' AND ev.version_no = 1
  AND ef.name IN ('body_format', 'is_flagged', 'is_pinned');


-- =============================================================================
-- §14  master.comment_draft
--      body → draft_text
-- =============================================================================
UPDATE control.entity_field ef
SET    column_name = 'draft_text'
FROM   control.entity_version ev
JOIN   control.entity e ON e.id = ev.entity_id
WHERE  ef.entity_version_id = ev.id
  AND  e.name = 'comment_draft' AND ev.version_no = 1
  AND  ef.name = 'body'
  AND  ef.column_name = 'body';


-- =============================================================================
-- §15  master.comment_mention
--      principal_id → mentioned_id
-- =============================================================================
UPDATE control.entity_field ef
SET    column_name = 'mentioned_id'
FROM   control.entity_version ev
JOIN   control.entity e ON e.id = ev.entity_id
WHERE  ef.entity_version_id = ev.id
  AND  e.name = 'comment_mention' AND ev.version_no = 1
  AND  ef.name = 'principal_id'
  AND  ef.column_name = 'principal_id';


-- =============================================================================
-- §16  master.comment_reaction
--      emoji → reaction_type
-- =============================================================================
UPDATE control.entity_field ef
SET    column_name = 'reaction_type'
FROM   control.entity_version ev
JOIN   control.entity e ON e.id = ev.entity_id
WHERE  ef.entity_version_id = ev.id
  AND  e.name = 'comment_reaction' AND ev.version_no = 1
  AND  ef.name = 'emoji'
  AND  ef.column_name = 'emoji';


-- =============================================================================
-- §17  master.conversation
--      subject     → title
--      is_resolved, resolved_at — not in master.conversation DDL; remove.
-- =============================================================================
UPDATE control.entity_field ef
SET    column_name = 'title'
FROM   control.entity_version ev
JOIN   control.entity e ON e.id = ev.entity_id
WHERE  ef.entity_version_id = ev.id
  AND  e.name = 'conversation' AND ev.version_no = 1
  AND  ef.name = 'subject'
  AND  ef.column_name = 'subject';

DELETE FROM control.entity_field ef
USING control.entity_version ev
JOIN  control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.name = 'conversation' AND ev.version_no = 1
  AND ef.name IN ('is_resolved', 'resolved_at');


-- =============================================================================
-- §18  master.company_code_customer_profile
--      ar_account_id    → ar_gl_account_id
--      credit_limit_local → credit_limit
-- =============================================================================
UPDATE control.entity_field ef
SET    column_name = 'ar_gl_account_id'
FROM   control.entity_version ev
JOIN   control.entity e ON e.id = ev.entity_id
WHERE  ef.entity_version_id = ev.id
  AND  e.name = 'company_code_customer_profile' AND ev.version_no = 1
  AND  ef.name = 'ar_account_id'
  AND  ef.column_name = 'ar_account_id';

UPDATE control.entity_field ef
SET    column_name = 'credit_limit'
FROM   control.entity_version ev
JOIN   control.entity e ON e.id = ev.entity_id
WHERE  ef.entity_version_id = ev.id
  AND  e.name = 'company_code_customer_profile' AND ev.version_no = 1
  AND  ef.name = 'credit_limit_local'
  AND  ef.column_name = 'credit_limit_local';


-- =============================================================================
-- §19  master.company_code_supplier_profile
--      ap_account_id → ap_gl_account_id
-- =============================================================================
UPDATE control.entity_field ef
SET    column_name = 'ap_gl_account_id'
FROM   control.entity_version ev
JOIN   control.entity e ON e.id = ev.entity_id
WHERE  ef.entity_version_id = ev.id
  AND  e.name = 'company_code_supplier_profile' AND ev.version_no = 1
  AND  ef.name = 'ap_account_id'
  AND  ef.column_name = 'ap_account_id';


RAISE NOTICE '035_version_fields/099_fix_entity_field_column_mappings: done';
END $$;
