-- 100_master/010_company_code_profiles.sql
-- Purpose: display_config + natural_key_fields for company-code profile junction entities.
--   company_code_customer_profile — per-company AR/credit settings for a customer
--   company_code_supplier_profile — per-company AP/payment settings for a supplier
--
-- These entities are registered in 020_entities/008_master_partners.sql and get
-- their entity_version from 025_entity_versions.sql and fields from
-- 035_version_fields/008_fields_partners.sql.  The batch setter in
-- 080_display_config_natural_key.sql may not have run on DBs where these
-- entities were applied as an incremental migration.
--
-- Idempotent: re-applies the canonical role-specific UI layout and parent FK
-- feature flags so already-seeded databases pick up the richer detail pages.

-- ── company_code_customer_profile ────────────────────────────────────────────
UPDATE control.entity
SET display_config     = COALESCE(display_config, '{}'::jsonb) || jsonb_build_object(
        'detail_renderer',    'master',
        'detail_profile',     'rich',
        'list_columns',       jsonb_build_array('customer_id','company_code_id','credit_limit','credit_rating','payment_term_id','status'),
        'default_sort_field', 'created_at',
        'default_sort_order', 'desc',
        'master_config', jsonb_build_object(
            'type_label',          'CUSTOMER COMPANY',
            'classification_field','credit_rating',
            'header_facts',        jsonb_build_array('company_code_id','credit_limit','credit_rating'),
            'platform_panels',     jsonb_build_array('comments','attachments','activity'),
            'tabs', jsonb_build_array(
                jsonb_build_object('id','__overview','label','Overview','renderer','overview'),
                jsonb_build_object('id','__profile','label','AR Profile','renderer','composite',
                    'composite_sections', jsonb_build_array(
                        jsonb_build_object('id','__profile_credit','label','Credit Control','type','fields',
                            'display_fields',jsonb_build_array('customer_id','company_code_id','credit_limit','credit_limit_currency_code','credit_rating','is_blocked','block_reason')),
                        jsonb_build_object('id','__profile_collections','label','Collections','type','fields',
                            'display_fields',jsonb_build_array('default_accounting_profile_id','tax_group_id','default_receipt_method_id','payment_term_id','currency_code','statement_cycle_code','dunning_policy_id','status'))
                    ))
            )
        )
    ),
    natural_key_fields = ARRAY['id'],
    feature_flags      = COALESCE(feature_flags, '{}'::jsonb) || '{"parent_entity":"customer","parent_fk":"customer_id"}'::jsonb
WHERE table_schema = 'master' AND table_name = 'company_code_customer_profile'
  AND tenant_id IS NULL;

