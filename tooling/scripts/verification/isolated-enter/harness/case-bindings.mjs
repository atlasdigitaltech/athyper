/** Translate owning-service case coordinates to the reviewed BP case namespace.
 * A BP direct create/update must never become a governed case command. */
const operations = new Set([
  "create",
  "read",
  "update",
  "validate",
  "submit",
  "decide",
  "materialize",
]);
export function caseAwareMapping(base, profile) {
  return {
    ...base,
    target(request) {
      const r = request.resource ?? {},
        prefix = "neon.relationship.entity_case.";
      if (!request.permissionCode.startsWith(prefix) || r.sectionCode)
        return base.target(request);
      const method = request.permissionCode.slice(prefix.length),
        key = "case_" + method;
      if (
        !operations.has(method) ||
        (r.operationKey && r.operationKey !== method && r.operationKey !== key)
      )
        return null;
      const operation = profile.operations.find(
        (o) => o.key === key && o.permissionCode === request.permissionCode,
      );
      if (
        !operation ||
        (operation.target === "existing" &&
          (r.entityCode !== "entity_case" || typeof r.recordId !== "string")) ||
        (r.authorizationTarget === "proposed" &&
          operation.target === "existing")
      )
        return null;
      const coordinates = {};
      for (const k of ["operatingOrganizationId", "companyCodeId"])
        if (typeof r[k] === "string") coordinates[k] = r[k];
      return {
        operationKey: key,
        phase: "execute",
        coordinates,
        ...(r.entityCode === "entity_case" && typeof r.recordId === "string"
          ? { recordId: r.recordId }
          : {}),
      };
    },
  };
}
/** Preserve the real domain policy and grants; use the signed case operation's
 * namespace when its owning service supplies independent-child coordinates. */
export function caseAwareAuthority(authority, profile) {
  return {
    ...authority,
    authorize(request) {
      const resource = request.resource ?? {};
      if (
        resource.entityCode !== "entity_case" ||
        !request.permissionCode.startsWith("neon.relationship.entity_case.")
      )
        return authority.authorize(request);
      const mapped = caseAwareMapping({ target: () => null }, profile).target(
        request,
      );
      if (!mapped)
        return Promise.resolve({
          allowed: false,
          reason: "case_binding_unavailable",
        });
      return authority.authorize({
        ...request,
        resource: {
          ...resource,
          entityCode: "business_partner",
          operationKey: mapped.operationKey,
        },
      });
    },
  };
}
