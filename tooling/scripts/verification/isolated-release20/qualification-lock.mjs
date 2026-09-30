import fs from "node:fs";
import os from "node:os";
import { randomUUID } from "node:crypto";
const defaultPath =
  os.homedir() +
  "/.athyper/instances/dev/deployments/bp-release-20-isolated-20260911/context-qualification.lock";
// Persona evidence comes from container logs. Do not overlap browser, API or
// canonical captures. A stale lock requires explicit operator inspection.
export function acquireQualificationLock(path = defaultPath) {
  const token = randomUUID();
  let fd;
  try {
    fd = fs.openSync(path, "wx", 0o600);
  } catch (e) {
    if (e.code === "EEXIST")
      throw Error("ISOLATED_QUALIFICATION_ALREADY_RUNNING_OR_STALE_LOCK");
    throw e;
  }
  fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, token }));
  fs.closeSync(fd);
  let held = true;
  const release = () => {
    if (!held) return;
    held = false;
    process.removeListener("exit", release);
    try {
      if (JSON.parse(fs.readFileSync(path, "utf8")).token === token)
        fs.unlinkSync(path);
    } catch {
      /* Never remove another run's lock. */
    }
  };
  process.once("exit", release);
  return release;
}