-- ── company_code_supplier_profile ────────────────────────────────────────────
UPDATE control.entity
SET display_config     = COALESCE(display_config, '{}'::jsonb) || jsonb_build_object(
        'detail_renderer',    'master',
        'detail_profile',     'rich',
        'list_columns',       jsonb_build_array('supplier_id','company_code_id','default_accounting_profile_id','payment_method_id','is_blocked','status'),
        'default_sort_field', 'created_at',
        'default_sort_order', 'desc',
        'master_config', jsonb_build_object(
            'type_label',          'SUPPLIER COMPANY',
            'classification_field','currency_code',
            'header_facts',        jsonb_build_array('company_code_id','currency_code','payment_method_id'),
            'platform_panels',     jsonb_build_array('comments','attachments','activity'),
            'tabs', jsonb_build_array(
                jsonb_build_object('id','__overview','label','Overview','renderer','overview'),
                jsonb_build_object('id','__profile','label','AP Profile','renderer','composite',
                    'composite_sections', jsonb_build_array(
                        jsonb_build_object('id','__profile_payables','label','Payables','type','fields',
                            'display_fields',jsonb_build_array('supplier_id','company_code_id','currency_code','is_blocked','block_reason','payment_term_id','payment_method_id','preferred_remittance_bank_link_id','invoice_hold_policy_id','status')),
                        jsonb_build_object('id','__profile_accounting','label','Accounting','type','fields',
                            'display_fields',jsonb_build_array('default_accounting_profile_id','tax_group_id','default_wht_tax_group_id','default_dimension_set_id'))
                    )),
                jsonb_build_object('id','__policies','label','Policies','renderer','composite',
                    'composite_sections', jsonb_build_array(
                        jsonb_build_object('id','__spend_policies','label','Buy Policies','type','child_list',
                            'entity_code','commodity_category_buy_policy',
                            'display_fields',jsonb_build_array(
                                'supplier_profile_id','commodity_category_id','mapping_mode',
                                'sourcing_status','qualification_status','po_status','invoice_status',
                                'valid_from','valid_until','max_po_amount','max_po_currency_code',
                                'is_preferred_supplier','notes','status'
                            ),
                            'add_href_template','/app/commodity_category_buy_policy/new?parent_id={uuid}',
                            'add_label','Add Buy Policy',
                            'empty_title','No spend policies',
                            'empty_description','Company-specific spend eligibility appears here.',
                            'config',jsonb_build_object(
                                'title','commodity_category_id',
                                'facts',jsonb_build_array('mapping_mode','sourcing_status','qualification_status','po_status','invoice_status','valid_from','valid_until','max_po_amount'),
                                'badges',jsonb_build_array('status','expiry'),
                                'presentation','policy_matrix',
                                'presentation_config',jsonb_build_object(
                                    'references',jsonb_build_object(
                                        'supplier_profile_id',jsonb_build_object('target_entity','company_code_supplier_profile','target_field','id','display_field','company_code_id'),
                                        'commodity_category_id',jsonb_build_object('target_entity','commodity_category','target_field','id','display_field','name','picker',jsonb_build_object('code_field','code','show_code',true))
                                    ),
                                    'columns',jsonb_build_array(
                                        jsonb_build_object('field','commodity_category_id','label','Category'),
                                        jsonb_build_object('field','mapping_mode','label','Mapping'),
                                        jsonb_build_object('field','sourcing_status','label','Sourcing','kind','status'),
                                        jsonb_build_object('field','qualification_status','label','Qualification','kind','status'),
                                        jsonb_build_object('field','po_status','label','PO','kind','status'),
                                        jsonb_build_object('field','invoice_status','label','Invoice','kind','status'),
                                        jsonb_build_object('field','valid_from','label','Valid from'),
                                        jsonb_build_object('field','valid_until','label','Valid until'),
                                        jsonb_build_object('field','max_po_amount','label','Max PO')
                                    )
                                ),
                                'defaultSort',jsonb_build_array('status:asc','valid_until:asc')
                            )),
                        jsonb_build_object('id','__intent_policies','label','Intent Policies','type','child_list',
                            'entity_code','commodity_category_buy_policy',
                            'display_fields',jsonb_build_array('supplier_profile_id','business_intent_id','mapping_mode','is_default','is_sourcing_allowed','is_po_allowed','is_invoice_allowed','status'),
                            'add_href_template','/app/commodity_category_buy_policy/new?parent_id={uuid}',
                            'add_label','Add Intent Policy',
                            'empty_title','No intent policies',
                            'empty_description','Buying intent controls appear here.',
                            'config',jsonb_build_object(
                                'title','business_intent_id',
                                'facts',jsonb_build_array('mapping_mode','is_default','is_sourcing_allowed','is_po_allowed','is_invoice_allowed'),
                                'badges',jsonb_build_array('status'),
                                'presentation','ability_cards',
                                'presentation_config',jsonb_build_object(
                                    'references',jsonb_build_object(
                                        'supplier_profile_id',jsonb_build_object('target_entity','company_code_supplier_profile','target_field','id','display_field','company_code_id'),
                                        'business_intent_id',jsonb_build_object('target_entity','business_intent','target_field','id','display_field','name','picker',jsonb_build_object('code_field','code','show_code',true))
                                    ),
                                    'title_field','business_intent_id',
                                    'mode_field','mapping_mode',
                                    'default_field','is_default',
                                    'capability_fields',jsonb_build_array(
                                        jsonb_build_object('field','is_sourcing_allowed','label','Sourcing'),
                                        jsonb_build_object('field','is_po_allowed','label','PO'),
                                        jsonb_build_object('field','is_invoice_allowed','label','Invoice')
                                    )
                                ),
                                'defaultSort',jsonb_build_array('is_default:desc','status:asc')
                            )),
                        jsonb_build_object('id','__posting_overrides','label','Posting Overrides','type','child_list',
                            'entity_code','supplier_posting_override',
                            'display_fields',jsonb_build_array('supplier_profile_id','posting_role_code','gl_account_id','book_code','effective_from','effective_to','reason','status'),
                            'add_href_template','/app/supplier_posting_override/new?parent_id={uuid}',
                            'add_label','Add Override',
                            'empty_title','No posting overrides',
                            'empty_description','AP posting exceptions appear here.',
                            'config',jsonb_build_object(
                                'title','posting_role_code',
                                'facts',jsonb_build_array('gl_account_id','book_code','effective_from','effective_to','reason'),
                                'badges',jsonb_build_array('status'),
                                'presentation','temporal_rules',
                                'presentation_config',jsonb_build_object(
                                    'filter_field','book_code',
                                    'role_field','posting_role_code',
                                    'target_field','gl_account_id',
                                    'start_field','effective_from',
                                    'end_field','effective_to',
                                    'status_field','status',
                                    'timeline_title','Effective ranges',
                                    'references',jsonb_build_object(
                                        'supplier_profile_id',jsonb_build_object('target_entity','company_code_supplier_profile','target_field','id','display_field','company_code_id'),
                                        'gl_account_id',jsonb_build_object('target_entity','gl_account','target_field','id','display_field','name','picker',jsonb_build_object('code_field','code','show_code',true))
                                    ),
                                    'columns',jsonb_build_array(
                                        jsonb_build_object('field','posting_role_code','label','Posting role','kind','code'),
                                        jsonb_build_object('field','gl_account_id','label','GL account'),
                                        jsonb_build_object('field','book_code','label','Book','kind','code'),
                                        jsonb_build_object('field','effective_from','label','Effective from'),
                                        jsonb_build_object('field','effective_to','label','Effective to'),
                                        jsonb_build_object('field','reason','label','Reason'),
                                        jsonb_build_object('field','status','label','Status','kind','status')
                                    )
                                ),
                                'defaultSort',jsonb_build_array('effective_from:desc')
                            ))
                    ))
            )
        )
    ),
    natural_key_fields = ARRAY['id'],
    feature_flags      = COALESCE(feature_flags, '{}'::jsonb) || '{"parent_entity":"supplier","parent_fk":"supplier_id"}'::jsonb
