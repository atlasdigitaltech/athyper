/** Prepare reviewable reference drafts; this command never approves or activates a release. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { artifactDirectory } from "../artifact-paths.mjs";
const args = process.argv.slice(2);
assert.ok(
  args.every(
    (arg) =>
      arg === "--confirm=DEV-PREPARE-REFERENCE-BASELINE" ||
      arg.startsWith("--output="),
  ),
  "Unknown argument",
);
const saveDrafts = args.includes("--confirm=DEV-PREPARE-REFERENCE-BASELINE");
const output = resolve(
  args.find((arg) => arg.startsWith("--output="))?.slice(9) ??
    artifactDirectory("reference-baseline-dev"),
);
mkdirSync(output, { recursive: true, mode: 0o700 });
const run = (file, args = []) =>
  JSON.parse(
    execFileSync(
      file.endsWith(".ts") ? "pnpm" : "node",
      file.endsWith(".ts") ? ["exec", "tsx", file, ...args] : [file, ...args],
      { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
    ),
  );
const save = (path, value) =>
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
// Container identity is checked by every invoked preparation command.
const heads = JSON.parse(
  execFileSync(
    "docker",
    [
      "exec",
      "-u",
      "postgres",
      "athyper-dev-db-1",
      "psql",
      "-XAt",
      "-d",
      "athyper_studio",
      "-c",
      "SELECT coalesce(jsonb_agg(jsonb_build_object('key',h.publication_key,'release',a.source_release_id)),'[]') FROM runtime_meta.release_activation_head h JOIN runtime_meta.applied_release a ON a.id=h.applied_release_id",
    ],
    { encoding: "utf8" },
  ),
);
const report = [];
for (const entity of [
  "country",
  "state_region",
  "currency",
  "language",
  "locale",
  "timezone",
]) {
  const directory = join(output, entity);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const product = `metadata/entities/${entity}`;
  const head = heads.find(
    (item) => item.key === `metadata.reference.${entity}`,
  );
  let draft, policy;
  if (head) {
    const baselinePath = join(directory, "baseline.json"),
      draftPath = join(directory, "draft.json");
    save(
      baselinePath,
      run(
        "server/db/scripts/operations/publication/capture-dev-publication-baseline.mjs",
        [`--release=${head.release}`],
      ),
    );
    const requestPath = join(directory, "request.json");
    const request = existsSync(requestPath)
      ? JSON.parse(readFileSync(requestPath, "utf8"))
      : { id: randomUUID() };
    save(requestPath, request);
    draft = run(
      "server/db/scripts/operations/publication/prepare-dev-entity-successor.ts",
      [
        `--baseline=${baselinePath}`,
        `--request=${request.id}`,
        `--choices-product=${product}`,
        `--ai-product=${product}`,
        saveDrafts ? "--confirm=DEV-PREPARE-ENTITY-SUCCESSOR" : "--check",
      ],
    );
    save(draftPath, draft);
    if (saveDrafts)
      policy = run(
        "server/db/scripts/operations/publication/prepare-dev-entity-successor-policy.ts",
        [
          `--baseline=${baselinePath}`,
          `--draft=${draftPath}`,
          `--policy-id=dev.reference.${entity}.${request.id.slice(0, 8)}`,
        ],
      );
  } else {
    draft = run(
      "server/db/scripts/operations/publication/import-dev-reference-product.ts",
      [
        `--product=${product}`,
        ...(saveDrafts ? ["--confirm=DEV-IMPORT-REFERENCE-DRAFT"] : []),
      ],
    );
    save(join(directory, "draft.json"), draft);
    if (saveDrafts) policy = draft.publicationPolicyCandidate;
  }
  if (policy) save(join(directory, "policy-candidate.json"), policy);
  report.push({
    entity,
    kind: head ? "successor" : "initial",
    saved: saveDrafts,
    changeSetId: draft.changeSet?.id,
    contractHash: draft.contractHash,
    descriptorHash: draft.descriptorHash,
    policyPrepared: !!policy,
    published: false,
  });
  console.log(JSON.stringify(report.at(-1)));
}
save(join(output, "report.json"), {
  schema: "athyper.reference-baseline-preparation/1",
  createdAt: new Date().toISOString(),
  entities: report,
  publication: "requires_independent_maker_checker",
  runtimeVerified: false,
});
