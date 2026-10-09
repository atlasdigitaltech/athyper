import { sql, type Transaction } from "kysely";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import {
  assertLocalPublicationEnvironment,
  assertLocalPublicationRequest,
  type LocalDevelopmentAuthority,
  type LocalPublicationInputs,
  type LocalPublicationRequest,
  type PublicationEnvironmentIdentity,
} from "@athyper/server-contract-publication";

type Tx = Transaction<Record<string, never>>;
/** Use the existing authenticated control transaction/application role. The SQL
 * routine independently checks stored policy, principal, source and hash. */
export async function admitLocalPublicationRequest(options: {
  transaction: Tx;
  context: VerifiedRequestContext;
  host: PublicationEnvironmentIdentity;
  request: LocalPublicationRequest;
  /** Existing control IAM gate, evaluated on the verified caller by composition. */
  authorize: (
    context: VerifiedRequestContext,
    changeSetId: string,
  ) => Promise<boolean>;
}): Promise<string> {
  assertLocalPublicationEnvironment(options.host);
  const { context, request, transaction: tx } = options;
  if (
    context.planeKey !== "studio" ||
    context.principalId !== request.admission.developerPrincipalId ||
    options.host.environment !== request.admission.host.environment ||
    options.host.instance !== request.admission.host.instance ||
    options.host.domainSuffix !== request.admission.host.domainSuffix ||
    !(await options.authorize(context, request.inputs.changeSetId))
  )
    throw Error("LOCAL_PUBLICATION_ADMISSION_DENIED");
  await sql`SELECT set_config('app.database_plane','studio',true),
    set_config('app.current_tenant_id',${context.tenantId},true),
    set_config('app.current_principal_id',${context.principalId},true)`.execute(
    tx,
  );
  const result = await sql<{
    hash: string;
  }>`SELECT publication.admit_local_publication_request(${JSON.stringify(request)}::jsonb) AS hash`.execute(
    tx,
  );
  if (result.rows.length !== 1 || result.rows[0]?.hash !== request.hash)
    throw Error("LOCAL_PUBLICATION_ADMISSION_RECEIPT_INVALID");
  return request.hash;
}

/** Run inside the worker transaction used by createNativeReviewSource. Caller
 * supplies only a hash; stored admission establishes actors and graph. Current
 * resource/compiler/artifact/head pins are resolved independently, never echoed
 * from the queued request. No HTTP caller can choose those resolver results. */
export async function withLocalPublicationRequest<T>(options: {
  transaction: Tx;
  host: PublicationEnvironmentIdentity;
  requestHash: string;
  resolveCurrent: (
    request: LocalPublicationRequest,
    tx: Tx,
  ) => Promise<{
    authority: LocalDevelopmentAuthority;
    inputs: LocalPublicationInputs;
  }>;
  execute: (request: LocalPublicationRequest, tx: Tx) => Promise<T>;
}): Promise<T> {
  assertLocalPublicationEnvironment(options.host);
  if (!/^[a-f0-9]{64}$/.test(options.requestHash))
    throw Error("LOCAL_PUBLICATION_REQUEST_HASH_INVALID");
  const tx = options.transaction;
  const result = await sql<{
    authority: { request: LocalPublicationRequest };
  }>`SELECT publication.read_local_publication_request(${options.requestHash}) AS authority`.execute(
    tx,
  );
  const request = result.rows[0]?.authority?.request;
  if (
    result.rows.length !== 1 ||
    !request ||
    request.hash !== options.requestHash
  )
    throw Error("LOCAL_PUBLICATION_REQUEST_UNAVAILABLE");
  const prior = await sql<{
    value: string | null;
  }>`SELECT current_setting('app.local_publication_request_hash',true) AS value`.execute(
    tx,
  );
  if (prior.rows[0]?.value)
    throw Error("LOCAL_PUBLICATION_NESTED_REQUEST_DENIED");
  await sql`SAVEPOINT local_publication_execution`.execute(tx);
  try {
    await sql`SELECT set_config('app.local_publication_request_hash',${request.hash},true)`.execute(
      tx,
    );
    const current = await options.resolveCurrent(request, tx);
    assertLocalPublicationRequest(
      request,
      current.authority,
      { ...request.admission, host: options.host },
      current.inputs,
    );

    const value = await options.execute(request, tx);
    await sql`SELECT set_config('app.local_publication_request_hash','',true)`.execute(
      tx,
    );
    await sql`RELEASE SAVEPOINT local_publication_execution`.execute(tx);
    return value;
  } catch (error) {
    try {
      await sql`ROLLBACK TO SAVEPOINT local_publication_execution`.execute(tx);
      await sql`RELEASE SAVEPOINT local_publication_execution`.execute(tx);
    } catch {
      // Preserve the original error; a failed recovery leaves the outer
      // transaction aborted and its owner must roll it back.
    }
    throw error;
  }
}
