-- Effective-dated tax groups assembled from the rate schedules published by 322.
-- This pack owns policy rows only. It never deletes groups/components and never
-- mutates supplier, invoice, or other transactional relations.

DO $seed$
DECLARE
    v_tid          uuid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    v_actor        uuid := nullif(trim(current_setting('app.current_principal_id', true)), '')::uuid;
    v_effective_on date := DATE '2026-08-01';
    v_rounding_id  uuid;
    v_missing      text;
BEGIN
    IF current_database() !~* 'neon' THEN
        RAISE EXCEPTION '323 requires the Neon plane; current database is %', current_database();
    END IF;
    IF v_tid IS NULL OR v_actor IS NULL THEN
        RAISE EXCEPTION '323 requires app.seed_tenant_id and app.current_principal_id';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM master.tenant WHERE id = v_tid) THEN
        RAISE EXCEPTION '323 tenant % does not exist in master.tenant', v_tid;
    END IF;

    v_rounding_id := md5('wave5:tax-rounding:' || v_tid || ':currency-standard')::uuid;
    INSERT INTO control.rounding_rule
        (id, tenant_id, code, name, method, metadata, status,
         status_changed_at, status_changed_by, created_by)
    VALUES
        (v_rounding_id, v_tid, 'TAX-CURRENCY-STANDARD', 'Tax currency standard rounding',
         'ROUND_HALF_UP',
         '{"_seed":{"pack":"tax-fx","payload":"323_tax_groups","version":"3.0.0"}}',
         'active', clock_timestamp(), v_actor, v_actor)
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name = EXCLUDED.name,
        method = EXCLUDED.method,
        metadata = EXCLUDED.metadata,
        updated_at = clock_timestamp(),
        updated_by = v_actor
    WHERE control.rounding_rule.status = 'draft'
      AND (control.rounding_rule.name, control.rounding_rule.method,
           control.rounding_rule.metadata)
          IS DISTINCT FROM
          (EXCLUDED.name, EXCLUDED.method, EXCLUDED.metadata)
    RETURNING id INTO v_rounding_id;

    IF v_rounding_id IS NULL THEN
        SELECT id INTO v_rounding_id
        FROM control.rounding_rule
        WHERE tenant_id = v_tid AND code = 'TAX-CURRENCY-STANDARD';
    END IF;

    CREATE TEMP TABLE desired_tax_group_component (
        group_code text NOT NULL,
        schedule_key text NOT NULL,
        calculation_seq smallint NOT NULL,
        PRIMARY KEY (group_code, calculation_seq),
        UNIQUE (group_code, schedule_key)
    ) ON COMMIT DROP;

    INSERT INTO desired_tax_group_component VALUES
      ('TG-MY-SST-SALES-10','TJ-MY|MY-SST-SALES|SALE|',1),
      ('TG-MY-SST-SVC-6','TJ-MY|MY-SST-SVC|SALE|',1),
      ('TG-MY-WHT-10','TJ-MY|MY-WHT|SALE|standard',1),
      ('TG-QA-WHT-5','TJ-QA|QA-WHT|SALE|standard',1),
      ('TG-SA-VAT-15-OUT','TJ-SA|SA-VAT|SALE|',1),
      ('TG-SA-VAT-15-IN','TJ-SA|SA-VAT|PURCHASE|',1),
      ('TG-SA-ZAKAT','TJ-SA|SA-ZAKAT|SALE|',1),
      ('TG-SA-WHT-5','TJ-SA|SA-WHT|SALE|standard',1),
      ('TG-AE-VAT-5-OUT','TJ-AE|AE-VAT|SALE|',1),
      ('TG-AE-VAT-5-IN','TJ-AE|AE-VAT|PURCHASE|',1),
      ('TG-US-CA-SALES','TJ-US-CA|US-SALES|SALE|',1),
      ('TG-US-WHT-30','TJ-US|US-WHT|SALE|standard',1),
      ('TG-SG-GST-9-OUT','TJ-SG|SG-GST|SALE|',1),
      ('TG-SG-GST-9-IN','TJ-SG|SG-GST|PURCHASE|',1),
      ('TG-SG-WHT-15','TJ-SG|SG-WHT|SALE|standard',1),
      -- The lean DDL forbids cross-jurisdiction components. Legacy CGST+SGST
      -- compound groups are intentionally retired; interstate IGST remains valid.
      ('TG-IN-IGST-18-OUT','TJ-IN|IN-IGST|SALE|std-18',1),
      ('TG-IN-IGST-18-IN','TJ-IN|IN-IGST|PURCHASE|std-18',1),
      ('TG-IN-TDS-10','TJ-IN|IN-TDS|SALE|standard',1),
      ('TG-IN-TCS-GOODS','TJ-IN|IN-TCS|SALE|goods',1),
      ('TG-IN-TCS-SCRAP','TJ-IN|IN-TCS|SALE|scrap',1),
      ('TG-CA-GST-5-OUT','TJ-CA|CA-GST|SALE|',1),
      ('TG-CA-GST-5-IN','TJ-CA|CA-GST|PURCHASE|',1),
      ('TG-CA-HST-13-OUT','TJ-CA|CA-HST|SALE|standard',1),
      ('TG-CA-HST-13-IN','TJ-CA|CA-HST|PURCHASE|standard',1),
      ('TG-CA-WHT-25','TJ-CA|CA-WHT|SALE|standard',1),
      ('TG-DE-UST-19-OUT','TJ-DE|DE-UST|SALE|standard',1),
      ('TG-DE-UST-19-IN','TJ-DE|DE-UST|PURCHASE|standard',1),
      ('TG-DE-UST-7-OUT','TJ-DE|DE-UST|SALE|reduced',1),
      ('TG-DE-UST-7-IN','TJ-DE|DE-UST|PURCHASE|reduced',1),
      ('TG-DE-WHT-25','TJ-DE|DE-WHT|SALE|standard',1),
      ('TG-TW-VAT-5-OUT','TJ-TW|TW-VAT|SALE|',1),
      ('TG-TW-VAT-5-IN','TJ-TW|TW-VAT|PURCHASE|',1),
      ('TG-TW-WHT-20','TJ-TW|TW-WHT|SALE|standard',1),
      ('TG-ZA-VAT-15-OUT','TJ-ZA|ZA-VAT|SALE|',1),
      ('TG-ZA-VAT-15-IN','TJ-ZA|ZA-VAT|PURCHASE|',1),
      ('TG-ZA-MINING-5','TJ-ZA|ZA-MINING-ROY|SALE|crude',1),
      ('TG-ZA-WHT-DIV','TJ-ZA|ZA-WHT|SALE|dividends',1),
      ('TG-ZA-WHT-INT','TJ-ZA|ZA-WHT|SALE|interest',1),
      ('TG-GB-VAT-20-OUT','TJ-GB|GB-VAT|SALE|standard',1),
      ('TG-GB-VAT-20-IN','TJ-GB|GB-VAT|PURCHASE|standard',1),
      ('TG-GB-VAT-5-OUT','TJ-GB|GB-VAT|SALE|reduced',1),
      ('TG-GB-VAT-5-IN','TJ-GB|GB-VAT|PURCHASE|reduced',1),
      ('TG-GB-WHT-20','TJ-GB|GB-WHT|SALE|standard',1),
      ('TG-JP-CT-10-OUT','TJ-JP|JP-CT|SALE|standard',1),
      ('TG-JP-CT-10-IN','TJ-JP|JP-CT|PURCHASE|standard',1),
      ('TG-JP-CT-8-OUT','TJ-JP|JP-CT|SALE|reduced',1),
      ('TG-JP-CT-8-IN','TJ-JP|JP-CT|PURCHASE|reduced',1),
      ('TG-JP-WHT-20','TJ-JP|JP-WHT|SALE|standard',1),
      ('TG-PH-VAT-12-OUT','TJ-PH|PH-VAT|SALE|',1),
      ('TG-PH-VAT-12-IN','TJ-PH|PH-VAT|PURCHASE|',1),
      ('TG-PH-EWT-GOODS','TJ-PH|PH-EWT|SALE|goods',1),
      ('TG-PH-EWT-SVC','TJ-PH|PH-EWT|SALE|services',1),
      ('TG-PH-FWT-INT','TJ-PH|PH-FWT|SALE|interest',1);

    CREATE TEMP TABLE available_tax_schedule ON COMMIT DROP AS
    SELECT DISTINCT ON (schedule_key)
           id, schedule_key, jurisdiction_id, tax_class
    FROM (
      SELECT trs.id,
             tj.code || '|' || tt.code || '|' || trs.tax_direction || '|' ||
               CASE WHEN upper(coalesce(trs.component_code, '')) = upper(tt.code)
                    THEN '' ELSE lower(coalesce(trs.component_code, '')) END AS schedule_key,
             trs.jurisdiction_id,
             tt.tax_class::text AS tax_class,
             trs.created_at
      FROM control.tax_rate_schedule trs
      JOIN master.tax_jurisdiction tj
        ON tj.tenant_id = trs.tenant_id AND tj.id = trs.jurisdiction_id
      JOIN master.tax_type tt
        ON tt.tenant_id = trs.tenant_id AND tt.id = trs.tax_type_id
      WHERE trs.tenant_id = v_tid
        AND trs.status = 'active'
        AND trs.metadata->'_seed'->>'pack' = '322_org'
    ) published
    ORDER BY schedule_key, created_at DESC, id DESC;

    SELECT string_agg(d.schedule_key, ', ' ORDER BY d.schedule_key)
      INTO v_missing
    FROM desired_tax_group_component d
    LEFT JOIN available_tax_schedule s USING (schedule_key)
    WHERE s.id IS NULL;
    IF v_missing IS NOT NULL THEN
        RAISE EXCEPTION '323 missing active 322 schedules: %', v_missing;
    END IF;

    CREATE TEMP TABLE desired_tax_group ON COMMIT DROP AS
    SELECT d.group_code,
           initcap(replace(substr(d.group_code, 4), '-', ' ')) AS group_name,
           CASE WHEN bool_or(s.tax_class IN ('withholding', 'income_tax'))
                THEN 'withholding'::control.tax_group_kind_d
                ELSE 'indirect_tax'::control.tax_group_kind_d END AS group_kind,
           CASE
             WHEN d.group_code LIKE 'TG-IN-TN-%' THEN (SELECT id FROM master.tax_jurisdiction WHERE tenant_id=v_tid AND code='TJ-IN-TN')
             WHEN d.group_code LIKE 'TG-IN-MH-%' THEN (SELECT id FROM master.tax_jurisdiction WHERE tenant_id=v_tid AND code='TJ-IN-MH')
             WHEN d.group_code LIKE 'TG-US-CA-%' THEN (SELECT id FROM master.tax_jurisdiction WHERE tenant_id=v_tid AND code='TJ-US-CA')
             ELSE min(s.jurisdiction_id::text)::uuid
           END AS jurisdiction_id,
           count(*) > 1 AS is_compound
    FROM desired_tax_group_component d
    JOIN available_tax_schedule s USING (schedule_key)
    GROUP BY d.group_code;

    IF EXISTS (SELECT 1 FROM desired_tax_group WHERE jurisdiction_id IS NULL) THEN
        RAISE EXCEPTION '323 desired group has no jurisdiction';
    END IF;

    -- Existing rows are immutable history. Retire earlier revisions; do not delete
    -- their components and do not touch rows owned by applications or transactions.
    UPDATE control.tax_group
       SET effective_to = coalesce(effective_to, v_effective_on - 1),
           status = 'retired',
           updated_at = clock_timestamp(),
           updated_by = v_actor
     WHERE tenant_id = v_tid
       AND metadata->'_seed'->>'pack' = '323_org'
       AND effective_from < v_effective_on
       AND status IN ('draft', 'scheduled', 'active')
       AND (effective_to IS NULL OR effective_to >= v_effective_on OR status <> 'retired');

    INSERT INTO control.tax_group
        (id, tenant_id, code, name, description, group_kind, jurisdiction_id,
         effective_from, is_compound, rounding_rule_id, metadata, status, created_by)
    SELECT md5('wave5:tax-group:' || v_tid || ':' || g.group_code || ':' || v_effective_on)::uuid,
           v_tid, g.group_code, g.group_name,
           'Effective tax policy assembled from validated rate schedules.',
           g.group_kind, g.jurisdiction_id, v_effective_on, g.is_compound,
           v_rounding_id,
           jsonb_build_object('_seed', jsonb_build_object(
             'pack','tax-fx','payload','323_tax_groups','version','3.0.0',
             'natural_key',g.group_code || '|' || v_effective_on)),
           'draft', v_actor
    FROM desired_tax_group g
    WHERE NOT EXISTS (
      SELECT 1 FROM control.tax_group existing
      WHERE existing.tenant_id=v_tid AND existing.code=g.group_code
        AND existing.effective_from=v_effective_on
    )
    ON CONFLICT (tenant_id, code, effective_from) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        group_kind = EXCLUDED.group_kind,
        jurisdiction_id = EXCLUDED.jurisdiction_id,
        is_compound = EXCLUDED.is_compound,
        rounding_rule_id = EXCLUDED.rounding_rule_id,
        metadata = EXCLUDED.metadata,
        updated_at = clock_timestamp(),
        updated_by = v_actor
    WHERE control.tax_group.status = 'draft'
      AND (control.tax_group.name, control.tax_group.description,
           control.tax_group.group_kind, control.tax_group.jurisdiction_id,
           control.tax_group.is_compound, control.tax_group.rounding_rule_id,
           control.tax_group.metadata)
          IS DISTINCT FROM
          (EXCLUDED.name, EXCLUDED.description, EXCLUDED.group_kind,
           EXCLUDED.jurisdiction_id, EXCLUDED.is_compound,
           EXCLUDED.rounding_rule_id, EXCLUDED.metadata);

    INSERT INTO control.tax_group_component
        (id, tenant_id, tax_group_id, tax_rate_schedule_id,
         calculation_seq, metadata, created_by)
    SELECT md5('wave5:tax-group-component:' || v_tid || ':' || d.group_code || ':' || d.schedule_key)::uuid,
           v_tid, g.id, s.id, d.calculation_seq,
           '{"_seed":{"pack":"tax-fx","payload":"323_tax_groups","version":"3.0.0"}}',
           v_actor
    FROM desired_tax_group_component d
    JOIN available_tax_schedule s USING (schedule_key)
    JOIN control.tax_group g
      ON g.tenant_id = v_tid AND g.code = d.group_code
     AND g.effective_from = v_effective_on AND g.status = 'draft'
    ON CONFLICT (tenant_id, tax_group_id, tax_rate_schedule_id) DO NOTHING;

    IF EXISTS (
        SELECT 1
        FROM desired_tax_group d
        JOIN control.tax_group g ON g.tenant_id=v_tid AND g.code=d.group_code
                                AND g.effective_from=v_effective_on
        LEFT JOIN control.tax_group_component c
          ON c.tenant_id=g.tenant_id AND c.tax_group_id=g.id
        GROUP BY d.group_code, d.is_compound
        HAVING count(c.id) <> CASE WHEN d.is_compound THEN 2 ELSE 1 END
    ) THEN
        RAISE EXCEPTION '323 component cardinality does not match desired tax groups';
    END IF;

    UPDATE control.tax_group g
       SET status = 'active',
           updated_at = clock_timestamp(),
           updated_by = v_actor
      FROM desired_tax_group d
     WHERE g.tenant_id=v_tid AND g.code=d.group_code
       AND g.effective_from=v_effective_on AND g.status='draft';

    IF (SELECT count(*) FROM control.tax_group g JOIN desired_tax_group d ON d.group_code=g.code
        WHERE g.tenant_id=v_tid AND g.effective_from=v_effective_on AND g.status='active')
       <> (SELECT count(*) FROM desired_tax_group) THEN
        RAISE EXCEPTION '323 did not activate every desired tax group';
    END IF;
    IF EXISTS (
        SELECT 1 FROM control.tax_group_component c
        LEFT JOIN control.tax_group g ON g.tenant_id=c.tenant_id AND g.id=c.tax_group_id
        LEFT JOIN control.tax_rate_schedule s ON s.tenant_id=c.tenant_id AND s.id=c.tax_rate_schedule_id
        WHERE c.tenant_id=v_tid AND (g.id IS NULL OR s.id IS NULL)
    ) THEN
        RAISE EXCEPTION '323 orphan tax-group component detected';
    END IF;

    RAISE NOTICE '323: % effective tax groups and % components validated',
      (SELECT count(*) FROM desired_tax_group),
      (SELECT count(*) FROM desired_tax_group_component);
END $seed$;
