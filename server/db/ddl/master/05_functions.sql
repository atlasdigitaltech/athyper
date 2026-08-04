-- ============================================================================
-- master/05_functions.sql
-- Functions and procedures reconstructed from the live catalog; pre-constraint routines are excluded.
-- Generated from the live Neon database master schema. Do not hand-edit.
-- ============================================================================

CREATE OR REPLACE FUNCTION master.auth_v2_permission_is_effective(p_permission_id uuid, p_plane_code text, p_at timestamp with time zone DEFAULT now())
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM control.auth_permission p
    WHERE p.id = p_permission_id
      AND p.status = 'published'
      AND (p.plane_code::text = p_plane_code OR p.plane_code = 'all')
      AND p.effective_from <= p_at
      AND (p.effective_until IS NULL OR p.effective_until > p_at)
  );
$function$;

CREATE OR REPLACE FUNCTION master.auth_v2_principal_has_plane(p_tenant_id uuid, p_plane_code text, p_principal_id uuid, p_at timestamp with time zone DEFAULT now())
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM master.auth_plane_membership m
    WHERE m.tenant_id = p_tenant_id
      AND m.plane_code = p_plane_code
      AND m.principal_id = p_principal_id
      AND m.status = 'active'
      AND m.effective_from <= p_at
      AND (m.effective_until IS NULL OR m.effective_until > p_at)
  );
$function$;

