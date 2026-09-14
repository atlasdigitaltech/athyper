import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, renameSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "@playwright/test";
import { captureMetadata, verifyRuntimeSources } from "./metadata-capture.mts";
import { metadataHash, metadataKey } from "./metadata-set.mjs";
import {
  importNativeMetadata,
  planMetadataImport,
} from "./metadata-import.mts";
import { readQaBrowserSession } from "./qa-browser-session.mjs";
import { installQaMetadataCatalog } from "./qa-metadata-catalog.mts";
import { qaProject } from "./qa-runtime.mjs";

export function assertQaCandidateImages(images: any) {
  const project = qaProject();
  if (!/^athyper-qa-candidate-\d{13}$/.test(project))
    throw Error("Fresh isolated QA required");
  const ids = execFileSync(
    "docker",
    ["ps", "-aq", "--filter", `label=com.docker.compose.project=${project}`],
    { encoding: "utf8" },
  )
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const containers = JSON.parse(
    execFileSync("docker", ["inspect", ...ids], { encoding: "utf8" }),
  );
  for (const service of [
    "api",
    "worker",
    "scheduler",
    "studio-web",
    "neon-web",
    "mesh-web",
    "iam",
  ]) {
    const container = containers.find(
      (c: any) => c.Config.Labels["com.docker.compose.service"] === service,
    );
    const ref = images.spec.images.find(
      (i: any) =>
        i.id ===
        (["api", "worker", "scheduler"].includes(service)
          ? "runtime-server"
          : service),
    )?.reference;
    if (
      !ref ||
      !container?.State.Running ||
      container.State.Health?.Status !== "healthy"
    )
      throw Error(`QA candidate service unavailable: ${service}`);
    const image = JSON.parse(
      execFileSync("docker", ["image", "inspect", ref], { encoding: "utf8" }),
    )[0];
    if (
      container.Image !== image.Id ||
      image.Config.Labels["org.opencontainers.image.revision"] !==
        images.spec.sourceRevision
    )
      throw Error(`QA candidate image mismatch: ${service}`);
  }
  return project;
}
export async function verifyQaMetadataPrerequisites(
  metadata: any,
  checkout: string,
  ignorePermissions = false,
) {
  const plan = planMetadataImport(metadata),
    project = qaProject();
  verifyRuntimeSources(metadata, checkout);
  const expectedItems = plan.prerequisites.filter(
    (item: any) => !ignorePermissions || item.reference.kind !== "permission",
  );
  const observed = await captureMetadata({
    tenantId: metadata.tenantId,
    source: `${project}-db-1`,
    checkout,
    roots: expectedItems.map((item: any) => item.reference),
  });
  const checks = expectedItems.map((expected: any) => {
    const actual = observed.metadata.items.find(
      (item: any) =>
        metadataKey(item.reference) === metadataKey(expected.reference),
    );
    return {
      reference: expected.reference,
      passed:
        Boolean(actual) &&
        metadataHash(actual.payload) === metadataHash(expected.payload),
    };
  });
  if (checks.some((check: any) => !check.passed))
    throw Error(
      `QA metadata prerequisites differ: ${checks
        .filter((check: any) => !check.passed)
        .map((check: any) => metadataKey(check.reference))
        .join(",")}`,
    );
  return checks;
}
export async function importQaMetadataCandidate(
  input: { metadata: any; images: any; manifest: any },
  checkout: string,
) {
  const project = assertQaCandidateImages(input.images);
  const prerequisites = await verifyQaMetadataPrerequisites(
    input.metadata,
    checkout,
  );
  const root = join(homedir(), ".athyper/qualification/qa-metadata");
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const output = join(root, `import-${metadataHash(input.manifest)}.json`);
  const browser = await chromium.launch({
    args: ["--host-resolver-rules=MAP *.qa.athyper.test 127.0.0.1"],
  });
  try {
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
      storageState: join(
        homedir(),
        ".athyper/qualification/sessions/qa/studio/catl.admin.json",
      ),
    });
    const page = await context.newPage();
    await page.goto("https://studio.qa.athyper.test/api/auth/session");
    const session = await readQaBrowserSession(page, "studio", "catl.admin");
    if (session.assurance !== "elevated")
      throw Error(
        "QA Studio author MFA step-up required for native graph authoring",
      );

    const result = await importNativeMetadata(
      input.metadata,
      {
        async request(method, path, body, headers) {
          const response = await page.evaluate(
            async ({ method, path, body, headers }) => {
              const cookie = document.cookie
                .split("; ")
                .find((value) => value.startsWith("__Host-athyper-csrf="));
              const csrf = cookie
                ? decodeURIComponent(cookie.slice(cookie.indexOf("=") + 1))
                : "";
              const response = await fetch(
                "/api/relay/" + path.slice("/api/".length),
                {
                  method,
                  headers: {
                    "content-type": "application/json",
                    ...(method !== "GET" ? { "x-csrf-token": csrf } : {}),
                    ...headers,
                  },
                  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
                },
              );
              const data = await response.json();
              return { status: response.status, body: data };
            },
            { method, path, body, headers },
          );
          if (response.status < 200 || response.status >= 300)
            throw Error(
              `Native QA import rejected: ${method} ${path} HTTP ${response.status}`,
            );
          return response.body;
        },
      },
      {
        verifyPrerequisites: async () => {},
        async checkpoint(receipt) {
          const temporary = output + ".tmp";
          writeFileSync(
            temporary,
            JSON.stringify(
              {
                ...receipt,
                project,
                sourceRevision: input.manifest.sourceRevision,
                importedBy: session.principalId,
                prerequisites,
                observedAt: new Date().toISOString(),
              },
              null,
              2,
            ) + "\n",
            { mode: 0o600 },
          );
          renameSync(temporary, output);
        },
      },
    );
    return {
      output,
      entities: result.entities,
      caseContracts: result.caseContracts,
      definitions: result.definitions,
      nativeReviewRequired: true,
      releaseQualified: false,
    };
  } finally {
    await browser.close();
  }
}

