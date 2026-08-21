import type { Request, Response, Router } from "express";
import { AgentRunRequestSchema, AtlasPlaneSchema } from "@athyper/atlas-agent-runtime";
import {
  composeVerifiedRequestContext,
  EffectivePermissionContextMismatchError,
  ensureEffectivePermissionContext,
  isPlaneKey,
  storeVerifiedRequestContext,
  type EffectivePermissionContext,
  type PermissionResolverRegistry,
  type VerifiedRequestContext,
} from "@athyper/svc-iam";
import {
  extractVerifiedRequestContextHints,
  resolveVerifiedRequestContext,
  verifyBearer,
} from "@athyper/svc-shared";
import type { AgentRuntime } from "../agent/agent-runtime.js";
import type { EffectiveModelCatalogResolver } from "../agent/model-catalog.js";
import type {
  AtlasPlaneAdmissionDecision,
  AtlasPlanePolicyResolver,
} from "../agent/plane-policy.js";
import type { AgentRateLimiter } from "../agent/rate-limit.js";
import { serializeAgentStreamEnvelope } from "../agent/stream-protocol.js";
import type { AiLogMetrics, AiLogger, AnyDb } from "../ai-runtime.types.js";

const ATLAS_AGENT_FLAG = "atlas_agent_enabled";
const ATLAS_CONVERSATION_PERSISTENCE_FLAG =
  "atlas_conversation_persistence_enabled";
const ATLAS_AGENT_TOOLS_FLAG = "atlas_agent_tools_enabled";
const ATLAS_AGENT_USE_PERMISSION = "ai.agent.use";

export interface AiAgentRouteDeps {
  db: AnyDb;
  auth: { verifyToken(token: string): Promise<{ sub: string; [key: string]: unknown }> };
  agentRuntime: AgentRuntime;
  catalogResolver: EffectiveModelCatalogResolver;
  planePolicyResolver: AtlasPlanePolicyResolver;
  rateLimiter: AgentRateLimiter;
  featureFlags: { isEnabled(code: string, tenantId?: string): Promise<boolean> };
  permissionResolverRegistry: PermissionResolverRegistry;
  logger: AiLogger;
  metrics?: AiLogMetrics;
  envEnabled: boolean;
  persistenceEnvEnabled?: boolean;
  toolsEnvEnabled?: boolean;
  /** Reads identity state already established by the authenticated host gate. */
  readAuthenticatedContext?: (req: Request) => {
    tenantId?: string;
    claims?: Record<string, unknown>;
  } | undefined;
  /** Bridges the exact immutable IAM context into the host request ALS. */
  onVerifiedContext?: (context: VerifiedRequestContext) => void;
}

export function registerAiAgentRoutes(router: Router, deps: AiAgentRouteDeps): Router {
  router.post("/ai/agent/runs", (req, res) => {
    void handleAgentRun(req, res, deps);
  });
  router.get("/ai/agent/models", (req, res) => {
    void handleAgentModels(req, res, deps);
  });
  return router;
}

async function handleAgentModels(
  req: Request,
  res: Response,
  deps: AiAgentRouteDeps,
): Promise<void> {
  try {
    if (!deps.envEnabled) {
      deps.metrics?.recordAgentCatalogDenial?.({
        plane: "unknown",
        reason: "environment_disabled",
      });
      res.status(404).json({ error: "not_found" });
      return;
    }
    const context = await resolveAgentRequestContext(req, res, deps);
    if (!context) return;
    if (rejectAdminTargetOverride(req, res, context)) return;
    const admission = await resolveAgentPlaneAdmission(context, res, deps);
    if (!admission) return;

    const catalog = await deps.catalogResolver.resolveCatalog({
      tenantId: context.tenantId,
      principalId: context.principalId,
      plane: context.planeKey,
      verifiedRequestContext: context,
    });
    if (catalog.models.length === 0) {
      deps.metrics?.recordAgentCatalogDenial?.({
        plane: context.planeKey,
        reason: "no_effective_models",
      });
    }
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Vary", "Authorization, X-Tenant-Id, X-Plane-Key");
    res.status(200).json(catalog);
  } catch (error) {
    if (error instanceof EffectivePermissionContextMismatchError) {
      res.status(error.status).json({ error: error.code, message: error.message });
      return;
    }
    deps.logger.error("atlas_agent_models_route_error", { err: String(error) });
    if (!res.headersSent) res.status(500).json({ error: "internal_error" });
  }
}

