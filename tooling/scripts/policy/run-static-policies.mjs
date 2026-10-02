import { artifactDirectory } from "../artifact-paths.mjs";
import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { capturePolicySource } from "./static-policy-source.mjs";

export function selectPolicies(document, profile, scripts) {
  const selection = document.profiles?.[profile];
  if (
    document.schemaVersion !== 1 ||
    !Array.isArray(selection) ||
    !selection.length
  )
    throw new Error(`Unknown or empty static-policy profile: ${profile}`);
  const names = [...new Set(selection)];
  for (const name of names) {
    if (
      typeof name !== "string" ||
      !/^[a-z][a-z0-9:-]+$/.test(name) ||
      !scripts[name]
    )
      throw new Error(`Missing or invalid required policy script: ${name}`);
    if (scripts[name].includes("run-static-policies.mjs"))
      throw new Error(`Recursive static-policy profile: ${name}`);
  }
  return names;
}

// Only independent, read-only checks belong here. Each command runs to completion;
// failure is recorded but does not suppress the remaining diagnostics.
export function runPolicies(
  names,
  { cwd, output, execute = spawnSync, timeout = 300_000 } = {},
) {
  if (!names.length)
    throw new Error("Required static-policy selection is empty");
  mkdirSync(output, { recursive: true });
  const results = [];
  for (const name of names) {
    const log = `${name.replaceAll(":", "-")}.log`;
    const fd = openSync(join(output, log), "w");
    const started = Date.now();
    console.log(`Checking ${name} (log: ${join(output, log)})`);
    let result;
    try {
      result = execute("pnpm", ["run", name], {
        cwd,
        stdio: ["ignore", fd, fd],
        timeout,
        killSignal: "SIGKILL",
      });
    } catch (error) {
      result = { error };
    } finally {
      closeSync(fd);
    }
    const error = result.error?.message;
    if (error) appendFileSync(join(output, log), `\n${error}\n`);
    const row = {
      name,
      command: ["pnpm", "run", name],
      status:
        result.status === 0 && !error && !result.signal ? "passed" : "failed",
      exitCode: result.status ?? null,
      signal: result.signal ?? null,
      error: error ?? null,
      durationMs: Date.now() - started,
      log,
    };
    results.push(row);
    console.log(`${row.status.toUpperCase()}: ${name}`);
  }
  const failed = results.filter((row) => row.status === "failed").length;
  const report = {
    schemaVersion: 1,
    total: results.length,
    passed: results.length - failed,
    failed,
    results,
  };
  writeFileSync(
    join(output, "results.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  const summary = `## Static policy results\n\n${report.passed}/${report.total} passed; ${failed} failed.\n\n| Policy | Result | Log |\n| --- | --- | --- |\n${results.map((r) => `| ${r.name} | ${r.status} | ${r.log} |`).join("\n")}\n`;
  writeFileSync(join(output, "summary.md"), summary);
  console.log(summary);
  return report;
}

export function main(args = process.argv.slice(2), cwd = process.cwd()) {
  if (
    ![2, 4].includes(args.length) ||
    args[0] !== "--profile" ||
    (args.length === 4 &&
      (args[2] !== "--deliverable" || !/^D(?:[1-9]|10)$/.test(args[3])))
  )
    throw new Error(
      "Usage: run-static-policies.mjs --profile <workspace|release|ci|wave1> [--deliverable D1..D10]",
    );
  const profile = args[1];
  const deliverable = args[3] ?? null;
  if (deliverable && profile !== "ci")
    throw new Error(
      "Foundation deliverables require the complete ci static-policy profile",
    );
  const document = JSON.parse(
    readFileSync(
      join(cwd, "governance/config/governance/static-policy-profiles.json"),
      "utf8",
    ),
  );
  const scripts = JSON.parse(
    readFileSync(join(cwd, "package.json"), "utf8"),
  ).scripts;
  const names = selectPolicies(document, profile, scripts);
  const output = join(
    artifactDirectory("static-policy"),
    profile,
    ...(deliverable ? [deliverable] : []),
  );
  if (existsSync(output))
    throw new Error(
      `Static-policy evidence already exists: ${output}; use a new run ID`,
    );
  mkdirSync(output, { recursive: true });
  const startedAt = new Date().toISOString();
  const before = capturePolicySource(cwd, output);
  writeFileSync(
    join(output, "source-before.json"),
    JSON.stringify(before, null, 2) + "\n",
  );
  const report = runPolicies(names, { cwd, output });
  const after = capturePolicySource(cwd);
  const stable = before.fingerprint === after.fingerprint;
  writeFileSync(
    join(output, "source.json"),
    JSON.stringify(
      {
        commit: before.commit,
        dirty: !before.clean,
        profile,
        deliverable,
        stable,
        beforeFingerprint: before.fingerprint,
        after,
      },
      null,
      2,
    ) + "\n",
  );
  writeFileSync(
    join(output, "gate.json"),
    JSON.stringify(
      {
        schemaVersion: 1,
        startedAt,
        completedAt: new Date().toISOString(),
        profile,
        deliverable,
        sourceFingerprint: before.fingerprint,
        sourceStable: stable,
        passed: report.failed === 0 && stable,
        failedPolicies: report.results
          .filter((row) => row.status === "failed")
          .map((row) => row.name),
        sourceManifest: "source-before.json",
        sourceBlobs: "source-blobs",
      },
      null,
      2,
    ) + "\n",
  );
  if (!stable) {
    appendFileSync(
      join(output, "summary.md"),
      "\nSource changed during checks; qualification failed. Rerun against a stable checkout.\n",
    );
    console.error("Source changed during checks; qualification failed.");
  }
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      readFileSync(join(output, "summary.md")),
    );
  return report.failed || !stable ? 1 : 0;
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? "")).href) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
