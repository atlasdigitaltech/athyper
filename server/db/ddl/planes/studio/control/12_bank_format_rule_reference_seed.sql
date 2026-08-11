-- seed-contract-version: 1
-- seed-pack: athyper.blueprint.bank-formats
-- seed-pack-version: 2.0.0
-- seed-dataset: control.bank-format-rule.global-defaults
-- seed-data-class: production_reference
-- seed-plane: athyper
-- seed-tenant-scope: global
-- seed-natural-key: control.bank_format_rule(tenant_id,code,version_no)
-- seed-id-strategy: deterministic-uuid:tenant-or-global,code,version
-- seed-expected-row-count: exact:14
-- seed-assertions: expected-count,orphan,uniqueness,semantic,idempotent-convergence
-- seed-demo-data: false

DO $seed$
DECLARE
    v_actor uuid := nullif(trim(current_setting('app.current_principal_id', true)), '')::uuid;
    v_effective_from date := DATE '2026-01-01';
BEGIN
    IF current_setting('app.database_plane', true) <> 'studio' OR v_actor IS NULL THEN
        RAISE EXCEPTION 'bank-formats requires Athyper plane and app.current_principal_id';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM master.principal WHERE id = v_actor) THEN
        RAISE EXCEPTION 'bank-formats actor % is not a master.principal', v_actor;
    END IF;

    WITH desired(code,name,country_code,payment_network,direction,account_id_type,bank_id_type,
                 account_required,bank_required,bic_allowed,bic_required,branch_required,national_required,
                 account_pattern,iban_prefix,checksum_validation,priority) AS (VALUES
      ('us-ach','US ACH','US','ach','both','local','aba',true,true,false,false,false,true,'^\d{4,17}$',NULL::char(2),'aba',10::smallint),
      ('us-wire','US Wire','US','local_transfer','both','local','aba',true,true,true,false,false,true,'^\d{4,17}$',NULL,'aba',10::smallint),
      ('us-swift','US SWIFT','US','swift','outbound','local','bic',true,true,true,true,false,false,'^\d{4,17}$',NULL,'none',10::smallint),
      ('de-sepa','Germany SEPA','DE','sepa','both','iban','bic',true,false,true,false,false,false,'^DE\d{20}$','DE','iban_mod97',10::smallint),
      ('de-swift','Germany SWIFT','DE','swift','outbound','iban','bic',true,true,true,true,false,false,'^DE\d{20}$','DE','iban_mod97',10::smallint),
      ('gb-local','UK Local','GB','local_transfer','both','iban','sort_code',true,true,true,false,false,true,'^GB\d{2}[A-Z]{4}\d{14}$','GB','iban_mod97',10::smallint),
      ('in-local','India Local','IN','local_transfer','both','local','ifsc',true,true,false,false,false,true,'^\d{9,18}$',NULL,'none',10::smallint),
      ('in-swift','India SWIFT','IN','swift','outbound','local','bic',true,true,true,true,false,false,'^\d{9,18}$',NULL,'none',10::smallint),
      ('ae-local','UAE Local','AE','local_transfer','both','iban','bank_code',true,true,true,false,false,false,'^AE\d{21}$','AE','iban_mod97',10::smallint),
      ('au-local','Australia Local','AU','local_transfer','both','local','bsb',true,true,false,false,false,true,'^\d{6,10}$',NULL,'none',10::smallint),
      ('my-local','Malaysia Local','MY','local_transfer','both','local','bank_code',true,true,false,false,true,true,'^\d{10,16}$',NULL,'none',10::smallint),
      ('sg-local','Singapore Local','SG','local_transfer','both','local','bank_code',true,true,false,false,true,true,'^\d{10,14}$',NULL,'none',10::smallint),
      ('in-upi','India UPI','IN','upi','both','upi_vpa','none',true,false,false,false,false,false,'^[a-zA-Z0-9._-]+@[a-zA-Z]+$',NULL,'none',10::smallint),
      ('ke-mpesa','Kenya M-Pesa','KE','mobile_money','both','mobile','none',true,false,false,false,false,false,'^\+254[0-9]{9}$',NULL,'none',10::smallint)
    )
    INSERT INTO control.bank_format_rule(
      id,tenant_id,code,name,version_no,country_code,payment_network,direction,currency_code,
      account_id_type,bank_id_type,account_id_required,bank_id_required,bic_allowed,bic_required,
      branch_code_required,national_bank_code_required,account_pattern,iban_country_prefix,
      checksum_validation,priority,effective_from,metadata,status,status_changed_at,status_changed_by,created_by)
    SELECT md5('wave5:bank-format:global:'||d.code||':1')::uuid,NULL,d.code,d.name,1,d.country_code,d.payment_network,d.direction,NULL,
      d.account_id_type,d.bank_id_type,d.account_required,d.bank_required,d.bic_allowed,d.bic_required,
      d.branch_required,d.national_required,d.account_pattern,d.iban_prefix,d.checksum_validation,d.priority,
      v_effective_from,'{"_seed":{"pack":"bank-formats","version":"2.0.0"}}'::jsonb,
      'active',now(),v_actor,v_actor
    FROM desired d
    ON CONFLICT (tenant_id,code,version_no) DO NOTHING;

    IF (SELECT count(*) FROM control.bank_format_rule
         WHERE tenant_id IS NULL AND version_no=1 AND metadata->'_seed'->>'pack'='bank-formats') <> 14 THEN
      RAISE EXCEPTION 'bank-formats expected 14 global version-1 rules';
    END IF;
    IF EXISTS (SELECT 1 FROM control.bank_format_rule r LEFT JOIN shared.country c ON c.code=r.country_code
                WHERE r.tenant_id IS NULL AND r.metadata->'_seed'->>'pack'='bank-formats' AND c.code IS NULL) THEN
      RAISE EXCEPTION 'bank-formats contains an invalid country reference';
    END IF;
    IF EXISTS (SELECT code,version_no FROM control.bank_format_rule
                WHERE tenant_id IS NULL AND metadata->'_seed'->>'pack'='bank-formats'
                GROUP BY code,version_no HAVING count(*) > 1) THEN
      RAISE EXCEPTION 'bank-formats contains duplicate global revisions';
    END IF;
    IF EXISTS (SELECT 1 FROM control.bank_format_rule
                WHERE tenant_id IS NULL AND metadata->'_seed'->>'pack'='bank-formats'
                  AND (code <> lower(code) OR status <> 'active' OR effective_until IS NOT NULL)) THEN
      RAISE EXCEPTION 'bank-formats semantic assertion failed';
    END IF;
END $seed$;
