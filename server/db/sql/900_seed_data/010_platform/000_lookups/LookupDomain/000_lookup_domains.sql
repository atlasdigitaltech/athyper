-- 900_seed_data/002_control/LookupDomain/000_lookup_domains.sql
-- Master registry: ALL lookup domain definitions across all schemas.
-- Schema: control | Table: lookup_domain
-- Depends on: 04_tables/002_control.sql
-- Idempotent: yes — ON CONFLICT (code) DO NOTHING
--
-- Ordering: grouped by source_schema, then by functional area within each schema.
-- Schemas: CONTROL → SHARED → MASTER → DOCUMENT → EVENT → LOG → GOVERNANCE


INSERT INTO control.lookup_domain (code, name, description, source_schema, is_extensible, status, created_by)
VALUES

    -- ========================================================================
    -- CONTROL schema
    -- ========================================================================

    -- ── Authentication ─────────────────────────────────────────────────────

    ('control.mfa_method_type',
     'MFA Method Type',
     'Multi-factor authentication method classification. Determines contact_link_id requirement and Keycloak credential type.',
     'control', false, 'active',
     '00000000-0000-0000-0000-000000000000'),

    -- ── Book Posting Rules ─────────────────────────────────────────────────

    ('control.bpr_account_strategy',
     'BPR account strategy',
     'How the target account is determined (same, map, profile).',
     'control', false, 'active',
     '00000000-0000-0000-0000-000000000000'),

    ('control.bpr_amount_strategy',
     'BPR amount strategy',
     'How the posting amount is derived (mirror, multiply, formula, suppress).',
     'control', false, 'active',
     '00000000-0000-0000-0000-000000000000'),

    ('control.bpr_recognition_timing',
     'BPR recognition timing',
     'When the secondary book posting is created (simultaneous, deferred, on_close).',
     'control', false, 'active',
     '00000000-0000-0000-0000-000000000000'),

    -- ── Entity Engine ──────────────────────────────────────────────────────

    ('entity.ownership_model',
     'Entity Ownership Model',
     'Classifies who owns the entity definition.',
     'control', false, 'active',
     '00000000-0000-0000-0000-000000000000'),

    ('entity.entity_class',
     'Entity Class',
     'Structural classification driving governance profiles.',
     'control', false, 'active',
     '00000000-0000-0000-0000-000000000000'),

    ('entity.backing_type',
     'Entity Backing Type',
     'Physical PostgreSQL object type behind the entity.',
     'control', false, 'active',
     '00000000-0000-0000-0000-000000000000'),

    ('entity.governance_level',
     'Governance Level',
     'Audit + approval strictness level.',
     'control', false, 'active',
     '00000000-0000-0000-0000-000000000000'),

    ('entity.security_tier',
     'Security Tier',
     'Data sensitivity and security posture level.',
     'control', false, 'active',
     '00000000-0000-0000-0000-000000000000'),

    ('entity.mutability',
     'Entity Mutability',
     'How much a tenant can customise the entity.',
     'control', false, 'active',
     '00000000-0000-0000-0000-000000000000'),

    ('entity_field.data_type',
     'Field Data Type',
     'PostgreSQL-mappable data type for entity fields.',
     'control', false, 'active',
     '00000000-0000-0000-0000-000000000000'),

    ('entity_field.origin',
     'Field Origin',
     'Who defined this field — platform, standard, or tenant.',
     'control', false, 'active',
     '00000000-0000-0000-0000-000000000000'),

    ('entity_field.cardinality',
     'Field Cardinality',
     'How many values a field holds.',
     'control', false, 'active',
     '00000000-0000-0000-0000-000000000000'),

    ('overlay_change.kind',
     'Overlay Change Kind',
     'Type of change operation within an overlay.',
     'control', false, 'active',
     '00000000-0000-0000-0000-000000000000'),

    ('entity_relation.kind',
     'Relation Kind',
     'FK/join relationship direction.',
     'control', false, 'active',
     '00000000-0000-0000-0000-000000000000'),

    -- ── Notification (owned by control) ────────────────────────────────────

    ('notification.channel',
     'Notification Channel',
     'Communication channel for notification dispatch. Replaces control.notification_channel table. '
     'is_extensible=true — new channels (Slack, Teams, fax) added without DDL.',
     'control', true, 'active',
     '00000000-0000-0000-0000-000000000000'),

    ('notification.priority',
     'Notification Priority',
     'Dispatch and display priority for messages, notifications, delivery records, and digest items. '
     'Drives UI sort order, SLA thresholds, and retry control. '
     'is_extensible=true — tenants may define custom priority tiers with SLA targets.',
     'control', true, 'active',
     '00000000-0000-0000-0000-000000000000'),

    -- ========================================================================
    -- SHARED schema
    -- ========================================================================

    ('shared.uom_quantity_type',
     'UoM Quantity Type',
     'Physical or logical quantity category for a unit of measure. Aligns with UN/ECE Rec 20 dimension groups.',
     'shared', false, 'active',
     '00000000-0000-0000-0000-000000000000'),

    ('shared.persona_scope_mode',
     'Persona Scope Mode',
     'Scope level at which a persona (role template) applies. Determines permission resolution boundary.',
     'shared', false, 'active',
     '00000000-0000-0000-0000-000000000000'),

    -- ========================================================================
    -- MASTER schema
    -- ========================================================================

    -- ── Tenant / Principal / Contact ────────────────────────────────────────

    ('master.tenant_subscription',
     'Tenant Subscription Tier',
     'Subscription plan tiers available to tenants. Controls feature access, quotas, and billing category.',
     'master', false, 'active',
     '00000000-0000-0000-0000-000000000000'),

    ('master.principal_type',
     'Principal Type',
     'Classification of actors in master.principal: human users, automated service accounts, or bots.',
     'master', false, 'active',
     '00000000-0000-0000-0000-000000000000'),

    ('master.contact_link_channel_type',
     'Contact Point Channel Type',
     'Communication channel for a contact_link row. Determines which contact_email / contact_phone extension applies.',
     'master', false, 'active',
     '00000000-0000-0000-0000-000000000000'),

    ('master.contact_link_purpose',
     'Contact Point Purpose',
     'Intended use of a contact_link. Drives routing logic for notifications, auth, and billing communications.',
     'master', true, 'active',
     '00000000-0000-0000-0000-000000000000'),

    ('master.address_purpose',
     'Address / Contact Purpose',
     'Business purpose vocabulary for address_link.purpose. Conceptually overlaps with '
     'contact_link_purpose (billing, legal, home, work…) to enable co-relation of a '
     'physical address with a contact channel for the same business function.',
     'master', true, 'active',
     '00000000-0000-0000-0000-000000000000'),

    ('master.address_type',
     'Address Type',
     'Physical classification of the address location. Describes what the place physically is '
     '(commercial, warehouse, residential). Independent of address_link.purpose (how it is used).',
     'master', true, 'active',
     '00000000-0000-0000-0000-000000000000'),

    -- ── Delegation ──────────────────────────────────────────────────────────

    ('master.delegation_scope',
     'Delegation Scope Type',
     'Defines the scope class of an authority delegation in master.delegation_grant. '
     'scope_ref interpretation varies by scope_type (see column comment). '
     'is_extensible=true — new delegation surfaces (e.g. report_pack, dataset) '
     'added without DDL.',
     'master', true, 'active',
     '00000000-0000-0000-0000-000000000000'),

    -- ── Collaboration ───────────────────────────────────────────────────────

    ('master.comment_type',
     'Comment Context Type',
     'Discriminates the surface a comment is attached to. Used as the '
     'context_type column in master.comment, master.comment_mention, '
     'master.comment_reaction, event.comment_flag, governance.comment_moderation. '
     'is_extensible=true — new comment surfaces (task_comment, chat_message) '
     'added without DDL.',
     'master', true, 'active',
     '00000000-0000-0000-0000-000000000000'),

    ('master.reaction_type',
     'Comment Reaction Type',
     'Emoji reaction codes for master.comment_reaction.reaction_type. '
     'is_extensible=true — tenants add custom reaction codes.',
     'master', true, 'active',
     '00000000-0000-0000-0000-000000000000'),

    ('master.flag_reason',
     'Comment Flag Reason',
     'Abuse / moderation report reason codes for event.comment_flag.flag_reason. '
     'is_extensible=true — tenants add domain-specific report categories.',
     'master', true, 'active',
     '00000000-0000-0000-0000-000000000000'),

    ('master.conversation_type',
     'Conversation Type',
     'Conversation envelope type for master.conversation.type. '
     'is_extensible=true — add broadcast, thread, channel subtypes without DDL.',
     'master', true, 'active',
     '00000000-0000-0000-0000-000000000000'),

    ('master.attachment_kind',
     'Attachment Kind',
     'Functional classification of an attachment. '
     'Used in master.attachment.kind. '
     'is_extensible=true — tenants register custom file categories.',
     'master', true, 'active',
     '00000000-0000-0000-0000-000000000000'),

    -- ── Document / Print / Branding ─────────────────────────────────────────

    ('master.template_engine',
     'Template Engine',
     'Rendering engine used to produce output from template content. '
     'Closed vocabulary — new engines require platform changes.',
     'master', false, 'active',
     '00000000-0000-0000-0000-000000000000'),

    ('master.template_kind',
     'Template Kind',
     'Functional category of a template — determines which entities can bind it. '
     'is_extensible=true — tenants can add domain-specific template kinds.',
     'master', true, 'active',
     '00000000-0000-0000-0000-000000000000'),

    -- ── Legal Entity ────────────────────────────────────────────────────────

    ('master.legal_entity_type',
     'Legal entity type',
     'Structural role in group hierarchy (parent, subsidiary, associate, etc.).',
     'master', false, 'active',
     '00000000-0000-0000-0000-000000000000'),

    ('master.legal_entity_consolidation',
     'Consolidation method',
     'How entity consolidates into group (full, proportional, equity, none).',
     'master', false, 'active',
     '00000000-0000-0000-0000-000000000000'),

    ('master.legal_entity_framework',
     'Regulatory framework (LE)',
     'Accounting standard (IFRS, US GAAP, local GAAP). '
     'is_extensible=true — tenants may add country-specific frameworks.',
     'master', true, 'active',
     '00000000-0000-0000-0000-000000000000'),

    -- ── Company Code ────────────────────────────────────────────────────────

    ('master.company_code_fy_variant',
     'Fiscal year variant',
     'Fiscal calendar type (calendar, 4-4-5, 4-5-4, 5-4-4, custom). '
     'is_extensible=true — tenants may define custom fiscal patterns.',
     'master', true, 'active',
     '00000000-0000-0000-0000-000000000000'),

    ('master.company_code_framework',
     'Regulatory framework (CC)',
     'Accounting standard at company code level. '
     'is_extensible=true — tenants may add local standards.',
     'master', true, 'active',
     '00000000-0000-0000-0000-000000000000'),

    -- ── Cost Center ─────────────────────────────────────────────────────────

    ('master.cost_center_category',
     'Cost center category',
     'Functional classification (production, admin, sales, etc.). '
     'is_extensible=true — tenants may add custom categories.',
     'master', true, 'active',
     '00000000-0000-0000-0000-000000000000'),

    ('master.cost_center_node_type',
     'Cost center node type',
     'HEADER (rollup-only) or POSTING (accepts journal entries).',
     'master', false, 'active',
     '00000000-0000-0000-0000-000000000000'),

    -- ── Profit Center ───────────────────────────────────────────────────────

    ('master.profit_center_type',
     'Profit center type',
     'Business function class (revenue, service, investment, shared). '
     'is_extensible=true — tenants may add custom types.',
     'master', true, 'active',
     '00000000-0000-0000-0000-000000000000'),

    ('master.profit_center_node_type',
     'Profit center node type',
     'HEADER (rollup-only) or POSTING (postable).',
     'master', false, 'active',
     '00000000-0000-0000-0000-000000000000'),

    -- ── Site ────────────────────────────────────────────────────────────────

    ('master.site_type',
     'Site type',
     'Physical location class (plant, office, store, branch, yard, depot). '
     'is_extensible=true — tenants may add custom site types.',
     'master', true, 'active',
     '00000000-0000-0000-0000-000000000000'),

    -- ── Warehouse ───────────────────────────────────────────────────────────

    ('master.warehouse_type',
     'Warehouse type',
     'Inventory storage class (raw, finished_goods, spares, transit, returns). '
     'is_extensible=true — tenants may add custom warehouse types.',
     'master', true, 'active',
     '00000000-0000-0000-0000-000000000000'),

    -- ── Chart of Account ────────────────────────────────────────────────────

    ('master.chart_of_account_framework',
     'Chart framework',
     'Accounting standard the chart aligns to. '
     'is_extensible=true — tenants may add custom frameworks.',
     'master', true, 'active',
     '00000000-0000-0000-0000-000000000000'),

    -- ── GL Account ──────────────────────────────────────────────────────────

    ('master.gl_account_class',
     'Account class',
     '5-class model: asset, liability, equity, income, expense.',
     'master', false, 'active',
     '00000000-0000-0000-0000-000000000000'),

    ('master.gl_account_node_type',
     'GL account node type',
     'HEADER (group/summary) or POSTING (leaf, accepts journal lines).',
     'master', false, 'active',
     '00000000-0000-0000-0000-000000000000'),

    ('master.gl_account_balance',
     'Normal balance',
     'Natural balance side (debit or credit).',
     'master', false, 'active',
     '00000000-0000-0000-0000-000000000000'),

    ('master.gl_account_subledger',
     'Subledger type',
     'Which subledger links to this account (AP, AR, asset, inventory, etc.). '
     'is_extensible=true — tenants may add custom subledger types.',
     'master', true, 'active',
     '00000000-0000-0000-0000-000000000000'),

    -- ── CCCA / CCGA ─────────────────────────────────────────────────────────

    ('master.ccca_assignment_type',
     'Chart assignment type',
     'Role of chart within company (operating, local, group).',
     'master', false, 'active',
     '00000000-0000-0000-0000-000000000000'),

    ('master.ccga_reconciliation_type',
     'Reconciliation type',
     'How account is reconciled (manual, auto, none).',
     'master', false, 'active',
     '00000000-0000-0000-0000-000000000000'),

    -- ── Project ─────────────────────────────────────────────────────────────

    ('master.project_type',
     'Project type',
     'Financial classification (capex, opex, internal, customer, r_and_d, maintenance). '
     'is_extensible=true — tenants may add custom project types.',
     'master', true, 'active',
     '00000000-0000-0000-0000-000000000000'),

    ('master.project_settlement_type',
     'Settlement type',
     'Where project costs settle (cost_center, asset, gl_account, order).',
     'master', false, 'active',
     '00000000-0000-0000-0000-000000000000'),

    ('master.project_item_type',
     'Project item type',
     'WBS element class (phase, task, milestone).',
     'master', false, 'active',
     '00000000-0000-0000-0000-000000000000'),

    -- ── Fiscal Period / Ledger Book ─────────────────────────────────────────

    ('master.fiscal_period_type',
     'Fiscal period type',
     'Period classification within fiscal year (opening, normal, adjustment, closing).',
     'master', false, 'active',
     '00000000-0000-0000-0000-000000000000'),

    ('master.ledger_book_category',
     'Ledger book category',
     'Purpose classification for a ledger book (statutory, tax, management, insurance). '
     'is_extensible=true — tenants may add custom categories.',
     'master', true, 'active',
     '00000000-0000-0000-0000-000000000000'),

    ('master.ledger_book_standard',
     'Ledger book accounting standard',
     'Accounting standard the ledger book follows. '
     'is_extensible=true — tenants may add country-specific standards.',
     'master', true, 'active',
     '00000000-0000-0000-0000-000000000000'),

    ('master.ledger_book_close_mode',
     'Ledger book close mode',
     'Period-close coordination mode (unified, independent, staggered).',
     'master', false, 'active',
     '00000000-0000-0000-0000-000000000000'),

    ('master.company_code_book_assignment_conflict',
     'Book assignment conflict resolution',
     'Strategy when multiple book assignments overlap for the same entity.',
     'master', false, 'active',
     '00000000-0000-0000-0000-000000000000'),

    -- ── Party: Customer ─────────────────────────────────────────────────────

    ('master.customer_type',
     'Customer type',
     'Classification of customer (corporate, individual, government, internal). '
     'is_extensible=true — tenants may add custom customer types.',
     'master', true, 'active',
     '00000000-0000-0000-0000-000000000000'),

    ('master.party_payment_terms',
     'Payment terms (party)',
     'Shared payment terms vocabulary for customer + supplier. '
     'is_extensible=true — tenants may define custom terms.',
     'master', true, 'active',
     '00000000-0000-0000-0000-000000000000'),

    -- ── Party: Supplier ─────────────────────────────────────────────────────

    ('master.supplier_type',
     'Supplier type',
     'Classification of supplier (vendor, contractor, distributor, manufacturer, government). '
     'is_extensible=true — tenants may add custom supplier types.',
     'master', true, 'active',
     '00000000-0000-0000-0000-000000000000'),

    ('master.supplier_payment_method',
     'Supplier payment method',
     'How supplier is paid (wire, check, ACH, card, netting, cash). '
     'is_extensible=true — tenants may add custom methods.',
     'master', true, 'active',
     '00000000-0000-0000-0000-000000000000'),

    -- ── Party: Employee ─────────────────────────────────────────────────────

    ('master.employment_type',
     'Employment type',
     'Type of employment relationship (full_time, part_time, contract, etc.). '
     'is_extensible=true — tenants may add custom types.',
     'master', true, 'active',
     '00000000-0000-0000-0000-000000000000'),

    -- ── Product / Item ──────────────────────────────────────────────────────

    ('master.product_type',
     'Product type',
     'Nature of catalog item (physical, service, digital, subscription). '
     'is_extensible=true — tenants may add custom product types.',
     'master', true, 'active',
     '00000000-0000-0000-0000-000000000000'),

    ('master.valuation_method',
     'Inventory valuation method',
     'Costing method for inventory items (FIFO, weighted average, standard cost, specific ID).',
     'master', false, 'active',
     '00000000-0000-0000-0000-000000000000'),

    -- ── Spend Category ──────────────────────────────────────────────────────

    ('master.procurement_type',
     'Procurement type',
     'Nature of procurement (goods, services, mixed).',
     'master', false, 'active',
     '00000000-0000-0000-0000-000000000000'),

    ('master.spend_visibility',
     'Spend category visibility',
     'Who can see and use this spend category (standard, restricted, hidden).',
     'master', false, 'active',
     '00000000-0000-0000-0000-000000000000'),

    ('master.depreciation_method',
     'Depreciation method',
     'Asset depreciation calculation method.',
     'master', false, 'active',
     '00000000-0000-0000-0000-000000000000'),

    -- ── Commodity Classification ────────────────────────────────────────────

    ('master.cc_owner_type',
     'Classification owner type',
     'Which entity types can be classified (product, item_category, spend_category, item, customer, supplier).',
     'master', false, 'active',
     '00000000-0000-0000-0000-000000000000'),

    ('master.cc_classification_type',
     'Classification type',
     'Type of code system (commodity or industry).',
     'master', false, 'active',
     '00000000-0000-0000-0000-000000000000'),

    ('master.cc_domain_code',
     'Classification domain code',
     'Code system domain (UNSPSC, HS, NAICS, ISIC, GICS, SITC, custom). '
     'is_extensible=true — tenants may register custom taxonomies.',
     'master', true, 'active',
     '00000000-0000-0000-0000-000000000000'),

    ('master.cc_mapping_type',
     'Classification mapping type',
     'Precision of the mapping (exact, broad, narrow, partial, related).',
     'master', false, 'active',
     '00000000-0000-0000-0000-000000000000'),

    ('master.cc_provenance',
     'Classification provenance',
     'Source of the classification assignment (manual, AI-generated, AI-verified, imported, official).',
     'master', false, 'active',
     '00000000-0000-0000-0000-000000000000'),

    -- ── Customer / Supplier Company Profile ────────────────────────────────

    ('master.credit_rating',
     'Credit rating',
     'Customer credit risk rating for customer_company_profile. '
     'is_extensible=true — tenants may define custom rating scales.',
     'master', true, 'active',
     '00000000-0000-0000-0000-000000000000'),

    ('master.tax_id_type',
     'Tax identifier type',
     'Type of tax registration (VAT, GST, TIN, EIN, ABN, SST, etc.). '
     'is_extensible=true — tenants may add jurisdiction-specific types.',
     'master', true, 'active',
     '00000000-0000-0000-0000-000000000000'),

    ('master.statement_cycle',
     'Statement cycle',
     'Customer statement generation frequency. '
     'is_extensible=true — tenants may define custom cycles.',
     'master', true, 'active',
     '00000000-0000-0000-0000-000000000000'),

    -- ── Notification (owned by master) ──────────────────────────────────────

    ('notification.category',
     'Notification Category',
     'Functional category for master.notification.category. Used for filtering, grouping, and per-category UI. '
     'is_extensible=true — tenants define their own categories.',
     'master', true, 'active',
     '00000000-0000-0000-0000-000000000000'),

    -- ── Operating Unit — REMOVED (company_code migration) ──────────────────
    -- ou_type domain deleted. See 13_patches/002_drop_operating_unit.sql.

    -- ========================================================================
    -- DOCUMENT schema
    -- ========================================================================

    ('document.je_source_doc_type',
     'Journal entry source document type',
     'Originating document type for the journal entry. '
     'is_extensible=true — tenants may add custom source document types.',
     'document', true, 'active',
     '00000000-0000-0000-0000-000000000000'),

    ('document.jl_party_type',
     'Journal line party type',
     'Counterparty classification on a journal line.',
     'document', false, 'active',
     '00000000-0000-0000-0000-000000000000'),

    ('document.jl_subledger_type',
     'Journal line subledger type',
     'Which subledger the journal line posts to. '
     'is_extensible=true — tenants may add custom subledger types.',
     'document', true, 'active',
     '00000000-0000-0000-0000-000000000000'),

    ('document.jlr_ref_type',
     'Journal line reference type',
     'Reason/purpose of the cross-document reference. '
     'is_extensible=true — tenants may add custom reference types.',
     'document', true, 'active',
     '00000000-0000-0000-0000-000000000000'),

    ('document.jlr_ref_doc_type',
     'Journal line reference document type',
     'Document type of the referenced record. '
     'is_extensible=true — tenants may add custom document types.',
     'document', true, 'active',
     '00000000-0000-0000-0000-000000000000'),

    ('document.priority',
     'Document Priority',
     'Request urgency for approvable documents. Drives workflow SLA selection. '
     'is_extensible=true — tenants may add custom priority tiers.',
     'document', true, 'active',
     '00000000-0000-0000-0000-000000000000'),

    ('document.upupr_request_scope',
     'UPUPR Request Scope',
     'Change categories for UPUPR. Drives UI rendering, requested_changes JSON key routing. '
     'is_extensible=true — tenants may add custom scopes.',
     'document', true, 'active',
     '00000000-0000-0000-0000-000000000000'),

    ('work_request.workflow_type',
     'Workflow Request Type',
     'Classifies the nature of a workflow process in document.workflow_request. '
     'is_extensible=true — new workflow types added without DDL.',
     'document', true, 'active',
     '00000000-0000-0000-0000-000000000000'),

    -- ========================================================================
    -- EVENT schema
    -- ========================================================================

    ('notification.digest_frequency',
     'Digest Frequency Window',
     'Aggregation window for event.digest_staging.frequency. '
     'is_extensible=true — add custom windows without DDL.',
     'event', true, 'active',
     '00000000-0000-0000-0000-000000000000'),

    ('work_item.task_type',
     'Work Item Task Type',
     'Classifies the nature of a human task in event.work_item. '
     'Drives valid decision values, blocking behaviour, and reassignment rules. '
     'is_extensible=true — new task types added without DDL.',
     'event', true, 'active',
     '00000000-0000-0000-0000-000000000000'),

    -- ========================================================================
    -- LOG schema
    -- ========================================================================

    ('log.actor_type',
     'Log Actor Type',
     'Classification of the actor who triggered a log entry. Shared across audit_log, '
     'entity_lifecycle_log, workflow_event_log. is_extensible=false — actor types are '
     'a closed platform vocabulary.',
     'log', false, 'active',
     '00000000-0000-0000-0000-000000000000'),

    ('log.security_event_category',
     'Security Event Category',
     'Top-level classification for security_event_log.event_category. '
     'Groups related event_type values. is_extensible=false — feeds SIEM integrations '
     'that depend on a stable closed vocabulary.',
     'log', false, 'active',
     '00000000-0000-0000-0000-000000000000'),

    ('log.field_classification',
     'Field Data Classification',
     'Sensitivity classification for field_access_log.field_classification. '
     'Drives retention policy and compliance report scope. '
     'is_extensible=true — tenants can add domain-specific classifications.',
     'log', true, 'active',
     '00000000-0000-0000-0000-000000000000'),

    ('log.attachment_access_type',
     'Attachment Access Type',
     'Type of access recorded in attachment_access_log.access_type. '
     'is_extensible=true — platform can add new access types (e.g. watermarked_download) '
     'without DDL changes.',
     'log', true, 'active',
     '00000000-0000-0000-0000-000000000000'),

    ('log.password_change_reason',
     'Password Change Reason',
     'Reason for a password change recorded in password_history.change_reason. '
     'is_extensible=false — reasons are platform-defined for compliance reporting.',
     'log', false, 'active',
     '00000000-0000-0000-0000-000000000000'),

    ('log.activity_domain',
     'Activity Log Domain',
     'Top-level domain discriminator for activity_log.domain. '
     'Groups all activity rows by functional area. '
     'is_extensible=true — tenants can register custom activity domains.',
     'log', true, 'active',
     '00000000-0000-0000-0000-000000000000'),

    ('log.activity_type',
     'Activity Log Type',
     'Activity type within a domain for activity_log.activity_type. '
     'Paired with domain — e.g. domain=kpi + activity_type=calculation. '
     'is_extensible=true — new activity types added as features expand.',
     'log', true, 'active',
     '00000000-0000-0000-0000-000000000000'),

    ('log.export_type',
     'Export Log Type',
     'Export type discriminator for export_log.export_type. '
     'is_extensible=true — new export destinations (PDF, API, S3 push) '
     'registered without DDL changes.',
     'log', true, 'active',
     '00000000-0000-0000-0000-000000000000'),

    ('log.close_activity_type',
     'Close Activity Type',
     'Activity type discriminator for close_activity_log.activity_type. '
     'Represents the 5 merged source tables. is_extensible=false — '
     'finance close activity types are a compliance-audited sealed vocabulary.',
     'log', false, 'active',
     '00000000-0000-0000-0000-000000000000'),

    ('log.ai_feedback_type',
     'AI Feedback Type',
     'Feedback type discriminator for ai_feedback_log.feedback_type. '
     'is_extensible=false — AI feedback types are platform-defined.',
     'log', false, 'active',
     '00000000-0000-0000-0000-000000000000'),

    -- ========================================================================
    -- GOVERNANCE schema
    -- ========================================================================

    -- ========================================================================
    -- MASTER schema — Asset Management
    -- ========================================================================

    ('master.asset_book_type',
     'Asset book type',
     'Book types for multi-book asset accounting (statutory, tax, management). '
     'is_extensible=true — tenants may add custom book types.',
     'master', true, 'active',
     '00000000-0000-0000-0000-000000000000'),

    ('master.depreciation_convention',
     'Depreciation convention',
     'Partial-period conventions for tax engine (half-year, mid-quarter, etc.). '
     'is_extensible=true — jurisdictional conventions vary.',
     'master', true, 'active',
     '00000000-0000-0000-0000-000000000000'),

    ('master.asset_retirement_type',
     'Asset retirement type',
     'Reason codes for asset retirement or disposal. '
     'is_extensible=true — tenants may add custom retirement types.',
     'master', true, 'active',
     '00000000-0000-0000-0000-000000000000'),

    ('master.asset_prorate_basis',
     'Asset prorate basis',
     'Partial-period depreciation calculation basis. '
     'is_extensible=true.',
     'master', true, 'active',
     '00000000-0000-0000-0000-000000000000'),

    ('master.asset_reserve_type',
     'Asset reserve type',
     'Revaluation/impairment reserve movement types. '
     'is_extensible=false — reserve types are accounting-governed.',
     'master', false, 'active',
     '00000000-0000-0000-0000-000000000000'),

    ('master.asset_assignment_type',
     'Asset assignment type',
     'Types of asset assignment changes tracked in history. '
     'is_extensible=true — tenants may add custom assignment dimensions.',
     'master', true, 'active',
     '00000000-0000-0000-0000-000000000000'),

    ('master.asset_nature',
     'Asset nature',
     'Classification of asset physical/legal nature (tangible, intangible, land, cwip, rou, leasehold_improvement). '
     'is_extensible=false — tied to accounting treatment rules.',
     'master', false, 'active',
     '00000000-0000-0000-0000-000000000000'),

    ('master.asset_life_override_policy',
     'Useful life override policy',
     'Whether useful life can be overridden at the asset level (allow, require, forbid). '
     'is_extensible=false — platform-defined.',
     'master', false, 'active',
     '00000000-0000-0000-0000-000000000000'),

    ('control.depreciation_start_rule',
     'Depreciation start rule',
     'When depreciation begins for an asset (in_service_date, capitalization_date, next_period). '
     'is_extensible=false — accounting standard governed.',
     'control', false, 'active',
     '00000000-0000-0000-0000-000000000000'),

    ('control.residual_value_mode',
     'Residual value mode',
     'How residual/salvage value is specified (amount, percent, zero). '
     'is_extensible=false — calculation logic depends on mode.',
     'control', false, 'active',
     '00000000-0000-0000-0000-000000000000'),

    -- ========================================================================
    -- DOCUMENT schema — Asset Management
    -- ========================================================================

    ('document.asset_txn_type',
     'Asset transaction type',
     'Lifecycle event types for asset transactions (capitalize, depreciate, etc.). '
     'is_extensible=true.',
     'document', true, 'active',
     '00000000-0000-0000-0000-000000000000'),

    -- ========================================================================
    -- RESOLUTION ENGINE (Engine 4.13)
    -- ========================================================================

    -- ── Transaction Resolution ───────────────────────────────────────────────

    ('resolution.event_code',
     'Resolution Event Code',
     'Human-readable labels for transaction flow lifecycle event codes. '
     'Each code identifies a business trigger that initiates resolution processing '
     '(e.g. order_creation, fulfillment, settlement). '
     'Used in control.transaction_flow_template and log.resolution_log. '
     'is_extensible=true — new flow event types added without DDL.',
     'control', true, 'active',
     '00000000-0000-0000-0000-000000000000'),

    ('evt.event_type',
     'Resolution Pipeline Event Type',
     'Domain event type codes emitted by the resolution engine pipeline. '
     'Classifies what the engine produced or decided at each processing step '
     '(e.g. intent.resolved, profile.resolved, entry.generated). '
     'Used in log.resolution_log.event_type. '
     'is_extensible=false — event types are engine-governed.',
     'log', false, 'active',
     '00000000-0000-0000-0000-000000000000')

