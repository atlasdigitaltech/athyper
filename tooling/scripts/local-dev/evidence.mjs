import { lstatSync, readFileSync, readlinkSync } from "node:fs";
import { join } from "node:path";
import { command } from "./runtime.mjs";
import { hash } from "./model.mjs";

// Include tracked deletions, executable bits, symlinks and non-ignored new files.
// Store hashes only: source files may contain private developer configuration.
export async function sourceIdentity(checkout) {
  const names = await command("git", [
    "-C",
    checkout,
    "ls-files",
    "-z",
    "--cached",
    "--others",
    "--exclude-standard",
  ]);
  const files = [...new Set(names.split("\0").filter(Boolean))]
    .sort()
    .map((path) => {
      try {
        const stat = lstatSync(join(checkout, path));
        if (!stat.isFile() && !stat.isSymbolicLink())
          throw new Error(`Unsupported source entry: ${path}`);
        return {
          path,
          mode: stat.mode & 0o777,
          kind: stat.isSymbolicLink() ? "symlink" : "file",
          sha256: hash(
            stat.isSymbolicLink()
              ? readlinkSync(join(checkout, path))
              : readFileSync(join(checkout, path)),
          ),
        };
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
        return { path, deleted: true };
      }
    });
  return {
    revision: await command("git", ["-C", checkout, "rev-parse", "HEAD"]),
    treeSha256: hash(JSON.stringify(files)),
    files,
  };
}
