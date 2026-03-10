/* ============================================================================
   Athyper — Auto-introspect fields from live database columns

   For every meta.entity whose entity_version has ZERO fields in meta.field,
   reads information_schema.columns and inserts a field record per column.

   Mapping rules:
     - System columns (id, tenant_id, created_at, updated_at, created_by,
       updated_by) are SKIPPED — they are implicit infrastructure columns.
     - PostgreSQL data types are mapped to meta data_type + ui_type pairs.
     - uuid columns ending in _id → ui_type 'lookup' (FK references).
     - System-managed columns (status, version, posted_at, posted_by, etc.)
       → origin='system', is_read_only=true.
     - All other columns → origin='business', is_read_only=false.

   Runs for ALL tenants. Idempotent (ON CONFLICT DO NOTHING).
   ============================================================================ */

DO $$
DECLARE
    v_tenant      uuid;
    v_entity      record;
    v_vid         uuid;
    v_col         record;
    v_sort        int;
    v_data_type   text;
    v_ui_type     text;
    v_origin      text;
    v_read_only   boolean;
    v_required    boolean;
    v_field_name  text;
    v_inserted    int := 0;
    v_entities    int := 0;
    -- System columns to skip entirely (infrastructure)
    v_skip_cols   text[] := ARRAY[
        'id', 'tenant_id', 'created_at', 'updated_at', 'created_by', 'updated_by'
    ];
    -- System-managed columns (read-only, origin='system')
    v_system_cols text[] := ARRAY[
        'status', 'version', 'posted_at', 'posted_by', 'approved_at', 'approved_by',
        'submitted_at', 'submitted_by', 'cancelled_at', 'cancelled_by',
        'reversed_by', 'reversed_by_id', 'reversal_of_id', 'reversed_at',
        'reconciled_at', 'reconciled_by', 'applied_at', 'applied_by',
        'closed_at', 'closed_by', 'voided_at', 'voided_by',
        'decision_score', 'approval_route', 'approval_instance_id',
        'je_id', 'ic_transaction_id', 'derived_from_je_id',
        'posting_rule_id', 'book_idempotency_key',
        'paid_amount', 'functional_amount', 'line_count',
        'is_reversal', 'imported_at', 'imported_by'
    ];
    -- Hidden system columns (ui_type='hidden')
    v_hidden_cols text[] := ARRAY[
        'txn_id', 'decision_score', 'approval_route', 'approval_instance_id',
        'je_id', 'ic_transaction_id', 'derived_from_je_id',
        'posting_rule_id', 'book_idempotency_key',
        'imported_at', 'imported_by', 'is_reversal', 'reversal_of_id',
        'reversed_by_id', 'reversed_by', 'version',
        'line_count', 'paid_amount', 'functional_amount',
        'posted_at', 'posted_by', 'reconciled_at', 'reconciled_by',
        'applied_at', 'applied_by', 'closed_at', 'closed_by',
        'voided_at', 'voided_by', 'cancelled_at', 'cancelled_by',
        'submitted_at', 'submitted_by', 'approved_at', 'approved_by',
        'reversed_at'
    ];
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
              -- Only entities with 0 fields
              AND NOT EXISTS (
                  SELECT 1 FROM meta.field f
                  WHERE f.entity_version_id = ev.id AND f.tenant_id = ev.tenant_id
              )
              -- Table must actually exist
              AND EXISTS (
                  SELECT 1 FROM information_schema.tables t
                  WHERE t.table_schema = e.table_schema AND t.table_name = e.table_name
              )
            ORDER BY e.name
        LOOP
            v_sort := 0;
            v_entities := v_entities + 1;

            FOR v_col IN
                SELECT c.column_name,
                       c.data_type,
                       c.character_maximum_length,
                       c.is_nullable,
                       c.column_default,
                       c.udt_name,
                       c.ordinal_position
                FROM information_schema.columns c
                WHERE c.table_schema = v_entity.table_schema
                  AND c.table_name = v_entity.table_name
                ORDER BY c.ordinal_position
            LOOP
                -- Skip infrastructure columns
                IF v_col.column_name = ANY(v_skip_cols) THEN
                    CONTINUE;
                END IF;

                v_sort := v_sort + 1;

                -- ── Map PostgreSQL data types to meta data_type + ui_type ──

                -- Determine origin and read-only
                IF v_col.column_name = ANY(v_system_cols) THEN
                    v_origin := 'system';
                    v_read_only := true;
                ELSE
                    v_origin := 'business';
                    v_read_only := false;
                END IF;

                -- Required = NOT NULL and no default
                v_required := (v_col.is_nullable = 'NO' AND v_col.column_default IS NULL);

                -- Default data_type and ui_type based on PostgreSQL type
                CASE
                    -- UUID columns
                    WHEN v_col.udt_name = 'uuid' THEN
                        v_data_type := 'uuid';
                        IF v_col.column_name LIKE '%_id' THEN
                            -- FK reference → lookup (unless hidden system col)
                            IF v_col.column_name = ANY(v_hidden_cols) THEN
                                v_ui_type := 'hidden';
                            ELSE
                                v_ui_type := 'lookup';
                            END IF;
                        ELSE
                            v_ui_type := 'hidden';
                        END IF;

                    -- Boolean
                    WHEN v_col.udt_name = 'bool' THEN
                        v_data_type := 'boolean';
                        IF v_col.column_name = ANY(v_hidden_cols) THEN
                            v_ui_type := 'hidden';
                        ELSE
                            v_ui_type := 'boolean';
                        END IF;

                    -- Numeric / decimal
                    WHEN v_col.udt_name = 'numeric' OR v_col.udt_name = 'float8' OR v_col.udt_name = 'float4' THEN
                        v_data_type := 'decimal';
                        -- Monetary columns
                        IF v_col.column_name LIKE '%amount%' OR v_col.column_name LIKE '%total%'
                           OR v_col.column_name LIKE '%balance%' OR v_col.column_name LIKE '%price%'
                           OR v_col.column_name LIKE '%cost%' OR v_col.column_name LIKE '%value%'
                           OR v_col.column_name LIKE '%debit%' OR v_col.column_name LIKE '%credit%' THEN
                            v_ui_type := 'money';
                        ELSIF v_col.column_name LIKE '%rate%' OR v_col.column_name LIKE '%percent%'
                              OR v_col.column_name LIKE '%ratio%' OR v_col.column_name LIKE '%score%' THEN
                            v_ui_type := 'number';
                        ELSE
                            v_ui_type := 'number';
                        END IF;
                        IF v_col.column_name = ANY(v_hidden_cols) THEN
                            v_ui_type := 'hidden';
                        END IF;

                    -- Integer types
                    WHEN v_col.udt_name IN ('int2', 'int4', 'int8', 'smallint', 'integer', 'bigint') THEN
                        IF v_col.udt_name IN ('int2', 'smallint') THEN
                            v_data_type := 'smallint';
                        ELSIF v_col.udt_name IN ('int8', 'bigint') THEN
                            v_data_type := 'bigint';
                        ELSE
                            v_data_type := 'integer';
                        END IF;
                        IF v_col.column_name = ANY(v_hidden_cols) THEN
                            v_ui_type := 'hidden';
                        ELSE
                            v_ui_type := 'number';
                        END IF;

                    -- Date
                    WHEN v_col.udt_name = 'date' THEN
                        v_data_type := 'date';
                        v_ui_type := 'date';

                    -- Timestamp
                    WHEN v_col.udt_name = 'timestamptz' OR v_col.udt_name = 'timestamp' THEN
                        v_data_type := 'timestamptz';
                        IF v_col.column_name = ANY(v_hidden_cols) THEN
                            v_ui_type := 'hidden';
                        ELSE
                            v_ui_type := 'datetime';
                        END IF;

                    -- JSONB
                    WHEN v_col.udt_name = 'jsonb' OR v_col.udt_name = 'json' THEN
                        v_data_type := 'jsonb';
                        IF v_col.column_name LIKE '%tags%' THEN
                            v_ui_type := 'tags';
                        ELSE
                            v_ui_type := 'json';
                        END IF;

                    -- Text array
                    WHEN v_col.udt_name = '_text' OR v_col.udt_name = '_varchar' THEN
                        v_data_type := 'text[]';
                        v_ui_type := 'tags';

                    -- Varchar with length
                    WHEN v_col.data_type = 'character varying' AND v_col.character_maximum_length IS NOT NULL THEN
                        v_data_type := 'varchar(' || v_col.character_maximum_length || ')';
                        -- Short codes / status-like
                        IF v_col.character_maximum_length <= 5 THEN
                            IF v_col.column_name LIKE '%code%' OR v_col.column_name LIKE '%currency%' THEN
                                v_ui_type := 'lookup';
                            ELSE
                                v_ui_type := 'select';
                            END IF;
                        ELSIF v_col.character_maximum_length <= 20 THEN
                            IF v_col.column_name LIKE '%status%' OR v_col.column_name LIKE '%type%'
                               OR v_col.column_name LIKE '%method%' OR v_col.column_name LIKE '%mode%'
                               OR v_col.column_name LIKE '%direction%' OR v_col.column_name LIKE '%side%'
                               OR v_col.column_name LIKE '%book_code%' THEN
                                v_ui_type := 'select';
                            ELSIF v_col.column_name LIKE '%code%' OR v_col.column_name LIKE '%number%'
                                  OR v_col.column_name LIKE '%ref%' OR v_col.column_name LIKE '%entity_code%' THEN
                                v_ui_type := 'code';
                            ELSE
                                v_ui_type := 'text';
                            END IF;
                        ELSIF v_col.character_maximum_length <= 50 THEN
                            IF v_col.column_name LIKE '%code%' OR v_col.column_name LIKE '%number%' THEN
                                v_ui_type := 'code';
                            ELSE
                                v_ui_type := 'text';
                            END IF;
                        ELSE
                            v_ui_type := 'text';
                        END IF;
                        IF v_col.column_name = ANY(v_hidden_cols) THEN
                            v_ui_type := 'hidden';
                        END IF;

                    -- Char
                    WHEN v_col.data_type = 'character' THEN
                        v_data_type := 'char(' || COALESCE(v_col.character_maximum_length, 1) || ')';
                        IF v_col.column_name LIKE '%code%' OR v_col.column_name LIKE '%currency%' THEN
                            v_ui_type := 'code';
                        ELSE
                            v_ui_type := 'select';
                        END IF;

                    -- Plain text (no length)
                    WHEN v_col.data_type = 'text' OR (v_col.data_type = 'character varying' AND v_col.character_maximum_length IS NULL) THEN
                        v_data_type := 'text';
                        IF v_col.column_name LIKE '%description%' OR v_col.column_name LIKE '%notes%'
                           OR v_col.column_name LIKE '%reason%' OR v_col.column_name LIKE '%comment%'
                           OR v_col.column_name LIKE '%memo%' THEN
                            v_ui_type := 'textarea';
                        ELSIF v_col.column_name LIKE '%status%' OR v_col.column_name LIKE '%type%'
                              OR v_col.column_name LIKE '%method%' OR v_col.column_name LIKE '%mode%' THEN
                            v_ui_type := 'select';
                        ELSIF v_col.column_name LIKE '%code%' OR v_col.column_name LIKE '%number%' THEN
                            v_ui_type := 'code';
                        ELSIF v_col.column_name LIKE '%_code' THEN
                            v_ui_type := 'lookup';
                        ELSE
                            v_ui_type := 'text';
                        END IF;
                        IF v_col.column_name = ANY(v_hidden_cols) THEN
                            v_ui_type := 'hidden';
                        END IF;

                    -- Fallback
                    ELSE
                        v_data_type := 'text';
                        v_ui_type := 'text';
                END CASE;

                -- Override: status column is always select + system + read-only
                IF v_col.column_name = 'status' THEN
                    v_ui_type := 'select';
                    v_origin := 'system';
                    v_read_only := true;
                END IF;

                -- Generate human-readable field name from column_name
                v_field_name := replace(
                    initcap(replace(v_col.column_name, '_', ' ')),
                    ' Id', ''
                );
                -- Clean up common suffixes
                v_field_name := regexp_replace(v_field_name, '\s+$', '');

                INSERT INTO meta.field (
                    tenant_id, entity_version_id, name, column_name,
                    data_type, ui_type, is_required, sort_order,
                    origin, is_read_only, is_computed, write_once,
                    created_by
                ) VALUES (
                    v_tenant, v_entity.version_id, v_field_name, v_col.column_name,
                    v_data_type, v_ui_type, v_required, v_sort,
                    v_origin, v_read_only, false, false,
                    'system'
                )
                ON CONFLICT (tenant_id, entity_version_id, name) DO NOTHING;

                v_inserted := v_inserted + 1;
            END LOOP;
        END LOOP;
    END LOOP;

    RAISE NOTICE 'Field introspection complete: % fields inserted across % entity-tenant combinations',
        v_inserted, v_entities;
END $$;
