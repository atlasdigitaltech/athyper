#!/usr/bin/env tsx
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import {
  approvalRoles,
  attestationTemplate,
  sha256,
  stable,
  unsignedAttestation,
  validateApprovalPacket,
  type ApprovalPacket,
  type Attestation,
  type EvidenceRef,
} from "./governed-compatibility-approval.js";

const root = resolve(import.meta.dirname, "../../../.."),
  args = new Map(
    process.argv.slice(2).map((value) => {
      const [key, ...rest] = value.split("=");
      return [key, rest.join("=") || "true"];
    }),
  );
const mode = args.get("--mode"),
  surfaceCode = args.get("--surface"),
  output = args.get("--output");
const inside = (value: string) => {
  const path = resolve(root, value);
  if (path !== root && !path.startsWith(root + sep))
    throw new Error("path escapes repository");
  return path;
};
const readJson = async (path: string) =>
  JSON.parse(await readFile(inside(path), "utf8"));
const artifact = async (
  code: string,
  kind: string,
  path: string,
  subjectEvidenceHash?: string,
): Promise<EvidenceRef> => ({
  code,
  kind,
  source: path,
  sha256: sha256(await readFile(inside(path))),
  ...(subjectEvidenceHash ? { subjectEvidenceHash } : {}),
});
const writeExclusive = async (path: string, value: unknown) => {
  const target = inside(path);
  if (
    !target.startsWith(
      resolve(root, "docs/architecture/reports/g6/approvals") + sep,
    )
  )
    throw new Error(
      "approval output must be under docs/architecture/reports/g6/approvals",
    );
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, {
    flag: "wx",
    mode: 0o600,
  });
};
if (!mode || !surfaceCode || !output)
  throw new Error(
    "--mode=prepare|canonicalize|assemble, --surface and --output are required",
  );

