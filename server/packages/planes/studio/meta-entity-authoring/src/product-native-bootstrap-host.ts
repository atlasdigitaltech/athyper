import { sql } from "kysely";
import {
  AuthoringPolicyError,
  referenceUuid,
  validateFoundationNode,
} from "@athyper/server-contract-meta-entity-authoring";
import {
  createInstalledReferenceResourceReader,
  resolveInstalledAuthoringDescriptor,
  type InstalledReferenceResourcePin,
} from "./installed-reference-resources.js";
import type { NativeAuthoringPolicy } from "./native-core-layout-persistence.js";

const denied = (): never => {
  throw new AuthoringPolicyError(
    "PRODUCT_NATIVE_BOOTSTRAP_HOST_DENIED",
    "An entity-bound creation admission and current installed authoring descriptor are required.",
  );
};
const unsupported = (): never => {
  throw new AuthoringPolicyError(
    "PRODUCT_NATIVE_BOOTSTRAP_HOST_ONLY",
    "This command host admits fresh bootstrap and its replay, not general native editing.",
  );
};
/** Concrete server-command admission, independent of composer presentation.
 * The authenticated governance issuer already authorizes the operation; this
 * host rechecks its transaction-bound creation ticket and the exact installed,
 * signed and independently reviewed descriptor. No request supplies a policy.
 * This does not qualify compiler/provider resources, schema or live reads.
 */
export function createProductNativeBootstrapHost(
  options: Parameters<typeof createInstalledReferenceResourceReader>[0] & {
    readonly descriptorPin: InstalledReferenceResourcePin;
    readonly commands: NativeAuthoringPolicy["commands"];
    readonly additionalAdmission: NativeAuthoringPolicy["admit"];
  },
): NativeAuthoringPolicy {
  const commands = structuredClone(options.commands);
  const pin = structuredClone(options.descriptorPin);
  const authorityTenantId = options.authorityTenantId;
  validateFoundationNode(
    referenceUuid,
    authorityTenantId,
    "/authorityTenantId",
  );
  if (
    !options.additionalAdmission ||
    pin.kind !== "entity_authoring_descriptor" ||
    !/^[a-f0-9]{64}$/.test(commands.authoringSchemaHash) ||
    !Number.isSafeInteger(commands.maxMembers) ||
    commands.maxMembers < 1 ||
    commands.maxMembers > 100000 ||
    !Number.isSafeInteger(commands.maxCommands) ||
    commands.maxCommands < 1 ||
    commands.maxCommands > 10000 ||
    !Number.isSafeInteger(commands.maxBatchBytes) ||
    commands.maxBatchBytes < 1 ||
    commands.maxBatchBytes > 16 * 1024 * 1024
  )
    denied();
  const read = createInstalledReferenceResourceReader(options);
  return {
    commands: Object.freeze(commands),
    snapshotVersions: Object.freeze([2] as const),
    async resolveContext() {
      return unsupported();
    },
    async resolveInitializer() {
      return unsupported();
    },
    async admit(tx, input, intent) {
      if (
        !tx.isTransaction ||
        intent !== "write" ||
        input.tenantId !== null ||
        !input.batch ||
        typeof input.batch !== "object" ||
        Array.isArray(input.batch) ||
        Object.keys(input.batch).join() !== "contract" ||
        Reflect.get(input.batch, "contract") !==
          "entity.authoring-native-bootstrap/1"
      )
        denied();
      for (const value of [input.entityId, input.changeSetId, input.actorId])
        validateFoundationNode(referenceUuid, value, "/bootstrap/id");
      const result = await sql<{ admitted: boolean }>`SELECT
        current_setting('app.current_principal_id',true)=${input.actorId}
        AND current_setting('app.current_tenant_id',true)=${authorityTenantId}
        AND entity_command_private.admitted_creation(${input.changeSetId}::uuid,${input.entityId}::uuid)
        AS admitted`.execute(tx);
      if (result.rows.length !== 1 || result.rows[0]?.admitted !== true)
        denied();
      // The existing reader locks the publication source/head and verifies the
      // signature and current human review eligibility on every call/replay.
      await resolveInstalledAuthoringDescriptor(
        tx,
        pin,
        read,
        commands.authoringSchemaHash,
      );
      await options.additionalAdmission(tx, input, intent);
    },
  };
}
