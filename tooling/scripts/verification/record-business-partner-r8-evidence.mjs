#!/usr/bin/env node
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  realpathSync,
  openSync,
  closeSync,
  unlinkSync,
} from "node:fs";
import { dirname, resolve, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  R8_GATES,
  containsSensitiveMaterial,
  sha256,
} from "./business-partner-r8-evidence.mjs";
import { verifyBusinessPartnerR8Qualification } from "./verify-business-partner-r8-qualification.mjs";

const root = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const manifestRelative =
  "governance/config/governance/business-partner-r8-qualification.v1.json";
export function recordR8Artifact(options) {
  const repositoryRoot = options.repositoryRoot ?? root;
  const lockPath = resolve(repositoryRoot, `${manifestRelative}.lock`);
  let lock;
  try {
    lock = openSync(lockPath, "wx");
  } catch (error) {
    if (error.code === "EEXIST")
      throw new Error(
        "R8 evidence intake is already running; review any stale lock before retrying",
      );
    throw error;
  }
  try {
    return recordR8ArtifactLocked(options);
  } finally {
    closeSync(lock);
    unlinkSync(lockPath);
  }
}
function recordR8ArtifactLocked({ bytes, repositoryRoot = root }) {
  if (bytes.length > 5 * 1024 * 1024)
    throw new Error("R8 artifact exceeds the 5 MiB sanitized JSON limit");
  let artifact;
  try {
    artifact = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error("R8 input must be a JSON artifact");
  }
  if (!R8_GATES.includes(artifact?.gate) || artifact.result !== "passed")
    throw new Error(
      "R8 input must be completed evidence for a known gate; drafts cannot be recorded",
    );
  if (containsSensitiveMaterial(artifact))
    throw new Error(
      "R8 input contains sensitive material; retain a sanitized export instead",
    );
  const manifestPath = resolve(repositoryRoot, manifestRelative),
    original = readFileSync(manifestPath, "utf8"),
    manifest = JSON.parse(original);
  const evidenceRoot = "governance/evidence/business-partner/r8";
  const digest = sha256(bytes),
    artifactPath = `${evidenceRoot}/artifacts/${digest}.json`;
  const receipt = {
    schema: "athyper.business-partner-r8-evidence-receipt/1",
    gate: artifact.gate,
    result: artifact.result,
    environment: artifact.environment,
    sanitized: true,
    targetRef: artifact.targetRef,
    sourceRevision: artifact.sourceRevision,
    startedAt: artifact.startedAt,
    completedAt: artifact.completedAt,
    contentSha256: digest,
    artifactPath,
    evidence: artifact.evidence,
  };
  const receiptBytes = Buffer.from(JSON.stringify(receipt, null, 2) + "\n");
  const receiptPath = `${evidenceRoot}/receipts/${artifact.gate}-${sha256(receiptBytes)}.json`;
  const existing = manifest.gates.find((gate) => gate.id === artifact.gate);
  if (!existing) throw new Error("R8 manifest gate is missing");
  if (existing.status === "passed" && existing.receipt !== receiptPath)
    throw new Error(
      "R8 gate already has different retained evidence; review a new qualification cycle before replacement",
    );
  const proposed = {
    ...manifest,
    gates: manifest.gates.map((gate) =>
      gate.id === artifact.gate
        ? { ...gate, status: "passed", receipt: receiptPath }
        : gate,
    ),
  };
  proposed.productionQualified = proposed.gates.every(
    (gate) => gate.status === "passed",
  );
  proposed.productionQualification = proposed.productionQualified
    ? "qualified"
    : "blocked";
  const readExisting = (path) => {
    const expectedRoot = resolve(repositoryRoot, evidenceRoot),
      actual = realpathSync(resolve(repositoryRoot, path));
    const rel = relative(expectedRoot, actual);
    if (
      !rel ||
      rel === ".." ||
      rel.startsWith(`..${sep}`) ||
      rel.startsWith(sep)
    )
      throw new Error("Evidence path escapes R8 directory");
    return readFileSync(actual);
  };
  const result = verifyBusinessPartnerR8Qualification({
    repositoryRoot,
    manifest: proposed,
    readReceipt: (path) =>
      path === receiptPath
        ? receipt
        : JSON.parse(readExisting(path).toString("utf8")),
    readArtifact: (path) =>
      path === artifactPath ? bytes : readExisting(path),
    readReceiptBytes: (path) =>
      path === receiptPath ? receiptBytes : readExisting(path),
  });
  for (const [path, content] of [
    [artifactPath, bytes],
    [receiptPath, receiptBytes],
  ]) {
    const absolute = resolve(repositoryRoot, path);
    mkdirSync(dirname(absolute), { recursive: true });
    const actualDirectory = realpathSync(dirname(absolute));
    if (actualDirectory !== dirname(absolute))
      throw new Error("Evidence output directories must not be symlinks");
    try {
      writeFileSync(absolute, content, { flag: "wx", mode: 0o644 });
    } catch (error) {
      if (error.code !== "EEXIST" || !readExisting(path).equals(content))
        throw error;
    }
  }
  if (readFileSync(manifestPath, "utf8") !== original)
    throw new Error(
      "R8 manifest changed during intake; retry after reviewing concurrent changes",
    );
  const temporary = `${manifestPath}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify(proposed, null, 2) + "\n", {
    flag: "wx",
  });
  renameSync(temporary, manifestPath);
  return { gate: artifact.gate, artifactPath, receiptPath, ...result };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const input = process.argv
      .slice(2)
      .find((value) => value.startsWith("--input="))
      ?.slice(8);
    if (!input)
      throw new Error("Pass --input=<completed-sanitized-artifact.json>");
    const result = recordR8Artifact({ bytes: readFileSync(resolve(input)) });
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
