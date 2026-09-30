import { mkdtempSync, rmSync, existsSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import {
  resolve,
  join,
  relative,
  isAbsolute,
  dirname,
  basename,
  sep,
} from "node:path";
import { execFileSync } from "node:child_process";
import { sourceIdentity } from "./evidence.mjs";

/** Create a detached, committed local snapshot without changing the developer's index/branch. */
export async function snapshotCandidate(checkout, destination) {
  checkout = realpathSync(checkout);
  destination = join(
    realpathSync(dirname(resolve(destination))),
    basename(destination),
  );
  const path = relative(checkout, destination);
  if (
    !path ||
    (!(path === ".." || path.startsWith(`..${sep}`)) && !isAbsolute(path)) ||
    existsSync(destination)
  )
    throw new Error(
      "Candidate snapshot needs a new directory outside the checkout",
    );
  const temporary = mkdtempSync(join(tmpdir(), "athyper-candidate-index-"));
  const env = {
    ...process.env,
    GIT_INDEX_FILE: join(temporary, "index"),
    GIT_AUTHOR_NAME: "Local candidate snapshot",
    GIT_AUTHOR_EMAIL: "local-candidate@athyper.invalid",
    GIT_COMMITTER_NAME: "Local candidate snapshot",
    GIT_COMMITTER_EMAIL: "local-candidate@athyper.invalid",
  };
  const git = (...args) =>
    execFileSync("git", ["-C", checkout, ...args], {
      env,
      encoding: "utf8",
    }).trim();
  try {
    const source = await sourceIdentity(checkout);
    git("read-tree", "HEAD");
    git("-c", "core.hooksPath=/dev/null", "add", "-A", "--", ".");
    const tree = git("write-tree");
    if ((await sourceIdentity(checkout)).treeSha256 !== source.treeSha256)
      throw new Error(
        "Source changed while taking the candidate snapshot; retry",
      );
    const revision = git(
      "commit-tree",
      tree,
      "-p",
      source.revision.trim(),
      "-m",
      `Local QA candidate snapshot\n\nSource tree SHA-256: ${source.treeSha256}\nAutomated snapshot; no human acceptance or publication approval.`,
    );
    execFileSync(
      "git",
      ["-C", checkout, "worktree", "add", "--detach", destination, revision],
      { encoding: "utf8" },
    );
    return {
      schema: "athyper.candidate-source-snapshot/1",
      sourceRevision: revision,
      originalRevision: source.revision.trim(),
      originalTreeSha256: source.treeSha256,
      checkout: destination,
      developerBranchChanged: false,
      humanApprovalPerformed: false,
    };
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}
