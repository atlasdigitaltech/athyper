import type { ActivityComparison } from "@athyper/contract-platform-entity-runtime";
import type { IntlRuntime } from "@athyper/platform-i18n";
import {
  formatComparisonValue,
  groupComparisonFields,
  type ComparisonFieldGroup,
  type ComparisonInputCell,
  type ComparisonPresentation,
} from "@athyper/platform-entity-comparison";

// The snapshot comparison's adapter onto the shared comparison core (Entity
// list Compare blueprint, section 11.3). What stays here is directional: the
// server's before/after cells and its `changed` flag.

export type ActivityPresentation = ComparisonPresentation;
export type ComparisonField = ActivityComparison["fields"][number];
export type ActivityFieldGroup = ComparisonFieldGroup<ComparisonField>;
export const comparable = (field: ComparisonField) =>
  field.before.state === "value" && field.after.state === "value";
export const changed = (field: ComparisonField) =>
  comparable(field) && field.changed;

export function groupActivityFields(
  fields: readonly ComparisonField[],
  metadata?: ActivityPresentation,
): readonly ActivityFieldGroup[] {
  return groupComparisonFields(fields, metadata);
}

/** A captured snapshot cell in the core's vocabulary: an uncaptured value is
 * unavailable, never empty or deleted. */
export function activityCell(cell: ComparisonField["before"]): ComparisonInputCell {
  return cell.state === "value"
    ? { state: "value", value: cell.value }
    : { state: "unavailable", reason: "not_captured" };
}

export function formatActivityValue(
  cell: ComparisonField["before"],
  field: Pick<ActivityPresentation["fields"][number], "kind" | "options"> | undefined,
  intl: IntlRuntime,
): string {
  return formatComparisonValue(activityCell(cell), field, intl, {
    empty: intl.message("activity.capturedEmpty"),
    unavailable: intl.message("activity.uncaptured"),
  });
}
