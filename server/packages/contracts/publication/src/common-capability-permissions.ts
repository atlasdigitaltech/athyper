/** Exact common capability vocabulary, not a namespace-wide authorization grant.
 * Reference reads are deliberately absent. Tenant/parent/audience authorization,
 * catalog registration and release qualification remain mandatory at runtime.
 */
const commonActions = {
  comments: {
    read: "read",
    create: "create",
    update_own: "update_own",
    archive_own: "archive_own",
    reply: "create",
    react: "create",
    draft: "create",
    flag: "read",
    mention: "read",
    history: "read",
  },
  attachments: {
    read: "read",
    create: "create",
    finalize: "finalize",
    download: "download",
    archive: "archive",
    status: "read",
    version: "create",
    rename: "create",
    folder: "create",
    unlink: "archive",
    preview: "download",
    extract: "read",
    search: "read",
    category: "create",
  },
} as const;

export function capabilityActionMetadata(kind: "comments" | "attachments", key: string) {
  const permissions: Readonly<Record<string, string>> = commonActions[kind];
  if (!Object.hasOwn(permissions, key)) throw new TypeError("CAPABILITY_ACTION_UNKNOWN");
  const concurrency = ["update_own", "version", "rename", "folder"].includes(key) ? "revision" as const : "none" as const;
  const requiredIdempotency = ["create", "finalize", "reply"].includes(key);
  return { key, permissionCode: `common.collaboration.${kind === "comments" ? "comment" : "attachment"}.${permissions[key]}`,
    handlerKey: `platform.${kind}.${key}.v1`, concurrency,
    idempotency: requiredIdempotency || ["version", "rename", "folder", "unlink"].includes(key) ? "required" as const : "none" as const,
    requiredIdempotency };
}

export function capabilityProfileActions(kind: "comments" | "attachments", categories: readonly unknown[] = []) {
  return Object.keys(commonActions[kind]).filter(key => key !== "category" || categories.length > 0).map(key => {
    const { requiredIdempotency: _requirement, ...action } = capabilityActionMetadata(kind, key);
    return action;
  });
}

export function isCommonCapabilityAction(
  kind: "comments" | "attachments",
  action: {
    readonly key: string;
    readonly permissionCode: string;
    readonly handlerKey: string;
  },
): boolean {
  const permissions: Readonly<Record<string, string>> = commonActions[kind];
  return (
    Object.hasOwn(permissions, action.key) &&
    action.permissionCode === capabilityActionMetadata(kind, action.key).permissionCode &&
    action.handlerKey === capabilityActionMetadata(kind, action.key).handlerKey
  );
}