ON CONFLICT (code) DO NOTHING;


-- ── Bank Engine lookup domains ───────────────────────────────────────────────

INSERT INTO control.lookup_domain (code, name, description, source_schema, is_extensible, status, created_by)
VALUES
    ('master.bank_party_institution_type', 'Bank party institution type', 'Classification of financial institution.', 'master', true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('master.bank_party_national_bank_code_type', 'National bank code type', 'Type of national routing identifier.', 'master', true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('master.bank_account_id_type', 'Bank account identifier type', 'IBAN or LOCAL. Shared across bank_account and bank_format_rule.', 'master', false, 'active', '00000000-0000-0000-0000-000000000000'),
    ('master.bank_account_verification_method', 'Bank account verification method', 'How bank details were verified.', 'master', true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('master.bank_account_link_purpose', 'Bank account link purpose', 'Business purpose of bank account link.', 'master', true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('master.bank_account_local_type', 'Bank account local type', 'Local account classification.', 'master', true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('master.bank_account_usage_type', 'Bank account usage type', 'House bank operational usage.', 'master', true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('master.bank_account_reconciliation_mode', 'Reconciliation mode', 'How bank statement lines are matched.', 'master', false, 'active', '00000000-0000-0000-0000-000000000000'),
    ('master.bank_account_nature', 'Bank account nature', 'Physical nature of bank account: direct, virtual, collection, sub_account.', 'master', true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('control.bank_format_rule_payment_network', 'Payment network', 'Payment rail / clearing network.', 'control', true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('control.bank_format_rule_direction', 'Payment direction', 'Payment direction scope.', 'control', false, 'active', '00000000-0000-0000-0000-000000000000'),
    ('control.bank_format_rule_bank_id_type', 'Bank identifier type', 'Bank routing identifier type.', 'control', true, 'active', '00000000-0000-0000-0000-000000000000')
ON CONFLICT (code) DO NOTHING;


-- ── Payment Method Engine lookup domains ─────────────────────────────────────

INSERT INTO control.lookup_domain (code, name, description, source_schema, is_extensible, status, created_by)
VALUES
    ('master.payment_method_direction', 'Payment method direction', 'Direction scope. Shared across method, policy, binding, settlement.', 'master', false, 'active', '00000000-0000-0000-0000-000000000000'),
    ('master.payment_method_instrument_mode', 'Instrument mode', 'Instrument classification.', 'master', true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('control.bank_interface_profile_type', 'Interface type', 'Delivery mechanism for bank messages.', 'control', true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('control.bank_interface_file_format', 'File format code', 'Payment file/message format standards.', 'control', true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('control.payment_settlement_posting_role', 'Payment settlement posting role', 'Posting role codes used in payment settlement rules.', 'control', true, 'active', '00000000-0000-0000-0000-000000000000')
ON CONFLICT (code) DO NOTHING;


-- ── Payment Terms Engine lookup domains ─────────────────────────────────────

INSERT INTO control.lookup_domain (code, name, description, source_schema, is_extensible, status, created_by)
VALUES
    ('master.payment_term_category', 'Payment term category', 'Classification of payment terms by industry or use case: standard, construction, government, etc. Tenant-extensible.', 'master', true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('master.payment_term_recovery_method', 'Payment term recovery method', 'Methods for recovering advance or retention amounts: pro-rata, lump-sum, milestone-based, etc. Tenant-extensible.', 'master', true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('master.payment_term_release_event', 'Payment term release event', 'Events that trigger retention release: practical completion, final acceptance, DLP expiry, etc. Tenant-extensible.', 'master', true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('master.payment_term_trigger_event', 'Payment term trigger event', 'Events that trigger payment term milestones: PO approval, contract signing, invoice, etc. Tenant-extensible.', 'master', true, 'active', '00000000-0000-0000-0000-000000000000')
ON CONFLICT (code) DO NOTHING;


-- ── Dimension Engine lookup domains ─────────────────────────────────────────

INSERT INTO control.lookup_domain (code, name, description, source_schema, is_extensible, status, created_by)
VALUES
    ('master.dimension_type_category', 'Dimension type category', 'Classification of dimension types: SYSTEM (first-class with dedicated tables), STANDARD (platform-defined reusable), CUSTOM (tenant-created). Platform-governed — not tenant-extensible.', 'master', false, 'active', '00000000-0000-0000-0000-000000000000'),
    ('control.dimension_policy_behavior', 'Dimension policy behavior', 'How a dimension should be treated on transactions within policy scope. Engine-governed — not tenant-extensible.', 'control', false, 'active', '00000000-0000-0000-0000-000000000000')
ON CONFLICT (code) DO NOTHING;


-- ── Document Sequence Engine lookup domains ─────────────────────────────────

INSERT INTO control.lookup_domain (code, name, description, source_schema, is_extensible, status, created_by)
VALUES
    ('control.document_sequence_doc_type', 'Document sequence document type', 'Document types that require sequential numbering. Tenant-extensible — tenants may add custom document types.', 'control', true, 'active', '00000000-0000-0000-0000-000000000000'),
    ('control.document_sequence_reset_strategy', 'Document sequence reset strategy', 'When the document sequence counter resets to zero. Engine-governed — not tenant-extensible.', 'control', false, 'active', '00000000-0000-0000-0000-000000000000')
ON CONFLICT (code) DO NOTHING;


-- ── P2P (Procure-to-Pay) document lookup domains ────────────────────────────

INSERT INTO control.lookup_domain (code, name, description, source_schema, is_extensible, status, created_by)
VALUES
    ('document.purchase_requisition_type',   'Purchase Requisition Type',   'Classification of purchase requisition (standard, urgent, blanket, framework call-off, capex). Platform-governed.', 'document', false, 'active', '00000000-0000-0000-0000-000000000000'),
    ('document.purchase_order_type',         'Purchase Order Type',         'Classification of purchase order (standard, blanket, service, emergency). Platform-governed.', 'document', false, 'active', '00000000-0000-0000-0000-000000000000'),
    ('document.purchase_invoice_type',       'Purchase Invoice Type',       'Type of AP invoice (standard, credit_note, debit_note, advance, retention_release, proforma, self_billed, down_payment, final). Platform-governed.', 'document', false, 'active', '00000000-0000-0000-0000-000000000000'),
    ('document.purchase_invoice_source',     'Purchase Invoice Source',     'How the invoice was originated (po_based, contract_based, non_po, one_time_vendor). Platform-governed.', 'document', false, 'active', '00000000-0000-0000-0000-000000000000'),
    ('document.invoice_match_type',          'Invoice Match Type',          'Matching strategy for AP invoices (three_way, two_way, evaluated_receipt, no_match). Platform-governed.', 'document', false, 'active', '00000000-0000-0000-0000-000000000000'),
    ('document.match_exception_type',        'Match Exception Type',        'Types of invoice matching exceptions (price_variance, quantity_variance, missing_receipt, duplicate_invoice, tax_variance, fx_variance, retention_variance, advance_recovery_mismatch). Platform-governed.', 'document', false, 'active', '00000000-0000-0000-0000-000000000000'),
    ('document.payment_entry_type',          'Payment Entry Type',          'Type of outbound payment (standard, retention_release, advance, final, partial, down_payment, netting, urgent). Platform-governed.', 'document', false, 'active', '00000000-0000-0000-0000-000000000000'),
    ('document.acct_dist_account_source',    'Accounting Distribution Account Source', 'How the GL account was determined for an accounting distribution row (posting_role, from_intent, fixed, from_category). Platform-governed.', 'document', false, 'active', '00000000-0000-0000-0000-000000000000'),
    ('document.procurement_type',            'Invoice Line Procurement Type',          'Nature of the item or service on an invoice line (goods, services, mixed, freight, misc). Platform-governed.', 'document', false, 'active', '00000000-0000-0000-0000-000000000000'),
    ('document.invoice_match_status',        'Invoice Match Status',                   'Three-way match progress status for an invoice or invoice line (unmatched, partially_matched, fully_matched, match_exception). Platform-governed.', 'document', false, 'active', '00000000-0000-0000-0000-000000000000'),
    ('document.invoice_budget_check_result', 'Invoice Budget Check Result',            'Outcome of the budget availability check on a purchase invoice (PASSED, WARNED, OVERRIDE, BLOCKED, EXEMPT). Platform-governed.',                        'document', false, 'active', '00000000-0000-0000-0000-000000000000'),
    ('master.company_code_access_entity_type',  'Company Code Access Entity Type',  'Entity types scoped to company codes via master.company_code_access. is_extensible=true — tenants may add new entity types without DDL.',                  'master', true,  'active', '00000000-0000-0000-0000-000000000000')
ON CONFLICT (code) DO NOTHING;


-- ── Commodity Classification Domains ────────────────────────────────────────

INSERT INTO control.lookup_domain (code, name, description, source_schema, is_extensible, status, created_by)
VALUES
    ('unspsc', 'UNSPSC', 'United Nations Standard Products and Services Code — hierarchical commodity classification used in procurement.', 'shared', false, 'active', '00000000-0000-0000-0000-000000000000'),
    ('hs',     'HS Code', 'Harmonised System — WCO international trade commodity code used for customs and import/export classification.', 'shared', false, 'active', '00000000-0000-0000-0000-000000000000')
ON CONFLICT (code) DO NOTHING;


-- ── Industry Classification Domains ─────────────────────────────────────────

INSERT INTO control.lookup_domain (code, name, description, source_schema, is_extensible, status, created_by)
VALUES
    ('isic',  'ISIC',  'International Standard Industrial Classification of All Economic Activities — UN statistical industry classification (Rev.4).', 'shared', false, 'active', '00000000-0000-0000-0000-000000000000'),
    ('naics', 'NAICS', 'North American Industry Classification System — statistical standard for classifying business establishments.', 'shared', false, 'active', '00000000-0000-0000-0000-000000000000')
ON CONFLICT (code) DO NOTHING;


-- ── UI Principal Domains ─────────────────────────────────────────────────────
-- Supports master.principal_ui_profile, master.principal_ui_preference,
-- master.saved_view, master.dashboard, master.dashboard_widget.
-- source_schema is 'master' (tables reside there); code prefix 'ui.' scopes them.

INSERT INTO control.lookup_domain (code, name, description, source_schema, is_extensible, status, created_by)
VALUES
    ('ui.appearance_mode',
     'UI Appearance Mode',
     'Visual theme mode for principal UI: light, dark, system (follow OS). '
     'Maps to master.principal_ui_profile.appearance_mode. '
     'Tenant-extensible — tenants may add branded themes.',
     'master', true, 'active', '00000000-0000-0000-0000-000000000000'),

    ('ui.density',
     'UI Density',
     'Information density preference: compact, comfortable, spacious. '
     'Controls row height, whitespace, and icon size across all grids/lists. '
     'Maps to master.principal_ui_profile.density_code. '
     'Tenant-extensible — tenants may add custom density levels.',
     'master', true, 'active', '00000000-0000-0000-0000-000000000000'),

    ('ui.preference_code',
     'UI Preference Code',
     'Registry of allowed preference keys for master.principal_ui_preference. '
     'Prevents uncatalogued key proliferation. '
     'Tenant-extensible — tenants may register module-specific preference keys.',
     'master', true, 'active', '00000000-0000-0000-0000-000000000000'),

    ('ui.surface_code',
     'UI Surface Code',
     'Registry of named UI surfaces (screens/panels) that preferences and views target. '
     'e.g. proc.po_list, ap.invoice_detail. '
     'Tenant-extensible — new surfaces added as modules ship.',
     'master', true, 'active', '00000000-0000-0000-0000-000000000000'),

    ('ui.view_scope',
     'Saved View Scope',
     'Ownership scope of a saved view: personal, shared, system. '
     'personal = owner only. shared = all tenant users. system = platform-seeded. '
     'Platform-governed — not tenant-extensible.',
     'master', false, 'active', '00000000-0000-0000-0000-000000000000'),

    ('ui.dashboard_scope',
     'Dashboard Scope',
     'Ownership scope of a dashboard: personal, shared, system. '
     'personal = owner only. shared = all tenant users. system = platform-seeded. '
     'Platform-governed — not tenant-extensible.',
     'master', false, 'active', '00000000-0000-0000-0000-000000000000'),

    ('ui.widget_type',
     'Dashboard Widget Type',
     'Classification of widget rendering type: chart, kpi_card, table, list, '
     'calendar, activity_feed, custom. Drives front-end component routing. '
     'Tenant-extensible — tenants may register custom widget types.',
     'master', true, 'active', '00000000-0000-0000-0000-000000000000'),

    ('ui.breakpoint',
     'Responsive Breakpoint',
     'Named responsive layout breakpoint: xs, sm, md, lg, xl. '
     'NULL widget breakpoint_code = layout applies at all breakpoints. '
     'Platform-governed — not tenant-extensible.',
     'master', false, 'active', '00000000-0000-0000-0000-000000000000'),

    -- ========================================================================
    -- CMS schema (master.content_item family)
    -- ========================================================================

    ('master.content_item_kind',
     'Content Item Kind',
     'Functional category for master.content_item. '
     'Drives rendering and workflow routing. '
     'Tenant-extensible — tenants may register custom content kinds.',
     'master', true, 'active', '00000000-0000-0000-0000-000000000000'),

    ('master.content_item_link_relation_type',
     'Content Item Link Relation Type',
     'Classification of directional links between content items in master.content_item_link. '
     'Tenant-extensible — tenants may register custom relation types.',
     'master', true, 'active', '00000000-0000-0000-0000-000000000000')

ON CONFLICT (code) DO NOTHING;
