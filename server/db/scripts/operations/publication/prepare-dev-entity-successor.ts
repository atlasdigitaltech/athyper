import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import { prepareEntitySuccessorDraft } from "../../../../packages/planes/studio/meta-entity-authoring/src/publication/prepare-successor.js";
import { loadReferenceProduct } from "../../provisioning/prepare-reference-runtime.js";
import { KyselyMetaEntityAuthoringRepository } from "../../../../packages/planes/studio/meta-entity-authoring/src/kysely-authoring-repository.js";
import { compileGraph, validateGraph, runContractTests, sha256 } from "../../../../packages/planes/studio/meta-entity-authoring/src/deterministic.js";
import { compileSystemReferenceTarget } from "../../../../packages/planes/studio/meta-entity-authoring/src/compilation/target-compiler.js";
import { amendSuccessorCapabilities } from "../../../../packages/planes/studio/meta-entity-authoring/src/publication/amend-successor-capabilities.js";
import { amendSuccessorCollaboration } from "../../../../packages/planes/studio/meta-entity-authoring/src/publication/amend-successor-collaboration.js";
import { amendSuccessorLocalization } from "../../../../packages/planes/studio/meta-entity-authoring/src/publication/amend-successor-localization.js";
import { adoptCapabilityProfiles } from "../../../../packages/planes/studio/meta-entity-authoring/src/authoring/adopt-capability-profiles.js";
import { createCapabilityProfileFileResolver } from "../../../../packages/planes/studio/meta-entity-authoring/src/authoring/capability-profile-files.js";

