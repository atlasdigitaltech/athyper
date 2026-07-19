export const ACCESS_MODES = ["default_deny", "default_allow", "explicit"] as const;
export const COMPANY_SCOPE_MODES = ["none", "single", "subtree", "full"] as const;
export const AUDIT_MODES = ["enabled", "disabled", "sampling"] as const;

export function formatJson(value: unknown): string {
  return JSON.stringify(value ?? {}, null, 2);
}

export function parseJsonText(text: string, options?: { objectOnly?: boolean }): { ok: boolean; value?: unknown; error?: string } {
  const trimmed = text.trim();
  if (!trimmed) return { ok: true, value: null };
  try {
    const value = JSON.parse(trimmed) as unknown;
    if (options?.objectOnly && (!value || typeof value !== "object" || Array.isArray(value))) return { ok: false, error: "Expected a JSON object." };
    return { ok: true, value };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Invalid JSON." };
  }
}
