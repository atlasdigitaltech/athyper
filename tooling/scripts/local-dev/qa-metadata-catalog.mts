import { execFileSync } from "node:child_process";
import { verifyMetadataSet, metadataHash } from "./metadata-set.mjs";
import { qaProject } from "./qa-runtime.mjs";
/** First-load catalog definitions follow the repository's seed conventions.
 * No grant, principal, assignment, MFA policy or existing catalog row is changed. */
export function qaCatalogSql(metadata: any, plane: string, apply = false) {
  verifyMetadataSet(metadata);
  if (!["studio", "neon", "mesh"].includes(plane))
    throw Error("Invalid catalog plane");
  const items = metadata.items
    .filter(
      (item: any) =>
        item.reference.kind === "permission" && item.reference.plane === plane,
    )
    .map((item: any) => item.payload);
  for (const p of items)
    if (
      !Array.isArray(p.scope_bindings) ||
      !p.scope_bindings.length ||
      p.canonical_code === undefined
    )
      throw Error("Complete permission scope catalog required");
  const literal = JSON.stringify(items).replaceAll("'", "''");
  return `BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s';
SELECT pg_advisory_xact_lock(hashtextextended('athyper.qa.candidate.catalog',0));
CREATE TEMP TABLE candidate_permissions ON COMMIT DROP AS SELECT value p FROM jsonb_array_elements('${literal}'::jsonb);
DO $catalog$ BEGIN
 IF EXISTS(SELECT 1 FROM candidate_permissions e LEFT JOIN control.module m ON m.code=e.p->>'module_code' AND m.status='active' WHERE m.id IS NULL) THEN RAISE EXCEPTION 'CANDIDATE_MODULE_MISSING'; END IF;
 IF EXISTS(SELECT 1 FROM candidate_permissions e JOIN authz.permission p ON p.id=(e.p->>'id')::uuid WHERE p.canonical_code<>e.p->>'canonical_code') THEN RAISE EXCEPTION 'CANDIDATE_PERMISSION_ID_CONFLICT'; END IF;
 IF EXISTS(SELECT 1 FROM candidate_permissions e JOIN authz.permission p ON p.canonical_code=e.p->>'canonical_code' WHERE p.status<>'published' OR p.id<>(e.p->>'id')::uuid OR p.permission_kind<>e.p->>'permission_kind' OR p.risk_tier<>e.p->>'risk_tier' OR p.requires_mfa<>(e.p->>'requires_mfa')::boolean OR p.requires_sod<>(e.p->>'requires_sod')::boolean OR p.is_shareable<>(e.p->>'is_shareable')::boolean OR p.is_delegable<>(e.p->>'is_delegable')::boolean OR p.is_overridable<>(e.p->>'is_overridable')::boolean) THEN RAISE EXCEPTION 'CANDIDATE_EXISTING_CATALOG_DIFFERS'; END IF;
END $catalog$;
CREATE TEMP TABLE candidate_new_permissions ON COMMIT DROP AS SELECT e.p FROM candidate_permissions e WHERE NOT EXISTS(SELECT 1 FROM authz.permission p WHERE p.canonical_code=e.p->>'canonical_code');
INSERT INTO authz.permission(id,canonical_code,permission_kind,module_id,risk_tier,requires_mfa,requires_sod,is_shareable,is_delegable,is_overridable,metadata,status,created_by)
 SELECT (e.p->>'id')::uuid,e.p->>'canonical_code',e.p->>'permission_kind',m.id,e.p->>'risk_tier',(e.p->>'requires_mfa')::boolean,(e.p->>'requires_sod')::boolean,(e.p->>'is_shareable')::boolean,(e.p->>'is_delegable')::boolean,(e.p->>'is_overridable')::boolean,e.p->'metadata','published','00000000-0000-0000-0000-000000000000'::uuid FROM candidate_new_permissions e JOIN control.module m ON m.code=e.p->>'module_code' AND m.status='active';
INSERT INTO authz.permission_scope_kind(permission_id,scope_kind,propagation_mode,status,created_by)
 SELECT (e.p->>'id')::uuid,s->>'scope_kind',s->>'propagation_mode','active','00000000-0000-0000-0000-000000000000'::uuid FROM candidate_new_permissions e CROSS JOIN LATERAL jsonb_array_elements(e.p->'scope_bindings') s;
DO $catalog$ BEGIN
 IF EXISTS(SELECT 1 FROM candidate_permissions e JOIN authz.permission p ON p.canonical_code=e.p->>'canonical_code' JOIN control.module m ON m.id=p.module_id WHERE m.code<>e.p->>'module_code' OR p.metadata IS DISTINCT FROM e.p->'metadata' OR COALESCE((SELECT jsonb_agg(jsonb_build_object('scope_kind',s.scope_kind,'propagation_mode',s.propagation_mode) ORDER BY s.scope_kind,s.propagation_mode) FROM authz.permission_scope_kind s WHERE s.permission_id=p.id AND s.status='active'),'[]'::jsonb) IS DISTINCT FROM e.p->'scope_bindings') THEN RAISE EXCEPTION 'CANDIDATE_CATALOG_SEMANTICS_DIFFER'; END IF;
END $catalog$;
SELECT jsonb_build_object('candidateMetadataHash','${metadataHash(metadata)}','plane','${plane}','newCatalogEntries',(SELECT count(*) FROM candidate_new_permissions),'applied',${apply},'grantsChanged',false);
${apply ? "COMMIT" : "ROLLBACK"};
`;
}
export function installQaMetadataCatalog(metadata: any, apply = false) {
  const project = qaProject();
  if (!/^athyper-qa-candidate-\d{13}$/.test(project))
    throw Error("Fresh isolated QA required");
  const result = [];
  for (const plane of [
    ...new Set<string>(
      metadata.items
        .filter((item: any) => item.reference.kind === "permission")
        .map((item: any) => item.reference.plane),
    ),
  ]) {
    try {
      const output = execFileSync(
        "docker",
        [
          "exec",
          "-i",
          `${project}-db-1`,
          "psql",
          "-U",
          "postgres",
          "-d",
          `athyper_${plane}`,
          "-XqAt",
          "-v",
          "ON_ERROR_STOP=1",
        ],
        {
          input: qaCatalogSql(metadata, plane, apply),
          encoding: "utf8",
          stdio: ["pipe", "pipe", "pipe"],
        },
      );
      result.push(
        JSON.parse(
          output
            .trim()
            .split("\n")
            .find((line) => line.startsWith("{"))!,
        ),
      );
    } catch (error: any) {
      const code = String(error.stderr ?? "").match(/CANDIDATE_[A-Z_]+/)?.[0];
      throw Error(
        `QA catalog ${plane} transaction failed${code ? ": " + code : ""}`,
      );
    }
  }
  return result;
}
