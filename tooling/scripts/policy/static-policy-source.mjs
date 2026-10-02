import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

const hash = (value) => createHash("sha256").update(value).digest("hex");

// Capture actual bytes, including untracked source. Git's ignored build output
// is excluded, but tracked output remains visible for review. Blobs are stored
// by hash so symlinks and repository paths cannot escape the evidence directory.
export function capturePolicySource(cwd, output) {
  const git = (args) =>
    execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    });
  const commit = git(["rev-parse", "HEAD"]).trim();
  const status = git(["status", "--porcelain=v1", "--untracked-files=all"]);
  const paths = [
    ...new Set(
      git(["ls-files", "--cached", "--others", "--exclude-standard", "-z"])
        .split("\0")
        .filter(Boolean),
    ),
  ].sort();
  const files = paths.map((path) => {
    const absolute = join(cwd, path);
    let stat;
    try {
      stat = lstatSync(absolute);
    } catch (error) {
      if (error.code === "ENOENT") return { path, kind: "deleted" };
      throw error;
    }
    if (!stat.isFile() && !stat.isSymbolicLink())
      throw new Error(`Unsupported source entry: ${path}`);
    const kind = stat.isSymbolicLink() ? "symlink" : "file";
    const bytes =
      kind === "symlink"
        ? Buffer.from(readlinkSync(absolute))
        : readFileSync(absolute);
    const sha256 = hash(bytes);
    if (output) {
      const blobs = join(output, "source-blobs");
      mkdirSync(blobs, { recursive: true });
      writeFileSync(join(blobs, sha256), bytes);
    }
    return { path, kind, executable: Boolean(stat.mode & 0o111), sha256 };
  });
  return {
    commit,
    clean: status.length === 0,
    fingerprint: hash(JSON.stringify({ commit, files })),
    files,
  };
}
