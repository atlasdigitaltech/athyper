/** Publish the narrow country-filter update to the existing signed DEV preview. */
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { request } from "@playwright/test";
import {
  sha256,
  validateGraph,
  compileGraph,
  runContractTests,
} from "../../../server/packages/planes/studio/meta-entity-authoring/src/deterministic.js";
import { baselineJsonHash } from "../../../server/packages/planes/studio/meta-entity-authoring/src/baseline-publication.js";
const root = join(homedir(), ".athyper/deployments/global-field-controls");
const before = JSON.parse(readFileSync(join(root, "before.json"), "utf8"));
const graph = structuredClone(before.graph);
const changes: { path: string; before: string; after: string }[] = [];
function patch(value: any, path = "") {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (key === "filterPresentation") {
      const country = (child as any).quickFields?.find(
        (f: any) => f.field === "registration_country_code",
      );
      if (country && country.defaultOperator !== "eq") {
        changes.push({
          path: `${path}.${key}.quickFields[registration_country_code].defaultOperator`,
          before: country.defaultOperator,
          after: "eq",
        });
        country.defaultOperator = "eq";
      }
    } else patch(child, `${path}.${key}`);
  }
}
patch(graph);
for (const surface of graph.surfaces) {
  const marker = surface.layoutConfig?.runtimeRestoration;
  if (marker) marker.descriptorHash = baselineJsonHash(marker.descriptor);
}
const listSurface = graph.surfaces.find(
  (surface: any) => surface.surfaceKind === "list" && surface.isDefault,
);
const restored = graph.surfaces.find(
  (surface: any) => surface.layoutConfig?.runtimeRestoration,
)?.layoutConfig.runtimeRestoration.descriptor;
if (!listSurface || !restored)
  throw Error("Expected existing DEV list and reviewed metadata");
listSurface.layoutConfig.filterPresentation = structuredClone(
  restored.listPresentation.filterPresentation,
);
for (const key of ["registration_country_code", "status", "partner_category"]) {
  const field = graph.fields.find((field: any) => field.fieldKey === key);
  const original = restored.fields.find((field: any) => field.key === key);
  if (!field || !original) throw Error(`Missing reviewed field ${key}`);
  let binding = graph.surfaceFieldBindings.find(
    (binding: any) =>
      binding.entitySurfaceId === listSurface.id &&
      binding.entityFieldId === field.id,
  );
  if (!binding) {
    binding = {
      id: randomUUID(),
      entitySurfaceId: listSurface.id,
      entityFieldId: field.id,
      bindingKey: `global_controls_${key}`,
      position: original.list.defaultOrder,
      labelOverride: original.list.label,
      columnSpan: 12,
      showRequiredIndicator: false,
      displayConfig: { defaultVisible: false },
      status: "active",
    };
    graph.surfaceFieldBindings.push(binding);
  }
  if (original.list.semanticRole)
    binding.displayConfig.semanticRole = original.list.semanticRole;
  if (original.validation?.options)
    binding.displayConfig.lookup = {
      options: original.validation.options.map((value: string) => ({
        value,
        label: value,
      })),
    };
}
const validation = validateGraph(graph),
  tests = runContractTests(graph);
if (validation.issues.length || !tests.passed)
  throw Error(JSON.stringify({ validation, tests }));
const compiled = compileGraph(graph);
const receipt: any = {
  environment: "dev",
  mode: "shared-source-and-signed-preview",
  updatedAt: new Date().toISOString(),
  metadata: {
    changeSetId: before.changeSet.id,
    expectedRevision: before.changeSet.revision,
    beforeHash: sha256(before.graph),
    contractHash: compiled.contractHash,
    changes,
    validationPassed: true,
    contractTestsPassed: true,
    nativeListPresentation: true,
    declaredChoiceBindings: [
      "registration_country_code",
      "status",
      "partner_category",
    ],
    status: "prepared",
  },
};
const receiptPath =
  "governance/policy/reports/global-field-controls-deployment.dev.json";
writeFileSync(join(root, "prepared.json"), JSON.stringify(graph, null, 2), {
  mode: 0o600,
});
writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + "\n");
if (!process.argv.includes("--apply")) {
  console.log(JSON.stringify(receipt));
  process.exit(0);
}
const origin = "https://studio.dev.athyper.test";
const client = await request.newContext({
  baseURL: origin,
  ignoreHTTPSErrors: true,
  storageState: join(root, "studio-session.json"),
});
try {
  const session = await (await client.get("/api/auth/session")).json();
  if (
    session.state !== "authenticated" ||
    session.tenantId !== before.changeSet.tenantId ||
    session.principalId !== before.changeSet.createdBy
  )
    throw Error("Authenticated DEV author required");
  const path = `/api/relay/meta-entity-authoring/change-sets/${before.changeSet.id}/graph`;
  const response = await client.get(path);
  if (!response.ok()) throw Error(`Read failed: ${response.status()}`);
  const current = await response.json();
  if (sha256(current.graph) !== sha256(graph)) {
    if (
      current.changeSet.revision !== before.changeSet.revision ||
      sha256(current.graph) !== sha256(before.graph)
    )
      throw Error(
        "Graph changed since preparation; preserve concurrent edits and prepare again",
      );
    const csrf = (await client.storageState()).cookies.find((c) =>
      /^(__Host-)?athyper-csrf$/.test(c.name),
    );
    if (!csrf) throw Error("CSRF required");
    const saved = await client.put(path, {
      headers: {
        origin,
        "x-csrf-token": decodeURIComponent(csrf.value),
        "if-match": String(current.changeSet.revision),
      },
      data: graph,
    });
    if (!saved.ok()) throw Error(`Save failed: ${saved.status()}`);
  }
  const check = await client.get(path);
  if (!check.ok()) throw Error(`Verification read failed: ${check.status()}`);
  const verified = await check.json();
  writeFileSync(join(root, "after.json"), JSON.stringify(verified, null, 2), {
    mode: 0o600,
  });
  if (
    sha256(verified.graph) !== sha256(graph) ||
    verified.preview?.state !== "active" ||
    verified.preview.activeRevision !== verified.changeSet.revision ||
    verified.preview.contractHash !== compiled.contractHash
  )
    throw Error("Saved metadata is not the expected active signed preview");
  receipt.metadata.status = "active_signed_dev_preview";
  receipt.metadata.savedRevision = verified.changeSet.revision;
  receipt.metadata.preview = verified.preview;
  receipt.updatedAt = new Date().toISOString();
  writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + "\n");
  console.log(JSON.stringify(receipt, null, 2));
} finally {
  await client.dispose();
}
