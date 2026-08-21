/**
 * Shared test fixture constants.
 *
 * Use these predictable UUIDs instead of generating random ones so test
 * failure messages remain readable and deterministic across runs.
 */

export const TENANT_ID  = "10000000-0000-0000-0000-000000000001";
export const TENANT_ID2 = "10000000-0000-0000-0000-000000000002";

export const PRINCIPAL_ID  = "20000000-0000-0000-0000-000000000001";
export const PRINCIPAL_ID2 = "20000000-0000-0000-0000-000000000002";
export const PRINCIPAL_ID3 = "20000000-0000-0000-0000-000000000003";

export const ENTITY_ID  = "30000000-0000-0000-0000-000000000001";
export const ENTITY_ID2 = "30000000-0000-0000-0000-000000000002";

export const COMPANY_CODE_ID  = "40000000-0000-0000-0000-000000000001";
export const LEGAL_ENTITY_ID  = "50000000-0000-0000-0000-000000000001";

// Workflow / policy
export const WF_DEF_ID      = "60000000-0000-0000-0000-000000000001";
export const WF_TEMPLATE_ID = "60000000-0000-0000-0000-000000000002";
export const WF_REQUEST_ID  = "60000000-0000-0000-0000-000000000003";
export const WF_STAGE_ID    = "60000000-0000-0000-0000-000000000004";
export const WF_ITEM_ID     = "60000000-0000-0000-0000-000000000005";
export const WF_STAGE2_ID   = "60000000-0000-0000-0000-000000000006";

export const POLICY_DEF_ID  = "70000000-0000-0000-0000-000000000001";
export const POLICY_RULE_ID = "70000000-0000-0000-0000-000000000002";

/** A minimal compiled workflow template with a single approval stage. */
export const COMPILED_TEMPLATE_1_STAGE = {
  stages: [
    {
      stage_no: 1,
      name: "Approval",
      mode: "serial",
      quorum: null,
      template_stage_id: "ts-1",
      rules: [
        { priority: 1, assign_to: { type: "principal", value: PRINCIPAL_ID2 } },
      ],
    },
  ],
  behaviors: {},
};

/** A two-stage compiled template (stage 2 has a parallel quorum). */
export const COMPILED_TEMPLATE_2_STAGE = {
  stages: [
    {
      stage_no: 1,
      name: "L1 Approval",
      mode: "serial",
      quorum: null,
      template_stage_id: "ts-1",
      rules: [
        { priority: 1, assign_to: { type: "principal", value: PRINCIPAL_ID2 } },
      ],
    },
    {
      stage_no: 2,
      name: "L2 Approval",
      mode: "parallel",
      quorum: { strategy: "count", required: 1 },
      template_stage_id: "ts-2",
      rules: [
        { priority: 1, assign_to: { type: "principal", value: PRINCIPAL_ID3 } },
      ],
    },
  ],
  behaviors: {},
};
