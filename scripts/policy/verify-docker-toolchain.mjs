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

export function nodeEngineVersion(manifestText) {
  const value = JSON.parse(manifestText).engines?.node;
  if (!/^\d+\.\d+\.\d+$/u.test(value ?? "")) {
    throw new Error(`Root engines.node must be an exact version; received: ${value}`);
  }
  return value;
}

export function analyzeNodePins({
  expectedVersion,
  expectedImage,
  nodeVersionFile,
  dockerfileEntries,
  workflowEntries,
}) {
  const mismatches = [];
  if (nodeVersionFile.trim() !== expectedVersion) {
    mismatches.push({ path: ".node-version", actual: nodeVersionFile.trim(), expected: expectedVersion });
  }

  for (const [path, text] of dockerfileEntries) {
    for (const match of text.matchAll(/^FROM\s+(node:[^\s]+)\s+/gmu)) {
      if (match[1] !== expectedImage) mismatches.push({ path, actual: match[1], expected: expectedImage });
    }
  }

  for (const [path, text] of workflowEntries) {
    for (const match of text.matchAll(/^\s*NODE_VERSION:\s*['"]?([^'"\s]+)['"]?\s*$/gmu)) {
      if (match[1] !== expectedVersion) mismatches.push({ path, actual: match[1], expected: expectedVersion });
    }
    for (const match of text.matchAll(/^\s*node-version:\s*['"]?([^'"\s]+)['"]?\s*$/gmu)) {
      if (!match[1].includes("${{") && match[1] !== expectedVersion) {
        mismatches.push({ path, actual: match[1], expected: expectedVersion });
      }
    }
  }
  return { mismatches };
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
  const manifestText = readFileSync(resolve(repositoryRoot, "package.json"), "utf8");
  const expectedVersion = packageManagerVersion(manifestText);
  const expectedNodeVersion = nodeEngineVersion(manifestText);
  const toolchain = JSON.parse(readFileSync(resolve(repositoryRoot, "tooling", "toolchain.json"), "utf8"));
  if (toolchain.nodeVersion !== expectedNodeVersion || toolchain.pnpmVersion !== expectedVersion) {
    throw new Error("tooling/toolchain.json does not match package.json authorities");
  }
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
  const workflowDirectory = resolve(repositoryRoot, ".github", "workflows");
  const workflowEntries = readdirSync(workflowDirectory)
    .filter((name) => /\.ya?ml$/u.test(name))
    .sort()
    .map((name) => [
      `.github/workflows/${name}`,
      readFileSync(resolve(workflowDirectory, name), "utf8"),
    ]);
  const nodeResult = analyzeNodePins({
    expectedVersion: expectedNodeVersion,
    expectedImage: toolchain.nodeImage,
    nodeVersionFile: readFileSync(resolve(repositoryRoot, ".node-version"), "utf8"),
    dockerfileEntries,
    workflowEntries,
  });

  for (const path of result.unpinned) {
    console.error(`${path}: pnpm@latest is not allowed`);
  }
  for (const mismatch of result.mismatches) {
    console.error(
      `${mismatch.path}: pnpm ${mismatch.actual} does not match packageManager ${mismatch.expected}`,
    );
  }
  for (const mismatch of nodeResult.mismatches) {
    console.error(`${mismatch.path}: Node ${mismatch.actual} does not match ${mismatch.expected}`);
  }
  if (result.unpinned.length || result.mismatches.length || nodeResult.mismatches.length) process.exitCode = 1;
  else {
    console.log(
      `Local, Docker, and CI toolchains match Node ${expectedNodeVersion} / pnpm ${expectedVersion} (`
        + `${dockerfileEntries.length} Dockerfiles inspected).`,
    );
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run();
}
