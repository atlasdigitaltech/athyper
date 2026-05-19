-- 020_entities/023_entity_description_backfill.sql
-- Backfills description, and applies label_singular / label_plural corrections
-- for all 407 platform-global entities.
--
-- Corrections applied vs. source file:
--   C1  control.lifecycle                    arrow encoding fixed (→ not ?)
--   C2  control.supplier_posting_override    "vendor" → "supplier"
--   C3  master.principal                     em-dashes restored
--   C4  master.legal_entity_*               double-space → dash in labels
--   D   asset_assignment_history             plural → "Histories"
--   D   risk_driver_registry                 plural → "Registries"
--   E   v_employee                           "(view)" suffix removed
--   E   v_tenant_risk_source_config          "(view)" suffix removed
--   F   5 description wording improvements
--   +   shared.industry_crosswalk / commodity_crosswalk: arrow encoding fixed
--   +   master.tenant_risk_source_config: double-space → em-dash in description
--   +   3 missing entities added
--   -   3 decommissioned entities excluded

WITH corrections (tbl_schema, tbl_name, label_singular, label_plural, description) AS (
  VALUES

  -- ── CONTROL (107) ────────────────────────────────────────────────────────

  ('control','tax_group',
    'Tax Group','Tax Groups',
    'A grouping of tax components (e.g., GST + state surcharge) that are applied together to a transaction and resolved to individual tax rates at posting time.'),

  ('control','formula_expression',
    'Formula','Formulas',
    'A reusable parameterized expression that computes a value at runtime from input variables, used in pricing, planning drivers, and policy rules.'),

  ('control','lifecycle',
    'Lifecycle','Lifecycles',
    'A configurable state machine definition that drives an entity through ordered statuses (e.g., draft → submitted → approved → posted) with permitted transitions.'),

  ('control','notification_provider',
    'Notification Provider','Notification Providers',
    'A configured channel (email, SMS, push, webhook) used to deliver outbound notifications from the platform to users or external systems.'),

  ('control','notification_routing_rule',
    'Notification Routing Rule','Notification Routing Rules',
    'A rule that decides which provider, template, and recipients are selected for a given notification event based on tenant, entity type, and context.'),

  ('control','outbox_routing_rule',
    'Outbox Routing Rule','Outbox Routing Rules',
    'A rule that routes outbound integration messages from the transactional outbox to the correct downstream queue, topic, or endpoint.'),

  ('control','lookup_value',
    'Lookup Value','Lookup Values',
    'A single enumerable value (code + label) inside a lookup domain, used to populate dropdowns and constrain field input across forms and APIs.'),

  ('control','notification_template',
    'Notification Template','Notification Templates',
    'A localized message template with placeholders for subject and body, rendered with event data when a notification is dispatched to recipients.'),

  ('control','hook_action_registry',
    'Hook Action','Hook Actions',
    'A registered action handler that can be invoked from lifecycle transitions, workflow stages, or entity events to run side effects synchronously or asynchronously.'),

  ('control','workflow_definition',
    'Workflow Definition','Workflow Definitions',
    'The schema for an approval or review workflow including stages, routing logic, escalation timers, and the conditions that trigger it on a target entity.'),

  ('control','lifecycle_timer_policy',
    'Lifecycle Timer Policy','Lifecycle Timer Policies',
    'A rule that automatically advances or escalates a lifecycle state after a configured duration in that state without manual action.'),

  ('control','lifecycle_state',
    'Lifecycle State','Lifecycle States',
    'A single named status within a lifecycle definition with its display attributes, semantic flags (terminal, locked, active) and permitted operations.'),

  -- F: improved to mention runtime/API/Metadata Studio usage
  ('control','entity',
    'Entity','Entities',
    'Platform-global registry entry defining a named data entity — its backing table, owner module, entity class, labels, and governance attributes consumed by the runtime engine, API layer, and Metadata Studio.'),

  ('control','budget_check_config',
    'Budget Check Configuration','Budget Check Configurations',
    'Configuration that decides when and how budget availability is verified for a commitment or actual posting, including hard-block versus soft-warn behavior.'),

  ('control','policy_rule',
    'Policy Rule','Policy Rules',
    'An executable rule attached to a policy definition that evaluates conditions against record data and produces an allow, deny, or warn outcome.'),

  ('control','field_group_member',
    'Field Group Member','Field Group Members',
    'An entry assigning a specific field to a field group so that security, layout, and validation can be applied collectively to the group.'),

  ('control','field_security_policy',
    'Field Security Policy','Field Security Policies',
    'A policy that restricts read or write access to individual fields based on role, persona, or record state.'),

  ('control','overlay',
    'Overlay','Overlays',
    'A tenant- or context-specific override layered onto a base configuration object to customize behavior without forking the underlying definition.'),

  ('control','entity_operation',
    'Entity Operation','Entity Operations',
    'A named operation that can be invoked against an entity (create, update, post, void, etc.) along with its permission and lifecycle requirements.'),

  ('control','entity_lifecycle',
    'Entity Lifecycle Binding','Entity Lifecycle Bindings',
    'The binding between an entity type and the lifecycle definition that governs it, including the initial state and applicable conditions.'),

  ('control','overlay_change',
    'Overlay Change','Overlay Changes',
    'A versioned delta record describing what an overlay modified, added, or removed, used for audit, rollback, and diff display.'),

  -- F: clarified parent-record role
  ('control','acct_profile_config',
    'Accounting Profile Configuration','Accounting Profile Configurations',
    'Top-level parent record for an accounting profile, grouping its entry templates, book rules, dimension rules, and events under a single named intent mapping.'),

  ('control','transaction_flow_template',
    'Transaction Flow Template','Transaction Flow Templates',
    'A reusable template that orchestrates the end-to-end sequence of documents and postings for a business transaction (e.g., procure-to-pay).'),

  ('control','acct_profile_entry_template',
    'Accounting Entry Template','Accounting Entry Templates',
    'A row template within an accounting profile that specifies one journal line''s debit/credit side, account derivation, and amount formula.'),

  ('control','acct_profile_dimension_rule',
    'Accounting Dimension Rule','Accounting Dimension Rules',
    'A rule within an accounting profile that determines how analytical dimensions (cost center, project, etc.) are populated on resulting journal lines.'),

  ('control','acct_profile_book_rule',
    'Accounting Book Rule','Accounting Book Rules',
    'A rule within an accounting profile that selects which ledger books a posting flows into and any book-specific overrides for that posting.'),

  ('control','acct_profile_commitment_config',
    'Accounting Commitment Configuration','Accounting Commitment Configurations',
    'Configuration that defines how commitment postings (encumbrances) are generated, sized, and released for transactions handled by the accounting profile.'),

  ('control','intent_to_accounting_profile_rule',
    'Intent-to-Profile Rule','Intent-to-Profile Rules',
    'A resolution rule that maps a business intent plus context (company, document type, dimensions) to the accounting profile that should be used.'),

  ('control','entity_policy',
    'Entity Policy','Entity Policies',
    'A policy binding that attaches one or more policy rules to a specific entity type, scoping when and how the rules are evaluated.'),

  ('control','dimension_policy_allowed_value',
    'Dimension Policy Allowed Value','Dimension Policy Allowed Values',
    'A specific dimension value that is whitelisted or blacklisted by a dimension policy for a given context.'),

  ('control','intent_profile_override',
    'Intent Profile Override','Intent Profile Overrides',
    'A targeted override that swaps in an alternate accounting profile for a specific tenant, company, or party while leaving the base mapping intact.'),

  ('control','dimension_policy',
    'Dimension Policy','Dimension Policies',
    'A policy that constrains which analytical dimensions and values are valid for a given account, transaction type, or organizational scope.'),

  ('control','wht_threshold_config',
    'Withholding Tax Threshold','Withholding Tax Thresholds',
    'Configuration of minimum cumulative amounts before withholding tax applies, including the period, basis, and rate that takes effect at threshold.'),

  ('control','planning_driver_assumption',
    'Planning Driver Assumption','Planning Driver Assumptions',
    'A scenario-bound value for a planning driver (e.g., headcount growth %, FX rate) consumed by formulas to produce forecast figures.'),

  ('control','forecast_line',
    'Forecast Line','Forecast Lines',
    'A single line of a forecast model containing the account, dimensions, period bucket, and computed or entered amount.'),

  ('control','planning_driver_version',
    'Planning Driver Version','Planning Driver Versions',
    'A snapshot of planning driver values for a specific scenario and revision, enabling parallel forecasts and what-if comparisons.'),

  ('control','planning_driver',
    'Planning Driver','Planning Drivers',
    'A named variable used in planning formulas (e.g., units sold, average price) that aggregates assumptions and feeds forecast calculations.'),

  ('control','forecast_budget_bridge',
    'Forecast-to-Budget Bridge','Forecast-to-Budget Bridges',
    'A reconciliation record explaining variances between a forecast version and an approved budget at the account or dimension level.'),

  ('control','tax_group_component',
    'Tax Group Component','Tax Group Components',
    'A member tax type within a tax group, defining its rate source, base, and computation order relative to other components in the group.'),

  ('control','feature_flag',
    'Feature Flag','Feature Flags',
    'A toggle controlling whether a feature is enabled for a tenant, group, or user, supporting gradual rollout and quick rollback.'),

  ('control','metadata_change_application_log',
    'Metadata Change Application Log','Metadata Change Application Logs',
    'An audit entry recording when a metadata change request was applied, by whom, and the resulting deployed state across affected objects.'),

  ('control','content_quota',
    'Content Quota','Content Quotas',
    'A limit on the amount of content (attachments, records, storage) a tenant or workspace may consume, with the current usage tracked against it.'),

  ('control','entity_flow_section',
    'Entity Flow Section','Entity Flow Sections',
    'A grouped section within an entity form flow, controlling layout, conditional visibility, and ordering of fields presented to the user.'),

  ('control','tenant_blueprint_application',
    'Tenant Blueprint Application','Tenant Blueprint Applications',
    'A record of a blueprint package being applied to a tenant, including the version, parameters supplied, and resulting metadata footprint.'),

  ('control','cron_schedule',
    'Cron Schedule','Cron Schedules',
    'A schedule definition (using cron expressions) that drives periodic execution of background jobs, runs, and integrations.'),

  ('control','ai_action_policy',
    'AI Action Policy','AI Action Policies',
    'A policy that governs which AI-suggested actions are auto-applied, require human review, or are blocked based on confidence and risk thresholds.'),

  ('control','blueprint_registry',
    'Blueprint','Blueprints',
    'A registered template package of metadata, configuration, and seed data that can be installed onto a tenant as a coherent starting point.'),

  ('control','match_tolerance_config',
    'Match Tolerance Configuration','Match Tolerance Configurations',
    'Configuration of allowable variances (amount, quantity, price) when matching invoices to purchase orders and goods receipts during three-way match.'),

  ('control','lookup_domain',
    'Lookup Domain','Lookup Domains',
    'A named set of lookup values forming an enumeration (e.g., country, payment status) referenced by entity fields and APIs.'),

  ('control','lifecycle_transition_gate',
    'Lifecycle Transition Gate','Lifecycle Transition Gates',
    'A precondition attached to a lifecycle transition that must evaluate to true (e.g., approvals complete, balance valid) before the move is permitted.'),

  ('control','workflow_template',
    'Workflow Template','Workflow Templates',
    'A reusable workflow shell with predefined stages, rules, and SLAs that can be instantiated for specific entity types or business cases.'),

  ('control','mfa_config',
    'MFA Configuration','MFA Configurations',
    'Tenant-level multi-factor authentication settings controlling required factors, enrolment policies, and grace periods for affected users.'),

  ('control','lifecycle_transition_hook',
    'Lifecycle Transition Hook','Lifecycle Transition Hooks',
    'A handler invoked before, during, or after a lifecycle transition to run validations, side effects, or downstream postings.'),

  ('control','lifecycle_hook_override',
    'Lifecycle Hook Override','Lifecycle Hook Overrides',
    'A tenant- or scope-specific override that disables, replaces, or augments a base lifecycle hook for a particular entity binding.'),

  ('control','workflow_template_stage',
    'Workflow Stage Definition','Workflow Stage Definitions',
    'A defined stage within a workflow template, including its approver resolution logic, parallel/sequential behavior, and exit conditions.'),

  ('control','lifecycle_transition',
    'Lifecycle Transition','Lifecycle Transitions',
    'A defined move from one lifecycle state to another, including the triggering operation, required permissions, and attached hooks and gates.'),

  ('control','transaction_event_catalog',
    'Transaction Event','Transaction Events',
    'A catalog entry describing a recognized business event (e.g., invoice posted, payment cleared) that downstream consumers may subscribe to.'),

  ('control','entity_relation',
    'Entity Relation','Entity Relations',
    'A declared relationship between two entity types (one-to-many, many-to-many, link table) used to drive navigation, validation, and queries.'),

  ('control','workflow_sla_policy',
    'Workflow SLA Policy','Workflow SLA Policies',
    'A service-level policy on a workflow stage defining target completion time and escalation behavior when the SLA is breached.'),

  ('control','acct_profile_settlement_config',
    'Accounting Settlement Configuration','Accounting Settlement Configurations',
    'Configuration of how an accounting profile generates settlement postings (clearing, netting, suspense releases) when related documents close out.'),

  ('control','workflow_template_rule',
    'Workflow Template Rule','Workflow Template Rules',
    'A rule attached to a workflow template that selects approvers, routes work, or short-circuits stages based on record content.'),

  ('control','book_posting_rule',
    'Book Posting Rule','Book Posting Rules',
    'A rule that determines whether and how a posting flows into a specific ledger book (statutory, IFRS, management, tax) with book-specific overrides.'),

  ('control','asset_class_book_policy',
    'Asset Class Book Policy','Asset Class Book Policies',
    'Policy linking an asset class to a ledger book with default depreciation method, useful life, and salvage handling for assets created in that class.'),

  ('control','rounding_rule',
    'Rounding Rule','Rounding Rules',
    'A rule defining how numeric values are rounded (mode, precision, currency-specific behavior) when computed in postings and reports.'),

  ('control','asset_class_book_policy_template',
    'Asset Class Book Policy Template','Asset Class Book Policy Templates',
    'A reusable template of asset-class-to-book policies that can be applied to new tenants or company codes for consistent fixed-asset accounting setup.'),

  -- document_sequence_config EXCLUDED (decommissioned)

  ('control','policy_rule_version',
    'Policy Rule Version','Policy Rule Versions',
    'An immutable historical version of a policy rule, retained for audit and to allow rollback to a previously published rule definition.'),

  ('control','entity_field',
    'Entity Field','Entity Fields',
    'The definition of a single field on an entity, including its data type, label, validation, default, and security attributes.'),

  ('control','entity_version',
    'Entity Version','Entity Versions',
    'A point-in-time snapshot of an entity definition, used to diff changes, restore prior shapes, and support metadata migration.'),

  ('control','ai_confidence_threshold',
    'AI Confidence Threshold','AI Confidence Thresholds',
    'A threshold above which an AI prediction or extraction may be auto-applied, with separate cutoffs for review-required and reject behavior.'),

  ('control','policy_test_case',
    'Policy Test Case','Policy Test Cases',
    'A saved test scenario for a policy rule with sample inputs and the expected outcome, run regression-style when the rule is changed.'),

  ('control','entity_flow',
    'Entity Flow','Entity Flows',
    'A guided multi-step flow for capturing data into an entity, composed of sections, steps, and conditional logic for the end-user experience.'),

  ('control','entity_flow_step',
    'Entity Flow Step','Entity Flow Steps',
    'A single step inside an entity flow representing one screen of the wizard, with its fields, validations, and navigation rules.'),

  ('control','ai_drift_baseline',
    'AI Drift Baseline','AI Drift Baselines',
    'A reference distribution of inputs or predictions used to detect drift in deployed AI models and trigger retraining or alerts.'),

  ('control','policy_definition',
    'Policy Definition','Policy Definitions',
    'The top-level definition of a named policy, grouping its rules, scope, severity, and how it is evaluated against records and operations.'),

  ('control','entity_flow_field',
    'Entity Flow Field','Entity Flow Fields',
    'An individual field placement inside an entity flow step, with its display order, requiredness, and conditional behavior overrides.'),

  ('control','parameter_definition',
    'Parameter Definition','Parameter Definitions',
    'A typed parameter declaration (key, type, default, scope) used by formulas, flows, and configurations to accept structured input.'),

  ('control','intake_idempotency',
    'Intake Idempotency Key','Intake Idempotency Keys',
    'A recorded request key used to detect and short-circuit duplicate inbound submissions to the same intake endpoint.'),

  ('control','record_edit_lock',
    'Record Edit Lock','Record Edit Locks',
    'An advisory or pessimistic lock on a record while a user or process is editing it, preventing concurrent updates and merge conflicts.'),

  ('control','planning_driver_formula',
    'Planning Driver Formula','Planning Driver Formulas',
    'A formula that computes a planning driver''s value from other drivers, assumptions, and historicals during forecast generation.'),

  ('control','bank_format_rule',
    'Bank Format Rule','Bank Format Rules',
    'A rule mapping internal payment data onto a specific bank file format (e.g., ISO 20022, NACHA), governing field layout and serialization.'),

  ('control','payment_method_company_policy',
    'Payment Method Company Policy','Payment Method Company Policies',
    'A company-code-level policy enabling or constraining a payment method, including caps, allowed currencies, and required approvals.'),

  ('control','bank_interface_profile',
    'Bank Interface Profile','Bank Interface Profiles',
    'A profile describing how to exchange payment and statement files with a bank: protocol, endpoints, credentials, and supported message types.'),

  ('control','payment_settlement_rule',
    'Payment Settlement Rule','Payment Settlement Rules',
    'A rule directing how an incoming or outgoing payment is settled against open items, including matching tolerance and clearing account logic.'),

  ('control','payment_method_interface_binding',
    'Payment Method Interface Binding','Payment Method Interface Bindings',
    'A binding linking a payment method to a specific bank interface profile and format rule so payments can be dispatched correctly.'),

  ('control','v_active_flow_templates',
    'Active Flow Templates','Active Flow Templates',
    'A view exposing the currently active set of transaction flow templates per tenant for runtime resolution and admin browsing.'),

  ('control','v_blueprint_catalogue',
    'Blueprint Catalogue','Blueprint Catalogues',
    'A view aggregating available blueprints with summary metadata for discovery in the install and onboarding experience.'),

  ('control','entity_class_profile',
    'Entity Class Profile','Entity Class Profiles',
    'A profile classifying an entity (e.g., master, document, control) and bundling default behaviors like soft delete, versioning, and audit retention.'),

  ('control','field_group',
    'Field Group','Field Groups',
    'A named bundle of related fields on an entity (e.g., banking, address) used for layout, security, and validation grouping.'),

  ('control','entity_publish_state',
    'Entity Publish State','Entity Publish States',
    'The publish status of an entity definition (draft, published, deprecated) controlling whether it is usable at runtime.'),

  ('control','commodity_classification_config',
    'Commodity Classification Configuration','Commodity Classification Configurations',
    'Configuration of how raw item or spend data is classified into commodity codes and categories using rules, ML, or external services.'),

  -- document_sequence_counter EXCLUDED (decommissioned)

  ('control','v_acct_profile_full',
    'Accounting Profile Detail','Accounting Profile Details',
    'A view denormalizing an accounting profile with all its rules, events, and templates for inspection and debugging in one place.'),

  ('control','formula_expression_version',
    'Formula Version','Formula Versions',
    'A versioned snapshot of a formula expression preserving its prior text and metadata for audit and rollback after edits.'),

  ('control','rate_table',
    'Rate Table','Rate Tables',
    'A two-dimensional table of rates (e.g., by tier, region, period) referenced by formulas and pricing rules during computation.'),

  ('control','rate_table_row',
    'Rate Table Row','Rate Table Rows',
    'A single row in a rate table with its key columns and the rate or amount value returned when those keys match.'),

  ('control','commodity_classification_to_intent_rule',
    'Classification-to-Intent Rule','Classification-to-Intent Rules',
    'A rule mapping a commodity classification to a business intent so that downstream accounting profiles are resolved automatically.'),

  ('control','commodity_code_to_category_rule',
    'Commodity Routing Rule','Commodity Routing Rules',
    'A rule that assigns a specific commodity code to a higher-level commodity category for analytics, policy, and reporting purposes.'),

  ('control','commodity_category_buy_policy',
    'Commodity Buy Policy','Commodity Buy Policies',
    'Policy governing how a commodity category may be procured, including preferred suppliers, contracts required, approval thresholds, and channels.'),

  -- C2: "vendor" → "supplier"
  ('control','supplier_posting_override',
    'Supplier Posting Override','Supplier Posting Overrides',
    'A supplier-specific override of the default accounting posting rules, used when a supplier requires bespoke account or dimension handling.'),

  ('control','commodity_category_sell_policy',
    'Commodity Sell Policy','Commodity Sell Policies',
    'Policy governing how a commodity category may be sold, including pricing rules, allowed customer segments, and revenue recognition method.'),

  ('control','commodity_category_inventory_policy',
    'Commodity Inventory Policy','Commodity Inventory Policies',
    'Policy governing how a commodity category is held in inventory, including valuation method, reorder thresholds, and slow-mover handling.'),

  ('control','acct_profile_revenue_config',
    'Accounting Revenue Configuration','Accounting Revenue Configurations',
    'Configuration of revenue recognition behavior in an accounting profile, including timing rules, deferral accounts, and performance obligation handling.'),

  ('control','acct_profile_event',
    'Accounting Profile Event','Accounting Profile Events',
    'A discrete event point within an accounting profile (e.g., goods receipt, invoice, payment) at which a defined set of postings is generated.'),

  ('control','tax_rate_schedule',
    'Tax Rate Schedule','Tax Rate Schedules',
    'A time-effective schedule of tax rates for a tax type and jurisdiction, used to look up the applicable rate at a transaction''s tax date.'),

  ('control','metadata_change_request',
    'Metadata Change Request','Metadata Change Requests',
    'A proposed change to platform metadata (entities, fields, policies) submitted for review and downstream deployment via the change pipeline.'),

  ('control','connector_type',
    'Connector Type','Connector Types',
    'A definition of an integration connector category (e.g., S/4 HANA, Stripe, SFTP) including its supported operations and configuration schema.'),

  -- NEW: entity_numbering_config
  ('control','entity_numbering_config',
    'Entity Numbering Config','Entity Numbering Configs',
    'Policy configuration for a numbered entity field, specifying its prefix, separator, segment structure (year/sequence/branch), reset strategy, and allowed character set used by the numbering engine to generate gap-free document numbers.'),

  -- NEW: entity_numbering_counter
  ('control','entity_numbering_counter',
    'Entity Numbering Counter','Entity Numbering Counters',
    'Hot-state counter storing the last allocated sequence value per numbering config and scope key (company, fiscal year, period), updated atomically on every number generation to guarantee collision-free, gap-free sequences.'),

  -- ── DOCUMENT (82) ────────────────────────────────────────────────────────

  ('document','journal_entry',
    'Journal Entry','Journal Entries',
    'A balanced double-entry posting that records debits and credits to the general ledger, optionally linked to a source document, period, and approval workflow.'),

  ('document','purchase_requisition_line',
    'Purchase Requisition Line','Purchase Requisition Lines',
    'A single requested item or service on a purchase requisition, with quantity, estimated price, account assignment, and target delivery details.'),

  ('document','purchase_requisition',
    'Purchase Requisition','Purchase Requisitions',
    'An internal request to procure goods or services, used to capture requester intent and route for approval before a purchase order is created.'),

  ('document','purchase_order_confirmation_line',
    'PO Confirmation Line','PO Confirmation Lines',
    'A supplier''s confirmation of a specific purchase order line, recording committed quantity, price, and delivery dates against the original line.'),

  ('document','commitment_release_allocation',
    'Commitment Release Allocation','Commitment Release Allocations',
    'An allocation that releases an encumbered amount from a prior commitment as a downstream document (e.g., invoice) consumes it.'),

  ('document','purchase_invoice_line',
    'Purchase Invoice Line','Purchase Invoice Lines',
    'A single billed item or service on a supplier invoice, including quantity, price, tax, account assignment, and links to matched PO and receipt lines.'),

  ('document','delivery_note_line',
    'Delivery Note Line','Delivery Note Lines',
    'A single line on an outgoing delivery note recording the item, quantity shipped, and the originating sales order or transfer reference.'),

  ('document','goods_receipt_line',
    'Goods Receipt Line','Goods Receipt Lines',
    'A single line on a goods receipt recording the item, received quantity, condition, and the purchase order or transfer reference it fulfills.'),

  ('document','journal_line',
    'Journal Line','Journal Lines',
    'A single debit or credit line of a journal entry with its account, amount, currency, dimensions, and tax attributes.'),

  ('document','service_entry_sheet_line',
    'Service Entry Sheet Line','Service Entry Sheet Lines',
    'A single line on a service entry sheet recording services rendered against a service-based purchase order, including quantity, period, and approver.'),

  ('document','journal_line_reference',
    'Journal Line Reference','Journal Line References',
    'A pointer linking a journal line to a source document or business object (e.g., open item, asset, project) for traceability and clearing.'),

  ('document','depreciation_run_line',
    'Depreciation Run Line','Depreciation Run Lines',
    'A single computed depreciation line within a depreciation run, recording the asset, book, period amount, and resulting journal posting.'),

  ('document','commitment_line',
    'Commitment Line','Commitment Lines',
    'A single line of a commitment document recording the encumbered account, dimensions, amount, and link to the source obligation.'),

  ('document','payment_entry_allocation',
    'Payment Allocation','Payment Allocations',
    'An allocation of part of a payment entry against a specific open item (invoice, credit memo, advance), enabling partial and multi-document clearing.'),

  ('document','stocktake_line',
    'Stocktake Line','Stocktake Lines',
    'A single counted-item line on a stocktake document, recording the location, item, system quantity, counted quantity, and any variance.'),

  ('document','bank_statement_line',
    'Bank Statement Line','Bank Statement Lines',
    'A single transaction line on an imported bank statement, including booking date, amount, counterparty, and references used for reconciliation.'),

  ('document','bank_recon_case_line',
    'Bank Reconciliation Case Line','Bank Reconciliation Case Lines',
    'A candidate or confirmed match within a bank reconciliation case linking a statement line to an internal open item or proposed posting.'),

  ('document','accounting_distribution',
    'Account Assignment Split','Account Assignment Splits',
    'A split of a document line''s amount across multiple account assignments (cost centers, projects, GL accounts) with allocation rules and percentages.'),

  ('document','purchase_order',
    'Purchase Order','Purchase Orders',
    'A binding order issued to a supplier to procure goods or services at agreed quantities, prices, and delivery terms, used as the basis for receipt and invoice matching.'),

  ('document','delivery_note',
    'Delivery Note','Delivery Notes',
    'An outbound shipping document accompanying goods leaving the warehouse, listing items, quantities, and the originating sales order or transfer.'),

  ('document','commitment_party_snapshot',
    'Commitment Party Snapshot','Commitment Party Snapshots',
    'A frozen snapshot of party master data (name, tax IDs, address) at the time a commitment is created, preserving the values used at issuance.'),

  ('document','invoice_address_snapshot',
    'Invoice Address Snapshot','Invoice Address Snapshots',
    'A frozen address snapshot captured on an invoice (bill-to, ship-to, remit-to) to preserve the precise text printed and used for tax determination.'),

  ('document','doc_attachment',
    'Document Attachment','Document Attachments',
    'An attachment linked to a specific business document (invoice, PO, journal) including its file reference, role (original, support, signed), and metadata.'),

  ('document','depreciation_schedule',
    'Depreciation Schedule','Depreciation Schedules',
    'The forward-looking schedule of planned depreciation amounts per period for an asset and book, recomputed when method, life, or value changes.'),

  ('document','commitment_address_snapshot',
    'Commitment Address Snapshot','Commitment Address Snapshots',
    'A frozen address snapshot captured on a commitment to preserve the exact text used for the obligation at the moment of issuance.'),

  ('document','invoice_party_snapshot',
    'Invoice Party Snapshot','Invoice Party Snapshots',
    'A frozen snapshot of party master data (legal name, registration numbers) captured on an invoice for compliant printing and downstream reporting.'),

  ('document','invoice_bank_snapshot',
    'Invoice Bank Snapshot','Invoice Bank Snapshots',
    'A frozen snapshot of the bank account details printed on or used by an invoice for payment, preserving IBAN/BIC at issue time.'),

  ('document','invoice_tax_snapshot',
    'Invoice Tax Snapshot','Invoice Tax Snapshots',
    'A frozen snapshot of tax codes, rates, and registration numbers applied to an invoice to lock the tax treatment at issuance.'),

  ('document','intercompany_agreement',
    'Intercompany Agreement','Intercompany Agreements',
    'An agreement between two related legal entities defining the basis (markup, cost-plus, services) for intercompany billings and eliminations.'),

  ('document','purchase_order_confirmation',
    'PO Confirmation','PO Confirmations',
    'A document recording the supplier''s confirmation of a purchase order, capturing committed quantities, prices, and delivery dates per line.'),

  ('document','import_request_chunk',
    'Import Chunk','Import Chunks',
    'A chunk of records within a larger import request, used to parallelize processing and track per-chunk progress, errors, and outcomes.'),

  ('document','goods_receipt',
    'Goods Receipt','Goods Receipts',
    'A document recording the physical or service receipt of items against a purchase order or transfer, posting inventory and accruing GR/IR.'),

  ('document','import_request',
    'Import Request','Import Requests',
    'A submitted bulk-import job, including the entity type, source file, parameters, and the high-level status of all chunks under it.'),

  ('document','bank_statement',
    'Bank Statement','Bank Statements',
    'An imported bank statement covering a specific account and period, containing the closing balance and the lines posted by the bank.'),

  ('document','party_advance_balance',
    'Party Advance Balance','Party Advance Balances',
    'The running balance of unapplied advances or prepayments held with a specific party (customer or supplier), available for future allocation.'),

  ('document','render_job',
    'Render Job','Render Jobs',
    'A queued or in-progress request to render a document (e.g., PDF invoice) using a template, with parameters and the resulting output reference.'),

  ('document','render_output',
    'Render Output','Render Outputs',
    'A produced output file from a render job, including the format, storage location, hash, and the template version used to generate it.'),

  ('document','workflow_request',
    'Workflow Request','Workflow Requests',
    'A live instance of a workflow created from a template for a specific record, tracking its overall state and progress through the defined stages.'),

  ('document','workflow_stage',
    'Workflow Stage','Workflow Stages',
    'A live stage instance within a workflow request, tracking its assigned approvers, decisions, timestamps, and outcome.'),

  ('document','fx_revaluation_run',
    'FX Revaluation Run','FX Revaluation Runs',
    'A periodic run that revalues open foreign-currency items and balances at a target rate, producing unrealized FX gain/loss postings.'),

  ('document','forecast_scenario',
    'Forecast Scenario','Forecast Scenarios',
    'A named scenario within a forecast (base, optimistic, downside) bundling the planning driver assumptions and the resulting forecast lines.'),

  ('document','obligation_horizon',
    'Obligation Horizon','Obligation Horizons',
    'The forward-looking cash or liability profile derived from open obligations, used in liquidity planning and committed-spend reporting.'),

  ('document','payment_term_discount_result',
    'Payment Term Discount Result','Payment Term Discount Results',
    'The computed discount result for an invoice under its payment terms, including eligible amount, discount rate, and the deadline by which it applies.'),

  ('document','attendance_adjustment_request',
    'Attendance Adjustment','Attendance Adjustments',
    'A request submitted by an employee or manager to correct attendance, punches, or worked hours, routed for approval before applying to time records.'),

  ('document','asset_transaction',
    'Asset Transaction','Asset Transactions',
    'A discrete event on a fixed asset (acquisition, capitalization, transfer, retirement, impairment) that drives postings and updates asset values.'),

  ('document','payment_remittance_output',
    'Payment Remittance Output','Payment Remittance Outputs',
    'A produced remittance advice (file or document) listing the invoices and amounts paid under a specific payment, sent to the payee for reconciliation.'),

  ('document','depreciation_run',
    'Depreciation Run','Depreciation Runs',
    'A periodic run that posts depreciation for a set of assets and books over a target period, producing per-asset journal lines and run logs.'),

  ('document','payment_term_application',
    'Payment Term Application','Payment Term Applications',
    'The applied payment term on a specific document, recording the schedule of due dates, discount tiers, and the snapshot used to compute them.'),

  ('document','ic_elimination',
    'Intercompany Elimination','Intercompany Eliminations',
    'A consolidation-time elimination posting that removes intercompany balances or P&L between related entities to produce group financials.'),

  ('document','attendance_day',
    'Attendance Day','Attendance Days',
    'The consolidated attendance record for an employee on a specific day, including scheduled hours, worked hours, breaks, and exception flags.'),

  ('document','intercompany_transaction',
    'Intercompany Transaction','Intercompany Transactions',
    'A transaction recognized between two related legal entities, generating mirrored postings on each side for downstream consolidation and elimination.'),

  ('document','stocktake',
    'Stocktake','Stocktakes',
    'A counted-inventory document covering a location, period, and scope, producing variance lines and adjustment postings against book inventory.'),

  ('document','wht_certificate',
    'Withholding Tax Certificate','Withholding Tax Certificates',
    'A certificate issued to a payee documenting tax withheld by the payer, used for the payee''s tax filing and as proof of payment to authorities.'),

  ('document','service_entry_sheet',
    'Service Entry Sheet','Service Entry Sheets',
    'A document recording services received against a service-based purchase order, capturing periods, quantities, and approvers before invoice posting.'),

  ('document','invoice_match_case',
    'Invoice Match Case','Invoice Match Cases',
    'A case opened during invoice processing to evaluate matches against POs and receipts, including proposed matches, tolerances, and exception resolutions.'),

  ('document','command_log',
    'Command Log','Command Logs',
    'An audit log entry recording a command executed against the platform (operation, actor, payload hash, outcome) for traceability and forensics.'),

  ('document','hr_case',
    'HR Case','HR Cases',
    'A people-related case (e.g., grievance, query, leave dispute) routed through HR workflows with assignees, status, and full audit trail.'),

  ('document','netting_batch',
    'Netting Batch','Netting Batches',
    'A run that nets payable and receivable balances between counterparties or intercompany pairs, producing reduced net settlement postings.'),

  ('document','bank_recon_case',
    'Bank Reconciliation Case','Bank Reconciliation Cases',
    'A case opened to reconcile bank statement lines against internal postings, holding match candidates, exceptions, and resolution decisions.'),

  ('document','commitment',
    'Commitment','Commitments',
    'An obligation document (e.g., PO, contract release) that encumbers budget and represents future cash outflow ahead of actual invoice posting.'),

  -- F: "subtype" added
  ('document','commitment_procurement',
    'Procurement Commitment','Procurement Commitments',
    'A commitment subtype tied specifically to procurement activity (purchase orders, blanket releases), feeding encumbrance accounting and budget consumption.'),

  ('document','match_exception',
    'Match Exception','Match Exceptions',
    'An exception raised when an invoice cannot be matched cleanly to its PO and receipt, capturing the variance type and required resolution path.'),

  ('document','leave_balance_entry',
    'Leave Balance Entry','Leave Balance Entries',
    'A balance-changing entry on an employee''s leave plan, recording the accrual, usage, adjustment, or carryover and the resulting balance.'),

  ('document','leave_request',
    'Leave Request','Leave Requests',
    'An employee''s request for time off under a leave type, with dates, hours, approval routing, and impact on the relevant leave balance.'),

  ('document','offboarding_case',
    'Offboarding Case','Offboarding Cases',
    'An offboarding workflow record for a departing employee, coordinating final pay, asset return, access revocation, and exit interviews.'),

  ('document','onboarding_case',
    'Onboarding Case','Onboarding Cases',
    'An onboarding workflow record for a new hire, coordinating paperwork, provisioning, training, and first-day readiness tasks.'),

  ('document','people_request',
    'People Request','People Requests',
    'A general HR-related request submitted by an employee or manager (data change, certificate, support) routed to the appropriate handler.'),

  ('document','policy_acknowledgment',
    'Policy Acknowledgment','Policy Acknowledgments',
    'A record of an employee acknowledging a specific policy (handbook, code of conduct, training) at a point in time, retained for compliance evidence.'),

  ('document','shift_assignment',
    'Shift Assignment','Shift Assignments',
    'An assignment of a specific shift to an employee for a given date or schedule period, driving expected attendance and pay calculation.'),

  ('document','time_punch',
    'Time Punch','Time Punches',
    'A clock-in or clock-out event captured from a time-tracking device or app, with timestamp, location, and the resulting work interval.'),

  ('document','compensation_assignment',
    'Compensation Assignment','Compensation Assignments',
    'An assignment of a compensation package (pay structure, components, rates) to an employee, effective for a defined period.'),

  ('document','compensation_change',
    'Compensation Change','Compensation Changes',
    'A change event modifying an employee''s compensation (raise, promotion, structural change) with reason, effective date, and approval trail.'),

  ('document','employee_tax_declaration',
    'Employee Tax Declaration','Employee Tax Declarations',
    'A declaration submitted by an employee covering tax-relevant exemptions, deductions, and elections used to compute payroll withholding.'),

  ('document','employee_tax_declaration_line',
    'Tax Declaration Line','Tax Declaration Lines',
    'A single declared item on an employee tax declaration (e.g., a deduction or exemption) with amount, evidence, and validation status.'),

  ('document','payroll_period',
    'Payroll Period','Payroll Periods',
    'A defined pay period (e.g., monthly, bi-weekly) within a pay calendar, used to bound payroll runs and accumulators.'),

  ('document','payroll_result',
    'Payroll Result','Payroll Results',
    'The computed payroll outcome for an employee in a period, summarizing gross, deductions, taxes, net pay, and contributions.'),

  ('document','payroll_result_line',
    'Payroll Result Line','Payroll Result Lines',
    'A single component line within a payroll result, capturing one pay component''s amount, basis, and contribution to the totals.'),

  ('document','payroll_run',
    'Payroll Run','Payroll Runs',
    'A run that executes payroll for a defined pay group and period, producing per-employee results and the consolidated posting to GL.'),

  ('document','payroll_run_employee',
    'Payroll Run Employee','Payroll Run Employees',
    'An employee''s participation record in a specific payroll run, with status, retry information, and link to the produced result.'),

  ('document','user_profile_update_request',
    'Profile Update Request','Profile Update Requests',
    'A request submitted to update a user profile field that requires review (e.g., legal name, bank account), with approval and audit trail.'),

  ('document','purchase_invoice',
    'Purchase Invoice','Purchase Invoices',
    'A supplier invoice document recording amounts payable for goods or services received, matched against POs and receipts before posting to AP.'),

  ('document','payment_entry',
    'Payment Entry','Payment Entries',
    'A payment document recording funds disbursed or received against one or more open items, including allocations, bank reference, and clearing impact.'),

  -- ── MASTER (195) ─────────────────────────────────────────────────────────

  ('master','company_code_chart_assignment',
    'COA Assignment','COA Assignments',
    'The assignment of a chart of accounts to a company code, optionally for a specific period, controlling which accounts the company posts against.'),

  ('master','party_contact_role',
    'Party Contact Role','Party Contact Roles',
    'A role tag (AP contact, sales rep, technical) assigned to a contact person at a party, controlling routing and visibility in business processes.'),

  ('master','notification',
    'Notification','Notifications',
    'A delivered or pending notification record for a recipient, capturing the event, channel, payload, and read/acknowledgement state.'),

  ('master','company_code_dimension_default',
    'Dimension Default','Dimension Defaults',
    'A default dimension value applied at posting time for a specific company code when the document does not explicitly supply one.'),

  ('master','party_risk_assessment',
    'Party Risk Assessment','Party Risk Assessments',
    'A point-in-time assessment of a business partner''s risk profile across configured dimensions, producing scores and an overall classification.'),

  ('master','v_contact_summary',
    'Contact Summary','Contact Summaries',
    'A view summarizing a contact person with their party, roles, primary email and phone for fast lookup in screens and APIs.'),

  ('master','attachment_folder',
    'Attachment Folder','Attachment Folders',
    'A logical folder for organizing attachments under an owning record, supporting nested grouping and ACL inheritance.'),

  ('master','party_risk_review_event',
    'Party Risk Review Event','Party Risk Review Events',
    'A discrete review event on a party''s risk file (scheduled, ad-hoc, triggered) capturing reviewer, decision, and supporting evidence.'),

  ('master','v_bank_account_link_resolved',
    'Resolved Bank Account Link','Resolved Bank Account Links',
    'A view resolving the effective bank account link for a party, applying inheritance, overrides, and validity dates.'),

  ('master','v_bank_account_resolved',
    'Resolved Bank Account','Resolved Bank Accounts',
    'A view exposing the effective bank account in use for a party context, after applying preferences, blocks, and validity windows.'),

  ('master','v_business_partner_governance_summary',
    'Business Partner Governance Summary','Business Partner Governance Summaries',
    'A view summarizing a business partner''s governance status (qualifications, blocks, risk class) for compliance dashboards and decisions.'),

  ('master','v_effective_principal_ui',
    'Effective Principal UI Profile','Effective Principal UI Profiles',
    'A view computing the effective UI profile for a principal by merging tenant defaults, group profiles, and individual preferences.'),

  -- E: removed "(view)" from label_plural
  ('master','v_employee',
    'Employee','Employees',
    'A view denormalizing an employee with current position, manager, org unit, and pay group for screens and reporting.'),

  ('master','v_entity_commodity',
    'Entity Commodity','Entity Commodities',
    'A view associating an entity (item, product) with its current commodity classification and category for analytics joins.'),

  ('master','v_resolved_address',
    'Resolved Address','Resolved Addresses',
    'A view resolving the effective address for a party in a given role and date, applying overrides and the address-link table.'),

  ('master','v_supplier_bank_account',
    'Supplier Bank Account','Supplier Bank Accounts',
    'A view exposing the active bank accounts associated with each supplier, including primary flag and qualification status.'),

  -- E: removed "(view)" from label_plural; apostrophe escaped
  ('master','v_tenant_risk_source_config',
    'Tenant Risk Source Config','Tenant Risk Source Configs',
    'A view exposing a tenant''s configured risk data sources with their state, credentials reference, and refresh cadence.'),

  ('master','party_contact_person',
    'Party Contact Person','Party Contact People',
    'A named individual contact at a business partner, including role, communication channels, and validity period.'),

  ('master','certification',
    'Certification','Certifications',
    'A certification held by a party (e.g., ISO 9001, supplier diversity) with issuer, validity, scope, and proof attachment.'),

  ('master','supplier_block',
    'Supplier Block','Supplier Blocks',
    'A block placed on a supplier preventing one or more operations (ordering, paying, posting), with reason, scope, and effective dates.'),

  ('master','business_partner_network_link',
    'Business Partner Network Link','Business Partner Network Links',
    'A link tying a business partner to its profile on a partner network (e.g., e-invoicing, B2B network) used to exchange documents.'),

  ('master','party_governance_relation',
    'Party Governance Relation','Party Governance Relations',
    'A governance relationship between parties (ultimate parent, beneficial owner, controlling entity) used for compliance and consolidation.'),

  ('master','customer_app_index',
    'Customer App Index','Customer App Indices',
    'A denormalized index entry for a customer optimized for fast app-side search, listing, and filter usage.'),

  ('master','party_identifier',
    'Party Identifier','Party Identifiers',
    'An external identifier for a party (tax ID, DUNS, registration number) including its type, issuing authority, and validity.'),

  ('master','tenant_feature_entitlement',
    'Feature Entitlement','Feature Entitlements',
    'A tenant''s entitlement to a platform feature, including effective dates, plan source, and any constraints or limits.'),

  ('master','party_tax_profile',
    'Party Tax Profile','Party Tax Profiles',
    'A party''s tax profile per jurisdiction, including registrations, default rates, exemptions, and document-formatting requirements.'),

  ('master','spend_category',
    'Spend Category','Spend Categories',
    'A category used to classify spend for analytics, policy, and budgeting, organized as a hierarchy and mapped to commodity categories.'),

  ('master','customer_block',
    'Customer Block','Customer Blocks',
    'A block placed on a customer preventing one or more operations (selling, invoicing, dunning), with reason, scope, and effective dates.'),

  ('master','customer_qualification',
    'Customer Qualification','Customer Qualifications',
    'A qualification check completed for a customer (credit, KYC, sanctions) with outcome, evidence, and expiry.'),

  ('master','supplier_qualification',
    'Supplier Qualification','Supplier Qualifications',
    'A qualification check completed for a supplier (financial, compliance, ESG, security) with outcome, evidence, and expiry.'),

  ('master','supplier_spend_category',
    'Supplier Commodity Category','Supplier Commodity Categories',
    'An association between a supplier and a commodity category indicating capability or contracted scope of supply.'),

  ('master','v_business_partner_app_index',
    'Business Partner App Index','Business Partner App Indices',
    'A view denormalizing business partners for application-side search and listing performance.'),

  ('master','v_business_partner_address',
    'Business Partner Address','Business Partner Addresses',
    'A view exposing business partner addresses across roles (bill-to, ship-to, registered) with type and primary flags.'),

  ('master','v_business_partner_role_summary',
    'Business Partner Role Summary','Business Partner Role Summaries',
    'A view summarizing the roles a business partner plays (customer, supplier, employee, both) for screen filtering and routing.'),

  ('master','commodity_category',
    'Commodity Category','Commodity Categories',
    'A hierarchical category grouping commodity codes for analytics, policy, and procurement strategy (e.g., IT services, raw materials).'),

  -- D: plural corrected → "Histories"
  ('master','asset_assignment_history',
    'Asset Assignment History','Asset Assignment Histories',
    'Historical assignments of a fixed asset to cost centers, sites, or custodians, preserving the full transfer trail for audit.'),

  ('master','comment',
    'Comment','Comments',
    'A user-authored comment attached to a record or conversation, with mentions, reactions, and threaded reply support.'),

  ('master','comment_draft',
    'Comment Draft','Comment Drafts',
    'An unsent draft of a comment authored by a user, autosaved per record so they can return and finalize it later.'),

  ('master','budget_allocation',
    'Budget Allocation','Budget Allocations',
    'An allocation of a budget amount to a specific account, dimension set, and period, used as the basis for availability checks.'),

  ('master','principal_ui_profile',
    'UI Profile','UI Profiles',
    'A profile of UI preferences and layout choices applied for a principal, including theme, density, and persona-driven defaults.'),

  ('master','attachment_acl',
    'Attachment Access','Attachment Access',
    'An access control entry granting specific principals or groups permission to view or manage an attachment.'),

  ('master','comment_feed_cursor',
    'Feed Cursor','Feed Cursors',
    'A per-user position marker in a comment or activity feed used to compute unread counts and resume points.'),

  -- F: improved — added "edit-lock status"
  ('master','lifecycle_instance',
    'Lifecycle Instance','Lifecycle Instances',
    'The live lifecycle state of an individual record, tracking its current state, history, active timers, and edit-lock status per the bound lifecycle definition.'),

  ('master','business_intent',
    'Business Intent','Business Intents',
    'A named business intent (e.g., procure raw materials, sell service) used to resolve transaction flows, accounting profiles, and policies.'),

  ('master','bank_account_house_config',
    'House Bank Configuration','House Bank Configurations',
    'Configuration of an internal house bank account, including the company code, ledger account, and interface profile for bank communication.'),

  ('master','principal_ui_preference',
    'UI Preference','UI Preferences',
    'A user-level UI preference (column layout, theme, locale) overriding tenant and group defaults for that principal only.'),

  ('master','saved_view',
    'Saved View','Saved Views',
    'A saved filter, sort, and column configuration on a list or report, optionally shared with a group for consistent team views.'),

  ('master','principal_notification_preference',
    'Notification Preference','Notification Preferences',
    'A principal''s notification preference per category and channel, controlling delivery, batching, and quiet hours.'),

  ('master','content_item_access_grant',
    'Content Access Grant','Content Access Grants',
    'A grant of access on a content item (dashboard, document, report) to a principal or group with the permitted operations.'),

  ('master','tenant',
    'Tenant','Tenants',
    'An isolated customer tenant on the platform, with its own configuration, users, data, and subscription state.'),

  ('master','tenant_module_subscription',
    'Module Subscription','Module Subscriptions',
    'A tenant''s subscription to a platform module, including the enabled state, effective dates, and any module-specific parameters.'),

  ('master','tenant_permission_override',
    'Permission Override','Permission Overrides',
    'A tenant-level override that grants or denies a specific permission beyond what the subscribed plan provides.'),

  ('master','company_code_access',
    'Company Code Access','Company Code Access',
    'An access grant for a principal or group to operate within a specific company code, controlling cross-entity data scope.'),

  ('master','access_grant',
    'Access Grant','Access Grants',
    'A direct access grant tying a principal to a role or permission set with optional scope (entity, record, organizational unit).'),

  ('master','group_feature_grant',
    'Group Feature Grant','Group Feature Grants',
    'A feature access grant given to a group, applied to all members in addition to their tenant entitlements.'),

  ('master','principal_feature_grant',
    'User Feature Grant','User Feature Grants',
    'A feature access grant given directly to a principal, used for individual exceptions outside the tenant or group entitlement.'),

  ('master','delegation_grant',
    'Delegation Grant','Delegation Grants',
    'A grant whereby one principal delegates specified rights (e.g., approval) to another for a defined scope and period.'),

  ('master','dimension_type',
    'Dimension Type','Dimension Types',
    'A type of analytical dimension (cost center, project, region) defining how it is captured, validated, and reported across the platform.'),

  ('master','dimension_value',
    'Dimension Value','Dimension Values',
    'A specific value within a dimension type (e.g., a particular cost center code), with hierarchy, validity, and attributes.'),

  ('master','notification_default',
    'Notification Default','Notification Defaults',
    'A default notification preference set at tenant or persona level, used when an individual user has no explicit preference.'),

  ('master','multipart_upload',
    'Multipart Upload','Multipart Uploads',
    'An in-progress multipart upload session for a large file, tracking parts received, expiration, and the resulting attachment on completion.'),

  ('master','principal_identity_binding',
    'Identity Binding','Identity Bindings',
    'A binding tying a principal to an external identity (SSO subject, OAuth provider) used for authentication and SCIM provisioning.'),

  -- C3: em-dashes restored
  ('master','principal',
    'User','Users',
    'An authenticatable principal in the platform — a person, service account, or API client — to which permissions and grants are assigned.'),

  ('master','principal_profile',
    'User Profile','User Profiles',
    'A user''s profile information (display name, locale, photo, contact details) shown across the platform and used for personalization.'),

  ('master','address',
    'Address','Addresses',
    'A reusable address record (street, city, region, country, postal code) referenced by parties, sites, and documents via address links.'),

  ('master','auth_group',
    'Group','Groups',
    'A group of principals used to assign roles, feature grants, and access in bulk rather than per user.'),

  ('master','team',
    'Team','Teams',
    'A team of users formed around a business function or project, used for assignment, routing, and shared inboxes.'),

  ('master','tenant_profile',
    'Tenant Profile','Tenant Profiles',
    'Tenant-level descriptive and operational settings (legal entity name, default locale, branding) applied across the tenant.'),

  ('master','attachment',
    'Attachment','Attachments',
    'A stored file attached to a record or conversation, with metadata, ACL, and reference to the underlying blob storage.'),

  ('master','conversation',
    'Conversation','Conversations',
    'A threaded conversation between participants, anchored to a record or freestanding, holding comments and reactions.'),

  ('master','document',
    'Document','Documents',
    'A general document master record (e.g., contract, manual, certificate) with versioning, ownership, and tagging for retrieval.'),

  ('master','brand_profile',
    'Brand Profile','Brand Profiles',
    'A brand profile capturing logos, colors, typography, and tone used to render outbound documents and customer-facing surfaces.'),

  ('master','letterhead',
    'Letterhead','Letterheads',
    'A reusable letterhead asset (header, footer, watermark) applied to rendered documents in a chosen brand profile.'),

  ('master','template',
    'Template','Templates',
    'A reusable rendering template (e.g., for invoices, statements, letters) parameterized by data and selectable by document type.'),

  ('master','print_profile',
    'Print Profile','Print Profiles',
    'A print profile bundling template, letterhead, brand, and output settings used to render a document for a specific purpose.'),

  ('master','legal_entity',
    'Legal Entity','Legal Entities',
    'A legally registered entity (parent, subsidiary, branch) with its registration data, jurisdictions, and links to internal company codes.'),

  ('master','company_code',
    'Company Code','Company Codes',
    'An accounting organizational unit (typically a legal entity''s accounting boundary) under which postings are made and statutory books are kept.'),

  ('master','cost_center',
    'Cost Center','Cost Centers',
    'An analytical unit that collects costs for a defined organizational responsibility, used as a dimension on postings and budgets.'),

  ('master','profit_center',
    'Profit Center','Profit Centers',
    'An analytical unit that collects revenues and costs to evaluate profitability for an internal segment of the business.'),

  ('master','site',
    'Site','Sites',
    'A physical location (plant, office, store) used for inventory, fixed assets, and operational reporting.'),

  ('master','warehouse',
    'Warehouse','Warehouses',
    'A storage facility under a site where inventory is held and managed, with its own addresses, bins, and policies.'),

  ('master','chart_of_account',
    'Chart of Accounts','Charts of Accounts',
    'An ordered set of GL accounts used by one or more company codes to record financial transactions.'),

  ('master','gl_account',
    'GL Account','GL Accounts',
    'A single general ledger account within a chart of accounts, including its type, normal balance, and reporting attributes.'),

  ('master','ledger_book',
    'Ledger Book','Ledger Books',
    'A ledger book (statutory, IFRS, management, tax) producing an independent set of postings on the same business events for parallel reporting.'),

  ('master','project',
    'Project','Projects',
    'A project master record used as a dimension on postings and to track budget, commitments, and actuals over its lifecycle.'),

  ('master','dimension_set',
    'Dimension Set','Dimension Sets',
    'A reusable combination of dimension values applied together (e.g., default cost center + project + segment) to simplify entry.'),

  ('master','fiscal_period',
    'Fiscal Period','Fiscal Periods',
    'A period in a fiscal calendar (month, quarter, year) with its open/close status and posting controls.'),

  ('master','employee',
    'Employee','Employees',
    'An employee master record linking a person to one or more employments, used by HR, payroll, and operational processes.'),

  ('master','company_code_customer_profile',
    'Customer Company Profile','Customer Company Profiles',
    'A customer''s per-company-code profile holding terms, dunning, currency, and tax settings specific to that selling entity.'),

  ('master','asset_class',
    'Asset Class','Asset Classes',
    'A class grouping fixed assets with shared accounting behavior (default GL accounts, depreciation method, useful life).'),

  ('master','asset',
    'Asset','Assets',
    'A fixed-asset master record tracking acquisition, capitalization, depreciation, transfers, and retirement across one or more books.'),

  ('master','tax_jurisdiction',
    'Tax Jurisdiction','Tax Jurisdictions',
    'A taxing jurisdiction (country, state, locality) used to determine applicable tax types and rates for a transaction.'),

  ('master','tax_type',
    'Tax Type','Tax Types',
    'A specific type of tax (VAT, GST, sales tax, withholding) with its computation basis, accounts, and reporting attributes.'),

  ('master','fx_rate',
    'FX Rate','FX Rates',
    'A foreign exchange rate between two currencies for a specified date and rate type (spot, monthly average, period-end).'),

  ('master','budget_profile',
    'Budget Profile','Budget Profiles',
    'A profile defining how a budget is scoped (entity, period, dimensions) and how availability is calculated for checks.'),

  ('master','planning_model',
    'Planning Model','Planning Models',
    'A model used for financial planning, defining its dimensions, periods, drivers, and the scenarios it supports.'),

  ('master','bank_party',
    'Bank','Banks',
    'A bank as a party, with its identifiers (BIC, routing number) and addresses, referenced by bank accounts and payment interfaces.'),

  ('master','payment_method',
    'Payment Method','Payment Methods',
    'A method by which payments are made or received (wire, ACH, card, check), with format requirements and supported currencies.'),

  ('master','holiday_calendar',
    'Holiday Calendar','Holiday Calendars',
    'A calendar of non-working days for a region or operating unit, used in working-day calculations and scheduling.'),

  ('master','payment_term',
    'Payment Term','Payment Terms',
    'A defined payment term (e.g., Net 30, 2/10 Net 30) with clauses for due dates and early-payment discounts.'),

  ('master','product',
    'Product','Products',
    'A product offering that may be sold or purchased, with descriptive attributes, pricing references, and item links.'),

  ('master','item',
    'Item','Items',
    'An item master record representing a buyable, sellable, or stockable thing, with UOM, identifiers, and inventory attributes.'),

  ('master','dashboard',
    'Dashboard','Dashboards',
    'A configurable dashboard composed of widgets that visualize KPIs, lists, and reports for an audience.'),

  ('master','content_item',
    'Content Item','Content Items',
    'A piece of content (document, dashboard, report) managed in the content layer with ownership, access, and versioning.'),

  ('master','label',
    'Label','Labels',
    'A taggable label that can be attached to records to support filtering, grouping, and ad-hoc classification.'),

  ('master','owner_type',
    'Owner Type','Owner Types',
    'A type of owner that a record can be assigned to (user, team, group), driving routing and access semantics.'),

  ('master','v_business_partner_bank_account',
    'Business Partner Bank Account','Business Partner Bank Accounts',
    'A view exposing active bank accounts per business partner across their roles, with primary flag and qualification status.'),

  ('master','career_band',
    'Career Band','Career Bands',
    'A career banding tier (e.g., individual contributor, manager, executive) used to group levels and structure compensation.'),

  ('master','career_level',
    'Career Level','Career Levels',
    'A specific career level within a band defining seniority, expectations, and the associated pay range.'),

  ('master','designation',
    'Designation','Designations',
    'A working title held by an employee (e.g., Senior Analyst, Director) tied to a job and career level.'),

  ('master','employee_leave_enrollment',
    'Leave Enrollment','Leave Enrollments',
    'An employee''s enrollment in a specific leave plan, defining their accrual basis and effective dates.'),

  ('master','employee_statutory_enrollment',
    'Statutory Enrollment','Statutory Enrollments',
    'An employee''s enrollment in a statutory scheme (e.g., social security, pension, health), with effective dates and identifiers.'),

  ('master','employment',
    'Employment','Employments',
    'An employment relationship between a person and a legal entity, with start/end dates, type, and the linked employee record.'),

  ('master','external_reference',
    'External Reference','External References',
    'An external system reference attached to a record (e.g., ERP ID, CRM ID) to support integration and lookup.'),

  ('master','job',
    'Job','Jobs',
    'A job role definition (responsibilities, requirements) under which one or more positions and employees sit.'),

  ('master','job_family',
    'Job Family','Job Families',
    'A grouping of related jobs sharing common skill and progression patterns (e.g., Finance, Engineering).'),

  ('master','job_function',
    'Job Function','Job Functions',
    'A functional area within a job family (e.g., AP, FP&A, Backend Engineering) used to refine analytics and planning.'),

  ('master','leave_plan',
    'Leave Plan','Leave Plans',
    'A plan governing how a leave type accrues, carries over, and can be taken, applied to employees via enrollment.'),

  ('master','leave_plan_rule',
    'Leave Plan Rule','Leave Plan Rules',
    'A rule within a leave plan controlling specific behavior (accrual formula, eligibility, cap, carryover, payout).'),

  ('master','leave_type',
    'Leave Type','Leave Types',
    'A category of leave (vacation, sick, parental, unpaid) with its paid/unpaid behavior and statutory treatment.'),

  ('master','org_unit',
    'Org Unit','Org Units',
    'An organizational unit (department, team, division) in the org hierarchy used for reporting and roll-ups.'),

  ('master','pay_component',
    'Pay Component','Pay Components',
    'A component of pay (base salary, bonus, allowance, deduction) with its computation, tax treatment, and GL mapping.'),

  ('master','pay_grade',
    'Pay Grade','Pay Grades',
    'A pay grade defining the minimum, midpoint, and maximum salary range for jobs at a given level.'),

  ('master','pay_group',
    'Pay Group','Pay Groups',
    'A group of employees paid together on the same schedule, with shared payroll calendar and processing rules.'),

  ('master','pay_structure',
    'Pay Structure','Pay Structures',
    'A structured set of pay components and rules applied to employees in a defined scope (country, level, role).'),

  ('master','pay_structure_line',
    'Pay Structure Line','Pay Structure Lines',
    'A single line in a pay structure defining one pay component''s amount, formula, or rate for the structure''s scope.'),

  ('master','person',
    'Person','People',
    'A person record holding identity-neutral data shared across employments and roles, separate from user authentication.'),

  ('master','person_sensitive_profile',
    'Person Sensitive Profile','Person Sensitive Profiles',
    'Sensitive personal data (national ID, demographics, banking) held separately under stricter access controls.'),

  ('master','position',
    'Position','Positions',
    'A specific organizational slot tied to a job, org unit, and headcount, that an employee can be assigned into.'),

  ('master','shift_type',
    'Shift Type','Shift Types',
    'A defined shift template (start, end, breaks, premiums) assignable to employees via shift assignments.'),

  ('master','statutory_scheme',
    'Statutory Scheme','Statutory Schemes',
    'A statutory scheme (e.g., social security, pension) with its rules, contribution rates, and reporting requirements.'),

  ('master','work_assignment',
    'Work Assignment','Work Assignments',
    'An employee''s current work assignment combining position, manager, location, and effective dates.'),

  ('master','work_pattern',
    'Work Pattern','Work Patterns',
    'A repeating pattern of working days and hours assigned to an employee or position, driving scheduling and accruals.'),

  ('master','work_pattern_day',
    'Work Pattern Day','Work Pattern Days',
    'A single day within a work pattern specifying expected start, end, breaks, and on/off status.'),

  ('master','asset_component',
    'Asset Component','Asset Components',
    'A sub-component of a fixed asset tracked separately for depreciation, maintenance, or replacement.'),

  ('master','contact_link',
    'Contact Link','Contact Links',
    'A link between a contact (person) and an owning record or party, with role and primary flags.'),

  ('master','contact_email',
    'Contact Email','Contact Emails',
    'An email address attached to a contact or party, with type (work, personal) and validation status.'),

  ('master','contact_phone',
    'Contact Phone','Contact Phones',
    'A phone number attached to a contact or party, with type (mobile, office) and country code.'),

  ('master','label_entity_type',
    'Label Entity Type','Label Entity Types',
    'An association indicating which entity types a label may be applied to, governing label availability per record.'),

  ('master','address_link',
    'Address Link','Address Links',
    'A link binding an address to an owning record (party, site, employment) with role (bill-to, ship-to, registered) and validity.'),

  ('master','auth_group_role',
    'Group Role','Group Roles',
    'A role assigned to a group, granting that role''s permissions to all current and future members.'),

  ('master','auth_group_member',
    'Group Member','Group Members',
    'Membership of a principal in a group, with effective dates and the path by which they were added.'),

  ('master','principal_persona',
    'User Persona','User Personas',
    'A persona assigned to a principal driving default UI, navigation, and recommended actions for their role.'),

  ('master','team_member',
    'Team Member','Team Members',
    'Membership of a principal in a team, with role within the team and effective dates.'),

  ('master','comment_mention',
    'Comment Mention','Comment Mentions',
    'A mention of a user or group inside a comment, triggering notification and visibility in their feed.'),

  ('master','comment_reaction',
    'Comment Reaction','Comment Reactions',
    'A reaction (emoji or like) by a user on a comment, used for lightweight feedback and prioritization.'),

  ('master','conversation_participant',
    'Conversation Participant','Conversation Participants',
    'A participant in a conversation, with their join state, last-read marker, and notification preferences for the thread.'),

  ('master','attachment_comment',
    'Attachment Comment','Attachment Comments',
    'A comment anchored to a specific attachment or region of it, supporting review and annotation workflows.'),

  ('master','template_binding',
    'Template Binding','Template Bindings',
    'A binding tying a template to an entity type or document category, indicating when that template is the default choice.'),

  ('master','entity_document_link',
    'Entity Document Link','Entity Document Links',
    'A link associating a document master record to one or more business entities, with role, sequence, and effective dates.'),

  ('master','asset_book',
    'Asset Book','Asset Books',
    'A per-asset, per-book record holding the depreciation method, useful life, value basis, and accumulated depreciation in that book.'),

  ('master','project_item',
    'Project Item','Project Items',
    'A line item under a project (WBS element, task, deliverable) used for finer-grained budgeting and time/cost tracking.'),

  ('master','company_code_gl_account',
    'Company GL Account','Company GL Accounts',
    'A company-code-specific extension of a GL account, holding currency, dimension requirements, and posting controls for that company.'),

  ('master','company_code_book_assignment',
    'Book Assignment','Book Assignments',
    'The assignment of a ledger book to a company code, enabling parallel ledger postings for that legal entity.'),

  ('master','dimension_set_item',
    'Dimension Set Item','Dimension Set Items',
    'A single dimension type/value pair contained within a dimension set.'),

  ('master','bank_account_link',
    'Bank Account Link','Bank Account Links',
    'A link tying a bank account to an owning party in a specific role (e.g., supplier remit-to, customer collect-from) with validity dates.'),

  ('master','holiday_calendar_day',
    'Holiday','Holidays',
    'A specific day flagged as non-working in a holiday calendar, with name, type (public, optional), and applicable region.'),

  ('master','payment_term_clause',
    'Payment Term Clause','Payment Term Clauses',
    'A clause within a payment term defining one due-date branch (e.g., percentage-of-amount due on a specific day-offset).'),

  ('master','payment_term_discount_tier',
    'Discount Tier','Discount Tiers',
    'A tier within a payment term granting an early-payment discount when paid within a defined number of days.'),

  ('master','dashboard_widget',
    'Dashboard Widget','Dashboard Widgets',
    'A single visualization or data block placed on a dashboard, with its query, layout, and audience filters.'),

  ('master','content_item_link',
    'Content Link','Content Links',
    'A link between content items establishing relationships such as referenced-by, derived-from, or related-to.'),

  ('master','commodity_classification',
    'Commodity Classification','Commodity Classifications',
    'A classification (e.g., UNSPSC, custom code) assigned to an item, line, or spend record for analytics and policy resolution.'),

  ('master','risk_source',
    'Risk Source','Risk Sources',
    'An external or internal source of risk signals (sanctions list, credit bureau, news feed) consumed in risk assessments.'),

  ('master','tenant_parameter_definition',
    'Tenant Parameter Definition','Tenant Parameter Definitions',
    'The schema definition of a tenant-level configuration parameter (key, type, default, scope) available for value override.'),

  -- master.numbering_series EXCLUDED (decommissioned)

  ('master','business_partner_network_capability',
    'Network Capability','Network Capabilities',
    'A declared capability of a business partner on a network (e.g., can receive e-invoices, supports order ack) used in routing decisions.'),

  ('master','business_partner_relation',
    'Business Partner Relation','Business Partner Relations',
    'A relation between two business partners (parent/subsidiary, agent, sold-to vs ship-to) used in routing and consolidation.'),

  ('master','certification_type',
    'Certification Type','Certification Types',
    'A type of certification (e.g., quality, sustainability, security) defining required attributes and renewal cadence.'),

  ('master','filter_preset',
    'Filter Preset','Filter Presets',
    'A reusable saved filter that can be applied across lists and dashboards, scoped to a user, group, or tenant.'),

  ('master','intercompany_trading_pair',
    'Intercompany Trading Pair','Intercompany Trading Pairs',
    'A configured pair of related legal entities authorized to trade with each other, with default agreements and posting rules.'),

  ('master','risk_dimension',
    'Risk Dimension','Risk Dimensions',
    'A dimension of risk being measured (credit, compliance, operational, ESG) with its scoring scale and weight in the overall model.'),

  -- C4: double-space → dash in both labels
  ('master','legal_entity_business_partner_link',
    'Legal Entity – Business Partner Link','Legal Entity – Business Partner Links',
    'A link mapping an internal legal entity to its business partner identity, enabling intercompany and netting flows.'),

  ('master','legal_entity_identity_binding',
    'Legal Entity Identity Binding','Legal Entity Identity Bindings',
    'An external identity binding for a legal entity (e.g., government registration ID, group code) used for filings and integration.'),

  ('master','network_provider',
    'Network Provider','Network Providers',
    'A B2B or e-invoicing network provider configured for use in routing documents between parties (e.g., Peppol access point).'),

  ('master','party_risk_dimension_score',
    'Party Risk Dimension Score','Party Risk Dimension Scores',
    'A score on a single risk dimension for a party within a risk assessment, including the inputs, weight, and rationale.'),

  ('master','party_risk_driver',
    'Party Risk Driver','Party Risk Drivers',
    'A driver (signal or factor) that contributes to a party''s risk score, with its source, value, and effective period.'),

  ('master','party_risk_evidence',
    'Party Risk Evidence','Party Risk Evidence',
    'An evidentiary artifact (document, screenshot, log) supporting a party''s risk driver or review decision.'),

  ('master','party_risk_mitigation',
    'Party Risk Mitigation','Party Risk Mitigations',
    'A mitigating action or control documented against a party''s risk (e.g., prepay only, lower credit limit, enhanced due diligence).'),

  ('master','record_bookmark',
    'Record Bookmark','Record Bookmarks',
    'A user''s bookmark on a specific record for quick return, optionally annotated with a note or tag.'),

  -- D: plural corrected → "Registries"
  ('master','risk_driver_registry',
    'Risk Driver Registry','Risk Driver Registries',
    'A registry of known risk drivers with their definitions, scoring scales, and source providers used across risk models.'),

  ('master','risk_model',
    'Risk Model','Risk Models',
    'A configured model that combines risk drivers and dimensions with weights and thresholds to compute a party risk score.'),

  ('master','risk_model_dimension',
    'Risk Model Dimension','Risk Model Dimensions',
    'A specific dimension included in a risk model with its weight, scoring scale, and contributing drivers.'),

  ('master','tenant_parameter_value',
    'Tenant Parameter Value','Tenant Parameter Values',
    'The effective value of a tenant parameter, optionally overridden per scope (company code, module) with audit trail.'),

  -- apostrophe escaped; double-space → em-dash in description
  ('master','tenant_risk_source_config',
    'Tenant Risk Source Config','Tenant Risk Source Configs',
    'A tenant''s configuration of a risk source — credentials reference, enabled flag, refresh cadence, and scope.'),

  ('master','trusted_device',
    'Trusted Device','Trusted Devices',
    'A device a user has marked trusted to skip step-up MFA on subsequent sign-ins, with fingerprint, last seen, and expiry.'),

  ('master','supplier',
    'Supplier','Suppliers',
    'A business partner role representing a supplier of goods or services, with procurement-specific settings, qualifications, and blocks.'),

  ('master','business_partner',
    'Business Partner','Business Partners',
    'A central party record representing an organization or individual the tenant transacts with, capable of holding multiple roles.'),

  ('master','customer',
    'Customer','Customers',
    'A business partner role representing a customer who purchases from the tenant, with sales-specific terms, credit profile, and blocks.'),

  ('master','company_code_supplier_profile',
    'Supplier Company Profile','Supplier Company Profiles',
    'A supplier''s per-company-code profile holding terms, payment methods, currency, and tax settings specific to that buying entity.'),

  ('master','supplier_app_index',
    'Supplier App Index','Supplier App Indices',
    'A denormalized index entry for a supplier optimized for fast app-side search, listing, and filter usage.'),

  ('master','company_code_intent_policy',
    'Company Intent Policy','Company Intent Policies',
    'A company-code-level policy enabling or restricting specific business intents for that legal entity, and any required parameters.'),

  ('master','company_code_supplier_intent_policy',
    'Supplier Intent Policy','Supplier Intent Policies',
    'A per-supplier, per-company policy enabling or restricting which business intents can be used when transacting with that supplier.'),

  ('master','company_code_supplier_posting_override',
    'Supplier Posting Override','Supplier Posting Overrides',
    'A company-code-level override of posting rules for a specific supplier, used when bespoke account or dimension handling is required.'),

  ('master','accounting_profile',
    'Accounting Profile','Accounting Profiles',
    'A configured accounting profile that maps business intents to journal postings via entry templates, dimension and book rules, and events.'),

  ('master','bank_account',
    'Bank Account','Bank Accounts',
    'A bank account record (IBAN/account number, currency, holder, bank) referenced by parties for payments, receipts, and reconciliation.'),

  -- NEW: company_code_supplier_spend_policy
  ('master','company_code_supplier_spend_policy',
    'Supplier Spend Policy','Supplier Spend Policies',
    'A per-supplier, per-company-code policy governing spend limits, approval thresholds, and allowed commodity categories when procuring from that supplier under a specific buying entity.'),

  -- ── SHARED (23) ──────────────────────────────────────────────────────────

  ('shared','country',
    'Country','Countries',
    'A country reference record (ISO codes, name, region) used across addresses, tax determination, and reporting.'),

  ('shared','uom',
    'Unit of Measure','Units of Measure',
    'A unit of measure (each, kg, hour, ton) with conversion factors used for items, services, and quantity computations.'),

  ('shared','commodity_code',
    'Commodity Code','Commodity Codes',
    'A standard commodity code (e.g., UNSPSC, HS) used to classify items and spend for analytics, customs, and policy.'),

  ('shared','state_region',
    'State / Region','States / Regions',
    'A first-level administrative subdivision under a country (state, province, region) used in addresses and jurisdictions.'),

  ('shared','industry_code',
    'Industry Code','Industry Codes',
    'An industry classification code (e.g., NAICS, NACE, SIC) used to categorize parties for analytics and risk modeling.'),

  ('shared','locale',
    'Locale','Locales',
    'A locale (language + region, e.g., en-US, fr-FR) governing formatting of dates, numbers, and translations.'),

  ('shared','currency',
    'Currency','Currencies',
    'A currency reference (ISO code, symbol, minor unit) used in monetary amounts, FX rates, and reporting.'),

  ('shared','language',
    'Language','Languages',
    'A language reference (ISO code, name) used for translations, locale composition, and party communication preferences.'),

  ('shared','enterprise_feature',
    'Enterprise Feature','Enterprise Features',
    'A platform feature offered to tenants, with metadata for entitlement, dependencies, and UI display.'),

  ('shared','subscription_plan',
    'Subscription Plan','Subscription Plans',
    'A subscription plan bundling features, modules, and permission access that tenants can subscribe to.'),

  ('shared','persona',
    'Persona','Personas',
    'A persona that represents a category of user (e.g., AP clerk, controller) bundling defaults and recommended permissions.'),

  ('shared','workspace',
    'Workspace','Workspaces',
    'A workspace concept used to scope navigation, content, and configuration within a tenant for different teams or contexts.'),

  ('shared','permission_category',
    'Permission Category','Permission Categories',
    'A grouping of related permissions (e.g., Finance > Postings) used in admin UIs and plan composition.'),

  -- arrow encoding fixed
  ('shared','industry_crosswalk',
    'Industry Crosswalk','Industry Crosswalks',
    'A mapping between industry classification systems (e.g., NAICS → NACE) used to translate codes across reporting standards.'),

  ('shared','timezone',
    'Time Zone','Time Zones',
    'A time zone reference (IANA name, UTC offset, DST behavior) used for scheduling, display, and event timing.'),

  ('shared','module',
    'Module','Modules',
    'A functional module of the platform (e.g., AP, AR, Procurement) that can be subscribed to and toggled per tenant.'),

  ('shared','plan_feature_access',
    'Plan Feature Access','Plan Feature Access',
    'The set of features a subscription plan grants access to, used to compute tenant entitlements.'),

  ('shared','plan_module_access',
    'Plan Module Access','Plan Module Access',
    'The set of modules a subscription plan enables, used to compute tenant entitlements.'),

  ('shared','plan_permission_access',
    'Plan Permission Access','Plan Permission Access',
    'The set of permissions a subscription plan grants by default to assigned roles within subscribed tenants.'),

  ('shared','role',
    'Role','Roles',
    'A platform-defined role bundling permissions for a recognizable job function, used as the unit of access assignment.'),

  ('shared','permission',
    'Permission','Permissions',
    'A platform permission representing the right to perform a specific operation on a specific resource.'),

  -- arrow encoding fixed
  ('shared','commodity_crosswalk',
    'Commodity Crosswalk','Commodity Crosswalks',
    'A mapping between commodity classification systems (e.g., UNSPSC → HS) used to translate codes across taxonomies.'),

  ('shared','persona_permission',
    'Persona Permission','Persona Permissions',
    'A permission attached to a persona, contributing to the recommended access set offered when assigning that persona.')

)
UPDATE control.entity e
SET
  description    = c.description,
  label_singular = c.label_singular,
  label_plural   = c.label_plural,
  updated_at     = now(),
  updated_by     = '00000000-0000-0000-0000-000000000000'::uuid
FROM corrections c
WHERE e.tenant_id IS NULL
  AND e.table_schema = c.tbl_schema
  AND e.table_name   = c.tbl_name;