CREATE OR REPLACE FUNCTION master.backfill_people_from_employee(p_tenant_id uuid)
 RETURNS TABLE(persons_created integer, employees_linked integer, employments_created integer, assignments_created integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'master', 'shared', 'pg_catalog'
AS $function$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';
    v_missing_hire_date_count integer := 0;
    v_employment_type_coerced_count integer := 0;
BEGIN
    -- Backfilled work assignments are intentionally skeletal. A later enrichment
    -- pass should map legacy department/title values to org_unit/job/position.
    INSERT INTO master.person (
        tenant_id, code, name, person_number,
        first_name, last_name, display_name,
        primary_email, primary_phone, metadata, status, created_by
    )
    SELECT
        se.tenant_id,
        'P-' || se.employee_key,
        se.display_name_value,
        se.employee_key,
        se.first_name_value,
        se.last_name_value,
        se.display_name_value,
        se.email,
        se.phone,
        jsonb_build_object('source', 'master.employee', 'employee_id', se.id),
        CASE WHEN se.status = 'archived' THEN 'archived' ELSE 'active' END,
        COALESCE(se.created_by, v_su)
    FROM (
        SELECT
            e.*,
            COALESCE(NULLIF(btrim(e.employee_number), ''), NULLIF(btrim(e.code), ''), e.id::text) AS employee_key,
            COALESCE(
                NULLIF(btrim(e.first_name), ''),
                NULLIF(btrim(split_part(COALESCE(e.name, ''), ' ', 1)), ''),
                NULLIF(btrim(e.name), ''),
                'Unknown'
            ) AS first_name_value,
            COALESCE(
                NULLIF(btrim(e.last_name), ''),
                NULLIF(btrim(split_part(COALESCE(e.name, ''), ' ', 2)), ''),
                'Unknown'
            ) AS last_name_value,
            COALESCE(
                NULLIF(btrim(e.display_name), ''),
                NULLIF(btrim(e.name), ''),
                NULLIF(btrim(e.employee_number), ''),
                NULLIF(btrim(e.code), ''),
                e.id::text
            ) AS display_name_value
        FROM master.employee e
        WHERE e.tenant_id = p_tenant_id
          AND e.person_id IS NULL
    ) se
    ON CONFLICT (tenant_id, code) DO NOTHING;

    GET DIAGNOSTICS persons_created = ROW_COUNT;

    UPDATE master.employee e
       SET person_id = p.id,
           updated_at = now(),
           updated_by = v_su
      FROM master.person p
     WHERE e.tenant_id = p_tenant_id
       AND p.tenant_id = e.tenant_id
       AND p.code = 'P-' || COALESCE(NULLIF(btrim(e.employee_number), ''), NULLIF(btrim(e.code), ''), e.id::text)
       AND e.person_id IS DISTINCT FROM p.id;

    GET DIAGNOSTICS employees_linked = ROW_COUNT;

    SELECT
        count(*) FILTER (WHERE e.hire_date IS NULL),
        count(*) FILTER (
            WHERE e.employment_type IS NULL
               OR e.employment_type NOT IN ('full_time','part_time','contract','casual','intern','volunteer')
        )
      INTO v_missing_hire_date_count, v_employment_type_coerced_count
      FROM master.employee e
     WHERE e.tenant_id = p_tenant_id
       AND e.person_id IS NOT NULL
       AND e.company_code_id IS NOT NULL;

    INSERT INTO master.employment (
        tenant_id, code, name, person_id, employee_id,
        legal_entity_id, company_code_id, employment_number,
        employment_type, employment_status, hire_date,
        termination_date, status, created_by
    )
    SELECT
        se.tenant_id,
        'EMPLOY-' || se.employee_key,
        se.display_name_value || ' Employment',
        se.person_id,
        se.id,
        cc.legal_entity_id,
        se.company_code_id,
        se.employee_key,
        CASE
            WHEN se.employment_type IN ('full_time','part_time','contract','casual','intern','volunteer')
                THEN se.employment_type
            ELSE 'full_time'
        END,
        CASE WHEN se.termination_date IS NULL THEN 'active' ELSE 'terminated' END,
        COALESCE(
            se.hire_date,
            CASE
                WHEN se.termination_date IS NOT NULL AND se.termination_date < CURRENT_DATE
                    THEN se.termination_date
                ELSE CURRENT_DATE
            END
        ),
        se.termination_date,
        CASE WHEN se.termination_date IS NULL THEN 'active' ELSE 'terminated' END,
        COALESCE(se.created_by, v_su)
    FROM (
        SELECT
            e.*,
            COALESCE(NULLIF(btrim(e.employee_number), ''), NULLIF(btrim(e.code), ''), e.id::text) AS employee_key,
            COALESCE(
                NULLIF(btrim(e.display_name), ''),
                NULLIF(btrim(e.name), ''),
                NULLIF(btrim(e.employee_number), ''),
                NULLIF(btrim(e.code), ''),
                e.id::text
            ) AS display_name_value
        FROM master.employee e
        WHERE e.tenant_id = p_tenant_id
          AND e.person_id IS NOT NULL
          AND e.company_code_id IS NOT NULL
    ) se
    JOIN master.company_code cc
      ON cc.tenant_id = se.tenant_id
     AND cc.id = se.company_code_id
    ON CONFLICT (tenant_id, code) DO NOTHING;

    GET DIAGNOSTICS employments_created = ROW_COUNT;

    IF v_missing_hire_date_count > 0 THEN
        RAISE NOTICE 'BACKFILL_NOTICE: % employee(s) had no hire_date; defaulted safely', v_missing_hire_date_count;
    END IF;

    IF v_employment_type_coerced_count > 0 THEN
        RAISE NOTICE 'BACKFILL_NOTICE: % employee(s) had unrecognized employment_type coerced to full_time', v_employment_type_coerced_count;
    END IF;

    INSERT INTO master.work_assignment (
        tenant_id, code, name, employee_id, employment_id,
        company_code_id, manager_employee_id, assignment_type,
        effective_from, effective_until, status, created_by
    )
    SELECT
        se.tenant_id,
        'ASSIGN-' || se.employee_key,
        COALESCE(NULLIF(btrim(se.title), ''), se.display_name_value, se.employee_key),
        se.id,
        em.id,
        se.company_code_id,
        se.manager_id,
        'primary',
        COALESCE(
            se.hire_date,
            CASE
                WHEN se.termination_date IS NOT NULL AND se.termination_date < CURRENT_DATE
                    THEN se.termination_date
                ELSE CURRENT_DATE
            END
        ),
        se.termination_date,
        CASE WHEN se.termination_date IS NULL THEN 'active' ELSE 'ended' END,
        COALESCE(se.created_by, v_su)
    FROM (
        SELECT
            e.*,
            COALESCE(NULLIF(btrim(e.employee_number), ''), NULLIF(btrim(e.code), ''), e.id::text) AS employee_key,
            COALESCE(
                NULLIF(btrim(e.display_name), ''),
                NULLIF(btrim(e.name), ''),
                NULLIF(btrim(e.employee_number), ''),
                NULLIF(btrim(e.code), ''),
                e.id::text
            ) AS display_name_value
        FROM master.employee e
        WHERE e.tenant_id = p_tenant_id
          AND e.company_code_id IS NOT NULL
    ) se
    JOIN master.employment em
      ON em.tenant_id = se.tenant_id
     AND em.employee_id = se.id
     AND em.code = 'EMPLOY-' || se.employee_key
    ON CONFLICT (tenant_id, code) DO NOTHING;

    GET DIAGNOSTICS assignments_created = ROW_COUNT;

    RETURN NEXT;
END;
$function$;

COMMENT ON FUNCTION "master".backfill_people_from_employee(p_tenant_id uuid) IS 'Backfills Phase 1 People person/employment/work_assignment rows from existing master.employee for one tenant.';

CREATE OR REPLACE FUNCTION master.current_auth_plane_code()
 RETURNS text
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE v_plane text := master.current_auth_plane_code_soft();
BEGIN
  IF v_plane NOT IN ('neon', 'admin') THEN
    RAISE EXCEPTION 'missing or invalid app.auth_plane_code' USING ERRCODE = '42501';
  END IF;
  RETURN v_plane;
END $function$;

CREATE OR REPLACE FUNCTION master.current_auth_plane_code_soft()
 RETURNS text
 LANGUAGE sql
 STABLE PARALLEL SAFE
AS $function$
  SELECT NULLIF(current_setting('app.auth_plane_code', true), '');
$function$;

CREATE OR REPLACE FUNCTION master.end_bank_account_link(p_tenant_id uuid, p_link_id uuid, p_effective_until date, p_actor_id uuid)
 RETURNS master.bank_account_link
 LANGUAGE plpgsql
 SET search_path TO 'master', 'shared', 'control', 'document', 'pg_catalog', 'pg_temp'
AS $function$
DECLARE v_link master.bank_account_link;v_account uuid;
BEGIN
  IF p_tenant_id<>shared.current_tenant_id() THEN RAISE EXCEPTION 'tenant context does not match bank account link command' USING ERRCODE='42501';END IF;
  SELECT * INTO v_link FROM master.bank_account_link WHERE tenant_id=p_tenant_id AND id=p_link_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'bank account link not found in active tenant' USING ERRCODE='P0002';END IF;
  IF p_effective_until<=v_link.effective_from THEN RAISE EXCEPTION 'effective_until must be after effective_from' USING ERRCODE='22007';END IF;
  IF v_link.effective_until IS NOT NULL AND p_effective_until>v_link.effective_until THEN RAISE EXCEPTION 'an ended bank account link cannot be extended by the end command' USING ERRCODE='22007';END IF;
  v_account:=v_link.bank_account_id;
  IF EXISTS(SELECT 1 FROM document.payment_entry payment WHERE payment.tenant_id=p_tenant_id AND payment.company_code_id=v_link.owner_id AND payment.bank_account_id=v_account AND payment.value_date>=p_effective_until AND payment.status IN('draft','pending_approval','approved','posted','transmitted','printed')) THEN RAISE EXCEPTION 'Cannot end House Bank link with current or future payments' USING ERRCODE='23514';END IF;
  IF EXISTS(SELECT 1 FROM control.payment_method_company_policy policy WHERE policy.tenant_id=p_tenant_id AND policy.bank_account_link_id=p_link_id AND policy.status='active' AND(policy.effective_until IS NULL OR policy.effective_until>p_effective_until)) THEN RAISE EXCEPTION 'Cannot end House Bank link while an active payment policy extends beyond the end date' USING ERRCODE='23514';END IF;
  IF EXISTS(SELECT 1 FROM document.bank_statement statement WHERE statement.tenant_id=p_tenant_id AND statement.company_code_id=v_link.owner_id AND statement.bank_account_id=v_account AND statement.status IN('imported','matching') AND statement.period_end_date>=p_effective_until) THEN RAISE EXCEPTION 'Cannot end House Bank link with an open statement at or beyond the end date' USING ERRCODE='23514';END IF;
  IF EXISTS(SELECT 1 FROM document.bank_recon_case recon WHERE recon.tenant_id=p_tenant_id AND recon.company_code_id=v_link.owner_id AND recon.bank_account_id=v_account AND recon.status IN('open','matched')) THEN RAISE EXCEPTION 'Cannot end House Bank link with unsigned reconciliation cases' USING ERRCODE='23514';END IF;
  UPDATE master.bank_account_house_config SET status='inactive',status_changed_at=now(),status_changed_by=p_actor_id,updated_at=now(),updated_by=p_actor_id WHERE tenant_id=p_tenant_id AND bank_account_link_id=p_link_id AND status='active';
  UPDATE master.bank_account_link SET effective_until=p_effective_until,updated_at=now(),updated_by=p_actor_id WHERE tenant_id=p_tenant_id AND id=p_link_id RETURNING * INTO v_link;
  RETURN v_link;
END $function$;

COMMENT ON FUNCTION "master".end_bank_account_link(p_tenant_id uuid, p_link_id uuid, p_effective_until date, p_actor_id uuid) IS 'Stage E governed temporal end command. Blocks future payments, extending policies, open statements and unsigned reconciliation before atomically ending House Bank usage.';

CREATE OR REPLACE FUNCTION master.fn_assert_tenant_session(p_tenant_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'master', 'pg_catalog'
AS $function$
DECLARE
    v_session uuid := shared.current_tenant_id_soft();
BEGIN
    IF v_session IS NOT NULL AND p_tenant_id <> v_session THEN
        RAISE EXCEPTION
            'Operation on tenant % not permitted from session tenant %',
            p_tenant_id, v_session
            USING ERRCODE = 'insufficient_privilege';
    END IF;
END;
$function$;

COMMENT ON FUNCTION "master".fn_assert_tenant_session(p_tenant_id uuid) IS 'Soft tenant guard: no-op when GUC is absent (admin context). Use fn_require_tenant_session for tenant-scoped service functions.';

CREATE OR REPLACE FUNCTION master.fn_atlas_conversation_access(p_tenant_id uuid, p_conversation_id uuid, p_owner_only boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'master'
 SET row_security TO 'off'
AS $function$
    SELECT
        nullif(current_setting('app.current_tenant_id', true), '') IS NOT NULL
        AND nullif(current_setting('app.current_principal_id', true), '') IS NOT NULL
        AND nullif(current_setting('app.current_atlas_plane', true), '') IS NOT NULL
        AND p_tenant_id =
            nullif(current_setting('app.current_tenant_id', true), '')::uuid
        AND EXISTS (
            SELECT 1
              FROM master.atlas_thread AS t
             WHERE t.tenant_id = p_tenant_id
               AND t.conversation_id = p_conversation_id
               AND t.plane =
                   nullif(current_setting('app.current_atlas_plane', true), '')
               AND (
                    t.owner_principal_id =
                        nullif(current_setting('app.current_principal_id', true), '')::uuid
                    OR (
                        p_owner_only = false
                        AND EXISTS (
                            SELECT 1
                              FROM master.conversation_participant AS cp
                             WHERE cp.tenant_id = t.tenant_id
                               AND cp.conversation_id = t.conversation_id
                               AND cp.principal_id =
                                   nullif(
                                       current_setting('app.current_principal_id', true),
                                       ''
                                   )::uuid
                               AND cp.left_at IS NULL
                        )
                    )
               )
        );
$function$;

COMMENT ON FUNCTION "master".fn_atlas_conversation_access(p_tenant_id uuid, p_conversation_id uuid, p_owner_only boolean) IS 'Principal-private Atlas access predicate. Requires transaction-local app.current_tenant_id, app.current_principal_id, and app.current_atlas_plane. Missing, revoked, cross-tenant, or wrong-plane context fails closed.';

CREATE OR REPLACE FUNCTION master.fn_bp_hierarchy_sync()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_ancestor    uuid;
    v_parent_path text;
    v_parent_level smallint;
BEGIN
    IF NEW.parent_business_partner_id IS NULL THEN
        NEW.level_no := 1;
        NEW.path     := '/' || NEW.id::text;
        RETURN NEW;
    END IF;

    -- Cycle detection.
    v_ancestor := NEW.parent_business_partner_id;
    WHILE v_ancestor IS NOT NULL LOOP
        IF v_ancestor = NEW.id THEN
            RAISE EXCEPTION
                'Cycle detected in business_partner hierarchy: BP % would become '
                'its own ancestor via parent %.',
                NEW.id, NEW.parent_business_partner_id;
        END IF;
        SELECT parent_business_partner_id INTO v_ancestor
        FROM master.business_partner
        WHERE tenant_id = NEW.tenant_id AND id = v_ancestor;
    END LOOP;

    SELECT level_no, path INTO v_parent_level, v_parent_path
    FROM master.business_partner
    WHERE tenant_id = NEW.tenant_id AND id = NEW.parent_business_partner_id;

    NEW.level_no := COALESCE(v_parent_level, 0) + 1;
    NEW.path     := COALESCE(v_parent_path, '') || '/' || NEW.id::text;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION master.fn_check_marketing_consent(p_tenant_id uuid, p_owner_type text, p_owner_id uuid, p_channel_type text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE sql
 STABLE PARALLEL SAFE
 SET search_path TO 'master'
AS $function$
    SELECT EXISTS (
        SELECT 1
        FROM master.contact_marketing_consent c
        WHERE c.tenant_id  = p_tenant_id
          AND c.owner_type = p_owner_type
          AND c.owner_id   = p_owner_id
          AND c.status     = 'opted_in'
          AND (
            -- Caller asked for umbrella → only succeed if scope is also umbrella
            (p_channel_type IS NULL AND c.channel_scope IS NULL)
            -- Caller asked for specific channel → succeed if umbrella OR channel matches
            OR (p_channel_type IS NOT NULL AND (
                  c.channel_scope IS NULL
                  OR p_channel_type = ANY (c.channel_scope)
            ))
          )
    );
$function$;

COMMENT ON FUNCTION "master".fn_check_marketing_consent(p_tenant_id uuid, p_owner_type text, p_owner_id uuid, p_channel_type text) IS 'Marketing consent gate. Returns true ONLY when an opted_in consent row exists for the owner and (the caller asked for umbrella consent OR the channel falls within the consent scope). Suppression is the default for all other states (opted_out, pending_double_opt_in, unknown, no row). Marketing send-path MUST call this before resolving any contact_link with purpose=marketing.';

CREATE OR REPLACE FUNCTION master.fn_check_tenant_code_available(p_realm_key text, p_code text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'master', 'pg_catalog'
AS $function$
    SELECT NOT EXISTS (
        SELECT 1 FROM master.tenant
        WHERE realm_key = p_realm_key AND code = p_code
    );
$function$;

CREATE OR REPLACE FUNCTION master.fn_create_owner_contact_address(p_tenant_id uuid, p_owner_type text, p_owner_id uuid, p_purpose text, p_line1 text, p_line2 text DEFAULT NULL::text, p_city text DEFAULT NULL::text, p_region text DEFAULT NULL::text, p_postal_code text DEFAULT NULL::text, p_country_code text DEFAULT NULL::text, p_email text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_actor_id uuid DEFAULT NULL::uuid, p_address_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(address_id uuid, cl_email_id uuid, cl_phone_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'master', 'pg_catalog'
AS $function$
DECLARE
    v_address_id    uuid;
    v_cl_email_id   uuid;
    v_cl_phone_id   uuid;
    v_actor         uuid;
BEGIN
    PERFORM master.fn_require_tenant_session(p_tenant_id);
    v_actor := COALESCE(p_actor_id, '00000000-0000-0000-0000-000000000000');

    -- 1. Resolve master.address — three paths:
    --    a) p_address_id provided → reuse (with tenant ownership check)
    --    b) line1+postal_code populated → INSERT with dedup via address_dedup_uq
    --    c) incomplete postal data → plain INSERT (no dedup possible)
    IF p_address_id IS NOT NULL THEN
        -- Validate the address belongs to the caller's tenant
        IF NOT EXISTS (
            SELECT 1 FROM master.address
             WHERE id = p_address_id AND tenant_id = p_tenant_id
        ) THEN
            RAISE EXCEPTION
                'address % does not exist or does not belong to tenant %',
                p_address_id, p_tenant_id
                USING ERRCODE = 'insufficient_privilege';
        END IF;
        v_address_id := p_address_id;
    ELSE
        INSERT INTO master.address (
            tenant_id, line1, line2, city, region, postal_code, country_code, created_by
        )
        VALUES (
            p_tenant_id, p_line1, p_line2, p_city, p_region, p_postal_code,
            upper(p_country_code), v_actor
        )
        ON CONFLICT (tenant_id, country_code, postal_code, line1, city)
            WHERE line1 IS NOT NULL AND postal_code IS NOT NULL AND status = 'active'
        DO UPDATE SET updated_at = now()   -- no-op touch to allow RETURNING
        RETURNING id INTO v_address_id;
    END IF;

    -- 2a. UPSERT master.address_link — always insert with is_primary = false
    -- to avoid colliding with address_link_one_primary_excl if another primary
    -- exists. fn_set_primary_address_link handles promotion via locked path.
    INSERT INTO master.address_link (
        tenant_id, owner_type, owner_id, address_id, purpose,
        is_primary, effective_from, created_by
    )
    VALUES (
        p_tenant_id, p_owner_type, p_owner_id, v_address_id, p_purpose,
        false, CURRENT_DATE, v_actor
    )
    ON CONFLICT ON CONSTRAINT address_link_owner_purpose_address_uq
    DO UPDATE SET updated_at = now();

    -- 2b. Promote to primary via safe locked path (demotes existing, then promotes)
    PERFORM master.fn_set_primary_address_link(
        p_tenant_id,
        (SELECT id FROM master.address_link
          WHERE tenant_id = p_tenant_id AND owner_type = p_owner_type
            AND owner_id = p_owner_id AND address_id = v_address_id
            AND purpose = p_purpose),
        v_actor
    );

    -- 3+4. Contact (email) — delegate to canonical service
    IF p_email IS NOT NULL AND btrim(p_email) <> '' THEN
        IF p_email NOT LIKE '%@%' THEN
            RAISE EXCEPTION 'Invalid email address: %', p_email
                USING ERRCODE = 'invalid_parameter_value';
        END IF;

        -- fn_upsert_contact_link handles: normalization, validation triggers,
        -- value-level dedup via contact_link_value_uq, primary demote-first logic
        v_cl_email_id := master.fn_upsert_contact_link(
            p_tenant_id, p_owner_type, p_owner_id,
            'email', p_email, p_purpose,
            true,    -- is_primary
            v_actor
        );

        -- contact_email extension: idempotent via ON CONFLICT
        INSERT INTO master.contact_email (
            tenant_id, contact_link_id,
            local_part, domain, created_by
        )
        VALUES (
            p_tenant_id, v_cl_email_id,
            lower(split_part(lower(trim(p_email)), '@', 1)),
            lower(split_part(lower(trim(p_email)), '@', 2)),
            v_actor
        )
        ON CONFLICT (tenant_id, contact_link_id) DO NOTHING;
    END IF;

    -- 5+6. Contact (phone) — delegate to canonical service
    -- E.164 format validated here to prevent orphaned contact_link if contact_phone_e164_chk fails.
    IF p_phone IS NOT NULL AND btrim(p_phone) <> '' THEN
        IF p_phone !~ '^\+[1-9]\d{1,14}$' THEN
            RAISE EXCEPTION 'Phone must be in E.164 format (e.g. +60123456789): %', p_phone
                USING ERRCODE = 'invalid_parameter_value';
        END IF;

        v_cl_phone_id := master.fn_upsert_contact_link(
            p_tenant_id, p_owner_type, p_owner_id,
            'phone', p_phone, p_purpose,
            true,    -- is_primary
            v_actor
        );

        INSERT INTO master.contact_phone (
            tenant_id, contact_link_id, e164, created_by
        )
        VALUES (p_tenant_id, v_cl_phone_id, p_phone, v_actor)
        ON CONFLICT (tenant_id, contact_link_id) DO NOTHING;
    END IF;

    RETURN QUERY SELECT v_address_id, v_cl_email_id, v_cl_phone_id;
END;
$function$;

COMMENT ON FUNCTION "master".fn_create_owner_contact_address(p_tenant_id uuid, p_owner_type text, p_owner_id uuid, p_purpose text, p_line1 text, p_line2 text, p_city text, p_region text, p_postal_code text, p_country_code text, p_email text, p_phone text, p_actor_id uuid, p_address_id uuid) IS 'Atomic multi-row insert: address + address_link + contact_link(email) + contact_email + contact_link(phone) + contact_phone. All rows tied to the same (owner_type, owner_id, purpose) context. Address dedup: when line1+postal_code are non-null, ON CONFLICT against address_dedup_uq reuses an existing active address with the same postal fingerprint. Pass p_address_id to reuse a known address (tenant-validated). Primary promotion delegated to fn_set_primary_address_link / fn_set_primary_contact_link (locked paths, safe under concurrency). p_email and p_phone are optional; omit to skip contact rows.';

CREATE OR REPLACE FUNCTION master.fn_customer_category_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_category text;
BEGIN
    SELECT partner_category INTO v_category
    FROM master.business_partner
    WHERE tenant_id = NEW.tenant_id AND id = NEW.business_partner_id;

    CASE v_category
        WHEN 'internal' THEN
            IF NEW.customer_type <> 'intercompany' THEN
                RAISE EXCEPTION
                    'BP partner_category=''internal'' requires customer_type=''intercompany'' '
                    '(got ''%''). Update customer_type or change partner_category.',
                    NEW.customer_type;
            END IF;
        WHEN 'individual' THEN
            IF NEW.customer_type <> 'individual' THEN
                RAISE EXCEPTION
                    'BP partner_category=''individual'' requires customer_type=''individual'' '
                    '(got ''%'').',
                    NEW.customer_type;
            END IF;
        WHEN 'government' THEN
            IF NEW.customer_type <> 'government' THEN
                RAISE EXCEPTION
                    'BP partner_category=''government'' requires customer_type=''government'' '
                    '(got ''%'').',
                    NEW.customer_type;
            END IF;
        ELSE
            NULL; -- 'organization' → any customer_type is valid
    END CASE;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION master.fn_derive_address_jurisdiction(p_tenant_id uuid, p_country_code text, p_region text)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE PARALLEL SAFE
 SET search_path TO 'master', 'pg_catalog'
AS $function$
DECLARE
    v_country     text;
    v_region_norm text;
    v_state_code  text;
    v_jur_id      uuid;
BEGIN
    IF p_country_code IS NULL OR btrim(p_country_code) = '' THEN
        RETURN NULL;
    END IF;

    v_country := upper(btrim(p_country_code));

    IF p_region IS NOT NULL AND btrim(p_region) <> '' THEN
        v_region_norm := upper(btrim(p_region));

        v_state_code := v_country || '-' || v_region_norm;
        SELECT id INTO v_jur_id
          FROM master.tax_jurisdiction
         WHERE tenant_id = p_tenant_id
           AND country_code = v_country
           AND state_region_code = v_state_code
           AND status = 'active'
         LIMIT 1;
        IF v_jur_id IS NOT NULL THEN RETURN v_jur_id; END IF;

        v_state_code := (
            SELECT sr.code FROM shared.state_region sr
             WHERE sr.country_code = v_country
               AND (upper(sr.name) = v_region_norm OR sr.code = v_state_code)
             LIMIT 1
        );
        IF v_state_code IS NOT NULL THEN
            SELECT id INTO v_jur_id
              FROM master.tax_jurisdiction
             WHERE tenant_id = p_tenant_id
               AND country_code = v_country
               AND state_region_code = v_state_code
               AND status = 'active'
             LIMIT 1;
            IF v_jur_id IS NOT NULL THEN RETURN v_jur_id; END IF;
        END IF;
    END IF;

    SELECT id INTO v_jur_id
      FROM master.tax_jurisdiction
     WHERE tenant_id = p_tenant_id
       AND country_code = v_country
       AND jurisdiction_type = 'country'
       AND status = 'active'
     LIMIT 1;

    RETURN v_jur_id;
END $function$;

COMMENT ON FUNCTION "master".fn_derive_address_jurisdiction(p_tenant_id uuid, p_country_code text, p_region text) IS 'Phase 3a: derives master.tax_jurisdiction_id for an address from its (country_code, region) pair. State-level first, country-level fallback, NULL if neither match. Used by trg_address_derive_jurisdiction to auto-populate master.address.tax_jurisdiction_id.';

CREATE OR REPLACE FUNCTION master.fn_display_name(p_entity text, p_code text, p_locale text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'master'
AS $function$
declare
  v_entity text;
  v_code   text;
  v_locale text;
  v_name   text;
  v_lang   text;
  v_schema text;
  v_table  text;
  v_pk_col text;
  v_nm_col text;
begin
  v_entity := btrim(p_entity);
  v_code   := btrim(p_code);
  if v_entity is null or v_entity = '' or v_code is null or v_code = '' then
    return null;
  end if;
  v_locale := coalesce(master.fn_normalize_locale_code(p_locale), 'en');

  v_name := master.fn_label_fallback_name(v_entity, v_code, v_locale);
  if v_name is not null then return v_name; end if;

  -- 'en' fallback
  v_lang := split_part(v_locale, '-', 1);
  if v_lang <> 'en' then
    select name into v_name from master.label
     where entity = v_entity and code = v_code and locale_code = 'en'
       and status = 'active';
    if v_name is not null then return v_name; end if;
  end if;

  -- base table fallback (registry-driven)
  select source_schema, source_table, pk_column, name_column
    into v_schema, v_table, v_pk_col, v_nm_col
    from master.label_entity_type
   where entity = v_entity;

  if v_schema is not null then
    execute format(
      'select coalesce(%I::text, $1) from %I.%I where %I::text = $1 limit 1',
      v_nm_col, v_schema, v_table, v_pk_col
    ) into v_name using v_code;
  end if;

  return v_name;
end;
$function$;

CREATE OR REPLACE FUNCTION master.fn_guard_mesh_network_provider()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    IF OLD.code = 'athyper_mesh' THEN
        RAISE EXCEPTION 'athyper_mesh provider is Mesh-owned; mutate via Mesh API';
    END IF;

    IF TG_OP = 'UPDATE' AND NEW.code = 'athyper_mesh' THEN
        RAISE EXCEPTION 'athyper_mesh provider is Mesh-owned; mutate via Mesh API';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION master.fn_ictp_profile_gate()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    IF NEW.status = 'active' AND NEW.counterparty_supplier_profile_id IS NULL THEN
        RAISE EXCEPTION
            'intercompany_trading_pair (%) cannot be set to active: '
            'counterparty_supplier_profile_id IS NULL. '
            'Create the company_code_supplier_profile for the counterparty first.',
            NEW.id;
    END IF;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION master.fn_is_atlas_conversation(p_tenant_id uuid, p_conversation_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'master'
 SET row_security TO 'off'
AS $function$
    SELECT EXISTS (
        SELECT 1
          FROM master.conversation AS c
         WHERE c.tenant_id = p_tenant_id
           AND c.id = p_conversation_id
           AND c.type = 'atlas_agent'
    );
$function$;

COMMENT ON FUNCTION "master".fn_is_atlas_conversation(p_tenant_id uuid, p_conversation_id uuid) IS 'RLS recursion-safe discriminator. Returns no conversation data.';

CREATE OR REPLACE FUNCTION master.fn_label_fallback_name(p_entity text, p_code text, p_locale text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'master'
AS $function$
declare
  v_name   text;
  v_parts  text[];
  v_lang   text;
  v_script text;
  v_candidates text[];
begin
  v_candidates := ARRAY[p_locale];

  if p_locale ~ '-' then
    v_parts := string_to_array(p_locale, '-');
    v_lang  := v_parts[1];
    if array_length(v_parts, 1) >= 2 and v_parts[2] ~ '^[A-Z][a-z]{3}$' then
      v_script := v_parts[2];
    end if;

    if v_script is not null and array_length(v_parts, 1) >= 3 then
      v_candidates := v_candidates || (v_lang || '-' || v_script);
    end if;

    v_candidates := v_candidates || v_lang;
  end if;

  select name into v_name
    from master.label
   where entity = p_entity
     and code = p_code
     and status = 'active'
     and locale_code = any(v_candidates)
   order by array_position(v_candidates, locale_code)
   limit 1;

  return v_name;
end;
$function$;

CREATE OR REPLACE FUNCTION master.fn_le_hierarchy_sync()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_ancestor   uuid;
    v_parent_path text;
    v_parent_level smallint;
BEGIN
    IF NEW.parent_entity_id IS NULL THEN
        NEW.level_no := 1;
        NEW.path     := '/' || NEW.id::text;
        RETURN NEW;
    END IF;

    -- Cycle detection: walk the ancestor chain of the proposed parent.
    v_ancestor := NEW.parent_entity_id;
    WHILE v_ancestor IS NOT NULL LOOP
        IF v_ancestor = NEW.id THEN
            RAISE EXCEPTION
                'Cycle detected in legal_entity hierarchy: entity % would become '
                'its own ancestor via parent %.',
                NEW.id, NEW.parent_entity_id;
        END IF;
        SELECT parent_entity_id INTO v_ancestor
        FROM master.legal_entity
        WHERE tenant_id = NEW.tenant_id AND id = v_ancestor;
    END LOOP;

    -- Compute level and path from parent.
    SELECT level_no, path INTO v_parent_level, v_parent_path
    FROM master.legal_entity
    WHERE tenant_id = NEW.tenant_id AND id = NEW.parent_entity_id;

    NEW.level_no := COALESCE(v_parent_level, 0) + 1;
    NEW.path     := COALESCE(v_parent_path, '') || '/' || NEW.id::text;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION master.fn_load_address_candidates(p_tenant_id uuid, p_owner_type text, p_owner_id uuid, p_purposes text[])
 RETURNS TABLE(address_id uuid, purpose text, is_primary boolean, code text, name text, line1 text, city text, region text, country_code text, formatted_address text, tax_jurisdiction_id uuid, jurisdiction_name text, jurisdiction_code text)
 LANGUAGE sql
 STABLE PARALLEL SAFE
 SET search_path TO 'master', 'pg_catalog'
AS $function$
    SELECT
        al.address_id,
        al.purpose,
        al.is_primary,
        a.code,
        a.name,
        a.line1,
        a.city,
        a.region,
        a.country_code,
        a.formatted_address,
        a.tax_jurisdiction_id,
        tj.name AS jurisdiction_name,
        tj.code AS jurisdiction_code
    FROM master.address_link al
    JOIN master.address a
      ON a.id = al.address_id AND a.tenant_id = al.tenant_id
    LEFT JOIN master.tax_jurisdiction tj
      ON tj.id = a.tax_jurisdiction_id AND tj.tenant_id = a.tenant_id
   WHERE al.tenant_id  = p_tenant_id
     AND al.owner_type = p_owner_type
     AND al.owner_id   = p_owner_id
     AND al.purpose    = ANY(p_purposes)
     AND al.effective_from <= CURRENT_DATE
     AND (al.effective_until IS NULL OR al.effective_until > CURRENT_DATE)
     AND a.status      = 'active'
   ORDER BY array_position(p_purposes, al.purpose),
            al.is_primary DESC NULLS LAST,
            a.line1;
$function$;

COMMENT ON FUNCTION "master".fn_load_address_candidates(p_tenant_id uuid, p_owner_type text, p_owner_id uuid, p_purposes text[]) IS 'Returns active addresses linked to (owner_type, owner_id) with matching purposes. Result ordered by purpose precedence (per p_purposes array order) then is_primary. Used by the AddressPicker UI component (Phase 4).';

CREATE OR REPLACE FUNCTION master.fn_localized_name(p_entity text, p_code text, p_locale text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'master'
AS $function$
declare
  v_entity text;
  v_code   text;
  v_locale text;
begin
  v_entity := btrim(p_entity);
  v_code   := btrim(p_code);
  if v_entity is null or v_entity = '' or v_code is null or v_code = '' then
    return null;
  end if;
  v_locale := master.fn_normalize_locale_code(p_locale);
  if v_locale is null then return null; end if;

  return master.fn_label_fallback_name(v_entity, v_code, v_locale);
end;
$function$;

CREATE OR REPLACE FUNCTION master.fn_lookup_tenant_for_auth(p_realm_key text, p_code text)
 RETURNS TABLE(id uuid, status text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'master', 'pg_catalog'
AS $function$
    SELECT t.id, t.status
    FROM master.tenant t
    WHERE t.realm_key = p_realm_key
      AND t.code      = p_code
    LIMIT 1;
$function$;

COMMENT ON FUNCTION "master".fn_lookup_tenant_for_auth(p_realm_key text, p_code text) IS 'Auth bootstrap lookup — returns only id + status. Caller: auth middleware before SET app.current_tenant_id. SECURITY DEFINER by design. Callable by: athyperapp.';

CREATE OR REPLACE FUNCTION master.fn_migrate_principal_identity_bindings(p_dry_run boolean DEFAULT true)
 RETURNS TABLE(migrated_count bigint, skipped_count bigint, error_count bigint)
 LANGUAGE plpgsql
 SET search_path TO 'master'
AS $function$
DECLARE
    v_migrated bigint := 0;
    v_skipped  bigint := 0;
BEGIN
    IF p_dry_run THEN
        SELECT count(*) INTO v_migrated
        FROM master.principal_profile pp
        WHERE pp.keycloak_id IS NOT NULL
          AND NOT EXISTS (
              SELECT 1 FROM master.principal_identity_binding pab
              JOIN master.tenant t ON t.id = pab.tenant_id
              WHERE pab.tenant_id = pp.tenant_id
                AND pab.principal_id = pp.principal_id
                AND pab.realm_key = t.realm_key
                AND pab.provider_code = 'keycloak'
          );

        SELECT count(*) INTO v_skipped
        FROM master.principal_profile pp
        WHERE pp.keycloak_id IS NOT NULL
          AND EXISTS (
              SELECT 1 FROM master.principal_identity_binding pab
              JOIN master.tenant t ON t.id = pab.tenant_id
              WHERE pab.tenant_id = pp.tenant_id
                AND pab.principal_id = pp.principal_id
                AND pab.realm_key = t.realm_key
                AND pab.provider_code = 'keycloak'
          );

        RETURN QUERY SELECT v_migrated, v_skipped, 0::bigint;
        RETURN;
    END IF;

    WITH inserted AS (
        INSERT INTO master.principal_identity_binding (
            tenant_id, principal_id, realm_key, provider_code, subject_id,
            username, federation_link, created_at_millis, not_before,
            service_client_id, required_actions,
            synced_at, sync_status,
            idp_snapshot, provider_attributes,
            created_by
        )
        SELECT
            pp.tenant_id,
            pp.principal_id,
            t.realm_key,
            'keycloak',
            pp.keycloak_id,
            pp.keycloak_username,
            pp.keycloak_federation_link,
            pp.keycloak_created_at_millis,
            pp.keycloak_not_before,
            pp.keycloak_service_client_id,
            pp.keycloak_required_actions,
            pp.keycloak_synced_at,
            pp.keycloak_sync_status,
            pp.idp_snapshot,
            pp.attributes,
            pp.created_by
        FROM master.principal_profile pp
        JOIN master.tenant t ON t.id = pp.tenant_id
        WHERE pp.keycloak_id IS NOT NULL
        ON CONFLICT (tenant_id, principal_id, realm_key, provider_code) DO NOTHING
        RETURNING 1
    )
    SELECT count(*) INTO v_migrated FROM inserted;

    RETURN QUERY SELECT v_migrated, 0::bigint, 0::bigint;
END;
$function$;

COMMENT ON FUNCTION "master".fn_migrate_principal_identity_bindings(p_dry_run boolean) IS 'Phase 4 migration: copies keycloak_* and idp_snapshot from principal_profile into principal_identity_binding. Pass p_dry_run=true for impact analysis.';

CREATE OR REPLACE FUNCTION master.fn_network_connect_validation()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- Remote peer references required for platform network connections.
    IF NEW.provider_code = 'athyper_network'
       AND NEW.connection_status = 'connected' THEN
        IF NEW.remote_tenant_id IS NULL THEN
            RAISE EXCEPTION
                'athyper_network connection_status=''connected'' requires '
                'remote_tenant_id to be set.';
        END IF;
        IF NEW.remote_business_partner_id IS NULL THEN
            RAISE EXCEPTION
                'athyper_network connection_status=''connected'' requires '
                'remote_business_partner_id to be set.';
        END IF;
    END IF;

    -- Clear pending invitation token once connection is resolved.
    IF NEW.connection_status IN ('connected', 'suspended') THEN
        NEW.invitation_token      := NULL;
        NEW.invitation_expires_at := NULL;
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION master.fn_normalize_locale_code(p_locale text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
    SELECT shared.normalize_locale_code(p_locale);
$function$;

CREATE OR REPLACE FUNCTION master.fn_ownership_pct_aggregate_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_existing_total numeric;
BEGIN
    IF NEW.relation_type NOT IN ('shareholder', 'ubo') THEN
        RETURN NEW;
    END IF;
    IF NEW.ownership_pct IS NULL THEN
        RETURN NEW;
    END IF;

    -- Sum all OTHER active rows for the same (party, relation_type).
    SELECT COALESCE(SUM(ownership_pct), 0) INTO v_existing_total
    FROM master.party_governance_relation
    WHERE tenant_id    = NEW.tenant_id
      AND party_type   = NEW.party_type
      AND party_id     = NEW.party_id
      AND relation_type = NEW.relation_type
      AND is_active    = true
      AND id           IS DISTINCT FROM NEW.id;  -- exclude self on UPDATE

    IF v_existing_total + NEW.ownership_pct > 100 THEN
        RAISE EXCEPTION
            'Total % ownership_pct for party % (%) would exceed 100%% '
            '(existing: %, adding: %)',
            NEW.relation_type, NEW.party_id, NEW.party_type,
            v_existing_total, NEW.ownership_pct;
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION master.fn_rebuild_hierarchy_paths(p_tenant_id uuid, p_table_schema text, p_table_name text, p_scope_column text DEFAULT NULL::text, p_scope_value uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'master'
AS $function$
DECLARE
    v_updated   integer;
    v_parent    text;
    v_scope_sql text := '';
BEGIN
    v_parent := CASE p_table_name
        WHEN 'site'         THEN 'parent_site_id'
        WHEN 'project'      THEN 'parent_project_id'
        WHEN 'project_item' THEN 'parent_item_id'
        ELSE 'parent_id'
    END;
    IF p_scope_column IS NOT NULL AND p_scope_value IS NOT NULL THEN
        v_scope_sql := format(' AND %I = %L', p_scope_column, p_scope_value);
    END IF;
    EXECUTE format('
        WITH RECURSIVE tree AS (
            SELECT id, code, code::text AS cp, 1 AS cl
            FROM %I.%I
            WHERE tenant_id = $1 AND %I IS NULL %s
            UNION ALL
            SELECT c.id, c.code, tree.cp || ''/'' || c.code, tree.cl + 1
            FROM %I.%I c
            JOIN tree ON tree.id = c.%I
            WHERE c.tenant_id = $1 %s
        )
        UPDATE %I.%I t
        SET path = tree.cp, level_no = tree.cl
        FROM tree
        WHERE t.id = tree.id
          AND (t.path IS DISTINCT FROM tree.cp
               OR t.level_no IS DISTINCT FROM tree.cl)
    ', p_table_schema, p_table_name, v_parent, v_scope_sql,
       p_table_schema, p_table_name, v_parent, v_scope_sql,
       p_table_schema, p_table_name)
    USING p_tenant_id;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RETURN v_updated;
END;
$function$;

COMMENT ON FUNCTION "master".fn_rebuild_hierarchy_paths(p_tenant_id uuid, p_table_schema text, p_table_name text, p_scope_column text, p_scope_value uuid) IS 'Rebuilds path + level_no for hierarchical finance tables using recursive CTE. Optional scope filter (e.g. company_code_id) for partial rebuild.';

CREATE OR REPLACE FUNCTION master.fn_refresh_mv_cpa()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'master', 'pg_catalog'
AS $function$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY master.mv_company_postable_account;
END;
$function$;

COMMENT ON FUNCTION "master".fn_refresh_mv_cpa() IS 'Refreshes mv_company_postable_account concurrently. Call from AFTER triggers on ccca/gl_account/ccga or via pg_cron.';

CREATE OR REPLACE FUNCTION master.fn_register_tenant(p_code text, p_name text, p_display_name text, p_realm_key text, p_region text, p_subscription text, p_admin_email text, p_admin_given_name text, p_admin_family_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'master', 'pg_catalog'
AS $function$
DECLARE
    v_tenant_id    uuid := shared.uuidv7();
    v_principal_id uuid := shared.uuidv7();
    v_systemadmin  uuid := '00000000-0000-0000-0000-000000000000';
BEGIN
    IF p_code !~ '^[a-z][a-z0-9_-]{1,62}$' THEN
        RAISE EXCEPTION 'Invalid tenant code format: %', p_code
            USING ERRCODE = 'invalid_parameter_value';
    END IF;
    IF btrim(p_name) = '' THEN
        RAISE EXCEPTION 'Tenant name cannot be empty'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;
    IF btrim(p_display_name) = '' THEN
        RAISE EXCEPTION 'Tenant display name cannot be empty'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;
    IF p_admin_email IS NULL OR btrim(p_admin_email) = '' THEN
        RAISE EXCEPTION 'Admin email is required'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;
    IF p_admin_email <> lower(trim(p_admin_email)) THEN
        RAISE EXCEPTION 'Admin email must be lowercase and trimmed'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;
    IF p_admin_email NOT LIKE '%@%' THEN
        RAISE EXCEPTION 'Admin email must contain @: %', p_admin_email
            USING ERRCODE = 'invalid_parameter_value';
    END IF;
    IF nullif(btrim(coalesce(p_admin_given_name, '')), '') IS NULL
       AND nullif(btrim(coalesce(p_admin_family_name, '')), '') IS NULL THEN
        RAISE EXCEPTION 'At least one of admin given_name or family_name is required'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    -- Insert tenant — rely on UNIQUE constraint, not TOCTOU-prone IF EXISTS check
    BEGIN
        INSERT INTO master.tenant (
            id, code, name, display_name, realm_key,
            region, subscription, status, created_by
        ) VALUES (
            v_tenant_id, p_code, p_name, p_display_name, p_realm_key,
            p_region, p_subscription, 'provisioning', v_systemadmin
        );
    EXCEPTION WHEN unique_violation THEN
        RAISE EXCEPTION 'Tenant code "%" is already taken in realm "%"',
            p_code, p_realm_key
            USING ERRCODE = 'unique_violation';
    END;

    -- Create seed admin principal (core identity only)
    INSERT INTO master.principal (
        id, tenant_id, code, name, principal_type, status, created_by
    ) VALUES (
        v_principal_id, v_tenant_id, 'admin',
        concat_ws(' ', nullif(btrim(p_admin_given_name), ''), nullif(btrim(p_admin_family_name), '')),
        'user', 'active', v_systemadmin
    );

    -- Create principal profile (display names + Keycloak sync pending)
    INSERT INTO master.principal_profile (
        id, tenant_id, principal_id,
        given_name, family_name,
        keycloak_sync_status, created_by
    ) VALUES (
        shared.uuidv7(), v_tenant_id, v_principal_id,
        p_admin_given_name, p_admin_family_name,
        'pending', v_systemadmin
    );

    -- Create login email contact point (unverified — triggers verification flow)
    INSERT INTO master.contact_link (
        id, tenant_id, owner_type, owner_id,
        channel_type, value, purpose,
        is_primary, is_verified, status, created_by
    ) VALUES (
        shared.uuidv7(), v_tenant_id, 'principal', v_principal_id,
        'email', lower(trim(p_admin_email)), 'login',
        true, false, 'active', v_systemadmin
    );

    RETURN jsonb_build_object(
        'tenant_id',    v_tenant_id,
        'principal_id', v_principal_id
    );
END;
$function$;

COMMENT ON FUNCTION "master".fn_register_tenant(p_code text, p_name text, p_display_name text, p_realm_key text, p_region text, p_subscription text, p_admin_email text, p_admin_given_name text, p_admin_family_name text) IS 'Public self-registration entry point. SECURITY DEFINER — callable without session. Creates tenant (provisioning) + seed admin principal + login contact atomically. Owner must be athyperadmin for admin_write RLS to apply. Callable by: athyperapp.';

CREATE OR REPLACE FUNCTION master.fn_require_tenant_session(p_tenant_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'master', 'pg_catalog'
AS $function$
DECLARE
    v_session uuid := shared.current_tenant_id_soft();
BEGIN
    IF v_session IS NULL THEN
        RAISE EXCEPTION
            'Tenant session required: app.current_tenant_id is not set. '
            'Middleware must SET app.current_tenant_id before calling tenant-scoped functions.'
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF p_tenant_id <> v_session THEN
        RAISE EXCEPTION
            'Operation on tenant % not permitted from session tenant %',
            p_tenant_id, v_session
            USING ERRCODE = 'insufficient_privilege';
    END IF;
END;
$function$;

COMMENT ON FUNCTION "master".fn_require_tenant_session(p_tenant_id uuid) IS 'Strict tenant guard: raises if app.current_tenant_id is absent or mismatched. Must be used by all tenant-scoped SECURITY DEFINER service functions.';

CREATE OR REPLACE FUNCTION master.fn_resolve_address(p_tenant_id uuid, p_owner_type text, p_owner_id uuid, p_purpose text DEFAULT 'default'::text)
 RETURNS TABLE(address_id uuid, purpose_matched text, is_fallback boolean)
 LANGUAGE sql
 STABLE PARALLEL SAFE
 SET search_path TO 'master'
AS $function$
    -- Tie-break columns (is_primary, effective_from) must live in the UNION ALL
    -- output for ORDER BY to reference them; outer SELECT trims back to the
    -- RETURNS TABLE signature.
    SELECT contact_link_addr_id, purpose_matched, is_fallback
    FROM (
        -- 1. Exact purpose match
        SELECT
            al.address_id     AS contact_link_addr_id,
            al.purpose        AS purpose_matched,
            false             AS is_fallback,
            al.is_primary,
            al.effective_from
        FROM master.address_link al
        WHERE al.tenant_id      = p_tenant_id
          AND al.owner_type     = p_owner_type
          AND al.owner_id       = p_owner_id
          AND al.purpose        = p_purpose
          AND al.is_primary     = true
          AND al.effective_from <= CURRENT_DATE
          AND (al.effective_until IS NULL OR al.effective_until > CURRENT_DATE)

        UNION ALL

        -- 2. Default fallback (only fires when p_purpose is not already 'default')
        SELECT
            al.address_id,
            'default'         AS purpose_matched,
            true              AS is_fallback,
            al.is_primary,
            al.effective_from
        FROM master.address_link al
        WHERE p_purpose         <> 'default'
          AND al.tenant_id      = p_tenant_id
          AND al.owner_type     = p_owner_type
          AND al.owner_id       = p_owner_id
          AND al.purpose        = 'default'
          AND al.is_primary     = true
          AND al.effective_from <= CURRENT_DATE
          AND (al.effective_until IS NULL OR al.effective_until > CURRENT_DATE)
    ) candidates
    -- Deterministic tie-breakers (defensive in case primary uniqueness is breached)
    ORDER BY
        is_fallback,                      -- exact (false) before fallback (true)
        is_primary     DESC NULLS LAST,
        effective_from DESC NULLS LAST,   -- recency proxy (address_link has no updated_at on hot path)
        contact_link_addr_id
    LIMIT 1;
$function$;

COMMENT ON FUNCTION "master".fn_resolve_address(p_tenant_id uuid, p_owner_type text, p_owner_id uuid, p_purpose text) IS 'Resolves the active primary address for owner + purpose. Chain: exact purpose match → purpose=''default'' fallback → NULL. Deterministic tie-breakers: is_fallback, is_primary DESC, effective_from DESC, address_id. Returns (address_id, purpose_matched, is_fallback).';

CREATE OR REPLACE FUNCTION master.fn_resolve_bank_account(p_tenant_id uuid, p_owner_type text, p_owner_id uuid, p_role text DEFAULT 'default'::text)
 RETURNS TABLE(bank_account_id uuid, bank_account_link_id uuid, purpose_matched text, is_fallback boolean)
 LANGUAGE sql
 STABLE PARALLEL SAFE
 SET search_path TO 'master'
AS $function$
    -- Tie-break columns (is_primary, effective_from) live in the UNION ALL
    -- output so the outer ORDER BY can reference them; outer SELECT trims to
    -- the RETURNS TABLE signature.
    SELECT bank_account_id, bank_account_link_id, purpose_matched, is_fallback
    FROM (
        -- 1. Exact translated-purpose match
        SELECT
            bal.bank_account_id,
            bal.id              AS bank_account_link_id,
            bal.purpose         AS purpose_matched,
            false               AS is_fallback,
            bal.is_primary,
            bal.effective_from
        FROM master.bank_account_link bal
        WHERE bal.tenant_id      = p_tenant_id
          AND bal.owner_type     = p_owner_type
          AND bal.owner_id       = p_owner_id
          AND bal.purpose        = CASE p_role
                                     WHEN 'remit_to'      THEN 'disbursement'
                                     WHEN 'collection_to' THEN 'collection'
                                     WHEN 'house_bank'    THEN 'default'
                                     ELSE 'default'
                                   END
          AND bal.is_primary     = true
          AND bal.effective_from <= CURRENT_DATE
          AND (bal.effective_until IS NULL OR bal.effective_until > CURRENT_DATE)

        UNION ALL

        -- 2. Default fallback — only fires if translated purpose is not already 'default'
        SELECT
            bal.bank_account_id,
            bal.id,
            'default'           AS purpose_matched,
            true                AS is_fallback,
            bal.is_primary,
            bal.effective_from
        FROM master.bank_account_link bal
        WHERE CASE p_role
                WHEN 'remit_to'      THEN 'disbursement'
                WHEN 'collection_to' THEN 'collection'
                WHEN 'house_bank'    THEN 'default'
                ELSE 'default'
              END <> 'default'
          AND bal.tenant_id      = p_tenant_id
          AND bal.owner_type     = p_owner_type
          AND bal.owner_id       = p_owner_id
          AND bal.purpose        = 'default'
          AND bal.is_primary     = true
          AND bal.effective_from <= CURRENT_DATE
          AND (bal.effective_until IS NULL OR bal.effective_until > CURRENT_DATE)
    ) candidates
    ORDER BY
        is_fallback,
        is_primary     DESC NULLS LAST,
        effective_from DESC NULLS LAST,
        bank_account_id
    LIMIT 1;
$function$;

COMMENT ON FUNCTION "master".fn_resolve_bank_account(p_tenant_id uuid, p_owner_type text, p_owner_id uuid, p_role text) IS 'Resolves the active primary bank account for owner + document-side role. Role→purpose translation: remit_to→disbursement, collection_to→collection, house_bank/default→default. Chain: exact translated purpose → ''default'' fallback → NULL. Deterministic tie-breakers: is_fallback, is_primary DESC, effective_from DESC, id. Returns (bank_account_id, bank_account_link_id, purpose_matched, is_fallback).';

CREATE OR REPLACE FUNCTION master.fn_resolve_commodity_category_defaults(p_tenant_id uuid, p_commodity_category_id uuid, p_company_code_id uuid)
 RETURNS TABLE(resolved_gl_account_id uuid, resolved_tax_group_id uuid, resolved_intent_id uuid, resolved_asset_class_id uuid, resolved_capex_threshold numeric, resolved_capex_currency character, resolved_asset_tagging_required boolean, resolved_visibility text, resolved_classification_required boolean, resolved_hs_required boolean, resolved_is_regulated boolean, resolved_mapping_mode text, source_company_code_id uuid)
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
    v_row    record;
    v_found  boolean := false;
BEGIN
    -- Direct lookup: prefer the company-scoped default row, then tenant default.
    SELECT * INTO v_row
    FROM control.commodity_category_buy_policy m
    WHERE m.tenant_id = p_tenant_id
      AND m.commodity_category_id = p_commodity_category_id
      AND m.mapping_mode = 'ALLOW'
      AND m.is_default = true
      AND m.is_active = true
      AND m.effective_from <= CURRENT_DATE
      AND (m.effective_to IS NULL OR m.effective_to >= CURRENT_DATE)
      AND (
          (m.scope_type = 'COMPANY'
           AND m.company_code_id = p_company_code_id
           AND m.scope_id = p_company_code_id)
          OR m.scope_type = 'TENANT'
      )
    ORDER BY
      CASE WHEN m.scope_type = 'COMPANY' THEN 0 ELSE 1 END,
      m.effective_from DESC,
      m.sort_order,
      m.created_at DESC
    LIMIT 1;

    v_found := FOUND;

    -- Merge with commodity_category base defaults for NULL columns. GL and asset
    -- defaults are company-aware through the resolved intent/policy.
    RETURN QUERY
    WITH base AS (
        SELECT
            cc.*,
            v_row.business_intent_id AS resolved_intent_id
        FROM master.commodity_category cc
        WHERE cc.id = p_commodity_category_id
          AND cc.tenant_id = p_tenant_id
    ),
    policy_gl AS (
        SELECT ga.id AS gl_account_id
        FROM master.gl_account ga
        JOIN master.company_code_chart_assignment cca
          ON cca.tenant_id = ga.tenant_id
         AND cca.chart_of_account_id = ga.chart_of_account_id
         AND cca.company_code_id = p_company_code_id
         AND cca.assignment_type = 'operating'
         AND cca.status = 'active'
         AND cca.effective_from <= CURRENT_DATE
         AND (cca.effective_to IS NULL OR cca.effective_to >= CURRENT_DATE)
        WHERE ga.tenant_id = p_tenant_id
          AND ga.id = v_row.default_gl_account_id
          AND ga.is_active = true
          AND ga.node_type = 'posting'
          AND COALESCE((ga.metadata->>'_journal_postable')::boolean, true) = true
        ORDER BY cca.is_primary DESC, cca.effective_from DESC
        LIMIT 1
    )
    SELECT
        COALESCE(policy_gl.gl_account_id,
                 master.fn_resolve_intent_default_gl_account(
                     p_tenant_id,
                     base.resolved_intent_id,
                     p_company_code_id
                 )),
        v_row.default_tax_group_id,
        base.resolved_intent_id,
        v_row.default_asset_class_id,
        v_row.capex_screening_threshold,
        v_row.capex_screening_currency,
        v_row.is_asset_tag_required,
        v_row.override_visibility,
        COALESCE(v_row.override_is_classification_required, base.is_classification_required),
        COALESCE(v_row.override_is_hs_required,          base.is_hs_required),
        COALESCE(v_row.override_is_regulated,            base.is_regulated),
        COALESCE(v_row.mapping_mode, 'ALLOW'),
        CASE WHEN v_found THEN p_company_code_id ELSE NULL END
    FROM base
    LEFT JOIN policy_gl ON true;
END;
$function$;

COMMENT ON FUNCTION "master".fn_resolve_commodity_category_defaults(p_tenant_id uuid, p_commodity_category_id uuid, p_company_code_id uuid) IS 'Resolves effective operational defaults for a commodity category within a company code. Looks up control.commodity_category_buy_policy default ALLOW rows for company or tenant scope. Governance columns (visibility, classification_required, hs_required, is_regulated) fall back to commodity_category base if no company-code policy exists. source_company_code_id is NULL when falling back entirely to base defaults.';

CREATE OR REPLACE FUNCTION master.fn_resolve_contact(p_tenant_id uuid, p_owner_type text, p_owner_id uuid, p_purpose text DEFAULT 'default'::text, p_channel_type text DEFAULT 'email'::text, p_qualifier text DEFAULT NULL::text)
 RETURNS TABLE(contact_link_id uuid, value text, purpose_matched text, qualifier_matched text, is_fallback boolean)
 LANGUAGE sql
 STABLE PARALLEL SAFE
 SET search_path TO 'master'
AS $function$
    -- Tie-break columns (is_primary, updated_at) must live in the UNION ALL
    -- output for ORDER BY to reference them; outer SELECT trims back to the
    -- RETURNS TABLE signature.
    SELECT contact_link_id, value, purpose_matched, qualifier_matched, is_fallback
    FROM (
        -- 1. Exact (purpose + qualifier + channel) — preferred
        SELECT
            cl.id              AS contact_link_id,
            cl.value,
            cl.purpose         AS purpose_matched,
            cl.role_qualifier  AS qualifier_matched,
            false              AS is_fallback,
            cl.is_primary,
            cl.updated_at
        FROM master.contact_link cl
        WHERE cl.tenant_id      = p_tenant_id
          AND cl.owner_type     = p_owner_type
          AND cl.owner_id       = p_owner_id
          AND cl.purpose        = p_purpose
          AND cl.channel_type   = p_channel_type
          AND (cl.role_qualifier IS NOT DISTINCT FROM p_qualifier)
          AND cl.is_primary     = true
          AND cl.status         = 'active'

        UNION ALL

        -- 2. Default fallback (only fires when p_purpose is not already 'default')
        SELECT
            cl.id,
            cl.value,
            'default'          AS purpose_matched,
            NULL::text         AS qualifier_matched,
            true               AS is_fallback,
            cl.is_primary,
            cl.updated_at
        FROM master.contact_link cl
        WHERE p_purpose         <> 'default'
          AND cl.tenant_id      = p_tenant_id
          AND cl.owner_type     = p_owner_type
          AND cl.owner_id       = p_owner_id
          AND cl.purpose        = 'default'
          AND cl.channel_type   = p_channel_type
          AND cl.role_qualifier IS NULL
          AND cl.is_primary     = true
          AND cl.status         = 'active'
    ) candidates
    -- Deterministic tie-breakers (defensive in case primary uniqueness is breached)
    ORDER BY
        is_fallback,
        is_primary DESC NULLS LAST,
        updated_at DESC NULLS LAST,
        contact_link_id
    LIMIT 1;
$function$;

COMMENT ON FUNCTION "master".fn_resolve_contact(p_tenant_id uuid, p_owner_type text, p_owner_id uuid, p_purpose text, p_channel_type text, p_qualifier text) IS 'Resolves the active primary contact for owner + role + channel. Chain: exact (purpose+qualifier) → purpose=''default'' fallback → NULL. Deterministic tie-breakers: is_fallback, is_primary DESC, updated_at DESC, id. Returns (contact_link_id, value, purpose_matched, qualifier_matched, is_fallback).';

CREATE OR REPLACE FUNCTION master.fn_resolve_default_address(p_tenant_id uuid, p_owner_walk jsonb, p_purposes text[])
 RETURNS TABLE(address_id uuid, tax_jurisdiction_id uuid, owner_type text, owner_id uuid, purpose text)
 LANGUAGE plpgsql
 STABLE PARALLEL SAFE
 SET search_path TO 'master', 'pg_catalog'
AS $function$
DECLARE
    v_step    jsonb;
    v_otype   text;
    v_oid     uuid;
    v_purpose text;
BEGIN
    FOR v_step IN SELECT * FROM jsonb_array_elements(p_owner_walk) LOOP
        v_otype := v_step->>'owner_type';
        v_oid   := (v_step->>'owner_id')::uuid;
        IF v_otype IS NULL OR v_oid IS NULL THEN CONTINUE; END IF;

        FOREACH v_purpose IN ARRAY p_purposes LOOP
            RETURN QUERY
            SELECT
                al.address_id,
                a.tax_jurisdiction_id,
                al.owner_type,
                al.owner_id,
                al.purpose
              FROM master.address_link al
              JOIN master.address a
                ON a.id = al.address_id AND a.tenant_id = al.tenant_id
             WHERE al.tenant_id  = p_tenant_id
               AND al.owner_type = v_otype
               AND al.owner_id   = v_oid
               AND al.purpose    = v_purpose
               AND al.effective_from <= CURRENT_DATE
               AND (al.effective_until IS NULL OR al.effective_until > CURRENT_DATE)
               AND a.status      = 'active'
             ORDER BY al.is_primary DESC NULLS LAST,
                      al.effective_from DESC NULLS LAST,
                      al.created_at DESC
             LIMIT 1;
            IF FOUND THEN RETURN; END IF;
        END LOOP;
    END LOOP;
END $function$;

COMMENT ON FUNCTION "master".fn_resolve_default_address(p_tenant_id uuid, p_owner_walk jsonb, p_purposes text[]) IS 'Walks owner_walk (jsonb array of owner_type/owner_id) cross purpose chain. Returns first matching address_link with derived jurisdiction. Used by AddressPicker mount-time default and snapshot stamping at document save.';

CREATE OR REPLACE FUNCTION master.fn_resolve_identity(p_tenant_id uuid, p_owner_type text, p_owner_id uuid, p_role text DEFAULT 'default'::text, p_qualifier text DEFAULT NULL::text)
 RETURNS TABLE(address_id uuid, address_link_id uuid, address_line1 text, address_city text, address_region text, address_postal text, address_country text, address_formatted text, address_present boolean, is_address_fallback boolean, email text, email_link_id uuid, email_qualifier text, email_present boolean, is_email_fallback boolean, phone text, phone_link_id uuid, phone_qualifier text, phone_present boolean, is_phone_fallback boolean)
 LANGUAGE sql
 STABLE PARALLEL SAFE
 SET search_path TO 'master'
AS $function$
    SELECT
        ra.address_id,
        NULL::uuid                        AS address_link_id,
        a.line1, a.city, a.region, a.postal_code, a.country_code, a.formatted_address,
        (ra.address_id IS NOT NULL)       AS address_present,
        COALESCE(ra.is_fallback, false)   AS is_address_fallback,

        re.value, re.contact_link_id, re.qualifier_matched,
        (re.contact_link_id IS NOT NULL)  AS email_present,
        COALESCE(re.is_fallback, false)   AS is_email_fallback,

        rp.value, rp.contact_link_id, rp.qualifier_matched,
        (rp.contact_link_id IS NOT NULL)  AS phone_present,
        COALESCE(rp.is_fallback, false)   AS is_phone_fallback
    FROM (SELECT 1 AS dummy) seed
    -- Address resolver — does not currently consume role_qualifier
    LEFT JOIN LATERAL master.fn_resolve_address(
        p_tenant_id, p_owner_type, p_owner_id, p_role
    ) ra ON true
    LEFT JOIN master.address a
        ON  a.tenant_id = p_tenant_id
        AND a.id        = ra.address_id
    -- Email contact for the same role + qualifier
    LEFT JOIN LATERAL master.fn_resolve_contact(
        p_tenant_id, p_owner_type, p_owner_id, p_role, 'email', p_qualifier
    ) re ON true
    -- Phone contact for the same role + qualifier
    LEFT JOIN LATERAL master.fn_resolve_contact(
        p_tenant_id, p_owner_type, p_owner_id, p_role, 'phone', p_qualifier
    ) rp ON true;
$function$;

COMMENT ON FUNCTION "master".fn_resolve_identity(p_tenant_id uuid, p_owner_type text, p_owner_id uuid, p_role text, p_qualifier text) IS 'Paired identity resolver — returns address + email + phone for one (owner, role) in a single call. Combines fn_resolve_address + fn_resolve_contact(email) + fn_resolve_contact(phone). Each component carries its own is_fallback flag. Use for "show me the bill-to identity for this BP" type queries — eliminates three round-trips. STABLE + PARALLEL SAFE.';

CREATE OR REPLACE FUNCTION master.fn_resolve_intent_default_gl_account(p_tenant_id uuid, p_intent_id uuid, p_company_code_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
    v_chart_id     uuid;
    v_chart_code   text;
    v_gl_id        uuid;
    v_ifrs_code    text;
    v_usgaap_code  text;
    v_group_map    text;
    v_target_code  text;
BEGIN
    IF p_tenant_id IS NULL OR p_intent_id IS NULL OR p_company_code_id IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT coa.id, coa.code
    INTO v_chart_id, v_chart_code
    FROM master.company_code_chart_assignment cca
    JOIN master.chart_of_account coa
      ON coa.tenant_id = cca.tenant_id
     AND coa.id = cca.chart_of_account_id
    WHERE cca.tenant_id = p_tenant_id
      AND cca.company_code_id = p_company_code_id
      AND cca.assignment_type = 'operating'
      AND cca.status = 'active'
      AND coa.is_active = true
      AND COALESCE((coa.metadata->>'_operating_coa')::boolean, true) = true
      AND COALESCE((coa.metadata->>'_reporting_taxonomy')::boolean, false) = false
      AND cca.effective_from <= CURRENT_DATE
      AND (cca.effective_to IS NULL OR cca.effective_to >= CURRENT_DATE)
    ORDER BY cca.is_primary DESC, cca.effective_from DESC
    LIMIT 1;

    IF v_chart_id IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT
        bi.metadata #>> '{_coa_defaults,ifrs_code}',
        bi.metadata #>> '{_coa_defaults,usgaap_code}',
        bi.metadata #>> '{_coa_defaults,group_map}'
    INTO v_ifrs_code, v_usgaap_code, v_group_map
    FROM master.business_intent bi
    WHERE bi.tenant_id = p_tenant_id
      AND bi.id = p_intent_id
      AND bi.is_active = true;

    v_target_code := CASE v_chart_code
        WHEN 'COA-GAAP' THEN v_usgaap_code
        WHEN 'COA-IFRS' THEN v_ifrs_code
        ELSE NULL
    END;

    IF v_target_code IS NOT NULL THEN
        SELECT ga.id
        INTO v_gl_id
        FROM master.gl_account ga
        WHERE ga.tenant_id = p_tenant_id
          AND ga.chart_of_account_id = v_chart_id
          AND ga.code = v_target_code
          AND ga.is_active = true
          AND ga.node_type = 'posting'
          AND COALESCE((ga.metadata->>'_journal_postable')::boolean, true) = true
        LIMIT 1;

        IF v_gl_id IS NOT NULL THEN
            RETURN v_gl_id;
        END IF;
    END IF;

    IF v_group_map IS NOT NULL THEN
        SELECT ga.id
        INTO v_gl_id
        FROM master.gl_account ga
        WHERE ga.tenant_id = p_tenant_id
          AND ga.chart_of_account_id = v_chart_id
          AND ga.metadata->>'_group_map' = v_group_map
          AND ga.is_active = true
          AND ga.node_type = 'posting'
          AND COALESCE((ga.metadata->>'_journal_postable')::boolean, true) = true
        ORDER BY ga.sort_order, ga.code
        LIMIT 1;

        IF v_gl_id IS NOT NULL THEN
            RETURN v_gl_id;
        END IF;
    END IF;

    RETURN NULL;
END;
$function$;

COMMENT ON FUNCTION "master".fn_resolve_intent_default_gl_account(p_tenant_id uuid, p_intent_id uuid, p_company_code_id uuid) IS 'Resolves optional business intent metadata GL mapping for a company code operating COA. Primary posting defaults live on commodity category buy/sell policy rows.';

CREATE OR REPLACE FUNCTION master.fn_resolve_le_subtree_companies(p_tenant_id uuid, p_legal_entity_id uuid)
 RETURNS TABLE(company_code_id uuid)
 LANGUAGE sql
 STABLE PARALLEL SAFE
 SET search_path TO 'master', 'pg_catalog'
AS $function$
    WITH RECURSIVE le_tree AS (
        SELECT le.id
        FROM master.legal_entity le
        WHERE le.id        = p_legal_entity_id
          AND le.tenant_id = p_tenant_id
          AND le.is_active = true
        UNION ALL
        SELECT child.id
        FROM master.legal_entity child
        INNER JOIN le_tree parent ON child.parent_entity_id = parent.id
        WHERE child.tenant_id = p_tenant_id
          AND child.is_active = true
    )
    SELECT cc.id
    FROM master.company_code cc
    INNER JOIN le_tree ON cc.legal_entity_id = le_tree.id
    WHERE cc.tenant_id = p_tenant_id
      AND cc.is_active = true;
$function$;

COMMENT ON FUNCTION "master".fn_resolve_le_subtree_companies(p_tenant_id uuid, p_legal_entity_id uuid) IS 'Resolves a legal_entity_id to all company_code_ids in its full descendant subtree. Recursive CTE walks master.legal_entity.parent_entity_id from the anchor LE down. Unlike fn_resolve_scope_companies(''legal_entity''), which returns only direct CCs, this walks the full tree. Used by resolve_allowed_companies().';

CREATE OR REPLACE FUNCTION master.fn_resolve_owner_jurisdiction(p_tenant_id uuid, p_owner_walk jsonb, p_purposes text[])
 RETURNS uuid
 LANGUAGE sql
 STABLE PARALLEL SAFE
 SET search_path TO 'master', 'pg_catalog'
AS $function$
    SELECT tax_jurisdiction_id
      FROM master.fn_resolve_default_address(p_tenant_id, p_owner_walk, p_purposes)
     LIMIT 1;
$function$;

COMMENT ON FUNCTION "master".fn_resolve_owner_jurisdiction(p_tenant_id uuid, p_owner_walk jsonb, p_purposes text[]) IS 'Returns the derived tax_jurisdiction_id only (convenience wrapper). Used by document services to snapshot ship-side jurisdictions on PI/PO/SI/SO lines.';

CREATE OR REPLACE FUNCTION master.fn_resolve_party_address(p_tenant_id uuid, p_owner_type text, p_owner_id uuid, p_purpose text DEFAULT 'default'::text)
 RETURNS TABLE(address_id uuid, purpose_matched text, source text, is_fallback boolean)
 LANGUAGE plpgsql
 STABLE PARALLEL SAFE
 SET search_path TO 'master', 'pg_catalog'
AS $function$
DECLARE
    v_bp_id uuid;
BEGIN
    -- Business partner roots expose one canonical default address.
    IF p_owner_type = 'business_partner' THEN
        RETURN QUERY
            SELECT al.address_id,
                   'default'::text,
                   'business_partner'::text,
                   (COALESCE(p_purpose, 'default') <> 'default')::boolean
            FROM master.address_link al
            WHERE al.tenant_id      = p_tenant_id
              AND al.owner_type     = 'business_partner'
              AND al.owner_id       = p_owner_id
              AND al.purpose        = 'default'
              AND al.is_primary     = true
              AND al.effective_from <= CURRENT_DATE
              AND (al.effective_until IS NULL OR al.effective_until > CURRENT_DATE)
            ORDER BY al.is_primary DESC NULLS LAST, al.effective_from DESC NULLS LAST, al.id
            LIMIT 1;
        RETURN;
    END IF;

    -- 1. Role exact purpose
    RETURN QUERY
        SELECT al.address_id, al.purpose, 'role'::text, false::boolean
        FROM master.address_link al
        WHERE al.tenant_id      = p_tenant_id
          AND al.owner_type     = p_owner_type
          AND al.owner_id       = p_owner_id
          AND al.purpose        = p_purpose
          AND al.is_primary     = true
          AND al.effective_from <= CURRENT_DATE
          AND (al.effective_until IS NULL OR al.effective_until > CURRENT_DATE)
        ORDER BY al.is_primary DESC NULLS LAST, al.effective_from DESC NULLS LAST, al.id
        LIMIT 1;

    IF FOUND THEN RETURN; END IF;

    -- 2. Role default fallback
    IF p_purpose <> 'default' THEN
        RETURN QUERY
            SELECT al.address_id, 'default'::text, 'role'::text, true::boolean
            FROM master.address_link al
            WHERE al.tenant_id      = p_tenant_id
              AND al.owner_type     = p_owner_type
              AND al.owner_id       = p_owner_id
              AND al.purpose        = 'default'
              AND al.is_primary     = true
              AND al.effective_from <= CURRENT_DATE
              AND (al.effective_until IS NULL OR al.effective_until > CURRENT_DATE)
            ORDER BY al.is_primary DESC NULLS LAST, al.effective_from DESC NULLS LAST, al.id
            LIMIT 1;

        IF FOUND THEN RETURN; END IF;
    END IF;

    -- Resolve the parent BP id for this role
    CASE p_owner_type
        WHEN 'supplier' THEN
            SELECT s.business_partner_id INTO v_bp_id
              FROM master.supplier s
             WHERE s.id = p_owner_id AND s.tenant_id = p_tenant_id;
        WHEN 'customer' THEN
            SELECT c.business_partner_id INTO v_bp_id
              FROM master.customer c
             WHERE c.id = p_owner_id AND c.tenant_id = p_tenant_id;
        ELSE v_bp_id := NULL;
    END CASE;

    IF v_bp_id IS NULL THEN RETURN; END IF;

    -- 3. BP default fallback
    RETURN QUERY
        SELECT al.address_id, 'default'::text, 'business_partner'::text, true::boolean
        FROM master.address_link al
        WHERE al.tenant_id      = p_tenant_id
          AND al.owner_type     = 'business_partner'
          AND al.owner_id       = v_bp_id
          AND al.purpose        = 'default'
          AND al.is_primary     = true
          AND al.effective_from <= CURRENT_DATE
          AND (al.effective_until IS NULL OR al.effective_until > CURRENT_DATE)
        ORDER BY al.is_primary DESC NULLS LAST, al.effective_from DESC NULLS LAST, al.id
        LIMIT 1;
END;
$function$;

COMMENT ON FUNCTION "master".fn_resolve_party_address(p_tenant_id uuid, p_owner_type text, p_owner_id uuid, p_purpose text) IS 'BP-aware address resolver. Chain: role purpose -> role default -> BP default -> NULL. Deterministic tie-breakers at each step: is_primary DESC, effective_from DESC, id. owner_type=''business_partner'' resolves only the BP default address. Returns (address_id, purpose_matched, source, is_fallback).';

CREATE OR REPLACE FUNCTION master.fn_resolve_party_contact(p_tenant_id uuid, p_owner_type text, p_owner_id uuid, p_channel_type text, p_purpose text DEFAULT 'default'::text, p_qualifier text DEFAULT NULL::text)
 RETURNS TABLE(contact_link_id uuid, value text, purpose_matched text, qualifier_matched text, source text, is_fallback boolean)
 LANGUAGE plpgsql
 STABLE PARALLEL SAFE
 SET search_path TO 'master', 'pg_catalog'
AS $function$
DECLARE
    v_bp_id uuid;
BEGIN
    -- Business partner identity root: default contact only.
    IF p_owner_type = 'business_partner' THEN
        RETURN QUERY
            SELECT cl.id, cl.value, cl.purpose, cl.role_qualifier,
                   'business_partner'::text,
                   (p_purpose IS DISTINCT FROM 'default' OR p_qualifier IS NOT NULL)::boolean
            FROM master.contact_link cl
            WHERE cl.tenant_id      = p_tenant_id
              AND cl.owner_type     = 'business_partner'
              AND cl.owner_id       = p_owner_id
              AND cl.channel_type   = p_channel_type
              AND cl.purpose        = 'default'
              AND cl.role_qualifier IS NULL
              AND cl.is_primary     = true
              AND cl.status         = 'active'
            ORDER BY
                cl.is_primary DESC NULLS LAST,
                cl.updated_at DESC NULLS LAST,
                cl.id
            LIMIT 1;
        RETURN;
    END IF;

    -- 1. Role exact (purpose + qualifier)
    RETURN QUERY
        SELECT cl.id, cl.value, cl.purpose, cl.role_qualifier,
               'role'::text, false::boolean
        FROM master.contact_link cl
        WHERE cl.tenant_id      = p_tenant_id
          AND cl.owner_type     = p_owner_type
          AND cl.owner_id       = p_owner_id
          AND cl.channel_type   = p_channel_type
          AND cl.purpose        = p_purpose
          AND (cl.role_qualifier IS NOT DISTINCT FROM p_qualifier)
          AND cl.is_primary     = true
          AND cl.status         = 'active'
        ORDER BY
            cl.is_primary DESC NULLS LAST,
            cl.updated_at DESC NULLS LAST,
            cl.id
        LIMIT 1;

    IF FOUND THEN RETURN; END IF;

    -- 2. Role default fallback
    IF p_purpose <> 'default' THEN
        RETURN QUERY
            SELECT cl.id, cl.value, 'default'::text, NULL::text,
                   'role'::text, true::boolean
            FROM master.contact_link cl
            WHERE cl.tenant_id      = p_tenant_id
              AND cl.owner_type     = p_owner_type
              AND cl.owner_id       = p_owner_id
              AND cl.channel_type   = p_channel_type
              AND cl.purpose        = 'default'
              AND cl.role_qualifier IS NULL
              AND cl.is_primary     = true
              AND cl.status         = 'active'
            ORDER BY
                cl.is_primary DESC NULLS LAST,
                cl.updated_at DESC NULLS LAST,
                cl.id
            LIMIT 1;

        IF FOUND THEN RETURN; END IF;
    END IF;

    -- Resolve the parent BP id for this role
    CASE p_owner_type
        WHEN 'supplier' THEN
            SELECT s.business_partner_id INTO v_bp_id
              FROM master.supplier s
             WHERE s.id = p_owner_id AND s.tenant_id = p_tenant_id;
        WHEN 'customer' THEN
            SELECT c.business_partner_id INTO v_bp_id
              FROM master.customer c
             WHERE c.id = p_owner_id AND c.tenant_id = p_tenant_id;
        ELSE v_bp_id := NULL;
    END CASE;

    IF v_bp_id IS NULL THEN RETURN; END IF;

    -- 3. BP default fallback. BP identity contacts are default-only.
    RETURN QUERY
        SELECT cl.id, cl.value, cl.purpose, cl.role_qualifier,
               'business_partner'::text, true::boolean
        FROM master.contact_link cl
        WHERE cl.tenant_id      = p_tenant_id
          AND cl.owner_type     = 'business_partner'
          AND cl.owner_id       = v_bp_id
          AND cl.channel_type   = p_channel_type
          AND cl.purpose        = 'default'
          AND cl.role_qualifier IS NULL
          AND cl.is_primary     = true
          AND cl.status         = 'active'
        ORDER BY
            cl.is_primary DESC NULLS LAST,
            cl.updated_at DESC NULLS LAST,
            cl.id
        LIMIT 1;
END;
$function$;

COMMENT ON FUNCTION "master".fn_resolve_party_contact(p_tenant_id uuid, p_owner_type text, p_owner_id uuid, p_channel_type text, p_purpose text, p_qualifier text) IS 'BP-aware contact resolver with channel/qualifier fallback. Chain: role purpose → role default → BP default → NULL. owner_type=''business_partner'' resolves only the BP default contact. Returns (contact_link_id, value, purpose_matched, qualifier_matched, source, is_fallback).';

CREATE OR REPLACE FUNCTION master.fn_resolve_principal_ui(p_tenant_id uuid, p_principal_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE PARALLEL RESTRICTED SECURITY DEFINER
 SET search_path TO 'master', 'shared', 'pg_catalog'
AS $function$
DECLARE
    v_session_tenant    uuid;
    v_session_principal uuid;
    v_is_admin          boolean;
BEGIN
    -- ── Gate 1: tenant isolation ───────────────────────────────────────────
    -- current_tenant_id() raises if GUC is unset — intentional.
    v_session_tenant := shared.current_tenant_id();

    IF v_session_tenant IS DISTINCT FROM p_tenant_id THEN
        RAISE EXCEPTION
            'fn_resolve_principal_ui: session tenant (%) does not match requested tenant (%)',
            v_session_tenant, p_tenant_id
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- ── Gate 2: caller identity ────────────────────────────────────────────
    -- CRITICAL: must use session_user, not current_user.
    -- Inside SECURITY DEFINER, current_user is the function owner (definer),
    -- not the caller. session_user is the original login role and is unaffected
    -- by SECURITY DEFINER context.
    v_is_admin := pg_has_role(session_user, 'athyperadmin', 'MEMBER');

    IF NOT v_is_admin THEN
        v_session_principal := nullif(current_setting('app.current_principal_id', true), '')::uuid;

        IF v_session_principal IS NULL THEN
            RAISE EXCEPTION
                'fn_resolve_principal_ui: app.current_principal_id is not set'
                USING ERRCODE = 'insufficient_privilege';
        END IF;

        IF v_session_principal IS DISTINCT FROM p_principal_id THEN
            RAISE EXCEPTION
                'fn_resolve_principal_ui: session principal (%) cannot resolve another principal (%)',
                v_session_principal, p_principal_id
                USING ERRCODE = 'insufficient_privilege';
        END IF;
    END IF;

    -- ── Resolution query ───────────────────────────────────────────────────
    RETURN (
        SELECT jsonb_build_object(
            'principal_id',            p.id,
            'tenant_id',               p.tenant_id,

            -- Locale
            'locale_code',             COALESCE(pui.locale_code,   tp.locale_code,   'en'),
            'language_code',           COALESCE(pui.language_code, tp.language_code,  'en'),
            'timezone_code',           COALESCE(pui.timezone_code, tp.timezone_code,  'UTC'),
            'date_format',             COALESCE(pui.date_format,   tp.date_format,   '%d %b %Y'),
            'number_format',           COALESCE(pui.number_format, tp.number_format),
            'week_start',              COALESCE(pui.week_start,    tp.week_start,    1),

            -- Appearance
            'appearance_mode',         COALESCE(pui.appearance_mode, 'system'),
            'density_code',            COALESCE(pui.density_code,    'compact'),

            -- Navigation
            'home_workspace_code',     pui.home_workspace_code,
            'home_module_code',        pui.home_module_code,

            -- Working-context defaults
            'default_company_code_id', COALESCE(pui.default_company_code_id, pp.default_company_code_id),
            'default_book_id',         pui.default_book_id,
            'default_dashboard_id',    pui.default_dashboard_id
        )
        FROM master.principal p
        LEFT JOIN master.principal_profile      pp  ON pp.principal_id = p.id AND pp.tenant_id = p.tenant_id
        LEFT JOIN master.principal_ui_profile   pui ON pui.principal_id = p.id AND pui.tenant_id = p.tenant_id
        LEFT JOIN master.tenant_profile         tp  ON tp.tenant_id = p.tenant_id
        WHERE p.id        = p_principal_id
          AND p.tenant_id = p_tenant_id
          AND p.status    = 'active'
    );
END;
$function$;

COMMENT ON FUNCTION "master".fn_resolve_principal_ui(p_tenant_id uuid, p_principal_id uuid) IS 'Returns effective UI settings for a single principal as JSONB. Applies resolution cascade: platform defaults → tenant_profile → principal_ui_profile. Working-context defaults fall back to principal_profile (HR/operational). SECURITY DEFINER — owned by athyperadmin (see 12_function_security). Gates: (1) p_tenant_id must match session tenant (current_tenant_id());         (2) caller must be the target principal or athyperadmin. Admin check uses session_user (not current_user) — inside SECURITY DEFINER current_user resolves to the function owner, not the caller. Returns NULL if principal not found or inactive.';

CREATE OR REPLACE FUNCTION master.fn_resolve_scope_companies(p_tenant_id uuid, p_scope_type text, p_scope_id text)
 RETURNS TABLE(company_code_id uuid, company_code text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'master', 'pg_catalog'
AS $function$
BEGIN
  CASE p_scope_type

    WHEN 'company' THEN
      RETURN QUERY
        SELECT cc.id, cc.code
        FROM master.company_code cc
        WHERE cc.tenant_id = p_tenant_id
          AND cc.code      = p_scope_id
          AND cc.is_active = true;

    WHEN 'legal_entity' THEN
      RETURN QUERY
        SELECT cc.id, cc.code
        FROM master.company_code cc
        WHERE cc.tenant_id       = p_tenant_id
          AND cc.legal_entity_id = p_scope_id::uuid
          AND cc.is_active       = true;

    WHEN 'group' THEN
      -- Recursive CTE: walk the legal_entity tree from all roots,
      -- collect every company_code in the tenant.
      RETURN QUERY
        WITH RECURSIVE le_tree AS (
          -- Roots: legal entities with no parent
          SELECT le.id
          FROM master.legal_entity le
          WHERE le.tenant_id         = p_tenant_id
            AND le.parent_entity_id IS NULL
            AND le.is_active         = true
          UNION ALL
          -- Children
          SELECT le.id
          FROM master.legal_entity le
          INNER JOIN le_tree t ON le.parent_entity_id = t.id
          WHERE le.tenant_id = p_tenant_id
            AND le.is_active = true
        )
        SELECT cc.id, cc.code
        FROM master.company_code cc
        INNER JOIN le_tree ON cc.legal_entity_id = le_tree.id
        WHERE cc.tenant_id = p_tenant_id
          AND cc.is_active = true;

    ELSE
      -- Unknown scope type: return empty set (fail-safe)
      RETURN;

  END CASE;
END;
$function$;

COMMENT ON FUNCTION "master".fn_resolve_scope_companies(p_tenant_id uuid, p_scope_type text, p_scope_id text) IS 'Resolves a FinanceScope to a set of company_code rows. scope_type: company | legal_entity | group. Used by all financial read-model queries as the scope entry point.';

CREATE OR REPLACE FUNCTION master.fn_self_bp_registration_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_le_regno text;
    v_bp_regno text;
    v_bp_category text;
BEGIN
    IF NEW.relationship_type <> 'self_bp' THEN
        RETURN NEW;
    END IF;

    SELECT registration_no INTO v_le_regno
    FROM master.legal_entity
    WHERE tenant_id = NEW.tenant_id AND id = NEW.legal_entity_id;

    SELECT registration_no, partner_category INTO v_bp_regno, v_bp_category
    FROM master.business_partner
    WHERE tenant_id = NEW.tenant_id AND id = NEW.business_partner_id;

    -- Hard error: self_bp BP must be internal.
    IF v_bp_category IS DISTINCT FROM 'internal' THEN
        RAISE EXCEPTION
            'self_bp link requires business_partner.partner_category=''internal''. '
            'BP % has partner_category=''%''.',
            NEW.business_partner_id, v_bp_category;
    END IF;

    -- Soft warning: registration number mismatch (could be legitimate name change etc.).
    IF v_le_regno IS NOT NULL
       AND v_bp_regno IS NOT NULL
       AND v_le_regno <> v_bp_regno THEN
        RAISE WARNING
            'self_bp registration_no mismatch: legal_entity % has ''%'', '
            'business_partner % has ''%''. Verify statutory records are consistent.',
            NEW.legal_entity_id, v_le_regno,
            NEW.business_partner_id, v_bp_regno;
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION master.fn_set_primary_address_link(p_tenant_id uuid, p_address_link_id uuid, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'master', 'pg_catalog'
AS $function$
DECLARE
    v_owner_type  text;
    v_owner_id    uuid;
    v_purpose     text;
    v_qualifier   text;
    v_actor       uuid := COALESCE(p_actor_id, '00000000-0000-0000-0000-000000000000');
BEGIN
    PERFORM master.fn_require_tenant_session(p_tenant_id);

    -- Lock the target row and fetch its bucket context
    SELECT owner_type, owner_id, purpose, role_qualifier
      INTO v_owner_type, v_owner_id, v_purpose, v_qualifier
      FROM master.address_link
     WHERE id = p_address_link_id AND tenant_id = p_tenant_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'address_link % not found for tenant %',
            p_address_link_id, p_tenant_id
            USING ERRCODE = 'no_data_found';
    END IF;

    -- Lock all rows in the bucket
    PERFORM id FROM master.address_link
     WHERE tenant_id  = p_tenant_id
       AND owner_type = v_owner_type
       AND owner_id   = v_owner_id
       AND purpose    = v_purpose
       AND role_qualifier IS NOT DISTINCT FROM v_qualifier
       FOR UPDATE;

    -- Step 1: demote existing primaries
    UPDATE master.address_link
       SET is_primary  = false,
           updated_by  = v_actor
     WHERE tenant_id  = p_tenant_id
       AND owner_type = v_owner_type
       AND owner_id   = v_owner_id
       AND purpose    = v_purpose
       AND role_qualifier IS NOT DISTINCT FROM v_qualifier
       AND is_primary = true
       AND id        <> p_address_link_id;

    -- Step 2: promote the target
    UPDATE master.address_link
       SET is_primary  = true,
           updated_by  = v_actor
     WHERE id         = p_address_link_id
       AND tenant_id  = p_tenant_id;
END;
$function$;

COMMENT ON FUNCTION "master".fn_set_primary_address_link(p_tenant_id uuid, p_address_link_id uuid, p_actor_id uuid) IS 'Promotes address_link to is_primary via locked two-step within the same purpose/qualifier bucket: demote others, then promote target. FOR UPDATE locking prevents concurrent collisions. SECURITY DEFINER.';

CREATE OR REPLACE FUNCTION master.fn_set_primary_contact_link(p_tenant_id uuid, p_contact_link_id uuid, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'master', 'pg_catalog'
AS $function$
DECLARE
    v_owner_type  text;
    v_owner_id    uuid;
    v_channel     text;
    v_purpose     text;
    v_qualifier   text;
    v_actor       uuid := COALESCE(p_actor_id, '00000000-0000-0000-0000-000000000000');
BEGIN
    PERFORM master.fn_require_tenant_session(p_tenant_id);

    -- Lock the target row and fetch its bucket context (now includes role_qualifier)
    SELECT owner_type, owner_id, channel_type, purpose, role_qualifier
      INTO v_owner_type, v_owner_id, v_channel, v_purpose, v_qualifier
      FROM master.contact_link
     WHERE id = p_contact_link_id AND tenant_id = p_tenant_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'contact_link % not found for tenant %',
            p_contact_link_id, p_tenant_id
            USING ERRCODE = 'no_data_found';
    END IF;

    -- Lock all rows in the bucket to prevent concurrent primary changes
    -- (bucket key matches ux_contact_link_one_primary index columns)
    PERFORM id FROM master.contact_link
     WHERE tenant_id      = p_tenant_id
       AND owner_type     = v_owner_type
       AND owner_id       = v_owner_id
       AND channel_type   = v_channel
       AND (purpose        IS NOT DISTINCT FROM v_purpose)
       AND (role_qualifier IS NOT DISTINCT FROM v_qualifier)
       FOR UPDATE;

    -- Step 1: demote existing primaries (safe — removes the constraint conflict)
    UPDATE master.contact_link
       SET is_primary  = false,
           updated_by  = v_actor
     WHERE tenant_id      = p_tenant_id
       AND owner_type     = v_owner_type
       AND owner_id       = v_owner_id
       AND channel_type   = v_channel
       AND (purpose        IS NOT DISTINCT FROM v_purpose)
       AND (role_qualifier IS NOT DISTINCT FROM v_qualifier)
       AND is_primary     = true
       AND id            <> p_contact_link_id;

    -- Step 2: promote the target
    UPDATE master.contact_link
       SET is_primary  = true,
           updated_by  = v_actor
     WHERE id          = p_contact_link_id
       AND tenant_id   = p_tenant_id;
END;
$function$;

COMMENT ON FUNCTION "master".fn_set_primary_contact_link(p_tenant_id uuid, p_contact_link_id uuid, p_actor_id uuid) IS 'Promotes contact_link to is_primary via locked two-step: demote others in the same (owner, channel, purpose, role_qualifier) bucket, then promote target. FOR UPDATE locking prevents concurrent collisions. SECURITY DEFINER.';

CREATE OR REPLACE FUNCTION master.fn_set_principal_ui_preference(p_tenant_id uuid, p_principal_id uuid, p_preference_code text, p_surface_code text, p_preference_value jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'master', 'shared', 'pg_catalog'
AS $function$
DECLARE
    v_session_tenant    uuid;
    v_session_principal uuid;
    v_id                uuid;
BEGIN
    -- ── Gate 1: tenant isolation ───────────────────────────────────────────
    v_session_tenant := shared.current_tenant_id();

    IF v_session_tenant IS DISTINCT FROM p_tenant_id THEN
        RAISE EXCEPTION
            'fn_set_principal_ui_preference: session tenant (%) does not match requested tenant (%)',
            v_session_tenant, p_tenant_id
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- ── Gate 2: principal identity ─────────────────────────────────────────
    -- No admin bypass: the write path is owner-only.
    -- Admin-initiated provisioning must set app.current_principal_id to the
    -- system principal (00000000-0000-0000-0000-000000000000) before calling.
    v_session_principal := nullif(current_setting('app.current_principal_id', true), '')::uuid;

    IF v_session_principal IS NULL THEN
        RAISE EXCEPTION
            'fn_set_principal_ui_preference: app.current_principal_id is not set'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF v_session_principal IS DISTINCT FROM p_principal_id THEN
        RAISE EXCEPTION
            'fn_set_principal_ui_preference: session principal (%) does not match target (%)',
            v_session_principal, p_principal_id
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- ── Upsert ─────────────────────────────────────────────────────────────
    -- created_by is stamped to v_session_principal here; trg_puipref_enforce_created_by
    -- sees current_user = athyperadmin (SECURITY DEFINER) and trusts the pre-stamped value.
    -- updated_at / updated_by on the UPDATE path are stamped by trg_puipref_updated_at
    -- (defined in 09_triggers/003b_master_ui_principal.sql).
    INSERT INTO master.principal_ui_preference (
        tenant_id, principal_id, preference_code, surface_code,
        preference_value, created_by
    ) VALUES (
        p_tenant_id, p_principal_id, p_preference_code, p_surface_code,
        p_preference_value, v_session_principal
    )
    ON CONFLICT (tenant_id, principal_id, preference_code, surface_code)
    DO UPDATE SET
        preference_value = EXCLUDED.preference_value
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$function$;

COMMENT ON FUNCTION "master".fn_set_principal_ui_preference(p_tenant_id uuid, p_principal_id uuid, p_preference_code text, p_surface_code text, p_preference_value jsonb) IS 'Upsert a principal UI preference row. INSERT ON CONFLICT UPDATE. SECURITY DEFINER — owned by athyperadmin (see 12_function_security). Gates: (1) p_tenant_id must match session tenant;         (2) session principal must match target principal (no admin bypass). Admin-initiated provisioning: set app.current_principal_id = system principal first. updated_at/updated_by stamped by trg_puipref_updated_at on UPDATE path. Lookup validation on preference_code/surface_code enforced by row triggers. ⚠  Requires NULLS NOT DISTINCT unique index on (tenant_id, principal_id, preference_code, surface_code) for NULL surface_code upserts to work correctly.';

CREATE OR REPLACE FUNCTION master.fn_supplier_block_sync()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_tenant_id  uuid;
    v_supplier_id uuid;
BEGIN
    v_tenant_id   := COALESCE(NEW.tenant_id,   OLD.tenant_id);
    v_supplier_id := COALESCE(NEW.supplier_id, OLD.supplier_id);

    UPDATE master.supplier_qualification sq
    SET is_blocked = EXISTS (
        SELECT 1
        FROM master.supplier_block sb
        WHERE sb.tenant_id   = v_tenant_id
          AND sb.supplier_id = v_supplier_id
          AND sb.block_type  IN ('procurement', 'all')
          AND sb.is_active   = true
    )
    WHERE sq.tenant_id   = v_tenant_id
      AND sq.supplier_id = v_supplier_id;

    RETURN COALESCE(NEW, OLD);
END;
$function$;

CREATE OR REPLACE FUNCTION master.fn_supplier_category_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_category text;
BEGIN
    SELECT partner_category INTO v_category
    FROM master.business_partner
    WHERE tenant_id = NEW.tenant_id AND id = NEW.business_partner_id;

    IF v_category = 'internal' AND NEW.supplier_type <> 'intercompany' THEN
        RAISE EXCEPTION
            'BP partner_category=''internal'' requires supplier_type=''intercompany'' '
            '(got ''%''). Update supplier_type or change partner_category.',
            NEW.supplier_type;
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION master.fn_sync_principal_login_email()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'master'
AS $function$
DECLARE
    v_old_relevant boolean := false;
    v_new_relevant boolean := false;
    v_new_email    text;
BEGIN
    -- Determine relevance of OLD and NEW sides.
    -- Auth purposes (login/recovery/mfa/verification) forbid role_qualifier per
    -- contact_link_auth_no_qualifier_chk; the explicit IS NULL filter here is
    -- defensive documentation in case the CHECK is ever loosened.
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        v_old_relevant := (OLD.owner_type = 'principal'
                       AND OLD.channel_type = 'email'
                       AND OLD.purpose = 'login'
                       AND OLD.role_qualifier IS NULL);
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        v_new_relevant := (NEW.owner_type = 'principal'
                       AND NEW.channel_type = 'email'
                       AND NEW.purpose = 'login'
                       AND NEW.role_qualifier IS NULL);
    END IF;

    -- Early exit if neither side is a principal login email row
    IF NOT v_old_relevant AND NOT v_new_relevant THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
    END IF;

    -- Recompute for OLD principal (if relevant and different from NEW principal)
    IF v_old_relevant THEN
        IF TG_OP = 'DELETE'
           OR NOT v_new_relevant
           OR OLD.owner_id  <> NEW.owner_id
           OR OLD.tenant_id <> NEW.tenant_id
        THEN
            SELECT lower(trim(cl.value))
              INTO v_new_email
              FROM master.contact_link cl
             WHERE cl.tenant_id      = OLD.tenant_id
               AND cl.owner_id     = OLD.owner_id
               AND cl.owner_type   = 'principal'
               AND cl.channel_type = 'email'
               AND cl.purpose      = 'login'
               AND cl.role_qualifier IS NULL
               AND cl.is_primary   = true
               AND cl.is_verified  = true
               AND cl.status       = 'active'
             ORDER BY cl.verified_at DESC NULLS LAST,
                      cl.updated_at  DESC NULLS LAST,
                      cl.created_at  DESC NULLS LAST
             LIMIT 1;

            UPDATE master.principal
               SET login_email = v_new_email
             WHERE id = OLD.owner_id AND tenant_id = OLD.tenant_id
               AND login_email IS DISTINCT FROM v_new_email;
        END IF;
    END IF;

    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;

    -- Recompute for NEW principal
    IF v_new_relevant THEN
        SELECT lower(trim(cl.value))
          INTO v_new_email
          FROM master.contact_link cl
         WHERE cl.tenant_id    = NEW.tenant_id
           AND cl.owner_id     = NEW.owner_id
           AND cl.owner_type   = 'principal'
           AND cl.channel_type = 'email'
           AND cl.purpose      = 'login'
           AND cl.is_primary   = true
           AND cl.is_verified  = true
           AND cl.status       = 'active'
         ORDER BY cl.verified_at DESC NULLS LAST,
                  cl.updated_at  DESC NULLS LAST,
                  cl.created_at  DESC NULLS LAST
         LIMIT 1;

        UPDATE master.principal
           SET login_email = v_new_email
         WHERE id = NEW.owner_id AND tenant_id = NEW.tenant_id
           AND login_email IS DISTINCT FROM v_new_email;
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION master.fn_update_tenant_profile(p_tenant_id uuid, p_name text DEFAULT NULL::text, p_display_name text DEFAULT NULL::text, p_region text DEFAULT NULL::text, p_metadata jsonb DEFAULT NULL::jsonb, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'master', 'pg_catalog'
AS $function$
BEGIN
    PERFORM master.fn_require_tenant_session(p_tenant_id);

    -- Reject empty strings before they hit the CHECK constraint with a cryptic error
    IF p_name IS NOT NULL AND btrim(p_name) = '' THEN
        RAISE EXCEPTION 'name cannot be empty'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;
    IF p_display_name IS NOT NULL AND btrim(p_display_name) = '' THEN
        RAISE EXCEPTION 'display_name cannot be empty'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    UPDATE master.tenant
       SET name         = COALESCE(p_name,         name),
           display_name = COALESCE(p_display_name, display_name),
           region       = COALESCE(p_region,       region),
           metadata     = COALESCE(p_metadata,     metadata),
           updated_by   = COALESCE(p_actor_id, '00000000-0000-0000-0000-000000000000')
     WHERE id = p_tenant_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'tenant % not found', p_tenant_id
            USING ERRCODE = 'no_data_found';
    END IF;
END;
$function$;

COMMENT ON FUNCTION "master".fn_update_tenant_profile(p_tenant_id uuid, p_name text, p_display_name text, p_region text, p_metadata jsonb, p_actor_id uuid) IS 'Tenant self-service profile update. Allows name/display_name/region/metadata changes without mutating status or subscription. SECURITY DEFINER.';

CREATE OR REPLACE FUNCTION master.fn_upsert_contact_link(p_tenant_id uuid, p_owner_type text, p_owner_id uuid, p_channel_type text, p_value text, p_purpose text DEFAULT NULL::text, p_is_primary boolean DEFAULT false, p_actor_id uuid DEFAULT NULL::uuid, p_qualifier text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'master', 'pg_catalog'
AS $function$
DECLARE
    v_id    uuid;
    v_actor uuid := COALESCE(p_actor_id, '00000000-0000-0000-0000-000000000000');
    v_value text;
BEGIN
    PERFORM master.fn_require_tenant_session(p_tenant_id);

    IF p_channel_type = 'email' THEN
        v_value := lower(trim(p_value));
    ELSE
        v_value := trim(p_value);
    END IF;

    -- Identity/value upsert only — always is_primary = false here.
    -- ON CONFLICT target now includes role_qualifier so the same value can
    -- coexist as (purpose=correspondence, qualifier=NULL) and
    -- (purpose=correspondence, qualifier='legal_notice').
    INSERT INTO master.contact_link (
        tenant_id, owner_type, owner_id,
        channel_type, value, purpose, role_qualifier,
        is_primary, is_verified, status, created_by
    )
    VALUES (
        p_tenant_id, p_owner_type, p_owner_id,
        p_channel_type, v_value, p_purpose, p_qualifier,
        false, false, 'active', v_actor
    )
    -- PG 15+: column-list inference matches contact_link_value_uq including its
    -- NULLS NOT DISTINCT semantics. Adding NULLS NOT DISTINCT to the ON CONFLICT
    -- clause is valid PG 15 syntax but not required here — PG applies the
    -- index's null handling automatically during conflict detection.
    ON CONFLICT (tenant_id, owner_type, owner_id, channel_type, value, purpose, role_qualifier)
    DO UPDATE SET
        updated_at = now()
    RETURNING id INTO v_id;

    -- If caller wants this to be primary, delegate to the locked primary setter
    IF p_is_primary THEN
        PERFORM master.fn_set_primary_contact_link(p_tenant_id, v_id, p_actor_id);
    END IF;

    RETURN v_id;
END;
$function$;

COMMENT ON FUNCTION "master".fn_upsert_contact_link(p_tenant_id uuid, p_owner_type text, p_owner_id uuid, p_channel_type text, p_value text, p_purpose text, p_is_primary boolean, p_actor_id uuid, p_qualifier text) IS 'Canonical contact creation/update. Deduplicates on (owner, channel, value, purpose, role_qualifier) via contact_link_value_uq. When p_is_primary=true, delegates to fn_set_primary_contact_link() (locked path). Returns contact_link id. SECURITY DEFINER.';

CREATE OR REPLACE FUNCTION master.fn_verify_contact_link(p_tenant_id uuid, p_contact_link_id uuid, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'master', 'pg_catalog'
AS $function$
BEGIN
    PERFORM master.fn_require_tenant_session(p_tenant_id);

    -- First check the row exists and belongs to the tenant (404 vs idempotent no-op)
    IF NOT EXISTS (
        SELECT 1 FROM master.contact_link
         WHERE id = p_contact_link_id AND tenant_id = p_tenant_id
    ) THEN
        RAISE EXCEPTION 'contact_link % not found for tenant %',
            p_contact_link_id, p_tenant_id
            USING ERRCODE = 'no_data_found';
    END IF;

    -- Attempt the update; if NOT FOUND, it was already verified — idempotent no-op
    UPDATE master.contact_link
       SET is_verified  = true,
           verified_at  = now(),
           updated_by   = COALESCE(p_actor_id, '00000000-0000-0000-0000-000000000000')
     WHERE id        = p_contact_link_id
       AND tenant_id = p_tenant_id
       AND is_verified = false;
END;
$function$;

COMMENT ON FUNCTION "master".fn_verify_contact_link(p_tenant_id uuid, p_contact_link_id uuid, p_actor_id uuid) IS 'Marks contact_link as verified and stamps verified_at. Triggers fn_sync_principal_login_email via AFTER trigger. SECURITY DEFINER.';

CREATE OR REPLACE FUNCTION master.get_fx_rate(p_tenant_id uuid, p_from character, p_to character, p_rate_type text DEFAULT 'SPOT'::text, p_as_of date DEFAULT CURRENT_DATE, p_pivot_currency character DEFAULT NULL::bpchar)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'master', 'shared', 'pg_temp'
AS $function$
DECLARE
    v   record;
    vc  record;
BEGIN
    -- Identity shortcut
    IF p_from = p_to THEN
        RETURN jsonb_build_object(
            'rate', 1.0, 'method', 'IDENTITY', 'from', p_from, 'to', p_to);
    END IF;

    -- Direct lookup
    SELECT rate, source, effective_date INTO v
    FROM master.fx_rate
    WHERE tenant_id    = p_tenant_id
      AND from_currency = p_from
      AND to_currency   = p_to
      AND rate_type     = p_rate_type
      AND effective_date <= p_as_of
      AND is_active = true
    ORDER BY effective_date DESC,
             COALESCE(effective_time, '23:59:59'::time) DESC
    LIMIT 1;
    IF v IS NOT NULL THEN
        RETURN jsonb_build_object(
            'rate', v.rate, 'method', 'DIRECT',
            'source', v.source, 'effective_date', v.effective_date,
            'from', p_from, 'to', p_to);
    END IF;

    -- Inverse lookup (ordered by effective_time to get the most recent intraday rate)
    SELECT rate, source, effective_date INTO v
    FROM master.fx_rate
    WHERE tenant_id    = p_tenant_id
      AND from_currency = p_to
      AND to_currency   = p_from
      AND rate_type     = p_rate_type
      AND effective_date <= p_as_of
      AND is_active = true
    ORDER BY effective_date DESC,
             COALESCE(effective_time, '23:59:59'::time) DESC
    LIMIT 1;
    IF v IS NOT NULL THEN
        RETURN jsonb_build_object(
            'rate', ROUND(1.0 / v.rate, 10), 'method', 'INVERSE',
            'source', v.source, 'effective_date', v.effective_date,
            'from', p_from, 'to', p_to);
    END IF;

    -- Triangulation is never implicit. Direct and inverse lookup remain safe
    -- without policy, but a pivot must be supplied by the effective FX policy.
    IF p_pivot_currency IS NULL THEN
        RETURN jsonb_build_object(
            'rate', NULL, 'method', 'NOT_FOUND', 'from', p_from, 'to', p_to,
            'error', format(
                'No direct or inverse rate for %s to %s (%s) as of %s; triangulation requires an explicit FX policy pivot',
                p_from, p_to, p_rate_type, p_as_of));
    END IF;

    -- Triangulation via configurable pivot. Each leg may be stored directly
    -- or only as its inverse. This matches the universal FX seed, which stores
    -- every active currency as CCY→MYR and relies on inverse legs for MYR→CCY.
    WITH from_candidates AS (
        SELECT rate, source, effective_date, effective_time, 'DIRECT'::text AS method
        FROM master.fx_rate
        WHERE tenant_id      = p_tenant_id
          AND from_currency  = p_from
          AND to_currency    = p_pivot_currency
          AND rate_type      = p_rate_type
          AND effective_date <= p_as_of
          AND is_active = true
        UNION ALL
        SELECT ROUND(1.0 / rate, 10), source, effective_date, effective_time, 'INVERSE'::text AS method
        FROM master.fx_rate
        WHERE tenant_id      = p_tenant_id
          AND from_currency  = p_pivot_currency
          AND to_currency    = p_from
          AND rate_type      = p_rate_type
          AND effective_date <= p_as_of
          AND is_active = true
    ),
    from_leg AS (
        SELECT *
        FROM from_candidates
        ORDER BY effective_date DESC,
                 COALESCE(effective_time, '23:59:59'::time) DESC
        LIMIT 1
    ),
    to_candidates AS (
        SELECT rate, source, effective_date, effective_time, 'DIRECT'::text AS method
        FROM master.fx_rate
        WHERE tenant_id      = p_tenant_id
          AND from_currency  = p_pivot_currency
          AND to_currency    = p_to
          AND rate_type      = p_rate_type
          AND effective_date <= p_as_of
          AND is_active = true
        UNION ALL
        SELECT ROUND(1.0 / rate, 10), source, effective_date, effective_time, 'INVERSE'::text AS method
        FROM master.fx_rate
        WHERE tenant_id      = p_tenant_id
          AND from_currency  = p_to
          AND to_currency    = p_pivot_currency
          AND rate_type      = p_rate_type
          AND effective_date <= p_as_of
          AND is_active = true
    ),
    to_leg AS (
        SELECT *
        FROM to_candidates
        ORDER BY effective_date DESC,
                 COALESCE(effective_time, '23:59:59'::time) DESC
        LIMIT 1
    )
    SELECT
        f.rate AS l1,
        t.rate AS l2,
        f.method AS from_leg_method,
        t.method AS to_leg_method,
        f.source AS from_source,
        t.source AS to_source,
        concat_ws(' + ', f.source, t.source) AS source,
        LEAST(f.effective_date, t.effective_date) AS effective_date,
        f.effective_date AS from_effective_date,
        t.effective_date AS to_effective_date
    INTO vc
    FROM from_leg f
    CROSS JOIN to_leg t;
    IF vc IS NOT NULL THEN
        RETURN jsonb_build_object(
            'rate', ROUND(vc.l1 * vc.l2, 10),
            'method', 'TRIANGULATION_' || p_pivot_currency,
            'pivot', p_pivot_currency,
            'source', vc.source,
            'effective_date', vc.effective_date,
            'from_leg_method', vc.from_leg_method,
            'to_leg_method', vc.to_leg_method,
            'from_source', vc.from_source,
            'to_source', vc.to_source,
            'from_effective_date', vc.from_effective_date,
            'to_effective_date', vc.to_effective_date,
            'from', p_from, 'to', p_to);
    END IF;

    RETURN jsonb_build_object(
        'rate', NULL, 'method', 'NOT_FOUND', 'from', p_from, 'to', p_to,
        'error', format('No rate for %s→%s (%s) as of %s (pivot: %s)',
                        p_from, p_to, p_rate_type, p_as_of, p_pivot_currency));
END;
$function$;

COMMENT ON FUNCTION "master".get_fx_rate(p_tenant_id uuid, p_from character, p_to character, p_rate_type text, p_as_of date, p_pivot_currency character) IS 'FX rate lookup: direct → inverse (effective_time-ordered) → triangulation only via an explicitly supplied policy pivot currency. Returns JSONB: {rate, method, source, effective_date, from, to}. rate=NULL + method=NOT_FOUND when no rate exists.';

CREATE OR REPLACE FUNCTION master.guard_fx_rate_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'master', 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION USING
            ERRCODE = '55000',
            MESSAGE = 'FX rates are append-only and cannot be deleted',
            HINT = 'Use the governed rate replacement command.';
    END IF;

    IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.from_currency IS DISTINCT FROM OLD.from_currency
       OR NEW.to_currency IS DISTINCT FROM OLD.to_currency
       OR NEW.rate IS DISTINCT FROM OLD.rate
       OR NEW.rate_type IS DISTINCT FROM OLD.rate_type
       OR NEW.effective_date IS DISTINCT FROM OLD.effective_date
       OR NEW.effective_time IS DISTINCT FROM OLD.effective_time
       OR NEW.source IS DISTINCT FROM OLD.source
       OR NEW.source_reference IS DISTINCT FROM OLD.source_reference
       OR NEW.version_no IS DISTINCT FROM OLD.version_no
       OR NEW.supersedes_id IS DISTINCT FROM OLD.supersedes_id
       OR NEW.metadata IS DISTINCT FROM OLD.metadata
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
        RAISE EXCEPTION USING
            ERRCODE = '55000',
            MESSAGE = 'FX rate values and lineage are immutable',
            HINT = 'Use the governed rate replacement command.';
    END IF;

    IF OLD.status = 'superseded' OR NEW.status <> 'superseded' THEN
        RAISE EXCEPTION USING
            ERRCODE = '55000',
            MESSAGE = 'The only permitted FX rate update is active to superseded';
    END IF;

    IF NEW.status_changed_at IS NULL OR NEW.status_changed_by IS NULL THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'Superseding an FX rate requires status_changed_at and status_changed_by';
    END IF;

    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION "master".guard_fx_rate_immutable() IS 'Database boundary for immutable FX quotes: only the active-to-superseded lifecycle transition is mutable.';

CREATE OR REPLACE FUNCTION master.guard_organization_tax_registration_scope()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    IF NEW.company_code_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM master.company_code company
         WHERE company.tenant_id=NEW.tenant_id AND company.id=NEW.company_code_id
           AND company.legal_entity_id=NEW.legal_entity_id
    ) THEN
        RAISE EXCEPTION 'Organization Tax Registration Company must belong to its Legal Entity and Tenant'
            USING ERRCODE='23503';
    END IF;
    RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION master.resolve_dimension_set(p_tenant_id uuid, p_pairs jsonb, p_created_by uuid DEFAULT '00000000-0000-0000-0000-000000000000'::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'master'
AS $function$
DECLARE
    v_hash      text;
    v_set_id    uuid;
    v_count     smallint;
    v_pair      jsonb;
    v_ordinal   smallint := 0;
    v_parts     text[]   := '{}';
    v_signature text;
    v_labels    text[]   := '{}';
    v_type_code text;
    v_val_code  text;
    v_prev_type text     := '';
    v_cur_type  text;
BEGIN
    -- Empty set = undimensioned (callers should use NULL dimension_set_id)
    IF p_pairs IS NULL OR jsonb_array_length(p_pairs) = 0 THEN
        RETURN NULL;
    END IF;

    v_count := jsonb_array_length(p_pairs)::smallint;

    -- Build hash input; validate sort order and uniqueness
    FOR v_pair IN SELECT * FROM jsonb_array_elements(p_pairs)
    LOOP
        v_cur_type := v_pair->>'type_id';

        IF v_cur_type = v_prev_type THEN
            RAISE EXCEPTION
                'resolve_dimension_set: duplicate dimension_type_id % in input.', v_cur_type;
        END IF;

        IF v_cur_type < v_prev_type THEN
            RAISE EXCEPTION
                'resolve_dimension_set: input not sorted by type_id — % came after %.',
                v_cur_type, v_prev_type;
        END IF;

        v_prev_type := v_cur_type;
        v_parts     := v_parts || (v_cur_type || ':' || (v_pair->>'value_id'));
    END LOOP;

    v_signature := array_to_string(v_parts, '|');
    v_hash      := encode(sha256(v_signature::bytea), 'hex');

    -- Fast path: hash lookup (most calls hit this path)
    SELECT id INTO v_set_id
    FROM master.dimension_set
    WHERE tenant_id = p_tenant_id AND set_hash = v_hash;

    IF v_set_id IS NOT NULL THEN
        RETURN v_set_id;
    END IF;

    -- Build human-readable display label
    FOR v_pair IN SELECT * FROM jsonb_array_elements(p_pairs)
    LOOP
        SELECT dt.code INTO v_type_code
        FROM master.dimension_type dt
        WHERE dt.id = (v_pair->>'type_id')::uuid AND dt.tenant_id = p_tenant_id;

        SELECT dv.code INTO v_val_code
        FROM master.dimension_value dv
        WHERE dv.id = (v_pair->>'value_id')::uuid AND dv.tenant_id = p_tenant_id;

        v_labels := v_labels
            || (COALESCE(v_type_code,'?') || ':' || COALESCE(v_val_code,'?'));
    END LOOP;

    -- Create the set (race-safe via ON CONFLICT DO NOTHING)
    INSERT INTO master.dimension_set
        (tenant_id, set_hash, signature, dimension_count, display_label, created_by)
    VALUES
        (p_tenant_id, v_hash, v_signature, v_count,
         array_to_string(v_labels, ' | '), p_created_by)
    ON CONFLICT (tenant_id, set_hash) DO NOTHING
    RETURNING id INTO v_set_id;

    -- Race condition: another transaction created the same set concurrently
    IF v_set_id IS NULL THEN
        SELECT id INTO v_set_id
        FROM master.dimension_set
        WHERE tenant_id = p_tenant_id AND set_hash = v_hash;
        RETURN v_set_id;
    END IF;

    -- Create set items
    v_ordinal := 0;
    FOR v_pair IN SELECT * FROM jsonb_array_elements(p_pairs)
    LOOP
        v_ordinal := v_ordinal + 1;
        INSERT INTO master.dimension_set_item
            (tenant_id, dimension_set_id, dimension_type_id, dimension_value_id,
             ordinal, created_by)
        VALUES
            (p_tenant_id, v_set_id,
             (v_pair->>'type_id')::uuid, (v_pair->>'value_id')::uuid,
             v_ordinal, p_created_by);
    END LOOP;

    RETURN v_set_id;
END;
$function$;

COMMENT ON FUNCTION "master".resolve_dimension_set(p_tenant_id uuid, p_pairs jsonb, p_created_by uuid) IS 'Resolves or creates a dimension set from a JSONB array of {type_id, value_id} pairs. Content-addressed deduplication via SHA-256 hash. Input MUST be sorted by type_id ascending — rejects duplicates and unsorted input. Race-safe via ON CONFLICT on the hash unique index + fallback SELECT.';

CREATE OR REPLACE FUNCTION master.resolve_fiscal_period(p_tenant_id uuid, p_company_code_id uuid, p_posting_date date, p_include_special boolean DEFAULT false)
 RETURNS TABLE(fiscal_period_id uuid, fiscal_year smallint, period_number smallint, period_type text, status text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'master', 'pg_temp'
AS $function$
    SELECT fp.id, fp.fiscal_year, fp.period_number, fp.period_type, fp.status
      FROM master.fiscal_period fp
     WHERE fp.tenant_id = p_tenant_id
       AND fp.company_code_id = p_company_code_id
       AND p_posting_date BETWEEN fp.start_date AND fp.end_date
       AND (p_include_special OR fp.period_type = 'normal')
     ORDER BY CASE fp.period_type WHEN 'normal' THEN 0 WHEN 'closing' THEN 1
                                  WHEN 'adjustment' THEN 2 ELSE 3 END,
              fp.period_number
     LIMIT 1
$function$;

COMMENT ON FUNCTION "master".resolve_fiscal_period(p_tenant_id uuid, p_company_code_id uuid, p_posting_date date, p_include_special boolean) IS 'Canonical posting-date resolver over generated fiscal periods. Special periods are excluded by default to avoid adjustment/date overlap.';

CREATE OR REPLACE FUNCTION master.resolve_neon_permission_entitlement(p_tenant_id uuid, p_permission_id uuid, p_at timestamp with time zone DEFAULT now())
 RETURNS TABLE(available boolean, evidence_id text, reason_code text, next_authority_change_at timestamp with time zone, evidence jsonb)
 LANGUAGE sql
 STABLE
AS $function$
  WITH permission_row AS (
    SELECT p.module_id, p.feature_id
    FROM control.auth_permission p
    WHERE p.id = p_permission_id
      AND p.status = 'published'
      AND p.plane_code IN ('neon', 'all')
      AND p.effective_from <= p_at
      AND (p.effective_until IS NULL OR p.effective_until > p_at)
  ), decision AS (
    SELECT
      permission_row.*,
      (permission_row.module_id IS NULL OR EXISTS (
        SELECT 1 FROM control.auth_entitlement_target_policy policy
        WHERE policy.plane_code IN ('neon', 'all')
          AND policy.target_kind = 'module'
          AND policy.module_id = permission_row.module_id
          AND policy.status = 'active'
          AND policy.effective_from <= p_at
          AND (policy.effective_until IS NULL OR policy.effective_until > p_at)
      )) AS module_available,
      (permission_row.feature_id IS NULL OR EXISTS (
        SELECT 1 FROM control.auth_entitlement_target_policy policy
        WHERE policy.plane_code IN ('neon', 'all')
          AND policy.target_kind = 'feature'
          AND policy.feature_id = permission_row.feature_id
          AND policy.status = 'active'
          AND policy.effective_from <= p_at
          AND (policy.effective_until IS NULL OR policy.effective_until > p_at)
      )) AS feature_available
    FROM permission_row
  )
  SELECT
    COALESCE(module_available AND feature_available, false),
    concat('neon:', p_tenant_id::text, ':', p_permission_id::text),
    CASE
      WHEN decision.module_id IS NULL AND decision.feature_id IS NULL
           AND decision.module_available THEN 'available'
      WHEN NOT decision.module_available THEN 'module_unavailable'
      WHEN NOT decision.feature_available THEN 'feature_unavailable'
      WHEN decision.module_available THEN 'available'
      ELSE 'permission_unavailable'
    END,
    NULL::timestamptz,
    jsonb_build_object(
      'module_id', decision.module_id,
      'feature_id', decision.feature_id,
      'module_available', decision.module_available,
      'feature_available', decision.feature_available
    )
  FROM decision
  UNION ALL
  SELECT false, concat('neon:', p_tenant_id::text, ':', p_permission_id::text),
         'permission_unavailable', NULL::timestamptz, '{}'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM decision)
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION master.resolve_operating_organization_companies(p_tenant_id uuid, p_operating_organization_id uuid, p_as_of date DEFAULT CURRENT_DATE)
 RETURNS TABLE(company_code_id uuid, legal_entity_id uuid, participation_role text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'master', 'shared', 'pg_catalog'
AS $function$
    SELECT
        ooc.company_code_id,
        cc.legal_entity_id,
        ooc.participation_role
    FROM master.operating_organization_company ooc
    JOIN master.operating_organization oo
      ON oo.tenant_id = ooc.tenant_id
     AND oo.id = ooc.operating_organization_id
    JOIN master.company_code cc
      ON cc.tenant_id = ooc.tenant_id
     AND cc.id = ooc.company_code_id
    WHERE ooc.tenant_id = p_tenant_id
      AND ooc.operating_organization_id = p_operating_organization_id
      AND oo.status = 'active'
      AND cc.status = 'active'
      AND ooc.status = 'active'
      AND (oo.effective_from IS NULL OR oo.effective_from <= p_as_of)
      AND (oo.effective_until IS NULL OR oo.effective_until >= p_as_of)
      AND ooc.effective_from <= p_as_of
      AND (ooc.effective_until IS NULL OR ooc.effective_until >= p_as_of);
$function$;

COMMENT ON FUNCTION "master".resolve_operating_organization_companies(p_tenant_id uuid, p_operating_organization_id uuid, p_as_of date) IS 'Returns active, effective Company Codes for one tenant-owned Operating Organization. Legal Entity is derived from the Company Code.';

CREATE OR REPLACE FUNCTION master.trg_address_derive_jurisdiction()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'master'
AS $function$
BEGIN
    IF (TG_OP = 'INSERT')
       OR (TG_OP = 'UPDATE'
           AND (NEW.country_code IS DISTINCT FROM OLD.country_code
                OR NEW.region IS DISTINCT FROM OLD.region))
    THEN
        NEW.tax_jurisdiction_id := master.fn_derive_address_jurisdiction(
            NEW.tenant_id, NEW.country_code, NEW.region
        );
    END IF;
    RETURN NEW;
END $function$;

COMMENT ON FUNCTION "master".trg_address_derive_jurisdiction() IS 'BEFORE INSERT/UPDATE on master.address: auto-derives tax_jurisdiction_id from (country_code, region). Recomputes only when those columns change.';

CREATE OR REPLACE FUNCTION master.trg_allocate_atlas_message_sequence()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'master'
 SET row_security TO 'off'
AS $function$
DECLARE
    v_next bigint;
BEGIN
    IF NOT master.fn_atlas_conversation_access(
        NEW.tenant_id,
        NEW.conversation_id,
        true
    ) THEN
        RAISE EXCEPTION
            'master.atlas_message: unauthorized tenant, principal, or plane'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    UPDATE master.atlas_thread
       SET last_message_sequence = last_message_sequence + 1
     WHERE tenant_id = NEW.tenant_id
       AND conversation_id = NEW.conversation_id
       AND plane = NEW.plane
     RETURNING last_message_sequence INTO v_next;

    IF v_next IS NULL THEN
        RAISE EXCEPTION
            'master.atlas_message: Atlas thread not found in requested scope'
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF NEW.sequence = 0 THEN
        NEW.sequence := v_next;
    ELSIF NEW.sequence <> v_next THEN
        RAISE EXCEPTION
            'master.atlas_message: expected next sequence %, received %',
            v_next, NEW.sequence
            USING ERRCODE = 'serialization_failure';
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION master.trg_asset_book_type_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'master', 'document'
AS $function$
BEGIN
    IF OLD.book_type IS DISTINCT FROM NEW.book_type THEN
        IF EXISTS (
            SELECT 1 FROM document.asset_transaction atx
            WHERE atx.asset_book_id = NEW.id
              AND atx.tenant_id = NEW.tenant_id
            LIMIT 1
        ) THEN
            RAISE EXCEPTION
                'asset_book %: cannot change book_type from % to % — transactions exist',
                NEW.id, OLD.book_type, NEW.book_type
                USING ERRCODE = 'restrict_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION "master".trg_asset_book_type_immutable() IS 'Blocks book_type changes on master.asset_book when document.asset_transaction rows reference that book. Prevents denormalization drift on historical transactions.';

CREATE OR REPLACE FUNCTION master.trg_auth_permission_plane_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'master', 'control'
AS $function$
DECLARE
  v_permission_plane text;
BEGIN
  SELECT permission_row.plane_code::text
    INTO v_permission_plane
    FROM control.auth_permission permission_row
   WHERE permission_row.id = NEW.permission_id
     AND permission_row.status = 'published';

  IF v_permission_plane IS NULL THEN
    RAISE EXCEPTION 'Permission % is missing or unpublished', NEW.permission_id
      USING ERRCODE = '23503';
  END IF;
  IF v_permission_plane <> 'all' AND v_permission_plane <> NEW.plane_code THEN
    RAISE EXCEPTION 'Permission % belongs to plane %, not %',
      NEW.permission_id, v_permission_plane, NEW.plane_code
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION master.trg_auto_set_level()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'master'
AS $function$
DECLARE
    v_parent_level smallint;
    v_parent_val   uuid;
BEGIN
    IF TG_TABLE_NAME = 'site' THEN
        v_parent_val := NEW.parent_site_id;
    ELSIF TG_TABLE_NAME = 'project' THEN
        v_parent_val := NEW.parent_project_id;
    ELSIF TG_TABLE_NAME = 'project_item' THEN
        v_parent_val := NEW.parent_item_id;
    ELSE
        v_parent_val := NEW.parent_id;
    END IF;
    IF v_parent_val IS NULL THEN
        NEW.level_no := 1;
    ELSE
        EXECUTE format(
            'SELECT level_no FROM %I.%I WHERE id = $1',
            TG_TABLE_SCHEMA, TG_TABLE_NAME
        ) INTO v_parent_level USING v_parent_val;
        NEW.level_no := COALESCE(v_parent_level, 0) + 1;
    END IF;
    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION "master".trg_auto_set_level() IS 'Auto-calculates level_no from parent depth. Root nodes = 1. Generic — handles all hierarchical finance tables.';

CREATE OR REPLACE FUNCTION master.trg_bal_guard_owner_change_with_config()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'master'
AS $function$
BEGIN
    IF NEW.owner_type IS NOT DISTINCT FROM OLD.owner_type
       AND NEW.owner_id IS NOT DISTINCT FROM OLD.owner_id THEN
        RETURN NEW;
    END IF;

    IF EXISTS (
        SELECT 1 FROM master.bank_account_house_config
        WHERE tenant_id = NEW.tenant_id
          AND bank_account_link_id = NEW.id
    ) THEN
        RAISE EXCEPTION
            'bank_account_link: cannot change owner_type/owner_id on link (%) '
            'because a bank_account_house_config is attached. '
            'Delete the house config first, then reassign the link.',
            NEW.id
            USING ERRCODE = 'restrict_violation';
    END IF;

    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION "master".trg_bal_guard_owner_change_with_config() IS 'Blocks owner_type/owner_id changes on bank_account_link when ANY bank_account_house_config is attached (regardless of config status).';

CREATE OR REPLACE FUNCTION master.trg_bal_recheck_default_on_date_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'master'
AS $function$
DECLARE
    v_hc           RECORD;
    v_company_id   uuid;
    v_currency     character(3);
    v_conflict_id  uuid;
BEGIN
    IF NEW.effective_from IS NOT DISTINCT FROM OLD.effective_from
       AND NEW.effective_until IS NOT DISTINCT FROM OLD.effective_until THEN
        RETURN NEW;
    END IF;

    SELECT hc.id, hc.is_default_disbursement, hc.is_default_collection
    INTO v_hc
    FROM master.bank_account_house_config hc
    WHERE hc.tenant_id = NEW.tenant_id
      AND hc.bank_account_link_id = NEW.id
      AND hc.status = 'active'
      AND (hc.is_default_disbursement OR hc.is_default_collection);

    IF NOT FOUND THEN
        RETURN NEW;
    END IF;

    SELECT NEW.owner_id, ba.currency_code
    INTO v_company_id, v_currency
    FROM master.bank_account ba
    WHERE ba.tenant_id = NEW.tenant_id AND ba.id = NEW.bank_account_id;

    IF v_hc.is_default_disbursement THEN
        SELECT hc2.id INTO v_conflict_id
        FROM master.bank_account_house_config hc2
        JOIN master.bank_account_link bal2 ON bal2.tenant_id = hc2.tenant_id AND bal2.id = hc2.bank_account_link_id
        JOIN master.bank_account ba2 ON ba2.tenant_id = bal2.tenant_id AND ba2.id = bal2.bank_account_id
        WHERE hc2.tenant_id = NEW.tenant_id
          AND hc2.id != v_hc.id
          AND hc2.is_default_disbursement = true
          AND hc2.status = 'active'
          AND bal2.owner_id = v_company_id
          AND ba2.currency_code = v_currency
          AND daterange(bal2.effective_from, COALESCE(bal2.effective_until, '9999-12-31'::date), '[)')
              &&
              daterange(NEW.effective_from, COALESCE(NEW.effective_until, '9999-12-31'::date), '[)')
        LIMIT 1;

        IF v_conflict_id IS NOT NULL THEN
            RAISE EXCEPTION
                'bank_account_link date change would create overlapping default '
                'disbursement for company_code (%) + currency (%). Conflicting config: %',
                v_company_id, v_currency, v_conflict_id
                USING ERRCODE = 'unique_violation';
        END IF;
    END IF;

    IF v_hc.is_default_collection THEN
        SELECT hc2.id INTO v_conflict_id
        FROM master.bank_account_house_config hc2
        JOIN master.bank_account_link bal2 ON bal2.tenant_id = hc2.tenant_id AND bal2.id = hc2.bank_account_link_id
        JOIN master.bank_account ba2 ON ba2.tenant_id = bal2.tenant_id AND ba2.id = bal2.bank_account_id
        WHERE hc2.tenant_id = NEW.tenant_id
          AND hc2.id != v_hc.id
          AND hc2.is_default_collection = true
          AND hc2.status = 'active'
          AND bal2.owner_id = v_company_id
          AND ba2.currency_code = v_currency
          AND daterange(bal2.effective_from, COALESCE(bal2.effective_until, '9999-12-31'::date), '[)')
              &&
              daterange(NEW.effective_from, COALESCE(NEW.effective_until, '9999-12-31'::date), '[)')
        LIMIT 1;

        IF v_conflict_id IS NOT NULL THEN
            RAISE EXCEPTION
                'bank_account_link date change would create overlapping default '
                'collection for company_code (%) + currency (%). Conflicting config: %',
                v_company_id, v_currency, v_conflict_id
                USING ERRCODE = 'unique_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION "master".trg_bal_recheck_default_on_date_change() IS 'Companion to fn_trg_house_config_default_unique. Fires when bank_account_link.effective_from or effective_until is updated. Re-validates temporal overlap for any linked house_config with default flags.';

CREATE OR REPLACE FUNCTION master.trg_bi_parent_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'master', 'pg_temp'
AS $function$
DECLARE
    v_parent_tenant uuid;
    v_parent_domain text;
BEGIN
    IF NEW.parent_id IS NULL THEN RETURN NEW; END IF;

    SELECT tenant_id, domain
    INTO v_parent_tenant, v_parent_domain
    FROM master.business_intent
    WHERE id = NEW.parent_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Parent business_intent % not found.', NEW.parent_id;
    END IF;

    IF v_parent_tenant IS DISTINCT FROM NEW.tenant_id THEN
        RAISE EXCEPTION
            'Cross-tenant hierarchy not allowed: parent tenant=%, child tenant=%.',
            v_parent_tenant, NEW.tenant_id;
    END IF;

    IF v_parent_domain IS DISTINCT FROM NEW.domain THEN
        RAISE EXCEPTION
            'Domain mismatch: child domain "%" must match parent domain "%".',
            NEW.domain, v_parent_domain;
    END IF;

    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION "master".trg_bi_parent_guard() IS 'Parent guard for master.business_intent. Validates parent existence, same-tenant constraint, and domain consistency within the hierarchy subtree.';

CREATE OR REPLACE FUNCTION master.trg_bp_app_index_sync()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'master', 'shared', 'pg_catalog'
AS $function$
BEGIN
    -- Propagate identity changes to supplier_app_index
    UPDATE master.supplier_app_index
    SET business_partner_code      = NEW.code,
        name                       = NEW.name,
        display_name               = coalesce(NEW.display_name, NEW.name),
        legal_name                 = NEW.legal_name,
        legal_form                 = NEW.legal_form,
        registration_no            = NEW.registration_no,
        registration_country_code  = NEW.registration_country_code,
        tax_residence_country_code = NEW.tax_residence_country_code,
        partner_category           = NEW.partner_category,
        aliases                    = NEW.aliases,
        business_types             = coalesce(NEW.business_types, '{}'),
        search_text = lower(
            coalesce(supplier_code, '')                                   || ' ' ||
            coalesce(NEW.code, '')                                        || ' ' ||
            coalesce(NEW.name, '')                                        || ' ' ||
            coalesce(NEW.display_name, '')                                || ' ' ||
            coalesce(NEW.legal_name, '')                                  || ' ' ||
            coalesce(NEW.registration_no, '')                             || ' ' ||
            coalesce(array_to_string(NEW.aliases, ' '), '')               || ' ' ||
            coalesce(array_to_string(NEW.business_types, ' '), '')
        ),
        updated_at = now()
    WHERE business_partner_id = NEW.id AND tenant_id = NEW.tenant_id;

    -- Propagate identity changes to customer_app_index
    UPDATE master.customer_app_index
    SET business_partner_code     = NEW.code,
        name                      = NEW.name,
        display_name              = coalesce(NEW.display_name, NEW.name),
        legal_name                = NEW.legal_name,
        legal_form                = NEW.legal_form,
        registration_no           = NEW.registration_no,
        registration_country_code = NEW.registration_country_code,
        aliases                   = NEW.aliases,
        business_types            = coalesce(NEW.business_types, '{}'),
        search_text = lower(
            coalesce(customer_code, '')                                   || ' ' ||
            coalesce(NEW.code, '')                                        || ' ' ||
            coalesce(NEW.name, '')                                        || ' ' ||
            coalesce(NEW.display_name, '')                                || ' ' ||
            coalesce(NEW.legal_name, '')                                  || ' ' ||
            coalesce(NEW.registration_no, '')                             || ' ' ||
            coalesce(array_to_string(NEW.aliases, ' '), '')               || ' ' ||
            coalesce(array_to_string(NEW.business_types, ' '), '')
        ),
        updated_at = now()
    WHERE business_partner_id = NEW.id AND tenant_id = NEW.tenant_id;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION master.trg_bump_operating_organization_membership_scope()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'master', 'pg_temp'
AS $function$
DECLARE
    v_tenant_id uuid := COALESCE(NEW.tenant_id, OLD.tenant_id);
    v_org_id uuid := COALESCE(NEW.operating_organization_id, OLD.operating_organization_id);
    v_actor_id uuid := COALESCE(NEW.updated_by, NEW.created_by, OLD.updated_by, OLD.created_by);
BEGIN
    IF TG_OP = 'UPDATE'
       AND ROW(
           NEW.tenant_id,
           NEW.operating_organization_id,
           NEW.company_code_id,
           NEW.participation_role,
           NEW.effective_from,
           NEW.effective_until,
           NEW.status
       ) IS NOT DISTINCT FROM ROW(
           OLD.tenant_id,
           OLD.operating_organization_id,
           OLD.company_code_id,
           OLD.participation_role,
           OLD.effective_from,
           OLD.effective_until,
           OLD.status
       ) THEN
        RETURN NEW;
    END IF;

    UPDATE master.operating_organization
       SET scope_version = scope_version + 1,
           updated_at = now(),
           updated_by = v_actor_id
     WHERE tenant_id = v_tenant_id
       AND id = v_org_id;

    IF TG_OP = 'UPDATE'
       AND OLD.operating_organization_id IS DISTINCT FROM NEW.operating_organization_id THEN
        UPDATE master.operating_organization
           SET scope_version = scope_version + 1,
               updated_at = now(),
               updated_by = v_actor_id
         WHERE tenant_id = OLD.tenant_id
           AND id = OLD.operating_organization_id;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$function$;

CREATE OR REPLACE FUNCTION master.trg_cc_cross_refs_same_company()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'master'
AS $function$
DECLARE v_ref uuid;
BEGIN
    IF NEW.profit_center_id IS NOT NULL THEN
        SELECT company_code_id INTO v_ref
        FROM master.profit_center WHERE id = NEW.profit_center_id;
        IF v_ref IS DISTINCT FROM NEW.company_code_id THEN
            RAISE EXCEPTION 'cost_center.profit_center_id: company mismatch (CC:%, PC:%)',
                NEW.company_code_id, v_ref USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    IF NEW.site_id IS NOT NULL THEN
        SELECT company_code_id INTO v_ref
        FROM master.site WHERE id = NEW.site_id;
        IF v_ref IS DISTINCT FROM NEW.company_code_id THEN
            RAISE EXCEPTION 'cost_center.site_id: company mismatch (CC:%, Site:%)',
                NEW.company_code_id, v_ref USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION "master".trg_cc_cross_refs_same_company() IS 'Ensures cost_center.profit_center_id and cost_center.site_id belong to same company_code.';

CREATE OR REPLACE FUNCTION master.trg_cc_validate_code()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'master'
AS $function$
DECLARE
    v_actual_domain text;
BEGIN
    IF NEW.classification_type IS NULL OR NEW.code_id IS NULL THEN
        RETURN NEW;
    END IF;

    CASE NEW.classification_type
        WHEN 'commodity' THEN
            SELECT domain_code INTO v_actual_domain
            FROM shared.commodity_code WHERE id = NEW.code_id;
            IF v_actual_domain IS NULL THEN
                RAISE EXCEPTION 'commodity_classification: code_id (%) not found in shared.commodity_code',
                    NEW.code_id
                    USING ERRCODE = 'foreign_key_violation';
            END IF;
        WHEN 'industry' THEN
            SELECT domain_code INTO v_actual_domain
            FROM shared.industry_code WHERE id = NEW.code_id;
            IF v_actual_domain IS NULL THEN
                RAISE EXCEPTION 'commodity_classification: code_id (%) not found in shared.industry_code',
                    NEW.code_id
                    USING ERRCODE = 'foreign_key_violation';
            END IF;
        ELSE
            RAISE EXCEPTION 'commodity_classification: unknown classification_type "%"', NEW.classification_type
                USING ERRCODE = 'foreign_key_violation';
    END CASE;

    IF v_actual_domain IS DISTINCT FROM NEW.domain_code THEN
        RAISE EXCEPTION 'commodity_classification: domain_code mismatch — row says %, code says %',
            NEW.domain_code, v_actual_domain
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION "master".trg_cc_validate_code() IS 'Polymorphic code FK + domain_code validation for commodity_classification. Verifies code_id exists in shared.commodity_code or shared.industry_code and that the code''s domain_code matches the row''s domain_code.';

CREATE OR REPLACE FUNCTION master.trg_cc_validate_owner()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'master'
AS $function$
DECLARE
    v_exists boolean;
BEGIN
    IF NEW.owner_type IS NULL OR NEW.owner_id IS NULL THEN
        RETURN NEW;
    END IF;

    CASE NEW.owner_type
        WHEN 'product' THEN
            SELECT EXISTS(SELECT 1 FROM master.product WHERE id = NEW.owner_id AND tenant_id = NEW.tenant_id) INTO v_exists;
        WHEN 'commodity_category' THEN
            SELECT EXISTS(SELECT 1 FROM master.commodity_category WHERE id = NEW.owner_id AND tenant_id = NEW.tenant_id) INTO v_exists;
        WHEN 'item' THEN
            SELECT EXISTS(SELECT 1 FROM master.item WHERE id = NEW.owner_id AND tenant_id = NEW.tenant_id) INTO v_exists;
        WHEN 'customer' THEN
            SELECT EXISTS(SELECT 1 FROM master.customer WHERE id = NEW.owner_id AND tenant_id = NEW.tenant_id) INTO v_exists;
        WHEN 'supplier' THEN
            SELECT EXISTS(SELECT 1 FROM master.supplier WHERE id = NEW.owner_id AND tenant_id = NEW.tenant_id) INTO v_exists;
        ELSE
            RAISE EXCEPTION 'commodity_classification: unknown owner_type "%"', NEW.owner_type
                USING ERRCODE = 'foreign_key_violation';
    END CASE;

    IF NOT v_exists THEN
        RAISE EXCEPTION 'commodity_classification: owner_id (%) not found in master.% for tenant %',
            NEW.owner_id, NEW.owner_type, NEW.tenant_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION "master".trg_cc_validate_owner() IS 'Polymorphic owner FK validation for commodity_classification. Dispatches to product, commodity_category, item, customer, supplier.';

CREATE OR REPLACE FUNCTION master.trg_cc_validate_owner_type()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'master', 'pg_temp'
AS $function$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM master.owner_type
        WHERE code      = NEW.owner_type
          AND tenant_id IS NULL
          AND status    = 'active'
    ) THEN
        RAISE EXCEPTION
            'commodity_classification: owner_type "%" not found in owner_type (system rows)',
            NEW.owner_type
            USING ERRCODE = 'foreign_key_violation';
    END IF;
    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION "master".trg_cc_validate_owner_type() IS 'Cross-validates commodity_classification.owner_type against owner_type system rows (tenant_id IS NULL). Stronger than lookup-only — ensures routing contract exists.';

CREATE OR REPLACE FUNCTION master.trg_ccat_maintain_root_category()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'master'
AS $function$
DECLARE
    v_root_id   uuid;
    v_cursor    uuid;
    v_depth     int := 0;
    v_max_depth CONSTANT int := 50;
BEGIN
    IF NEW.parent_id IS NULL THEN
        NEW.root_category_id := NEW.id;

        IF TG_OP = 'UPDATE'
           AND OLD.parent_id IS DISTINCT FROM NEW.parent_id
        THEN
            WITH RECURSIVE descendants AS (
                SELECT id FROM master.commodity_category
                WHERE parent_id = NEW.id AND tenant_id = NEW.tenant_id
                UNION ALL
                SELECT cc.id FROM master.commodity_category cc
                INNER JOIN descendants d ON cc.parent_id = d.id
                    AND cc.tenant_id = NEW.tenant_id
            )
            UPDATE master.commodity_category
            SET root_category_id = NEW.root_category_id
            WHERE id IN (SELECT id FROM descendants)
              AND tenant_id = NEW.tenant_id;
        END IF;

        RETURN NEW;
    END IF;

    v_cursor := NEW.parent_id;
    LOOP
        SELECT cc.parent_id, cc.id INTO v_cursor, v_root_id
        FROM master.commodity_category cc
        WHERE cc.id = v_cursor AND cc.tenant_id = NEW.tenant_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Broken parent chain: could not find commodity_category % for tenant %',
                v_cursor, NEW.tenant_id
                USING ERRCODE = 'foreign_key_violation';
        END IF;

        IF v_cursor IS NULL THEN
            EXIT;
        END IF;

        v_depth := v_depth + 1;
        IF v_depth > v_max_depth THEN
            RAISE EXCEPTION 'Cycle or excessive depth (>%) in commodity_category hierarchy for tenant %',
                v_max_depth, NEW.tenant_id
                USING ERRCODE = 'program_limit_exceeded';
        END IF;
    END LOOP;

    NEW.root_category_id := v_root_id;

    IF TG_OP = 'UPDATE'
       AND OLD.parent_id IS DISTINCT FROM NEW.parent_id
    THEN
        WITH RECURSIVE descendants AS (
            SELECT id FROM master.commodity_category
            WHERE parent_id = NEW.id AND tenant_id = NEW.tenant_id
            UNION ALL
            SELECT cc.id FROM master.commodity_category cc
            INNER JOIN descendants d ON cc.parent_id = d.id
                AND cc.tenant_id = NEW.tenant_id
        )
        UPDATE master.commodity_category
        SET root_category_id = NEW.root_category_id
        WHERE id IN (SELECT id FROM descendants)
          AND tenant_id = NEW.tenant_id;
    END IF;

    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION "master".trg_ccat_maintain_root_category() IS 'BEFORE INSERT/UPDATE trigger for master.commodity_category root_category_id maintenance.';

CREATE OR REPLACE FUNCTION master.trg_ccga_defaults_same_company()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'master'
AS $function$
DECLARE v_ref uuid;
BEGIN
    IF NEW.default_cost_center_id IS NOT NULL THEN
        SELECT company_code_id INTO v_ref
        FROM master.cost_center WHERE id = NEW.default_cost_center_id;
        IF v_ref IS DISTINCT FROM NEW.company_code_id THEN
            RAISE EXCEPTION 'company_code_gl_account.default_cost_center_id: company mismatch '
                '(row company: %, cost_center company: %)',
                NEW.company_code_id, v_ref
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    IF NEW.default_site_id IS NOT NULL THEN
        SELECT company_code_id INTO v_ref
        FROM master.site WHERE id = NEW.default_site_id;
        IF v_ref IS DISTINCT FROM NEW.company_code_id THEN
            RAISE EXCEPTION 'company_code_gl_account.default_site_id: company mismatch '
                '(row company: %, site company: %)',
                NEW.company_code_id, v_ref
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION "master".trg_ccga_defaults_same_company() IS 'Ensures ccga defaults (cost_center, site) belong to same company_code.';

CREATE OR REPLACE FUNCTION master.trg_ccp_validate_receipt_method_direction()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'master'
AS $function$
DECLARE
    v_direction text;
BEGIN
    IF NEW.default_receipt_method_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT direction INTO v_direction
    FROM master.payment_method
    WHERE tenant_id = NEW.tenant_id AND id = NEW.default_receipt_method_id;

    IF v_direction IS NULL THEN
        RAISE EXCEPTION
            'company_code_customer_profile: default_receipt_method_id (%) not found',
            NEW.default_receipt_method_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF lower(v_direction) NOT IN ('inbound', 'both') THEN
        RAISE EXCEPTION
            'company_code_customer_profile: default_receipt_method_id (%) has direction "%" '
            '— must be INBOUND or BOTH for receipt/collection methods',
            NEW.default_receipt_method_id, v_direction
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION "master".trg_ccp_validate_receipt_method_direction() IS 'Validates that default_receipt_method_id on company_code_customer_profile references a payment_method with direction INBOUND or BOTH.';

CREATE OR REPLACE FUNCTION master.trg_comment_hierarchy_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'master'
AS $function$
DECLARE
    v_parent master.comment;
BEGIN
    IF NEW.parent_comment_id IS NULL THEN
        -- Root comment: depth must be 0
        IF NEW.thread_depth <> 0 THEN
            RAISE EXCEPTION 'master.comment: root comment (no parent) must have thread_depth=0, got %',
                NEW.thread_depth USING ERRCODE = 'check_violation';
        END IF;
        RETURN NEW;
    END IF;

    -- Fetch parent — must be same tenant
    SELECT * INTO v_parent
      FROM master.comment
     WHERE id = NEW.parent_comment_id AND tenant_id = NEW.tenant_id;

    IF v_parent IS NULL THEN
        RAISE EXCEPTION 'master.comment: parent_comment_id % not found in tenant %',
            NEW.parent_comment_id, NEW.tenant_id USING ERRCODE = 'foreign_key_violation';
    END IF;

    -- Parent must be same context surface
    IF v_parent.context_type <> NEW.context_type
       OR v_parent.entity_type <> NEW.entity_type
       OR v_parent.entity_id   <> NEW.entity_id THEN
        RAISE EXCEPTION
            'master.comment: parent comment must belong to the same '
            '(context_type, entity_type, entity_id). '
            'Parent: (%,%,%), Child: (%,%,%)',
            v_parent.context_type, v_parent.entity_type, v_parent.entity_id,
            NEW.context_type, NEW.entity_type, NEW.entity_id
            USING ERRCODE = 'check_violation';
    END IF;

    -- Depth must be parent + 1
    IF NEW.thread_depth <> v_parent.thread_depth + 1 THEN
        RAISE EXCEPTION
            'master.comment: thread_depth must be parent.thread_depth+1 (%). Got %.',
            v_parent.thread_depth + 1, NEW.thread_depth
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION "master".trg_comment_hierarchy_guard() IS 'Validates comment threading: parent must belong to same entity surface. thread_depth must equal parent.thread_depth + 1. Root comments must have thread_depth = 0.';

CREATE OR REPLACE FUNCTION master.trg_contact_link_root_owner_default_purpose()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'master'
AS $function$
BEGIN
    IF NEW.owner_type IN ('tenant', 'legal_entity', 'company_code', 'site', 'business_partner')
       AND NEW.purpose IS NULL THEN
        NEW.purpose := 'default';
    END IF;

    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION "master".trg_contact_link_root_owner_default_purpose() IS 'Defaults a blank contact_link purpose for organizational owners while retaining explicit correspondence/notification purposes and role qualifiers.';

CREATE OR REPLACE FUNCTION master.trg_customer_app_index_sync()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'master', 'shared', 'pg_catalog'
AS $function$
DECLARE
    v_bp  record;
    v_row record;
BEGIN
    IF TG_OP = 'DELETE' THEN
        DELETE FROM master.customer_app_index
        WHERE customer_id = OLD.id AND tenant_id = OLD.tenant_id;
        RETURN OLD;
    END IF;

    v_row := NEW;

    SELECT * INTO v_bp
    FROM master.business_partner
    WHERE id = v_row.business_partner_id AND tenant_id = v_row.tenant_id;

    INSERT INTO master.customer_app_index (
        id, tenant_id, customer_id, business_partner_id,
        customer_code, customer_type, customer_status, is_key_account, risk_rating,
        business_partner_code, name, display_name, legal_name, legal_form,
        registration_no, registration_country_code, aliases, business_types,
        search_text, updated_at
    ) VALUES (
        v_row.id,
        v_row.tenant_id,
        v_row.id,
        v_row.business_partner_id,
        v_row.customer_code,
        v_row.customer_type,
        v_row.status,
        coalesce(v_row.is_key_account, false),
        v_row.risk_rating,
        v_bp.code,
        v_bp.name,
        coalesce(v_bp.display_name, v_bp.name),
        v_bp.legal_name,
        v_bp.legal_form,
        v_bp.registration_no,
        v_bp.registration_country_code,
        v_bp.aliases,
        coalesce(v_bp.business_types, '{}'),
        lower(
            coalesce(v_row.customer_code, '')                         || ' ' ||
            coalesce(v_bp.code, '')                                   || ' ' ||
            coalesce(v_bp.name, '')                                   || ' ' ||
            coalesce(v_bp.display_name, '')                           || ' ' ||
            coalesce(v_bp.legal_name, '')                             || ' ' ||
            coalesce(v_bp.registration_no, '')                        || ' ' ||
            coalesce(array_to_string(v_bp.aliases, ' '), '')          || ' ' ||
            coalesce(array_to_string(v_bp.business_types, ' '), '')
        ),
        now()
    )
    ON CONFLICT (tenant_id, customer_id) DO UPDATE SET
        customer_code             = EXCLUDED.customer_code,
        customer_type             = EXCLUDED.customer_type,
        customer_status           = EXCLUDED.customer_status,
        is_key_account            = EXCLUDED.is_key_account,
        risk_rating               = EXCLUDED.risk_rating,
        business_partner_code     = EXCLUDED.business_partner_code,
        name                      = EXCLUDED.name,
        display_name              = EXCLUDED.display_name,
        legal_name                = EXCLUDED.legal_name,
        legal_form                = EXCLUDED.legal_form,
        registration_no           = EXCLUDED.registration_no,
        registration_country_code = EXCLUDED.registration_country_code,
        aliases                   = EXCLUDED.aliases,
        business_types            = EXCLUDED.business_types,
        search_text               = EXCLUDED.search_text,
        updated_at                = now();

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION master.trg_dsi_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'master'
AS $function$
BEGIN
    RAISE EXCEPTION
        'master.dimension_set_item is immutable — % is not permitted. '
        'Create a new dimension_set instead.',
        TG_OP
        USING ERRCODE = 'object_not_in_prerequisite_state';
END;
$function$;

COMMENT ON FUNCTION "master".trg_dsi_immutable() IS 'Blocks UPDATE and DELETE on dimension_set_item. Rows are write-once. To change a dimension combination, create a new dimension_set.';

CREATE OR REPLACE FUNCTION master.trg_dsi_type_value_consistency()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'master'
AS $function$
DECLARE
    v_actual_type uuid;
BEGIN
    SELECT dimension_type_id INTO v_actual_type
    FROM master.dimension_value
    WHERE id = NEW.dimension_value_id AND tenant_id = NEW.tenant_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'dimension_value % not found for tenant %.',
            NEW.dimension_value_id, NEW.tenant_id;
    END IF;

    IF v_actual_type IS DISTINCT FROM NEW.dimension_type_id THEN
        RAISE EXCEPTION
            'dimension_set_item: dimension_value % belongs to type %, '
            'but set item declares type %. Must match.',
            NEW.dimension_value_id, v_actual_type, NEW.dimension_type_id;
    END IF;

    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION "master".trg_dsi_type_value_consistency() IS 'Ensures each dimension_set_item''s value belongs to the declared dimension_type. Fires BEFORE INSERT on master.dimension_set_item.';

CREATE OR REPLACE FUNCTION master.trg_dt_deactivation_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'master'
AS $function$
DECLARE
    v_ref_count bigint;
BEGIN
    IF OLD.status = 'active' AND NEW.status IN ('inactive','archived') THEN
        SELECT count(*) INTO v_ref_count
        FROM master.dimension_value dv
        WHERE dv.dimension_type_id = NEW.id
          AND dv.tenant_id         = NEW.tenant_id
          AND dv.status            = 'active';

        IF v_ref_count > 0 THEN
            RAISE EXCEPTION
                'Cannot deactivate dimension_type "%" — % active value(s) still reference it.',
                NEW.code, v_ref_count
                USING ERRCODE = 'foreign_key_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION "master".trg_dt_deactivation_guard() IS 'Blocks deactivation/archival of dimension_type when active dimension_value rows still reference it. Fires BEFORE UPDATE OF status on master.dimension_type.';

CREATE OR REPLACE FUNCTION master.trg_dv_company_scope_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'master'
AS $function$
DECLARE
    v_allowed boolean;
BEGIN
    IF NEW.company_code_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT is_company_scoped_allowed INTO v_allowed
    FROM master.dimension_type
    WHERE id = NEW.dimension_type_id AND tenant_id = NEW.tenant_id;

    IF NOT v_allowed THEN
        RAISE EXCEPTION
            'dimension_type % does not allow company-scoped values. '
            'Set is_company_scoped_allowed = true on dimension_type first.',
            NEW.dimension_type_id;
    END IF;

    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION "master".trg_dv_company_scope_guard() IS 'Blocks company_code_id being set on a dimension_value when the parent dimension_type has is_company_scoped_allowed = false. Fires BEFORE INSERT OR UPDATE OF company_code_id on master.dimension_value.';

CREATE OR REPLACE FUNCTION master.trg_dv_parent_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'master'
AS $function$
DECLARE
    v_parent record;
BEGIN
    IF NEW.parent_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT tenant_id, dimension_type_id, company_code_id
    INTO v_parent
    FROM master.dimension_value
    WHERE id = NEW.parent_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Parent dimension_value % does not exist.', NEW.parent_id;
    END IF;

    IF v_parent.tenant_id IS DISTINCT FROM NEW.tenant_id THEN
        RAISE EXCEPTION 'dimension_value parent belongs to a different tenant.';
    END IF;

    IF v_parent.dimension_type_id IS DISTINCT FROM NEW.dimension_type_id THEN
        RAISE EXCEPTION
            'dimension_value parent belongs to dimension_type %, child is %. Must match.',
            v_parent.dimension_type_id, NEW.dimension_type_id;
    END IF;

    -- Company scope compatibility:
    --   Global parent (NULL) may have global or company-scoped children.
    --   Company-scoped parent may only have children of the SAME company.
    IF v_parent.company_code_id IS NOT NULL
       AND v_parent.company_code_id IS DISTINCT FROM NEW.company_code_id THEN
        RAISE EXCEPTION
            'dimension_value: company-scoped parent (%) requires child to share the same '
            'company or be global. Child company_code_id = %.',
            v_parent.company_code_id, NEW.company_code_id;
    END IF;

    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION "master".trg_dv_parent_guard() IS 'Validates dimension_value parent-child relationships: same tenant, same type, compatible company scope (global parent may have company-scoped children; company-scoped parent requires same company or global child). Fires BEFORE INSERT OR UPDATE OF parent_id on master.dimension_value.';

CREATE OR REPLACE FUNCTION master.trg_emit_outbox_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'master', 'event', 'pg_catalog'
AS $function$
DECLARE
    v_topic      text;
    v_event_type text;
    v_payload    jsonb;
    v_tenant     uuid;
    v_actor      uuid;
    v_entity_id  uuid;
BEGIN
    v_topic      := TG_ARGV[0];
    v_event_type := TG_ARGV[1];

    IF TG_OP = 'DELETE' THEN
        v_tenant    := OLD.tenant_id;
        v_actor     := COALESCE(OLD.created_by, '00000000-0000-0000-0000-000000000000'::uuid);
        v_entity_id := OLD.id;
        v_payload   := jsonb_build_object(
            'op', 'DELETE',
            'table', TG_TABLE_NAME,
            'old', to_jsonb(OLD)
        );
    ELSIF TG_OP = 'INSERT' THEN
        v_tenant    := NEW.tenant_id;
        v_actor     := COALESCE(NEW.created_by, '00000000-0000-0000-0000-000000000000'::uuid);
        v_entity_id := NEW.id;
        v_payload   := jsonb_build_object(
            'op', 'INSERT',
            'table', TG_TABLE_NAME,
            'new', to_jsonb(NEW)
        );
    ELSE -- UPDATE
        v_tenant    := NEW.tenant_id;
        -- This trigger is shared by both mutable entities and append-only
        -- association tables such as principal_persona.  The latter can still
        -- receive an UPDATE from an idempotent UPSERT, but intentionally have
        -- no updated_by column.  Read the optional field through JSON so the
        -- trigger remains valid for both row shapes.
        v_actor     := COALESCE(
            NULLIF(to_jsonb(NEW)->>'updated_by', '')::uuid,
            NEW.created_by,
            '00000000-0000-0000-0000-000000000000'::uuid
        );
        v_entity_id := NEW.id;
        v_payload   := jsonb_build_object(
            'op', 'UPDATE',
            'table', TG_TABLE_NAME,
            'old', to_jsonb(OLD),
            'new', to_jsonb(NEW)
        );
    END IF;

    PERFORM event.fn_outbox_emit(
        p_tenant_id   := v_tenant,
        p_topic       := v_topic,
        p_event_type  := v_event_type,
        p_payload     := v_payload,
        p_created_by  := v_actor,
        p_entity_type := TG_TABLE_NAME,
        p_entity_id   := v_entity_id,
        p_source      := 'trigger'
    );

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION "master".trg_emit_outbox_event() IS 'Generic outbox emitter trigger. TG_ARGV[0] = topic, TG_ARGV[1] = event_type. Emits INSERT/UPDATE/DELETE payloads to event.outbox. Used by IAM (topic=iam) and extensible for other domains.';

CREATE OR REPLACE FUNCTION master.trg_enforce_created_by()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'master', 'shared', 'pg_catalog'
AS $function$
DECLARE
    v_session_principal uuid;
BEGIN
    -- ── UPDATE: created_by is immutable ────────────────────────────────────
    IF TG_OP = 'UPDATE' THEN
        IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
            RAISE EXCEPTION '%.%: created_by is immutable after insert (cannot change "%" to "%")',
                TG_TABLE_SCHEMA, TG_TABLE_NAME, OLD.created_by, NEW.created_by
                USING ERRCODE = 'check_violation';
        END IF;
        RETURN NEW;
    END IF;

    -- ── INSERT: stamp created_by from session ──────────────────────────────
    -- Admin bypass: athyperadmin may set created_by explicitly (seed/migration).
    -- current_user is intentional here: when called from within a SECURITY DEFINER
    -- function the definer role is visible as current_user, which is the admin —
    -- the caller has already stamped created_by to the correct session principal.
    IF pg_has_role(current_user, 'athyperadmin', 'MEMBER') THEN
        IF NEW.created_by IS NULL THEN
            -- Fallback: system principal for admin-initiated inserts without an explicit value.
            NEW.created_by := '00000000-0000-0000-0000-000000000000'::uuid;
        END IF;
        RETURN NEW;
    END IF;

    -- Regular sessions: app.current_principal_id must be set.
    v_session_principal := nullif(current_setting('app.current_principal_id', true), '')::uuid;

    IF v_session_principal IS NULL THEN
        RAISE EXCEPTION '%.%: cannot INSERT without app.current_principal_id session context',
            TG_TABLE_SCHEMA, TG_TABLE_NAME
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- Overwrite whatever the caller passed — session principal is canonical.
    NEW.created_by := v_session_principal;

    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION "master".trg_enforce_created_by() IS 'Enforces created_by = session principal on INSERT; immutability on UPDATE. INSERT: overwrites created_by with app.current_principal_id GUC. Raises if GUC unset, unless current_user is athyperadmin (may set explicitly). UPDATE: raises check_violation on any change to created_by. Prevents created_by spoofing on tables where shared-scope update RLS grants edit rights to the row creator. Attach via 09_triggers/003b_master_ui_principal.sql.';

CREATE OR REPLACE FUNCTION master.trg_enforce_parent_same_company()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'master'
AS $function$
DECLARE
    v_parent_company uuid;
    v_parent_val     uuid;
BEGIN
    IF TG_TABLE_NAME = 'site' THEN
        v_parent_val := NEW.parent_site_id;
    ELSIF TG_TABLE_NAME = 'project' THEN
        v_parent_val := NEW.parent_project_id;
    ELSIF TG_TABLE_NAME = 'project_item' THEN
        v_parent_val := NEW.parent_item_id;
    ELSE
        v_parent_val := NEW.parent_id;
    END IF;
    IF v_parent_val IS NULL THEN RETURN NEW; END IF;

    EXECUTE format(
        'SELECT company_code_id FROM %I.%I WHERE id = $1',
        TG_TABLE_SCHEMA, TG_TABLE_NAME
    ) INTO v_parent_company USING v_parent_val;

    IF v_parent_company IS DISTINCT FROM NEW.company_code_id THEN
        RAISE EXCEPTION '%.% hierarchy violation: parent company (%) != child (%)',
            TG_TABLE_SCHEMA, TG_TABLE_NAME, v_parent_company, NEW.company_code_id
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION "master".trg_enforce_parent_same_company() IS 'Hierarchy guard: parent row must belong to same company_code_id as child. Generic — handles site.parent_site_id, project.parent_project_id, etc.';

CREATE OR REPLACE FUNCTION master.trg_enforce_single_default()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    IF NEW.is_default = true THEN
        UPDATE master.holiday_calendar
           SET is_default = false,
               updated_at = now()
         WHERE tenant_id = NEW.tenant_id
           AND id <> NEW.id
           AND is_default = true;
    END IF;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION master.trg_fn_freeze_keycloak_profile_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'master'
AS $function$
BEGIN
    IF current_setting('app.iam_profile_kc_frozen', true) <> 'true' THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' AND (
        NEW.keycloak_id               IS DISTINCT FROM OLD.keycloak_id
        OR NEW.keycloak_username      IS DISTINCT FROM OLD.keycloak_username
        OR NEW.keycloak_sync_status   IS DISTINCT FROM OLD.keycloak_sync_status
        OR NEW.keycloak_synced_at     IS DISTINCT FROM OLD.keycloak_synced_at
        OR NEW.keycloak_federation_link    IS DISTINCT FROM OLD.keycloak_federation_link
        OR NEW.keycloak_not_before         IS DISTINCT FROM OLD.keycloak_not_before
        OR NEW.keycloak_created_at_millis  IS DISTINCT FROM OLD.keycloak_created_at_millis
        OR NEW.keycloak_required_actions   IS DISTINCT FROM OLD.keycloak_required_actions
        OR NEW.keycloak_service_client_id  IS DISTINCT FROM OLD.keycloak_service_client_id
    ) THEN
        RAISE EXCEPTION
            'principal_profile.keycloak_* columns are frozen — write to master.principal_identity_binding instead. '
            'To disable this guard: SET app.iam_profile_kc_frozen = ''false'''
            USING ERRCODE = 'check_violation',
                  HINT    = 'Run SELECT * FROM master.fn_migrate_principal_identity_bindings(false) to backfill bindings, then verify no code paths write keycloak_* before enabling the freeze.';
    END IF;

    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION "master".trg_fn_freeze_keycloak_profile_columns() IS 'Phase 2 IAM freeze guard. Raises check_violation when app.iam_profile_kc_frozen = ''true'' and an UPDATE tries to modify any keycloak_* column on principal_profile. Enable by setting the GUC after all write paths are migrated to principal_identity_binding.';

CREATE OR REPLACE FUNCTION master.trg_gl_account_parent_class_check()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'master'
AS $function$
DECLARE
    v_parent_class  text;
    v_parent_chart  uuid;
BEGIN
    IF NEW.parent_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT account_class, chart_of_account_id
    INTO   v_parent_class, v_parent_chart
    FROM   master.gl_account
    WHERE  id = NEW.parent_id;

    IF v_parent_chart IS DISTINCT FROM NEW.chart_of_account_id THEN
        RAISE EXCEPTION 'gl_account parent (%) belongs to chart %, but child belongs to chart %',
            NEW.parent_id, v_parent_chart, NEW.chart_of_account_id
            USING ERRCODE = 'check_violation';
    END IF;

    IF v_parent_class IS DISTINCT FROM NEW.account_class THEN
        -- Allow contra_* accounts to nest under their corresponding base class header
        IF NOT (
            (NEW.account_class = 'contra_asset'     AND v_parent_class = 'asset')     OR
            (NEW.account_class = 'contra_liability'  AND v_parent_class = 'liability') OR
            (NEW.account_class = 'contra_equity'    AND v_parent_class = 'equity')    OR
            (NEW.account_class = 'contra_revenue'   AND v_parent_class IN ('income', 'revenue')) OR
            (NEW.account_class = 'contra_expense'   AND v_parent_class = 'expense')
        ) THEN
            RAISE EXCEPTION 'gl_account hierarchy violation: child account_class (%) '
                'differs from parent account_class (%). '
                'An % account cannot nest under an % header.',
                NEW.account_class, v_parent_class,
                NEW.account_class, v_parent_class
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION "master".trg_gl_account_parent_class_check() IS 'Enforces GL account hierarchy: child account_class must match parent. Also validates parent belongs to same chart_of_account.';

CREATE OR REPLACE FUNCTION master.trg_guard_atlas_conversation_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'master'
AS $function$
BEGIN
    IF OLD.type = 'atlas_agent' OR NEW.type = 'atlas_agent' THEN
        IF OLD.type IS DISTINCT FROM NEW.type
           OR OLD.id IS DISTINCT FROM NEW.id
           OR OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
           OR OLD.entity_type IS DISTINCT FROM NEW.entity_type
           OR OLD.entity_id IS DISTINCT FROM NEW.entity_id
           OR OLD.created_at IS DISTINCT FROM NEW.created_at
           OR OLD.created_by IS DISTINCT FROM NEW.created_by
        THEN
            RAISE EXCEPTION
                'master.conversation: Atlas type, identity, tenant, anchor, and creation fields are immutable'
                USING ERRCODE = 'object_not_in_prerequisite_state';
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION master.trg_guard_atlas_message_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'master'
AS $function$
BEGIN
    IF OLD.id IS DISTINCT FROM NEW.id
       OR OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
       OR OLD.conversation_id IS DISTINCT FROM NEW.conversation_id
       OR OLD.plane IS DISTINCT FROM NEW.plane
       OR OLD.sequence IS DISTINCT FROM NEW.sequence
       OR OLD.role IS DISTINCT FROM NEW.role
       OR OLD.run_id IS DISTINCT FROM NEW.run_id
       OR OLD.parent_message_id IS DISTINCT FROM NEW.parent_message_id
       OR OLD.created_at IS DISTINCT FROM NEW.created_at
       OR OLD.created_by IS DISTINCT FROM NEW.created_by
    THEN
        RAISE EXCEPTION
            'master.atlas_message: identity, scope, ordering, role, run, parent, and creation fields are immutable'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    IF OLD.status IN ('completed', 'failed', 'cancelled') THEN
        RAISE EXCEPTION
            'master.atlas_message: terminal messages are immutable; create a correction message'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    IF OLD.status = 'pending' -- INTENTIONALLY HARDCODED: Atlas message lifecycle
       AND NEW.status NOT IN ('pending', 'completed', 'failed', 'cancelled')
    THEN
        RAISE EXCEPTION
            'master.atlas_message: invalid status transition from pending to %',
            NEW.status
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION master.trg_guard_atlas_participant_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'master'
AS $function$
BEGIN
    IF NOT master.fn_is_atlas_conversation(NEW.tenant_id, NEW.conversation_id) THEN
        RETURN NEW;
    END IF;

    IF NEW.role = 'owner' AND NEW.left_at IS NOT NULL THEN
        RAISE EXCEPTION
            'master.conversation_participant: an Atlas owner must be active'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.role = 'owner' AND EXISTS (
        SELECT 1
          FROM master.conversation_participant AS cp
         WHERE cp.tenant_id = NEW.tenant_id
           AND cp.conversation_id = NEW.conversation_id
           AND cp.role = 'owner'
           AND cp.left_at IS NULL
    ) THEN
        RAISE EXCEPTION
            'master.conversation_participant: an Atlas thread has exactly one active owner'
            USING ERRCODE = 'unique_violation';
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION master.trg_guard_atlas_participant_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'master'
AS $function$
DECLARE
    v_principal_id uuid :=
        nullif(current_setting('app.current_principal_id', true), '')::uuid;
BEGIN
    IF NOT master.fn_is_atlas_conversation(OLD.tenant_id, OLD.conversation_id) THEN
        RETURN NEW;
    END IF;

    IF OLD.id IS DISTINCT FROM NEW.id
       OR OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
       OR OLD.conversation_id IS DISTINCT FROM NEW.conversation_id
       OR OLD.principal_id IS DISTINCT FROM NEW.principal_id
       OR OLD.role IS DISTINCT FROM NEW.role
       OR OLD.joined_at IS DISTINCT FROM NEW.joined_at
       OR OLD.created_at IS DISTINCT FROM NEW.created_at
       OR OLD.created_by IS DISTINCT FROM NEW.created_by
    THEN
        RAISE EXCEPTION
            'master.conversation_participant: Atlas identity, role, membership origin, and creation fields are immutable'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    IF OLD.left_at IS NOT NULL AND NEW.left_at IS DISTINCT FROM OLD.left_at THEN
        RAISE EXCEPTION
            'master.conversation_participant: revoked Atlas membership cannot be restored or rewritten'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    IF (
        OLD.last_read_message_id IS DISTINCT FROM NEW.last_read_message_id
        OR OLD.last_read_at IS DISTINCT FROM NEW.last_read_at
    ) AND NEW.principal_id IS DISTINCT FROM v_principal_id THEN
        RAISE EXCEPTION
            'master.conversation_participant: only the participant may advance their Atlas read cursor'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF OLD.role = 'owner' AND OLD.left_at IS DISTINCT FROM NEW.left_at THEN
        RAISE EXCEPTION
            'master.conversation_participant: the Atlas owner cannot leave an owned thread'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION master.trg_guard_atlas_thread_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'master'
AS $function$
BEGIN
    IF OLD.conversation_id IS DISTINCT FROM NEW.conversation_id
       OR OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
       OR OLD.plane IS DISTINCT FROM NEW.plane
       OR OLD.owner_principal_id IS DISTINCT FROM NEW.owner_principal_id
       OR OLD.created_at IS DISTINCT FROM NEW.created_at
       OR OLD.created_by IS DISTINCT FROM NEW.created_by
    THEN
        RAISE EXCEPTION
            'master.atlas_thread: conversation, tenant, plane, owner, and creation fields are immutable'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    IF OLD.summary_blocks IS DISTINCT FROM NEW.summary_blocks
       OR OLD.protected_summary_ref IS DISTINCT FROM NEW.protected_summary_ref
    THEN
        NEW.summary_version := OLD.summary_version + 1;
    ELSIF OLD.summary_version IS DISTINCT FROM NEW.summary_version THEN
        RAISE EXCEPTION
            'master.atlas_thread: summary_version changes only with summary content'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    NEW.row_version := OLD.row_version + 1;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION master.trg_guard_auth_binding_service_client()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'master'
AS $function$
DECLARE
    v_is_service boolean;
BEGIN
    IF NEW.service_client_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT is_service_account INTO v_is_service
    FROM master.principal
    WHERE tenant_id = NEW.tenant_id AND id = NEW.principal_id;

    IF v_is_service IS NULL THEN
        RAISE EXCEPTION 'principal_identity_binding: principal_id (%) not found', NEW.principal_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF NOT v_is_service THEN
        RAISE EXCEPTION
            'principal_identity_binding: service_client_id is set but principal (%) '
            'is not a service account', NEW.principal_id
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION "master".trg_guard_auth_binding_service_client() IS 'Validates service_client_id is only set on service-account principals. Trigger-only enforcement — no inline CHECK.';

CREATE OR REPLACE FUNCTION master.trg_guard_contact_email_channel()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'master'
AS $function$
DECLARE
    v_channel text;
BEGIN
    SELECT channel_type INTO v_channel
    FROM master.contact_link
    WHERE tenant_id = NEW.tenant_id AND id = NEW.contact_link_id;

    IF v_channel IS NULL THEN
        RAISE EXCEPTION
            'contact_email: contact_link % not found for tenant %',
            NEW.contact_link_id, NEW.tenant_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF v_channel <> 'email' THEN
        RAISE EXCEPTION
            'contact_email: contact_link % has channel_type "%" — must be "email"',
            NEW.contact_link_id, v_channel
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION master.trg_guard_contact_phone_channel()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'master'
AS $function$
DECLARE
    v_channel text;
BEGIN
    SELECT channel_type INTO v_channel
    FROM master.contact_link
    WHERE tenant_id = NEW.tenant_id AND id = NEW.contact_link_id;

    IF v_channel IS NULL THEN
        RAISE EXCEPTION
            'contact_phone: contact_link % not found for tenant %',
            NEW.contact_link_id, NEW.tenant_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF v_channel NOT IN ('phone', 'fax', 'sms', 'whatsapp') THEN
        RAISE EXCEPTION
            'contact_phone: contact_link % has channel_type "%" — must be phone, fax, sms, or whatsapp',
            NEW.contact_link_id, v_channel
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION master.trg_guard_house_config_owner()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'master'
AS $function$
DECLARE
    v_owner_type text;
BEGIN
    SELECT owner_type INTO v_owner_type
    FROM master.bank_account_link
    WHERE tenant_id = NEW.tenant_id AND id = NEW.bank_account_link_id;

    IF v_owner_type IS NULL THEN
        RAISE EXCEPTION
            'bank_account_house_config: bank_account_link_id (%) not found for tenant %',
            NEW.bank_account_link_id, NEW.tenant_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF v_owner_type <> 'company_code' THEN
        RAISE EXCEPTION
            'bank_account_house_config: bank_account_link_id (%) has owner_type "%" — '
            'must be "company_code". House config only applies to company-owned accounts.',
            NEW.bank_account_link_id, v_owner_type
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION "master".trg_guard_house_config_owner() IS 'Validates that bank_account_house_config references a bank_account_link with owner_type = ''company_code''. Same pattern as trg_guard_contact_email_channel.';

CREATE OR REPLACE FUNCTION master.trg_guard_owner_type_in_use()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'master'
AS $function$
DECLARE
    v_code text := COALESCE(NEW.code, OLD.code);
BEGIN
    -- Block hard DELETE
    IF TG_OP = 'DELETE' THEN
        IF EXISTS (
            SELECT 1 FROM master.contact_link WHERE owner_type = v_code AND status = 'active'
            UNION ALL
            SELECT 1 FROM master.address_link WHERE owner_type = v_code AND effective_until IS NULL
            LIMIT 1
        ) THEN
            RAISE EXCEPTION
                'Cannot delete owner_type code "%": active contact_link or address_link rows exist.',
                v_code USING ERRCODE = 'foreign_key_violation';
        END IF;
        RETURN OLD;
    END IF;

    -- Block deprecation when active references exist
    IF TG_OP = 'UPDATE'
       AND OLD.status = 'active'
       AND NEW.status = 'deprecated' THEN
        IF EXISTS (
            SELECT 1 FROM master.contact_link WHERE owner_type = v_code AND status = 'active'
            UNION ALL
            SELECT 1 FROM master.address_link WHERE owner_type = v_code AND effective_until IS NULL
            LIMIT 1
        ) THEN
            RAISE EXCEPTION
                'Cannot deprecate owner_type "%" while active contact_link or address_link rows exist. '
                'Migrate or retire those rows first.',
                v_code USING ERRCODE = 'foreign_key_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION master.trg_guard_owner_type_no_shadow()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'master'
AS $function$
BEGIN
    IF NEW.tenant_id IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM master.owner_type
             WHERE code = NEW.code AND tenant_id IS NULL AND status = 'active'
        ) THEN
            RAISE EXCEPTION
                'owner_type: tenant code "%" shadows system code — '
                'choose a different code.',
                NEW.code USING ERRCODE = 'unique_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION master.trg_guard_scope_owner_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'master'
AS $function$
BEGIN
    IF NEW.scope IS DISTINCT FROM OLD.scope THEN
        RAISE EXCEPTION '%.%: scope is immutable after insert (cannot change "%" to "%")',
            TG_TABLE_SCHEMA, TG_TABLE_NAME, OLD.scope, NEW.scope
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.owner_principal_id IS DISTINCT FROM OLD.owner_principal_id THEN
        RAISE EXCEPTION '%.%: owner_principal_id is immutable after insert (cannot change "%" to "%")',
            TG_TABLE_SCHEMA, TG_TABLE_NAME, OLD.owner_principal_id, NEW.owner_principal_id
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION "master".trg_guard_scope_owner_immutable() IS 'Blocks UPDATE changes to scope and owner_principal_id on saved_view and dashboard. scope is immutable: mid-flight changes would silently alter RLS visibility. owner_principal_id is immutable: changes would transfer write-authority without a workflow. To change scope/owner: archive the old artifact and create a new one. Fires BEFORE UPDATE on master.saved_view and master.dashboard.';

CREATE OR REPLACE FUNCTION master.trg_guard_service_client()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'master'
AS $function$
BEGIN
    IF NEW.keycloak_service_client_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM master.principal p
             WHERE p.id = NEW.principal_id
               AND p.tenant_id = NEW.tenant_id
               AND p.is_service_account = true
        ) THEN
            RAISE EXCEPTION
                'keycloak_service_client_id can only be set on service_account principals (principal_id: %)',
                NEW.principal_id
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION master.trg_guard_tenant_status_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'master'
AS $function$
BEGIN
    IF NEW.status = OLD.status THEN RETURN NEW; END IF;

    IF (OLD.status = 'provisioning' AND NEW.status IN ('active', 'terminated'))
    OR (OLD.status = 'active'       AND NEW.status IN ('suspended', 'terminated'))
    OR (OLD.status = 'suspended'    AND NEW.status IN ('active', 'terminated'))
    THEN
        RETURN NEW;
    END IF;

    RAISE EXCEPTION
        'Invalid tenant status transition: % → %. Tenant id: %',
        OLD.status, NEW.status, OLD.id
        USING ERRCODE = 'check_violation';
END;
$function$;

CREATE OR REPLACE FUNCTION master.trg_house_config_default_unique()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'master'
AS $function$
DECLARE
    v_company_id    uuid;
    v_currency      character(3);
    v_eff_from      date;
    v_eff_until     date;
    v_conflict_id   uuid;
BEGIN
    IF NOT NEW.is_default_disbursement AND NOT NEW.is_default_collection THEN
        RETURN NEW;
    END IF;

    SELECT bal.owner_id, ba.currency_code, bal.effective_from, bal.effective_until
    INTO v_company_id, v_currency, v_eff_from, v_eff_until
    FROM master.bank_account_link bal
    JOIN master.bank_account ba ON ba.tenant_id = bal.tenant_id AND ba.id = bal.bank_account_id
    WHERE bal.tenant_id = NEW.tenant_id AND bal.id = NEW.bank_account_link_id;

    IF NEW.is_default_disbursement THEN
        SELECT hc.id INTO v_conflict_id
        FROM master.bank_account_house_config hc
        JOIN master.bank_account_link bal2 ON bal2.tenant_id = hc.tenant_id AND bal2.id = hc.bank_account_link_id
        JOIN master.bank_account ba2 ON ba2.tenant_id = bal2.tenant_id AND ba2.id = bal2.bank_account_id
        WHERE hc.tenant_id = NEW.tenant_id
          AND hc.id != NEW.id
          AND hc.is_default_disbursement = true
          AND hc.status = 'active'
          AND bal2.owner_id = v_company_id
          AND ba2.currency_code = v_currency
          AND daterange(bal2.effective_from, COALESCE(bal2.effective_until, '9999-12-31'::date), '[)')
              &&
              daterange(v_eff_from, COALESCE(v_eff_until, '9999-12-31'::date), '[)')
        LIMIT 1;

        IF v_conflict_id IS NOT NULL THEN
            RAISE EXCEPTION
                'bank_account_house_config: another config (%) is already the default '
                'disbursement account for company_code (%) + currency (%) in an overlapping period',
                v_conflict_id, v_company_id, v_currency
                USING ERRCODE = 'unique_violation';
        END IF;
    END IF;

    IF NEW.is_default_collection THEN
        SELECT hc.id INTO v_conflict_id
        FROM master.bank_account_house_config hc
        JOIN master.bank_account_link bal2 ON bal2.tenant_id = hc.tenant_id AND bal2.id = hc.bank_account_link_id
        JOIN master.bank_account ba2 ON ba2.tenant_id = bal2.tenant_id AND ba2.id = bal2.bank_account_id
        WHERE hc.tenant_id = NEW.tenant_id
          AND hc.id != NEW.id
          AND hc.is_default_collection = true
          AND hc.status = 'active'
          AND bal2.owner_id = v_company_id
          AND ba2.currency_code = v_currency
          AND daterange(bal2.effective_from, COALESCE(bal2.effective_until, '9999-12-31'::date), '[)')
              &&
              daterange(v_eff_from, COALESCE(v_eff_until, '9999-12-31'::date), '[)')
        LIMIT 1;

        IF v_conflict_id IS NOT NULL THEN
            RAISE EXCEPTION
                'bank_account_house_config: another config (%) is already the default '
                'collection account for company_code (%) + currency (%) in an overlapping period',
                v_conflict_id, v_company_id, v_currency
                USING ERRCODE = 'unique_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION "master".trg_house_config_default_unique() IS 'Enforces one default disbursement and one default collection account per (company_code + currency) within overlapping effective periods. Trigger-based because currency and effective dates live on joined tables.';

CREATE OR REPLACE FUNCTION master.trg_house_config_gl_postable()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'master'
AS $function$
DECLARE
    v_company_code_id uuid;
    v_populated       boolean;
BEGIN
    SELECT owner_id INTO v_company_code_id
    FROM master.bank_account_link
    WHERE tenant_id = NEW.tenant_id AND id = NEW.bank_account_link_id;

    IF v_company_code_id IS NULL THEN
        RAISE EXCEPTION
            'bank_account_house_config: parent bank_account_link not found'
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    SELECT c.relispopulated INTO v_populated
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'master'
      AND c.relname = 'mv_company_postable_account'
      AND c.relkind = 'm';

    IF v_populated IS NULL OR v_populated = false THEN
        RAISE WARNING
            'bank_account_house_config: mv_company_postable_account not yet populated — '
            'skipping GL postability check for gl_account_id (%). '
            'Run REFRESH MATERIALIZED VIEW master.mv_company_postable_account.',
            NEW.gl_account_id;
        RETURN NEW;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM master.mv_company_postable_account mpa
        WHERE mpa.tenant_id       = NEW.tenant_id
          AND mpa.company_code_id = v_company_code_id
          AND mpa.gl_account_id   = NEW.gl_account_id
    ) THEN
        RAISE EXCEPTION
            'bank_account_house_config: gl_account_id (%) is not postable for '
            'company_code_id (%). Check mv_company_postable_account.',
            NEW.gl_account_id, v_company_code_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;
    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION "master".trg_house_config_gl_postable() IS 'Validates GL postability for house-bank config. Resolves company_code_id from parent bank_account_link.owner_id. Gracefully skips when mv_company_postable_account has not been refreshed yet.';

CREATE OR REPLACE FUNCTION master.trg_ictp_ic_enabled_guard_fn()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_src_enabled  boolean;
    v_cpty_enabled boolean;
BEGIN
    SELECT is_intercompany_enabled INTO v_src_enabled
    FROM master.company_code
    WHERE tenant_id = NEW.tenant_id AND id = NEW.source_company_code_id;

    SELECT is_intercompany_enabled INTO v_cpty_enabled
    FROM master.company_code
    WHERE tenant_id = NEW.tenant_id AND id = NEW.counterparty_company_code_id;

    IF NOT COALESCE(v_src_enabled, false) THEN
        RAISE EXCEPTION
            'intercompany_trading_pair: source company code % does not have is_intercompany_enabled = true',
            NEW.source_company_code_id
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    IF NOT COALESCE(v_cpty_enabled, false) THEN
        RAISE EXCEPTION
            'intercompany_trading_pair: counterparty company code % does not have is_intercompany_enabled = true',
            NEW.counterparty_company_code_id
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION master.trg_immutable_owner_type_code()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'master'
AS $function$
BEGIN
    IF OLD.code IS DISTINCT FROM NEW.code THEN
        -- System codes are always immutable, regardless of references
        IF OLD.tenant_id IS NULL THEN
            RAISE EXCEPTION
                'owner_type: system code "%" is immutable.',
                OLD.code USING ERRCODE = 'restrict_violation';
        END IF;
        -- Tenant codes are immutable while active references exist
        IF EXISTS (
            SELECT 1 FROM master.contact_link WHERE owner_type = OLD.code AND status = 'active'
            UNION ALL
            SELECT 1 FROM master.address_link  WHERE owner_type = OLD.code AND effective_until IS NULL
            LIMIT 1
        ) THEN
            RAISE EXCEPTION
                'owner_type: cannot rename code "%" while active references exist.',
                OLD.code USING ERRCODE = 'restrict_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION master.trg_label_entity_type_validate()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'master'
AS $function$
declare
  v_relid    oid;
  v_relkind  char;
  v_typname  text;
  v_attnum   smallint;
begin
  begin
    v_relid := format('%I.%I', NEW.source_schema, NEW.source_table)::regclass;
  exception when undefined_table or invalid_schema_name then
    raise exception 'label_entity_type: table %.% does not exist',
      NEW.source_schema, NEW.source_table;
  end;

  select c.relkind into v_relkind from pg_class c where c.oid = v_relid;
  if v_relkind not in ('r', 'p') then
    raise exception 'label_entity_type: %.% is not a table (relkind="%") — only ordinary tables (r) and partitioned tables (p) are supported',
      NEW.source_schema, NEW.source_table, v_relkind;
  end if;

  select t.typname, a.attnum into v_typname, v_attnum
    from pg_attribute a
    join pg_type t on t.oid = a.atttypid
   where a.attrelid = v_relid and a.attname = NEW.pk_column and not a.attisdropped;

  if v_typname is null then
    raise exception 'label_entity_type: column "%" does not exist in %.%',
      NEW.pk_column, NEW.source_schema, NEW.source_table;
  end if;

  if v_typname not in ('text', 'varchar', 'bpchar', 'citext', 'name') then
    raise exception 'label_entity_type: pk_column "%" in %.% has type "%" — must be string-type (text, varchar, char, citext, name)',
      NEW.pk_column, NEW.source_schema, NEW.source_table, v_typname;
  end if;

  if not exists(
    select 1
      from pg_index i
     where i.indrelid = v_relid
       and i.indisunique
       and array_length(i.indkey::int2[], 1) = 1
       and i.indkey::int2[] = ARRAY[v_attnum]::int2[]
  ) then
    raise exception 'label_entity_type: pk_column "%" in %.% must be the sole column of a unique or primary key constraint',
      NEW.pk_column, NEW.source_schema, NEW.source_table;
  end if;

  select t.typname into v_typname
    from pg_attribute a
    join pg_type t on t.oid = a.atttypid
   where a.attrelid = v_relid and a.attname = NEW.name_column and not a.attisdropped;

  if v_typname is null then
    raise exception 'label_entity_type: column "%" does not exist in %.%',
      NEW.name_column, NEW.source_schema, NEW.source_table;
  end if;

  if v_typname not in ('text', 'varchar', 'bpchar', 'citext', 'name') then
    raise exception 'label_entity_type: name_column "%" in %.% has type "%" — must be string-type (text, varchar, char, citext, name)',
      NEW.name_column, NEW.source_schema, NEW.source_table, v_typname;
  end if;

  return NEW;
end;
$function$;

CREATE OR REPLACE FUNCTION master.trg_label_validate()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'master'
AS $function$
declare
  v_schema text;
  v_table  text;
  v_pk_col text;
  v_found  boolean;
  v_lifecycle_only boolean;
begin
  NEW.entity := nullif(btrim(NEW.entity), '');
  NEW.code   := nullif(btrim(NEW.code), '');
  NEW.locale_code := master.fn_normalize_locale_code(NEW.locale_code);

  -- Detect lifecycle-only UPDATE (status, metadata, audit columns).
  -- These must be allowed even on orphaned labels so they can be deprecated.
  v_lifecycle_only := false;
  if TG_OP = 'UPDATE' then
    if  OLD.entity      is not distinct from NEW.entity
    and OLD.code        is not distinct from NEW.code
    and OLD.locale_code is not distinct from NEW.locale_code
    and OLD.name        is not distinct from NEW.name
    and OLD.description is not distinct from NEW.description
    and OLD.tenant_id   is not distinct from NEW.tenant_id
    then
      v_lifecycle_only := true;
    end if;
  end if;

  select source_schema, source_table, pk_column
    into v_schema, v_table, v_pk_col
    from master.label_entity_type
   where entity = NEW.entity;

  if v_schema is null then
    -- Lifecycle-only updates on existing rows are allowed even when entity
    -- is unregistered — this permits deprecating orphaned labels.
    if v_lifecycle_only then
      return NEW;
    end if;

    raise exception
        'master.label: entity "%" is not registered in label_entity_type',
        NEW.entity
        using errcode = 'foreign_key_violation';
  end if;

  -- Skip the source-table existence check for lifecycle-only updates —
  -- the (entity, code) pair was validated on INSERT and hasn't changed.
  if not v_lifecycle_only then
    execute format(
      'select exists(select 1 from %I.%I where %I::text = $1)',
      v_schema, v_table, v_pk_col
    ) into v_found using NEW.code;

    if not v_found then
      raise exception 'master.label: code "%" does not exist in %.% for entity "%"',
        NEW.code, v_schema, v_table, NEW.entity;
    end if;
  end if;

  return NEW;
end;
$function$;

CREATE OR REPLACE FUNCTION master.trg_lebpl_self_bp_guard_fn()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_category text;
BEGIN
    IF NEW.relationship_type = 'self_bp' THEN
        SELECT partner_category INTO v_category
        FROM master.business_partner
        WHERE tenant_id = NEW.tenant_id AND id = NEW.business_partner_id;

        IF v_category IS DISTINCT FROM 'internal' THEN
            RAISE EXCEPTION
                'legal_entity_business_partner_link: self_bp requires partner_category = ''internal'', got ''%'' for business_partner_id=%',
                v_category, NEW.business_partner_id
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;
    END IF;
    RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION master.trg_normalize_contact_link_value()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'master'
AS $function$
BEGIN
    -- Normalize value by channel type
    IF NEW.channel_type = 'email' THEN
        NEW.value := lower(trim(NEW.value));
    ELSE
        NEW.value := trim(NEW.value);
    END IF;

    -- Null-coalesce optional string fields (store NULL, not empty string)
    NEW.purpose := nullif(btrim(coalesce(NEW.purpose, '')), '');
    NEW.code    := nullif(btrim(coalesce(NEW.code,    '')), '');
    NEW.name    := nullif(btrim(coalesce(NEW.name,    '')), '');

    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION "master".trg_normalize_contact_link_value() IS 'Canonical normalization of contact_link fields at write time. email: lower(trim(value)). phone/other: trim(value). purpose/code/name: trimmed, NULL if empty. Must fire BEFORE lookup-validation and uniqueness triggers.';

CREATE OR REPLACE FUNCTION master.trg_normalize_weekend_days()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'master'
AS $function$
BEGIN
    IF NEW.weekend_days IS NOT NULL THEN
        SELECT ARRAY(
            SELECT DISTINCT unnest(NEW.weekend_days) ORDER BY 1
        ) INTO NEW.weekend_days;
    END IF;
    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION "master".trg_normalize_weekend_days() IS 'Normalizes weekend_days to a sorted, deduplicated array. Prevents {5,5} or {6,0} — always stored as sorted unique.';

CREATE OR REPLACE FUNCTION master.trg_odd_scope_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'master', 'pg_temp'
AS $function$
DECLARE
    v_val_company uuid;
BEGIN
    -- Global values (NULL company_code_id) are always compatible
    SELECT dv.company_code_id INTO v_val_company
    FROM master.dimension_value dv
    WHERE dv.id = NEW.dimension_value_id AND dv.tenant_id = NEW.tenant_id;

    IF v_val_company IS NULL THEN RETURN NEW; END IF;

    -- Company-scoped value must match the row's company_code_id
    IF v_val_company IS DISTINCT FROM NEW.company_code_id THEN
        RAISE EXCEPTION
            'Company-scoped dimension value (company %) cannot be assigned to '
            'company_code_dimension_default for company %.',
            v_val_company, NEW.company_code_id
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION "master".trg_odd_scope_guard() IS 'Company-scope guard for master.company_code_dimension_default. Rejects dimension values whose company_code_id does not match the row''s company_code_id. Global dimension values (NULL company_code_id) are always accepted.';

CREATE OR REPLACE FUNCTION master.trg_operating_organization_domain_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    IF NEW.domain IS DISTINCT FROM OLD.domain THEN
        RAISE EXCEPTION 'operating_organization.domain is immutable'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION master.trg_operating_organization_scope_version()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    IF ROW(NEW.parent_id, NEW.effective_from, NEW.effective_until, NEW.status)
       IS DISTINCT FROM
       ROW(OLD.parent_id, OLD.effective_from, OLD.effective_until, OLD.status) THEN
        NEW.scope_version := OLD.scope_version + 1;
    END IF;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION master.trg_owner_type_validate()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'master'
AS $function$
DECLARE
    v_relid   oid;
    v_relkind char;
    v_typname text;
BEGIN
    -- Only rows with a backing table contract need validation
    IF NEW.schema_name IS NULL OR NEW.table_name IS NULL THEN
        RETURN NEW;  -- tenant custom types: no backing table, blocked at ref time
    END IF;

    -- Skip re-validation on UPDATE if routing columns unchanged
    IF TG_OP = 'UPDATE'
       AND NEW.schema_name    IS NOT DISTINCT FROM OLD.schema_name
       AND NEW.table_name     IS NOT DISTINCT FROM OLD.table_name
       AND NEW.pk_column      IS NOT DISTINCT FROM OLD.pk_column
       AND NEW.is_tenant_scoped IS NOT DISTINCT FROM OLD.is_tenant_scoped
       AND NEW.tenant_column  IS NOT DISTINCT FROM OLD.tenant_column
    THEN
        RETURN NEW;
    END IF;

    -- 1. Backing table must exist
    BEGIN
        v_relid := format('%I.%I', NEW.schema_name, NEW.table_name)::regclass;
    EXCEPTION WHEN undefined_table OR invalid_schema_name THEN
        RAISE EXCEPTION
            'owner_type: table %.% does not exist',
            NEW.schema_name, NEW.table_name;
    END;

    SELECT c.relkind INTO v_relkind FROM pg_class c WHERE c.oid = v_relid;
    IF v_relkind NOT IN ('r', 'p') THEN
        RAISE EXCEPTION
            'owner_type: %.% is not a table (relkind="%")',
            NEW.schema_name, NEW.table_name, v_relkind;
    END IF;

    -- 2. pk_column must exist and be uuid-typed
    SELECT t.typname INTO v_typname
      FROM pg_attribute a
      JOIN pg_type t ON t.oid = a.atttypid
     WHERE a.attrelid = v_relid
       AND a.attname  = NEW.pk_column
       AND NOT a.attisdropped;

    IF v_typname IS NULL THEN
        RAISE EXCEPTION
            'owner_type: pk_column "%" does not exist in %.%',
            NEW.pk_column, NEW.schema_name, NEW.table_name;
    END IF;

    IF v_typname <> 'uuid' THEN
        RAISE EXCEPTION
            'owner_type: pk_column "%" in %.% has type "%" — must be uuid',
            NEW.pk_column, NEW.schema_name, NEW.table_name, v_typname;
    END IF;

    -- 3. tenant_column must exist and be uuid-typed when is_tenant_scoped = true
    IF NEW.is_tenant_scoped THEN
        SELECT t.typname INTO v_typname
          FROM pg_attribute a
          JOIN pg_type t ON t.oid = a.atttypid
         WHERE a.attrelid = v_relid
           AND a.attname  = NEW.tenant_column
           AND NOT a.attisdropped;

        IF v_typname IS NULL THEN
            RAISE EXCEPTION
                'owner_type: tenant_column "%" does not exist in %.% (is_tenant_scoped=true)',
                NEW.tenant_column, NEW.schema_name, NEW.table_name;
        END IF;

        IF v_typname <> 'uuid' THEN
            RAISE EXCEPTION
                'owner_type: tenant_column "%" in %.% has type "%" — must be uuid',
                NEW.tenant_column, NEW.schema_name, NEW.table_name, v_typname;
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION master.trg_payment_term_clause_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_term_status text;
BEGIN
    SELECT status INTO v_term_status
      FROM master.payment_term
     WHERE id = OLD.payment_term_id
       AND tenant_id = OLD.tenant_id;

    -- Allow all changes while parent term is draft
    IF v_term_status = 'draft' THEN
        RETURN NEW;
    END IF;

    -- Allow changes to lifecycle-only columns
    IF (NEW.clause_code,  NEW.clause_type,  NEW.sequence_no,
        NEW.settles_clause_code,  NEW.application_scope,  NEW.basis_amount_mode,
        NEW.calc_mode,  NEW.default_pct,  NEW.default_amount,  NEW.currency_code,
        NEW.flexibility_mode,  NEW.min_pct,  NEW.max_pct,  NEW.min_amount,  NEW.max_amount,
        NEW.cumulative_cap_pct,  NEW.cumulative_cap_amount,
        NEW.trigger_event,  NEW.release_event,  NEW.release_delay_days,
        NEW.recovery_start_after_pct,  NEW.recovery_end_before_pct,
        NEW.recovery_method,  NEW.partial_release_pct,  NEW.partial_release_event,
        NEW.rounding_method,  NEW.rounding_scale,  NEW.metadata)
       IS DISTINCT FROM
       (OLD.clause_code,  OLD.clause_type,  OLD.sequence_no,
        OLD.settles_clause_code,  OLD.application_scope,  OLD.basis_amount_mode,
        OLD.calc_mode,  OLD.default_pct,  OLD.default_amount,  OLD.currency_code,
        OLD.flexibility_mode,  OLD.min_pct,  OLD.max_pct,  OLD.min_amount,  OLD.max_amount,
        OLD.cumulative_cap_pct,  OLD.cumulative_cap_amount,
        OLD.trigger_event,  OLD.release_event,  OLD.release_delay_days,
        OLD.recovery_start_after_pct,  OLD.recovery_end_before_pct,
        OLD.recovery_method,  OLD.partial_release_pct,  OLD.partial_release_event,
        OLD.rounding_method,  OLD.rounding_scale,  OLD.metadata)
    THEN
        RAISE EXCEPTION 'payment_term_clause: business columns are immutable once parent term status is not draft (term status=%)',
            v_term_status;
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION master.trg_payment_term_discount_tier_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_term_status text;
BEGIN
    SELECT status INTO v_term_status
      FROM master.payment_term
     WHERE id = OLD.payment_term_id
       AND tenant_id = OLD.tenant_id;

    -- Allow all changes while parent term is draft
    IF v_term_status = 'draft' THEN
        RETURN NEW;
    END IF;

    -- Allow changes to lifecycle-only columns
    IF (NEW.tier_no,  NEW.qualify_within_days,  NEW.discount_pct,
        NEW.discount_fixed,  NEW.currency_code,  NEW.discount_basis_mode,
        NEW.min_invoice_amount,  NEW.is_best_only,  NEW.metadata)
       IS DISTINCT FROM
       (OLD.tier_no,  OLD.qualify_within_days,  OLD.discount_pct,
        OLD.discount_fixed,  OLD.currency_code,  OLD.discount_basis_mode,
        OLD.min_invoice_amount,  OLD.is_best_only,  OLD.metadata)
    THEN
        RAISE EXCEPTION 'payment_term_discount_tier: business columns are immutable once parent term status is not draft (term status=%)',
            v_term_status;
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION master.trg_payment_term_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- Only enforce once term leaves draft
    IF OLD.status = 'draft' THEN
        RETURN NEW;
    END IF;

    -- Allow changes to lifecycle-only columns
    IF (NEW.code,  NEW.name,  NEW.description,  NEW.applicable_to,
        NEW.base_event,  NEW.due_rule_type,  NEW.due_days,  NEW.due_day_of_month,
        NEW.grace_days,  NEW.due_date_flexibility,  NEW.business_day_convention,
        NEW.holiday_calendar_id,  NEW.month_offset,  NEW.term_category,
        NEW.installment_count,  NEW.version,  NEW.supersedes_payment_term_id,
        NEW.effective_from,  NEW.effective_to,  NEW.sort_order,  NEW.metadata)
       IS DISTINCT FROM
       (OLD.code,  OLD.name,  OLD.description,  OLD.applicable_to,
        OLD.base_event,  OLD.due_rule_type,  OLD.due_days,  OLD.due_day_of_month,
        OLD.grace_days,  OLD.due_date_flexibility,  OLD.business_day_convention,
        OLD.holiday_calendar_id,  OLD.month_offset,  OLD.term_category,
        OLD.installment_count,  OLD.version,  OLD.supersedes_payment_term_id,
        OLD.effective_from,  OLD.effective_to,  OLD.sort_order,  OLD.metadata)
    THEN
        RAISE EXCEPTION 'payment_term: business columns are immutable once status is not draft (current status=%)',
            OLD.status;
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION master.trg_people_org_unit_path()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'master', 'document', 'shared', 'pg_catalog'
AS $function$
DECLARE
    v_parent_id uuid := NEW.parent_id;
    v_seen uuid[] := ARRAY[NEW.id];
    v_depth integer := 1;
    v_parent_code text;
    v_parent_path text;
    v_parent_level smallint;
BEGIN
    IF btrim(NEW.code) = '' THEN
        RAISE EXCEPTION 'ORG_UNIT_INVALID: code must not be empty';
    END IF;

    WHILE v_parent_id IS NOT NULL LOOP
        IF v_parent_id = ANY (v_seen) THEN
            RAISE EXCEPTION 'ORG_UNIT_CYCLE: org_unit % cannot be parented under its own descendant', NEW.id;
        END IF;

        v_seen := array_append(v_seen, v_parent_id);

        SELECT parent_id
          INTO v_parent_id
          FROM master.org_unit
         WHERE tenant_id = NEW.tenant_id
           AND id = v_parent_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'ORG_UNIT_PARENT_MISSING: parent org_unit % does not exist for tenant %', v_seen[array_length(v_seen, 1)], NEW.tenant_id;
        END IF;

        v_depth := v_depth + 1;
        IF v_depth > 25 THEN
            RAISE EXCEPTION 'ORG_UNIT_DEPTH_LIMIT: hierarchy depth exceeds 25 for org_unit %', NEW.id;
        END IF;
    END LOOP;

    IF NEW.parent_id IS NULL THEN
        NEW.level_no := 1;
        NEW.path := '/' || NEW.code;
    ELSE
        SELECT code, path, level_no
          INTO v_parent_code, v_parent_path, v_parent_level
          FROM master.org_unit
         WHERE tenant_id = NEW.tenant_id
           AND id = NEW.parent_id;

        NEW.level_no := COALESCE(v_parent_level, 0) + 1;
        NEW.path := COALESCE(v_parent_path, '/' || v_parent_code) || '/' || NEW.code;
    END IF;

    IF TG_OP = 'UPDATE'
       AND OLD.path IS NOT NULL
       AND NEW.path IS DISTINCT FROM OLD.path THEN
        UPDATE master.org_unit
           SET path = NEW.path || substring(path FROM length(OLD.path) + 1),
               level_no = NEW.level_no + (level_no - OLD.level_no)
         WHERE tenant_id = NEW.tenant_id
           AND path LIKE OLD.path || '/%';
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION master.trg_pra_approved_immutable_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'master'
AS $function$
BEGIN
    IF OLD.status = 'approved' THEN

        -- Block structural identity / scoring columns.
        IF (
            OLD.subject_type         IS DISTINCT FROM NEW.subject_type         OR
            OLD.subject_id           IS DISTINCT FROM NEW.subject_id           OR
            OLD.business_partner_id  IS DISTINCT FROM NEW.business_partner_id  OR
            OLD.assessment_context   IS DISTINCT FROM NEW.assessment_context   OR
            OLD.model_code           IS DISTINCT FROM NEW.model_code           OR
            OLD.model_version        IS DISTINCT FROM NEW.model_version        OR
            OLD.overall_score        IS DISTINCT FROM NEW.overall_score
        ) THEN
            RAISE EXCEPTION
                'party_risk_assessment: structural columns are immutable once status=approved. '
                'Blocked: subject_type, subject_id, business_partner_id, assessment_context, '
                'model_code, model_version, overall_score. '
                'To change scoring, create a new assessment and supersede this one.'
                USING ERRCODE = 'object_not_in_prerequisite_state';
        END IF;

        -- If risk_band changes on an approved assessment, it must be a declared
        -- manual override: is_override=true and override_reason set.
        IF OLD.risk_band IS DISTINCT FROM NEW.risk_band THEN
            IF NOT NEW.is_override OR NEW.override_reason IS NULL THEN
                RAISE EXCEPTION
                    'party_risk_assessment: changing risk_band on an approved assessment '
                    'requires is_override=true and a non-null override_reason. '
                    'Set is_override=true, provide override_reason, and set override_score '
                    'to document the basis for the manual band change.'
                    USING ERRCODE = 'object_not_in_prerequisite_state';
            END IF;
        END IF;

    END IF;
    RETURN NEW;
END $function$;

COMMENT ON FUNCTION "master".trg_pra_approved_immutable_fn() IS 'Two-part guard on approved party_risk_assessment rows. Part 1 — structural lock: blocks changes to subject_type, subject_id, business_partner_id, assessment_context, model_code, model_version, overall_score. Part 2 — override gate: if risk_band changes while status=approved, is_override must be true and override_reason must be non-null. Mutable without restriction: notes, next_review_at, review_frequency, status, approved_at/by, assessed_at/by, superseded_by, updated_at/by.';

CREATE OR REPLACE FUNCTION master.trg_pra_sync_qualification_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'master'
AS $function$
BEGIN
    -- Guard: pra_approved_band_chk prevents approved+unknown at the DB level,
    -- but NULLIF is kept here as a defensive fallback so the sync never writes
    -- a value that violates supplier_qualification.sq_risk_tier_chk.
    IF NEW.status = 'approved' AND NEW.assessment_context = 'supplier_role' THEN
        UPDATE master.supplier_qualification
        SET
            risk_tier        = NULLIF(NEW.risk_band, 'unknown'),
            next_review_date = NEW.next_review_at,
            last_review_date = COALESCE(NEW.approved_at::date, CURRENT_DATE),
            updated_at       = now(),
            updated_by       = COALESCE(NEW.approved_by, NEW.assessed_by)
        WHERE tenant_id   = NEW.tenant_id
          AND supplier_id = NEW.subject_id;
    END IF;
    RETURN NEW;
END $function$;

COMMENT ON FUNCTION "master".trg_pra_sync_qualification_fn() IS 'Denormalizes approved supplier_role risk_band into supplier_qualification.risk_tier + next_review_date + last_review_date. Fires on INSERT and on UPDATE OF status, risk_band, next_review_at, approved_at, approved_by. NULLIF maps unknown → NULL defensively (pra_approved_band_chk should prevent it reaching here). Customer qualification credit_status is NOT synced — managed by the credit review workflow.';

CREATE OR REPLACE FUNCTION master.trg_prd_child_consistency_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'master'
AS $function$
DECLARE
    v_score_assessment_id   uuid;
    v_assessment_bp_id      uuid;
    v_evidence_bp_id        uuid;
BEGIN
    -- Check 1: dimension_score_id must belong to the same assessment.
    IF NEW.dimension_score_id IS NOT NULL THEN
        SELECT assessment_id INTO v_score_assessment_id
        FROM master.party_risk_dimension_score
        WHERE tenant_id = NEW.tenant_id AND id = NEW.dimension_score_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION
                'party_risk_driver: dimension_score_id % not found for tenant %',
                NEW.dimension_score_id, NEW.tenant_id
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;

        IF v_score_assessment_id <> NEW.assessment_id THEN
            RAISE EXCEPTION
                'party_risk_driver: dimension_score % belongs to assessment % '
                'but driver references assessment %',
                NEW.dimension_score_id, v_score_assessment_id, NEW.assessment_id
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;
    END IF;

    -- Check 2: evidence_id (when set) must belong to the same business partner
    -- as the assessment. Cross-BP evidence attachment is not allowed.
    IF NEW.evidence_id IS NOT NULL THEN
        SELECT business_partner_id INTO v_assessment_bp_id
        FROM master.party_risk_assessment
        WHERE tenant_id = NEW.tenant_id AND id = NEW.assessment_id;

        SELECT business_partner_id INTO v_evidence_bp_id
        FROM master.party_risk_evidence
        WHERE tenant_id = NEW.tenant_id AND id = NEW.evidence_id;

        IF v_evidence_bp_id IS NULL OR v_evidence_bp_id <> v_assessment_bp_id THEN
            RAISE EXCEPTION
                'party_risk_driver: evidence % has business_partner_id % '
                'which does not match assessment % business_partner_id %',
                NEW.evidence_id, v_evidence_bp_id,
                NEW.assessment_id, v_assessment_bp_id
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;
    END IF;

    RETURN NEW;
END $function$;

COMMENT ON FUNCTION "master".trg_prd_child_consistency_fn() IS 'Two-check consistency guard for party_risk_driver children. Check 1: dimension_score_id (when set) must belong to the same assessment_id. Check 2: evidence_id (when set) must have the same business_partner_id as the assessment — prevents cross-BP evidence attachment. Composite FKs handle tenant isolation; this trigger handles cross-record consistency within the same tenant.';

CREATE OR REPLACE FUNCTION master.trg_pre_core_immutable_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'master'
AS $function$
BEGIN
    IF (
        OLD.tenant_id           IS DISTINCT FROM NEW.tenant_id           OR
        OLD.subject_type        IS DISTINCT FROM NEW.subject_type        OR
        OLD.subject_id          IS DISTINCT FROM NEW.subject_id          OR
        OLD.business_partner_id IS DISTINCT FROM NEW.business_partner_id OR
        OLD.source_code         IS DISTINCT FROM NEW.source_code         OR
        OLD.source_reference    IS DISTINCT FROM NEW.source_reference    OR
        OLD.evidence_type       IS DISTINCT FROM NEW.evidence_type       OR
        OLD.evidence_date       IS DISTINCT FROM NEW.evidence_date       OR
        OLD.received_at         IS DISTINCT FROM NEW.received_at         OR
        OLD.valid_from          IS DISTINCT FROM NEW.valid_from          OR
        OLD.ingested_by         IS DISTINCT FROM NEW.ingested_by         OR
        OLD.ingested_via        IS DISTINCT FROM NEW.ingested_via        OR
        OLD.created_at          IS DISTINCT FROM NEW.created_at          OR
        OLD.created_by          IS DISTINCT FROM NEW.created_by
    ) THEN
        RAISE EXCEPTION
            'party_risk_evidence: identity, source, and classification columns are '
            'immutable after insert. Immutable: tenant_id, subject_*, '
            'business_partner_id, source_code, source_reference, evidence_type, '
            'evidence_date, received_at, valid_from, ingested_by/via, created_at/by. '
            'Allowed: status, normalized_payload, confidence_score, tags, summary, '
            'title, valid_until, superseded_by, updated_at/by.'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    RETURN NEW;
END $function$;

COMMENT ON FUNCTION "master".trg_pre_core_immutable_fn() IS 'Core immutability guard for party_risk_evidence. Immutable after insert: all identity, source, and classification fields. raw_payload has a dedicated guard (trg_pre_raw_payload_immutable). Mutable: status transitions, normalized_payload re-processing, tags, summary/title corrections, valid_until extension, superseded_by linkage.';

CREATE OR REPLACE FUNCTION master.trg_pre_raw_payload_immutable_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'master'
AS $function$
BEGIN
    IF OLD.raw_payload IS NOT NULL
       AND OLD.raw_payload IS DISTINCT FROM NEW.raw_payload THEN
        RAISE EXCEPTION
            'party_risk_evidence: raw_payload is immutable once written. '
            'Update normalized_payload for re-processed interpretations.'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    RETURN NEW;
END $function$;

COMMENT ON FUNCTION "master".trg_pre_raw_payload_immutable_fn() IS 'Blocks changes to raw_payload after it is first set. Allowed: normalized_payload, status, tags, updated_at/by, valid_until, summary. Blocked: raw_payload (exact provider response must be preserved as received).';

CREATE OR REPLACE FUNCTION master.trg_project_item_company_integrity()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'master'
AS $function$
DECLARE
    v_project_company uuid;
    v_parent_company  uuid;
BEGIN
    SELECT company_code_id INTO v_project_company
    FROM master.project WHERE id = NEW.project_id;

    IF v_project_company IS DISTINCT FROM NEW.company_code_id THEN
        RAISE EXCEPTION 'project_item.company_code_id (%) must match project.company_code_id (%)',
            NEW.company_code_id, v_project_company
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.parent_item_id IS NOT NULL THEN
        SELECT company_code_id INTO v_parent_company
        FROM master.project_item WHERE id = NEW.parent_item_id;

        IF v_parent_company IS DISTINCT FROM NEW.company_code_id THEN
            RAISE EXCEPTION 'project_item parent (%) belongs to different company (%)',
                NEW.parent_item_id, v_parent_company
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION "master".trg_project_item_company_integrity() IS 'Ensures project_item.company_code_id matches parent project and parent_item.';

CREATE OR REPLACE FUNCTION master.trg_prre_no_update_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'master'
AS $function$
BEGIN
    RAISE EXCEPTION
        'party_risk_review_event: rows are immutable after insert. '
        'The review event log is an append-only audit trail.'
        USING ERRCODE = 'object_not_in_prerequisite_state';
    RETURN NULL;
END $function$;

COMMENT ON FUNCTION "master".trg_prre_no_update_fn() IS 'Blocks all UPDATE operations on party_risk_review_event. The table is an append-only audit trail — correct errors by inserting a new event with a correction note, not by modifying existing rows.';

CREATE OR REPLACE FUNCTION master.trg_risk_subject_binding_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'master'
AS $function$
DECLARE
    v_bp_id uuid;
BEGIN
    IF NEW.subject_type = 'business_partner' THEN
        IF NEW.subject_id <> NEW.business_partner_id THEN
            RAISE EXCEPTION
                'risk subject binding: subject_type=business_partner requires '
                'subject_id = business_partner_id (got % vs %)',
                NEW.subject_id, NEW.business_partner_id
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;

    ELSIF NEW.subject_type = 'supplier' THEN
        SELECT business_partner_id INTO v_bp_id
        FROM master.supplier
        WHERE tenant_id = NEW.tenant_id AND id = NEW.subject_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION
                'risk subject binding: supplier % not found for tenant %',
                NEW.subject_id, NEW.tenant_id
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;
        IF v_bp_id <> NEW.business_partner_id THEN
            RAISE EXCEPTION
                'risk subject binding: supplier %.business_partner_id = % '
                'does not match provided business_partner_id %',
                NEW.subject_id, v_bp_id, NEW.business_partner_id
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;

    ELSIF NEW.subject_type = 'customer' THEN
        SELECT business_partner_id INTO v_bp_id
        FROM master.customer
        WHERE tenant_id = NEW.tenant_id AND id = NEW.subject_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION
                'risk subject binding: customer % not found for tenant %',
                NEW.subject_id, NEW.tenant_id
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;
        IF v_bp_id <> NEW.business_partner_id THEN
            RAISE EXCEPTION
                'risk subject binding: customer %.business_partner_id = % '
                'does not match provided business_partner_id %',
                NEW.subject_id, v_bp_id, NEW.business_partner_id
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;
    END IF;
    -- project_engagement: validated at application layer.

    RETURN NEW;
END $function$;

COMMENT ON FUNCTION "master".trg_risk_subject_binding_fn() IS 'Validates that subject_id + business_partner_id are consistent for business_partner, supplier, and customer subject types. business_partner: subject_id must equal business_partner_id. supplier/customer: looks up the role row and checks its business_partner_id FK. project_engagement: validated at application layer (no direct table here).';

CREATE OR REPLACE FUNCTION master.trg_scp_validate_payment_method_direction()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'master'
AS $function$
DECLARE
    v_direction text;
BEGIN
    IF NEW.payment_method_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT direction INTO v_direction
    FROM master.payment_method
    WHERE tenant_id = NEW.tenant_id AND id = NEW.payment_method_id;

    IF v_direction IS NULL THEN
        RAISE EXCEPTION
            'company_code_supplier_profile: payment_method_id (%) not found',
            NEW.payment_method_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF lower(v_direction) NOT IN ('outbound', 'both') THEN
        RAISE EXCEPTION
            'company_code_supplier_profile: payment_method_id (%) has direction "%" '
            '— must be OUTBOUND or BOTH for supplier disbursement methods',
            NEW.payment_method_id, v_direction
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION "master".trg_scp_validate_payment_method_direction() IS 'Validates that payment_method_id on company_code_supplier_profile references a payment_method with direction OUTBOUND or BOTH.';

CREATE OR REPLACE FUNCTION master.trg_scp_validate_remittance_bank_link()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'master'
AS $function$
DECLARE
    v_link_owner_type  text;
    v_link_owner_id    uuid;
    v_link_company_id  uuid;
    v_supplier_bp_id   uuid;
BEGIN
    IF NEW.preferred_remittance_bank_link_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT owner_type, owner_id, company_code_id
    INTO v_link_owner_type, v_link_owner_id, v_link_company_id
    FROM master.bank_account_link
    WHERE tenant_id = NEW.tenant_id AND id = NEW.preferred_remittance_bank_link_id;

    IF v_link_owner_type IS NULL THEN
        RAISE EXCEPTION
            'company_code_supplier_profile: preferred_remittance_bank_link_id (%) not found',
            NEW.preferred_remittance_bank_link_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    SELECT business_partner_id
    INTO v_supplier_bp_id
    FROM master.supplier
    WHERE tenant_id = NEW.tenant_id
      AND id = NEW.supplier_id;

    IF v_supplier_bp_id IS NULL THEN
        RAISE EXCEPTION
            'company_code_supplier_profile: supplier (%) not found',
            NEW.supplier_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    -- Canonical owner is the supplier's BP. Supplier-owned links remain valid
    -- only as a compatibility lens for older data.
    IF NOT (
        (v_link_owner_type = 'business_partner' AND v_link_owner_id = v_supplier_bp_id)
        OR
        (v_link_owner_type = 'supplier' AND v_link_owner_id = NEW.supplier_id)
    ) THEN
        RAISE EXCEPTION
            'company_code_supplier_profile: bank_account_link (%) belongs to owner_type "%", owner_id (%), '
            'but this profile is for supplier (%) / business partner (%). Must match.',
            NEW.preferred_remittance_bank_link_id, v_link_owner_type, v_link_owner_id,
            NEW.supplier_id, v_supplier_bp_id
            USING ERRCODE = 'check_violation';
    END IF;

    -- Company scope: link must be tenant-wide (NULL) or match this company
    IF v_link_company_id IS NOT NULL AND v_link_company_id <> NEW.company_code_id THEN
        RAISE EXCEPTION
            'company_code_supplier_profile: bank_account_link (%) is scoped to company (%), '
            'but this profile is for company (%). Must match or be tenant-wide.',
            NEW.preferred_remittance_bank_link_id, v_link_company_id, NEW.company_code_id
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION "master".trg_scp_validate_remittance_bank_link() IS 'Validates that preferred_remittance_bank_link_id on company_code_supplier_profile references a bank_account_link owned by the supplier business_partner (canonical) or the same supplier (legacy compatibility), and scoped to the same or tenant-wide company.';

CREATE OR REPLACE FUNCTION master.trg_supplier_app_index_sync()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'master', 'shared', 'pg_catalog'
AS $function$
DECLARE
    v_bp  record;
    v_row record;
BEGIN
    IF TG_OP = 'DELETE' THEN
        DELETE FROM master.supplier_app_index
        WHERE supplier_id = OLD.id AND tenant_id = OLD.tenant_id;
        RETURN OLD;
    END IF;

    v_row := NEW;

    SELECT * INTO v_bp
    FROM master.business_partner
    WHERE id = v_row.business_partner_id AND tenant_id = v_row.tenant_id;

    INSERT INTO master.supplier_app_index (
        id, tenant_id, supplier_id, business_partner_id,
        supplier_code, supplier_type, supplier_status, is_payment_ready,
        business_partner_code, name, display_name, legal_name, legal_form,
        registration_no, registration_country_code, tax_residence_country_code,
        partner_category, aliases, business_types, search_text, updated_at
    ) VALUES (
        v_row.id,
        v_row.tenant_id,
        v_row.id,
        v_row.business_partner_id,
        v_row.supplier_code,
        v_row.supplier_type,
        v_row.status,
        coalesce(v_row.is_payment_ready, false),
        v_bp.code,
        v_bp.name,
        coalesce(v_bp.display_name, v_bp.name),
        v_bp.legal_name,
        v_bp.legal_form,
        v_bp.registration_no,
        v_bp.registration_country_code,
        v_bp.tax_residence_country_code,
        v_bp.partner_category,
        v_bp.aliases,
        coalesce(v_bp.business_types, '{}'),
        lower(
            coalesce(v_row.supplier_code, '')                         || ' ' ||
            coalesce(v_bp.code, '')                                   || ' ' ||
            coalesce(v_bp.name, '')                                   || ' ' ||
            coalesce(v_bp.display_name, '')                           || ' ' ||
            coalesce(v_bp.legal_name, '')                             || ' ' ||
            coalesce(v_bp.registration_no, '')                        || ' ' ||
            coalesce(array_to_string(v_bp.aliases, ' '), '')          || ' ' ||
            coalesce(array_to_string(v_bp.business_types, ' '), '')
        ),
        now()
    )
    ON CONFLICT (tenant_id, supplier_id) DO UPDATE SET
        supplier_code              = EXCLUDED.supplier_code,
        supplier_type              = EXCLUDED.supplier_type,
        supplier_status            = EXCLUDED.supplier_status,
        is_payment_ready           = EXCLUDED.is_payment_ready,
        business_partner_code      = EXCLUDED.business_partner_code,
        name                       = EXCLUDED.name,
        display_name               = EXCLUDED.display_name,
        legal_name                 = EXCLUDED.legal_name,
        legal_form                 = EXCLUDED.legal_form,
        registration_no            = EXCLUDED.registration_no,
        registration_country_code  = EXCLUDED.registration_country_code,
        tax_residence_country_code = EXCLUDED.tax_residence_country_code,
        partner_category           = EXCLUDED.partner_category,
        aliases                    = EXCLUDED.aliases,
        business_types             = EXCLUDED.business_types,
        search_text                = EXCLUDED.search_text,
        updated_at                 = now();

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION master.trg_sync_deleted_at_with_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'master'
AS $function$
BEGIN
    -- Status changed: sync deleted_at accordingly
    IF NEW.status IS DISTINCT FROM OLD.status THEN
        IF NEW.status = 'archived' AND NEW.deleted_at IS NULL THEN
            NEW.deleted_at := now();
        ELSIF NEW.status = 'active' THEN
            NEW.deleted_at := NULL;
        END IF;
        RETURN NEW;
    END IF;

    -- Status unchanged but deleted_at was directly modified: block it
    IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
        RAISE EXCEPTION
            '%.%: deleted_at cannot be set directly — change status to ''archived'' instead',
            TG_TABLE_SCHEMA, TG_TABLE_NAME
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION "master".trg_sync_deleted_at_with_status() IS 'Synchronises deleted_at with status lifecycle for saved_view and dashboard. status → ''archived'': stamps deleted_at = now(). status → ''active'': clears deleted_at (restore / un-archive). Blocks direct deleted_at manipulation when status is unchanged. Fires BEFORE UPDATE on master.saved_view and master.dashboard.';

CREATE OR REPLACE FUNCTION master.trg_validate_atlas_participant_cursor()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'master'
AS $function$
BEGIN
    IF NEW.last_read_message_id IS NOT NULL
       AND master.fn_is_atlas_conversation(NEW.tenant_id, NEW.conversation_id)
       AND NOT EXISTS (
            SELECT 1
              FROM master.atlas_message AS m
             WHERE m.tenant_id = NEW.tenant_id
               AND m.conversation_id = NEW.conversation_id
               AND m.id = NEW.last_read_message_id
       )
    THEN
        RAISE EXCEPTION
            'master.conversation_participant: Atlas read cursor must reference a message in the same thread'
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION master.trg_validate_atlas_thread_envelope()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'master'
AS $function$
DECLARE
    v_type text;
    v_active_owner_count integer;
BEGIN
    SELECT c.type
      INTO v_type
      FROM master.conversation AS c
     WHERE c.tenant_id = NEW.tenant_id
       AND c.id = NEW.conversation_id;

    IF v_type IS DISTINCT FROM 'atlas_agent' THEN
        RAISE EXCEPTION
            'master.atlas_thread: parent conversation must have type atlas_agent'
            USING ERRCODE = 'check_violation';
    END IF;

    SELECT count(*)::integer
      INTO v_active_owner_count
      FROM master.conversation_participant AS cp
     WHERE cp.tenant_id = NEW.tenant_id
       AND cp.conversation_id = NEW.conversation_id
       AND cp.role = 'owner'
       AND cp.left_at IS NULL;

    IF v_active_owner_count <> 1 OR NOT EXISTS (
        SELECT 1
          FROM master.conversation_participant AS cp
         WHERE cp.tenant_id = NEW.tenant_id
           AND cp.conversation_id = NEW.conversation_id
           AND cp.principal_id = NEW.owner_principal_id
           AND cp.role = 'owner'
           AND cp.left_at IS NULL
    ) THEN
        RAISE EXCEPTION
            'master.atlas_thread: owner must be the one active owner participant'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION master.trg_validate_comment_mentions()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'master'
AS $function$
BEGIN
    IF NEW.mentions IS NOT NULL THEN
        IF jsonb_typeof(NEW.mentions) <> 'array' THEN
            RAISE EXCEPTION 'master.comment.mentions must be a JSON array'
                USING ERRCODE = 'check_violation';
        END IF;
        IF EXISTS (
            SELECT 1 FROM jsonb_array_elements(NEW.mentions) elem
            WHERE jsonb_typeof(elem) <> 'object' OR NOT (elem ? 'user_id')
        ) THEN
            RAISE EXCEPTION
                'master.comment.mentions: each element must be an object with user_id key'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION master.trg_validate_current_payment_term()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_is_current boolean;
    v_status     text;
BEGIN
    -- Only validate when payment_term_id is set
    IF NEW.payment_term_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT is_current_version, status
      INTO v_is_current, v_status
      FROM master.payment_term
     WHERE id = NEW.payment_term_id
       AND tenant_id = NEW.tenant_id;

    IF v_is_current IS NULL THEN
        RAISE EXCEPTION '% payment_term_id not found in tenant',
            TG_TABLE_NAME;
    END IF;

    IF v_is_current <> true THEN
        RAISE EXCEPTION '% payment_term_id must reference the current version of a payment term',
            TG_TABLE_NAME;
    END IF;

    IF v_status <> 'active' THEN
        RAISE EXCEPTION '% payment_term_id must reference an active payment term, found status=%',
            TG_TABLE_NAME, v_status;
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION master.trg_validate_operating_organization_company()
 RETURNS trigger
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'master', 'pg_temp'
AS $function$
DECLARE
    v_domain text;
BEGIN
    SELECT domain INTO v_domain
    FROM master.operating_organization
    WHERE tenant_id = NEW.tenant_id
      AND id = NEW.operating_organization_id;

    IF v_domain IS NULL THEN
        RAISE EXCEPTION 'operating_organization_company: organization % not found for tenant %',
            NEW.operating_organization_id, NEW.tenant_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF v_domain = 'procurement'
       AND NEW.participation_role NOT IN (
           'lead_buyer', 'participant', 'beneficiary',
           'central_buyer', 'contracting_company'
       ) THEN
        RAISE EXCEPTION 'operating_organization_company: role % is invalid for procurement',
            NEW.participation_role USING ERRCODE = 'check_violation';
    ELSIF v_domain = 'sales'
       AND NEW.participation_role NOT IN (
           'lead_seller', 'participant', 'beneficiary', 'booking_company',
           'invoicing_company', 'fulfillment_company'
       ) THEN
        RAISE EXCEPTION 'operating_organization_company: role % is invalid for sales',
            NEW.participation_role USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION master.trg_validate_operating_organization_hierarchy()
 RETURNS trigger
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'master', 'pg_temp'
AS $function$
BEGIN
    IF NEW.parent_id IS NULL THEN
        RETURN NEW;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM master.operating_organization parent
        WHERE parent.tenant_id = NEW.tenant_id
          AND parent.id = NEW.parent_id
          AND parent.domain = NEW.domain
    ) THEN
        RAISE EXCEPTION
            'operating_organization: parent % is missing or belongs to another tenant/domain',
            NEW.parent_id USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF EXISTS (
        WITH RECURSIVE lineage AS (
            SELECT oo.id, oo.parent_id
            FROM master.operating_organization oo
            WHERE oo.tenant_id = NEW.tenant_id AND oo.id = NEW.parent_id
            UNION ALL
            SELECT parent.id, parent.parent_id
            FROM master.operating_organization parent
            JOIN lineage child ON child.parent_id = parent.id
            WHERE parent.tenant_id = NEW.tenant_id
        )
        SELECT 1 FROM lineage WHERE id = NEW.id
    ) THEN
        RAISE EXCEPTION 'operating_organization: hierarchy cycle detected for %',
            NEW.id USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION master.trg_validate_operating_organization_profile()
 RETURNS trigger
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'master', 'pg_temp'
AS $function$
DECLARE
    v_domain text;
    v_expected_domain text := TG_ARGV[0];
BEGIN
    SELECT domain INTO v_domain
    FROM master.operating_organization
    WHERE tenant_id = NEW.tenant_id
      AND id = NEW.operating_organization_id;

    IF v_domain IS NULL THEN
        RAISE EXCEPTION 'operating organization % not found for tenant %',
            NEW.operating_organization_id, NEW.tenant_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF v_domain <> v_expected_domain THEN
        RAISE EXCEPTION 'operating organization % has domain %, expected %',
            NEW.operating_organization_id, v_domain, v_expected_domain
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION master.trg_validate_owner_ref()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'master'
AS $function$
DECLARE
    v_schema           text;
    v_table            text;
    v_pk_col           text;
    v_is_tenant_scoped boolean;
    v_tenant_column    text;
    v_exists           boolean;
    v_session          uuid;
BEGIN
    v_session := shared.current_tenant_id_soft();

    SELECT schema_name, table_name, pk_column, is_tenant_scoped, tenant_column
      INTO v_schema, v_table, v_pk_col, v_is_tenant_scoped, v_tenant_column
      FROM master.owner_type
     WHERE code   = NEW.owner_type
       AND status = 'active'
       AND (tenant_id IS NULL OR tenant_id = v_session)
     ORDER BY tenant_id NULLS FIRST
     LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION '%.%: owner_type "%" not found in owner_type',
            TG_TABLE_SCHEMA, TG_TABLE_NAME, NEW.owner_type
            USING ERRCODE = 'check_violation';
    END IF;

    -- Tenant custom types (schema_name IS NULL): no backing table registered,
    -- so owner_id cannot be DB-validated. Block the reference to prevent orphans.
    -- To allow custom types, register a concrete backing table in owner_type.
    IF v_schema IS NULL THEN
        RAISE EXCEPTION
            '%.%: owner_type "%" has no registered backing table (schema_name IS NULL). '
            'Cannot validate owner_id %. Register a backing table in owner_type '
            'before creating contact or address references.',
            TG_TABLE_SCHEMA, TG_TABLE_NAME, NEW.owner_type, NEW.owner_id
            USING ERRCODE = 'check_violation';
    END IF;

    -- For tenant-scoped tables: validate both PK and tenant ownership
    IF v_is_tenant_scoped THEN
        EXECUTE format(
            'SELECT EXISTS(SELECT 1 FROM %I.%I WHERE %I = $1 AND %I = $2)',
            v_schema, v_table, v_pk_col, v_tenant_column
        ) INTO v_exists USING NEW.owner_id, NEW.tenant_id;

        IF NOT v_exists THEN
            RAISE EXCEPTION
                '%.%: owner_id % does not exist in %.% for tenant % (owner_type="%")',
                TG_TABLE_SCHEMA, TG_TABLE_NAME, NEW.owner_id,
                v_schema, v_table, NEW.tenant_id, NEW.owner_type
                USING ERRCODE = 'foreign_key_violation';
        END IF;
    ELSE
        -- Global/non-tenant-scoped tables: PK only
        EXECUTE format(
            'SELECT EXISTS(SELECT 1 FROM %I.%I WHERE %I = $1)',
            v_schema, v_table, v_pk_col
        ) INTO v_exists USING NEW.owner_id;

        IF NOT v_exists THEN
            RAISE EXCEPTION '%.%: owner_id % does not exist in %.% (owner_type="%")',
                TG_TABLE_SCHEMA, TG_TABLE_NAME, NEW.owner_id,
                v_schema, v_table, NEW.owner_type
                USING ERRCODE = 'foreign_key_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION "master".trg_validate_owner_ref() IS 'Validates owner_id exists in the backing table registered for owner_type. System types: dynamically queries schema.table via pk_column. Tenant custom types (schema_name IS NULL): blocked with EXCEPTION — must register a backing table before creating contact/address references.';

CREATE OR REPLACE FUNCTION master.trg_validate_owner_type()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'master'
AS $function$
BEGIN
    -- System rows are always valid, no session required
    IF EXISTS (
        SELECT 1 FROM master.owner_type
        WHERE code = NEW.owner_type AND tenant_id IS NULL AND status = 'active'
    ) THEN RETURN NEW; END IF;

    -- Tenant extension rows require session context
    IF NOT master.fn_valid_owner_type(NEW.owner_type) THEN
        RAISE EXCEPTION
            '%.%: invalid owner_type "%". Must exist in master.owner_type as active.',
            TG_TABLE_SCHEMA, TG_TABLE_NAME, NEW.owner_type
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION master.trg_validate_part_etags()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'master'
AS $function$
BEGIN
    IF NEW.part_etags IS NOT NULL AND jsonb_typeof(NEW.part_etags) = 'array' THEN
        IF EXISTS (
            SELECT 1 FROM jsonb_array_elements(NEW.part_etags) elem
            WHERE NOT (elem ? 'part_number') OR NOT (elem ? 'etag')
        ) THEN
            RAISE EXCEPTION
                'master.multipart_upload.part_etags: '
                'each element must have part_number and etag keys'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION master.trg_validate_party_contact_parent()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'master'
AS $function$
DECLARE
    v_schema text;
    v_table text;
    v_pk_col text;
    v_is_tenant_scoped boolean;
    v_tenant_column text;
    v_exists boolean;
BEGIN
    SELECT schema_name, table_name, pk_column, is_tenant_scoped, tenant_column
      INTO v_schema, v_table, v_pk_col, v_is_tenant_scoped, v_tenant_column
      FROM master.owner_type
     WHERE code = NEW.party_type AND tenant_id IS NULL AND status = 'active'
     LIMIT 1;

    IF NOT FOUND OR v_schema IS NULL THEN
        RAISE EXCEPTION 'party_contact_person: unsupported party_type "%"', NEW.party_type
            USING ERRCODE = 'check_violation';
    END IF;

    IF v_is_tenant_scoped THEN
        EXECUTE format(
            'SELECT EXISTS(SELECT 1 FROM %I.%I WHERE %I = $1 AND %I = $2)',
            v_schema, v_table, v_pk_col, v_tenant_column
        ) INTO v_exists USING NEW.party_id, NEW.tenant_id;
    ELSE
        EXECUTE format(
            'SELECT EXISTS(SELECT 1 FROM %I.%I WHERE %I = $1)',
            v_schema, v_table, v_pk_col
        ) INTO v_exists USING NEW.party_id;
        v_exists := v_exists AND NEW.party_id = NEW.tenant_id;
    END IF;

    IF NOT v_exists THEN
        RAISE EXCEPTION 'party_contact_person: parent %/% does not exist in tenant %',
            NEW.party_type, NEW.party_id, NEW.tenant_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION master.trg_validate_settles_clause()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_target_type text;
BEGIN
    -- Only applies when settles_clause_code is set
    IF NEW.settles_clause_code IS NULL THEN
        RETURN NEW;
    END IF;

    -- Resolve the clause_type of the referenced (settled) clause
    SELECT clause_type INTO v_target_type
      FROM master.payment_term_clause
     WHERE payment_term_id = NEW.payment_term_id
       AND clause_code     = NEW.settles_clause_code;

    IF v_target_type IS NULL THEN
        RAISE EXCEPTION 'payment_term_clause: settles_clause_code "%" not found within the same payment term',
            NEW.settles_clause_code;
    END IF;

    -- ADVANCE_RECOVERY must settle ADVANCE
    IF NEW.clause_type = 'ADVANCE_RECOVERY' AND v_target_type <> 'ADVANCE' THEN
        RAISE EXCEPTION 'payment_term_clause: ADVANCE_RECOVERY clause must settle an ADVANCE clause, found %',
            v_target_type;
    END IF;

    -- RETENTION_RELEASE must settle RETENTION
    IF NEW.clause_type = 'RETENTION_RELEASE' AND v_target_type <> 'RETENTION' THEN
        RAISE EXCEPTION 'payment_term_clause: RETENTION_RELEASE clause must settle a RETENTION clause, found %',
            v_target_type;
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION master.trg_validate_weekend_days()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- CUSTOM requires weekend_days with at least one element
    IF NEW.weekend_pattern = 'CUSTOM' THEN
        IF NEW.weekend_days IS NULL OR array_length(NEW.weekend_days, 1) IS NULL THEN
            RAISE EXCEPTION 'holiday_calendar: weekend_pattern=CUSTOM requires non-empty weekend_days array';
        END IF;
    END IF;

    -- Non-CUSTOM must not have weekend_days
    IF NEW.weekend_pattern <> 'CUSTOM' AND NEW.weekend_days IS NOT NULL THEN
        RAISE EXCEPTION 'holiday_calendar: weekend_days must be NULL when weekend_pattern is not CUSTOM';
    END IF;

    -- All elements must be 1..7 (ISO day-of-week)
    IF NEW.weekend_days IS NOT NULL THEN
        IF NOT (NEW.weekend_days <@ ARRAY[1,2,3,4,5,6,7]::smallint[]) THEN
            RAISE EXCEPTION 'holiday_calendar: weekend_days elements must be 1-7 (ISO day-of-week)';
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION master.validate_dimension_company_scope(p_tenant_id uuid, p_dimension_set_id uuid, p_company_code_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'master', 'pg_temp'
AS $function$
DECLARE
    v_item   record;
    v_errors jsonb := '[]'::jsonb;
BEGIN
    FOR v_item IN
        SELECT dsi.dimension_type_id,
               dsi.dimension_value_id,
               dv.company_code_id AS val_company,
               dv.code            AS val_code,
               dt.code            AS type_code
        FROM master.dimension_set_item dsi
        JOIN master.dimension_value dv
            ON dv.id = dsi.dimension_value_id AND dv.tenant_id = p_tenant_id
        JOIN master.dimension_type dt
            ON dt.id = dsi.dimension_type_id AND dt.tenant_id = p_tenant_id
        WHERE dsi.dimension_set_id = p_dimension_set_id
          AND dsi.tenant_id = p_tenant_id
    LOOP
        IF v_item.val_company IS NOT NULL
           AND v_item.val_company IS DISTINCT FROM p_company_code_id THEN
            v_errors := v_errors || jsonb_build_object(
                'type_code',     v_item.type_code,
                'value_code',    v_item.val_code,
                'value_company', v_item.val_company,
                'txn_company',   p_company_code_id,
                'error',         format(
                    'Dimension value "%s" belongs to company %s but transaction company is %s.',
                    v_item.val_code, v_item.val_company, p_company_code_id)
            );
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'is_valid', jsonb_array_length(v_errors) = 0,
        'errors',   v_errors
    );
END;
$function$;

COMMENT ON FUNCTION "master".validate_dimension_company_scope(p_tenant_id uuid, p_dimension_set_id uuid, p_company_code_id uuid) IS 'Runtime company-scope validation for dimension sets. Called by the posting engine when company_code_id is known. Checks each dimension_value.company_code_id against the transaction company. Returns {is_valid: bool, errors: [{type_code, value_code, error}]}.';
