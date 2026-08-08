import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";

import {
  createAiLogMetrics,
  metricsHandler,
  recordAtlasConversationPurge,
  recordAtlasToolInvocationRecovery,
} from "../runtimes/metrics.js";

function scrapeMetrics(): Promise<string> {
  return new Promise((resolve) => {
    const response = {
      setHeader: vi.fn(),
      end(body: string) {
        resolve(body);
      },
    } as unknown as Response;
    metricsHandler({} as Request, response);
  });
}

describe("Atlas agent metrics", () => {
  it("renders bounded terminal, usage, denial, binding, and rate-limit metrics", async () => {
    const metrics = createAiLogMetrics();

    metrics.observeAgentRun?.({
      publicModel: "atlas-balanced",
      provider: "anthropic",
      result: "completed",
      plane: "neon",
      streamOutcome: "completed",
      durationMs: 1_500,
      timeToFirstTokenMs: 250,
      inputTokens: 120,
      outputTokens: 30,
      cacheReadTokens: 20,
      estimatedCostUsd: 0.0042,
    });
    metrics.recordAgentCatalogDenial?.({
      publicModel: "atlas-best",
      plane: "admin",
      reason: "model_not_entitled",
    });
    metrics.recordAgentBindingMismatch?.({
      publicModel: "atlas-fast",
      provider: "anthropic",
      reason: "model_mismatch",
    });
    metrics.recordAgentRateLimit?.({
      scope: "tenant",
      plane: "mesh",
    });
    metrics.recordAgentFeedback?.("correct");
    metrics.recordAgentThreadOperation?.({
      operation: "list",
      outcome: "success",
    });
    metrics.recordAgentStaleRunRecovery?.({ plane: "neon" });
    metrics.observeAgentRun?.({
      publicModel: "atlas-gemini-eval",
      provider: "gemini",
      result: "completed",
      plane: "neon",
      streamOutcome: "completed",
      durationMs: 500,
    });

    const output = await scrapeMetrics();

    expect(output).toContain("# TYPE athyper_atlas_agent_runs_total counter");
    expect(output).toContain(
      'athyper_atlas_agent_runs_total{public_model="atlas-balanced",provider="anthropic",result="completed",plane="neon",tenant_tier="unknown",stream_outcome="completed",error_class="none"} 1',
    );
    expect(output).toContain(
      'athyper_atlas_agent_time_to_first_token_seconds_sum{public_model="atlas-balanced",provider="anthropic",plane="neon"} 0.25',
    );
    expect(output).toContain(
      'athyper_atlas_agent_duration_seconds_sum{public_model="atlas-balanced",provider="anthropic",plane="neon"} 1.5',
    );
    expect(output).toContain(
      'athyper_atlas_agent_tokens_total{public_model="atlas-balanced",provider="anthropic",plane="neon",token_type="input"} 120',
    );
    expect(output).toContain(
      'athyper_atlas_agent_estimated_cost_usd_total{public_model="atlas-balanced",provider="anthropic",plane="neon"} 0.0042',
    );
    expect(output).toContain(
      'athyper_atlas_agent_catalog_denials_total{public_model="atlas-best",plane="admin",reason="model_not_entitled"} 1',
    );
    expect(output).toContain(
      'athyper_atlas_agent_binding_mismatches_total{public_model="atlas-fast",provider="anthropic",reason="model_mismatch"} 1',
    );
    expect(output).toContain(
      'athyper_atlas_agent_rate_limits_total{scope="tenant",plane="mesh"} 1',
    );
    expect(output).toContain(
      'athyper_atlas_agent_feedback_total{verdict="correct"} 1',
    );
    expect(output).toContain(
      'athyper_atlas_thread_operations_total{operation="list",outcome="success"} 1',
    );
    expect(output).toContain(
      'athyper_atlas_stale_run_recoveries_total{plane="neon"} 1',
    );
    expect(output).toContain(
      'athyper_atlas_agent_runs_total{public_model="atlas-gemini-eval",provider="gemini",result="completed",plane="neon",tenant_tier="unknown",stream_outcome="completed",error_class="none"} 1',
    );
  });

  it("collapses unexpected labels to unknown and never emits a tenant id", async () => {
    const metrics = createAiLogMetrics();
    const observe = metrics.observeAgentRun as unknown as (
      observation: Record<string, unknown>,
    ) => void;

    observe({
      publicModel: 'atlas-fast"} 1\ninjected_metric 1',
      provider: "vendor-created-at-runtime",
      result: "surprise",
      plane: "customer-plane",
      tenantTier: "tenant-42",
      tenantId: "8ac7231e-tenant-secret",
      streamOutcome: "surprise",
      errorClass: "raw-provider-exception",
      durationMs: Number.POSITIVE_INFINITY,
      inputTokens: -1,
    });

    const output = await scrapeMetrics();

    expect(output).toContain(
      'athyper_atlas_agent_runs_total{public_model="unknown",provider="unknown",result="unknown",plane="unknown",tenant_tier="unknown",stream_outcome="unknown",error_class="unknown"} 1',
    );
    expect(output).not.toContain("8ac7231e-tenant-secret");
    expect(output).not.toContain("injected_metric");
    expect(output).not.toContain(
      'athyper_atlas_agent_duration_seconds_sum{public_model="unknown",provider="unknown",plane="unknown"}',
    );
    expect(output).not.toContain(
      'athyper_atlas_agent_tokens_total{public_model="unknown",provider="unknown",plane="unknown",token_type="input"}',
    );
  });

  it("renders bounded Atlas tool recovery counters without scope identifiers", async () => {
    recordAtlasToolInvocationRecovery({
      outcome: "completed",
      recoveredCount: 3,
      skippedScopeCount: 1,
    });

    const output = await scrapeMetrics();

    expect(output).toContain(
      'athyper_atlas_tool_invocation_recovery_runs_total{outcome="completed"} 1',
    );
    expect(output).toContain(
      'athyper_atlas_tool_invocation_recovery_rows_total{result="recovered"} 3',
    );
    expect(output).toContain(
      'athyper_atlas_tool_invocation_recovery_rows_total{result="skipped_missing_authority"} 1',
    );
  });

  it("renders content-free Atlas purge metrics for alert rules", async () => {
    recordAtlasConversationPurge({
      outcome: "completed",
      expiredCount: 4,
      purgedCount: 3,
      durationMs: 125,
    });

    const output = await scrapeMetrics();
    expect(output).toContain(
      'athyper_atlas_conversation_purge_runs_total{outcome="completed"} 1',
    );
    expect(output).toContain(
      'athyper_atlas_conversation_purge_rows_total{result="expired"} 4',
    );
    expect(output).toContain(
      'athyper_atlas_conversation_purge_rows_total{result="purged"} 3',
    );
  });
});
