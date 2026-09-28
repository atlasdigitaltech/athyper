import { Kysely, PostgresDialect, type PostgresPoolClient } from "kysely";
import { expect, it, vi } from "vitest";
import { parseCompiledEntityReleaseEnvelope } from "@athyper/server-contract-publication";
import { createRuntimeMetaCompiledEntityReleaseSource } from "../runtime-descriptor-repository.js";
import { execFileSync } from "node:child_process";

const coordinate = {
  tenantId: "11111111-1111-4111-8111-111111111111",
  principalId: "22222222-2222-4222-8222-222222222222",
  entityCode: "business_partner",
  planeKey: "neon" as const,
};
const hash = `sha256:${"a".repeat(64)}`;
const release = parseCompiledEntityReleaseEnvelope({
  schema: "athyper.compiled-entity-release/2.0-draft",
  contractStatus: "published",
  releaseId: "tenant-release",
  releaseNo: 1,
  targetPlanes: ["neon"],
  artifacts: [
    {
      artifactKey: "business_partner/core",
      artifactType: "core",
      entityCode: "business_partner",
      ref: "business_partner/core.json",
      hash,
    },
  ],
  externalDependencies: [],
  signature: {},
  releaseHash: hash,
});

it("reads tenant-owned fragments through the same tenant transaction as release resolution", async () => {
  const query = vi.fn(
    async (_sql: string, _parameters: readonly unknown[]) => ({
      rows: [],
      command: "SELECT" as const,
      rowCount: 0,
    }),
  );
  const database = new Kysely<Record<string, never>>({
    dialect: new PostgresDialect({
      pool: {
        end: async () => {},
        // SQL-only fixture; the cursor overload is not exercised by this repository.
        connect: async () => ({
          query: query as unknown as PostgresPoolClient["query"],
          release: () => {},
        }),
      },
    }),
  });
  const withTenantTransaction = vi.fn(async (_plane, _actor, work) =>
    work(database),
  );
  try {
    const source = createRuntimeMetaCompiledEntityReleaseSource({
      databases: { neon: database },
      withTenantTransaction,
    });
    expect(
      await source.findArtifact({
        coordinate,
        release,
        entry: release.artifacts[0]!,
      }),
    ).toBeNull();
    expect(withTenantTransaction).toHaveBeenCalledWith(
      "neon",
      coordinate,
      expect.any(Function),
    );
    const [statement, parameters] = query.mock.calls[0]!;
    expect(statement).toContain(
      "payload.tenant_id IS NULL OR payload.tenant_id=",
    );
    expect(statement).toContain("->>'releaseId'");
    expect(statement).toContain("->>'releaseHash'");
    expect(parameters).toEqual([
      coordinate.tenantId,
      release.releaseHash,
      release.releaseId,
      "business_partner/core",
    ]);
  } finally {
    await database.destroy();
  }
});

it("rejects a fragment read in a plane outside the admitted release", async () => {
  const source = createRuntimeMetaCompiledEntityReleaseSource({
    databases: {},
  });
  await expect(
    source.findArtifact({
      coordinate: { ...coordinate, planeKey: "mesh" },
      release,
      entry: release.artifacts[0]!,
    }),
  ).rejects.toThrow("PLANE_NOT_ADMITTED");
});

// Executes the repository's actual SQL against isolated CTE fixtures, without
// writing to any DEV table. Opt in when the local DEV Postgres is available.
it.runIf(process.env.RUN_DEV_METADATA_SQL_TESTS === "1")("publication ownership precedes tenant scope, with pins and reference-only compatibility preserved", async () => {
  const makeRelease = (id: string) => ({...release,releaseId:id});
  const rows = [
    {id:'global-owner', owner:'country', tenant:null, release:makeRelease('global-owner')},
    {id:'tenant-reference', owner:'business_partner', tenant:coordinate.tenantId, release:makeRelease('tenant-reference')},
    {id:'unknown-owner', owner:null, tenant:coordinate.tenantId, release:makeRelease('unknown-owner')},
  ];
  const quote = (value: unknown): string => value == null ? 'NULL' : `'${String(value).replaceAll("'","''")}'`;
  let entities = rows;
  const query = async (statement: string, parameters: readonly unknown[]) => {
    const payloads=entities.map(row=>`(${quote(row.id)},'compiled_entity_runtime',${quote(row.tenant)}::uuid,jsonb_build_object('entityCode',${quote(row.owner)}::text),${quote(JSON.stringify({release:{...row.release,artifacts:[{...release.artifacts[0],artifactKey:'country/core',entityCode:'country'}]}}))}::jsonb)`).join(',');
    const sql=statement.replace(/runtime_meta\.release_activation_head/g,'fixture_head').replace(/runtime_meta\.applied_release_payload/g,'fixture_payload').replace(/runtime_meta\.applied_release/g,'fixture_applied').replace(/\$(\d+)/g,(_,n)=>quote(parameters[Number(n)-1]));
    const input=`BEGIN READ ONLY; WITH fixture_payload(applied_release_id,artifact_kind,tenant_id,coordinates,payload_json) AS (VALUES ${payloads}), fixture_head AS (SELECT applied_release_id FROM fixture_payload), fixture_applied AS (SELECT applied_release_id id,'active' status,now() activated_at FROM fixture_payload) SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) FROM (${sql}) r; COMMIT;`;
    const output=execFileSync('docker',['exec','-i','athyper-dev-db-1','psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','athyper_neon'],{input,encoding:'utf8'});
    return {rows:JSON.parse(output.trim()),command:'SELECT',rowCount:1};
  };
  const database = new Kysely<Record<string, never>>({dialect:new PostgresDialect({pool:{end:async()=>{},connect:async()=>({query:query as unknown as PostgresPoolClient['query'],release:()=>{}})}})});
  const source=createRuntimeMetaCompiledEntityReleaseSource({databases:{neon:database}});
  const request={...coordinate,entityCode:'country'};
  try {
    expect((await source.findAdmittedRelease(request))?.releaseId).toBe('global-owner');
    entities=[...rows,{id:'tenant-owner',owner:'country',tenant:coordinate.tenantId,release:makeRelease('tenant-owner')}];
    expect((await source.findAdmittedRelease(request))?.releaseId).toBe('tenant-owner');
    expect((await source.findAdmittedRelease({...request,tenantId:'44444444-4444-4444-8444-444444444444'}))?.releaseId).toBe('global-owner');
    expect((await source.findAdmittedRelease({...request,releaseId:'global-owner',releaseHash:hash}))?.releaseId).toBe('global-owner');
    expect(await source.findAdmittedRelease({...request,releaseId:'missing'})).toBeNull();
    entities=[rows[1]!];
    expect((await source.findAdmittedRelease(request))?.releaseId).toBe('tenant-reference');
  } finally { await database.destroy(); }
});
