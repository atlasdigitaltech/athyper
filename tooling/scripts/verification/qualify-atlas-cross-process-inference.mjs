import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { images, save } from "./atlas-f6-common.mjs";
const config = ["local-inference", "semantic-retrieval"].map((n) =>
    JSON.parse(readFileSync("deploy/config/atlas/" + n + ".json", "utf8")),
  ),
  script = readFileSync(
    "tooling/scripts/verification/atlas-live-inference-client.mjs",
  );
const report = {
  observedAt: new Date().toISOString(),
  imagesBefore: images(),
  requests: [],
  authenticated: false,
  searchStorageStubbed: true,
};
function run(container, mode) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "docker",
      [
        "exec",
        "-i",
        container,
        "node",
        "--input-type=module",
        "-",
        JSON.stringify(config),
        mode,
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    child.stdin.end(script);
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.on("close", (code) => {
      try {
        const r = JSON.parse(out);
        report.requests.push({ ...r, container });
        if (
          code === 0 ||
          r.errorCode === "local_queue_timeout" ||
          r.errorCode === "local_queue_full" ||
          ["local_queue_timeout", "local_queue_full"].includes(
            r.terminal?.error?.code,
          )
        )
          resolve(r);
        else reject(Error("Inference failed"));
      } catch {
        reject(Error("Invalid inference receipt"));
      }
    });
  });
}
try {
  for (let i = 0; i < 3; i++) {
    const results = await Promise.allSettled([
      run("athyper-dev-api-1", "generation"),
      run("athyper-dev-worker-1", "embedding"),
    ]);
    if (results.some((r) => r.status === "rejected"))
      throw Error("Cross-process inference failed");
  }
  report.completed = report.requests.filter((r) => r.passed).length;
  report.boundedRejections = report.requests.filter((r) => !r.passed).length;
  const intervals = report.requests
    .filter((r) => r.passed)
    .map((r) => ({
      start: r.diagnostics.find((d) => d.phase === "admitted")?.observedMs,
      end: r.diagnostics.find((d) => d.phase === "completed")?.observedMs,
    }))
    .sort((a, b) => a.start - b.start);
  report.noOverlappingInference = intervals.every(
    (r, i) =>
      Number.isFinite(r.start) &&
      Number.isFinite(r.end) &&
      (i === 0 || r.start >= intervals[i - 1].end),
  );
  report.passed =
    report.noOverlappingInference &&
    ["generation", "embedding"].every((m) =>
      report.requests.some((r) => r.mode === m && r.passed),
    );
  report.qualificationScope =
    "Cross-process mutual exclusion and bounded overload, not a zero-failure availability gate";
} catch (e) {
  report.passed = false;
  report.error = e.message;
} finally {
  report.imagesAfter = images();
  report.stableDeployment =
    JSON.stringify(report.imagesBefore) === JSON.stringify(report.imagesAfter);
  report.passed = report.passed && report.stableDeployment;
  save("cross-process-inference-qualification.json", report);
  console.log(
    JSON.stringify({
      passed: report.passed,
      requests: report.requests.length,
      noOverlappingInference: report.noOverlappingInference,
    }),
  );
  if (!report.passed) process.exitCode = 1;
}
