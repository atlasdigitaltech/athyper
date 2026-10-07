import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { NormalizedAuthoringPolicy } from "@athyper/server-contract-meta-entity-authoring";
import type { Kysely } from "kysely";
import type { NativeAuthoringPolicy } from "./native-core-layout-persistence.js";
import { KyselyMetaEntityAuthoringRepository } from "./kysely-authoring-repository.js";
import {
  withProductCommandAuthority,
  type createProductCommandAuthority,
} from "./product-command-authority.js";

type Database = Kysely<Record<string, never>>;
type Input = Parameters<
  KyselyMetaEntityAuthoringRepository["executeLegacyLabelEnrollment"]
>[0];
type Result = Awaited<
  ReturnType<
    KyselyMetaEntityAuthoringRepository["executeLegacyLabelEnrollment"]
  >
>;
/** Installed control-plane composition must supply the current governance
 * resolver, separate issuer/application connections, host admission and existing
 * transactional audit recorder. This factory installs no route or default allow. */
export function createProductLabelEnrollment(options: {
  database: Database;
  authority: ReturnType<
    typeof createProductCommandAuthority<VerifiedRequestContext>
  >;
  labels: NormalizedAuthoringPolicy;
  host: NativeAuthoringPolicy;
  audit(
    tx: Database,
    context: VerifiedRequestContext,
    input: Input,
    result: Result,
  ): Promise<void>;
}) {
  if (!options.host?.admit || !options.audit)
    throw Error("PRODUCT_COMMAND_HOST_AND_AUDIT_REQUIRED");
  return async (
    context: VerifiedRequestContext,
    input: Omit<Input, "actorId" | "tenantId">,
  ): Promise<Result> => {
    const command: Input = {
      ...structuredClone(input),
      actorId: context.principalId,
      tenantId: null,
    };
    return withProductCommandAuthority({
      authority: options.authority,
      database: options.database,
      context,
      scope: {
        authorityTenantId: context.tenantId,
        actorId: context.principalId,
        changeSetId: command.changeSetId,
      },
      command,
      async execute(tx, captured) {
        const repository = new KyselyMetaEntityAuthoringRepository(
          tx,
          undefined,
          options.labels,
          undefined,
          options.host,
        );
        const result = await repository.executeLegacyLabelEnrollment(captured);
        await options.audit(tx, context, captured, result);
        return result;
      },
    });
  };
}
