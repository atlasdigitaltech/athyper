import { execFileSync } from "node:child_process";

const SERVER_TEST = /^server\/packages\/.*\.test\.ts$/;

export function invalidServerTestPlacements(paths) {
  return paths.filter(
    (path) => SERVER_TEST.test(path) && (!path.includes("/src/") || path.includes("/src/__tests__/")),
  );
}

function stagedAddedPaths() {
  return execFileSync(
    "git",
    ["diff", "--cached", "--name-only", "--diff-filter=A"],
    { encoding: "utf8" },
  )
    .split(/\r?\n/)
    .filter(Boolean);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  const invalid = invalidServerTestPlacements(stagedAddedPaths());
  if (invalid.length) {
    throw new Error(
      `New server unit tests must be colocated under src/:\n${invalid.join("\n")}`,
    );
  }
  process.stdout.write("Staged server test placement verified.\n");
}
