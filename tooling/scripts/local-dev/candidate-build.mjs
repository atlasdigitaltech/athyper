import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { assertCleanSource } from "../release/build-provenance-image-set.mjs";
import { promoteImageSet } from "../release/promote-image-set.mjs";
const run = (args, options = {}) =>
  execFileSync("docker", args, { encoding: "utf8", ...options });

/** Local loopback registry gives production-Dockerfile builds real repository digests. */
export function buildCandidate(checkout, output) {
  output = resolve(output);
  if (existsSync(output))
    throw new Error("Candidate ImageSet output already exists");
  const endpoint = JSON.parse(
    run(["context", "inspect", "--format", "{{json .Endpoints.docker.Host}}"]),
  );
  if (
    !endpoint.startsWith("unix://") ||
    (process.env.DOCKER_HOST && !process.env.DOCKER_HOST.startsWith("unix://"))
  )
    throw new Error("Local Docker daemon required");
  const sourceRevision = assertCleanSource(checkout),
    name = "athyper-local-candidate-registry";
  const ids = run(["ps", "-aq", "--filter", `name=^/${name}$`]).trim();
  if (!ids) {
    run(["pull", "registry:3"], { stdio: "inherit" });
    const image = JSON.parse(run(["image", "inspect", "registry:3"]))[0].Id;
    run([
      "run",
      "-d",
      "--name",
      name,
      "--label",
      "io.athyper.candidate-registry=1",
      "-p",
      "127.0.0.1:5501:5000",
      image,
    ]);
  } else {
    const c = JSON.parse(run(["inspect", ids]))[0];
    if (
      c.Config.Labels["io.athyper.candidate-registry"] !== "1" ||
      JSON.stringify(c.HostConfig.PortBindings["5000/tcp"]) !==
        JSON.stringify([{ HostIp: "127.0.0.1", HostPort: "5501" }])
    )
      throw new Error(
        "Unrecognized candidate registry ownership or port binding",
      );
    if (!c.State.Running) run(["start", ids]);
  }
  const tag = `candidate-${sourceRevision.slice(0, 12)}`;
  run(["buildx", "bake", "--file", "deploy/docker-bake.hcl"], {
    cwd: checkout,
    env: { ...process.env, SOURCE_REVISION: sourceRevision, LOCAL_TAG: tag },
    stdio: "inherit",
  });
  if (assertCleanSource(checkout) !== sourceRevision)
    throw new Error("Candidate source changed during build");
  const images = [
    "iam",
    "mesh-web",
    "neon-web",
    "runtime-server",
    "studio-web",
  ].map((id) => {
    const repository = `athyper/${id === "iam" ? "keycloak" : id}`;
    const local = `${repository}:${tag}`,
      target = `localhost:5501/${repository}:${tag}`;
    const image = JSON.parse(run(["image", "inspect", local]))[0];
    if (
      image.Config.Labels["org.opencontainers.image.revision"] !==
      sourceRevision
    )
      throw new Error(`Source mismatch: ${id}`);
    run(["tag", image.Id, target]);
    run(["push", target], { stdio: "inherit" });
    const pushed = JSON.parse(run(["image", "inspect", target]))[0];
    const reference = pushed.RepoDigests.find((value) =>
      value.startsWith(`localhost:5501/${repository}@sha256:`),
    );
    if (!reference) throw new Error(`Missing immutable digest: ${id}`);
    return { id, reference };
  });
  const document = {
    apiVersion: "athyper.io/v1alpha1",
    kind: "ImageSet",
    metadata: { id: tag, channel: "candidate" },
    spec: { sourceRevision, images },
  };
  promoteImageSet(document);
  writeFileSync(output, JSON.stringify(document, null, 2) + "\n", {
    mode: 0o600,
    flag: "wx",
  });
  return document;
}
