import type { CompiledEntity } from "@athyper/api-contracts/metadata";
import type { EntityPrintConfig } from "@athyper/runtime-contracts";
import { getFieldDisplayLabel } from "./field-value";

export interface PrintIdentity {
  typeLabel:   string;
  code:        string | null;
  name:        string | null;
  subtitle:    string | null;
  status:      string | null;
  pinnedFacts: Array<{ label: string; value: string }>;
}

export function resolvePrintIdentity(
  entity: CompiledEntity,
  data: Record<string, unknown>,
  printConfig: EntityPrintConfig | undefined,
): PrintIdentity {
  const displayConfig = entity.display_config as Record<string, unknown> | undefined;
  const identityConfig = entity.identity_config;

  const codeField = identityConfig?.business_key_fields?.[0] ?? "code";
  const nameField = (displayConfig?.["title_field"] as string | undefined) ?? "name";
  const subtitleField = displayConfig?.["subtitle_field"] as string | undefined;
  const statusFields = displayConfig?.["status_field_names"] as string[] | undefined;
  const statusField = statusFields?.[0] ?? "status";

  const typeLabel = entity.entity_name;
  const code   = data[codeField] != null ? String(data[codeField]) : null;
  const name   = data[nameField] != null ? String(data[nameField]) : null;
  const subtitle = subtitleField && data[subtitleField] != null ? String(data[subtitleField]) : null;
  const status = data[statusField] != null ? String(data[statusField]) : null;

  const pinFields = printConfig?.header_pin_fields ?? [];
  const pinnedFacts = pinFields
    .map((fieldName: string) => {
      const field = entity.fields.find((f: { name: string }) => f.name === fieldName);
      if (!field) return null;
      const displayKey = `${fieldName}__display`;
      const raw = data[displayKey] ?? data[fieldName];
      if (raw == null) return null;
      return {
        label: getFieldDisplayLabel(field, printConfig),
        value: String(raw),
      };
    })
    .filter((f: { label: string; value: string } | null): f is { label: string; value: string } => f !== null);

  return { typeLabel, code, name, subtitle, status, pinnedFacts };
}
