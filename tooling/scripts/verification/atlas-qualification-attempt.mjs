import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";

/** Local evidence only; this does not attest independent benchmark custody. */
export function startAtlasQualificationAttempt(
  output,
  { entityCode, plane, recordId },
) {
  const directory = resolve(output);
  mkdirSync(dirname(directory), { recursive: true, mode: 0o700 });
  // Claim the leaf exclusively, including when a previous process crashed.
  mkdirSync(directory, { mode: 0o700 });
  const attempt = Object.freeze({
    schema: "atlas-runtime-qualification-attempt/1",
    attemptId: randomUUID(),
    startedAt: new Date().toISOString(),
    qualification: "implementation-diagnostic",
    entityCode,
    plane,
    recordId,
  });
  writeFileSync(
    resolve(directory, "attempt-started.json"),
    JSON.stringify(attempt, null, 2) + "\n",
    {
      flag: "wx",
      mode: 0o600,
    },
  );
  return attempt;
}

export function finishAtlasQualificationAttempt(
  output,
  filename,
  attempt,
  report,
) {
  if (!["browser.json", "report.json"].includes(filename))
    throw new TypeError("Unsupported Atlas qualification report");
  writeFileSync(
    resolve(output, filename),
    JSON.stringify(
      {
        ...report,
        attempt,
        finishedAt: new Date().toISOString(),
        status: report.passed === true ? "passed" : "failed",
      },
      null,
      2,
    ) + "\n",
    { flag: "wx", mode: 0o600 },
  );
}
