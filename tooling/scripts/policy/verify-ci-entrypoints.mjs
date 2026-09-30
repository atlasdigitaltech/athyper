import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, globSync } from "node:fs";
import { join, matchesGlob, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parse } from "yaml";

const root = resolve(import.meta.dirname, "../../..");
const builtins = new Set(["install", "list", "fetch", "turbo"]);
const dynamic = (value) => /\$|`/.test(value);
// Deliberately bounded shell inspection: quoted words, command separators and
// heredocs. Unknown dynamic executable coordinates fail instead of disappearing.
export function commands(source) {
  const result = [];
  let heredoc;
  for (const line of source.replace(/\\\r?\n/g, " ").split(/\r?\n/)) {
    if (heredoc) {
      if (line.trim() === heredoc) heredoc = undefined;
      continue;
    }
    if (/^\s*#/.test(line)) continue;
    const words =
      line.match(
        /'[^']*'|"(?:\\.|[^"\\])*"|\$\{\{.*?\}\}|&&|\|\||[;|]|[^\s;|]+/g,
      ) ?? [];
    let command = [];
    for (const word of words) {
      if (["&&", "||", ";", "|"].includes(word)) {
        if (command.length) result.push(command);
        command = [];
      } else command.push(word.replace(/^(['"])(.*)\1$/, "$2"));
    }
    if (command.length) result.push(command);
    heredoc = line.match(/<<-?\s*['"]?([A-Za-z_][\w]*)['"]?/)?.[1];
  }
  return result;
}

export function verifyCommand(
  words,
  {
    packages,
    cwd,
    exists = existsSync,
    manifest = (path) =>
      JSON.parse(readFileSync(join(path, "package.json"), "utf8")),
  },
) {
  const errors = [];
  const index = words.findIndex((word) =>
    ["pnpm", "node", "npx", "tsx"].includes(word),
  );
  if (
    index < 0 ||
    words.slice(0, index).some((word) => !/^[A-Za-z_][\w]*=/.test(word))
  )
    return errors;
  const executable = words[index];
  const args = words.slice(index + 1);
  let selected = [{ path: cwd, ...manifest(cwd) }];
  let filter;
  if (executable === "pnpm") {
    while (args[0]?.startsWith("-")) {
      const option = args.shift();
      if (option === "--filter" || option.startsWith("--filter=")) {
        if (filter) errors.push("multiple filters require a validated wrapper");
        filter = option === "--filter" ? args.shift() : option.slice(9);
        if (!filter || dynamic(filter))
          return [
            "dynamic or missing package filter requires an explicit wrapper with runtime validation",
          ];
        const pattern = filter.replace(/^\.\.\./, "").replace(/\.\.\.$/, "");
        if (pattern.startsWith("!"))
          return [
            "negative-only package filters are not supported for required checks",
          ];
        selected = packages.filter((pkg) => matchesGlob(pkg.name, pattern));
        if (!selected.length)
          errors.push(`package filter matches no workspace: ${filter}`);
      } else if (option === "--dir" || option === "-C") {
        const directory = args.shift();
        if (!directory || dynamic(directory))
          return ["dynamic working directory requires a validated wrapper"];
        cwd = resolve(cwd, directory);
        if (!exists(join(cwd, "package.json")))
          return [`missing package manifest: ${cwd}`];
        selected = [{ path: cwd, ...manifest(cwd) }];
      } else if (option === "--if-present")
        errors.push("--if-present may silently skip a required check");
      else if (!["--fail-if-no-match", "-r", "--recursive"].includes(option))
        errors.push(`unhandled pnpm option: ${option}`);
    }
    if (filter && !words.includes("--fail-if-no-match"))
      errors.push("filtered command must use --fail-if-no-match");
    const action = args.shift();
    if (action === "exec") {
      for (const pkg of selected)
        errors.push(...verifyExecutable(args, pkg.path, exists));
    } else if (action === "changeset") {
      if (
        !selected.every(
          (pkg) =>
            pkg.devDependencies?.["@changesets/cli"] ||
            pkg.dependencies?.["@changesets/cli"],
        )
      )
        errors.push("changeset CLI is not declared");
    } else if (!builtins.has(action)) {
      const script = action === "run" ? args.shift() : action;
      if (!script || dynamic(script))
        errors.push(
          "dynamic or missing script name requires a validated wrapper",
        );
      else
        for (const pkg of selected)
          if (!pkg.scripts?.[script])
            errors.push(`${pkg.name}: missing script ${script}`);
    }
  } else
    errors.push(
      ...verifyExecutable(
        executable === "npx" ? args : [executable, ...args],
        cwd,
        exists,
      ),
    );
  return errors;
}

function verifyExecutable(args, cwd, exists) {
  if (!["node", "tsx", "vitest"].includes(args[0])) return [];
  if (args.includes("-e") || args.includes("--eval")) return []; // Inline source has no file coordinate.
  const paths = args
    .slice(1)
    .filter(
      (value) =>
        /\.(?:[cm]?[jt]sx?)$/.test(value) ||
        (!value.startsWith("-") && dynamic(value)),
    );
  const errors = [];
  for (const path of paths) {
    if (dynamic(path))
      errors.push(
        `dynamic executable path requires a validated wrapper: ${path}`,
      );
    else if (/[*?]/.test(path)) {
      if (![...globSync(path, { cwd })].length)
        errors.push(`empty executable glob: ${path}`);
    } else if (!exists(resolve(cwd, path)))
      errors.push(`missing executable path: ${resolve(cwd, path)}`);
  }
  return errors;
}

export function verifyWorkflow(source, options) {
  const document = parse(source);
  const errors = [];
  if (!document?.jobs || !Object.keys(document.jobs).length)
    return ["workflow has no jobs"];
  for (const id of options.requiredJobs ?? [])
    if (!document.jobs[id]) errors.push(`required job missing: ${id}`);
  for (const [id, job] of Object.entries(document.jobs ?? {})) {
    for (const step of job.steps ?? []) {
      if (!step.run) continue;
      const directory =
        step["working-directory"] ??
        job.defaults?.run?.["working-directory"] ??
        document.defaults?.run?.["working-directory"] ??
        ".";
      if (dynamic(directory)) {
        errors.push(`${id}/${step.name}: dynamic working directory`);
        continue;
      }
      for (const command of commands(step.run))
        for (const error of verifyCommand(command, {
          ...options,
          cwd: resolve(options.cwd, directory),
        }))
          errors.push(`${id}/${step.name ?? "run"}: ${error}`);
    }
  }
  return errors;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const packages = JSON.parse(
    execFileSync("pnpm", ["list", "-r", "--depth", "-1", "--json"], {
      cwd: root,
      encoding: "utf8",
    }),
  ).map((pkg) => ({
    ...pkg,
    ...JSON.parse(readFileSync(join(pkg.path, "package.json"), "utf8")),
  }));
  const errors = ["ci.yml", "release.yml"].flatMap((file) =>
    verifyWorkflow(
      readFileSync(join(root, ".github/workflows", file), "utf8"),
      {
        packages,
        cwd: root,
        requiredJobs:
          file === "ci.yml"
            ? [
                "quality",
                "build",
                "rls-verify",
                "three-plane-verify",
                "ci-success",
                "iam-live",
              ]
            : ["build"],
      },
    ).map((error) => `${file}: ${error}`),
  );
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
  } else
    console.log(
      "CI entrypoints verified: literal package filters, scripts and executable file paths (ci.yml, release.yml).",
    );
}
