#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const images = Object.freeze([
  { id: "iam", repository: "athyper/keycloak" },
  { id: "mesh-web", repository: "athyper/mesh-web" },
  { id: "neon-web", repository: "athyper/neon-web" },
  { id: "runtime-server", repository: "athyper/runtime-server" },
  { id: "studio-web", repository: "athyper/studio-web" },
]);

function run(program, arguments_, options = {}) {
  const result = spawnSync(program, arguments_, {
    cwd: options.cwd ?? process.cwd(),
    encoding: "utf8",
    env: options.env ?? process.env,
    stdio: options.stdio ?? "pipe",
  });
  if (result.status !== 0) {
    throw new Error(`${program} ${arguments_.join(" ")} failed (${result.status ?? "spawn"}): ${(result.stderr || result.stdout || result.error?.message || "unknown error").trim()}`);
  }
  return (result.stdout ?? "").trim();
}

export function assertCleanSource(cwd = process.cwd()) {
  const status = run("git", ["status", "--porcelain=v1", "--untracked-files=all"], { cwd });
  if (status) throw new Error(`Release build requires a clean worktree:\n${status}`);
  const revision = run("git", ["rev-parse", "--verify", "HEAD"], { cwd });
  if (!/^[a-f0-9]{40}$/u.test(revision)) throw new Error("Release build requires a full Git commit SHA");
  return revision;
}

export function inspectReleaseImages(revision, tag, cwd = process.cwd()) {
  return images.map(({ id, repository }) => {
    const reference = `${repository}:${tag}`;
    const inspected = JSON.parse(run("docker", ["image", "inspect", reference], { cwd }))[0];
    const actualRevision = inspected?.Config?.Labels?.["org.opencontainers.image.revision"];
    if (actualRevision !== revision) throw new Error(`${id} OCI revision is ${String(actualRevision)}; expected ${revision}`);
    const user = String(inspected?.Config?.User ?? "").trim();
    if (!user || user === "0" || user === "root" || user.startsWith("0:")) throw new Error(`${id} does not declare a non-root runtime user`);
    const digestReference = (inspected?.RepoDigests ?? []).find((value) => value.startsWith(`${repository}@sha256:`));
    if (!digestReference || !/@sha256:[a-f0-9]{64}$/u.test(digestReference)) throw new Error(`${id} has no immutable repository digest`);
    return { id, reference: digestReference, user, revision };
  });
}

export function buildReleaseImages(cwd = process.cwd()) {
  const revision = assertCleanSource(cwd);
  const tag = `candidate-${revision.slice(0, 12)}`;
  run("docker", ["buildx", "bake", "--file", "deploy/docker-bake.hcl"], {
    cwd,
    env: { ...process.env, SOURCE_REVISION: revision, LOCAL_TAG: tag },
    stdio: "inherit",
  });
  return { sourceRevision: revision, tag, images: inspectReleaseImages(revision, tag, cwd) };
}

if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  try {
    process.stdout.write(`${JSON.stringify(buildReleaseImages(), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  }
}
