import { artifactDirectory } from "../artifact-paths.mjs";
const output = artifactDirectory("collection-presentations", "dev");
import {
  mkdirSync,
  writeFileSync,
  chmodSync,
  readFileSync,
  existsSync,
} from "node:fs";
import { request } from "@playwright/test";
import { withBusinessPartnerCollectionPresentations } from "../../../server/db/scripts/provisioning/business-partner-collection-presentations.js";
import { compileEntityIntakeSurfaces } from "../../../packages/contracts/platform/entity-runtime/src/intake-surface-authoring.js";
import {
  sha256,
  validateGraph,
  runContractTests,
} from "../../../server/packages/planes/studio/meta-entity-authoring/src/deterministic.js";
import { normalizeGraphStorageOrder } from "../../../server/packages/planes/studio/meta-entity-authoring/src/graph-storage-order.js";
const origin = "https://studio.dev.athyper.test",
  authPath = "tests/e2e/.auth/dev/studio/catl.admin.json";
const id = "be767e01-f36d-434f-91f3-67bff689a367",
  path = `/api/relay/meta-entity-authoring/change-sets/${id}/graph`;
const output =
  "governance/policy/reports/collection-presentations-activation.dev.json";
const c = await request.newContext({
  baseURL: origin,
  ignoreHTTPSErrors: true,
  storageState: authPath,
});
const ordered = (g: any) =>
  Object.fromEntries(
    Object.entries(normalizeGraphStorageOrder(g)).map(([key, value]) => [
      key,
      Array.isArray(value)
        ? [...value].sort((a, b) =>
            String(a.id ?? a.key).localeCompare(String(b.id ?? b.key)),
          )
        : value,
    ]),
  );
try {
  const session = await (await c.get("/api/auth/session")).json();
  if (
    session.state !== "authenticated" ||
    session.principalId !== "81cd1978-2df5-5c9a-938a-2f8c291aea13" ||
    session.tenantId !== "44444444-4444-4444-8444-444444444444"
  )
    throw Error("Expected local Studio author session");
  const r = await c.get(path);
  if (!r.ok()) throw Error(`Graph read failed: ${r.status()}`);
  const current = await r.json();
  if (
    current.changeSet.status !== "draft" ||
    current.changeSet.branchCode !== "local-preview"
  )
    throw Error("Expected local preview draft");
  const graph = withBusinessPartnerCollectionPresentations(current.graph);
  const validation = validateGraph(graph),
    tests = runContractTests(graph);
  if (validation.issues.length || !tests.passed)
    throw Error(JSON.stringify({ issues: validation.issues, tests }));
  const surfaces = compileEntityIntakeSurfaces(graph);
  const presentations = surfaces
    .flatMap((s) => s.sections.flatMap((section) => section.fields))
    .flatMap((f) =>
      f.control === "repeatableGroup" && f.presentation
        ? [{ field: f.key, renderer: f.presentation.renderer }]
        : [],
    );
  for (const renderer of [
    "addresses",
    "contacts",
    "bank-accounts",
    "certifications",
    "documents",
  ])
    if (!presentations.some((p) => p.renderer === renderer))
      throw Error(`Missing ${renderer}`);
  const receipt: any = {
    environment: "dev",
    activationKind: "signed-local-preview",
    changeSetId: id,
    beforeRevision: current.changeSet.revision,
    beforeHash: sha256(current.graph),
    candidateHash: sha256(graph),
    presentations,
    recordedAt: new Date().toISOString(),
  };
  if (!process.argv.includes("--apply")) {
    console.log(JSON.stringify({ ...receipt, dryRun: true }, null, 2));
    process.exitCode = 0;
  } else {
    const changed = sha256(ordered(current.graph)) !== sha256(ordered(graph));
    if (
      changed ||
      current.preview?.state !== "active" ||
      current.preview?.contractHash !== sha256(current.graph)
    ) {
      mkdirSync(output, { recursive: true });
      const backup = `${output}/graph-before-revision-${current.changeSet.revision}.json`;
      writeFileSync(backup, JSON.stringify(current.graph, null, 2) + "\n", {
        mode: 0o600,
        flag: "wx",
      });
      receipt.backup = backup;
      const csrf = (await c.storageState()).cookies.find((x) =>
        /^(__Host-)?athyper-csrf$/.test(x.name),
      );
      if (!csrf) throw Error("CSRF required");
      const saved = await c.put(path, {
        headers: {
          origin,
          "x-csrf-token": decodeURIComponent(csrf.value),
          "if-match": String(current.changeSet.revision),
        },
        data: graph,
      });
      receipt.saveStatus = saved.status();
      receipt.save = await saved.json();
      writeFileSync(output, JSON.stringify(receipt, null, 2) + "\n");
      if (!saved.ok()) throw Error(`Graph save failed: ${saved.status()}`);
    }
    const verifiedResponse = await c.get(path);
    if (!verifiedResponse.ok()) throw Error("Readback failed");
    const verified = await verifiedResponse.json();
    if (sha256(ordered(graph)) !== sha256(ordered(verified.graph)))
      throw Error("Graph readback mismatch");
    receipt.activeRevision = verified.changeSet.revision;
    receipt.contractHash = sha256(verified.graph);
    receipt.preview = verified.preview;
    receipt.active =
      verified.preview?.state === "active" &&
      verified.preview.contractHash === receipt.contractHash;
    if (!changed && existsSync(output)) {
      const previous = JSON.parse(readFileSync(output, "utf8"));
      if (previous.save?.revision === receipt.activeRevision)
        Object.assign(receipt, {
          beforeRevision: previous.beforeRevision,
          beforeHash: previous.beforeHash,
          backup: previous.backup,
          saveStatus: previous.saveStatus,
          save: previous.save,
        });
    }
    writeFileSync(output, JSON.stringify(receipt, null, 2) + "\n");
    console.log(JSON.stringify(receipt, null, 2));
    if (!receipt.active) throw Error("Updated metadata is not active");
  }
} finally {
  await c.storageState({ path: authPath });
  chmodSync(authPath, 0o600);
  await c.dispose();
}
