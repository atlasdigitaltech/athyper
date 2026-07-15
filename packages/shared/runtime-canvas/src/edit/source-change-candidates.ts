import type { EntityFieldDefaults } from "@athyper/cascade";
import type { MetaEntityField } from "@athyper/runtime-contracts";

export function hasClientSourceChangeCandidates(
  fields: MetaEntityField[],
  changedFields: string[],
  defaultsByField: Record<string, EntityFieldDefaults>,
): boolean {
  const changed = new Set(changedFields.filter(Boolean));
  if (changed.size === 0) return false;

  for (const defaults of Object.values(defaultsByField)) {
    const rules = defaults.on_source_change ?? [];
    if (rules.some((rule) => {
      const layers = Array.isArray(rule.layers) ? rule.layers : [];
      const sources = Array.isArray(rule.sources) ? rule.sources : [];
      return (
        layers.includes("client_on_change")
        && sources.some((source) => changed.has(source))
      );
    })) {
      return true;
    }
  }

  return fields.some((field) => (
    !changed.has(field.name)
    && isPickerField(field)
    && optionDependencyFields(field).some((source) => changed.has(source))
  ));
}

function optionDependencyFields(field: MetaEntityField): string[] {
  const fields = new Set<string>();
  const source = field.editor?.optionSource ?? field.optionSource;
  if (source?.kind === "reference" && source.dependsOn?.field) {
    fields.add(source.dependsOn.field);
  }

  for (const config of [field.referenceConfig, field.lookupConfig]) {
    const dependency = readRecord(config, "dependent_filter");
    const sourceField =
      readString(dependency, "source_field")
      ?? readString(dependency, "sourceField")
      ?? readString(dependency, "field");
    if (sourceField) fields.add(sourceField);
  }

  return [...fields].sort();
}

function isPickerField(field: MetaEntityField): boolean {
  const source = field.editor?.optionSource ?? field.optionSource;
  return source?.kind === "reference" || Boolean(readRecord(field.lookupConfig, "dependent_filter"));
}

function readString(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const child = (value as Record<string, unknown>)[key];
  return typeof child === "string" && child.length > 0 ? child : undefined;
}

function readRecord(value: unknown, key: string): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const child = (value as Record<string, unknown>)[key];
  return child && typeof child === "object" && !Array.isArray(child)
    ? child as Record<string, unknown>
    : null;
}