async function handleAgentRun(
  req: Request,
  res: Response,
  deps: AiAgentRouteDeps,
): Promise<void> {
  try {
    if (!deps.envEnabled) {
      deps.metrics?.recordAgentCatalogDenial?.({
        plane: "unknown",
        reason: "environment_disabled",
      });
      res.status(404).json({ error: "not_found" });
      return;
    }

    const parsed = AgentRunRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_request", issues: parsed.error.issues });
      return;
    }

    const context = await resolveAgentRequestContext(req, res, deps);
    if (!context) return;
    if (rejectAdminTargetOverride(req, res, context)) return;
    if (context.planeKey !== parsed.data.plane) {
      res.status(400).json({ error: "plane_context_mismatch" });
      return;
    }
    const admission = await resolveAgentPlaneAdmission(context, res, deps);
    if (!admission) return;
    const conversationPersistenceEnabled =
      admission.persistenceAllowed
      && deps.persistenceEnvEnabled === true
      && await deps.featureFlags.isEnabled(
        ATLAS_CONVERSATION_PERSISTENCE_FLAG,
        context.tenantId,
      );
    const toolExecutionEnabled =
      conversationPersistenceEnabled
      && admission.readToolsAllowed
      && deps.toolsEnvEnabled === true
      && await deps.featureFlags.isEnabled(
        ATLAS_AGENT_TOOLS_FLAG,
        context.tenantId,
      );
    if (!deps.agentRuntime.available) {
      deps.metrics?.recordAgentCatalogDenial?.({
        publicModel: metricPublicModel(parsed.data.model_id),
        plane: context.planeKey,
        reason: "provider_unavailable",
      });
      res.status(503).json({ error: "atlas_agent_provider_unavailable" });
      return;
    }

    const rateLimit = await deps.rateLimiter.check({
      tenantId: context.tenantId,
      principalId: context.principalId,
    });
    if (!rateLimit.allowed) {
      deps.metrics?.recordAgentRateLimit?.({
        scope: rateLimit.scope ?? "unknown",
        plane: context.planeKey,
      });
      res.setHeader("Retry-After", String(rateLimit.retryAfterSeconds));
      res.status(429).json({ error: "rate_limited", scope: rateLimit.scope });
      return;
    }

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const controller = new AbortController();
    res.on("close", () => controller.abort(new Error("client_disconnected")));
    const heartbeat = setInterval(() => {
      if (!res.writableEnded) res.write(": heartbeat\n\n");
    }, 15_000);

    try {
      for await (const envelope of deps.agentRuntime.run(
        parsed.data,
        {
          tenantId: context.tenantId,
          principalId: context.principalId,
          plane: parsed.data.plane,
          conversationPersistenceEnabled,
          toolExecutionEnabled,
          verifiedRequestContext: context,
        },
        controller.signal,
      )) {
        if (controller.signal.aborted || res.writableEnded) break;
        res.write(serializeAgentStreamEnvelope(envelope));
      }
    } finally {
      clearInterval(heartbeat);
      if (!res.writableEnded) res.end();
    }
  } catch (error) {
    if (error instanceof EffectivePermissionContextMismatchError) {
      if (!res.headersSent) {
        res.status(error.status).json({ error: error.code, message: error.message });
      } else if (!res.writableEnded) {
        res.end();
      }
      return;
    }
    deps.logger.error("atlas_agent_route_error", { err: String(error) });
    if (!res.headersSent) res.status(500).json({ error: "internal_error" });
    else if (!res.writableEnded) res.end();
  }
}

function rejectAdminTargetOverride(
  req: Request,
  res: Response,
  context: VerifiedRequestContext,
): boolean {
  if (context.planeKey !== "admin") return false;
  const forbidden = [
    "x-atlas-target-tenant-id",
    "x-support-target-tenant-id",
    "x-target-tenant-id",
  ];
  if (!forbidden.some((name) => req.headers[name] !== undefined)) return false;
  res.status(400).json({ error: "untrusted_support_target" });
  return true;
}

export type AiAgentRequestContextDeps = Pick<
  AiAgentRouteDeps,
  | "db"
  | "auth"
  | "featureFlags"
  | "permissionResolverRegistry"
  | "logger"
  | "metrics"
  | "envEnabled"
  | "readAuthenticatedContext"
  | "onVerifiedContext"
>;

export type AiAgentPlaneAdmissionDeps = Pick<
  AiAgentRouteDeps,
  "planePolicyResolver" | "metrics"
>;