async function main() {
  const args = process.argv.slice(2);
  const baselinePath = args.find(a => a.startsWith("--baseline="))?.slice(11);
  const requestId = args.find(a => a.startsWith("--request="))?.slice(10);
  const navigationProductPath = args.find(a => a.startsWith("--navigation-product="))?.slice(21);
  const collaborationProductPath = args.find(a => a.startsWith("--collaboration-product="))?.slice(24);
  const capabilityProductPath = args.find(a => a.startsWith("--capability-product="))?.slice(21);
  const profileDirectory = args.find(a => a.startsWith("--capability-profiles="))?.slice(22);
  const localizationProductPath = args.find(a => a.startsWith("--localization-product="))?.slice(23);
  if (!baselinePath || !requestId || args.some(a => !a.startsWith("--baseline=") && !a.startsWith("--request=") && !a.startsWith("--navigation-product=") && !a.startsWith("--collaboration-product=") && !a.startsWith("--capability-product=") && !a.startsWith("--capability-profiles=") && !a.startsWith("--localization-product=") && !["--check", "--confirm=DEV-PREPARE-ENTITY-SUCCESSOR"].includes(a)))
    throw Error("Use --baseline=<captured JSON> --request=<UUID> [--navigation-product=<directory>] [--collaboration-product=<directory>] [--capability-product=<directory>] [--localization-product=<directory>] [--capability-profiles=<directory>] [--check|--confirm=DEV-PREPARE-ENTITY-SUCCESSOR]");
  const navigationProduct = navigationProductPath ? loadReferenceProduct(navigationProductPath) : undefined;
  if (collaborationProductPath && capabilityProductPath) throw Error("Specify only one capability product amendment");
  const capabilityProduct = capabilityProductPath ? loadReferenceProduct(capabilityProductPath) : undefined;
  const collaborationProduct = collaborationProductPath ? loadReferenceProduct(collaborationProductPath) : undefined;
  const localizationProduct = localizationProductPath ? loadReferenceProduct(localizationProductPath) : undefined;
  const profileResolver = profileDirectory ? createCapabilityProfileFileResolver(profileDirectory) : undefined;
  const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
  if (baseline.schema !== "athyper.dev-publication-successor-baseline/1" || baseline.source.sourceTenantId !== null || !Array.isArray(baseline.targets)) throw Error("BASELINE_INVALID");
  const container = JSON.parse(execFileSync("docker", ["inspect", "athyper-dev-db-1"], { encoding: "utf8" }))[0];
  if (container.Config.Labels["com.docker.compose.project"] !== "athyper-dev" || !container.State.Running) throw Error("DEV_DATABASE_REQUIRED");
  const env = Object.fromEntries(container.Config.Env.map((e: string) => { const i = e.indexOf("="); return [e.slice(0, i), e.slice(i + 1)]; }));
  const secret = container.Mounts.find((m: { Destination: string }) => m.Destination === env.POSTGRES_PASSWORD_FILE)?.Source;
  if (typeof secret !== "string" || !secret.includes("/.athyper/instances/dev/secrets/")) throw Error("DEV_CREDENTIAL_MOUNT_REQUIRED");
  const host = (Object.values(container.NetworkSettings.Networks)[0] as { IPAddress: string }).IPAddress;
  const connection = (plane: string) => {
    if (!["studio", "neon", "mesh"].includes(plane)) throw Error("PLANE_INVALID");
    return new Kysely<Record<string, never>>({ dialect: new PostgresDialect({ pool: new Pool({ host, user: env.POSTGRES_USER,
      password: readFileSync(secret, "utf8").trim(), database: `athyper_${plane}`, max: 1 }) }) });
  };
  for (const target of baseline.targets) {
    const db = connection(target.plane);
    try {
      const head = (await sql<{ applied_release_id: string; artifact_hash: string; row_version: number }>`SELECT applied_release_id,artifact_hash,row_version
        FROM runtime_meta.release_activation_head WHERE publication_key=${baseline.source.publication.releaseKey}`.execute(db)).rows;
      if (head.length !== 1 || head[0]!.applied_release_id !== target.head.applied_release_id || head[0]!.artifact_hash !== target.head.artifact_hash || Number(head[0]!.row_version) !== Number(target.head.row_version)) throw Error(`TARGET_HEAD_CHANGED:${target.plane}`);
    } finally { await db.destroy(); }
  }
  const db = connection("studio"), rollback = new Error("CHECK_ROLLBACK");
  const dryRun = !args.includes("--confirm=DEV-PREPARE-ENTITY-SUCCESSOR");
  let receipt;
  try {
    await db.transaction().execute(async tx => {
      const actors = (await sql<{ id: string; tenant_id: string }>`SELECT p.id,p.tenant_id FROM master.principal p
        JOIN publication.release r ON r.tenant_id=p.tenant_id WHERE r.id=${baseline.source.publication.releaseId}::uuid
          AND p.code='seed.three-plane-provisioner' AND p.status='active'`.execute(tx)).rows;
      if (actors.length !== 1) throw Error("DEV_MAINTENANCE_PRINCIPAL_REQUIRED");
      const actor = actors[0]!;
      await sql`SELECT set_config('app.database_plane','studio',true),set_config('app.current_plane_key','studio',true),
        set_config('app.current_tenant_id',${actor.tenant_id},true),set_config('app.current_principal_id',${actor.id},true)`.execute(tx);
      const authority = { async assertAuthorized(input: { actorId: string; authorityTenantId: string }) {
        const rows = (await sql<{ allowed: boolean }>`SELECT rolsuper OR pg_has_role(current_user,'athyperadmin','MEMBER') allowed
          FROM pg_roles WHERE rolname=current_user`.execute(tx)).rows;
        if (!rows[0]?.allowed || input.actorId !== actor.id || input.authorityTenantId !== actor.tenant_id) throw Error("MAINTENANCE_AUTHORITY_REQUIRED");
      } };
      const a = baseline.source.authoring, p = baseline.source.publication;
      const request = { requestId, authorityTenantId: actor.tenant_id, entityId: baseline.source.entityId, actorId: actor.id, publicationKey: p.releaseKey,
        predecessor: { authoringReleaseId: a.releaseId, authoringReleaseNo: Number(a.releaseNo), authoringReleaseHash: a.releaseHash,
          publicationReleaseId: p.releaseId, publicationReleaseNo: Number(p.releaseNo), publicationReleaseHash: p.releaseHash, revisionId: a.revisionId, contractHash: a.contractHash } };
      let result = await prepareEntitySuccessorDraft(tx, authority, request);
      if (localizationProduct) {
        const repository = new KyselyMetaEntityAuthoringRepository(tx);
        const graph = await repository.loadGraph(result.changeSet.id);
        const amended = amendSuccessorLocalization(graph, localizationProduct);
        if (sha256(amended) !== sha256(graph)) {
          for (const target of baseline.targets) compileSystemReferenceTarget(amended, target.plane);
          const changeSet = await repository.replaceGraph({ changeSetId: result.changeSet.id,
            expectedRevision: result.changeSet.revision, actorId: actor.id, graph: amended });
          result = { ...result, changeSet, artifact: compileGraph(await repository.loadGraph(changeSet.id)) };
        }
      }
      if (navigationProduct) {
        // Narrow presentation amendment, not a wholesale product reimport. The
        // predecessor's authorization, capabilities, fields and storage survive.
        const repository = new KyselyMetaEntityAuthoringRepository(tx);
        const graph = await repository.loadGraph(result.changeSet.id);
        const navigation = navigationProduct.definition.navigation;
        const details = graph.surfaces?.filter(surface => surface.surfaceKind === "detail") ?? [];
        const presentation = details[0]?.layoutConfig?.recordPresentation as { sections?: unknown; navigation?: unknown } | undefined;
        if (!navigation || navigationProduct.definition.entityCode !== graph.entity.entityCode || details.length !== 1
          || !presentation || sha256(presentation.sections) !== sha256(navigationProduct.definition.sections))
          throw Error("NAVIGATION_PRODUCT_SOURCE_MISMATCH");
        if (sha256(presentation.navigation ?? null) !== sha256(navigation)) {
          const amended = structuredClone(graph);
          const detail = amended.surfaces!.find(surface => surface.id === details[0]!.id)!;
          detail.layoutConfig = { ...detail.layoutConfig, recordPresentation: { ...presentation, navigation } };
          const validation = validateGraph(amended), tests = runContractTests(amended);
          if (validation.issues.length || !tests.passed) throw Error("NAVIGATION_GRAPH_VALIDATION_FAILED");
          for (const target of baseline.targets) compileSystemReferenceTarget(amended, target.plane);
          const changeSet = await repository.replaceGraph({ changeSetId: result.changeSet.id,
            expectedRevision: result.changeSet.revision, actorId: actor.id, graph: amended });
          result = { ...result, changeSet, artifact: compileGraph(await repository.loadGraph(changeSet.id)) };
        }
      }
      if (collaborationProduct || capabilityProduct) {
        const repository = new KyselyMetaEntityAuthoringRepository(tx);
        const graph = await repository.loadGraph(result.changeSet.id);
        const amended = capabilityProduct ? amendSuccessorCapabilities(graph, capabilityProduct) : amendSuccessorCollaboration(graph, collaborationProduct!);
        if (sha256(amended) !== sha256(graph)) {
          for (const target of baseline.targets) compileSystemReferenceTarget(amended, target.plane);
          const changeSet = await repository.replaceGraph({ changeSetId: result.changeSet.id,
            expectedRevision: result.changeSet.revision, actorId: actor.id, graph: amended });
          result = { ...result, changeSet, artifact: compileGraph(await repository.loadGraph(changeSet.id)) };
        }
      }
      if (profileResolver) {
        const repository = new KyselyMetaEntityAuthoringRepository(tx);
        const graph = await repository.loadGraph(result.changeSet.id);
        const amended = adoptCapabilityProfiles(graph, profileResolver);
        if (sha256(amended) !== sha256(graph)) {
          for (const target of baseline.targets) compileSystemReferenceTarget(amended, target.plane);
          const changeSet = await repository.replaceGraph({ changeSetId: result.changeSet.id,
            expectedRevision: result.changeSet.revision, actorId: actor.id, graph: amended });
          result = { ...result, changeSet, artifact: compileGraph(await repository.loadGraph(changeSet.id)) };
        }
      }
      const replay = await prepareEntitySuccessorDraft(tx, authority, request);
      if (!replay.reused || replay.changeSet.id !== result.changeSet.id || replay.artifact.descriptorHash !== result.artifact.descriptorHash) throw Error("DRAFT_REPLAY_CONFLICT");
      let staleDenied = false;
      try { await prepareEntitySuccessorDraft(tx, authority, { ...request, predecessor: { ...request.predecessor, authoringReleaseHash: "0".repeat(64) } }); }
      catch (error) { if (error instanceof Error && error.message === "SUCCESSOR_DRAFT_PREDECESSOR_CHANGED") staleDenied = true; else throw error; }
      if (!staleDenied) throw Error("STALE_PREDECESSOR_ADMITTED");
      receipt = { schema: "athyper.dev-successor-draft-receipt/1", capturedAt: new Date().toISOString(), dryRun,
        requestId, authorityTenantId: actor.tenant_id, actorId: actor.id, entityId: request.entityId,
        predecessor: request.predecessor, changeSet: result.changeSet,
        contractHash: result.artifact.contractHash, descriptorHash: result.artifact.descriptorHash,
        ...(navigationProduct ? { navigationProductHash: sha256(navigationProduct), navigation: navigationProduct.definition.navigation } : {}),
        ...(collaborationProduct ? { collaborationProductHash: sha256(collaborationProduct), amendedCapabilities: collaborationProduct.definition.capabilities?.map(c => c.capabilityKey) } : {}),
        ...(profileResolver ? { capabilityProfilesEnrolled: true, effectiveCapabilityBehaviorPreserved: true } : {}),
        reused: result.reused, idempotencyVerified: true, stalePredecessorDenied: true, approvalCreated: false, releaseCreated: false };
      if (dryRun) throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
  finally { await db.destroy(); }
  console.log(JSON.stringify(receipt, null, 2));
}
main().catch(error => { console.error(error instanceof Error ? error.message : "SUCCESSOR_PREPARATION_FAILED"); process.exitCode = 1; });
