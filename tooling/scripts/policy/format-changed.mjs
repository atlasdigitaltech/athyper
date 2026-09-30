import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import * as prettier from "prettier";

export function changedPaths({ cwd, base, event, ci = false } = {}) {
  const git = (args) => execFileSync("git", args, { cwd, encoding: "utf8" });
  let reference = base;
  if (!reference && event?.pull_request?.base?.sha)
    reference = git(["merge-base", event.pull_request.base.sha, "HEAD"]).trim();
  if (!reference && event?.before && !/^0+$/.test(event.before))
    reference = event.before;
  if (!reference && ci) {
    const branch = event?.repository?.default_branch;
    if (!branch)
      throw new Error(
        "Changed-file formatting requires a PR base, push before SHA, or explicit --base in CI",
      );
    reference = git(["merge-base", `origin/${branch}`, "HEAD"]).trim();
    if (reference === git(["rev-parse", "HEAD"]).trim())
      throw new Error(
        "No prior change baseline available; supply --base explicitly",
      );
  }
  reference ??= "HEAD";
  // Resolve to an immutable commit before passing it to diff. Missing history fails.
  const commit = git([
    "rev-parse",
    "--verify",
    "--end-of-options",
    `${reference}^{commit}`,
  ]).trim();
  const tracked = git([
    "diff",
    "--name-only",
    "-z",
    "--diff-filter=ACMR",
    commit,
    "--",
  ]);
  const untracked = git(["ls-files", "--others", "--exclude-standard", "-z"]);
  return {
    base: commit,
    paths: [
      ...new Set((tracked + untracked).split("\0").filter(Boolean)),
    ].sort(),
  };
}

export async function formatPaths(paths, { cwd, write = false } = {}) {
  const report = {
    selected: paths.length,
    checked: [],
    ignored: [],
    unsupported: [],
    failed: [],
  };
  for (const name of paths) {
    const file = join(cwd, name);
    if (!existsSync(file) || !lstatSync(file).isFile()) {
      report.unsupported.push(name);
      continue;
    }
    try {
      const info = await prettier.getFileInfo(file, {
        ignorePath: join(cwd, ".prettierignore"),
      });
      if (info.ignored) {
        report.ignored.push(name);
        continue;
      }
      if (!info.inferredParser) {
        report.unsupported.push(name);
        continue;
      }
      const config = (await prettier.resolveConfig(file)) ?? {};
      const source = readFileSync(file, "utf8");
      const formatted = await prettier.format(source, {
        ...config,
        filepath: file,
      });
      report.checked.push(name);
      if (formatted !== source) {
        if (write) {
          if (readFileSync(file, "utf8") !== source)
            throw new Error(
              "File changed during formatting; retry without overwriting concurrent edits",
            );
          writeFileSync(file, formatted);
        } else
          report.failed.push({
            file: name,
            error: "Formatting differs; run pnpm format:changed",
          });
      }
    } catch (error) {
      report.failed.push({ file: name, error: error.message });
    }
  }
  return report;
}

export async function main(args = process.argv.slice(2), cwd = process.cwd()) {
  let write = false,
    base = process.env.FORMAT_BASE_REF || undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--write") write = true;
    else if (args[i] === "--check") write = false;
    else if (args[i] === "--base" && args[i + 1]) base = args[++i];
    else
      throw new Error(`Unknown or incomplete formatting argument: ${args[i]}`);
  }
  const event = process.env.GITHUB_EVENT_PATH
    ? JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"))
    : undefined;
  const selection = changedPaths({
    cwd,
    base,
    event,
    ci: process.env.GITHUB_ACTIONS === "true",
  });
  const report = await formatPaths(selection.paths, { cwd, write });
  console.log(
    `Formatting base: ${selection.base}; ${report.selected} changed files, ${report.checked.length} checked, ${report.ignored.length} ignored, ${report.unsupported.length} unsupported.`,
  );
  for (const failure of report.failed)
    console.error(`${failure.file}: ${failure.error}`);
  if (!report.checked.length)
    console.log(
      "No changed, supported, non-ignored files require formatting (not a test-suite coverage claim).",
    );
  return report.failed.length ? 1 : 0;
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? "")).href) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
