/** Reviewed import gateway hard policy. Grant, deny, entitlement and MFA checks
 * still run in the normal permission authorizer around this policy. */
export function governedImportPolicy(preflight) {
  return {
    async evaluate(input) {
      const r = input.resource ?? {};
      if (
        input.permissionCode !== "neon.relationship.bp_target.import" ||
        input.context.planeKey !== "neon" ||
        r.tenantId !== input.context.tenantId ||
        r.entityCode !== "business_partner" ||
        r.operationKey !== "import"
      )
        return {
          allowed: false,
          reason: "governed_import_coordinates_required",
        };
      const state = await preflight({
        context: input.context,
        operationKey: "import",
        phase: "execute",
        historical: false,
      });
      return {
        allowed: state === "allowed",
        reason: "reviewed_governed_import_preflight",
      };
    },
  };
}
