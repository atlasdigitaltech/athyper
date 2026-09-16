/** Read-only DEV browser evidence after a human-approved publication. No login or approval automation. */
import { parseArgs } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
const { values } = parseArgs({
  options: {
    "studio-session": { type: "string" },
    "neon-session": { type: "string" },
    release: { type: "string" },
    surface: { type: "string" },
    field: { type: "string" },
    "expected-text": { type: "string" },
    output: { type: "string" },
  },
});
for (const key of [
  "studio-session",
  "neon-session",
  "release",
  "surface",
  "field",
  "expected-text",
  "output",
])
  if (!values[key]) throw Error(`Missing --${key}`);
if (!/^[0-9a-f-]{36}$/i.test(values.release))
  throw Error("Invalid release UUID");
process.umask(0o077);
const output = resolve(values.output);
await mkdir(output, { recursive: true });
const evidence = {
  schema: "athyper.studio-workbench-neon-verification/2",
  observedAt: new Date().toISOString(),
  releaseId: values.release,
  passed: false,
};
const browser = await chromium.launch({
  args: ["--host-resolver-rules=MAP *.dev.athyper.test 127.0.0.1"],
});
try {
  const studio = await browser.newContext({
    storageState: resolve(values["studio-session"]),
    ignoreHTTPSErrors: true,
  });
  const page = await studio.newPage();
  await page.goto(
    `https://studio.dev.athyper.test/mdg/business-partner/model?inspect=release:${values.release}`,
    { waitUntil: "domcontentloaded" },
  );
  const read = async (path) => {
    const response = await page.request.get(
      `https://studio.dev.athyper.test${path}`,
    );
    if (!response.ok())
      throw Error(`Studio read failed: HTTP ${response.status()}`);
    return response.json();
  };
  const session = await read("/api/auth/session");
  if (session.state !== "authenticated" || session.plane !== "studio")
    throw Error("An authenticated DEV Studio session is required");
  const source = await read(
    `/api/relay/meta-entity-authoring/inspection/releases/${values.release}`,
  );
  if (source.release?.id !== values.release || !source.release.contractHash)
    throw Error("Source release identity is unavailable");
  const surface = source.graph?.surfaces?.find(
    (s) => s.surfaceKey === values.surface,
  );
  const field = source.graph?.fields?.find((f) => f.fieldKey === values.field);
  const bindings =
    source.graph?.surfaceFieldBindings?.filter(
      (b) => b.entitySurfaceId === surface?.id && b.entityFieldId === field?.id,
    ) ?? [];
  if (
    !surface ||
    !field ||
    bindings.length !== 1 ||
    (bindings[0].labelOverride ?? field.fieldKey) !== values["expected-text"]
  )
    throw Error(
      "Expected surface field label is not in the selected source release",
    );
  const activationPath = `/api/relay/meta-entity-authoring/inspection/releases/${values.release}/activation`;
  const before = await read(activationPath),
    target = before.targets?.find((t) => t.plane === "neon");
  if (
    before.targets?.filter((t) => t.plane === "neon").length !== 1 ||
    before.releaseId !== values.release ||
    before.tenantId !== session.tenantId ||
    target?.state !== "active" ||
    target.releaseId !== values.release ||
    before.contractHash !== source.release.contractHash ||
    target.contractHash !== source.release.contractHash ||
    target.descriptorSourceHash !== source.release.contractHash ||
    !target.appliedReleaseId ||
    !target.descriptorHash
  )
    throw Error("Expected release is not confirmed active in Neon");
  const neon = await browser.newContext({
    storageState: resolve(values["neon-session"]),
    ignoreHTTPSErrors: true,
  });
  const neonPage = await neon.newPage();
  const response = await neonPage.request.get(
    "https://neon.dev.athyper.test/api/auth/session",
  );
  if (!response.ok()) throw Error("Neon session is unavailable");
  const neonSession = await response.json();
  if (
    neonSession.state !== "authenticated" ||
    neonSession.plane !== "neon" ||
    neonSession.tenantId !== before.tenantId
  )
    throw Error("Neon session must match the activated tenant");
  const descriptorResponse = neonPage.waitForResponse(
    (r) =>
      r
        .url()
        .includes("/entity-runtime/business_partner/application-descriptor") &&
      r.request().method() === "GET",
    { timeout: 30000 },
  );
  await neonPage.goto(
    "https://neon.dev.athyper.test/mdg/business-partner/new",
    { waitUntil: "domcontentloaded" },
  );
  const runtimeResponse = await descriptorResponse;
  if (!runtimeResponse.ok())
    throw Error(
      `Neon descriptor read failed: HTTP ${runtimeResponse.status()}`,
    );
  const descriptor = await runtimeResponse.json();
  if (descriptor.revision?.descriptorHash !== target.descriptorHash)
    throw Error(
      "The browser uses a different runtime descriptor (possibly a local development preview)",
    );
  const runtimeSurface = descriptor.intakeSurfaces?.find(
    (s) => s.key === values.surface,
  );
  const runtimeField = runtimeSurface?.sections
    ?.flatMap((s) => s.fields)
    .find((f) => f.key === values.field);
  if (runtimeField?.label !== values["expected-text"])
    throw Error(
      "The requested surface field label does not match the browser descriptor",
    );
  if (runtimeField.control !== "choiceCards")
    throw Error(
      "Visible proof currently supports intake choice-card labels only",
    );
  const visible = neonPage.getByRole("group", {
    name: values["expected-text"],
    exact: true,
  });
  await visible.waitFor({ state: "visible", timeout: 30000 });
  await neonPage.screenshot({
    path: resolve(output, "neon-visible-change.png"),
    fullPage: true,
  });
  const after = await read(activationPath),
    current = after.targets?.find((t) => t.plane === "neon");
  if (
    after.targets?.filter((t) => t.plane === "neon").length !== 1 ||
    current?.state !== "active" ||
    current.releaseId !== target.releaseId ||
    current.descriptorHash !== target.descriptorHash ||
    current.appliedReleaseId !== target.appliedReleaseId ||
    current.activatedAt !== target.activatedAt ||
    after.tenantId !== before.tenantId ||
    after.contractHash !== source.release.contractHash ||
    current.contractHash !== source.release.contractHash ||
    current.descriptorSourceHash !== source.release.contractHash
  )
    throw Error("Activation changed during browser verification");
  Object.assign(evidence, {
    passed: true,
    observedAt: new Date().toISOString(),
    contractHash: source.release.contractHash,
    surfaceKey: values.surface,
    fieldKey: values.field,
    runtimeDescriptorHash: descriptor.revision.descriptorHash,
    tenantId: before.tenantId,
    publicationKey: before.publicationKey,
    expectedText: values["expected-text"],
    target: current,
    studioPrincipalId: session.principalId,
    neonPrincipalId: neonSession.principalId,
  });
} catch (error) {
  evidence.error =
    error instanceof Error ? error.message : "Verification failed";
  process.exitCode = 1;
} finally {
  await browser.close();
  await writeFile(
    resolve(output, "evidence.json"),
    JSON.stringify(evidence, null, 2) + "\n",
    { mode: 0o600 },
  );
}
console.log(
  JSON.stringify({
    passed: evidence.passed,
    evidence: resolve(output, "evidence.json"),
  }),
);
