import { randomBytes, createHash } from "node:crypto";
import { sql, type Kysely } from "kysely";
import { sha256 } from "./deterministic.js";

type Database = Kysely<Record<string, never>>;
export interface ProductCommandScope {
  readonly authorityTenantId: string;
  readonly actorId: string;
  readonly changeSetId: string;
  /** Explicit creation intent, pinned by governance and the database ticket. */
  readonly creationEntityId?: string;
}
/** Trusted host port. It must re-resolve the installed governance binding and
 * current authenticated human authority, including revocation, on every call.
 * Neither request DTOs nor product-review receipts implement this port. */
export interface ProductCommandGovernance<Context> {
  authorize(
    context: Context,
    scope: ProductCommandScope,
    requestHash: string,
  ): Promise<void>;
}
/** Transport for the existing canonical writer, not a permission resolver.
 * The issuer connection is isolated from the application connection. The
 * application login must never inherit the issuer role. No default admission. */
export function createProductCommandAuthority<Context>(options: {
  issuer: Database;
  governance: ProductCommandGovernance<Context>;
  applicationLogin: string;
}) {
  if (!options.applicationLogin || !options.governance?.authorize)
    throw Error("PRODUCT_COMMAND_GOVERNANCE_REQUIRED");
  return {
    async issue(
      context: Context,
      scope: ProductCommandScope,
      command: unknown,
    ) {
      // Snapshot before awaiting authorization: caller mutation cannot change
      // the scope or the command admitted by the governance decision.
      const captured = Object.freeze(structuredClone(scope));
      const requestHash = sha256({
        scope: captured,
        command: structuredClone(command),
      });
      await options.governance.authorize(context, captured, requestHash);
      const token = randomBytes(32).toString("hex");
      const digest = createHash("sha256").update(token).digest();
      if (captured.creationEntityId !== undefined) {
        await sql`INSERT INTO entity_command_private.admission
          (token_hash,login_role,authority_tenant_id,actor_id,change_set_id,request_hash,expires_at,creation_entity_id)
          VALUES(${digest},${options.applicationLogin},${captured.authorityTenantId}::uuid,
          ${captured.actorId}::uuid,${captured.changeSetId}::uuid,${requestHash},clock_timestamp()+interval '60 seconds',${captured.creationEntityId}::uuid)`.execute(
          options.issuer,
        );
      } else
        await sql`INSERT INTO entity_command_private.admission
        (token_hash,login_role,authority_tenant_id,actor_id,change_set_id,request_hash,expires_at)
        VALUES(${digest},${options.applicationLogin},${captured.authorityTenantId}::uuid,
          ${captured.actorId}::uuid,${captured.changeSetId}::uuid,${requestHash},clock_timestamp()+interval '60 seconds')`.execute(
          options.issuer,
        );
      return { token, requestHash, scope: captured };
    },
    async revoke(token: string) {
      const digest = createHash("sha256").update(token).digest();
      await sql`SELECT entity_command_private.revoke(${digest})`.execute(
        options.issuer,
      );
    },
  };
}

/** Invoke only in the canonical command transaction, before repository locking.
 * A failed or rolled-back attempt needs fresh governance authorization before retry.
 * Never log the admission token. */
export async function enterProductCommand(
  tx: Database,
  admission: { token: string; requestHash: string; scope: ProductCommandScope },
  command: unknown,
): Promise<void> {
  if (sha256({ scope: admission.scope, command }) !== admission.requestHash)
    throw Error("PRODUCT_COMMAND_CONTENT_MISMATCH");
  await sql`SELECT set_config('app.database_plane','studio',true),set_config('app.current_actor_type','user',true),set_config('app.current_tenant_id',${admission.scope.authorityTenantId},true),
    set_config('app.current_principal_id',${admission.scope.actorId},true)`.execute(
    tx,
  );
  await sql`SELECT entity_command_private.enter(${admission.token},${admission.requestHash})`.execute(
    tx,
  );
}

/** Cleanup failure is distinct from transaction failure. An unconfirmed outcome
 * can include a lost COMMIT acknowledgement; never assert rollback in that case.
 * No bearer or raw cleanup SQL error is exposed. Recover with the SAME canonical
 * idempotency key through fresh authenticated governance, not by reusing a token. */
export class ProductCommandCleanupError<Result = unknown> extends Error {
  readonly code = "PRODUCT_COMMAND_REVOCATION_FAILED";
  constructor(
    readonly outcome: "committed" | "unconfirmed",
    readonly committedResult?: Result,
    transactionError?: unknown,
  ) {
    super(
      `Product command ${outcome}; admission revocation could not be confirmed. Retry the same command identity through fresh governance.`,
      transactionError === undefined ? undefined : { cause: transactionError },
    );
    this.name = "ProductCommandCleanupError";
  }
}

/** Rechecks governance for every execution/replay and revokes the bearer after
 * commit or rollback. The caller supplies the existing canonical transaction;
 * this does not open an administrator transaction or attest publication review. */
export async function withProductCommandAuthority<
  Context,
  Command,
  Result,
>(options: {
  authority: ReturnType<typeof createProductCommandAuthority<Context>>;
  context: Context;
  scope: ProductCommandScope;
  command: Command;
  database: Database;
  execute(tx: Database, command: Command): Promise<Result>;
}): Promise<Result> {
  const command = structuredClone(options.command);
  const admission = await options.authority.issue(
    options.context,
    options.scope,
    command,
  );
  let result: Result;
  try {
    result = await options.database
      .transaction()
      .setIsolationLevel("serializable")
      .execute(async (tx) => {
        await enterProductCommand(tx, admission, command);
        return options.execute(tx, command);
      });
  } catch (transactionError) {
    try {
      await options.authority.revoke(admission.token);
    } catch {
      throw new ProductCommandCleanupError(
        "unconfirmed",
        undefined,
        transactionError,
      );
    }
    throw transactionError;
  }
  try {
    await options.authority.revoke(admission.token);
  } catch {
    throw new ProductCommandCleanupError("committed", result);
  }
  return result;
}
