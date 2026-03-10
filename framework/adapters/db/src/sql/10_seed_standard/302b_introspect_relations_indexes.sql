/* ============================================================================
   Athyper — Auto-introspect relations and indexes from live database

   §1  Relations: reads FK constraints from information_schema and inserts
       into meta.relation for every entity that has zero relations.
   §2  Indexes: reads pg_indexes and inserts into meta.index_def for every
       entity that has zero indexes.

   Skips: tenant_id FK (infrastructure), composite FKs, self-references
   Runs for ALL tenants. Idempotent (ON CONFLICT DO NOTHING).
   ============================================================================ */

-- ============================================================================
-- §1  Relations from FK constraints
-- ============================================================================
DO $$
DECLARE
    v_tenant      uuid;
    v_entity      record;
    v_fk          record;
    v_target_name text;
    v_rel_name    text;
    v_rel_kind    text;
    v_on_delete   text;
    v_inserted    int := 0;
    v_entities    int := 0;
BEGIN
    FOR v_tenant IN SELECT id FROM core.tenant
    LOOP
        FOR v_entity IN
            SELECT e.id as entity_id, e.name, e.table_schema, e.table_name,
                   ev.id as version_id
            FROM meta.entity e
            JOIN meta.entity_version ev ON ev.entity_id = e.id AND ev.tenant_id = e.tenant_id
            WHERE e.tenant_id = v_tenant
              AND ev.version_no = 1
              -- Only entities with 0 relations
              AND NOT EXISTS (
                  SELECT 1 FROM meta.relation r
                  WHERE r.entity_version_id = ev.id AND r.tenant_id = ev.tenant_id
              )
            ORDER BY e.name
        LOOP
            v_entities := v_entities + 1;

            FOR v_fk IN
                -- Single-column FK constraints only (skip composites and tenant_id)
                SELECT DISTINCT
                    kcu.column_name as fk_column,
                    ccu.table_schema as ref_schema,
                    ccu.table_name as ref_table,
                    ccu.column_name as ref_column,
                    rc.delete_rule
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu
                    ON tc.constraint_name = kcu.constraint_name
                    AND tc.table_schema = kcu.table_schema
                JOIN information_schema.constraint_column_usage ccu
                    ON tc.constraint_name = ccu.constraint_name
                    AND tc.table_schema = ccu.constraint_schema
                JOIN information_schema.referential_constraints rc
                    ON tc.constraint_name = rc.constraint_name
                    AND tc.table_schema = rc.constraint_schema
                WHERE tc.constraint_type = 'FOREIGN KEY'
                  AND tc.table_schema = v_entity.table_schema
                  AND tc.table_name = v_entity.table_name
                  -- Skip infrastructure FKs
                  AND kcu.column_name NOT IN ('tenant_id', 'created_by', 'updated_by')
                  -- Skip composite FKs (only single-column)
                  AND tc.constraint_name NOT IN (
                      SELECT kcu2.constraint_name
                      FROM information_schema.key_column_usage kcu2
                      WHERE kcu2.table_schema = tc.table_schema
                        AND kcu2.constraint_name = tc.constraint_name
                      GROUP BY kcu2.constraint_name
                      HAVING count(*) > 1
                  )
                  -- Only FK to id columns (standard pattern)
                  AND ccu.column_name = 'id'
                ORDER BY kcu.column_name
            LOOP
                -- Resolve target entity name from meta.entity
                SELECT e2.name INTO v_target_name
                FROM meta.entity e2
                WHERE e2.tenant_id = v_tenant
                  AND e2.table_schema = v_fk.ref_schema
                  AND e2.table_name = v_fk.ref_table
                LIMIT 1;

                -- Skip if target entity not registered in meta
                IF v_target_name IS NULL THEN
                    CONTINUE;
                END IF;

                -- Skip self-referential parent_id (tree structures) — keep other self-refs
                IF v_target_name = v_entity.name AND v_fk.fk_column = 'parent_id' THEN
                    CONTINUE;
                END IF;

                -- Generate relation name from FK column
                v_rel_name := initcap(replace(
                    regexp_replace(v_fk.fk_column, '_id$', ''),
                    '_', ' '
                ));

                -- Determine relation kind
                v_rel_kind := 'belongs_to';

                -- Map delete rule
                CASE v_fk.delete_rule
                    WHEN 'CASCADE' THEN v_on_delete := 'cascade';
                    WHEN 'SET NULL' THEN v_on_delete := 'set_null';
                    ELSE v_on_delete := 'restrict';
                END CASE;

                INSERT INTO meta.relation (
                    tenant_id, entity_version_id, name,
                    relation_kind, target_entity, fk_field,
                    target_key, on_delete, created_by
                ) VALUES (
                    v_tenant, v_entity.version_id, v_rel_name,
                    v_rel_kind, v_target_name, v_fk.fk_column,
                    'id', v_on_delete, 'system'
                )
                ON CONFLICT (tenant_id, entity_version_id, name) DO NOTHING;

                v_inserted := v_inserted + 1;
            END LOOP;
        END LOOP;
    END LOOP;

    RAISE NOTICE 'Relation introspection complete: % relations inserted across % entity-tenant combinations',
        v_inserted, v_entities;
