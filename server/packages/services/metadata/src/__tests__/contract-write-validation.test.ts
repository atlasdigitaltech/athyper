import { describe, expect, it } from "vitest";
import {
  validateEntityContractWrite,
  validateEntityFieldContractWrite,
} from "../../routes/contract-write-validation.js";

describe("contract write validation", () => {
  it("rejects unknown entity contract properties and reject-policy keys", () => {
    const result = validateEntityContractWrite({
      feature_flags: { has_workflow: true, rogue_flag: true },
      random_config: {},
    });

    expect(result.errors.map((error) => error.path)).toEqual([
      "random_config",
      "feature_flags",
    ]);
  });

  it("accepts canonical entity data policy keys", () => {
    const dataPolicy = {
      classification: "confidential",
      pii_fields: ["site_contact_email"],
      retention_days: 365,
      legal_hold_eligible: true,
      anonymize_on_delete: false,
    };

    const result = validateEntityContractWrite({ data_policy: dataPolicy });

    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.values["data_policy"]).toEqual(dataPolicy);
  });

  it("normalizes legacy field aliases into canonical contract owners", () => {
    const result = validateEntityFieldContractWrite({
      ui_hint: {
        filter: { section_key: "main" },
        copy_behavior: "exclude",
        group_key: "identity",
        visible_when: { field: "status", operator: "eq", value: "draft" },
        tooltip: "Visible for draft records",
      },
      validation_rules: {
        ref_entity: "supplier",
        max_length: 120,
      },
      lookup_config: {
        depends_on: { source_field: "company_id", target_field: "company_id" },
      },
      money_config: {
        constant_currency: "USD",
        code_position: "suffix",
      },
      visibility: {
        list: false,
      },
    });

    expect(result.errors).toEqual([]);
    expect(result.values["filter_config"]).toEqual({ section_key: "main" });
    expect(result.values["group_key"]).toEqual("identity");
    expect(result.values["reference_config"]).toEqual({ target_entity: "supplier" });
    expect(result.values["validation_rules"]).toEqual({ max_length: 120 });
    expect(result.values["lookup_config"]).toEqual({
      dependent_filter: { source_field: "company_id", target_field: "company_id" },
    });
    expect(result.values["money_config"]).toEqual({
      currency_code: "USD",
      currency_code_position: "suffix",
    });
    expect(result.values["ui_hint"]).toEqual({
      tooltip: "Visible for draft records",
      display: {
        visible_when: { field: "status", operator: "eq", value: "draft" },
        hide_in: ["list"],
      },
      copy: { behavior: "exclude" },
    });
  });

  it("rejects reserved, deprecated, and server-only field authoring after migration normalization", () => {
    const result = validateEntityFieldContractWrite({
      json_config: { editor: "json" },
      compute_expr: { expr: "x + y" },
      constraints: { not_null: true },
    });

    expect(result.errors.map((error) => error.path)).toEqual([
      "constraints",
      "json_config",
      "compute_expr",
    ]);
  });
});