WHERE table_schema = 'master' AND table_name = 'company_code_supplier_profile'
  AND tenant_id IS NULL;

-- Reference display metadata for AP profile fields used by supplier/company-code cards.
UPDATE control.entity_field ef
SET reference_config = v.reference_config,
    validation       = COALESCE(ef.validation, '{}'::jsonb)
                       || jsonb_build_object('ref_entity', v.target_entity)
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
CROSS JOIN (VALUES
    ('supplier_id',                       'supplier',                      jsonb_build_object('target_entity','supplier','target_field','id','display_field','business_title','picker',jsonb_build_object('code_field','supplier_code','show_code',true))),
    ('company_code_id',                   'company_code',                  jsonb_build_object('target_entity','company_code','target_field','id','display_field','name','picker',jsonb_build_object('code_field','code','show_code',true))),
    ('payment_term_id',                   'payment_term',                  jsonb_build_object('target_entity','payment_term','target_field','id','display_field','name','picker',jsonb_build_object('code_field','code','show_code',true))),
    ('payment_method_id',                 'payment_method',                jsonb_build_object('target_entity','payment_method','target_field','id','display_field','name','picker',jsonb_build_object('code_field','code','show_code',true))),
    ('preferred_remittance_bank_link_id', 'business_partner_bank_account', jsonb_build_object('target_entity','business_partner_bank_account','target_field','id','display_field','bank_name','picker',jsonb_build_object('code_field','account_id_value_masked','show_code',true))),
    ('default_accounting_profile_id',     'accounting_profile',            jsonb_build_object('target_entity','accounting_profile','target_field','id','display_field','name','picker',jsonb_build_object('code_field','code','show_code',true))),
    ('tax_group_id',                      'tax_group',                     jsonb_build_object('target_entity','tax_group','target_field','id','display_field','name','picker',jsonb_build_object('code_field','code','show_code',true))),
    ('default_wht_tax_group_id',          'tax_group',                     jsonb_build_object('target_entity','tax_group','target_field','id','display_field','name','picker',jsonb_build_object('code_field','code','show_code',true)))
) AS v(field_name, target_entity, reference_config)
WHERE ef.entity_version_id = ev.id
  AND v.field_name = ef.name
  AND e.entity_code = 'company_code_supplier_profile'
  AND e.tenant_id IS NULL
  AND ev.version_no = 1
  AND (
      ef.reference_config IS DISTINCT FROM v.reference_config
      OR COALESCE(ef.validation->>'ref_entity', '') IS DISTINCT FROM v.target_entity
  );
