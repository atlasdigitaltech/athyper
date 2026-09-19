#!/usr/bin/env node
/** Portable authoring/candidate handoff; never copies local users or signing keys. */
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  lstatSync,
  renameSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import YAML from "yaml";
import { qaProject } from "./qa-runtime.mjs";
import { promoteImageSet } from "../release/promote-image-set.mjs";
import { snapshotCandidate } from "./candidate-snapshot.mjs";
import { buildCandidate } from "./candidate-build.mjs";
import { assertBusinessPartnerMetadataSet } from "./metadata-set.mjs";
export const sha = (value) =>
  createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(value))
    .digest("hex");
const json = (path) => JSON.parse(readFileSync(path, "utf8"));
const execute = (program, args) =>
  execFileSync(program, args, {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
function writeNew(path, value) {
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n", {
    mode: 0o600,
    flag: "wx",
  });
}
export function verifyPackage(document) {
  if (
    document?.schema !== "athyper.authoring-export/1" ||
    !document.revision?.bundle ||
    document.bundleSha256 !== sha(document.revision.bundle)
  )
    throw new Error("Authoring package content mismatch");
  if (
    document.revision.bundleCode !== "business_partner.onboarding" ||
    document.revision.bundle.bundleCode !== document.revision.bundleCode
  )
    throw new Error("Only the Business Partner onboarding slice is supported");
  return document;
}
export function verifyCandidate(directory) {
  const manifest = json(join(directory, "candidate.json"));
  if (
    !["athyper.local-candidate/1", "athyper.local-candidate/2"].includes(
      manifest.schema,
    )
  )
    throw new Error("Unsupported candidate schema");
  if (
    JSON.stringify(Object.keys(manifest.files ?? {}).sort()) !==
    JSON.stringify(
      [
        "authoring.json",
        "compiled.json",
        "images.yaml",
        "migrations.json",
        ...(manifest.schema === "athyper.local-candidate/2"
          ? ["metadata.json"]
          : []),
      ].sort(),
    )
  )
    throw new Error("Candidate must bind all required files");
  for (const [name, expected] of Object.entries(manifest.files)) {
    if (!/^[a-zA-Z0-9_.-]+$/.test(name) || name === "." || name === "..")
      throw new Error("Invalid candidate path");
    if (
      !lstatSync(join(directory, name)).isFile() ||
      sha(readFileSync(join(directory, name), "utf8")) !== expected
    )
      throw new Error(`Candidate file changed: ${name}`);
  }
  const authoring = verifyPackage(json(join(directory, "authoring.json"))),
    images = YAML.parse(readFileSync(join(directory, "images.yaml"), "utf8"));
  const release = promoteImageSet(images);
  if (release.spec.sourceRevision !== manifest.sourceRevision)
    throw new Error("Candidate source revision mismatch");
  const metadata =
    manifest.schema === "athyper.local-candidate/2"
      ? assertBusinessPartnerMetadataSet(
          json(join(directory, "metadata.json")),
          authoring.revision.tenantId,
          authoring.revision.bundle,
        )
      : undefined;
  return { manifest, authoring, images, release, metadata };
}
function assertLocalDaemon() {
  const endpoint = JSON.parse(
    execute("docker", [
      "context",
      "inspect",
      "--format",
      "{{json .Endpoints.docker.Host}}",
    ]),
  );
  if (
    !endpoint.startsWith("unix://") ||
    (process.env.DOCKER_HOST && !process.env.DOCKER_HOST.startsWith("unix://"))
  )
    throw new Error(
      "Local candidate operations require the local Unix Docker daemon",
    );
}
export async function main(args = process.argv.slice(2)) {
  const [action, ...rest] = args;
  if (action === "qa-prepare" && rest.length === 1) {
    const candidate = verifyCandidate(resolve(rest[0]));
    if (!candidate.metadata)
      throw Error("Complete candidate v2 metadata required");
    const { prepareQaMetadataCandidate } =
      await import("./qa-metadata-import.mts");
    console.log(
      JSON.stringify(
        await prepareQaMetadataCandidate(
          candidate,
          resolve(import.meta.dirname, "../../.."),
        ),
      ),
    );
    return;
  }
  if (action === "metadata-capture" && rest.length >= 1) {
    const { captureMetadataFile } = await import("./metadata-capture.mts");
    console.log(
      JSON.stringify(
        await captureMetadataFile(
          {
            tenantId: "44444444-4444-4444-8444-444444444444",
            source: "athyper-dev-db-1",
            supplements: rest.slice(1),
            checkout: resolve(import.meta.dirname, "../../.."),
            roots: [
              { kind: "entity", key: "business_partner", plane: "neon" },
              {
                kind: "entity",
                key: "business_partner_request",
                plane: "neon",
              },
              {
                kind: "case_contract",
                key: "master.business_partner",
                plane: "neon",
              },
              {
                kind: "definition",
                key: "business_partner.onboarding",
                plane: "neon",
              },
            ],
          },
          resolve(rest[0]),
        ),
      ),
    );
    return;
  }
  if (action === "metadata-pack" && rest.length === 2) {
    const { packMetadataFile } = await import("./metadata-pack.mts");
    console.log(
      JSON.stringify(await packMetadataFile(rest[0], rest[1]), null, 2),
    );
    return;
  }
  if (action === "build" && rest.length === 1) {
    console.log(
      JSON.stringify(
        buildCandidate(resolve(import.meta.dirname, "../../.."), rest[0]),
        null,
        2,
      ),
    );
    return;
  }
  if (action === "snapshot" && rest.length === 1) {
    console.log(
      JSON.stringify(
        await snapshotCandidate(
          resolve(import.meta.dirname, "../../.."),
          rest[0],
        ),
        null,
        2,
      ),
    );
    return;
  }
  if (["export", "qualify", "probe"].includes(action)) assertLocalDaemon();
  if (action === "probe" && rest.length === 1) {
    const directory = resolve(rest[0]),
      { manifest, images } = verifyCandidate(directory);
    const project = qaProject();
    const worker = JSON.parse(
      execute("docker", ["inspect", `${project}-worker-1`]),
    )[0];
    if (
      worker.Config.Labels["com.docker.compose.project"] !== project ||
      !worker.State.Running ||
      worker.State.Health?.Status !== "healthy"
    )
      throw new Error("Healthy isolated QA worker required");
    const image = JSON.parse(
      execute("docker", ["image", "inspect", worker.Image]),
    )[0];
    if (
      image.Config.Labels["org.opencontainers.image.revision"] !==
        manifest.sourceRevision ||
      !image.RepoDigests.includes(
        images.spec.images.find((image) => image.id === "runtime-server")
          .reference,
      )
    )
      throw new Error("QA worker does not run the exact candidate image");
    for (const [source, target] of [
      ["authoring.json", "authoring"],
      ["compiled.json", "compiled"],
    ])
      execute("docker", [
        "cp",
        join(directory, source),
        `${worker.Id}:/tmp/qa-candidate-${target}.json`,
      ]);
    const probe = readFileSync(
      join(import.meta.dirname, "qa-artifact-probe.mjs"),
      "utf8",
    );
    const result = execFileSync(
      "docker",
      ["exec", "-i", worker.Id, "node", "--input-type=module"],
      { input: probe, encoding: "utf8", maxBuffer: 4 * 1024 * 1024 },
    );
    const receipt = {
      ...JSON.parse(result.trim()),
      candidateSha256: sha(manifest),
      sourceRevision: manifest.sourceRevision,
      runtimeImage: worker.Image,
      harnessSha256: sha(probe),
      createdAt: new Date().toISOString(),
    };
    if (
      !receipt.passed ||
      receipt.checks.length !==
        verifyPackage(json(join(directory, "authoring.json"))).revision
          .targetPlanes.length
    )
      throw new Error("Incomplete QA probe");
    const root = join(homedir(), ".athyper/qualification/qa");
    mkdirSync(root, { recursive: true, mode: 0o700 });
    const path = join(root, `candidate-probe-${Date.now()}.json`);
    writeNew(path, receipt);
    console.log(JSON.stringify({ ...receipt, receipt: path }, null, 2));
    return;
  }
  if (action === "export" && rest.length === 2) {
    const [revisionId, output] = rest;
    if (!/^[a-f0-9-]{36}$/.test(revisionId))
      throw new Error("A saved Studio revision UUID is required");
    const inspected = JSON.parse(
      execute("docker", ["inspect", "athyper-dev-db-1"]),
    )[0];
    if (
      inspected.Config.Labels["com.docker.compose.project"] !== "athyper-dev" ||
      !inspected.State.Running
    )
      throw new Error("Running local DEV database required");
    const sql = `SELECT json_build_object('id',id,'tenantId',tenant_id,'bundleCode',bundle_code,'semanticVersion',semantic_version,'bundle',bundle_json,'targetPlanes',target_planes) FROM snapshot.business_partner_definition_revision WHERE id='${revisionId}'::uuid`;
    const row = execute("docker", [
      "exec",
      inspected.Id,
      "psql",
      "-U",
      "postgres",
      "-d",
      "athyper_studio",
      "-Atc",
      sql,
    ]).trim();
    if (!row) throw new Error("Studio revision not found");
    const revision = JSON.parse(row),
      document = {
        schema: "athyper.authoring-export/1",
        revision,
        bundleSha256: sha(revision.bundle),
      };
    verifyPackage(document);
    const destination = resolve(output);
    if (existsSync(destination)) {
      if (!lstatSync(destination).isFile())
        throw new Error("Authoring output must be a regular file");
      const prior = verifyPackage(json(destination));
      if (
        prior.revision.tenantId !== revision.tenantId ||
        prior.revision.bundleCode !== revision.bundleCode
      )
        throw new Error("Refusing to replace another authoring definition");
      const temporary = `${destination}.tmp-${process.pid}`;
      writeNew(temporary, document);
      renameSync(temporary, destination);
    } else writeNew(destination, document);
    console.log(
      "Exported Studio authoring definition; no users, grants, credentials or approvals were exported.",
    );
    return;
  }
  if (action === "freeze" && [3, 4].includes(rest.length)) {
    const [authoringPath, imagesPath, output, metadataPath] = rest,
      checkout = resolve(import.meta.dirname, "../../..");
    const authoring = verifyPackage(json(authoringPath)),
      imagesText = readFileSync(imagesPath, "utf8"),
      images = YAML.parse(imagesText),
      release = promoteImageSet(images);
    if (
      execute("git", [
        "-C",
        checkout,
        "status",
        "--porcelain",
        "--untracked-files=all",
      ]).trim()
    )
      throw new Error(
        "Freeze requires a clean committed checkout. Development preview remains available.",
      );
    const sourceRevision = execute("git", [
      "-C",
      checkout,
      "rev-parse",
      "HEAD",
    ]).trim();
    if (sourceRevision !== release.spec.sourceRevision)
      throw new Error("ImageSet does not match the committed source revision");
    // The ImageSet is generated AFTER building this commit. Requiring it to be
    // tracked in that same commit makes exact-source freeze impossible.
    for (const input of [
      authoringPath,
      ...(metadataPath ? [metadataPath] : []),
    ])
      execute("git", [
        "-C",
        checkout,
        "ls-files",
        "--error-unmatch",
        "--",
        resolve(input),
      ]);
    const { compileBusinessPartnerDefinition } =
      await import("../../../server/packages/services/publication/src/business-partner-definition-compiler.ts");
    const canonicalizer =
      await import("../../../server/packages/adapters/publication-signing/src/canonical-json.ts");
    const compiled = Object.fromEntries(
      authoring.revision.targetPlanes.map((plane) => [
        plane,
        compileBusinessPartnerDefinition({
          bundle: authoring.revision.bundle,
          plane,
          canonicalizer,
        }),
      ]),
    );
    const metadata = metadataPath
      ? assertBusinessPartnerMetadataSet(
          json(metadataPath),
          authoring.revision.tenantId,
          authoring.revision.bundle,
        )
      : undefined;
    if (metadata) {
      const { verifyNativeMetadataGraphs } =
        await import("./metadata-graphs.mts");
      verifyNativeMetadataGraphs(metadata);
      const { verifyRuntimeSources } = await import("./metadata-capture.mts");
      verifyRuntimeSources(metadata, checkout);
    }
    const directory = resolve(output);
    mkdirSync(directory, { mode: 0o700 });
    if (metadata) writeNew(join(directory, "metadata.json"), metadata);
    writeNew(join(directory, "authoring.json"), authoring);
    writeFileSync(join(directory, "images.yaml"), imagesText, {
      mode: 0o600,
      flag: "wx",
    });
    writeNew(join(directory, "compiled.json"), compiled);
    const migrations = execute("git", [
      "-C",
      checkout,
      "ls-files",
      "server/db/migrations",
    ])
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((path) => ({
        path,
        sha256: sha(readFileSync(join(checkout, path), "utf8")),
      }));
    writeNew(join(directory, "migrations.json"), migrations);
    const files = Object.fromEntries(
      [
        "authoring.json",
        "images.yaml",
        "compiled.json",
        "migrations.json",
        ...(metadata ? ["metadata.json"] : []),
      ].map((name) => [name, sha(readFileSync(join(directory, name), "utf8"))]),
    );
    writeNew(join(directory, "candidate.json"), {
      schema: metadata
        ? "athyper.local-candidate/2"
        : "athyper.local-candidate/1",
      sourceRevision,
      files,
      createdAt: new Date().toISOString(),
      releaseQualified: false,
    });
    verifyCandidate(directory);
    console.log(
      "Candidate frozen. QA import, signed publication, migrations and journey qualification are required.",
    );
    return;
  }
  if (action === "verify" && rest.length === 1) {
    const { manifest } = verifyCandidate(resolve(rest[0]));
    console.log(
      JSON.stringify({
        integrityVerified: true,
        sourceRevision: manifest.sourceRevision,
        releaseQualified: false,
      }),
    );
    return;
  }
  if (action === "qualify" && rest.length === 1) {
    const directory = resolve(rest[0]),
      { manifest, images, authoring, metadata } = verifyCandidate(directory),
      checks = [];
    checks.push({
      check: "metadata-dependency-set",
      passed: Boolean(metadata),
    });
    // Closure and live activation are separate evidence. Until all native
    // dependency importers/consumers are checked, this must remain fail-closed.
    checks.push({
      check: "metadata-dependency-activation",
      passed: false,
      reason: metadata
        ? "Native dependency activation checks are required"
        : "Legacy candidate contains only the onboarding bundle",
    });
    const compiled = json(join(directory, "compiled.json"));
    const ids = execute("docker", [
      "ps",
      "-aq",
      "--filter",
      `label=com.docker.compose.project=${qaProject()}`,
    ])
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    const containers = ids.length
      ? JSON.parse(execute("docker", ["inspect", ...ids]))
      : [];
    for (const name of [
      "api",
      "worker",
      "scheduler",
      "studio-web",
      "neon-web",
      "mesh-web",
      "iam",
    ]) {
      const container = containers.find(
          (c) => c.Config.Labels["com.docker.compose.service"] === name,
        ),
        imageId = ["api", "worker", "scheduler"].includes(name)
          ? "runtime-server"
          : name,
        expected = images.spec.images.find((i) => i.id === imageId).reference;
      let passed = false;
      if (
        container?.State.Running &&
        container.State.Health?.Status === "healthy"
      ) {
        const image = JSON.parse(
          execute("docker", ["image", "inspect", container.Image]),
        )[0];
        passed =
          image.RepoDigests?.includes(expected) &&
          image.Config.Labels?.["org.opencontainers.image.revision"] ===
            manifest.sourceRevision;
      }
      checks.push({ check: `image:${name}`, passed: Boolean(passed) });
    }
    const db = containers.find(
      (c) => c.Config.Labels["com.docker.compose.service"] === "db",
    );
    if (db?.State.Running)
      for (const plane of authoring.revision.targetPlanes) {
        const key = authoring.revision.bundleCode;
        if (!/^[a-z0-9_.-]+$/.test(key))
          throw new Error("Invalid publication key");
        const row = execute("docker", [
          "exec",
          db.Id,
          "psql",
          "-U",
          "postgres",
          "-d",
          `athyper_${plane}`,
          "-Atc",
          `SELECT bundle_hash FROM runtime_meta.fn_active_business_partner_definition('studio.business_partner.definition.${key}')`,
        ]).trim();
        checks.push({
          check: `active-metadata:${plane}`,
          passed: row === compiled[plane].compiledBundleHash,
        });
      }
    else checks.push({ check: "qa-database", passed: false });
    const handoffPassed = checks.every((check) => check.passed);
    const receipt = {
      schema: "athyper.qa-metadata-handoff/1",
      candidateSha256: sha(manifest),
      sourceRevision: manifest.sourceRevision,
      checks,
      handoffPassed,
      releaseQualified: false,
      missingReleaseChecks: [
        "complete metadata dependency activation and catalog verification",
        "authenticated BP success and denial journeys",
        "independent release acceptance",
      ],
      at: new Date().toISOString(),
    };
    const root = join(homedir(), ".athyper/qualification/qa");
    mkdirSync(root, { recursive: true, mode: 0o700 });
    writeNew(join(root, `handoff-${Date.now()}.json`), receipt);
    console.log(JSON.stringify(receipt, null, 2));
    if (!handoffPassed) process.exitCode = 1;
    return;
  }
  if (action === "staging-plan" && rest.length === 1) {
    const directory = resolve(rest[0]),
      { manifest, release } = verifyCandidate(directory);
    console.log(
      JSON.stringify(
        {
          schema: "athyper.staging-handoff-plan/1",
          candidateSha256: sha(manifest),
          sourceRevision: manifest.sourceRevision,
          imageSet: release,
          metadataPackage: join(directory, "authoring.json"),
          migrationManifest: join(directory, "migrations.json"),
          deploymentPerformed: false,
          stagingTargetConfigured: false,
          requiredBeforeDeployment: [
            "QA metadata handoff checks",
            "authenticated BP journey qualification",
            "independent release acceptance",
            "staging target and environment configuration",
          ],
        },
        null,
        2,
      ),
    );
    return;
  }
  if (action === "import" && rest.length === 2) {
    const [directory, origin] = rest;
    if (origin !== "https://api.qa.athyper.test")
      throw new Error("Only the isolated local QA API is supported");
    const { manifest, authoring, metadata } = verifyCandidate(
      resolve(directory),
    );
    if (metadata) {
      const { importQaMetadataCandidate } =
        await import("./qa-metadata-import.mts");
      const candidate = verifyCandidate(resolve(directory));
      console.log(
        JSON.stringify(
          await importQaMetadataCandidate(
            candidate,
            resolve(import.meta.dirname, "../../.."),
          ),
        ),
      );
      return;
    }
    const tokenPath = process.env.ATHYPER_QA_AUTHOR_TOKEN_FILE;
    if (!tokenPath)
      throw new Error(
        "ATHYPER_QA_AUTHOR_TOKEN_FILE must contain a valid QA author bearer token",
      );
    const response = await fetch(
      `${origin}/api/studio/business-partner-definitions`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${readFileSync(tokenPath, "utf8").trim()}`,
          "x-plane": "studio",
          "content-type": "application/json",
          "idempotency-key": `candidate:${sha(manifest)}:${authoring.bundleSha256}`,
        },
        body: JSON.stringify({
          bundle: authoring.revision.bundle,
          targetPlanes: authoring.revision.targetPlanes,
        }),
      },
    );
    if (response.status !== 201)
      throw new Error(
        `QA authoring import rejected (${response.status}); no publication was requested`,
      );
    const revision = await response.json();
    if (sha(revision.bundle) !== authoring.bundleSha256)
      throw new Error("QA authoring round trip mismatch");
    const root = join(homedir(), ".athyper/qualification/qa");
    mkdirSync(root, { recursive: true, mode: 0o700 });
    writeNew(join(root, `import-${Date.now()}.json`), {
      candidateSha256: sha(manifest),
      sourceRevision: manifest.sourceRevision,
      sourceAuthoringRevision: authoring.revision.id,
      qaRevision: revision.id,
      qaTenant: revision.tenantId,
      published: false,
    });
    console.log(
      JSON.stringify({
        imported: true,
        qaRevision: revision.id,
        published: false,
        releaseQualified: false,
      }),
    );
    return;
  }
  throw new Error(
    "Use candidate metadata-pack <source-index.json> <metadata.json> | export <Studio revision> <file> | freeze <authoring.json> <candidate-images.yaml> <new-directory> [metadata.json] | verify <directory> | import <directory> https://api.qa.athyper.test | qualify <directory> | staging-plan <directory>",
  );
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
