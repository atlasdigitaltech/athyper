import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** Read-only inventory; neither a publication approval nor an activation receipt. */
export function captureDevPublicationBaseline(releaseId) {
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
      releaseId,
    )
  )
    throw Error("RELEASE_ID_REQUIRED");
  const container = "athyper-dev-db-1";
  const state = JSON.parse(
    execFileSync("docker", ["inspect", container], { encoding: "utf8" }),
  )[0];
  if (
    !state.State.Running ||
    state.Config.Labels["com.docker.compose.project"] !== "athyper-dev"
  )
    throw Error("DEV_DATABASE_REQUIRED");
  const query = (plane, statement) => {
    if (!["studio", "neon", "mesh"].includes(plane))
      throw Error("PLANE_INVALID");
    const text = execFileSync(
      "docker",
      [
        "exec",
        "-i",
        container,
        "sh",
        "-c",
        `exec psql -X -qAt -U "$POSTGRES_USER" -d athyper_${plane} -v ON_ERROR_STOP=1`,
      ],
      {
        input: `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; ${statement} ROLLBACK;`,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    return JSON.parse(text.trim());
  };
  const source = query(
    "studio",
    `SELECT json_build_object(
    'entityId',er.entity_id,'entityCode',e.entity_code,'sourceTenantId',er.tenant_id,
    'authoring',json_build_object('releaseId',er.id,'releaseNo',er.release_no,'releaseHash',er.release_hash,'contractHash',er.contract_hash,'changeSetId',er.change_set_id,'revisionId',er.revision_id,'signingKeyId',er.signing_key_id),
    'snapshot',json_build_object('revisionId',s.id,'contractHash',s.contract_hash,'revisionHash',s.revision_hash,'validationStatus',s.validation_status),
    'publication',json_build_object('releaseId',p.id,'releaseNo',p.release_no,'releaseKey',p.release_key,'releaseHash',p.release_hash,'manifestHash',p.manifest_hash,'status',p.status),
    'actors',json_build_object('maker',cs.created_by,'submitter',cs.submitted_by,'approver',cs.approved_by,'publisher',er.published_by),
    'targetPlanes',er.target_planes)
    FROM publication.release p JOIN publication.entity_release_link l ON l.publication_release_id=p.id
    JOIN metadata.entity_release er ON er.id=l.entity_release_id JOIN metadata.entity e ON e.id=er.entity_id
    JOIN metadata.entity_change_set cs ON cs.id=er.change_set_id JOIN snapshot.entity_contract_revision s ON s.id=er.revision_id
    WHERE p.id='${releaseId}'::uuid;`,
  );
  const key = source.publication.releaseKey.replaceAll("'", "''");
  const targets = source.targetPlanes.map((plane) => ({
    plane,
    observedEnvironment: "local",
    observedInstance: "dev",
    ...query(
      plane,
      `SELECT json_build_object('head',to_jsonb(h),'applied',json_build_object('id',a.id,'sourceReleaseId',a.source_release_id,'sourceReleaseNo',a.source_release_no,'status',a.status,'artifactHash',a.artifact_hash),
      'publishedOperationBindings',(SELECT count(*) FROM authz.entity_operation_binding b WHERE b.applied_release_id=a.id AND b.status='published'))
      FROM runtime_meta.release_activation_head h JOIN runtime_meta.applied_release a ON a.id=h.applied_release_id WHERE h.publication_key='${key}';`,
    ),
  }));
  const files = [
    existsSync(
      "server/apps/platform-host/src/development/publication-workload.ts",
    )
      ? "server/apps/platform-host/src/development/publication-workload.ts"
      : "server/apps/platform-host/src/composition/shared/publication/workload.ts",
    "server/apps/platform-host/src/composition/shared/publication/policy-enrollment.ts",
    "server/packages/planes/studio/meta-entity-authoring/src/publication/publication-workflow.ts",
    "server/packages/planes/studio/meta-entity-authoring/src/kysely-authoring-repository.ts",
    "server/db/ddl/planes/studio/publication/15_system_entity_commands.sql",
    "server/db/ddl/common/runtime_meta/07_functions.sql",
  ];
  return {
    schema: "athyper.dev-publication-successor-baseline/1",
    capturedAt: new Date().toISOString(),
    readOnly: true,
    source,
    targets,
    workingFiles: files.map((path) => ({
      path,
      sha256: createHash("sha256").update(readFileSync(path)).digest("hex"),
    })),
    limitation:
      "Sequential per-database snapshots, not a distributed atomic snapshot or approval. Recheck pins under locks before publication/activation.",
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const args = process.argv.slice(2);
  if (args.length !== 1 || !args[0].startsWith("--release="))
    throw Error("Use --release=<publication-release-uuid>");
  console.log(
    JSON.stringify(captureDevPublicationBaseline(args[0].slice(10)), null, 2),
  );
}
