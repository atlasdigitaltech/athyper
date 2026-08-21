-- Effective tax-resolution policy for groups published by 323.
-- No-tax outcomes are represented by absence of a matching rule. Cross-jurisdiction
-- compound groups are not supported by the lean tax-policy DDL and are not seeded.

DO $seed$
DECLARE
    v_tid          uuid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    v_actor        uuid := nullif(trim(current_setting('app.current_principal_id', true)), '')::uuid;
    v_effective_on date := DATE '2026-08-01';
    v_purchase_docs text[] := ARRAY[
      'purchase_invoice','purchase_order','receipt','service_sheet','purchase_requisition'
    ];
    v_sale_docs text[] := ARRAY['sales_invoice','sales_order'];
    v_missing text;
BEGIN
    IF current_database() !~* 'neon' THEN
        RAISE EXCEPTION '324 requires the Neon plane; current database is %', current_database();
    END IF;
    IF v_tid IS NULL OR v_actor IS NULL THEN
        RAISE EXCEPTION '324 requires app.seed_tenant_id and app.current_principal_id';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM master.tenant WHERE id=v_tid) THEN
        RAISE EXCEPTION '324 tenant % does not exist in master.tenant', v_tid;
    END IF;

    CREATE TEMP TABLE desired_tax_resolution_rule (
      code text PRIMARY KEY,
      name text NOT NULL,
      target_group_code text NOT NULL,
      direction control.tax_transaction_direction_d NOT NULL,
      billto_code text,
      billfrom_code text,
      shipto_code text,
      shipfrom_code text,
      require_match boolean NOT NULL DEFAULT false,
      require_mismatch boolean NOT NULL DEFAULT false,
      entity_set text NOT NULL,
      priority smallint NOT NULL
    ) ON COMMIT DROP;

    INSERT INTO desired_tax_resolution_rule VALUES
      ('TRR-AE-VAT-INPUT','AE domestic purchase VAT 5%','TG-AE-VAT-5-IN','purchase','TJ-AE','TJ-AE',NULL,NULL,false,false,'purchase',100),
      ('TRR-AE-VAT-OUTPUT','AE domestic sale VAT 5%','TG-AE-VAT-5-OUT','sale','TJ-AE','TJ-AE',NULL,NULL,false,false,'sale',100),
      ('TRR-SA-VAT-INPUT','SA domestic purchase VAT 15%','TG-SA-VAT-15-IN','purchase','TJ-SA','TJ-SA',NULL,NULL,false,false,'purchase',100),
      ('TRR-SA-VAT-OUTPUT','SA domestic sale VAT 15%','TG-SA-VAT-15-OUT','sale','TJ-SA','TJ-SA',NULL,NULL,false,false,'sale',100),
      ('TRR-SG-GST-INPUT','SG domestic purchase GST 9%','TG-SG-GST-9-IN','purchase','TJ-SG','TJ-SG',NULL,NULL,false,false,'purchase',100),
      ('TRR-SG-GST-OUTPUT','SG domestic sale GST 9%','TG-SG-GST-9-OUT','sale','TJ-SG','TJ-SG',NULL,NULL,false,false,'sale',100),
      ('TRR-GB-VAT-INPUT','GB domestic purchase VAT 20%','TG-GB-VAT-20-IN','purchase','TJ-GB','TJ-GB',NULL,NULL,false,false,'purchase',100),
      ('TRR-GB-VAT-OUTPUT','GB domestic sale VAT 20%','TG-GB-VAT-20-OUT','sale','TJ-GB','TJ-GB',NULL,NULL,false,false,'sale',100),
      ('TRR-DE-UST-INPUT','DE domestic purchase USt 19%','TG-DE-UST-19-IN','purchase','TJ-DE','TJ-DE',NULL,NULL,false,false,'purchase',100),
      ('TRR-DE-UST-OUTPUT','DE domestic sale USt 19%','TG-DE-UST-19-OUT','sale','TJ-DE','TJ-DE',NULL,NULL,false,false,'sale',100),
      ('TRR-JP-CT-INPUT','JP domestic purchase CT 10%','TG-JP-CT-10-IN','purchase','TJ-JP','TJ-JP',NULL,NULL,false,false,'purchase',100),
      ('TRR-JP-CT-OUTPUT','JP domestic sale CT 10%','TG-JP-CT-10-OUT','sale','TJ-JP','TJ-JP',NULL,NULL,false,false,'sale',100),
      ('TRR-PH-VAT-INPUT','PH domestic purchase VAT 12%','TG-PH-VAT-12-IN','purchase','TJ-PH','TJ-PH',NULL,NULL,false,false,'purchase',100),
      ('TRR-PH-VAT-OUTPUT','PH domestic sale VAT 12%','TG-PH-VAT-12-OUT','sale','TJ-PH','TJ-PH',NULL,NULL,false,false,'sale',100),
      ('TRR-ZA-VAT-INPUT','ZA domestic purchase VAT 15%','TG-ZA-VAT-15-IN','purchase','TJ-ZA','TJ-ZA',NULL,NULL,false,false,'purchase',100),
      ('TRR-ZA-VAT-OUTPUT','ZA domestic sale VAT 15%','TG-ZA-VAT-15-OUT','sale','TJ-ZA','TJ-ZA',NULL,NULL,false,false,'sale',100),
      ('TRR-TW-VAT-INPUT','TW domestic purchase VAT 5%','TG-TW-VAT-5-IN','purchase','TJ-TW','TJ-TW',NULL,NULL,false,false,'purchase',100),
      ('TRR-TW-VAT-OUTPUT','TW domestic sale VAT 5%','TG-TW-VAT-5-OUT','sale','TJ-TW','TJ-TW',NULL,NULL,false,false,'sale',100),
      ('TRR-CA-HST-INPUT','CA domestic purchase HST 13%','TG-CA-HST-13-IN','purchase','TJ-CA','TJ-CA',NULL,NULL,false,false,'purchase',100),
      ('TRR-CA-HST-OUTPUT','CA domestic sale HST 13%','TG-CA-HST-13-OUT','sale','TJ-CA','TJ-CA',NULL,NULL,false,false,'sale',100),
      ('TRR-MY-SST-OUTPUT','MY domestic sale SST 10%','TG-MY-SST-SALES-10','sale','TJ-MY','TJ-MY',NULL,NULL,false,false,'sale',100),
      ('TRR-US-CA-SALES-OUTPUT','US California domestic sales tax','TG-US-CA-SALES','sale','TJ-US-CA','TJ-US-CA',NULL,NULL,false,false,'sale',110),
      ('TRR-IN-IGST-INPUT','IN interstate purchase IGST 18%','TG-IN-IGST-18-IN','purchase','TJ-IN','TJ-IN',NULL,NULL,false,true,'purchase',150),
      ('TRR-IN-IGST-OUTPUT','IN interstate sale IGST 18%','TG-IN-IGST-18-OUT','sale','TJ-IN','TJ-IN',NULL,NULL,false,true,'sale',150);

    CREATE TEMP TABLE resolved_tax_resolution_rule ON COMMIT DROP AS
    SELECT d.*,
           g.id AS target_group_id,
           g.jurisdiction_id AS target_jurisdiction_id,
           bt.id AS billto_id,
           bf.id AS billfrom_id,
           st.id AS shipto_id,
           sf.id AS shipfrom_id
    FROM desired_tax_resolution_rule d
    LEFT JOIN control.tax_group g
      ON g.tenant_id=v_tid AND g.code=d.target_group_code
     AND g.effective_from <= v_effective_on
     AND (g.effective_to IS NULL OR g.effective_to >= v_effective_on)
     AND g.status='active'
    LEFT JOIN master.tax_jurisdiction bt ON bt.tenant_id=v_tid AND bt.code=d.billto_code
    LEFT JOIN master.tax_jurisdiction bf ON bf.tenant_id=v_tid AND bf.code=d.billfrom_code
    LEFT JOIN master.tax_jurisdiction st ON st.tenant_id=v_tid AND st.code=d.shipto_code
    LEFT JOIN master.tax_jurisdiction sf ON sf.tenant_id=v_tid AND sf.code=d.shipfrom_code;

    SELECT string_agg(code || ' -> ' || target_group_code, ', ' ORDER BY code)
      INTO v_missing
    FROM resolved_tax_resolution_rule
    WHERE target_group_id IS NULL
       OR (billto_code IS NOT NULL AND billto_id IS NULL)
       OR (billfrom_code IS NOT NULL AND billfrom_id IS NULL)
       OR (shipto_code IS NOT NULL AND shipto_id IS NULL)
       OR (shipfrom_code IS NOT NULL AND shipfrom_id IS NULL);
    IF v_missing IS NOT NULL THEN
        RAISE EXCEPTION '324 unresolved effective policy coordinates: %', v_missing;
    END IF;

    -- A scoped domestic rule must resolve within that same jurisdiction. India
    -- interstate rules intentionally resolve at the TJ-IN country jurisdiction.
    IF EXISTS (
      SELECT 1 FROM resolved_tax_resolution_rule
      WHERE target_jurisdiction_id IS DISTINCT FROM coalesce(
        billto_id, billfrom_id, shipto_id, shipfrom_id, target_jurisdiction_id)
    ) THEN
      RAISE EXCEPTION '324 rule target does not match its primary jurisdiction scope';
    END IF;

    -- Retain all historical rows and their references. Earlier seed-owned rules
    -- become ineffective immediately before the replacement revision.
    UPDATE control.tax_resolution_rule
       SET effective_to=coalesce(effective_to, v_effective_on - 1),
           status='retired',
           updated_at=clock_timestamp(),
           updated_by=v_actor
     WHERE tenant_id=v_tid
       AND metadata->'_seed'->>'pack'='324_org'
       AND effective_from < v_effective_on
       AND status IN ('draft','scheduled','active');

    INSERT INTO control.tax_resolution_rule (
      id,tenant_id,code,name,description,scope_transaction_direction,
      scope_billto_jurisdiction_id,scope_billfrom_jurisdiction_id,
      scope_shipto_jurisdiction_id,scope_shipfrom_jurisdiction_id,
      scope_doc_entity_codes,requires_shipto_shipfrom_match,
      requires_shipto_shipfrom_mismatch,resolved_tax_group_id,priority,
      effective_from,metadata,status,created_by
    )
    SELECT md5('wave5:tax-resolution:'||v_tid||':'||r.code||':'||v_effective_on)::uuid,
      v_tid,r.code,r.name,'Effective jurisdiction and document-direction tax resolution.',
      r.direction,r.billto_id,r.billfrom_id,r.shipto_id,r.shipfrom_id,
      CASE r.entity_set WHEN 'purchase' THEN v_purchase_docs ELSE v_sale_docs END,
      r.require_match,r.require_mismatch,r.target_group_id,r.priority,v_effective_on,
      jsonb_build_object('_seed',jsonb_build_object(
        'pack','tax-fx','payload','324_tax_resolution_rules','version','4.0.0',
        'natural_key',r.code||'|'||v_effective_on)),
      'draft',v_actor
    FROM resolved_tax_resolution_rule r
    WHERE NOT EXISTS (
      SELECT 1 FROM control.tax_resolution_rule existing
      WHERE existing.tenant_id=v_tid AND existing.code=r.code
        AND existing.effective_from=v_effective_on
    )
    ON CONFLICT (tenant_id,code,effective_from) DO NOTHING;

    UPDATE control.tax_resolution_rule rule
       SET status='active',updated_at=clock_timestamp(),updated_by=v_actor
      FROM resolved_tax_resolution_rule desired
     WHERE rule.tenant_id=v_tid AND rule.code=desired.code
       AND rule.effective_from=v_effective_on AND rule.status='draft';

    IF (SELECT count(*) FROM control.tax_resolution_rule rule
        JOIN desired_tax_resolution_rule desired USING (code)
        WHERE rule.tenant_id=v_tid AND rule.effective_from=v_effective_on
          AND rule.status='active') <> 24 THEN
      RAISE EXCEPTION '324 expected 24 active effective rules';
    END IF;

    IF EXISTS (
      SELECT 1 FROM control.tax_resolution_rule rule
      JOIN control.tax_group g
        ON g.tenant_id=rule.tenant_id AND g.id=rule.resolved_tax_group_id
      WHERE rule.tenant_id=v_tid AND rule.effective_from=v_effective_on
        AND rule.status='active'
        AND (g.status <> 'active' OR g.effective_from > rule.effective_from
          OR (g.effective_to IS NOT NULL AND
              (rule.effective_to IS NULL OR g.effective_to < rule.effective_to)))
    ) THEN
      RAISE EXCEPTION '324 active rule has an uncovered tax-group period';
    END IF;

    IF EXISTS (
      SELECT 1 FROM control.tax_resolution_rule
      WHERE tenant_id=v_tid AND status='active'
        AND code IN ('TRR-QA-EXEMPT-INPUT','TRR-IN-TN-GST-INPUT',
          'TRR-IN-MH-GST-INPUT','TRR-IN-TN-GST-OUTPUT','TRR-IN-MH-GST-OUTPUT')
    ) THEN
      RAISE EXCEPTION '324 retired no-tax or cross-jurisdiction rule remains active';
    END IF;

    RAISE NOTICE '324: 24 same-jurisdiction effective tax-resolution rules validated';
END $seed$;
