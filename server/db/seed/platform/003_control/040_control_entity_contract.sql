-- Entity identity is derived from the physical table: name = entity_code = table_name,
-- slug = replace(table_name, '_', '-'). curated_overrides CTE hand-tunes specific entities;
-- everything else is generated from information_schema.

WITH
constants AS (
    SELECT '00000000-0000-0000-0000-000000000000'::uuid AS system_user_id
),
curated_overrides (
    table_schema,
    table_name,
    module_code,
    entity_short,
    entity_class,
    kind,
    backing_type,
    governance_level,
    security_tier,
    mutability,
    label_singular,
    label_plural,
    icon_key,
    color_token,
    feature_flags,
    display_config,
    identity_config,
    search_config,
    data_policy,
    concurrency_policy,
    status
) AS (
    VALUES
        ('control', 'supplier_posting_override', 'ACC', 'CSPO', 'CONTROL', 'ent', 'table', 'standard', 'tenant_critical', 'controlled', 'Supplier Posting Override', 'Supplier Posting Overrides', 'book-open', 'rose', '{"parent_entity":"company_code_supplier_profile","parent_fk":"supplier_profile_id"}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('control', 'tax_group', 'ACC', 'TAXGRP', 'CONTROL', 'ent', 'table', 'full', 'operational', 'controlled', 'Tax Group', 'Tax Groups', 'receipt-text', 'orange', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('document', 'accounting_distribution', 'ACC', 'ACCD', 'DOCUMENT_RELATION', 'ent', 'table', 'full', 'tenant_critical', 'locked', 'Account Assignment Split', 'Account Assignment Splits', 'split', 'slate', '{"polymorphic_parent":true,"parent_source_type_field":"source_doc_type","parent_source_id_field":"source_doc_id","parent_source_line_field":"source_line_id","auto_generated":true}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('document', 'journal_entry', 'ACC', 'JE', 'DOCUMENT', 'ent', 'table', 'full', 'tenant_critical', 'controlled', 'Journal Entry', 'Journal Entries', 'book-open', 'slate', '{"is_approvable":true,"has_workflow":true,"document_category":"general_ledger","allow_on_behalf_of":false,"has_lines":true,"auto_number":true}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('document', 'journal_line', 'ACC', 'JL', 'DOCUMENT_RELATION', 'ent', 'table', 'full', 'tenant_critical', 'controlled', 'Journal Line', 'Journal Lines', 'list', 'slate', '{"parent_entity":"journal_entry","parent_fk":"journal_entry_id","line_editor":true,"posting_controlled":true,"dimension_controlled":true}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('document', 'journal_line_reference', 'ACC', 'JLR', 'DOCUMENT_RELATION', 'ent', 'table', 'full', 'tenant_critical', 'controlled', 'Journal Line Reference', 'Journal Line References', 'link', 'slate', '{"parent_entity":"journal_line","parent_fk":"journal_line_id","append_only_after_submission":true,"reference_picker":true}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('document', 'payment_entry', 'ACC', 'PAY', 'DOCUMENT', 'ent', 'table', 'full', 'tenant_critical', 'controlled', 'Payment Entry', 'Payment Entries', 'banknote', 'emerald', '{"is_approvable":true,"has_workflow":true,"document_category":"payments","allow_on_behalf_of":false,"has_lines":true,"auto_number":true}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('document', 'purchase_invoice', 'ACC', 'INV', 'DOCUMENT', 'ent', 'table', 'full', 'tenant_critical', 'controlled', 'Purchase Invoice', 'Purchase Invoices', 'file-text', 'violet', '{"is_approvable":true,"has_workflow":true,"document_category":"payables","allow_on_behalf_of":false,"has_lines":true,"catalog_feature_enabled":false,"auto_number":true}'::jsonb, '{"line_ui_variant":"procure","line_entity_code":"purchase_invoice_line"}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('document', 'purchase_invoice_line', 'ACC', 'PINV_L', 'DOCUMENT_RELATION', 'ent', 'table', 'full', 'tenant_critical', 'controlled', 'Invoice Line', 'Invoice Lines', 'list', 'violet', '{"parent_entity":"purchase_invoice","has_accounting_distribution":true,"has_matching":true}'::jsonb, '{"line_ui_variant":"procure","default_sort_field":"line_no","default_sort_order":"asc"}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('document', 'seed_gift', 'ACC', 'SGIFT', 'DOCUMENT', 'ent', 'table', 'standard', 'operational', 'controlled', 'Seed Gift', 'Seed Gifts', 'gift', 'emerald', '{"has_attachments":true,"is_importable":true,"is_exportable":true,"has_lifecycle":false,"has_workflow":false,"document_category":"prototype","prototype_scope":"ATHQ"}'::jsonb, '{"detail_renderer":"document","list_columns":["gift_code","title","recipient_name","gift_type","gift_value","currency_code","status"],"title_field":"title","subtitle_field":"gift_code","default_sort_field":"created_at"}'::jsonb, '{"natural_key_fields":["gift_code"],"business_key_fields":["gift_code"],"title_field":"title","subtitle_field":"gift_code"}'::jsonb, '{"enabled":true,"fields":["gift_code","title","description","recipient_name","recipient_email","source_ref"]}'::jsonb, '{"classification":"internal","retention_days":365,"legal_hold_eligible":false}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('document', 'purchase_order', 'BUY', 'PO', 'DOCUMENT', 'ent', 'view', 'full', 'tenant_critical', 'controlled', 'Purchase Order', 'Purchase Orders', 'shopping-cart', 'orange', '{"is_approvable":true,"has_workflow":true,"document_category":"purchasing","allow_on_behalf_of":false,"has_lines":true,"auto_number":true,"write_facade":"PurchaseOrderFacade","backing_source":"commitment"}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('document', 'user_profile_update_request', 'IAM', 'UPUPR', 'DOCUMENT', 'ent', 'table', 'full', 'tenant_critical', 'controlled', 'Profile Update Request', 'Profile Update Requests', 'user-pen', 'blue', '{"is_approvable":true,"document_category":"hr_request","allow_on_behalf_of":false,"requires_supervisor_approval":true}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'access_grant', 'IAM', 'AGRANT', 'CONTROL', 'ent', 'table', 'full', 'platform_critical', 'controlled', 'Access Grant', 'Access Grants', 'key', 'red', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'accounting_profile', 'ACC', 'ACCP', 'MASTER', 'ent', 'table', 'full', 'tenant_critical', 'controlled', 'Accounting Profile', 'Accounting Profiles', 'layers', 'blue', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'address', 'IAM', 'ADDR', 'MASTER', 'ent', 'table', 'full', 'operational', 'controlled', 'Address', 'Addresses', 'map-pin', 'gray', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'address_link', 'IAM', 'ADDRL', 'RELATION', 'ent', 'table', 'full', 'operational', 'controlled', 'Address Link', 'Address Links', 'map-pin', 'gray', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'asset', 'ACC', 'ASSET', 'MASTER', 'ent', 'table', 'full', 'operational', 'extensible', 'Asset', 'Assets', 'hard-drive', 'yellow', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'asset_assignment_history', 'ACC', 'ASTASGN', 'LOG', 'ent', 'table', 'lite', 'operational', 'locked', 'Asset Assignment History', 'Asset Assignment History', 'history', 'yellow', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'asset_book', 'ACC', 'ASTBK', 'DOCUMENT_RELATION', 'ent', 'table', 'full', 'operational', 'controlled', 'Asset Book', 'Asset Books', 'book-marked', 'yellow', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'asset_class', 'ACC', 'ASCLS', 'MASTER', 'ent', 'table', 'full', 'config', 'controlled', 'Asset Class', 'Asset Classes', 'layers', 'yellow', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'asset_component', 'ACC', 'ASTCMP', 'DOCUMENT_RELATION', 'ent', 'table', 'full', 'operational', 'controlled', 'Asset Component', 'Asset Components', 'cpu', 'yellow', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'attachment', 'CMS', 'ATTACH', 'MASTER', 'ent', 'table', 'full', 'operational', 'controlled', 'Attachment', 'Attachments', 'paperclip', 'amber', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'attachment_acl', 'CMS', 'AACL', 'CONTROL', 'ent', 'table', 'full', 'tenant_critical', 'controlled', 'Attachment Access', 'Attachment Access', 'shield', 'amber', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'attachment_comment', 'ACT', 'ACMT', 'RELATION', 'ent', 'table', 'standard', 'operational', 'locked', 'Attachment Comment', 'Attachment Comments', 'file-text', 'purple', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'auth_group', 'IAM', 'AGRP', 'MASTER', 'ent', 'table', 'full', 'tenant_critical', 'controlled', 'Group', 'Groups', 'users', 'blue', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'auth_group_member', 'IAM', 'AGMB', 'RELATION', 'ent', 'table', 'full', 'tenant_critical', 'controlled', 'Group Member', 'Group Members', 'user-plus', 'blue', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'auth_group_role', 'IAM', 'AGRL', 'RELATION', 'ent', 'table', 'full', 'tenant_critical', 'controlled', 'Group Role', 'Group Roles', 'shield-check', 'blue', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'bank_account', 'PAY', 'BKACC', 'MASTER', 'ent', 'table', 'full', 'tenant_critical', 'controlled', 'Bank Account', 'Bank Accounts', 'credit-card', 'blue', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'bank_account_house_config', 'PAY', 'BKHCFG', 'CONTROL', 'ent', 'table', 'full', 'tenant_critical', 'controlled', 'House Bank Config', 'House Bank Configs', 'settings', 'blue', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'bank_account_link', 'PAY', 'BKACCL', 'RELATION', 'ent', 'table', 'full', 'tenant_critical', 'controlled', 'Bank Account Link', 'Bank Account Links', 'link', 'blue', '{"requires_owner_type_scope":true,"owner_type_column":"owner_type"}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'bank_party', 'PAY', 'BKPTY', 'MASTER', 'ent', 'table', 'full', 'operational', 'controlled', 'Bank', 'Banks', 'landmark', 'blue', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'brand_profile', 'DOC', 'BRAND', 'MASTER', 'ent', 'table', 'standard', 'config', 'controlled', 'Brand Profile', 'Brand Profiles', 'palette', 'violet', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'budget_allocation', 'BUDGET', 'BUDGA', 'DOCUMENT', 'ent', 'table', 'full', 'operational', 'controlled', 'Budget Allocation', 'Budget Allocations', 'bar-chart-3', 'green', '{"is_approvable":true}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'budget_profile', 'BUDGET', 'BUDGP', 'MASTER', 'ent', 'table', 'full', 'operational', 'controlled', 'Budget Profile', 'Budget Profiles', 'pie-chart', 'green', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'business_intent', 'ACC', 'BINT', 'CONTROL', 'ent', 'table', 'full', 'tenant_critical', 'controlled', 'Business Intent', 'Business Intents', 'lightbulb', 'teal', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'business_partner', 'ACC', 'BP', 'MASTER', 'ent', 'table', 'full', 'operational', 'extensible', 'Business Partner', 'Business Partners', 'building', 'indigo', '{"is_approvable":false,"party_category":"business_partner","allow_address":true,"allow_contact":true,"is_readonly":false,"list_entity_code":"v_business_partner_app_index","duplicate_check":{"hard_gate":true,"block_on_exact":true,"exact_fields":["registration_no","identifier","tax_number"],"strong_name_threshold":0.85,"weak_name_threshold":0.55,"redirect_modes":["edit_existing","extend_role","extend_company_code"]},"extension_modes":["supplier_role","customer_role","supplier_company_code","customer_company_code"],"ownership_lanes":{"identity":["name","legal_name","registration_no","registration_country_code","tax_residence_country_code"],"supplier":["supplier_type","commodity_category_id","payment_term_id","payment_method_id"],"customer":["customer_type","is_key_account","risk_rating"],"finance_ap":["company_code_supplier_profile"],"finance_ar":["company_code_customer_profile"]}}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'business_partner_network_link', 'ACC', 'BPNL', 'MASTER', 'ent', 'table', 'standard', 'operational', 'controlled', 'Network Link', 'Network Links', 'network', 'indigo', '{"parent_entity":"business_partner","parent_fk":"business_partner_id"}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'certification', 'BUY', 'BPC', 'MASTER', 'ent', 'table', 'standard', 'operational', 'controlled', 'Certification', 'Certifications', 'award', 'yellow', '{"parent_entity":"business_partner","parent_fk":"owner_id","parent_scope":"owner_type=business_partner","allow_attachment":true}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'chart_of_account', 'ACC', 'COA', 'MASTER', 'ent', 'table', 'full', 'tenant_critical', 'controlled', 'Chart of Accounts', 'Charts of Accounts', 'list-tree', 'green', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'comment', 'ACT', 'CMT', 'DOCUMENT', 'ent', 'table', 'full', 'operational', 'controlled', 'Comment', 'Comments', 'message-square', 'purple', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'comment_draft', 'ACT', 'CMTD', 'DOCUMENT', 'ent', 'table', 'standard', 'operational', 'controlled', 'Comment Draft', 'Comment Drafts', 'pencil', 'purple', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'comment_feed_cursor', 'ACT', 'CFCRS', 'CONTROL', 'ent', 'table', 'lite', 'config', 'locked', 'Feed Cursor', 'Feed Cursors', 'mouse-pointer', 'gray', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'comment_mention', 'ACT', 'CMTM', 'RELATION', 'ent', 'table', 'standard', 'operational', 'locked', 'Comment Mention', 'Comment Mentions', 'at-sign', 'purple', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'comment_reaction', 'ACT', 'CMTR', 'RELATION', 'ent', 'table', 'standard', 'operational', 'locked', 'Comment Reaction', 'Comment Reactions', 'smile', 'purple', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'company_code', 'ACC', 'CC', 'MASTER', 'ent', 'table', 'full', 'tenant_critical', 'controlled', 'Company Code', 'Company Codes', 'briefcase', 'emerald', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'company_code_access', 'IAM', 'CCA', 'CONTROL', 'ent', 'table', 'full', 'tenant_critical', 'controlled', 'Company Code Access', 'Company Code Access', 'key-square', 'blue', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'company_code_book_assignment', 'ACC', 'CCBK', 'RELATION', 'ent', 'table', 'full', 'tenant_critical', 'controlled', 'Book Assignment', 'Book Assignments', 'link-2', 'green', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'company_code_chart_assignment', 'ACC', 'CCCOA', 'RELATION', 'ent', 'table', 'full', 'tenant_critical', 'controlled', 'COA Assignment', 'COA Assignments', 'link', 'green', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'company_code_customer_profile', 'ACC', 'CCCP', 'MASTER', 'ent', 'table', 'full', 'operational', 'controlled', 'Customer Company Profile', 'Customer Company Profiles', 'user-cog', 'sky', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'company_code_dimension_default', 'ACC', 'CCDD', 'CONTROL', 'ent', 'table', 'full', 'operational', 'controlled', 'Dimension Default', 'Dimension Defaults', 'settings', 'teal', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'company_code_gl_account', 'ACC', 'CCGLA', 'RELATION', 'ent', 'table', 'full', 'tenant_critical', 'controlled', 'Company GL Account', 'Company GL Accounts', 'book-copy', 'green', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'company_code_intent_policy', 'ACC', 'CCIP', 'CONTROL', 'ent', 'table', 'full', 'tenant_critical', 'controlled', 'Company Intent Policy', 'Company Intent Policies', 'shield-check', 'teal', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'company_code_supplier_intent_policy', 'BUY', 'CCSI', 'MASTER', 'ent', 'table', 'standard', 'operational', 'controlled', 'Supplier Intent Policy', 'Supplier Intent Policies', 'target', 'violet', '{"parent_entity":"company_code_supplier_profile","parent_fk":"supplier_profile_id"}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'company_code_supplier_posting_override', 'ACC', 'CSPO', 'MASTER', 'ent', 'table', 'standard', 'tenant_critical', 'controlled', 'Supplier Posting Override', 'Supplier Posting Overrides', 'book-open', 'rose', '{"parent_entity":"company_code_supplier_profile","parent_fk":"supplier_profile_id"}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'company_code_supplier_profile', 'ACC', 'CCSUP', 'MASTER', 'ent', 'table', 'full', 'operational', 'controlled', 'Supplier Company Profile', 'Supplier Company Profiles', 'truck', 'orange', '{"parent_entity":"supplier","parent_fk":"supplier_id"}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'contact_email', 'IAM', 'CEMAIL', 'RELATION', 'ent', 'table', 'standard', 'operational', 'controlled', 'Contact Email', 'Contact Emails', 'mail', 'gray', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'contact_link', 'IAM', 'CLINK', 'RELATION', 'ent', 'table', 'standard', 'operational', 'controlled', 'Contact Link', 'Contact Links', 'contact', 'gray', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'contact_phone', 'IAM', 'CPHONE', 'RELATION', 'ent', 'table', 'standard', 'operational', 'controlled', 'Contact Phone', 'Contact Phones', 'phone', 'gray', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'content_item', 'CMS', 'CTNT', 'MASTER', 'ent', 'table', 'full', 'operational', 'controlled', 'Content Item', 'Content Items', 'file-text', 'cyan', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'content_item_access_grant', 'CMS', 'CTNTAG', 'CONTROL', 'ent', 'table', 'full', 'operational', 'controlled', 'Content Access Grant', 'Content Access Grants', 'shield-check', 'cyan', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'content_item_link', 'CMS', 'CTNTL', 'RELATION', 'ent', 'table', 'standard', 'operational', 'controlled', 'Content Link', 'Content Links', 'link', 'cyan', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'conversation', 'ACT', 'CONV', 'MASTER', 'ent', 'table', 'full', 'operational', 'controlled', 'Conversation', 'Conversations', 'messages-square', 'purple', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'conversation_participant', 'ACT', 'CONVP', 'RELATION', 'ent', 'table', 'standard', 'operational', 'controlled', 'Conversation Participant', 'Conversation Participants', 'user-round', 'purple', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'cost_center', 'ACC', 'CCTR', 'MASTER', 'ent', 'table', 'full', 'operational', 'controlled', 'Cost Center', 'Cost Centers', 'target', 'emerald', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'customer', 'CRM', 'CUS', 'MASTER', 'ent', 'table', 'standard', 'operational', 'controlled', 'Customer', 'Customers', 'users', 'teal', '{"is_approvable":false,"party_category":"customer","allow_address":false,"allow_contact":false,"identity_via":"business_partner","list_entity_code":"customer_app_index"}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'customer_app_index', 'CRM', 'CAI', 'AGGREGATE', 'aggregate', 'table', 'standard', 'operational', 'locked', 'Customer Index', 'Customer Index', 'users', 'teal', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'customer_block', 'CRM', 'CBK', 'MASTER', 'ent', 'table', 'standard', 'tenant_critical', 'controlled', 'Customer Block', 'Customer Blocks', 'ban', 'red', '{"parent_entity":"customer","parent_fk":"customer_id"}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'customer_qualification', 'CRM', 'CQL', 'MASTER', 'ent', 'table', 'standard', 'tenant_critical', 'controlled', 'Credit & Qualification', 'Credit & Qualification', 'shield-check', 'red', '{"parent_entity":"customer","parent_fk":"customer_id","singleton":true,"pii_bearing":true}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'dashboard', 'FND', 'DASH', 'MASTER', 'ent', 'table', 'standard', 'config', 'controlled', 'Dashboard', 'Dashboards', 'layout-dashboard', 'gray', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'dashboard_widget', 'FND', 'DASHWG', 'RELATION', 'ent', 'table', 'standard', 'config', 'controlled', 'Dashboard Widget', 'Dashboard Widgets', 'square', 'gray', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'delegation_grant', 'IAM', 'DLGR', 'CONTROL', 'ent', 'table', 'full', 'tenant_critical', 'controlled', 'Delegation Grant', 'Delegation Grants', 'share-2', 'purple', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'dimension_set', 'ACC', 'DMSET', 'MASTER', 'ent', 'table', 'full', 'operational', 'controlled', 'Dimension Set', 'Dimension Sets', 'layers-3', 'teal', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'dimension_set_item', 'ACC', 'DMSIT', 'RELATION', 'ent', 'table', 'standard', 'operational', 'controlled', 'Dimension Set Item', 'Dimension Set Items', 'list-plus', 'teal', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'dimension_type', 'ACC', 'DMTP', 'DIMENSION', 'ent', 'table', 'full', 'operational', 'extensible', 'Dimension Type', 'Dimension Types', 'layout-grid', 'teal', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'dimension_value', 'ACC', 'DMVAL', 'DIMENSION', 'ent', 'table', 'full', 'operational', 'extensible', 'Dimension Value', 'Dimension Values', 'tag', 'teal', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'document', 'DOC', 'MDOC', 'MASTER', 'ent', 'table', 'full', 'operational', 'controlled', 'Document', 'Documents', 'file-text', 'violet', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'employee', 'IAM', 'EMP', 'MASTER', 'ent', 'table', 'full', 'tenant_critical', 'controlled', 'Employee', 'Employees', 'user-tie', 'blue', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'entity_document_link', 'DOC', 'EDOC', 'RELATION', 'ent', 'table', 'standard', 'operational', 'controlled', 'Entity Document Link', 'Entity Document Links', 'file-symlink', 'violet', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'fiscal_period', 'ACC', 'FPER', 'MASTER', 'ent', 'table', 'full', 'tenant_critical', 'locked', 'Fiscal Period', 'Fiscal Periods', 'calendar', 'green', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'fx_rate', 'TREASURY', 'FXR', 'MASTER', 'ent', 'table', 'full', 'operational', 'locked', 'FX Rate', 'FX Rates', 'arrow-right-left', 'orange', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'gl_account', 'ACC', 'GLA', 'MASTER', 'ent', 'table', 'full', 'tenant_critical', 'controlled', 'GL Account', 'GL Accounts', 'book-open', 'green', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'group_feature_grant', 'IAM', 'GFGR', 'CONTROL', 'ent', 'table', 'full', 'tenant_critical', 'controlled', 'Group Feature Grant', 'Group Feature Grants', 'award', 'blue', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'holiday_calendar', 'PAY', 'HOLCAL', 'MASTER', 'ent', 'table', 'full', 'config', 'controlled', 'Holiday Calendar', 'Holiday Calendars', 'calendar-days', 'slate', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'holiday_calendar_day', 'PAY', 'HOLCALD', 'RELATION', 'ent', 'table', 'standard', 'config', 'locked', 'Holiday', 'Holidays', 'sun', 'slate', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'label', 'FND', 'LBL', 'REFERENCE', 'ent', 'table', 'standard', 'config', 'locked', 'Label', 'Labels', 'tag', 'gray', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'label_entity_type', 'FND', 'LBENT', 'RELATION', 'ent', 'table', 'standard', 'config', 'controlled', 'Label Entity Type', 'Label Entity Types', 'tags', 'gray', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'ledger_book', 'ACC', 'LBK', 'MASTER', 'ent', 'table', 'full', 'tenant_critical', 'controlled', 'Ledger Book', 'Ledger Books', 'book', 'green', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'legal_entity', 'ACC', 'LGE', 'MASTER', 'ent', 'table', 'full', 'tenant_critical', 'controlled', 'Legal Entity', 'Legal Entities', 'landmark', 'purple', '{"is_approvable":false,"party_category":"legal_entity","allow_address":true,"allow_contact":true}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'letterhead', 'DOC', 'LHD', 'MASTER', 'ent', 'table', 'standard', 'config', 'controlled', 'Letterhead', 'Letterheads', 'scroll', 'violet', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'lifecycle_instance', 'WFL', 'LCINS', 'CONTROL', 'ent', 'table', 'full', 'operational', 'locked', 'Lifecycle Instance', 'Lifecycle Instances', 'git-commit', 'teal', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'multipart_upload', 'CMS', 'MPU', 'CONTROL', 'ent', 'table', 'standard', 'operational', 'locked', 'Multipart Upload', 'Multipart Uploads', 'upload-cloud', 'amber', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'notification', 'NTF', 'NOTIF', 'LOG', 'ent', 'table', 'lite', 'operational', 'locked', 'Notification', 'Notifications', 'bell', 'amber', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'notification_default', 'NTF', 'NOTIFD', 'CONTROL', 'ent', 'table', 'standard', 'config', 'controlled', 'Notification Default', 'Notification Defaults', 'bell-ring', 'amber', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'owner_type', 'FND', 'OWNTP', 'REFERENCE', 'ent', 'table', 'standard', 'config', 'locked', 'Owner Type', 'Owner Types', 'shield', 'gray', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'party_contact_person', 'BUY', 'BPCP', 'MASTER', 'ent', 'table', 'standard', 'operational', 'controlled', 'Contact Person', 'Contact Persons', 'user-circle', 'indigo', '{"parent_entity":"business_partner","parent_fk":"party_id","parent_scope":"party_type=business_partner","has_roles":true,"role_entity":"party_contact_role"}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'party_governance_relation', 'BUY', 'BPG', 'MASTER', 'ent', 'table', 'standard', 'tenant_critical', 'controlled', 'Governance Record', 'Governance Records', 'users', 'violet', '{"parent_entity":"business_partner","parent_fk":"party_id","parent_scope":"party_type=business_partner","pii_bearing":true}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'party_identifier', 'BUY', 'BPI', 'MASTER', 'ent', 'table', 'standard', 'operational', 'controlled', 'Business Partner Identifier', 'Business Partner Identifiers', 'fingerprint', 'slate', '{"parent_entity":"business_partner","parent_fk":"owner_id","parent_scope":"owner_type=business_partner"}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'party_tax_profile', 'BUY', 'BPTP', 'MASTER', 'ent', 'table', 'standard', 'tenant_critical', 'controlled', 'Business Partner Tax Profile', 'Business Partner Tax Profiles', 'receipt-tax', 'orange', '{"parent_entity":"business_partner","parent_fk":"owner_id","parent_scope":"owner_type=business_partner","pii_bearing":true}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'payment_method', 'PAY', 'PMTM', 'MASTER', 'ent', 'table', 'full', 'operational', 'controlled', 'Payment Method', 'Payment Methods', 'wallet', 'blue', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'payment_term', 'PAY', 'PMTT', 'MASTER', 'ent', 'table', 'full', 'operational', 'controlled', 'Payment Term', 'Payment Terms', 'clock', 'slate', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'payment_term_clause', 'PAY', 'PMTTC', 'RELATION', 'ent', 'table', 'full', 'operational', 'controlled', 'Payment Term Clause', 'Payment Term Clauses', 'file-text', 'slate', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'payment_term_discount_tier', 'PAY', 'PMTTDT', 'RELATION', 'ent', 'table', 'full', 'operational', 'controlled', 'Discount Tier', 'Discount Tiers', 'percent', 'slate', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'planning_model', 'BUDGET', 'PLNM', 'MASTER', 'ent', 'table', 'full', 'operational', 'controlled', 'Planning Model', 'Planning Models', 'network', 'green', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'principal', 'IAM', 'PRIN', 'MASTER', 'ent', 'table', 'full', 'platform_critical', 'controlled', 'User', 'Users', 'user', 'blue', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'principal_feature_grant', 'IAM', 'PFGR', 'CONTROL', 'ent', 'table', 'full', 'tenant_critical', 'controlled', 'User Feature Grant', 'User Feature Grants', 'star', 'blue', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'principal_identity_binding', 'IAM', 'PIB', 'CONTROL', 'ent', 'table', 'full', 'platform_critical', 'locked', 'Identity Binding', 'Identity Bindings', 'link', 'gray', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'principal_relationship', 'IAM', 'PRREL', 'RELATION', 'ent', 'table', 'full', 'platform_critical', 'locked', 'Principal Relationship', 'Principal Relationships', 'git-merge', 'blue', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'principal_notification_preference', 'NTF', 'PNTFP', 'CONTROL', 'ent', 'table', 'lite', 'config', 'controlled', 'Notification Preference', 'Notification Preferences', 'bell-cog', 'amber', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'principal_persona', 'IAM', 'PPRS', 'RELATION', 'ent', 'table', 'full', 'tenant_critical', 'controlled', 'User Persona', 'User Personas', 'badge', 'blue', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'principal_profile', 'IAM', 'PRINP', 'MASTER', 'ent', 'table', 'full', 'tenant_critical', 'controlled', 'User Profile', 'User Profiles', 'user-circle', 'blue', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'principal_ui_preference', 'FND', 'PUIPR', 'CONTROL', 'ent', 'table', 'lite', 'config', 'controlled', 'UI Preference', 'UI Preferences', 'sliders', 'gray', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'principal_ui_profile', 'FND', 'PUIP', 'CONTROL', 'ent', 'table', 'lite', 'config', 'controlled', 'UI Profile', 'UI Profiles', 'monitor', 'gray', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'print_profile', 'DOC', 'PRFIL', 'MASTER', 'ent', 'table', 'standard', 'config', 'controlled', 'Print Profile', 'Print Profiles', 'printer', 'violet', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'profit_center', 'ACC', 'PCTR', 'MASTER', 'ent', 'table', 'full', 'operational', 'controlled', 'Profit Center', 'Profit Centers', 'trending-up', 'emerald', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'project', 'ACC', 'PROJ', 'MASTER', 'ent', 'table', 'full', 'operational', 'extensible', 'Project', 'Projects', 'folder-kanban', 'teal', '{"is_approvable":false}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'project_item', 'ACC', 'PRJIT', 'DOCUMENT_RELATION', 'ent', 'table', 'full', 'operational', 'extensible', 'Project Item', 'Project Items', 'list-checks', 'teal', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'saved_view', 'FND', 'SVEW', 'CONTROL', 'ent', 'table', 'standard', 'config', 'controlled', 'Saved View', 'Saved Views', 'bookmark', 'gray', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'site', 'ACC', 'SITE', 'MASTER', 'ent', 'table', 'full', 'operational', 'controlled', 'Site', 'Sites', 'map-pin', 'emerald', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'supplier', 'BUY', 'SUP', 'MASTER', 'ent', 'table', 'standard', 'operational', 'controlled', 'Supplier', 'Suppliers', 'building-2', 'blue', '{"is_approvable":false,"party_category":"supplier","allow_address":true,"allow_contact":true,"identity_via":"business_partner","list_entity_code":"supplier_app_index"}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'supplier_app_index', 'BUY', 'SAI', 'AGGREGATE', 'aggregate', 'table', 'standard', 'operational', 'locked', 'Supplier Index', 'Supplier Index', 'building-2', 'blue', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'supplier_block', 'BUY', 'SBK', 'MASTER', 'ent', 'table', 'standard', 'tenant_critical', 'controlled', 'Supplier Block', 'Supplier Blocks', 'ban', 'red', '{"parent_entity":"supplier","parent_fk":"supplier_id"}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'supplier_qualification', 'BUY', 'SQL', 'MASTER', 'ent', 'table', 'standard', 'tenant_critical', 'controlled', 'Qualification & Risk', 'Qualification & Risk', 'shield-check', 'red', '{"parent_entity":"supplier","parent_fk":"supplier_id","singleton":true}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'supplier_commodity_category', 'BUY', 'SCC', 'MASTER', 'ent', 'table', 'standard', 'operational', 'controlled', 'Supplier Commodity Category', 'Supplier Commodity Categories', 'tags', 'amber', '{"parent_entity":"supplier","parent_fk":"supplier_id","generic_runtime_disabled":false,"records_api_disabled":false,"is_hidden":false,"is_readonly":false,"is_exportable":true}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'tax_jurisdiction', 'ACC', 'TAXJ', 'MASTER', 'ent', 'table', 'full', 'operational', 'controlled', 'Tax Jurisdiction', 'Tax Jurisdictions', 'landmark', 'orange', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'tax_type', 'ACC', 'TAXTP', 'MASTER', 'ent', 'table', 'full', 'operational', 'controlled', 'Tax Type', 'Tax Types', 'percent', 'orange', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'team', 'IAM', 'TEAM', 'MASTER', 'ent', 'table', 'full', 'operational', 'controlled', 'Team', 'Teams', 'users-round', 'cyan', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'team_member', 'IAM', 'TMBR', 'RELATION', 'ent', 'table', 'full', 'operational', 'controlled', 'Team Member', 'Team Members', 'user-check', 'cyan', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'template', 'DOC', 'TMPL', 'MASTER', 'ent', 'table', 'standard', 'config', 'controlled', 'Template', 'Templates', 'layout-template', 'violet', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'template_binding', 'DOC', 'TMPLB', 'RELATION', 'ent', 'table', 'standard', 'config', 'controlled', 'Template Binding', 'Template Bindings', 'link-2', 'violet', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'tenant', 'IAM', 'TNT', 'MASTER', 'ent', 'table', 'full', 'platform_critical', 'locked', 'Tenant', 'Tenants', 'building-2', 'indigo', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'tenant_feature_entitlement', 'IAM', 'TFE', 'CONTROL', 'ent', 'table', 'full', 'tenant_critical', 'locked', 'Feature Entitlement', 'Feature Entitlements', 'unlock', 'blue', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'tenant_module_subscription', 'IAM', 'TMS', 'CONTROL', 'ent', 'table', 'full', 'tenant_critical', 'locked', 'Module Subscription', 'Module Subscriptions', 'package-check', 'blue', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'tenant_permission_override', 'IAM', 'TPO', 'CONTROL', 'ent', 'table', 'full', 'platform_critical', 'locked', 'Permission Override', 'Permission Overrides', 'shield-alert', 'red', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'tenant_profile', 'IAM', 'TNTP', 'MASTER', 'ent', 'table', 'full', 'tenant_critical', 'controlled', 'Tenant Profile', 'Tenant Profiles', 'building', 'indigo', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'tenant_relationship', 'IAM', 'TNREL', 'RELATION', 'ent', 'table', 'full', 'platform_critical', 'locked', 'Tenant Relationship', 'Tenant Relationships', 'network', 'indigo', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'v_business_partner_address', 'FND', 'BPA', 'RELATION', 'ent', 'view', 'standard', 'operational', 'controlled', 'BP Address', 'BP Addresses', 'map-pin', 'slate', '{"parent_entity":"business_partner","parent_fk":"owner_id"}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'v_business_partner_app_index', 'ACC', 'BPAI', 'AGGREGATE', 'aggregate', 'view', 'standard', 'operational', 'locked', 'Business Partner Index', 'Business Partner Index', 'combine', 'indigo', '{"is_readonly":true}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'v_business_partner_bank_account', 'PAY', 'BPBKACC', 'RELATION', 'ent', 'view', 'full', 'tenant_critical', 'controlled', 'Business Partner Bank Account', 'Business Partner Bank Accounts', 'credit-card', 'blue', '{"parent_entity":"business_partner","parent_fk":"business_partner_id"}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'v_business_partner_role_summary', 'ACC', 'BPRS', 'AGGREGATE', 'aggregate', 'view', 'standard', 'operational', 'locked', 'Business Partner Role Summary', 'Business Partner Role Summaries', 'combine', 'indigo', '{"parent_entity":"business_partner","parent_fk":"business_partner_id","is_readonly":true}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('master', 'warehouse', 'ACC', 'WHS', 'MASTER', 'ent', 'table', 'full', 'operational', 'controlled', 'Warehouse', 'Warehouses', 'warehouse', 'emerald', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),

        -- â”€â”€ Tier 1: Shared Reference (locked, config) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        ('shared', 'country',            'REL', 'CTY',  'REFERENCE', 'ent', 'table', 'standard', 'config', 'locked',     'Country',            'Countries',            'globe',      'blue',   '{"is_lookupable":true}'::jsonb,                                        '{}'::jsonb, '{"title_field":"name","subtitle_field":"code3"}'::jsonb,         '{"enabled":true,"fields":["name","code","code3","numeric3","calling_code"]}'::jsonb,          '{"mesh_sync":{"enabled":true,"phase":1,"direction":"neon_to_mesh","mode":"snapshot","delete_policy":"deactivate_only","key_fields":["code"],"depends_on":[]}}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('shared', 'currency',           'REL', 'CUR',  'REFERENCE', 'ent', 'table', 'standard', 'config', 'locked',     'Currency',           'Currencies',           'coins',      'green',  '{"is_lookupable":true}'::jsonb,                                        '{}'::jsonb, '{"title_field":"name","subtitle_field":"code"}'::jsonb,           '{"enabled":true,"fields":["name","code","symbol","minor_units","numeric3"]}'::jsonb,          '{"mesh_sync":{"enabled":true,"phase":1,"direction":"neon_to_mesh","mode":"snapshot","delete_policy":"deactivate_only","key_fields":["code"],"depends_on":[]}}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('shared', 'language',           'REL', 'LNG',  'REFERENCE', 'ent', 'table', 'standard', 'config', 'locked',     'Language',           'Languages',            'languages',  'indigo', '{"is_lookupable":true}'::jsonb,                                        '{}'::jsonb, '{"title_field":"name","subtitle_field":"code"}'::jsonb,           '{"enabled":true,"fields":["name","code","native_name","iso639_2"]}'::jsonb,                   '{"mesh_sync":{"enabled":true,"phase":1,"direction":"neon_to_mesh","mode":"snapshot","delete_policy":"deactivate_only","key_fields":["code"],"depends_on":[]}}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('shared', 'locale',             'REL', 'LCL',  'REFERENCE', 'ent', 'table', 'standard', 'config', 'locked',     'Locale',             'Locales',              'map',        'cyan',   '{"is_lookupable":true}'::jsonb,                                        '{}'::jsonb, '{"title_field":"name","subtitle_field":"code"}'::jsonb,           '{"enabled":true,"fields":["name","code","language_code","country_code"]}'::jsonb,             '{"mesh_sync":{"enabled":true,"phase":1,"direction":"neon_to_mesh","mode":"snapshot","delete_policy":"deactivate_only","key_fields":["code"],"depends_on":["shared.language","shared.country"]}}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('shared', 'timezone',           'REL', 'TZN',  'REFERENCE', 'ent', 'table', 'standard', 'config', 'locked',     'Timezone',           'Timezones',            'clock',      'slate',  '{"is_lookupable":true}'::jsonb,                                        '{}'::jsonb, '{"title_field":"name","subtitle_field":"code"}'::jsonb,           '{"enabled":true,"fields":["name","code","utc_offset_minutes"]}'::jsonb,                      '{"mesh_sync":{"enabled":true,"phase":1,"direction":"neon_to_mesh","mode":"snapshot","delete_policy":"deactivate_only","key_fields":["code"],"depends_on":[]}}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('shared', 'uom',                'REL', 'UOM',  'REFERENCE', 'ent', 'table', 'standard', 'config', 'locked',     'Unit of Measure',    'Units of Measure',     'ruler',      'purple', '{"is_lookupable":true}'::jsonb,                                        '{}'::jsonb, '{"title_field":"name","subtitle_field":"code"}'::jsonb,           '{"enabled":true,"fields":["name","code","symbol","quantity_type"]}'::jsonb,                   '{"mesh_sync":{"enabled":true,"phase":1,"direction":"neon_to_mesh","mode":"snapshot","delete_policy":"deactivate_only","key_fields":["code"],"depends_on":[]}}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('shared', 'state_region',       'REL', 'STR',  'REFERENCE', 'ent', 'table', 'standard', 'config', 'locked',     'State / Region',     'States & Regions',     'map-pin',    'amber',  '{"is_lookupable":true,"parent_entity":"country"}'::jsonb,              '{}'::jsonb, '{"title_field":"name","subtitle_field":"code"}'::jsonb,           '{"enabled":true,"fields":["name","code","country_code","category"]}'::jsonb,                  '{"mesh_sync":{"enabled":true,"phase":1,"direction":"neon_to_mesh","mode":"snapshot","delete_policy":"deactivate_only","key_fields":["country_code","code"],"depends_on":["shared.country"]}}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('shared', 'commodity_code',     'REL', 'CMC',  'REFERENCE', 'ent', 'table', 'standard', 'config', 'locked',     'Commodity Code',     'Commodity Codes',      'tag',        'orange', '{"is_lookupable":false,"has_hierarchy":true}'::jsonb,                  '{}'::jsonb, '{"title_field":"name","subtitle_field":"code"}'::jsonb,           '{"enabled":true,"fields":["name","code","domain_code","description","is_leaf"]}'::jsonb,      '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('shared', 'industry_code',      'REL', 'INC',  'REFERENCE', 'ent', 'table', 'standard', 'config', 'locked',     'Industry Code',      'Industry Codes',       'building',   'teal',   '{"is_lookupable":false,"has_hierarchy":true}'::jsonb,                  '{}'::jsonb, '{"title_field":"name","subtitle_field":"code"}'::jsonb,           '{"enabled":true,"fields":["name","code","domain_code","description","is_leaf"]}'::jsonb,      '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),

        -- â”€â”€ Tier 2: Crosswalk / Mapping (controlled â€” admin import only) â”€â”€â”€â”€â”€â”€â”€
        ('shared', 'commodity_crosswalk','REL', 'CMX',  'RELATION',  'ent', 'table', 'lite',     'config', 'controlled', 'Commodity Crosswalk','Commodity Crosswalks', 'shuffle',    'orange', '{"parent_entity":"commodity_code"}'::jsonb,                            '{}'::jsonb, '{}'::jsonb,                                                      '{}'::jsonb,                                                                                  '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('shared', 'industry_crosswalk', 'REL', 'INX',  'RELATION',  'ent', 'table', 'lite',     'config', 'controlled', 'Industry Crosswalk', 'Industry Crosswalks',  'shuffle',    'teal',   '{"parent_entity":"industry_code"}'::jsonb,                             '{}'::jsonb, '{}'::jsonb,                                                      '{}'::jsonb,                                                                                  '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),

        -- â”€â”€ Tier 3: Platform Catalog â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        ('shared', 'workspace',          'META','WSP',  'CONTROL',   'ent', 'table', 'full',     'platform_critical', 'locked',     'Workspace',          'Workspaces',           'layout',     'violet', '{}'::jsonb,                                                            '{}'::jsonb, '{"title_field":"name","subtitle_field":"code"}'::jsonb,           '{"enabled":true,"fields":["name","code","description"]}'::jsonb,                             '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('shared', 'module',             'META','MOD',  'CONTROL',   'ent', 'table', 'full',     'platform_critical', 'locked',     'Module',             'Modules',              'package',    'blue',   '{"parent_entity":"workspace"}'::jsonb,                                '{}'::jsonb, '{"title_field":"name","subtitle_field":"code"}'::jsonb,           '{"enabled":true,"fields":["name","code","description"]}'::jsonb,                             '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('shared', 'permission_category','IAM', 'PCA',  'CONTROL',   'ent', 'table', 'full',     'platform_critical', 'locked',     'Permission Category','Permission Categories','shield',     'slate',  '{}'::jsonb,                                                            '{}'::jsonb, '{"title_field":"name","subtitle_field":"code"}'::jsonb,           '{"enabled":true,"fields":["name","code"]}'::jsonb,                                           '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('shared', 'permission',         'IAM', 'PRM',  'CONTROL',   'ent', 'table', 'full',     'platform_critical', 'locked',     'Permission',         'Permissions',          'lock',       'red',    '{"parent_entity":"permission_category"}'::jsonb,                       '{}'::jsonb, '{"title_field":"name","subtitle_field":"code"}'::jsonb,           '{"enabled":true,"fields":["name","code","scope_type","risk_level"]}'::jsonb,                  '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('shared', 'persona',            'IAM', 'PSN',  'CONTROL',   'ent', 'table', 'standard', 'config',            'controlled', 'Persona',            'Personas',             'users',      'indigo', '{}'::jsonb,                                                            '{}'::jsonb, '{"title_field":"name","subtitle_field":"code"}'::jsonb,           '{"enabled":true,"fields":["name","code","scope_mode"]}'::jsonb,                              '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('shared', 'persona_permission', 'IAM', 'PPN',  'RELATION',  'ent', 'table', 'lite',     'config',            'controlled', 'Persona Permission', 'Persona Permissions',  'link',       'indigo', '{"parent_entity":"persona"}'::jsonb,                                  '{}'::jsonb, '{}'::jsonb,                                                      '{}'::jsonb,                                                                                  '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('shared', 'role',               'IAM', 'ROL',  'CONTROL',   'ent', 'table', 'standard', 'config',            'controlled', 'Role',               'Roles',                'badge',      'amber',  '{"is_lookupable":true}'::jsonb,                                        '{}'::jsonb, '{"title_field":"name","subtitle_field":"code"}'::jsonb,           '{"enabled":true,"fields":["name","code","kc_role_code"]}'::jsonb,                            '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),

        -- â”€â”€ Tier 4: Entitlements (full, platform_critical) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        ('shared', 'subscription_plan',  'FND', 'SPL',  'CONTROL',   'ent', 'table', 'full',     'platform_critical', 'controlled', 'Subscription Plan',  'Subscription Plans',   'credit-card','green',  '{"is_versioned":true}'::jsonb,                                        '{}'::jsonb, '{"title_field":"name","subtitle_field":"code"}'::jsonb,           '{"enabled":true,"fields":["name","code"]}'::jsonb,                                           '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('shared', 'enterprise_feature', 'FND', 'EFT',  'CONTROL',   'ent', 'table', 'full',     'platform_critical', 'controlled', 'Enterprise Feature', 'Enterprise Features',  'star',       'amber',  '{}'::jsonb,                                                            '{}'::jsonb, '{"title_field":"name","subtitle_field":"code"}'::jsonb,           '{"enabled":true,"fields":["name","code","description","view_key","edit_key"]}'::jsonb,       '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('shared', 'plan_module_access', 'FND', 'PMA',  'RELATION',  'ent', 'table', 'lite',     'platform_critical', 'controlled', 'Plan Module Access', 'Plan Module Access',   'layout',     'blue',   '{"parent_entity":"subscription_plan"}'::jsonb,                        '{}'::jsonb, '{}'::jsonb,                                                      '{}'::jsonb,                                                                                  '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('shared', 'plan_permission_access','FND','PPA', 'RELATION',  'ent', 'table', 'lite',     'platform_critical', 'controlled', 'Plan Permission Access','Plan Permission Access','lock',    'red',    '{"parent_entity":"subscription_plan"}'::jsonb,                        '{}'::jsonb, '{}'::jsonb,                                                      '{}'::jsonb,                                                                                  '{}'::jsonb, '{}'::jsonb, 'ACTIVE'),
        ('shared', 'plan_feature_access','FND', 'PFA',  'RELATION',  'ent', 'table', 'lite',     'platform_critical', 'controlled', 'Plan Feature Access','Plan Feature Access',  'star',       'amber',  '{"parent_entity":"subscription_plan"}'::jsonb,                        '{}'::jsonb, '{}'::jsonb,                                                      '{}'::jsonb,                                                                                  '{}'::jsonb, '{}'::jsonb, 'ACTIVE')
),
relations AS (
    SELECT
        t.table_schema,
        t.table_name,
        'table'::text AS relation_kind
    FROM information_schema.tables t
    WHERE t.table_schema IN ('control', 'document', 'master', 'shared')
      AND t.table_type = 'BASE TABLE'

    UNION ALL

    SELECT
        v.table_schema,
        v.table_name,
        'view'::text AS relation_kind
    FROM information_schema.views v
    WHERE v.table_schema IN ('control', 'document', 'master', 'shared')

    UNION ALL

    SELECT
        o.table_schema,
        o.table_name,
        o.backing_type AS relation_kind
    FROM curated_overrides o
    WHERE o.backing_type = 'view'
      AND NOT EXISTS (
          SELECT 1
          FROM information_schema.views v
          WHERE v.table_schema = o.table_schema
            AND v.table_name = o.table_name
      )
),
classified AS (
    SELECT
        r.table_schema,
        r.table_name,
        r.relation_kind,
        COALESCE(o.module_code, CASE WHEN r.table_schema = 'document' THEN 'DOC' ELSE 'FND' END) AS module_code,
        COALESCE(
            o.entity_short,
            upper(left(regexp_replace(r.table_name, '[^a-zA-Z0-9]', '', 'g'), 12))
        ) AS entity_short,
        COALESCE(o.entity_class, CASE
            WHEN r.relation_kind = 'view' THEN 'AGGREGATE'
            WHEN r.table_schema = 'document'
             AND (
                r.table_name LIKE '%\_line' ESCAPE '\'
                OR r.table_name LIKE '%\_lines' ESCAPE '\'
                OR r.table_name LIKE '%\_item' ESCAPE '\'
                OR r.table_name LIKE '%\_items' ESCAPE '\'
                OR r.table_name LIKE '%\_allocation' ESCAPE '\'
                OR r.table_name LIKE '%\_reference' ESCAPE '\'
                OR r.table_name LIKE '%\_link' ESCAPE '\'
                OR r.table_name LIKE '%\_snapshot' ESCAPE '\'
             ) THEN 'DOCUMENT_RELATION'
            WHEN r.table_schema = 'document' THEN 'DOCUMENT'
            WHEN r.table_schema = 'shared' THEN 'REFERENCE'
            WHEN r.table_schema = 'control' THEN 'CONTROL'
            ELSE 'MASTER'
        END) AS entity_class,
        COALESCE(o.kind, CASE WHEN r.relation_kind = 'view' THEN 'aggregate' ELSE 'ent' END) AS kind,
        COALESCE(o.backing_type, r.relation_kind) AS backing_type,
        COALESCE(o.governance_level, CASE WHEN r.table_schema IN ('control', 'document') THEN 'full' ELSE 'standard' END) AS governance_level,
        COALESCE(o.security_tier, CASE
            WHEN r.table_schema = 'control' THEN 'platform_critical'
            WHEN r.table_schema = 'document' THEN 'tenant_critical'
            WHEN r.table_schema = 'shared' THEN 'config'
            ELSE 'operational'
        END) AS security_tier,
        COALESCE(o.mutability, CASE WHEN r.table_schema IN ('control', 'shared') THEN 'locked' ELSE 'controlled' END) AS mutability,
        COALESCE(o.label_singular, initcap(replace(r.table_name, '_', ' '))) AS label_singular,
        COALESCE(o.label_plural, initcap(replace(r.table_name, '_', ' ')) || 's') AS label_plural,
        COALESCE(o.icon_key, CASE
            WHEN r.table_schema = 'control' THEN 'settings'
            WHEN r.table_schema = 'document' THEN 'file-text'
            WHEN r.table_schema = 'shared' THEN 'globe-2'
            ELSE 'database'
        END) AS icon_key,
        COALESCE(o.color_token, CASE
            WHEN r.table_schema = 'control' THEN 'red'
            WHEN r.table_schema = 'document' THEN 'blue'
            WHEN r.table_schema = 'shared' THEN 'green'
            ELSE 'slate'
        END) AS color_token,
        COALESCE(o.feature_flags, '{}'::jsonb) AS feature_flags,
        COALESCE(o.display_config, '{}'::jsonb) AS display_config,
        COALESCE(o.identity_config, '{}'::jsonb) AS identity_config,
        COALESCE(o.search_config, '{}'::jsonb) AS search_config,
        COALESCE(o.data_policy, '{}'::jsonb) AS data_policy,
        COALESCE(o.concurrency_policy, '{}'::jsonb) AS concurrency_policy,
        COALESCE(o.status, 'ACTIVE') AS status
    FROM relations r
    LEFT JOIN curated_overrides o
      ON o.table_schema = r.table_schema
     AND o.table_name = r.table_name
),
identity_candidates AS (
    SELECT
        c.*,
        (
            SELECT col.column_name::text
              FROM information_schema.columns col
             WHERE col.table_schema = c.table_schema
               AND col.table_name = c.table_name
               AND col.column_name IN ('code', 'document_no', 'number', 'external_code')
             ORDER BY CASE col.column_name
                 WHEN 'code' THEN 1
                 WHEN 'document_no' THEN 2
                 WHEN 'number' THEN 3
                 WHEN 'external_code' THEN 4
                 ELSE 99
             END
             LIMIT 1
        ) AS identity_primary_field,
        (
            SELECT col.column_name::text
              FROM information_schema.columns col
             WHERE col.table_schema = c.table_schema
               AND col.table_name = c.table_name
               AND col.column_name IN ('name', 'display_name', 'title')
             ORDER BY CASE col.column_name
                 WHEN 'name' THEN 1
                 WHEN 'display_name' THEN 2
                 WHEN 'title' THEN 3
                 ELSE 99
             END
             LIMIT 1
        ) AS identity_secondary_field,
        (
            SELECT col.column_name::text
              FROM information_schema.columns col
             WHERE col.table_schema = c.table_schema
               AND col.table_name = c.table_name
               AND col.column_name IN ('invoice_type', 'document_type', 'type', 'category_label', 'classification')
             ORDER BY CASE col.column_name
                 WHEN 'invoice_type' THEN 1
                 WHEN 'document_type' THEN 2
                 WHEN 'type' THEN 3
                 WHEN 'category_label' THEN 4
                 WHEN 'classification' THEN 5
                 ELSE 99
             END
             LIMIT 1
        ) AS identity_classification_field,
        (
            SELECT col.column_name::text
              FROM information_schema.columns col
             WHERE col.table_schema = c.table_schema
               AND col.table_name = c.table_name
               AND col.column_name IN ('status', 'lifecycle_state', 'state')
             ORDER BY CASE col.column_name
                 WHEN 'status' THEN 1
                 WHEN 'lifecycle_state' THEN 2
                 WHEN 'state' THEN 3
                 ELSE 99
             END
             LIMIT 1
        ) AS identity_status_field
    FROM classified c
),
column_config AS (
    SELECT
        c.*,
        jsonb_strip_nulls(
            jsonb_build_object(
                'primary', CASE WHEN c.identity_primary_field IS NOT NULL THEN jsonb_build_object('field', c.identity_primary_field) END,
                'secondary', CASE WHEN c.identity_secondary_field IS NOT NULL THEN jsonb_build_object('field', c.identity_secondary_field) END,
                'classification', CASE WHEN c.identity_classification_field IS NOT NULL THEN jsonb_build_object('field', c.identity_classification_field) END,
                'status', CASE WHEN c.identity_status_field IS NOT NULL THEN jsonb_build_object('field', c.identity_status_field, 'process_state_first', true) END
            )
        ) AS identity_header_config,
        COALESCE(NULLIF(ARRAY(
            SELECT col.column_name::text
            FROM information_schema.columns col
            WHERE col.table_schema = c.table_schema
            AND col.table_name = c.table_name
              AND col.column_name IN ('code', 'name', 'slug', 'document_no', 'number', 'id')
            ORDER BY CASE col.column_name
                WHEN 'code' THEN 1
                WHEN 'name' THEN 2
                WHEN 'slug' THEN 3
                WHEN 'document_no' THEN 4
                WHEN 'number' THEN 5
                WHEN 'id' THEN 99
                ELSE 50
            END
            LIMIT 3
        ), ARRAY[]::text[]), ARRAY['id']::text[]) AS natural_key_fields,
        COALESCE(NULLIF(ARRAY(
            SELECT col.column_name::text
            FROM information_schema.columns col
            WHERE col.table_schema = c.table_schema
              AND col.table_name = c.table_name
              AND col.column_name IN ('code', 'name', 'document_no', 'status', 'created_at')
            ORDER BY CASE col.column_name
                WHEN 'code' THEN 1
                WHEN 'name' THEN 2
                WHEN 'document_no' THEN 3
                WHEN 'status' THEN 4
                WHEN 'created_at' THEN 5
                ELSE 50
            END
            LIMIT 5
        ), ARRAY[]::text[]), ARRAY['id']::text[]) AS list_columns
    FROM identity_candidates c
),
resolved AS (
    SELECT
        cc.*,
        COALESCE(module_match.id::text, module_fallback.id::text, cc.module_code) AS module_id,
        jsonb_build_object(
            'list_renderer', CASE WHEN cc.entity_class IN ('DOCUMENT', 'DOCUMENT_RELATION') THEN 'document' ELSE 'master' END,
            'detail_renderer', CASE WHEN cc.entity_class = 'DOCUMENT' THEN 'document' ELSE 'master' END,
            'list_columns', to_jsonb(cc.list_columns)
        ) || cc.display_config AS resolved_display_config,
        jsonb_build_object(
            'natural_key_fields', to_jsonb(cc.natural_key_fields)
        ) || CASE
            WHEN cc.identity_config ? 'header' OR cc.identity_header_config = '{}'::jsonb
                THEN cc.identity_config
            ELSE cc.identity_config || jsonb_build_object('header', cc.identity_header_config)
        END AS resolved_identity_config
    FROM column_config cc
    LEFT JOIN shared.module module_match
      ON module_match.code = cc.module_code
    LEFT JOIN shared.module module_fallback
      ON module_fallback.code = 'FND'
)
INSERT INTO control.entity (
    tenant_id,
    module_id,
    name,
    slug,
    entity_short,
    entity_code,
    entity_class,
    ownership_model,
    kind,
    backing_type,
    governance_level,
    security_tier,
    mutability,
    mapping_mode,
    table_schema,
    table_name,
    label_singular,
    label_plural,
    icon_key,
    color_token,
    display_config,
    feature_flags,
    data_policy,
    identity_config,
    search_config,
    concurrency_policy,
    status,
    created_by,
    updated_by
)
SELECT
    NULL::uuid,
    r.module_id,
    r.table_name,
    replace(lower(r.table_name), '_', '-'),
    r.entity_short,
    r.table_name,
    r.entity_class,
    'system',
    r.kind,
    r.backing_type,
    r.governance_level,
    r.security_tier,
    r.mutability,
    'exclusive',
    r.table_schema,
    r.table_name,
    r.label_singular,
    r.label_plural,
    r.icon_key,
    r.color_token,
    r.resolved_display_config,
    r.feature_flags,
    r.data_policy,
    r.resolved_identity_config,
    r.search_config,
    r.concurrency_policy,
    r.status,
    c.system_user_id,
    c.system_user_id
FROM resolved r
CROSS JOIN constants c
ON CONFLICT (table_schema, table_name) DO UPDATE
SET
    module_id = EXCLUDED.module_id,
    name = EXCLUDED.table_name,
    slug = replace(lower(EXCLUDED.table_name), '_', '-'),
    entity_short = EXCLUDED.entity_short,
    entity_code = EXCLUDED.table_name,
    entity_class = EXCLUDED.entity_class,
    ownership_model = EXCLUDED.ownership_model,
    kind = EXCLUDED.kind,
    backing_type = EXCLUDED.backing_type,
    governance_level = EXCLUDED.governance_level,
    security_tier = EXCLUDED.security_tier,
    mutability = EXCLUDED.mutability,
    mapping_mode = EXCLUDED.mapping_mode,
    label_singular = EXCLUDED.label_singular,
    label_plural = EXCLUDED.label_plural,
    icon_key = EXCLUDED.icon_key,
    color_token = EXCLUDED.color_token,
    display_config = EXCLUDED.display_config,
    feature_flags = EXCLUDED.feature_flags,
    data_policy = EXCLUDED.data_policy,
    identity_config = EXCLUDED.identity_config,
    search_config = EXCLUDED.search_config,
    concurrency_policy = EXCLUDED.concurrency_policy,
    status = EXCLUDED.status,
    updated_at = now(),
    updated_by = EXCLUDED.updated_by
WHERE control.entity.tenant_id IS NULL;

-- Legacy cleanup: repair rows previously generated as schema_table.
UPDATE control.entity e
   SET name = e.table_name,
       entity_code = e.table_name,
       slug = replace(lower(e.table_name), '_', '-'),
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
 WHERE e.tenant_id IS NULL
   AND e.table_schema IN ('control', 'document', 'master', 'shared')
   AND (
        e.name = e.table_schema || '_' || e.table_name
     OR e.entity_code = e.table_schema || '_' || e.table_name
     OR e.slug = replace(lower(e.table_schema || '_' || e.table_name), '_', '-')
   )
   AND NOT EXISTS (
        SELECT 1
          FROM control.entity existing
         WHERE existing.tenant_id IS NULL
           AND existing.entity_code = e.table_name
           AND existing.id <> e.id
   );

-- Enable collaboration feature flags on all platform entities.
UPDATE control.entity
SET
    feature_flags = feature_flags || '{"comments_enabled":true,"has_attachments":true,"event_history":true}'::jsonb,
    updated_at    = now(),
    updated_by    = '00000000-0000-0000-0000-000000000000'
WHERE tenant_id IS NULL
  AND table_schema IN ('control', 'document', 'master', 'shared');

-- Entity-scoped rollout for the registry-key lifecycle command orchestrator.
-- Tenant entity rows may explicitly override this value for rollback. The
-- operation list makes PI financial commands independently controllable.
UPDATE control.entity
SET feature_flags = COALESCE(feature_flags, '{}'::jsonb)
      || jsonb_build_object(
        'lifecycle_command_orchestrator_v2',
        CASE name
          WHEN 'purchase_invoice' THEN '{"enabled":true,"operations":["submit","post","reverse"],"rollout_stage_by_operation":{"submit":4,"post":5,"reverse":5}}'::jsonb
          WHEN 'service_sheet' THEN '{"enabled":true,"operations":["submit"],"rollout_stage":3}'::jsonb
          WHEN 'receipt' THEN '{"enabled":true,"operations":["submit"],"rollout_stage":2}'::jsonb
          ELSE '{"enabled":true,"operations":["submit"],"rollout_stage":1}'::jsonb
        END
      ),
    updated_at = now(),
    updated_by = '00000000-0000-0000-0000-000000000000'
WHERE tenant_id IS NULL
  AND name IN ('purchase_requisition', 'receipt', 'service_sheet', 'purchase_invoice');

