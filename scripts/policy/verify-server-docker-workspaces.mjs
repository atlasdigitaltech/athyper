import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..", "..");
const dockerfilePath = resolve(repositoryRoot, "server", "Dockerfile.prod");

function normalizePath(value) {
  return value.replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/+$/, "");
}

function copySourcesBeforeInstall(dockerfileText) {
  const installCommandIndex = dockerfileText.search(/\bpnpm\s+install(?:\s|\\|$)/);
  if (installCommandIndex === -1) {
    throw new Error("server/Dockerfile.prod has no pre-build pnpm install step");
  }
  const precedingRunIndex = dockerfileText.lastIndexOf("\nRUN", installCommandIndex);
  const installIndex = precedingRunIndex === -1 ? 0 : precedingRunIndex + 1;

  const sources = [];
  const copyPattern = /^COPY\s+(?:--\S+\s+)*(.+)$/gm;
  const installSection = dockerfileText.slice(0, installIndex);

  for (const match of installSection.matchAll(copyPattern)) {
    const operands = match[1]
      .trim()
      .split(/\s+/)
      .map((operand) => operand.replace(/^["']|["']$/g, ""));

    // The final COPY operand is the destination.
    for (const source of operands.slice(0, -1)) {
      sources.push(normalizePath(source));
    }
  }

  return sources;
}

function manifestIsCopied(manifestPath, copySources) {
  const normalizedManifest = normalizePath(manifestPath);
  return copySources.some((source) =>
    source === "."
    || source === normalizedManifest
    || normalizedManifest.startsWith(`${source}/`)
  );
}

export function analyzeServerDockerWorkspaceCopies({
  dockerfileText,
  requiredManifestPaths,
  sourceExists = () => true,
}) {
  const copySources = copySourcesBeforeInstall(dockerfileText);
  const missing = requiredManifestPaths
    .map(normalizePath)
    .filter((manifestPath) => !manifestIsCopied(manifestPath, copySources))
    .sort();
  const stale = copySources
    .filter((source) => source.endsWith("package.json"))
    .filter((source) => !sourceExists(source))
    .sort();

  return { copySources, missing, stale };
}

function runtimeServerManifestClosure() {
  const pnpmArguments = [
    "--filter",
    "@athyper/runtime-server...",
    "list",
    "--depth",
    "-1",
    "--json",
  ];
  const pnpmExecutable = process.platform === "win32"
    ? (process.env.ComSpec ?? "cmd.exe")
    : "pnpm";
  const spawnArguments = process.platform === "win32"
    ? ["/d", "/s", "/c", `pnpm.cmd ${pnpmArguments.join(" ")}`]
    : pnpmArguments;
  const result = spawnSync(
    pnpmExecutable,
    spawnArguments,
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    },
  );

  if (result.status !== 0) {
    throw new Error(
      [
        "Unable to calculate the @athyper/runtime-server workspace closure.",
        result.error?.message,
        result.stderr?.trim(),
      ].filter(Boolean).join("\n"),
    );
  }

  const projects = JSON.parse(result.stdout);
  return projects.map((project) => {
    const projectPath = normalizePath(relative(repositoryRoot, project.path));
    return `${projectPath}/package.json`;
  });
}

function run() {
  const requiredManifestPaths = runtimeServerManifestClosure();
  const dockerfileText = readFileSync(dockerfilePath, "utf8");
  const analysis = analyzeServerDockerWorkspaceCopies({
    dockerfileText,
    requiredManifestPaths,
    sourceExists: (source) =>
      existsSync(resolve(repositoryRoot, ...source.split("/"))),
  });

  if (analysis.missing.length > 0) {
    console.error("Missing pre-install server workspace manifests:");
    for (const manifestPath of analysis.missing) {
      console.error(`  - ${manifestPath}`);
    }
  }

  if (analysis.stale.length > 0) {
    console.error("Stale server Dockerfile manifest COPY sources:");
    for (const source of analysis.stale) {
      console.error(`  - ${source}`);
    }
  }

  if (analysis.missing.length > 0 || analysis.stale.length > 0) {
    process.exitCode = 1;
    return;
  }

  console.log(
    `Server Docker workspace manifests are current `
    + `(${requiredManifestPaths.length} required workspaces).`,
  );
}

const invokedPath = process.argv[1]
  ? resolve(process.argv[1]).split(sep).join("/")
  : "";
const currentPath = fileURLToPath(import.meta.url).split(sep).join("/");

if (invokedPath === currentPath) {
  run();
}
