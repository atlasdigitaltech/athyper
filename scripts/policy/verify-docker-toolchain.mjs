import { readFileSync, readdirSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));

function dockerfiles(directory, results = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if ([".git", "node_modules", ".pnpm-store"].includes(entry.name)) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) dockerfiles(path, results);
    else if (/^Dockerfile(?:[.].+)?$/.test(entry.name)) results.push(path);
  }
  return results;
}

export function packageManagerVersion(manifestText) {
  const value = JSON.parse(manifestText).packageManager;
  const match = /^pnpm@([^+]+)(?:[+].+)?$/.exec(value ?? "");
  if (!match) throw new Error(`Unsupported root packageManager value: ${value}`);
  return match[1];
}

export function analyzeDockerPnpmVersions({
  expectedVersion,
  dockerfileEntries,
  workflowText,
}) {
  const mismatches = [];
  const unpinned = [];

  for (const [path, text] of dockerfileEntries) {
    const matches = [...text.matchAll(/corepack prepare pnpm@([^\s]+) --activate/g)];
    if (matches.length === 0) continue;
    for (const match of matches) {
      if (match[1] === "latest") unpinned.push(path);
      else if (match[1] !== expectedVersion) {
        mismatches.push({ path, actual: match[1], expected: expectedVersion });
      }
    }
  }

  const workflowMatch = /^\s*PNPM_VERSION:\s*['"]?([^'"\s]+)['"]?\s*$/m.exec(workflowText);
  if (!workflowMatch) {
    mismatches.push({
      path: ".github/workflows/ci.yml",
      actual: "(missing PNPM_VERSION)",
      expected: expectedVersion,
    });
  } else if (workflowMatch[1] !== expectedVersion) {
    mismatches.push({
      path: ".github/workflows/ci.yml",
      actual: workflowMatch[1],
      expected: expectedVersion,
    });
  }

  return { mismatches, unpinned };
}

function run() {
  const expectedVersion = packageManagerVersion(
    readFileSync(resolve(repositoryRoot, "package.json"), "utf8"),
  );
  const dockerfileEntries = dockerfiles(repositoryRoot).map((path) => [
    relative(repositoryRoot, path).replaceAll("\\", "/"),
    readFileSync(path, "utf8"),
  ]);
  const workflowText = readFileSync(
    resolve(repositoryRoot, ".github", "workflows", "ci.yml"),
    "utf8",
  );
  const result = analyzeDockerPnpmVersions({
    expectedVersion,
    dockerfileEntries,
    workflowText,
  });

  for (const path of result.unpinned) {
    console.error(`${path}: pnpm@latest is not allowed`);
  }
  for (const mismatch of result.mismatches) {
    console.error(
      `${mismatch.path}: pnpm ${mismatch.actual} does not match packageManager ${mismatch.expected}`,
    );
  }
  if (result.unpinned.length || result.mismatches.length) process.exitCode = 1;
  else {
    console.log(
      `Docker and CI pnpm pins match packageManager (${expectedVersion}; `
        + `${dockerfileEntries.length} Dockerfiles inspected).`,
    );
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run();
}
