import { createHash } from "node:crypto";

type Descriptor = Readonly<Record<string, any>>;
const bindings = ["searchFieldKeys", "summaryFieldKeys"] as const;

/** Field bindings may change within existing read authority; registry capabilities may not. */
export function assertGraphPreviewAiBindings(native: Descriptor, baseline: Descriptor): void {
  if (digest(native.ai ?? null) === digest(baseline.ai ?? null)) return;
  const proposed = native.ai, registered = baseline.ai;
  const fail = () => { throw new Error("GRAPH_PREVIEW_AI_REGISTRY_QUALIFICATION_REQUIRED"); };
  if (!proposed || !registered) return fail();
  const registry = (value: Descriptor) => Object.fromEntries(Object.entries(value).filter(([key]) => !bindings.includes(key as typeof bindings[number])));
  if (digest(registry(proposed)) !== digest(registry(registered))) return fail();
  for (const binding of bindings) {
    if (!Array.isArray(proposed[binding]) || !Array.isArray(registered[binding])) return fail();
    for (const key of proposed[binding]) {
      if (typeof key !== "string") return fail();
      if (registered[binding].includes(key)) continue;
      const stored = baseline.fields?.find((field: Descriptor) => field.key === key);
      const authored = native.fields?.find((field: Descriptor) => (field.key ?? field.fieldKey) === key);
      if (!stored || !authored || stored.storagePath !== authored.storagePath) return fail();
      const readable = (descriptor: Descriptor) => descriptor.authorization?.fieldPolicies?.filter((policy: Descriptor) => policy.fields?.includes(key) && policy.representation === "plain") ?? [];
      const previous = readable(baseline), next = readable(native);
      if (!previous.some((policy: Descriptor) => next.some((candidate: Descriptor) => candidate.readOperation === policy.readOperation))) return fail();
    }
  }
}
function digest(value: unknown): string {
  const canonical = (input: unknown): unknown => Array.isArray(input) ? input.map(canonical) : input && typeof input === "object" ? Object.fromEntries(Object.entries(input).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)])) : input;
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}