END $$;

-- ============================================================================
-- §2  Indexes from pg_indexes
-- ============================================================================
DO $$
DECLARE
    v_tenant      uuid;
    v_entity      record;
    v_idx         record;
    v_is_unique   boolean;
    v_method      text;
    v_columns     jsonb;
    v_where       text;
    v_col_list    text[];
    v_col_text    text;
    v_inserted    int := 0;
    v_entities    int := 0;
BEGIN
    FOR v_tenant IN SELECT id FROM core.tenant
    LOOP
        FOR v_entity IN
            SELECT e.id as entity_id, e.name, e.table_schema, e.table_name,
                   ev.id as version_id
            FROM meta.entity e
            JOIN meta.entity_version ev ON ev.entity_id = e.id AND ev.tenant_id = e.tenant_id
            WHERE e.tenant_id = v_tenant
              AND ev.version_no = 1
              -- Only entities with 0 indexes
              AND NOT EXISTS (
                  SELECT 1 FROM meta.index_def i
                  WHERE i.entity_version_id = ev.id AND i.tenant_id = ev.tenant_id
              )
            ORDER BY e.name
        LOOP
            v_entities := v_entities + 1;

            FOR v_idx IN
                SELECT i.indexname, i.indexdef,
                       ix.indisunique as is_unique
                FROM pg_indexes i
                JOIN pg_class c ON c.relname = i.indexname
                JOIN pg_index ix ON ix.indexrelid = c.oid
                WHERE i.schemaname = v_entity.table_schema
                  AND i.tablename = v_entity.table_name
                  -- Skip primary keys
                  AND i.indexname NOT LIKE '%_pkey'
                ORDER BY i.indexname
            LOOP
                v_is_unique := v_idx.is_unique;

                -- Extract method (btree, hash, gin, gist, etc.)
                v_method := 'btree';
                IF v_idx.indexdef LIKE '%USING hash%' THEN v_method := 'hash';
                ELSIF v_idx.indexdef LIKE '%USING gin%' THEN v_method := 'gin';
                ELSIF v_idx.indexdef LIKE '%USING gist%' THEN v_method := 'gist';
                ELSIF v_idx.indexdef LIKE '%USING brin%' THEN v_method := 'brin';
                END IF;

                -- Extract column list from indexdef: text between first '(' and matching ')'
                -- Pattern: ... USING btree (col1, col2) WHERE ...
                v_col_text := substring(v_idx.indexdef FROM '\(([^)]+)\)');
                IF v_col_text IS NULL THEN
                    CONTINUE;
                END IF;

                -- Build JSON array of column names
                v_col_list := string_to_array(v_col_text, ', ');
                v_columns := to_jsonb(v_col_list);

                -- Extract WHERE clause if present
                v_where := NULL;
                IF v_idx.indexdef LIKE '%WHERE%' THEN
                    v_where := substring(v_idx.indexdef FROM 'WHERE (.+)$');
                END IF;

                INSERT INTO meta.index_def (
                    tenant_id, entity_version_id, name,
                    is_unique, method, columns,
                    where_clause, created_by
                ) VALUES (
                    v_tenant, v_entity.version_id, v_idx.indexname,
                    v_is_unique, v_method, v_columns,
                    v_where, 'system'
                )
                ON CONFLICT (tenant_id, entity_version_id, name) DO NOTHING;

                v_inserted := v_inserted + 1;
            END LOOP;
        END LOOP;
    END LOOP;

    RAISE NOTICE 'Index introspection complete: % indexes inserted across % entity-tenant combinations',
        v_inserted, v_entities;
END $$;
