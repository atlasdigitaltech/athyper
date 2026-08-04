-- Version ownership remains on control.policy_definition.version_no. Rules and
-- tests are children of that version; no independent rule-version table exists.
CREATE TABLE control.policy_rule (
    id                   uuid        NOT NULL DEFAULT shared.uuidv7(),
    policy_definition_id uuid        NOT NULL,
    priority             smallint    NOT NULL DEFAULT 10,
    condition_expr       jsonb       NOT NULL DEFAULT '{}'::jsonb,
    action_code          text        NOT NULL,
    action_config        jsonb       NOT NULL DEFAULT '{}'::jsonb,
    score                numeric(9,4),
    confidence           numeric(5,4),
    explanation          text,
    approver_rules       jsonb,
    sla_hours            smallint,
    metadata             jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid        NOT NULL,
    updated_at           timestamptz,
    updated_by           uuid,

    CONSTRAINT policy_rule_pkey PRIMARY KEY (id),
    CONSTRAINT policy_rule_priority_uq UNIQUE (policy_definition_id, priority),
    CONSTRAINT policy_rule_priority_chk CHECK (priority > 0),
    CONSTRAINT policy_rule_action_chk
        CHECK (action_code ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT policy_rule_json_chk CHECK (
        jsonb_typeof(condition_expr) = 'object'
        AND jsonb_typeof(action_config) = 'object'
        AND jsonb_typeof(metadata) = 'object'
        AND (approver_rules IS NULL OR jsonb_typeof(approver_rules) IN ('array','object'))
    ),
    CONSTRAINT policy_rule_score_chk CHECK (score IS NULL OR score BETWEEN -100000 AND 100000),
    CONSTRAINT policy_rule_confidence_chk CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
    CONSTRAINT policy_rule_sla_chk CHECK (sla_hours IS NULL OR sla_hours > 0),
    CONSTRAINT policy_rule_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE control.policy_test_case (
    id                   uuid        NOT NULL DEFAULT shared.uuidv7(),
    policy_definition_id uuid        NOT NULL,
    code                 text        NOT NULL,
    name                 text        NOT NULL,
    description          text,
    input_payload        jsonb       NOT NULL,
    expected_outcome     jsonb       NOT NULL,
    metadata             jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status               text        NOT NULL DEFAULT 'active',
    is_active            boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at    timestamptz,
    status_changed_by    uuid,
    created_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid        NOT NULL,
    updated_at           timestamptz,
    updated_by           uuid,

    CONSTRAINT policy_test_case_pkey PRIMARY KEY (id),
    CONSTRAINT policy_test_case_code_uq UNIQUE (policy_definition_id, code),
    CONSTRAINT policy_test_case_code_chk
        CHECK (code ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT policy_test_case_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT policy_test_case_json_chk CHECK (
        jsonb_typeof(input_payload) = 'object'
        AND jsonb_typeof(expected_outcome) = 'object'
        AND jsonb_typeof(metadata) = 'object'
    ),
    CONSTRAINT policy_test_case_status_chk CHECK (status IN ('active','deprecated')),
    CONSTRAINT policy_test_case_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT policy_test_case_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE control.policy_rule IS
  'Ordered rule owned by one policy-definition version. Rule history is represented by a new policy_definition.version_no, never by a second rule-version table.';
COMMENT ON TABLE control.policy_test_case IS
  'Deterministic policy input and expected outcome. Mutable execution evidence belongs in operations/audit storage.';
