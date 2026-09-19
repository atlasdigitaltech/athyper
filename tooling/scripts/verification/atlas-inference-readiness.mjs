import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function localChatRequest(
  config,
  messages,
  maxOutput = config.request.num_predict,
) {
  if (
    !Number.isInteger(maxOutput) ||
    maxOutput < 1 ||
    maxOutput > config.request.num_predict
  )
    throw Error("Output limit exceeds local policy");
  return {
    model: config.model.upstream,
    messages,
    stream: false,
    think: false,
    options: { num_ctx: config.request.num_ctx, num_predict: maxOutput },
  };
}

// This bounded operator probe is deliberately separate from Docker process health.
export async function checkInference(config, fetcher = fetch) {
  const result = {
    processReady: false,
    generationReady: false,
    publicModelId: config.model.publicId,
    displayName: config.model.displayName,
  };
  if (
    config.endpoint !== "http://atlas-inference:11434" ||
    config.request?.think !== false ||
    config.request?.num_ctx !== 4096 ||
    config.request?.num_predict !== 1024
  )
    return { ...result, reason: "invalid_local_policy" };
  const call = async (path, body, timeout = 5000) => {
    const r = await fetcher(config.endpoint + path, {
      signal: AbortSignal.timeout(timeout),
      ...(body
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        : {}),
    });
    if (!r.ok) throw Error("Inference HTTP " + r.status);
    return r.json();
  };
  try {
    const version = await call("/api/version");
    result.processReady = true;
    if (version.version !== config.engine.version)
      return { ...result, reason: "engine_version_mismatch" };
    const tags = await call("/api/tags");
    const model = tags.models?.find((m) => m.name === config.model.upstream);
    if (!model) return { ...result, reason: "model_not_installed" };
    if (!/^sha256:[a-f0-9]{64}$/.test(config.model.digest ?? ""))
      return { ...result, reason: "model_not_pinned" };
    const installedDigest = /^(sha256:)?[a-f0-9]{64}$/.test(model.digest ?? "")
      ? "sha256:" + model.digest.replace(/^sha256:/, "")
      : null;
    if (installedDigest !== config.model.digest)
      return { ...result, reason: "model_digest_mismatch" };
    const answer = await call(
      "/api/chat",
      localChatRequest(config, [{ role: "user", content: "Reply OK." }], 1),
      120000,
    );
    if (
      answer.done !== true ||
      answer.model !== config.model.upstream ||
      typeof answer.message?.content !== "string" ||
      !answer.message.content.trim()
    )
      return { ...result, reason: "model_probe_failed" };
    return {
      ...result,
      generationReady: true,
      reason: "ready",
      modelDigest: installedDigest,
    };
  } catch {
    return {
      ...result,
      reason: result.processReady
        ? "model_probe_unavailable"
        : "inference_unavailable",
    };
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const config = JSON.parse(
    readFileSync(
      process.argv[2] ?? "/athyper/config/atlas-local-inference.json",
      "utf8",
    ),
  );
  const result = await checkInference(config);
  console.log(JSON.stringify(result));
  if (!result.generationReady) process.exitCode = 1;
}
