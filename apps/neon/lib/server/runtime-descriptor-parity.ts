import type { MetaEntityRuntimeDescriptor } from "@athyper/runtime-contracts";

export function runtimeDescriptorParity(
  next: MetaEntityRuntimeDescriptor,
  previous: MetaEntityRuntimeDescriptor,
): boolean {
  return stableRuntimeJson(stripParityFields(next)) === stableRuntimeJson(stripParityFields(previous));
}

function stripParityFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripParityFields);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !["compiledAt", "descriptorHash", "bootstrapHash", "cacheState"].includes(key))
    .map(([key, child]) => [key, stripParityFields(child)]));
}

function stableRuntimeJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableRuntimeJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableRuntimeJson(record[key])}`).join(",")}}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
