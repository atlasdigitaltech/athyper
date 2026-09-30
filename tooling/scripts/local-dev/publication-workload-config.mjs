import { existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** Reproduce the existing opt-in workload overlay without mounting client tokens. */
export function configureDevPublicationWorkload(
  config,
  preset,
  path = join(
    homedir(),
    ".athyper/instances/dev/secrets/dev-publication-athyper/workload.json",
  ),
) {
  const target = "/run/publication-workload/server.json";
  let workload;
  if (preset === "devfull" && existsSync(path)) {
    const stat = statSync(path);
    if (
      !stat.isFile() ||
      stat.uid !== process.getuid() ||
      stat.mode & 0o077 ||
      stat.size > 16384
    )
      throw Error("Private DEV publication workload configuration required");
    workload = JSON.parse(readFileSync(path, "utf8"));
    if (
      workload.schemaVersion !== 1 ||
      workload.instance !== "dev" ||
      workload.tenantId !== "11111111-1111-4111-8111-111111111111" ||
      Object.keys(workload).sort().join() !==
        "author,instance,publisher,realmKey,schemaVersion,tenantId" ||
      !["author", "publisher"].every((role) => {
        const actor = workload[role];
        return (
          actor &&
          Object.keys(actor).sort().join() ===
            "authEpoch,code,credentialSha256,principalId" &&
          actor.code === `dev.metadata.${role}` &&
          /^[a-f0-9]{64}$/.test(actor.credentialSha256)
        );
      }) ||
      workload.author.principalId === workload.publisher.principalId ||
      workload.author.credentialSha256 === workload.publisher.credentialSha256
    )
      throw Error("Invalid DEV publication workload configuration");
  }
  for (const [name, service] of Object.entries(config.services)) {
    service.environment ??= {};
    service.volumes = (service.volumes ?? []).filter(
      (m) => m.target !== target,
    );
    delete service.environment.PUBLICATION_WORKLOAD_CONFIG;
    if (!workload || !["api", "worker"].includes(name)) continue;
    service.environment.PLATFORM_AUTHORITY_TENANT_ID = workload.tenantId;
    service.environment.PUBLICATION_WORKLOAD_CONFIG = target;
    service.volumes.push({
      type: "bind",
      source: path,
      target,
      read_only: true,
    });
  }
}
