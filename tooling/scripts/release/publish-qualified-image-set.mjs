#!/usr/bin/env node
// Explicit local publication entrypoint. All writes target the release registry;
// AWS provisioning and deployment are deliberately separate operations.
import { spawnSync } from "node:child_process";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  openSync,
  closeSync,
  existsSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
const require = createRequire(
  new URL("../../../deploy/stackctl/package.json", import.meta.url),
);
const YAML = require("yaml");
const [sourceArg, evidenceArg] = process.argv.slice(2);
if (
  !sourceArg ||
  !evidenceArg ||
  process.env.ATHYPER_CONFIRM_IMAGE_PUBLICATION !== "true"
)
  throw Error(
    "Usage: ATHYPER_CONFIRM_IMAGE_PUBLICATION=true node publish-qualified-image-set.mjs CLEAN_SOURCE EVIDENCE_DIR",
  );
const source = resolve(sourceArg),
  evidence = resolve(evidenceArg);
mkdirSync(evidence, { recursive: true, mode: 0o700 });
function run(args, log) {
  const fd = log ? openSync(join(evidence, log), "a", 0o600) : null;
  try {
    const r = spawnSync(args[0], args.slice(1), {
      cwd: source,
      encoding: "utf8",
      stdio: fd === null ? "pipe" : ["ignore", fd, fd],
      timeout: 3600000,
    });
    if (r.status !== 0) throw Error(`${args[0]} failed; ${log ?? r.stderr}`);
    return r.stdout?.trim();
  } finally {
    if (fd !== null) closeSync(fd);
  }
}
if (run(["git", "status", "--porcelain=v1", "--untracked-files=all"]))
  throw Error("Publication requires a clean source worktree");
const revision = run(["git", "rev-parse", "HEAD"]);
const workflow = YAML.parse(
  readFileSync(join(source, ".github/workflows/stack-v2-images.yml"), "utf8"),
);
const matrix = workflow.jobs.publish.strategy.matrix.include;
const records = [];
const trivy = process.env.TRIVY_BIN || "trivy";
function scan(reference, id, suffix) {
  const file = `${id}.${suffix}.scan.json`;
  run(
    [
      trivy,
      "image",
      "--timeout",
      "20m",
      "--skip-db-update",
      "--scanners",
      "vuln",
      "--format",
      "json",
      "--output",
      join(evidence, file),
      reference,
    ],
    `${id}.${suffix}.scan.log`,
  );
  run(
    [
      "node",
      join(source, "deploy/compose/scripts/gate-infrastructure-scan.mjs"),
      join(evidence, file),
    ],
    `${id}.${suffix}.gate.log`,
  );
  return {
    file,
    sha256: createHash("sha256")
      .update(readFileSync(join(evidence, file)))
      .digest("hex"),
  };
}
// Publish bounded infrastructure first while application builds can reuse cache.
matrix.sort(
  (a, b) => (a.context === "." ? 1 : 0) - (b.context === "." ? 1 : 0),
);
const selected =
  process.env.ATHYPER_PUBLISH_IMAGE_IDS?.split(",").filter(Boolean);
if (selected?.some((id) => !matrix.some((item) => item.id === id)))
  throw Error("Unknown publication image ID");
for (const item of matrix.filter(
  (item) => !selected || selected.includes(item.id),
)) {
  const receipt = join(evidence, `${item.id}.published.json`);
  if (existsSync(receipt)) {
    const r = JSON.parse(readFileSync(receipt));
    if (r.sourceRevision !== revision)
      throw Error("Receipt belongs to a different source");
    run(
      ["docker", "buildx", "imagetools", "inspect", r.reference],
      `${item.id}.registry-check.log`,
    );
    records.push(r);
    continue;
  }
  console.log(`Building ${item.id}`, new Date().toISOString());
  const tag = `${item.image}:sha-${revision}`;
  const args = [
    "docker",
    "buildx",
    "build",
    "--provenance=mode=max",
    "--sbom=true",
    "--output",
    "type=image",
    "--platform",
    "linux/amd64",
    "--label",
    `org.opencontainers.image.revision=${revision}`,
    "--label",
    "org.opencontainers.image.source=https://github.com/atlasdigitaltech/athyper",
    "-t",
    tag,
    "-f",
    join(source, item.dockerfile),
  ];
  for (const arg of (item.build_args ?? "").trim().split("\n").filter(Boolean))
    args.push("--build-arg", arg);
  args.push(join(source, item.context));
  run(args, `${item.id}.build.log`);
  const local = scan(tag, item.id, "local");
  run(["docker", "push", tag], `${item.id}.push.log`);
  const inspected = JSON.parse(run(["docker", "image", "inspect", tag]))[0];
  const reference = inspected.RepoDigests.find((r) =>
    r.startsWith(item.image + "@sha256:"),
  );
  if (
    !reference ||
    inspected.Config.Labels["org.opencontainers.image.revision"] !== revision
  )
    throw Error("Digest or source provenance missing");
  const index = JSON.parse(
    run(["docker", "buildx", "imagetools", "inspect", "--raw", reference]),
  );
  if (
    !index.manifests?.some(
      (m) =>
        m.annotations?.["vnd.docker.reference.type"] === "attestation-manifest",
    )
  )
    throw Error("Registry attestation manifest missing");
  const published = scan(reference, item.id, "published");
  const r = {
    id: item.id,
    reference,
    sourceRevision: revision,
    local,
    published,
  };
  writeFileSync(receipt, JSON.stringify(r, null, 2) + "\n", { mode: 0o600 });
  records.push(r);
  console.log(`Published and verified ${item.id}: ${reference}`);
}
if (selected) {
  console.log(
    "Selected image publication complete; the full publisher must assemble the final ImageSet.",
  );
  process.exit(0);
}
for (const item of JSON.parse(
  readFileSync(
    join(source, "deploy/compose/scripts/upstream-release-images.json"),
  ),
).include) {
  const published = scan(item.reference, item.id, "published");
  records.push({ ...item, sourceRevision: revision, published });
}
const expected = [
  ...matrix.map((x) => x.id),
  ...JSON.parse(
    readFileSync(
      join(source, "deploy/compose/scripts/upstream-release-images.json"),
    ),
  ).include.map((x) => x.id),
].sort();
if (
  JSON.stringify(records.map((r) => r.id).sort()) !== JSON.stringify(expected)
)
  throw Error("Incomplete or duplicate ImageSet");
const manifest = {
  apiVersion: "athyper.io/v1alpha1",
  kind: "ImageSet",
  metadata: { id: `candidate-${revision.slice(0, 12)}`, channel: "candidate" },
  spec: {
    sourceRevision: revision,
    images: records
      .map(({ id, reference }) => ({ id, reference }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  },
};
writeFileSync(
  join(evidence, "published-image-set.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
writeFileSync(
  join(evidence, "publication-evidence.json"),
  JSON.stringify({ sourceRevision: revision, images: records }, null, 2) + "\n",
);
console.log(`Complete immutable ImageSet: ${records.length} images`);
