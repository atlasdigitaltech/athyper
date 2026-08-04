INSERT INTO control.numbering_policy (
    id,tenant_id,policy_code,policy_revision,name,description,format_template,
    sequence_width,pad_character,start_value,increment_by,maximum_value,
    scope_kind,reset_kind,timezone_code,status,activated_at,activated_by,created_by
) VALUES (
    '019fc300-0000-7000-8000-000000000001',NULL,'business_partner.primary_number',1,
    'Business Partner primary number','Default tenant-partitioned Business Partner number.',
    'BP-{yyyy}-{seq}',6,'0',1,1,NULL,'tenant','calendar_year','UTC','active',
    now(),'00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000000000'
)
ON CONFLICT (tenant_id,policy_code,policy_revision) DO NOTHING;