export async function resolveAgentPlaneAdmission(
  context: VerifiedRequestContext,
  res: Response,
  deps: AiAgentPlaneAdmissionDeps,
): Promise<AtlasPlaneAdmissionDecision | null> {
  const decision = await deps.planePolicyResolver.resolve({
    tenantId: context.tenantId,
    principalId: context.principalId,
    plane: context.planeKey,
    verifiedRequestContext: context,
  });
  if (decision.chatAllowed) return decision;

  deps.metrics?.recordAgentCatalogDenial?.({
    plane: context.planeKey,
    reason: "plane_not_enabled",
  });
  res.status(404).json({ error: "not_found" });
  return null;
}

export async function resolveAgentRequestContext(
  req: Request,
  res: Response,
  deps: AiAgentRequestContextDeps,
): Promise<VerifiedRequestContext | null> {
  const authenticated = deps.readAuthenticatedContext?.(req);
  const cachedClaims =
    (req as Request & { athyperClaims?: Record<string, unknown> }).athyperClaims
    ?? authenticated?.claims;
  const claims =
    cachedClaims
    ?? await verifyBearer(req.headers.authorization ?? "", deps.auth, res);
  if (!claims) return null;

  const resolved = await resolveVerifiedRequestContext(
    deps.db,
    claims,
    {
      ...extractVerifiedRequestContextHints(req),
      trustedTenantId: authenticated?.tenantId,
    },
  );
  if (!resolved.ok) {
    res.status(resolved.status).json({
      error: resolved.error,
      message: resolved.message,
    });
    return null;
  }

  const rawPlane = req.headers["x-plane-key"] ?? req.headers["x-plane"];
  const planeKey = Array.isArray(rawPlane) ? rawPlane[0] : rawPlane;
  const atlasPlane = AtlasPlaneSchema.safeParse(planeKey);
  if (!atlasPlane.success || !isPlaneKey(atlasPlane.data)) {
    res.status(403).json({
      error: "PLANE_CONTEXT_REQUIRED",
      message: "An authenticated Atlas product-plane context is required.",
    });
    return null;
  }

  const permissions = await ensureEffectivePermissionContext(
    res,
    deps.permissionResolverRegistry,
    {
      planeKey: atlasPlane.data,
      tenantId: resolved.context.tenantId,
      principalId: resolved.context.principalId,
    },
  );
  const canonical = composeVerifiedRequestContext({
    identity: resolved.context,
    permissions,
    planeKey: atlasPlane.data,
    requestId: readHeader(req, "x-request-id"),
    idempotencyKey: readHeader(req, "idempotency-key"),
    correlationId:
      readHeader(req, "x-correlation-id")
      ?? resolved.context.correlationId,
  });
  if (!canonical.ok) {
    res.status(canonical.status).json({
      error: canonical.error,
      message: canonical.message,
    });
    return null;
  }

  if (!await deps.featureFlags.isEnabled(ATLAS_AGENT_FLAG, canonical.context.tenantId)) {
    deps.metrics?.recordAgentCatalogDenial?.({
      plane: canonical.context.planeKey,
      reason: "tenant_feature_disabled",
    });
    res.status(404).json({ error: "not_found" });
    return null;
  }
  if (!effectivePermissionAllows(permissions, ATLAS_AGENT_USE_PERMISSION)) {
    deps.metrics?.recordAgentCatalogDenial?.({
      plane: canonical.context.planeKey,
      reason: "permission_denied",
    });
    res.status(403).json({ error: "permission_denied" });
    return null;
  }

  storeVerifiedRequestContext(res, canonical.context);
  deps.onVerifiedContext?.(canonical.context);
  return canonical.context;
}

function effectivePermissionAllows(
  context: EffectivePermissionContext,
  permissionCode: string,
): boolean {
  return context.allowed.has(permissionCode)
    && !context.denied.has(permissionCode)
    && !context.planLocked.has(permissionCode)
    && !context.planeExcluded.has(permissionCode);
}

function readHeader(req: Request, name: string): string | undefined {
  const value = req.headers[name.toLowerCase()];
  if (typeof value === "string") return value.trim() || undefined;
  if (Array.isArray(value)) return value[0]?.trim() || undefined;
  return undefined;
}

function metricPublicModel(
  value: string,
): "atlas-fast" | "atlas-balanced" | "atlas-best" | "atlas-openai-eval" | "atlas-gemini-eval" | "unknown" {
  return value === "atlas-fast"
    || value === "atlas-balanced"
    || value === "atlas-best"
    || value === "atlas-openai-eval"
    || value === "atlas-gemini-eval"
    ? value
    : "unknown";
}
