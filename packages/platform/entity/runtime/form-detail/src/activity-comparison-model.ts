import type {
  ActivityComparison,
  EntityDetailDescriptorV1,
} from "@athyper/contract-platform-entity-runtime";
import type { IntlRuntime } from "@athyper/platform-i18n";

export type ActivityPresentation = Pick<
  EntityDetailDescriptorV1,
  "fields" | "presentation"
>;
export type ComparisonField = ActivityComparison["fields"][number];
/** Root field groups only. Related objects/collections require explicit provider identities;
 * array indexes, display labels and section names must never become record identities. */
export interface ActivityFieldGroup {
  readonly key: string;
  readonly label?: string;
  readonly tabLabel?: string;
  readonly fields: readonly ComparisonField[];
}
export const comparable = (field: ComparisonField) =>
  field.before.state === "value" && field.after.state === "value";
export const changed = (field: ComparisonField) =>
  comparable(field) && field.changed;

/** Intersects layout references with the authorized API projection. Never creates a field,
 * placeholder, section count or hidden section name from layout metadata alone. */
export function groupActivityFields(
  fields: readonly ComparisonField[],
  metadata?: ActivityPresentation,
): readonly ActivityFieldGroup[] {
  const remaining = new Map(fields.map((field) => [field.key, field]));
  const groups: ActivityFieldGroup[] = [];
  const layout = metadata?.presentation;
  const sections = layout?.sections ?? [];
  const tabs = layout?.navigation?.tabs ?? [];
  const ordered = [
    ...tabs.flatMap((tab) =>
      tab.sectionKeys.flatMap(
        (key) => sections.find((s) => s.key === key) ?? [],
      ),
    ),
    ...sections,
  ];
  for (const section of ordered) {
    const members = section.fields.flatMap((key) => {
      const field = remaining.get(key);
      if (!field) return [];
      remaining.delete(key);
      return [field];
    });
    if (members.length)
      groups.push({
        key: `section:${section.key}`,
        label: section.label,
        tabLabel: tabs.find((tab) => tab.sectionKeys.includes(section.key))
          ?.label,
        fields: members,
      });
  }
  // Older captures and fields outside the current layout stay inspectable without a guessed mapping.
  if (remaining.size)
    groups.push({ key: "additional", fields: [...remaining.values()] });
  return groups;
}

export function formatActivityValue(
  cell: ComparisonField["before"],
  field: Pick<ActivityPresentation["fields"][number], "kind" | "options"> | undefined,
  intl: IntlRuntime,
): string {
  if (cell.state !== "value") return intl.message("activity.uncaptured");
  const value = cell.value;
  if (value === null || value === undefined || value === "")
    return intl.message("activity.capturedEmpty");
  if (typeof value === "boolean")
    return intl.message(value ? "activity.yes" : "activity.no");
  if (field?.options && typeof value === "string")
    return (
      field.options.find((option) => option.value === value)?.label ?? value
    );
  if (typeof value === "number" && Number.isFinite(value))
    return intl.number(value, { maximumFractionDigits: 20 });
  if (
    typeof value === "string" &&
    (field?.kind === "date" || field?.kind === "datetime")
  ) {
    const timestamp = Date.parse(value);
    if (Number.isFinite(timestamp))
      return intl.date(
        value,
        field.kind === "date"
          ? { dateStyle: "medium", timeZone: "UTC" }
          : { dateStyle: "medium", timeStyle: "short" },
      );
  }
  // Decimal strings/money retain exact precision; references retain captured identity.
  // Never resolve a historical reference against today's label or infer currency.
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}
