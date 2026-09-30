import type {
  ConnectorTransport,
  SecretResolver,
} from "@athyper/server-contract-integration";
import { randomUUID } from "node:crypto";
import { sql } from "kysely";
import type {
  ConnectorDraft,
  ConnectorRepository,
  ConnectorHealthJobs,
} from "@athyper/server-contract-control-admin";
import {
  ControlRepositoryDb,
  type ControlTx,
  type Row,
  fail,
  version,
} from "./control-repository-db.js";
import { validateConnector } from "./connector-control.js";
const states = {
  draft: "draft",
  active: "active",
  suspended: "paused",
  deprecated: "deprecated",
};
const moves: Record<string, string[]> = {
  draft: ["active", "deprecated"],
  active: ["paused", "deprecated"],
  paused: ["active", "deprecated"],
};
export class KyselyConnectorRepository
  extends ControlRepositoryDb
  implements ConnectorRepository
{
  async get(tenant: string, id: string) {
    return this.run(tenant, undefined, undefined, (tx) => read(tx, tenant, id));
  }
  async save(
    input: Omit<ConnectorDraft, "version"> & { expectedVersion: number },
    actor: string,
  ) {
    validateConnector(input);
    if (input.status !== "draft") throw fail(409, "LIFECYCLE_INVALID");
    return this.run(
      input.tenantId,
      actor,
      `connector:${input.tenantId}:${input.id}`,
      async (tx) => {
        const old = await read(tx, input.tenantId, input.id, true);
        version(old as Row | undefined, input.expectedVersion);
        if (old && old.status !== "draft") throw fail(409, "LIFECYCLE_INVALID");
        if (!old)
          await sql`INSERT INTO control.connector_instance(id,tenant_id,connector_type_id,code,name,base_url,credential_reference,config,created_by) VALUES(${input.id}::uuid,${input.tenantId}::uuid,${input.connectorTypeId}::uuid,${input.code},${input.name},${input.baseUrl ?? null},${input.secretReference ?? null},${JSON.stringify(input.config)}::jsonb,${actor}::uuid)`.execute(
            tx,
          );
        else
          await sql`UPDATE control.connector_instance SET code=${input.code},connector_type_id=${input.connectorTypeId}::uuid,name=${input.name},base_url=${input.baseUrl ?? null},credential_revision=credential_revision+CASE WHEN credential_reference IS DISTINCT FROM ${input.secretReference ?? null} THEN 1 ELSE 0 END,credential_reference=${input.secretReference ?? null},config=${JSON.stringify(input.config)}::jsonb,updated_by=${actor}::uuid WHERE tenant_id=${input.tenantId}::uuid AND id=${input.id}::uuid`.execute(
            tx,
          );
        // Draft-only endpoint edits preserve IDs and native delivery settings on retained codes.
        const codes = input.endpoints.map((e) => e.code);
        await sql`DELETE FROM control.integration_endpoint WHERE tenant_id=${input.tenantId}::uuid AND connector_instance_id=${input.id}::uuid AND NOT(code=ANY(${codes}::text[]))`.execute(
          tx,
        );
        for (const e of input.endpoints)
          await sql`INSERT INTO control.integration_endpoint(tenant_id,connector_instance_id,code,name,path,http_method,endpoint_kind_code,request_schema,created_by) VALUES(${input.tenantId}::uuid,${input.id}::uuid,${e.code},${e.code},${e.path},${e.method},${e.kind},${JSON.stringify(e.requestSchema ?? {})}::jsonb,${actor}::uuid) ON CONFLICT(tenant_id,connector_instance_id,code) DO UPDATE SET path=excluded.path,http_method=excluded.http_method,endpoint_kind_code=excluded.endpoint_kind_code,request_schema=excluded.request_schema,definition_version=control.integration_endpoint.definition_version+1,updated_by=excluded.created_by`.execute(
            tx,
          );
        const saved = (await read(tx, input.tenantId, input.id))!;
        await this.evidence(
          tx,
          input.tenantId,
          actor,
          "connectors",
          input.id,
          saved.version,
          "saved",
        );
        return saved;
      },
    );
  }
  async transition(
    tenant: string,
    id: string,
    status: ConnectorDraft["status"],
    expected: number,
    actor: string,
  ) {
    return this.run(tenant, actor, `connector:${tenant}:${id}`, async (tx) => {
      const old = await read(tx, tenant, id, true);
      if (!old) throw fail(404, "NOT_FOUND");
      version(old as Row | undefined, expected);
      const target = states[status];
      if (!moves[states[old!.status]]?.includes(target))
        throw fail(409, "LIFECYCLE_INVALID");
      if (status === "active") {
        validateConnector(old!);
        if (!old!.baseUrl || !old!.endpoints.length)
          throw fail(400, "CONNECTOR_INVALID");
      }
      await sql`UPDATE control.connector_instance SET status=${target},updated_by=${actor}::uuid WHERE tenant_id=${tenant}::uuid AND id=${id}::uuid`.execute(
        tx,
      );
      await sql`UPDATE control.integration_endpoint SET status=${target},updated_by=${actor}::uuid WHERE tenant_id=${tenant}::uuid AND connector_instance_id=${id}::uuid`.execute(
        tx,
      );
      const saved = (await read(tx, tenant, id))!;
      await this.evidence(
        tx,
        tenant,
        actor,
        "connectors",
        id,
        saved.version,
        "transitioned",
      );
      return saved;
    });
  }
  async enqueue(
    input: Parameters<ConnectorHealthJobs["enqueue"]>[0],
  ): Promise<string> {
    if (input.planeKey !== this.plane) throw fail(403, "PLANE_MISMATCH");
    return this.run(
      input.tenantId,
      input.requestedBy,
      `connector:${input.tenantId}:${input.connectorId}`,
      async (tx) => {
        const c = await read(tx, input.tenantId, input.connectorId, true);
        if (!c) throw fail(404, "NOT_FOUND");
        if (c.status === "deprecated") throw fail(409, "LIFECYCLE_INVALID");
        const id = randomUUID();
        await sql`INSERT INTO control.connector_health_job(id,tenant_id,connector_id,requested_by) VALUES(${id}::uuid,${input.tenantId}::uuid,${input.connectorId}::uuid,${input.requestedBy}::uuid)`.execute(
          tx,
        );
        await this.evidence(
          tx,
          input.tenantId,
          input.requestedBy,
          "connectors",
          input.connectorId,
          c.version,
          "health_requested",
          { jobId: id, connectorVersion: c.version },
        );
        return id;
      },
    );
  }
  async processHealthJobs(
    transport: ConnectorTransport,
    secrets: SecretResolver,
    limit = 10,
  ): Promise<number> {
    let processed = 0;
    for (; processed < limit; processed++) {
      const job = await this.run(
        undefined,
        undefined,
        undefined,
        async (tx) =>
          (
            await sql<Row>`SELECT * FROM control.claim_connector_health_job()`.execute(
              tx,
            )
          ).rows[0],
      );
      if (!job) break;
      await this.run(
        job.tenant_id,
        job.requested_by,
        `connector:${job.tenant_id}:${job.connector_id}`,
        async (tx) => {
          const connector = await read(
            tx,
            job.tenant_id,
            job.connector_id,
            true,
          );
          let result = "CONNECTOR_UNAVAILABLE",
            healthy = false;
          if (connector && connector.status !== "deprecated") {
            try {
              validateConnector(connector);
              const endpoint = (
                await sql<Row>`SELECT * FROM control.integration_endpoint WHERE tenant_id=${job.tenant_id}::uuid AND connector_instance_id=${job.connector_id}::uuid AND endpoint_kind_code='health' AND http_method='GET' ORDER BY code LIMIT 1`.execute(
                  tx,
                )
              ).rows[0];
              if (!connector.baseUrl || !endpoint)
                result = "HEALTH_ENDPOINT_REQUIRED";
              else {
                const credential = connector.secretReference
                  ? await secrets.resolve(connector.secretReference)
                  : undefined;
                const native = (
                  await sql<Row>`SELECT credential_revision FROM control.connector_instance WHERE tenant_id=${job.tenant_id}::uuid AND id=${job.connector_id}::uuid`.execute(
                    tx,
                  )
                ).rows[0]!;
                const response = await transport.probe(
                  {
                    version: connector.version,
                    tenantId: job.tenant_id,
                    connectorInstanceId: job.connector_id,
                    endpointId: endpoint.id,
                    kind: "health",
                    url: new URL(endpoint.path, connector.baseUrl).toString(),
                    method: "GET",
                    requestContentType: "application/json",
                    timeoutMs: 10000,
                    headers: {},
                    maxPayloadBytes: 65536,
                    retryPolicy: {
                      maxAttempts: 1,
                      initialDelayMs: 1000,
                      maxDelayMs: 1000,
                      multiplier: 1,
                      retryStatuses: [],
                    },
                    credentialRevision: Number(native.credential_revision),
                    ...(connector.secretReference
                      ? { credentialReference: connector.secretReference }
                      : {}),
                    audience: job.connector_id,
                  },
                  credential?.bytes,
                  AbortSignal.timeout(15000),
                );
                healthy = response.status >= 200 && response.status < 300;
                result = healthy ? "HEALTHY" : "PROVIDER_UNHEALTHY";
              }
            } catch {
              result = "HEALTH_CHECK_FAILED";
            }
            await sql`UPDATE control.connector_instance SET health_status=${healthy ? "healthy" : "down"},last_health_check_at=clock_timestamp(),last_error_code=${healthy ? null : result},last_error_message=NULL,updated_by=${job.requested_by}::uuid WHERE tenant_id=${job.tenant_id}::uuid AND id=${job.connector_id}::uuid`.execute(
              tx,
            );
          }
          await sql`UPDATE control.connector_health_job SET status='completed',result_code=${result},completed_at=clock_timestamp(),lease_until=NULL WHERE tenant_id=${job.tenant_id}::uuid AND id=${job.id}::uuid AND attempts=${job.attempts}`.execute(
            tx,
          );
        },
      );
    }
    return processed;
  }
}
async function read(
  tx: ControlTx,
  tenant: string,
  id: string,
  lock = false,
): Promise<ConnectorDraft | undefined> {
  const r = (
    await sql<Row>`SELECT * FROM control.connector_instance WHERE tenant_id=${tenant}::uuid AND id=${id}::uuid ${lock ? sql`FOR UPDATE` : sql``}`.execute(
      tx,
    )
  ).rows[0];
  if (!r) return undefined;
  const status = (
    {
      draft: "draft",
      active: "active",
      paused: "suspended",
      deprecated: "deprecated",
    } as const
  )[r.status as "draft"];
  if (!status) throw fail(409, "CONNECTOR_NATIVE_STATE_UNSUPPORTED");
  const endpoints = (
    await sql<Row>`SELECT * FROM control.integration_endpoint WHERE tenant_id=${tenant}::uuid AND connector_instance_id=${id}::uuid ORDER BY code`.execute(
      tx,
    )
  ).rows;
  return {
    id: r.id,
    tenantId: r.tenant_id,
    version: Number(r.version),
    connectorTypeId: r.connector_type_id,
    code: r.code,
    name: r.name,
    ...(r.base_url ? { baseUrl: r.base_url } : {}),
    ...(r.credential_reference
      ? { secretReference: r.credential_reference }
      : {}),
    config: r.config,
    endpoints: endpoints.map((e) => ({
      code: e.code,
      path: e.path,
      method: e.http_method,
      kind: e.endpoint_kind_code,
      requestSchema: e.request_schema,
    })),
    status,
  };
}
