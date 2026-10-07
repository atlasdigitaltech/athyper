import { open, lstat, realpath } from "node:fs/promises";
import { constants } from "node:fs";
import { isAbsolute, join } from "node:path";
/** Read-only generated snapshot mount. Approval and canonical source hash are
 * independently checked by createApprovedAuthoringResourcePublication. */
export function createFileAuthoringResourceSnapshotReader(
  root: string,
  maximumBytes: number,
) {
  if (
    !isAbsolute(root) ||
    !Number.isSafeInteger(maximumBytes) ||
    maximumBytes < 1 ||
    maximumBytes > 4194304
  )
    throw Error("AUTHORING_RESOURCE_MOUNT_INVALID");
  return async (releaseId: string): Promise<unknown> => {
    if (
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
        releaseId,
      )
    )
      throw Error("AUTHORING_RESOURCE_RELEASE_INVALID");
    const directory = await lstat(root);
    if (
      !directory.isDirectory() ||
      directory.isSymbolicLink() ||
      directory.mode & 0o022 ||
      (await realpath(root)) !== root
    )
      throw Error("AUTHORING_RESOURCE_MOUNT_UNTRUSTED");
    const file = await open(
      join(root, releaseId + ".json"),
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.mode & 0o022 || stat.size > maximumBytes)
        throw Error("AUTHORING_RESOURCE_SNAPSHOT_UNTRUSTED");
      // Bounded read also rejects files which grow after fstat.
      const buffer = Buffer.alloc(maximumBytes + 1);
      let total = 0;
      while (total < buffer.length) {
        const { bytesRead } = await file.read(
          buffer,
          total,
          buffer.length - total,
          null,
        );
        if (!bytesRead) break;
        total += bytesRead;
      }
      if (total > maximumBytes)
        throw Error("AUTHORING_RESOURCE_SOURCE_BUDGET_EXCEEDED");
      return JSON.parse(buffer.subarray(0, total).toString("utf8"));
    } finally {
      await file.close();
    }
  };
}
