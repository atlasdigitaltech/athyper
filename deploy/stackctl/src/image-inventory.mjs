#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

function docker(args) {
  const result = spawnSync("docker", args, {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    timeout: 30000,
  });
  if (result.status !== 0) throw new Error(`Docker ${args[0]} failed`);
  return result.stdout.trim();
}

// Deliberately omit environment variables, mounts and arbitrary image labels.
export function summarizeImage(
  container,
  image,
  desiredReference,
  desiredImageId,
) {
  return {
    container: String(container.Name).replace(/^\//, ""),
    service: container.Config.Labels?.["com.docker.compose.service"] ?? null,
    state: container.State.Status,
    health: container.State.Health?.Status ?? null,
    configuredReference: container.Config.Image,
    runningImageId: container.Image,
    registryDigests: image.RepoDigests ?? [],
    sourceRevision:
      image.Config?.Labels?.["org.opencontainers.image.revision"] ?? null,
    desiredReference: desiredReference ?? null,
    referenceMatches: desiredReference
      ? container.Config.Image === desiredReference
      : null,
    matchesLocallyResolvedDesiredImage: desiredImageId
      ? container.Image === desiredImageId
      : null,
  };
}

export function inventoryProject(project, desired = {}, run = docker) {
  if (!/^[a-z0-9][a-z0-9_-]*$/u.test(project))
    throw new Error("Invalid Compose project");
  const ids = run([
    "ps",
    "--all",
    "--quiet",
    "--filter",
    `label=com.docker.compose.project=${project}`,
  ])
    .split(/\s+/)
    .filter(Boolean);
  if (!ids.length) return [];
  const containers = JSON.parse(run(["inspect", ...ids]));
  return containers.map((container) => {
    const image = JSON.parse(run(["image", "inspect", container.Image]))[0];
    const reference =
      desired[container.Config.Labels?.["com.docker.compose.service"]]?.image;
    let desiredId;
    if (reference) {
      try {
        desiredId = JSON.parse(run(["image", "inspect", reference]))[0].Id;
      } catch {
        /* Not locally resolved; do not pull. */
      }
    }
    return summarizeImage(container, image, reference, desiredId);
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const args = process.argv.slice(2);
    if (
      args[0] !== "--project" ||
      !args[1] ||
      !(
        args.length === 2 ||
        (args.length === 4 && args[2] === "--compose-json")
      )
    )
      throw new Error(
        "Usage: image-inventory.mjs --project <name> [--compose-json <rendered-config.json>]",
      );
    const desired = args[3]
      ? JSON.parse(readFileSync(args[3], "utf8")).services
      : {};
    console.log(
      JSON.stringify(
        {
          project: args[1],
          capturedAt: new Date().toISOString(),
          images: inventoryProject(args[1], desired),
        },
        null,
        2,
      ),
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
