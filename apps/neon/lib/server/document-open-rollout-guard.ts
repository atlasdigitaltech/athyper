import "server-only";

interface OpenRolloutGuardWindow {
  startAt: number;
  total: number;
  failuresByReason: Record<string, number>;
  failureRateByReason: Record<string, number>;
  totalFailureRate: number;
}

interface OpenRolloutGuardState {
  window: OpenRolloutGuardWindow;
  disabledUntil: number;
  reason: string | null;
}

export interface OpenRolloutGuardDecision {
  disabled: boolean;
  reason: string | null;
  disabledUntil: number;
  window: OpenRolloutGuardWindow;
}

const state: OpenRolloutGuardState = {
  window: newWindow(),
  disabledUntil: 0,
  reason: null,
};

function newWindow(): OpenRolloutGuardWindow {
  const startAt = Date.now();
  return {
    startAt,
    total: 0,
    totalFailureRate: 0,
    failuresByReason: Object.create(null),
    failureRateByReason: Object.create(null),
  };
}

function normalizeWindow(now: number): void {
  if (state.disabledUntil > 0 && now >= state.disabledUntil) {
    state.disabledUntil = 0;
    state.reason = null;
  }
  if (now - state.window.startAt > getGuardWindowMs()) {
    state.window = newWindow();
  }
}

function buildReasonKey(event: string, metric: { reason?: string; statusCode?: number; outcome?: string }): string | null {
  if (event === "workspace_projection_validation" && metric.reason === "missing_field_mask") return "missing_field_mask";
  if (event === "workspace_projection_validation" && metric.reason === "incorrect_child_capability") return "incorrect_child_capability";
  if (event === "workspace_compatibility_fetch" && metric.outcome === "failure") return "compatibility_fetch_failure";
  if (event === "workspace_section" && metric.outcome === "degraded") return "section_degraded";
  if (event === "workspace_section" && metric.outcome === "timeout") return "section_timeout";
  if (event === "workspace_open" && metric.statusCode === 401) return "unauthorized";
  if (event === "workspace_open" && metric.statusCode === 403) return "forbidden";
  if (event === "save" && metric.outcome === "validation_failure") return "save_validation_failure";
  return null;
}

export function getOpenRolloutGuardDecision(): OpenRolloutGuardDecision {
  const now = Date.now();
  normalizeWindow(now);
  return {
    disabled: isGuardEnabled() && state.disabledUntil > now && state.reason !== null,
    reason: state.reason,
    disabledUntil: state.disabledUntil,
    window: state.window,
  };
}

export function resetOpenRolloutGuardState(): void {
  state.window = newWindow();
  state.disabledUntil = 0;
  state.reason = null;
}

export function recordDocumentEditOpenMetric(metric: {
  event:
    | "save"
    | "workspace_open"
    | "workspace_projection"
    | "workspace_compatibility_fetch"
    | "workspace_projection_validation"
    | "workspace_section"
    | "workspace_validation"
    | "draft_recovery"
    | "draft_discard"
    | "workflow_compensation";
  outcome: string;
  statusCode?: number;
  reason?: string;
}): void {
  if (!isGuardEnabled()) return;
  const now = Date.now();
  normalizeWindow(now);

  state.window.total += 1;

  const failure = isFailure(metric);
  if (!failure) return;
  state.window.totalFailureRate += 1;

  const reason = buildReasonKey(metric.event, metric);
  const reasonKey = reason ?? metric.reason ?? "generic_failure";
  state.window.failuresByReason[reasonKey] = (state.window.failuresByReason[reasonKey] ?? 0) + 1;

  evaluateGuard();
}

function evaluateGuard(): void {
  if (state.disabledUntil > Date.now()) return;

  const total = state.window.total;
  if (total < getGuardMinSamples()) return;

  state.window.failureRateByReason = Object.fromEntries(
    Object.entries(state.window.failuresByReason).map(([key, count]) => [key, count / Math.max(total, 1)]),
  );

  const globalFailureRate = state.window.totalFailureRate / Math.max(total, 1);
  if (globalFailureRate > getGuardFailureRate()) {
    state.disabledUntil = Date.now() + getGuardCooldownMs();
    state.reason = `global_failure_rate:${globalFailureRate.toFixed(4)}`;
    return;
  }

  for (const [reason, rate] of Object.entries(state.window.failureRateByReason)) {
    if (rate > getGuardFailureRate()) {
      state.disabledUntil = Date.now() + getGuardCooldownMs();
      state.reason = `${reason}_rate:${rate.toFixed(4)}`;
      return;
    }
  }
}

function isFailure(metric: { event: string; outcome: string; statusCode?: number }): boolean {
  if (metric.event === "workspace_open") {
    return metric.outcome !== "success";
  }
  return metric.outcome === "failure" || metric.outcome === "error" || metric.outcome === "degraded" || metric.outcome === "timeout";
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  return ["1", "true", "on", "yes"].includes(value.toLowerCase().trim());
}

function parseNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value?.trim());
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getGuardWindowMs(): number {
  return parseNumber(process.env.DOCUMENT_OPEN_ROLLBACK_WINDOW_MS, 120000);
}

function getGuardMinSamples(): number {
  return parseNumber(process.env.DOCUMENT_OPEN_ROLLBACK_MIN_SAMPLES, 40);
}

function getGuardFailureRate(): number {
  return parseNumber(process.env.DOCUMENT_OPEN_ROLLBACK_FAILURE_RATE, 0.05);
}

function getGuardCooldownMs(): number {
  return parseNumber(process.env.DOCUMENT_OPEN_ROLLBACK_COOLDOWN_MS, 300000);
}

function isGuardEnabled(): boolean {
  return parseBoolean(process.env.DOCUMENT_OPEN_ROLLBACK_ENABLED, false);
}
