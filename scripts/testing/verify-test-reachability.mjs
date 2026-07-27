import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..", "..");
const reportPath = resolve(root, "policy/reports/test-reachability-retirement.json");
const writeReport = process.argv.includes("--write");
const checkReport = process.argv.includes("--check") || !writeReport;
const TEST_FILE = /\.test\.(?:ts|tsx|mjs)$/;
const SKIPPED_DIRECTORIES = new Set([
  ".git",
  ".next",
  ".turbo",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
]);
const ROOT_RUNNERS = [
  {
    directory: "tests/contracts",
    runner: "test:plane-contracts",
    commandFragment: "tests/contracts/",
  },
  {
    directory: "scripts/policy",
    runner: "test:policy",
    commandFragment: "scripts/policy/",
  },
  {
    directory: "scripts/performance",
    runner: "test:performance-guards",
    commandFragment: "scripts/performance/",
  },
];

const normalize = (value) => value.replaceAll("\\", "/");
const relativePath = (value) => normalize(relative(root, value));
const toDirectoryKey = (value) => normalize(resolve(value)).replace(/\/$/, "").toLowerCase();

function discoverTestFiles(directory) {
  const entries = readdirSync(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...discoverTestFiles(path));
    else if (entry.isFile() && TEST_FILE.test(entry.name)) files.push(path);
  }

  return files;
}

function activeWorkspaceDirectories() {
  const command = process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : "pnpm";
  const args = process.platform === "win32"
    ? ["/d", "/s", "/c", "pnpm.cmd list -r --depth -1 --parseable"]
    : ["list", "-r", "--depth", "-1", "--parseable"];
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", shell: false });

  if (result.status !== 0) {
    throw new Error(`Unable to enumerate pnpm workspaces: ${result.stderr || result.stdout}`);
  }

  return new Set(
    result.stdout
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter(Boolean)
      .map(toDirectoryKey),
  );
}

const manifestCache = new Map();
function manifestAt(directory) {
  const manifestPath = join(directory, "package.json");
  if (!existsSync(manifestPath)) return null;
  if (!manifestCache.has(manifestPath)) {
    manifestCache.set(manifestPath, JSON.parse(readFileSync(manifestPath, "utf8")));
  }
  return manifestCache.get(manifestPath);
}

function nearestPackageDirectory(file) {
  let directory = dirname(file);
  while (directory.startsWith(root)) {
    if (manifestAt(directory)) return directory;
    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  return null;
}

function rootRunnerFor(path) {
  return ROOT_RUNNERS.find(({ directory }) => path === directory || path.startsWith(`${directory}/`))?.runner ?? null;
}

const rootManifest = manifestAt(root);
const activeDirectories = activeWorkspaceDirectories();
const errors = [];
const rootTests = [];
const inactiveByPackage = new Map();

for (const file of discoverTestFiles(root).sort((left, right) => left.localeCompare(right))) {
  const packageDirectory = nearestPackageDirectory(file);
  const path = relativePath(file);

  if (!packageDirectory) {
    errors.push(`${path}: could not find an owning package.json`);
    continue;
  }

  if (packageDirectory === root) {
    const runner = rootRunnerFor(path);
    if (!runner) {
      errors.push(`${path}: root-owned tests must live under tests/contracts, scripts/policy, or scripts/performance`);
      continue;
    }
    rootTests.push({ path, runner });
    continue;
  }

  const manifest = manifestAt(packageDirectory);
  const packagePath = relativePath(packageDirectory);
  if (activeDirectories.has(toDirectoryKey(packageDirectory))) {
    if (!manifest.scripts?.test) {
      errors.push(`${path}: active workspace package ${packagePath} has no test script`);
    }
    continue;
  }

  const inactive = inactiveByPackage.get(packagePath) ?? {
    package: packagePath,
    packageName: manifest.name ?? packagePath,
    testFiles: [],
  };
  inactive.testFiles.push(path);
  inactiveByPackage.set(packagePath, inactive);
}

for (const { runner, commandFragment } of ROOT_RUNNERS) {
  const command = rootManifest.scripts?.[runner];
  if (!command) {
    errors.push(`package.json is missing ${runner}`);
  } else if (!command.includes(commandFragment)) {
    errors.push(`${runner} does not include ${commandFragment}`);
  }
}
const rootCommand = rootManifest.scripts?.["test:root"];
if (!rootCommand) {
  errors.push("package.json is missing test:root");
} else {
  for (const { runner } of ROOT_RUNNERS) {
    if (!rootCommand.includes(runner)) errors.push(`test:root does not invoke ${runner}`);
  }
  if (!rootCommand.includes("test:reachability")) errors.push("test:root does not invoke test:reachability");
}
const repoCommand = rootManifest.scripts?.["test:repo"];
if (!repoCommand) {
  errors.push("package.json is missing test:repo");
} else {
  for (const runner of ["test:workspace", "test:root"]) {
    if (!repoCommand.includes(runner)) errors.push(`test:repo does not invoke ${runner}`);
  }
}
if (!rootManifest.scripts?.["test:reachability"]) errors.push("package.json is missing test:reachability");
if (rootManifest.scripts?.test !== "pnpm test:repo") {
  errors.push("test must delegate to pnpm test:repo");
}

const report = {
  schemaVersion: 1,
  purpose: "Excluded workspace packages with test files must be retired or reactivated through package consolidation; they are not run by test:repo.",
  activeWorkspacePackageCount: activeDirectories.size,
  rootTests,
  inactivePackageTestCount: [...inactiveByPackage.values()].reduce((count, item) => count + item.testFiles.length, 0),
  inactivePackages: [...inactiveByPackage.values()].sort((left, right) => left.package.localeCompare(right.package)),
};
const serializedReport = `${JSON.stringify(report, null, 2)}\n`;

if (errors.length > 0) {
  throw new Error(`Test reachability verification failed:\n${errors.map((error) => `- ${error}`).join("\n")}`);
}

if (writeReport) {
  writeFileSync(reportPath, serializedReport);
  console.log(`Wrote ${relativePath(reportPath)} with ${report.inactivePackageTestCount} excluded test files.`);
} else if (checkReport) {
  if (!existsSync(reportPath)) {
    throw new Error(`Missing retirement report: ${relativePath(reportPath)}. Run pnpm test:reachability:update.`);
  }
  const committedReport = readFileSync(reportPath, "utf8");
  if (committedReport !== serializedReport) {
    throw new Error(`Retirement report is stale: ${relativePath(reportPath)}. Run pnpm test:reachability:update.`);
  }
}

console.log(
  `Test reachability verified: ${rootTests.length} root tests and ${report.inactivePackageTestCount} excluded legacy tests documented.`,
);
