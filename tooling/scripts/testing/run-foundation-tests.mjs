import { spawn } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../..");
const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("Provide foundation test files to run.");
  process.exit(1);
}

// Each file gets a fresh process so browser shims and compiled workspace
// modules are released before the next file starts. A file that runs past its
// time limit is a failure, not a stall: a blocked event loop (formatting a
// jsdom node for an assertion message, for one) defeats node:test's own
// per-test timeout, so the whole process group is killed from here.
const fileTimeoutMs = Number(process.env.FOUNDATION_TEST_FILE_TIMEOUT_MS ?? 300_000);

function runFile(file) {
  return new Promise((done) => {
    // Keep pnpm's executable shim: it supplies workspace NODE_PATH resolution.
    const child = spawn(
      "pnpm",
      [
        "exec",
        "tsx",
        "--tsconfig",
        "tooling/config/tsconfig-react.json",
        "--test",
        file,
      ],
      { cwd: root, stdio: "inherit", env: process.env, detached: true },
    );
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        // The group already exited.
      }
    }, fileTimeoutMs);
    child.on("error", (error) => {
      clearTimeout(timer);
      done({ error });
    });
    child.on("exit", (status, signal) => {
      clearTimeout(timer);
      done({ status, signal, timedOut });
    });
  });
}

const failures = [];
for (const file of files) {
  const result = await runFile(file);
  if (result.error || result.timedOut || result.status !== 0) {
    failures.push(file);
    console.error(
      result.error?.message ??
        (result.timedOut
          ? `${file}: no result after ${fileTimeoutMs / 1000}s; stopped`
          : `${file}: ${result.signal ?? result.status}`),
    );
  }
}
console.log(
  `Foundation files: ${files.length - failures.length} passed, ${failures.length} failed.`,
);
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
}
