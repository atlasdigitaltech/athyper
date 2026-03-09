/* ============================================================================
   Athyper — Governed Version Lifecycle & Transition Hooks
   Seeds lifecycle definitions for governed versioning:

   LC-10: DOC_GOVERNED — Governed Document/Version Lifecycle
     DRAFT → PENDING_APPROVAL → APPROVED → EFFECTIVE → SUPERSEDED
                              ↘ REJECTED
     DRAFT ← (withdrawn)

   Also seeds transition hooks for automatic version management actions.

   Dependencies: 068_governed_versioning.sql, meta.lifecycle_transition_hook
   ============================================================================ */

DO $$
DECLARE
    v_tenant uuid;
    v_lc_id  uuid;
    v_s_draft uuid; v_s_pending uuid; v_s_approved uuid;
    v_s_effective uuid; v_s_superseded uuid;
    v_s_rejected uuid; v_s_withdrawn uuid;
    v_t_submit uuid; v_t_approve uuid; v_t_reject uuid;
    v_t_withdraw uuid; v_t_activate uuid; v_t_revise uuid;
    v_t_supersede uuid;
BEGIN
    FOR v_tenant IN SELECT id FROM core.tenant
    LOOP

        -- ====================================================================
        -- LC-10: DOC_GOVERNED — Governed Document/Version Lifecycle
        -- Full approval + immutable versions + supersession
        -- ====================================================================
        INSERT INTO meta.lifecycle (tenant_id, code, name, description, created_by)
        VALUES (v_tenant, 'DOC_GOVERNED', 'Governed Version Lifecycle',
                'Full governed lifecycle: draft → approval → effective with immutable versions and supersession', 'system')
        ON CONFLICT (tenant_id, code, version_no) DO NOTHING
        RETURNING id INTO v_lc_id;

        IF v_lc_id IS NOT NULL THEN

            -- States
            INSERT INTO meta.lifecycle_state (tenant_id, lifecycle_id, code, name, is_terminal, sort_order, config, created_by) VALUES
                (v_tenant, v_lc_id, 'DRAFT',            'Draft',            false, 10,
                 '{"editable": true, "description": "Editable working copy"}'::jsonb, 'system')
                RETURNING id INTO v_s_draft;
            INSERT INTO meta.lifecycle_state (tenant_id, lifecycle_id, code, name, is_terminal, sort_order, config, created_by) VALUES
                (v_tenant, v_lc_id, 'PENDING_APPROVAL', 'Pending Approval', false, 20,
                 '{"editable": false, "description": "Submitted for review, locked for edits"}'::jsonb, 'system')
                RETURNING id INTO v_s_pending;
            INSERT INTO meta.lifecycle_state (tenant_id, lifecycle_id, code, name, is_terminal, sort_order, config, created_by) VALUES
                (v_tenant, v_lc_id, 'APPROVED',         'Approved',         false, 30,
                 '{"editable": false, "description": "Approved, awaiting activation"}'::jsonb, 'system')
                RETURNING id INTO v_s_approved;
            INSERT INTO meta.lifecycle_state (tenant_id, lifecycle_id, code, name, is_terminal, sort_order, config, created_by) VALUES
                (v_tenant, v_lc_id, 'EFFECTIVE',        'Effective',        false, 40,
                 '{"editable": false, "description": "Currently live version"}'::jsonb, 'system')
                RETURNING id INTO v_s_effective;
            INSERT INTO meta.lifecycle_state (tenant_id, lifecycle_id, code, name, is_terminal, sort_order, config, created_by) VALUES
                (v_tenant, v_lc_id, 'SUPERSEDED',       'Superseded',       true,  50,
                 '{"editable": false, "description": "Replaced by newer effective version"}'::jsonb, 'system')
                RETURNING id INTO v_s_superseded;
            INSERT INTO meta.lifecycle_state (tenant_id, lifecycle_id, code, name, is_terminal, sort_order, config, created_by) VALUES
                (v_tenant, v_lc_id, 'REJECTED',         'Rejected',         true,  60,
                 '{"editable": false, "description": "Approval rejected"}'::jsonb, 'system')
                RETURNING id INTO v_s_rejected;
            INSERT INTO meta.lifecycle_state (tenant_id, lifecycle_id, code, name, is_terminal, sort_order, config, created_by) VALUES
                (v_tenant, v_lc_id, 'WITHDRAWN',        'Withdrawn',        true,  70,
                 '{"editable": false, "description": "Submitter canceled before approval"}'::jsonb, 'system')
                RETURNING id INTO v_s_withdrawn;

            -- Transitions
            INSERT INTO meta.lifecycle_transition (tenant_id, lifecycle_id, from_state_id, to_state_id, operation_code, created_by) VALUES
                (v_tenant, v_lc_id, v_s_draft,     v_s_pending,    'submit',     'system')
                RETURNING id INTO v_t_submit;
            INSERT INTO meta.lifecycle_transition (tenant_id, lifecycle_id, from_state_id, to_state_id, operation_code, created_by) VALUES
                (v_tenant, v_lc_id, v_s_pending,   v_s_approved,   'approve',    'system')
                RETURNING id INTO v_t_approve;
            INSERT INTO meta.lifecycle_transition (tenant_id, lifecycle_id, from_state_id, to_state_id, operation_code, created_by) VALUES
                (v_tenant, v_lc_id, v_s_pending,   v_s_rejected,   'reject',     'system')
                RETURNING id INTO v_t_reject;
            INSERT INTO meta.lifecycle_transition (tenant_id, lifecycle_id, from_state_id, to_state_id, operation_code, created_by) VALUES
                (v_tenant, v_lc_id, v_s_pending,   v_s_draft,      'withdraw',   'system')
                RETURNING id INTO v_t_withdraw;
            INSERT INTO meta.lifecycle_transition (tenant_id, lifecycle_id, from_state_id, to_state_id, operation_code, created_by) VALUES
                (v_tenant, v_lc_id, v_s_approved,  v_s_effective,  'activate',   'system')
                RETURNING id INTO v_t_activate;
            INSERT INTO meta.lifecycle_transition (tenant_id, lifecycle_id, from_state_id, to_state_id, operation_code, created_by) VALUES
                (v_tenant, v_lc_id, v_s_effective, v_s_effective,  'revise',     'system')
                RETURNING id INTO v_t_revise;
            INSERT INTO meta.lifecycle_transition (tenant_id, lifecycle_id, from_state_id, to_state_id, operation_code, created_by) VALUES
                (v_tenant, v_lc_id, v_s_effective, v_s_superseded, 'supersede',  'system')
                RETURNING id INTO v_t_supersede;

            -- ================================================================
            -- Transition Hooks (automatic actions on transition)
            -- ================================================================

            -- submit: freeze version for review
            INSERT INTO meta.lifecycle_transition_hook
                (tenant_id, transition_id, timing, action, config, sort_order, created_by,
                 origin, layer_rank, contract_role, safety_level)
            VALUES
                (v_tenant, v_t_submit, 'on_success', 'update_version_status',
                 '{"target_status": "in_review"}'::jsonb, 10, 'system',
                 'system', 10, 'extension', 'replaceable'),
                (v_tenant, v_t_submit, 'on_success', 'freeze_version',
                 '{"reason": "submitted_for_review"}'::jsonb, 20, 'system',
                 'system', 10, 'contract', 'narrowable');

            -- approve: mark version as approved
            INSERT INTO meta.lifecycle_transition_hook
                (tenant_id, transition_id, timing, action, config, sort_order, created_by,
                 origin, layer_rank, contract_role, safety_level)
            VALUES
                (v_tenant, v_t_approve, 'on_success', 'mark_version_approved',
                 NULL, 10, 'system',
                 'system', 10, 'contract', 'narrowable'),
                (v_tenant, v_t_approve, 'on_success', 'update_version_status',
                 '{"target_status": "approved"}'::jsonb, 20, 'system',
                 'system', 10, 'extension', 'replaceable'),
                (v_tenant, v_t_approve, 'on_success', 'emit_event',
                 '{"event_type": "version.approved"}'::jsonb, 30, 'system',
                 'system', 10, 'contract', 'narrowable');

            -- reject: update version status
            INSERT INTO meta.lifecycle_transition_hook
                (tenant_id, transition_id, timing, action, config, sort_order, created_by,
                 origin, layer_rank, contract_role, safety_level)
            VALUES
                (v_tenant, v_t_reject, 'on_success', 'update_version_status',
                 '{"target_status": "rejected"}'::jsonb, 10, 'system',
                 'system', 10, 'extension', 'replaceable'),
                (v_tenant, v_t_reject, 'on_success', 'cancel_approval',
                 NULL, 20, 'system',
                 'system', 10, 'extension', 'narrowable');

            -- withdraw: return to draft
            INSERT INTO meta.lifecycle_transition_hook
                (tenant_id, transition_id, timing, action, config, sort_order, created_by,
                 origin, layer_rank, contract_role, safety_level)
            VALUES
                (v_tenant, v_t_withdraw, 'on_success', 'update_version_status',
                 '{"target_status": "draft"}'::jsonb, 10, 'system',
                 'system', 10, 'extension', 'replaceable'),
                (v_tenant, v_t_withdraw, 'on_success', 'cancel_approval',
                 NULL, 20, 'system',
                 'system', 10, 'extension', 'narrowable');

            -- activate: promote to effective, archive previous
            INSERT INTO meta.lifecycle_transition_hook
                (tenant_id, transition_id, timing, action, config, sort_order, created_by,
                 origin, layer_rank, contract_role, safety_level)
            VALUES
                (v_tenant, v_t_activate, 'on_success', 'archive_previous_effective',
                 NULL, 10, 'system',
                 'system', 10, 'contract', 'narrowable'),
                (v_tenant, v_t_activate, 'on_success', 'promote_to_effective',
                 NULL, 20, 'system',
                 'system', 10, 'contract', 'narrowable'),
                (v_tenant, v_t_activate, 'on_success', 'update_version_status',
                 '{"target_status": "effective"}'::jsonb, 30, 'system',
                 'system', 10, 'extension', 'replaceable'),
                (v_tenant, v_t_activate, 'on_success', 'emit_event',
                 '{"event_type": "version.activated"}'::jsonb, 40, 'system',
                 'system', 10, 'contract', 'narrowable');

            -- revise: spawn new draft from effective version
            INSERT INTO meta.lifecycle_transition_hook
                (tenant_id, transition_id, timing, action, config, sort_order, created_by,
                 origin, layer_rank, contract_role, safety_level)
            VALUES
                (v_tenant, v_t_revise, 'on_success', 'spawn_next_draft',
                 '{"copy_fields": true, "copy_relations": true, "copy_indexes": true}'::jsonb, 10, 'system',
                 'system', 10, 'extension', 'replaceable'),
                (v_tenant, v_t_revise, 'on_success', 'emit_event',
                 '{"event_type": "version.revision_started"}'::jsonb, 20, 'system',
                 'system', 10, 'contract', 'narrowable');

            -- supersede: mark old effective as superseded
            INSERT INTO meta.lifecycle_transition_hook
                (tenant_id, transition_id, timing, action, config, sort_order, created_by,
                 origin, layer_rank, contract_role, safety_level)
            VALUES
                (v_tenant, v_t_supersede, 'on_success', 'update_version_status',
                 '{"target_status": "superseded"}'::jsonb, 10, 'system',
                 'system', 10, 'extension', 'replaceable');

            -- ================================================================
            -- Entity bindings: bind meta entity versions to this lifecycle
            -- ================================================================
            -- The DOC_GOVERNED lifecycle is bound to entity name 'MetaEntityVersion'
            -- which is a virtual entity representing meta.entity_version rows.
            INSERT INTO meta.entity_lifecycle (tenant_id, entity_name, lifecycle_id, priority, created_by)
            VALUES (v_tenant, 'MetaEntityVersion', v_lc_id, 100, 'system')
            ON CONFLICT DO NOTHING;

        END IF;

        -- ====================================================================
        -- LC-11: DOC_SIMPLE — Simple Publish Lifecycle (no approval)
        -- DRAFT → EFFECTIVE → SUPERSEDED
        -- For entities with versioningMode='simple'
        -- ====================================================================
        INSERT INTO meta.lifecycle (tenant_id, code, name, description, created_by)
        VALUES (v_tenant, 'DOC_SIMPLE', 'Simple Publish Lifecycle',
                'Draft-publish-archive without approval workflow', 'system')
        ON CONFLICT (tenant_id, code, version_no) DO NOTHING
        RETURNING id INTO v_lc_id;

        IF v_lc_id IS NOT NULL THEN
            INSERT INTO meta.lifecycle_state (tenant_id, lifecycle_id, code, name, is_terminal, sort_order, created_by) VALUES
                (v_tenant, v_lc_id, 'DRAFT',      'Draft',      false, 10, 'system') RETURNING id INTO v_s_draft;
            INSERT INTO meta.lifecycle_state (tenant_id, lifecycle_id, code, name, is_terminal, sort_order, created_by) VALUES
                (v_tenant, v_lc_id, 'EFFECTIVE',   'Effective',  false, 20, 'system') RETURNING id INTO v_s_effective;
            INSERT INTO meta.lifecycle_state (tenant_id, lifecycle_id, code, name, is_terminal, sort_order, created_by) VALUES
                (v_tenant, v_lc_id, 'SUPERSEDED',  'Superseded', true,  30, 'system') RETURNING id INTO v_s_superseded;

            INSERT INTO meta.lifecycle_transition (tenant_id, lifecycle_id, from_state_id, to_state_id, operation_code, created_by) VALUES
                (v_tenant, v_lc_id, v_s_draft,     v_s_effective,  'publish',   'system') RETURNING id INTO v_t_activate;
            INSERT INTO meta.lifecycle_transition (tenant_id, lifecycle_id, from_state_id, to_state_id, operation_code, created_by) VALUES
                (v_tenant, v_lc_id, v_s_effective,  v_s_effective, 'revise',    'system') RETURNING id INTO v_t_revise;
            INSERT INTO meta.lifecycle_transition (tenant_id, lifecycle_id, from_state_id, to_state_id, operation_code, created_by) VALUES
                (v_tenant, v_lc_id, v_s_effective,  v_s_superseded, 'supersede', 'system') RETURNING id INTO v_t_supersede;

            -- Hooks for simple lifecycle
            INSERT INTO meta.lifecycle_transition_hook
                (tenant_id, transition_id, timing, action, config, sort_order, created_by,
                 origin, layer_rank, contract_role, safety_level)
            VALUES
                (v_tenant, v_t_activate, 'on_success', 'archive_previous_effective',
                 NULL, 10, 'system',
                 'system', 10, 'contract', 'narrowable'),
                (v_tenant, v_t_activate, 'on_success', 'promote_to_effective',
                 NULL, 20, 'system',
                 'system', 10, 'contract', 'narrowable'),
                (v_tenant, v_t_activate, 'on_success', 'update_version_status',
                 '{"target_status": "effective"}'::jsonb, 30, 'system',
                 'system', 10, 'extension', 'replaceable');

            INSERT INTO meta.lifecycle_transition_hook
                (tenant_id, transition_id, timing, action, config, sort_order, created_by,
                 origin, layer_rank, contract_role, safety_level)
            VALUES
                (v_tenant, v_t_revise, 'on_success', 'spawn_next_draft',
                 '{"copy_fields": true, "copy_relations": true, "copy_indexes": true}'::jsonb, 10, 'system',
                 'system', 10, 'extension', 'replaceable');

            INSERT INTO meta.entity_lifecycle (tenant_id, entity_name, lifecycle_id, priority, created_by)
            VALUES (v_tenant, 'MetaEntityVersionSimple', v_lc_id, 100, 'system')
            ON CONFLICT DO NOTHING;
        END IF;

    END LOOP;

    RAISE NOTICE 'Governed lifecycle definitions seeded. Lifecycles: %, States: %, Transitions: %, Hooks: %',
        (SELECT count(*) FROM meta.lifecycle WHERE code IN ('DOC_GOVERNED', 'DOC_SIMPLE')),
        (SELECT count(*) FROM meta.lifecycle_state ls
         JOIN meta.lifecycle l ON ls.lifecycle_id = l.id WHERE l.code IN ('DOC_GOVERNED', 'DOC_SIMPLE')),
        (SELECT count(*) FROM meta.lifecycle_transition lt
         JOIN meta.lifecycle l ON lt.lifecycle_id = l.id WHERE l.code IN ('DOC_GOVERNED', 'DOC_SIMPLE')),
        (SELECT count(*) FROM meta.lifecycle_transition_hook);
END $$;
