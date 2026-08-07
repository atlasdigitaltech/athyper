import { NumberingAllocationError } from "@athyper/numbering-contracts";
import type { NumberingPolicyContract } from "@athyper/numbering-contracts";

export interface PolicyRow {
  id:               string;
  tenant_id?:       string | null;
  policy_code:      string;
  policy_revision:  number;
  name:             string;
  description:      string | null;
  format_template:  string;
  sequence_width:   number;
  pad_character:    string;
  start_value:      string | number;
  increment_by:     number;
  maximum_value:    string | number | null;
  scope_kind:       NumberingPolicyContract["scopeKind"];
  reset_kind:       NumberingPolicyContract["resetKind"];
  display_reset_kind?: string | null;
  fiscal_year_pattern?: string | null;
  max_output_length?: number | null;
  timezone_code:    string | null;
  status:           NumberingPolicyContract["status"];
  activated_at?:    string | null;
  activated_by?:    string | null;
}

export interface CounterRow {
  id:                  string;
  next_value:          string | number;
  row_version:         string | number;
  last_allocation_id?: string | null;
  last_allocated_value?: string | number | null;
  last_allocated_at?:  Date | string | null;
  last_allocated_by?:  string | null;
}

export function safeInteger(value: string | number, code: string): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result)) {
    throw new NumberingAllocationError(code, `${code} exceeds the safe integer range.`, 500);
  }
  return result;
}

export function rowToContract(row: PolicyRow): NumberingPolicyContract {
  return {
    policyCode:         row.policy_code,
    policyRevision:     row.policy_revision,
    name:               row.name,
    description:        row.description,
    formatTemplate:     row.format_template,
    sequenceWidth:      row.sequence_width,
    padCharacter:       row.pad_character,
    startValue:         safeInteger(row.start_value, "POLICY_START_VALUE_INVALID"),
    incrementBy:        row.increment_by,
    maximumValue:       row.maximum_value == null ? null : safeInteger(row.maximum_value, "POLICY_MAXIMUM_VALUE_INVALID"),
    scopeKind:          row.scope_kind,
    resetKind:          row.reset_kind,
    displayResetKind:   (row.display_reset_kind as NumberingPolicyContract["resetKind"]) ?? undefined,
    fiscalYearPattern:  row.fiscal_year_pattern ?? undefined,
    maxOutputLength:    row.max_output_length ?? undefined,
    timezoneCode:       row.timezone_code,
    status:             row.status,
    activatedAt:        row.activated_at ?? undefined,
    activatedBy:        row.activated_by ?? undefined,
  };
}
