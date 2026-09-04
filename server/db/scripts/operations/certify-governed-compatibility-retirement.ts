#!/usr/bin/env tsx
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { sha256, stable } from "./governed-compatibility-approval.js";

const root = resolve(import.meta.dirname, "../../../.."),
  args = new Map(
    process.argv.slice(2).map((value) => {
      const [key, ...rest] = value.split("=");
      return [key, rest.join("=") || "true"];
    }),
  ),
  surfaceCode = args.get("--surface"),
  output = args.get("--output"),
  inside = (value: string) => {
    const path = resolve(root, value);
    if (path !== root && !path.startsWith(root + sep))
      throw new Error("path escapes repository");
    return path;
  },
  json = async (name: string) => {
    const path = args.get(name);
    if (!path) throw new Error(`${name} is required`);
    return JSON.parse(await readFile(inside(path), "utf8"));
  };
if (!surfaceCode || !output)
  throw new Error("--surface and --output are required");
const sequence = JSON.parse(
    await readFile(
      resolve(
        root,
        "config/governance/governed-lifecycle-g6-retirement-sequence.v1.json",
      ),
      "utf8",
    ),
  ),
  entry = sequence.surfaces.find(
    (value: { code: string }) => value.code === surfaceCode,
  );
if (
  !entry ||
  entry.order !== sequence.state.certifiedThroughOrder + 1 ||
  sequence.state.nextSurface !== surfaceCode
)
  throw new Error("surface certification is out of order");
const applications = await Promise.all([
    json("--production-application"),
    json("--clean-application"),
    json("--upgrade-application"),
  ]),
  targets = ["production", "clean", "supported_upgrade"];
for (let index = 0; index < applications.length; index++) {
  const value = applications[index],
    hash = value.receiptHash,
    { receiptHash: _, ...unsigned } = value;
  if (
    value.kind !== "athyper.g6-surface-retirement-application" ||
    value.surfaceCode !== surfaceCode ||
    value.target !== targets[index] ||
    value.result !== "passed" ||
    hash !== sha256(stable(unsigned))
  )
    throw new Error(
      `${targets[index]} retirement application receipt is invalid`,
    );
}
const migrationHashes = new Set(
    applications.map((value) => value.migration.sha256),
  ),
  packetHashes = new Set(applications.map((value) => value.approvalPacketHash));
if (migrationHashes.size !== 1 || packetHashes.size !== 1)
  throw new Error(
    "retirement targets used different migration or approval packets",
  );
const probes = await json("--probe-evidence"),
  required = sequence.requiredPostMigrationProbes as string[];
if (
  probes.kind !== "athyper.g6-post-retirement-behavioral-probes" ||
  probes.surfaceCode !== surfaceCode ||
  probes.migrationSha256 !== applications[0].migration.sha256 ||
  !required.every((code) =>
    probes.results?.some(
      (value: { code: string; passed: boolean }) =>
        value.code === code && value.passed,
    ),
  )
)
  throw new Error(
    "negative/replay/tenant/audit/privilege evidence is incomplete",
  );
const cleanPost = await json("--clean-post"),
  upgradePost = await json("--upgrade-post");
if (
  cleanPost.kind !== "athyper.g6-compatibility-parity-capture" ||
  upgradePost.kind !== cleanPost.kind ||
  cleanPost.phase !== "post_retirement" ||
  upgradePost.phase !== "post_retirement" ||
  cleanPost.environment !== "clean" ||
  upgradePost.environment !== "supported_upgrade" ||
  cleanPost.catalogHash !== upgradePost.catalogHash ||
  cleanPost.privilegeHash !== upgradePost.privilegeHash ||
  JSON.stringify(cleanPost.catalog) !== JSON.stringify(upgradePost.catalog) ||
  JSON.stringify(cleanPost.privileges) !==
    JSON.stringify(upgradePost.privileges)
)
  throw new Error(
    "post-retirement clean/supported-upgrade catalog or privilege parity differs",
  );
if (
  args.get("--confirm") !==
  `CERTIFY-G6-RETIREMENT:${surfaceCode}:${applications[0].migration.sha256}`
)
  throw new Error(
    "exact surface/migration certification confirmation is required",
  );
const evidence = [
    ...applications,
    {
      ...probes,
      sourceSha256: sha256(
        await readFile(inside(args.get("--probe-evidence")!)),
      ),
    },
    {
      ...cleanPost,
      sourceSha256: sha256(await readFile(inside(args.get("--clean-post")!))),
    },
    {
      ...upgradePost,
      sourceSha256: sha256(await readFile(inside(args.get("--upgrade-post")!))),
    },
  ],
  report = {
    schemaVersion: 1,
    kind: "athyper.g6-surface-retirement-certification",
    surfaceCode,
    order: entry.order,
    certifiedAt: new Date().toISOString(),
    approvalPacketHash: applications[0].approvalPacketHash,
    migrationSha256: applications[0].migration.sha256,
    postRetirementParity: {
      catalogHash: cleanPost.catalogHash,
      privilegeHash: cleanPost.privilegeHash,
    },
    abortRequired: false,
    forwardFixRequired: false,
    evidenceHashes: evidence.map((value) => sha256(stable(value))),
    result: "certified",
  },
  certificationHash = sha256(stable(report)),
  document = { ...report, certificationHash };
const destination = inside(output);
if (
  !destination.startsWith(
    resolve(root, "docs/architecture/reports/g6/retirements") + sep,
  )
)
  throw new Error(
    "certification must be under docs/architecture/reports/g6/retirements",
  );
await mkdir(dirname(destination), { recursive: true });
await writeFile(destination, `${JSON.stringify(document, null, 2)}\n`, {
  flag: "wx",
  mode: 0o600,
});
process.stdout.write(
  `G6_SURFACE_RETIREMENT_CERTIFIED surface=${surfaceCode} certificationHash=${certificationHash}\n`,
);
