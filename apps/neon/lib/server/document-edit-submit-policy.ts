import "server-only";

/** Independent operational kill switch; workspace Save remains available. */
export function isDocumentSaveAndTransitionEnabled(input: {
  tenantId?: string;
  entityCode: string;
  env?: Readonly<Record<string, string | undefined>>;
}): boolean {
  const entries = new Set(
    (input.env ?? process.env)["DOCUMENT_EDIT_SAVE_AND_TRANSITION_DISABLED"]
      ?.split(",")
      .map((entry) => entry.trim())
      .filter(Boolean) ?? [],
  );
  const tenantId = input.tenantId?.trim() ?? "";
  const entityCode = input.entityCode.trim().toLowerCase().replace(/-/g, "_");
  return !(
    entries.has(`${tenantId}:${entityCode}`)
    || entries.has(`*:${entityCode}`)
    || entries.has(`${tenantId}:*`)
    || entries.has("*:*")
  );
}
