import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { localMetadataQuery } from "./metadata-capture.mts";
import { metadataHash } from "./metadata-set.mjs";
/** Inventory authoring data before deciding whether an experiment may retire.
 * Includes full draft rows privately; never exports IAM or release approvals. */
export function inventoryWorkspaces() {
  const names = execFileSync("docker", ["ps", "-a", "--format", "{{.Names}}"], {
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .filter((name) =>
      /^athyper-(?:dev|qa(?:-candidate-\d{13})?|bp-[a-z0-9-]+)-db(?:-1)?$/.test(
        name,
      ),
    );
  const workspaces: any[] = [];
  for (const name of names) {
    const c = JSON.parse(
      execFileSync("docker", ["inspect", name], { encoding: "utf8" }),
    )[0];
    const base = {
      container: name,
      containerId: c.Id,
      running: c.State.Running,
      volumes: c.Mounts.filter((m: any) => m.Type === "volume").map(
        (m: any) => ({ name: m.Name, destination: m.Destination }),
      ),
      retirementApproved: false,
    };
    if (!c.State.Running) {
      workspaces.push({
        ...base,
        inventoryComplete: false,
        reason: "Database stopped; retained volume not inspected",
      });
      continue;
    }
    try {
      const tables = localMetadataQuery(
        name,
        "studio",
        "SELECT DISTINCT table_name FROM information_schema.columns WHERE table_schema='metadata' AND column_name='change_set_id' AND table_name LIKE 'entity_%' ORDER BY table_name",
      ).map((r) => r.table_name as string);
      if (tables.some((t) => !/^entity_[a-z0-9_]+$/.test(t)))
        throw Error("Unrecognized graph table");
      const branches = tables
        .map(
          (t) =>
            `'${t}',COALESCE((SELECT jsonb_agg(to_jsonb(b) ORDER BY b.id) FROM metadata.${t} b WHERE b.change_set_id=cs.id),'[]'::jsonb)`,
        )
        .join(",");
      const drafts = localMetadataQuery(
        name,
        "studio",
        `SELECT cs.id,cs.tenant_id,cs.entity_id,e.entity_code,cs.status,cs.lock_version revision,jsonb_build_object(${branches}) branches FROM metadata.entity_change_set cs JOIN metadata.entity e ON e.id=cs.entity_id WHERE cs.status<>'published' ORDER BY cs.id`,
      );
      const definitions = localMetadataQuery(
        name,
        "studio",
        "SELECT id,tenant_id,bundle_code,bundle_hash,bundle_json,target_planes FROM snapshot.business_partner_definition_revision ORDER BY id",
      );
      const releases = localMetadataQuery(
        name,
        "studio",
        "SELECT e.entity_code,r.id,r.release_no,r.contract_hash FROM metadata.entity_release r JOIN metadata.entity e ON e.id=r.entity_id ORDER BY e.entity_code,r.release_no",
      );
      workspaces.push({
        ...base,
        inventoryComplete: true,
        drafts: drafts.map((row) => ({
          ...row,
          contentHash: metadataHash(row.branches),
        })),
        definitions,
        releases,
      });
    } catch (error) {
      workspaces.push({
        ...base,
        inventoryComplete: false,
        reason: error instanceof Error ? error.message : "Inventory failed",
      });
    }
  }
  const main = workspaces.find((w) => w.container === "athyper-dev-db-1");
  for (const workspace of workspaces) {
    workspace.uniqueDrafts = (workspace.drafts ?? [])
      .filter(
        (draft: any) =>
          !(main?.drafts ?? []).some(
            (current: any) =>
              current.id === draft.id &&
              current.contentHash === draft.contentHash,
          ),
      )
      .map((draft: any) => ({
        id: draft.id,
        entityCode: draft.entity_code,
        contentHash: draft.contentHash,
      }));
    workspace.uniqueDefinitions = (workspace.definitions ?? [])
      .filter(
        (draft: any) =>
          !(main?.definitions ?? []).some(
            (current: any) =>
              current.bundle_code === draft.bundle_code &&
              current.bundle_hash === draft.bundle_hash,
          ),
      )
      .map((draft: any) => ({
        id: draft.id,
        bundleCode: draft.bundle_code,
        bundleHash: draft.bundle_hash,
      }));
    workspace.reconciliationRequired =
      workspace.container !== "athyper-dev-db-1" &&
      (!workspace.inventoryComplete ||
        workspace.uniqueDrafts.length > 0 ||
        workspace.uniqueDefinitions.length > 0);
  }
  return {
    schema: "athyper.authoring-workspace-inventory/1",
    capturedAt: new Date().toISOString(),
    canonicalWorkspace: "athyper-dev-db-1",
    workspaces,
    containersStopped: false,
    volumesRemoved: false,
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const output = process.argv[2];
  if (!output) throw Error("New private inventory output path required");
  const report = inventoryWorkspaces();
  writeFileSync(output, JSON.stringify(report, null, 2) + "\n", {
    flag: "wx",
    mode: 0o600,
  });
  console.log(
    JSON.stringify({
      output,
      workspaces: report.workspaces.map((w) => ({
        container: w.container,
        inventoryComplete: w.inventoryComplete,
        uniqueDrafts: w.uniqueDrafts.length,
        uniqueDefinitions: w.uniqueDefinitions.length,
        reconciliationRequired: w.reconciliationRequired,
        reason: w.reason,
      })),
      containersStopped: false,
    }),
  );
}
