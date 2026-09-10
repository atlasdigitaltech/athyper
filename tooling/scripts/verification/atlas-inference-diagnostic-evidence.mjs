import { spawnSync } from "node:child_process";
/** Extract only the inference diagnostic allowlist; never emit other application logs. */
export function inferenceDiagnosticEvidence(
  since,
  until = new Date().toISOString(),
) {
  const r = spawnSync(
    "docker",
    ["logs", "--since", since, "--until", until, "athyper-dev-api-1"],
    { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  );
  if (r.status !== 0)
    throw new Error("Inference diagnostic log collection failed");
  const fields = [
    "workload",
    "phase",
    "model",
    "modelDigest",
    "runId",
    "providerCallId",
    "operationId",
    "attempt",
    "queueWaitMs",
    "loadDurationMs",
    "elapsedMs",
    "code",
  ];
  const events = (r.stdout + "\n" + r.stderr).split("\n").flatMap((line) => {
    const start = line.indexOf('{"event":"atlas.inference.diagnostic"');
    if (start < 0) return [];
    try {
      const value = JSON.parse(line.slice(start));
      return [
        Object.fromEntries(
          fields
            .filter((k) => value[k] !== undefined)
            .map((k) => [k, value[k]]),
        ),
      ];
    } catch {
      return [];
    }
  });
  const active = new Set();
  let peak = 0;
  for (const e of events) {
    const id = e.providerCallId ?? e.operationId;
    if (!id) continue;
    if (e.phase === "admitted") {
      active.add(id);
      peak = Math.max(peak, active.size);
    } else if (e.phase === "released") active.delete(id);
  }
  return {
    observedUntil: until,
    events,
    peakAdmitted: peak,
    unreleasedAtEnd: active.size,
    scope:
      "API process diagnostics in the assessment interval; generation is correlated by provider call, embeddings by operation ID.",
  };
}