if (mode === "prepare") {
  if (args.get("--confirm") !== "PREPARE-G6-APPROVAL-PACKET")
    throw new Error("prepare requires --confirm=PREPARE-G6-APPROVAL-PACKET");
  const required = [
    "--consumer-inventory",
    "--observation-ledger",
    "--recovery-report",
    "--clean-pre",
    "--upgrade-pre",
  ] as const;
  for (const key of required)
    if (!args.get(key)) throw new Error(`${key} is required`);
  const registerPath =
      "config/governance/governed-lifecycle-g6-retirement.v1.json",
    sequence = await readJson(
      "config/governance/governed-lifecycle-g6-retirement-sequence.v1.json",
    ),
    sequenceEntry = sequence.surfaces?.find(
      (value: { code: string }) => value.code === surfaceCode,
    ),
    migrationPath = sequenceEntry?.migration,
    register = await readJson(registerPath),
    surface = register.surfaces?.find(
      (value: { code: string }) => value.code === surfaceCode,
    );
  if (!surface || !migrationPath)
    throw new Error("surface is not registered in the retirement sequence");
  const consumerPath = args.get("--consumer-inventory")!,
    observationPath = args.get("--observation-ledger")!,
    recoveryPath = args.get("--recovery-report")!,
    cleanPath = args.get("--clean-pre")!,
    upgradePath = args.get("--upgrade-pre")!;
  const consumerBytes = await readFile(inside(consumerPath)),
    consumer = JSON.parse(consumerBytes.toString("utf8")),
    usage = consumer.results?.find(
      (value: { surfaceCode: string }) => value.surfaceCode === surfaceCode,
    );
  if (
    consumer.kind !== "athyper.g6-compatibility-consumer-inventory" ||
    usage?.activeConsumerFileCount !== 0
  )
    throw new Error("consumer cutover evidence is absent or non-zero");
  const ledger = await readJson(observationPath),
    observations =
      ledger.observations?.filter(
        (value: { surfaceCode: string }) => value.surfaceCode === surfaceCode,
      ) ?? [],
    observation = observations
      .sort(
        (a: { windowEnd: string }, b: { windowEnd: string }) =>
          Date.parse(a.windowEnd) - Date.parse(b.windowEnd),
      )
      .at(-1);
  if (
    !observation ||
    observation.environment !== "production" ||
    observation.productionUsageCount !== 0 ||
    observation.consecutiveZeroUsageDays <
      register.minimumConsecutiveZeroUsageDays ||
    !observation.evidenceHash
  )
    throw new Error("qualifying production zero-use observation is absent");
  if (
    observation.evidence?.kind !==
      "athyper.g6-production-compatibility-observation-evidence" ||
    observation.evidenceHash !== sha256(stable(observation.evidence)) ||
    observation.evidence.sources?.consumerInventory?.sha256 !==
      sha256(consumerBytes)
  )
    throw new Error(
      "production observation evidence or consumer-inventory binding is invalid",
    );
  const recovery = await readJson(recoveryPath);
  if (
    recovery.surfaceCode !== surfaceCode ||
    recovery.result !== "passed" ||
    recovery.transactionDisposition !== "forced_rollback" ||
    !recovery.migrationSha256
  )
    throw new Error("successful rollback rehearsal evidence is absent");
  const migrationHash = sha256(await readFile(inside(migrationPath)));
  if (recovery.migrationSha256 !== migrationHash)
    throw new Error("recovery report and retirement candidate hashes differ");
  const clean = await readJson(cleanPath),
    upgrade = await readJson(upgradePath);
  if (
    clean.kind !== "athyper.g6-compatibility-parity-capture" ||
    upgrade.kind !== clean.kind ||
    clean.phase !== "pre_retirement" ||
    upgrade.phase !== "pre_retirement" ||
    clean.environment !== "clean" ||
    upgrade.environment !== "supported_upgrade" ||
    clean.catalogHash !== upgrade.catalogHash ||
    clean.privilegeHash !== upgrade.privilegeHash ||
    JSON.stringify(clean.catalog) !== JSON.stringify(upgrade.catalog) ||
    JSON.stringify(clean.privileges) !== JSON.stringify(upgrade.privileges)
  )
    throw new Error(
      "clean/supported-upgrade immediate pre-retirement parity is absent",
    );
  const evidence: EvidenceRef[] = [
    await artifact("retirement_register", "governance_contract", registerPath),
    await artifact("consumer_inventory", "consumer_cutover", consumerPath),
    {
      code: "production_observation",
      kind: "production_zero_use",
      source: observationPath,
      sha256: sha256(stable(observation)),
      subjectEvidenceHash: observation.evidenceHash,
    },
    await artifact(
      "recovery_rehearsal",
      "rollback_reconstruction",
      recoveryPath,
    ),
    await artifact("retirement_candidate", "migration", migrationPath),
    await artifact(
      "clean_pre_retirement",
      "catalog_privilege_parity",
      cleanPath,
    ),
    await artifact(
      "supported_upgrade_pre_retirement",
      "catalog_privilege_parity",
      upgradePath,
    ),
  ];
  const evidenceBundleHash = sha256(stable(evidence)),
    draft = {
      schemaVersion: 1,
      kind: "athyper.g6-compatibility-retirement-approval-draft",
      surfaceCode,
      owner: surface.owner,
      createdAt: new Date().toISOString(),
      evidenceBundleHash,
      evidence,
      status: "awaiting_three_independent_attestations",
      attestationTemplates: Object.fromEntries(
        approvalRoles.map((role) => [
          role,
          attestationTemplate(
            surfaceCode,
            role,
            evidenceBundleHash,
            evidence.map((value) => value.sha256).sort(),
          ),
        ]),
      ),
    };
  await writeExclusive(output, draft);
  process.stdout.write(
    `G6_APPROVAL_DRAFT_PREPARED surface=${surfaceCode} evidenceBundleHash=${evidenceBundleHash}\n`,
  );
} else if (mode === "canonicalize") {
  if (args.get("--confirm") !== "CANONICALIZE-G6-ATTESTATION")
    throw new Error(
      "canonicalize requires --confirm=CANONICALIZE-G6-ATTESTATION",
    );
  const path = args.get("--attestation");
  if (!path) throw new Error("--attestation is required");
  const attestation = (await readJson(path)) as Attestation;
  if (
    attestation.surfaceCode !== surfaceCode ||
    !approvalRoles.includes(attestation.role)
  )
    throw new Error("attestation surface or role is invalid");
  const payload = stable(unsignedAttestation(attestation)),
    target = inside(output);
  if (
    !target.startsWith(
      resolve(root, "docs/architecture/reports/g6/approvals") + sep,
    )
  )
    throw new Error(
      "canonical payload must be under the G6 approval directory",
    );
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, payload, { flag: "wx", mode: 0o600 });
  process.stdout.write(
    `G6_ATTESTATION_CANONICALIZED surface=${surfaceCode} role=${attestation.role} attestationHash=${sha256(payload)}\n`,
  );
} else if (mode === "assemble") {
  if (args.get("--confirm") !== "ASSEMBLE-G6-APPROVAL-PACKET")
    throw new Error("assemble requires --confirm=ASSEMBLE-G6-APPROVAL-PACKET");
  const draftPath = args.get("--draft");
  if (!draftPath) throw new Error("--draft is required");
  const draft = await readJson(draftPath);
  if (
    draft.kind !== "athyper.g6-compatibility-retirement-approval-draft" ||
    draft.surfaceCode !== surfaceCode ||
    draft.evidenceBundleHash !== sha256(stable(draft.evidence))
  )
    throw new Error("approval draft is invalid or changed");
  const attestations: Attestation[] = [];
  for (const role of approvalRoles) {
    const path = args.get(`--${role}-attestation`);
    if (!path) throw new Error(`--${role}-attestation is required`);
    attestations.push(await readJson(path));
  }
  const packet: ApprovalPacket = {
    schemaVersion: 1,
    kind: "athyper.g6-compatibility-retirement-approval-packet",
    surfaceCode,
    owner: draft.owner,
    createdAt: new Date().toISOString(),
    evidenceBundleHash: draft.evidenceBundleHash,
    evidence: draft.evidence,
    attestations,
    status: "approved",
  };
  packet.packetHash = sha256(stable(packet));
  const errors = validateApprovalPacket(packet, surfaceCode);
  if (errors.length) throw new Error(errors.join("; "));
  await writeExclusive(output, packet);
  process.stdout.write(
    `G6_APPROVAL_PACKET_ASSEMBLED surface=${surfaceCode} packetHash=${packet.packetHash}\n`,
  );
} else throw new Error("--mode must be prepare, canonicalize or assemble");
