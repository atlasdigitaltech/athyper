// Shared debt ratchet for authoring policies that carry historical violations.
//
// A ratchet file records how many findings each file currently has. The policy
// then fails only when a file gains findings, or when a file that had none
// acquires some. Existing debt stays fully visible in the policy's own report —
// nothing is silenced — but it can only shrink.
//
// Counts are held per file and never include line or column numbers, so
// unrelated edits above a violation do not produce false regressions. Swapping
// one violation for another within the same file is deliberately tolerated;
// the ratchet guards volume, not identity. Use it for debt a team intends to
// burn down, never for a rule that must hold exactly.
//
// A policy opts in by loading its ratchet, calling `compareToRatchet`, and
// failing on `regressions`. `improvements` are informational: they mean the
// ratchet is looser than reality and should be retightened with
// `--update-ratchet`, which is the only way a count is allowed to rise.

import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

export const RATCHET_SCHEMA_VERSION = 1;

/** Count findings per repo-relative file path. */
export function tallyByFile(files) {
  const counts = new Map();
  for (const file of files) counts.set(file, (counts.get(file) ?? 0) + 1);
  return counts;
}

export function loadRatchet(path) {
  let document;
  try {
    document = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw new Error(`Unreadable ratchet ${path}: ${error.message}`);
  }
  if (
    document.schemaVersion !== RATCHET_SCHEMA_VERSION ||
    !document.files ||
    typeof document.files !== "object"
  )
    throw new Error(
      `Ratchet ${path} must use schemaVersion ${RATCHET_SCHEMA_VERSION} with a files map`,
    );
  return document;
}

/**
 * Compare current findings against a ratchet.
 *
 * regressions  files that gained findings, or appeared with findings at all
 * improvements files that dropped below their recorded count
 * stale        files recorded in the ratchet that no longer exist or are clean
 */
export function compareToRatchet(ratchet, files) {
  const current = tallyByFile(files);
  const recorded = new Map(Object.entries(ratchet?.files ?? {}));
  const regressions = [];
  const improvements = [];
  const stale = [];
  for (const [file, count] of [...current].sort())
    if (count > (recorded.get(file) ?? 0))
      regressions.push({ file, was: recorded.get(file) ?? 0, now: count });
  for (const [file, count] of [...recorded].sort()) {
    const now = current.get(file) ?? 0;
    if (now === 0) stale.push({ file, was: count });
    else if (now < count) improvements.push({ file, was: count, now });
  }
  return {
    regressions,
    improvements,
    stale,
    total: files.length,
    recordedTotal: [...recorded.values()].reduce((sum, n) => sum + n, 0),
  };
}

export function renderRatchet(policy, files, note) {
  let commit = "unknown";
  try {
    commit = execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim();
  } catch {
    // A ratchet written outside a work tree still records its counts.
  }
  const counts = tallyByFile(files);
  return {
    schemaVersion: RATCHET_SCHEMA_VERSION,
    policy,
    capturedAtCommit: commit,
    capturedOn: new Date().toISOString().slice(0, 10),
    note,
    total: files.length,
    files: Object.fromEntries([...counts].sort(([a], [b]) => (a < b ? -1 : 1))),
  };
}

export function writeRatchet(path, document) {
  writeFileSync(path, JSON.stringify(document, null, 2) + "\n");
}

/** Format the comparison for a policy's stderr. Returns "" when clean. */
export function describeRegressions(label, comparison, updateCommand) {
  if (!comparison.regressions.length) return "";
  const lines = comparison.regressions.map(
    ({ file, was, now }) => `- ${file}: ${was} -> ${now}`,
  );
  return [
    `${label} increased in ${comparison.regressions.length} file(s):`,
    ...lines,
    "",
    "Existing debt is ratcheted and does not fail this check, but it cannot grow.",
    `Fix the new findings, or if they are genuinely unavoidable run ${updateCommand}.`,
  ].join("\n");
}

export function describeImprovements(comparison, updateCommand) {
  if (!comparison.improvements.length && !comparison.stale.length) return "";
  const cleared = comparison.stale.length;
  const reduced = comparison.improvements.length;
  return `Ratchet is loose: ${reduced} file(s) improved, ${cleared} file(s) now clean. Retighten with ${updateCommand}.`;
}
