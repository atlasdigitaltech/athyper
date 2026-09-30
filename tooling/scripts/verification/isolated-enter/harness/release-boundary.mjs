import { createHash } from "node:crypto";
export const artifactHash =
  "45ddc85ece1f453e84b1eccc0cea9ca141fe9847c68ab7d2500e7d347d7b75fc";
export const releaseId = "c2cc6900-26c1-47ca-8dfc-1d488000950c";
const marker = "_isolatedExecutionArtifact";
export function assertIsolatedEnvironment(env) {
  if (
    env.BP_ISOLATED_EXECUTION !== "enter-correction" ||
    env.BP_AUTHORIZATION_MODE !== "off"
  )
    throw Error("ISOLATED_EXECUTION_REQUIRED");
  for (const key of [
    "DATABASE_ADMIN_URL",
    "ATHYPER_PLATFORM_DATABASE_URL",
    "ATHYPER_PLATFORM_WORKER_DATABASE_URL",
    "AUTHORIZATION_WRITER_CONNECTIONS_PATH",
    "ENTITY_RELEASE_REVIEW_CONFIG_PATH",
  ])
    if (env[key]) throw Error("UNREVIEWED_CONNECTION_ALIAS:" + key);
  const databaseKeys = [
    "DATABASE_URL",
    "STUDIO_DATABASE_URL",
    "MESH_DATABASE_URL",
    "STUDIO_WORKER_DATABASE_URL",
    "NEON_WORKER_DATABASE_URL",
    "MESH_WORKER_DATABASE_URL",
    "STUDIO_INVALIDATION_LISTENER_DATABASE_URL",
    "NEON_INVALIDATION_LISTENER_DATABASE_URL",
    "MESH_INVALIDATION_LISTENER_DATABASE_URL",
  ];
  for (const key of databaseKeys) {
    if (!env[key]) continue;
    const url = new URL(env[key]);
    if (
      url.hostname !== "athyper-bp-enter-db" ||
      url.pathname !==
        "/athyper_" +
          (key.startsWith("STUDIO_")
            ? "studio"
            : key.startsWith("MESH_")
              ? "mesh"
              : "neon")
    )
      throw Error("SHARED_DATABASE_FORBIDDEN:" + key);
  }
  for (const key of [
    "DATABASE_URL",
    "STUDIO_DATABASE_URL",
    "MESH_DATABASE_URL",
    "REDIS_URL",
    "REDIS_BULLMQ_URL",
    "S3_ENDPOINT",
  ])
    if (!env[key]) throw Error("ISOLATED_ENDPOINT_REQUIRED:" + key);
  for (const key of ["REDIS_URL", "REDIS_BULLMQ_URL"])
    if (new URL(env[key]).hostname !== "athyper-bp-enter-redis")
      throw Error("SHARED_QUEUE_FORBIDDEN");
  if (
    new URL(env.S3_ENDPOINT).hostname !== "athyper-bp-enter-objectstore" ||
    ["DOCUMENTS", "ARTIFACTS", "TRANSFERS"].some(
      (k) => env["S3_BUCKET_" + k] !== "bp-enter-" + k.toLowerCase(),
    )
  )
    throw Error("SHARED_OBJECT_STORAGE_FORBIDDEN");
  for (const key of [
    "PUBLICATION_AUTHORING_ENABLED",
    "PUBLICATION_COMPILE_ENABLED",
    "PUBLICATION_DISPATCH_ENABLED",
    "PUBLICATION_RECOVERY_ENABLED",
    "PUBLICATION_APPLY_ENABLED",
  ])
    if (env[key] !== "false")
      throw Error("PUBLICATION_WRITER_FORBIDDEN:" + key);
}
export function bindJobRuntime(runtime, assertCurrent, emit) {
  const enqueue = runtime.enqueue.bind(runtime),
    register = runtime.register.bind(runtime);
  runtime.enqueue = async (queue, name, data, options) => {
    await assertCurrent();
    if (marker in data) throw Error("CALLER_ARTIFACT_MARKER_FORBIDDEN");
    return enqueue(queue, name, { ...data, [marker]: artifactHash }, options);
  };
  runtime.register = (queue, name, handler) =>
    register(queue, name, {
      async handle(job, context) {
        if (job.data?.[marker] !== artifactHash)
          throw Error("JOB_ARTIFACT_MISMATCH");
        await assertCurrent();
        const { [marker]: ignored, ...data } = job.data;
        const result = await handler.handle({ ...job, data }, context);
        await assertCurrent();
        emit({
          kind: "isolated_job_execution",
          releaseId,
          artifactHash,
          queue,
          name,
          jobRef: createHash("sha256").update(job.id).digest("hex"),
          status: "completed",
        });
        return result;
      },
    });
}
export function requestBoundary(assertCurrent, emit) {
  return async (req, res, next) => {
    try {
      await assertCurrent();
      if (
        req.headers["x-execution-artifact"] &&
        req.headers["x-execution-artifact"] !== artifactHash
      )
        return res.status(409).json({ code: "REQUEST_ARTIFACT_MISMATCH" });
      res.setHeader("x-execution-artifact", artifactHash);
      res.setHeader("x-execution-release", releaseId);
      res.once("finish", () =>
        emit({
          kind: "isolated_request_execution",
          releaseId,
          artifactHash,
          method: req.method,
          status: res.statusCode,
        }),
      );
      next();
    } catch {
      res.status(503).json({ code: "ISOLATED_RELEASE_UNAVAILABLE" });
    }
  };
}