/** Environment preparation precedes MFA capture. Catalog definitions and explicit
 * separate QA actor grants use the repository's system provisioning convention. */
export async function prepareQaMetadataCandidate(
  input: { metadata: any; images: any; manifest: any },
  checkout: string,
) {
  const project = assertQaCandidateImages(input.images);
  await verifyQaMetadataPrerequisites(input.metadata, checkout, true);
  installQaMetadataCatalog(input.metadata, false);
  const catalogs = installQaMetadataCatalog(input.metadata, true);
  const script = readFileSync(
    join(
      checkout,
      "server/db/scripts/operations/studio/provision-cirrusatlantic-meta-qa.sql",
    ),
    "utf8",
  );
  for (const apply of [false, true])
    execFileSync(
      "docker",
      [
        "exec",
        "-i",
        `${project}-db-1`,
        "psql",
        "-U",
        "postgres",
        "-d",
        "athyper_studio",
        "-XqAt",
        "-v",
        "ON_ERROR_STOP=1",
        "-v",
        `apply=${apply}`,
      ],
      { input: script, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
    );
  const prerequisites = await verifyQaMetadataPrerequisites(
    input.metadata,
    checkout,
  );
  const root = join(homedir(), ".athyper/qualification/qa-metadata");
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const output = join(root, `prepare-${Date.now()}.json`);
  writeFileSync(
    output,
    JSON.stringify(
      {
        schema: "athyper.qa-metadata-preparation/1",
        project,
        candidateHash: metadataHash(input.manifest),
        catalogs,
        prerequisites,
        nativeApproval: false,
        mfaPolicyChanged: false,
        releaseQualified: false,
      },
      null,
      2,
    ) + "\n",
    { mode: 0o600, flag: "wx" },
  );
  return {
    output,
    prepared: true,
    nativeApproval: false,
    releaseQualified: false,
  };
}
