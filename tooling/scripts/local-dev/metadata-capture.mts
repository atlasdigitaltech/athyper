import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, lstatSync } from "node:fs";
import { resolve, join, relative, isAbsolute } from "node:path";
import { compileGraph } from "../../../server/packages/planes/studio/meta-entity-authoring/src/deterministic.js";
import { graphDependencies } from "../../../server/packages/planes/studio/meta-entity-authoring/src/graph-dependencies.js";
import { collectMetadataSet, metadataKey } from "./metadata-set.mjs";
import { verifyNativeMetadataGraphs } from "./metadata-graphs.mts";

type Reference = {
  kind: string;
  key: string;
  plane?: string;
  revision?: number;
};
const uuid = (v: string) => {
  if (!/^[a-f0-9]{8}-[a-f0-9-]{27}$/i.test(v))
    throw Error("Tenant UUID required");
  return v;
};
const literal = (v: string) => "'" + v.replaceAll("'", "''") + "'";
const planes = new Set(["studio", "neon", "mesh"]);
const hash = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
const runtimeReference = { kind: "runtime", key: "platform-host" };

/** Only read-only SQL against recognized local database containers. No IAM
 * credentials, grant evidence, sessions or approvals are exported. */
export function localMetadataQuery(
  container: string,
  plane: string,
  query: string,
): any[] {
  if (
    !/^athyper-(?:dev|qa(?:-candidate-\d{13})?|bp-[a-z0-9-]+)-db(?:-1)?$/.test(
      container,
    ) ||
    !planes.has(plane)
  )
    throw Error("Recognized local metadata database required");
  const endpoint = JSON.parse(
    execFileSync(
      "docker",
      ["context", "inspect", "--format", "{{json .Endpoints.docker.Host}}"],
      { encoding: "utf8" },
    ),
  );
  if (
    !String(endpoint).startsWith("unix://") ||
    (process.env.DOCKER_HOST && !process.env.DOCKER_HOST.startsWith("unix://"))
  )
    throw Error("Local Docker daemon required");
  const sql = `BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY; SET LOCAL statement_timeout='5000ms'; SELECT COALESCE(jsonb_agg(record),'[]'::jsonb) FROM (${query}) record; COMMIT;`;
  try {
    return JSON.parse(
      execFileSync(
        "docker",
        [
          "exec",
          container,
          "psql",
          "-U",
          "postgres",
          "-d",
          `athyper_${plane}`,
          "-XqAt",
          "-v",
          "ON_ERROR_STOP=1",
          "-c",
          sql,
        ],
        {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
          maxBuffer: 32 * 1024 * 1024,
        },
      ).trim(),
    );
  } catch {
    throw Error(`Metadata source read failed: ${container}/${plane}`);
  }
}
export function runtimeSourceFiles(checkout: string) {
  const names = execFileSync(
    "git",
    [
      "-C",
      checkout,
      "ls-files",
      "-z",
      "--cached",
      "--others",
      "--exclude-standard",
    ],
    { encoding: "utf8" },
  ).split("\0");
  return [...new Set(names)]
    .filter((path) =>
      /^(server\/|packages\/contracts\/|deploy\/docker|tooling\/tsconfig|tsconfig|pnpm-lock\.yaml$|pnpm-workspace\.yaml$|package\.json$)/.test(
        path,
      ),
    )
    .sort()
    .flatMap((path) => {
      try {
        const stat = lstatSync(join(checkout, path));
        if (!stat.isFile())
          throw Error(`Runtime source must be a regular file: ${path}`);
        return [{ path, sha256: hash(readFileSync(join(checkout, path))) }];
      } catch (error: any) {
        if (error.code === "ENOENT") return [];
        throw error;
      }
    });
}
export function verifyRuntimeSources(document: any, checkout: string) {
  for (const item of document.items.filter(
    (item: any) => item.reference.kind === "runtime",
  )) {
    if (
      item.payload?.schema !== "athyper.runtime-source-dependency/1" ||
      !Array.isArray(item.payload.files) ||
      !item.payload.files.length
    )
      throw Error("Runtime source capture required");
    const seen = new Set<string>();
    for (const file of item.payload.files) {
      const path = resolve(checkout, file.path),
        rel = relative(checkout, path);
      if (
        isAbsolute(file.path) ||
        rel === ".." ||
        rel.startsWith("../") ||
        seen.has(file.path) ||
        !lstatSync(path).isFile() ||
        hash(readFileSync(path)) !== file.sha256
      )
        throw Error(`Runtime dependency source mismatch: ${file.path}`);
      seen.add(file.path);
    }
    const current = runtimeSourceFiles(checkout);
    if (JSON.stringify(current) !== JSON.stringify(item.payload.files))
      throw Error(
        "Runtime dependency file inventory changed; recapture metadata",
      );
  }
}
export async function captureMetadata(options: {
  tenantId: string;
  source: string;
  supplements?: string[];
  checkout: string;
  roots: Reference[];
  query?: typeof localMetadataQuery;
}) {
  const tenant = uuid(options.tenantId),
    query = options.query ?? localMetadataQuery,
    sources = [options.source, ...(options.supplements ?? [])];
  const provenance: any[] = [];
  const nativeSources = new Map<string, any>();
  const choose = (plane: string, sql: string) => {
    for (const source of sources) {
      const rows = query(source, plane, sql);
      if (rows.length) {
        if (rows.length !== 1) throw Error("Ambiguous native source");
        return { source, row: rows[0] };
      }
    }
    return undefined;
  };
  const entitySource = (key: string, plane: string) => {
    const ref = metadataKey({ kind: "entity", key, plane });
    if (nativeSources.has(ref)) return nativeSources.get(ref);
    const found = choose(
      "studio",
      `SELECT e.id entity_id,e.entity_code,e.entity_class,e.ownership_model,m.code module_code,r.id release_id,r.release_no,r.change_set_id,r.contract_hash,s.contract_json graph,a.compiled_json runtime_registration,(SELECT art.content_hash FROM publication.artifact art WHERE art.publication_release_id=r.id AND art.plane_code=${literal(plane)} AND art.status='signed' LIMIT 1) source_artifact_hash
      FROM metadata.entity_release r JOIN metadata.entity e ON e.id=r.entity_id AND e.tenant_id=r.tenant_id
      JOIN control.module m ON m.id=e.module_id JOIN metadata.entity_change_set cs ON cs.id=r.change_set_id AND cs.tenant_id=r.tenant_id
      JOIN snapshot.entity_contract_revision s ON s.id=r.revision_id AND s.tenant_id=r.tenant_id
      JOIN snapshot.entity_release_artifact a ON a.source_release_id=r.id AND a.tenant_id=r.tenant_id AND a.plane_key=${literal(plane)}
      WHERE r.tenant_id=${literal(tenant)}::uuid AND e.entity_code=${literal(key)} AND cs.status='published'
        AND cs.approved_by IS NOT NULL AND cs.approved_by<>cs.created_by AND cs.approved_by IS DISTINCT FROM cs.submitted_by
        AND r.contract_signature IS NOT NULL
      ORDER BY r.release_no DESC LIMIT 1`,
    );
    if (found) nativeSources.set(ref, found);
    return found;
  };
  // Preload root identities so graph relations retain canonical coordinates.
  for (const root of options.roots)
    if (root.kind === "entity") entitySource(root.key, root.plane!);
  const result = await collectMetadataSet({
    tenantId: tenant,
    roots: options.roots,
    resolve: async (reference: Reference) => {
      let payload: any,
        requires: Reference[] = [],
        sourceTenant: string | null = tenant,
        source = options.source;
      if (reference.kind === "entity") {
        const found = entitySource(reference.key, reference.plane!);
        if (!found) return undefined;
        source = found.source;
        const row = found.row;
        const compiled = compileGraph(row.graph);
        const sourceHashMatches = compiled.contractHash === row.contract_hash;
        // Capture current authoring bytes for fresh QA review. Historical ledger
        // hashes remain provenance; they cannot certify the newly compiled graph.
        payload = {
          sourceContractHash: row.contract_hash,
          sourceHashMatches,
          requiresFreshNativeReview: true,
          sourceEntityId: row.entity_id,
          sourceArtifactHash: row.source_artifact_hash,
          sourceReleaseId: row.release_id,
          sourceReleaseNo: Number(row.release_no),
          sourceChangeSetId: row.change_set_id,
          registration: {
            schemaVersion: 1,
            moduleCode: row.module_code,
            entityClass: row.entity_class,
            ownershipModel: row.ownership_model,
          },
          graph: row.graph,
          compiled,
          runtimeRegistration: row.runtime_registration,
        };
        requires = [
          ...graphDependencies(row.graph),
          ...["author", "validate", "test", "submit", "review", "publish"].map(
            (action) => ({
              kind: "permission",
              key: `metadata.entity.${action}`,
              plane: "studio",
            }),
          ),
        ] as Reference[];
        for (const dependency of requires)
          if (dependency.kind === "entity") {
            const identity = choose(
              "studio",
              `SELECT entity_code FROM metadata.entity WHERE id=${literal(uuid(dependency.key))}::uuid AND (tenant_id=${literal(tenant)}::uuid OR tenant_id IS NULL)`,
            );
            if (!identity)
              throw Error(`Related entity source missing: ${dependency.key}`);
            dependency.key = identity.row.entity_code;
            dependency.plane = reference.plane;
          }
        const runtime = row.runtime_registration;
        if (runtime?.storage)
          requires.push({
            kind: "storage",
            key: `${runtime.storage.schema}.${runtime.storage.object}`,
            plane: reference.plane,
          });
        for (const related of runtime?.recordPresentation?.related ?? [])
          if (typeof related.source === "string")
            requires.push({
              kind: "provider",
              key: related.source,
              plane: reference.plane,
            });
      } else if (reference.kind === "definition") {
        const found = choose(
          "studio",
          `SELECT bundle_json payload FROM snapshot.business_partner_definition_revision WHERE tenant_id=${literal(tenant)}::uuid AND bundle_code=${literal(reference.key)} AND ${literal(reference.plane!)}=ANY(target_planes) ORDER BY created_at DESC LIMIT 1`,
        );
        if (!found) return undefined;
        source = found.source;
        payload = found.row.payload;
        requires = [
          runtimeReference,
          ...["read", "author", "publish"].map((action) => ({
            kind: "permission",
            key: `studio.business_partner_definition.${action}`,
            plane: "studio",
          })),
        ];
      } else if (reference.kind === "case_contract") {
        if (
          reference.key !== "master.business_partner" ||
          reference.plane !== "neon"
        )
          throw Error("Native case contract capture adapter unavailable");
        const found = choose(
          "studio",
          `SELECT s.entity_id,s.publication_key,s.contract_json FROM snapshot.business_partner_case_contract_revision s JOIN publication.business_partner_case_contract_release_link l ON l.revision_id=s.id AND l.tenant_id=s.tenant_id JOIN publication.release r ON r.id=l.publication_release_id WHERE s.tenant_id=${literal(tenant)}::uuid AND r.status IN ('approved','published') ORDER BY r.release_no DESC LIMIT 1`,
        );
        if (!found) return undefined;
        source = found.source;
        payload = {
          entityId: found.row.entity_id,
          publicationKey: found.row.publication_key,
          contract: found.row.contract_json,
        };
        requires = [runtimeReference];
      } else if (reference.kind === "permission") {
        const found = choose(
          reference.plane!,
          `SELECT p.id,p.canonical_code,p.permission_kind,p.risk_tier,p.requires_mfa,p.requires_sod,p.is_shareable,p.is_delegable,p.is_overridable,p.metadata,m.code module_code,COALESCE((SELECT jsonb_agg(jsonb_build_object('scope_kind',s.scope_kind,'propagation_mode',s.propagation_mode) ORDER BY s.scope_kind,s.propagation_mode) FROM authz.permission_scope_kind s WHERE s.permission_id=p.id AND s.status='active'),'[]'::jsonb) scope_bindings,COALESCE((SELECT jsonb_agg(s.scope_kind::text ORDER BY s.scope_kind::text) FROM authz.permission_scope_kind s WHERE s.permission_id=p.id AND s.status='active'),'[]'::jsonb) scope_kinds FROM authz.permission p JOIN control.module m ON m.id=p.module_id WHERE p.status='published' AND p.canonical_code=${literal(reference.key)}`,
        );
        if (!found) return undefined;
        payload = found.row;
        source = found.source;
        sourceTenant = null;
      } else if (reference.kind === "storage") {
        const [schema, table, ...rest] = reference.key.split(".");
        if (
          rest.length ||
          ![schema, table].every((value) =>
            /^[a-z][a-z0-9_]*$/.test(value ?? ""),
          )
        )
          throw Error("Invalid storage coordinate");
        for (const container of sources) {
          const columns = query(
            container,
            reference.plane!,
            `SELECT column_name,data_type,udt_name,is_nullable,column_default FROM information_schema.columns WHERE table_schema=${literal(schema!)} AND table_name=${literal(table!)} ORDER BY ordinal_position`,
          );
          if (columns.length) {
            source = container;
            payload = { schema, table, columns };
            break;
          }
        }
        if (!payload) return undefined;
        sourceTenant = null;
      } else if (reference.kind === "policy") {
        const found = choose(
          "studio",
          `SELECT to_jsonb(p)-'created_by'-'updated_by'-'created_at'-'updated_at' definition,COALESCE((SELECT jsonb_agg(to_jsonb(r)-'created_by'-'updated_by'-'created_at'-'updated_at' ORDER BY r.id) FROM control.policy_rule r WHERE r.policy_definition_id=p.id),'[]'::jsonb) rules FROM control.policy_definition p WHERE p.id=${literal(uuid(reference.key))}::uuid AND (p.tenant_id=${literal(tenant)}::uuid OR p.tenant_id IS NULL) AND p.is_active=true`,
        );
        if (!found) return undefined;
        source = found.source;
        payload = found.row;
        sourceTenant = payload.definition.tenant_id;
        requires = [runtimeReference];
      } else if (reference.kind === "numbering") {
        const found = choose(
          "studio",
          `SELECT to_jsonb(p)-'created_by'-'updated_by'-'activated_by'-'created_at'-'updated_at'-'activated_at' payload FROM control.numbering_policy p WHERE p.policy_code=${literal(reference.key)} AND p.policy_revision=${Number(reference.revision)} AND (p.tenant_id=${literal(tenant)}::uuid OR p.tenant_id IS NULL) AND p.status='active' ORDER BY (p.tenant_id IS NOT NULL) DESC LIMIT 1`,
        );
        if (!found) return undefined;
        source = found.source;
        payload = found.row.payload;
        sourceTenant = payload.tenant_id;
        requires = [runtimeReference];
      } else if (reference.kind === "runtime") {
        payload = {
          schema: "athyper.runtime-source-dependency/1",
          files: runtimeSourceFiles(options.checkout),
        };
        sourceTenant = null;
        source = "candidate-source";
      } else if (
        ["handler", "resolver", "preflight", "capability", "provider"].includes(
          reference.kind,
        )
      ) {
        payload = {
          schema: "athyper.runtime-registry-reference/1",
          ...reference,
        };
        requires = [runtimeReference];
        sourceTenant = null;
        source = "candidate-source";
      } else
        throw Error(
          `Native source capture adapter unavailable: ${reference.kind}:${reference.key}`,
        );
      provenance.push({ reference, source });
      return {
        reference,
        tenantId: sourceTenant,
        payload,
        requires: [
          ...new Map(requires.map((ref) => [metadataKey(ref), ref])).values(),
        ],
      };
    },
  });
  verifyNativeMetadataGraphs(result);
  return { metadata: result, provenance };
}
export async function captureMetadataFile(
  options: Parameters<typeof captureMetadata>[0],
  output: string,
) {
  const captured = await captureMetadata(options);
  writeFileSync(output, JSON.stringify(captured.metadata, null, 2) + "\n", {
    flag: "wx",
    mode: 0o600,
  });
  writeFileSync(
    output + ".provenance.json",
    JSON.stringify(
      {
        schema: "athyper.metadata-capture-provenance/1",
        capturedAt: new Date().toISOString(),
        sources: captured.provenance,
        releaseQualified: false,
      },
      null,
      2,
    ) + "\n",
    { flag: "wx", mode: 0o600 },
  );
  return {
    output,
    nodes: captured.metadata.items.length,
    sourceCaptureComplete: true,
    releaseQualified: false,
  };
}
