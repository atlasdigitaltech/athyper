import { mkdtemp, writeFile, rm, symlink, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createFileAuthoringResourceSnapshotReader } from "./file-authoring-resource-source.js";
it("reads only bounded exact release files and rejects traversal, symlinks and writable mounts", async () => {
  const root = await mkdtemp(join(tmpdir(), "authoring-source-")),
    id = "00000000-0000-4000-8000-000000000001";
  try {
    const read = createFileAuthoringResourceSnapshotReader(root, 100);
    await writeFile(join(root, id + ".json"), "{}", { mode: 0o600 });
    expect(await read(id)).toEqual({});
    await expect(read("../escape")).rejects.toThrow("RELEASE_INVALID");
    await rm(join(root, id + ".json"));
    await symlink("/dev/null", join(root, id + ".json"));
    await expect(read(id)).rejects.toThrow();
    await chmod(root, 0o777);
    await expect(read(id)).rejects.toThrow("MOUNT_UNTRUSTED");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
