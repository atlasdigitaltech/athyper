import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

export function sourceBinding(root = resolve(import.meta.dirname, "../../..")) {
  const paths = execFileSync(
    "git",
    [
      "ls-files",
      "-z",
      "--cached",
      "--others",
      "--exclude-standard",
      "--",
      "server",
      "packages/contracts",
      "packages/shared",
      "tooling",
      ".github/workflows/ci.yml",
      ".github/workflows/release.yml",
      "package.json",
      "pnpm-lock.yaml",
      "pnpm-workspace.yaml",
    ],
    { cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  )
    .split("\0")
    .filter(
      (path) =>
        path &&
        !path.includes("/reports/") &&
        !path.includes("/artifacts/") &&
        existsSync(resolve(root, path)),
    );
  const entries = [...new Set(paths)].sort().map((path) => ({
    path,
    sha256: createHash("sha256")
      .update(readFileSync(resolve(root, path)))
      .digest("hex"),
  }));
  return {
    fileCount: entries.length,
    sha256: createHash("sha256").update(JSON.stringify(entries)).digest("hex"),
  };
}
