import { sql } from "kysely";
import { AuthoringPolicyError } from "@athyper/server-contract-meta-entity-authoring";
import type { NativeAuthoringPolicy } from "./native-core-layout-persistence.js";
const unsupported = (): never => {
  throw new AuthoringPolicyError(
    "PRODUCT_LABEL_HOST_ONLY",
    "This installed command host supports legacy label enrollment only.",
  );
};
/** Server command host for the existing bootstrap API, independent of composer
 * presentation. Only a governance-admitted application transaction may enter.
 * Native saves, reference allocation and protected-state initialization are not
 * implemented by this bounded host and cannot obtain a synthetic initializer. */
export function createProductLabelHost(): NativeAuthoringPolicy {
  return {
    get commands() {
      return unsupported();
    },
    async resolveContext() {
      return unsupported();
    },
    async resolveInitializer() {
      return unsupported();
    },
    async admit(tx, input, intent) {
      if (
        !tx.isTransaction ||
        input.tenantId !== null ||
        (intent === "read"
          ? input.batch !== null
          : intent !== "write" ||
            !input.batch ||
            typeof input.batch !== "object" ||
            (input.batch as { contract?: unknown }).contract !==
              "entity.authoring-label-commands/1")
      )
        unsupported();
      const rows =
        await sql`SELECT c.id FROM metadata.entity_change_set c JOIN metadata.entity e ON e.id=c.entity_id
        WHERE c.id=${input.changeSetId}::uuid AND c.entity_id=${input.entityId}::uuid
        AND c.tenant_id IS NULL AND e.tenant_id IS NULL AND e.ownership_model='system'
        AND c.status IN ('draft','rejected') AND entity_command_private.admitted(c.id)
        AND current_setting('app.current_principal_id',true)=${input.actorId}`.execute(
          tx,
        );
      if (rows.rows.length !== 1)
        throw new AuthoringPolicyError(
          "PRODUCT_COMMAND_HOST_DENIED",
          "An admitted canonical product command transaction is required.",
        );
    },
  };
}
