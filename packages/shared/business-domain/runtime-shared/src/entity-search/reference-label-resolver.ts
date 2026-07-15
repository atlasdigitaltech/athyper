import { runtimePath } from "@athyper/api-contracts/runtime-paths";
import { getCsrfToken } from "../client/csrf";

export interface ReferenceLabelRequest {
  entity: string;
  value: string;
  valueField: string;
  labelField: string;
  codeField: string;
}

export interface ReferenceLabelResult {
  label: string | null;
  code: string | null;
}

type Pending = {
  request: ReferenceLabelRequest;
  resolve: (result: ReferenceLabelResult | null) => void;
};

const cache = new Map<string, ReferenceLabelResult | null>();
const pending = new Map<string, Pending[]>();
let scheduled = false;

function requestKey(request: ReferenceLabelRequest): string {
  return [request.entity, request.valueField, request.value, request.labelField, request.codeField].join(":");
}

export function resolveReferenceLabel(request: ReferenceLabelRequest): Promise<ReferenceLabelResult | null> {
  const key = requestKey(request);
  if (cache.has(key)) return Promise.resolve(cache.get(key) ?? null);
  return new Promise((resolve) => {
    pending.set(key, [...(pending.get(key) ?? []), { request, resolve }]);
    if (!scheduled) {
      scheduled = true;
      queueMicrotask(() => void flush());
    }
  });
}

async function flush(): Promise<void> {
  scheduled = false;
  const batch = [...pending.entries()];
  pending.clear();
  const references = batch.map(([key, entries]) => ({ key, ...entries[0]!.request }));
  try {
    const response = await fetch(runtimePath.referenceLabelsResolve(), {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": getCsrfToken() },
      body: JSON.stringify({ references }),
    });
    if (!response.ok) throw new Error(`Reference label resolution failed (${response.status}).`);
    const body = await response.json() as {
      data?: Array<{ key: string; label: string | null; code: string | null }>;
    };
    const byKey = new Map((body.data ?? []).map((item) => [item.key, item]));
    for (const [key, entries] of batch) {
      const item = byKey.get(key);
      const result = item ? { label: item.label, code: item.code } : null;
      cache.set(key, result);
      entries.forEach((entry) => entry.resolve(result));
    }
  } catch {
    for (const [, entries] of batch) entries.forEach((entry) => entry.resolve(null));
  }
}
