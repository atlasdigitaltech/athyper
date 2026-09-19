import {createHash} from "node:crypto";
import {lstat, open} from "node:fs/promises";
import {constants} from "node:fs";
import {isAbsolute, join} from "node:path";
import type {createAuthenticatedEntityReleaseReview} from "./authenticated-entity-release-review.js";
type Load = Parameters<typeof createAuthenticatedEntityReleaseReview>[0]["load"];
const digest = (bytes: string) => createHash("sha256").update(bytes).digest("hex");

/** Read-only deployment mount. Each release manifest must be pinned by trusted
 * deployment configuration; a file merely naming itself approved is insufficient.
 * This does not create approvals or copy a historical packet into a new release.
 */
export function createFileEntityReleaseReviewLoader(root: string, manifestPins: Readonly<Record<string,string>>): Load {
  if (!isAbsolute(root)) throw Error("RELEASE_REVIEW_ROOT_INVALID");
  const pins = Object.freeze({...manifestPins});
  for (const [releaseId, hash] of Object.entries(pins)) if (!/^[a-f0-9-]{36}$/.test(releaseId) || !/^[a-f0-9]{64}$/.test(hash)) throw Error("RELEASE_REVIEW_PIN_INVALID");
  return async coordinate => {
    if (!Object.hasOwn(pins, coordinate.releaseId)) return null;
    const directory = join(root, coordinate.releaseId);
    const directoryStat = await lstat(directory);
    if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink() || (directoryStat.mode & 0o022)) throw Error("RELEASE_REVIEW_DIRECTORY_UNTRUSTED");
    const read = async (name: string, expected: string) => {
      if (!/^[a-f0-9]{64}$/.test(expected)) throw Error("RELEASE_REVIEW_DIGEST_INVALID");
      const file = await open(join(directory, name), constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        const stat = await file.stat();
        if (!stat.isFile() || stat.size > 4 * 1024 * 1024 || (stat.mode & 0o022)) throw Error("RELEASE_REVIEW_FILE_UNTRUSTED");
        const bytes = await file.readFile("utf8");
        if (Buffer.byteLength(bytes) > 4 * 1024 * 1024 || digest(bytes) !== expected) throw Error("RELEASE_REVIEW_FILE_CHANGED");
        return JSON.parse(bytes);
      } finally {await file.close();}
    };
    const manifest = await read("manifest.json", pins[coordinate.releaseId]!);
    if (manifest.schemaVersion !== 1 || manifest.releaseId !== coordinate.releaseId ||
      Object.keys(manifest).some(k => !["schemaVersion","releaseId","packetSha256","stateSha256","nominationSha256"].includes(k))) throw Error("RELEASE_REVIEW_MANIFEST_INVALID");
    const [packet, state, nomination] = await Promise.all([
      read("packet.json", manifest.packetSha256), read("state.json", manifest.stateSha256), read("nomination.json", manifest.nominationSha256),
    ]);
    return {packet, state, nomination, nominationSha256: manifest.nominationSha256};
  };
}
