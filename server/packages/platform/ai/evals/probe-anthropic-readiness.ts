import { ClaudeTextProvider } from "../providers/claude-text.provider.js";
import { loadAnthropicProductionBaseline } from "./validate-anthropic-production-baseline.js";

async function main(): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim() ?? "";
  if (apiKey.length === 0) {
    throw new Error("ANTHROPIC_API_KEY is required for the readiness probe");
  }

  const { baseline } = loadAnthropicProductionBaseline();
  let ready = true;
  for (const binding of baseline.bindings) {
    const provider = new ClaudeTextProvider(
      apiKey,
      binding.upstream_model_id,
    );
    const state = await provider.checkReadiness(binding.upstream_model_id);
    const safeResult = {
      public_model_id: binding.public_model_id,
      configured_model_id: binding.upstream_model_id,
      actual_model_id: state.actualModelId,
      healthy: state.healthy,
      eligible: state.eligible,
      reason: state.reason,
      retryable: state.retryable,
      ...(state.httpStatus === undefined
        ? {}
        : { http_status: state.httpStatus }),
    };
    process.stdout.write(`${JSON.stringify(safeResult)}\n`);
    ready &&= state.healthy && state.eligible;
  }

  if (!ready) process.exitCode = 1;
}

main().catch((error: unknown) => {
  const message = error instanceof Error
    ? error.message
    : "Anthropic readiness probe failed";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
