/** Apply only QA publication services using the active Stack v2 image set. */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { qaProject } from "./qa-runtime.mjs";
import { loadModel } from "../../../deploy/stackctl/src/model.mjs";
function treeSha256(root) {
  const hash = createHash("sha256");
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort(
      (left, right) => left.name.localeCompare(right.name),
    )) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) {
        hash.update(path.slice(root.length + 1));
        hash.update("\0");
        hash.update(readFileSync(path));
        hash.update("\0");
      }
    }
  };
  visit(root);
  return hash.digest("hex");
}

process.umask(0o077);
const deployment = resolve(process.argv[2] ?? "");
if (!process.argv[2]) throw Error("Pass the candidate deployment checkout");
const root = join(homedir(), ".athyper"),
  project = qaProject();
const model = loadModel(deployment, "qa");
if (
  !/^athyper-qa-candidate-[0-9]{13}$/.test(project) ||
  model.instance.spec.composeProject !== project
)
  throw Error("Deployment must own isolated QA");
const overlay = join(root, "instances/qa/config/publication.compose.json");
const files = [
  join(deployment, "deploy/compose/instance/compose.yaml"),
  join(deployment, "deploy/compose/instance/compose.parity.yaml"),
  overlay,
];
const env = {
  ...process.env,
  ATHYPER_RUNTIME_ROOT: root,
  ATHYPER_DDL_SHA256: treeSha256(join(deployment, "server/db/ddl")),
  ATHYPER_RUNTIME_UID: String(process.getuid()),
  ATHYPER_RUNTIME_GID: String(process.getgid()),
  ATHYPER_INSTANCE: "qa",
  ATHYPER_DOMAIN_SUFFIX: "qa.athyper.test",
  ...Object.fromEntries(
    model.imageSet.spec.images.map(({ id, reference }) => [
      `ATHYPER_IMAGE_${id.toUpperCase().replaceAll("-", "_")}`,
      reference,
    ]),
  ),
};
execFileSync(
  "docker",
  [
    "compose",
    "--project-name",
    project,
    ...files.flatMap((f) => ["-f", f]),
    "up",
    "-d",
    "--no-deps",
    "publication-secretstore-tls",
    "api",
    "worker",
  ],
  { env, stdio: "inherit" },
);
const receipt = {
  schema: "athyper.qa-publication-deployment/1",
  project,
  sourceRevision: model.imageSet.spec.sourceRevision,
  appliedAt: new Date().toISOString(),
  files: files.map((path) => ({
    path,
    sha256: createHash("sha256").update(readFileSync(path)).digest("hex"),
  })),
  images: model.imageSet.spec.images,
  releaseQualified: false,
};
const dir = join(root, "qualification/qa-publication");
mkdirSync(dir, { recursive: true, mode: 0o700 });
writeFileSync(
  join(dir, "deployment.json"),
  JSON.stringify(receipt, null, 2) + "\n",
  { mode: 0o600 },
);
