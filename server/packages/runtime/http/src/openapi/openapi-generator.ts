/**
 * OpenAPI 3.1 Spec Generator — Sprint 31
 *
 * Generates a structured OpenAPI 3.1 JSON specification from the route
 * registry below. Serves the spec at GET /openapi.json (and the Swagger UI
 * HTML at GET /docs when NODE_ENV !== 'production').
 *
 * Design decisions:
 *   - Static registry (not Express router introspection) — introspection
 *     produces bare path strings with no schema info. A static registry lets
 *     us annotate request/response shapes accurately.
 *   - Grouped by service tag so the UI is navigable.
 *   - Schemas are lightweight inline objects — a full zod-to-schema compiler
 *     is deferred to a later sprint. Types reference $defs where reused.
 *   - Authentication: all paths use BearerAuth (JWT from Keycloak).
 *   - Tenant context: all paths require X-Org + X-Realm headers.
 *
 * Usage (Express): wire createOpenApiRouter into the API runtime and mount it.
 */

import { join } from "node:path";
import { existsSync } from "node:fs";

import express, { Router, type Request, type Response, type NextFunction } from "express";

// ── Shared schema fragments ───────────────────────────────────────────────────

const UUIDSchema    = { type: "string", format: "uuid" };
const ISODateSchema = { type: "string", format: "date-time" };
const PaginationQS  = [
  { name: "limit",  in: "query", schema: { type: "integer", default: 50, maximum: 500 } },
  { name: "offset", in: "query", schema: { type: "integer", default: 0 } },
];
const TenantHeaders = [
  { name: "X-Org",   in: "header", required: true, schema: { type: "string" }, description: "Organisation slug" },
  { name: "X-Realm", in: "header", required: false, schema: { type: "string", default: "athyper" } },
];

function ok(schema: object) {
  return {
    "200": {
      description: "Success",
      content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" }, data: schema } } } },
    },
  };
}
function created(schema: object) {
  return {
    "201": {
      description: "Created",
      content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" }, data: schema } } } },
    },
  };
}
function paginated(itemSchema: object) {
  return ok({
    type: "object",
    properties: {
      items:   { type: "array", items: itemSchema },
      hasMore: { type: "boolean" },
      total:   { type: "integer" },
    },
  });
}
function pathParam(name: string, description?: string) {
  return { name, in: "path" as const, required: true, schema: UUIDSchema, description };
}
const ERR400 = { "400": { description: "Bad request" } };
const ERR401 = { "401": { description: "Unauthorized" } };
const ERR404 = { "404": { description: "Not found" } };
const ERR409 = { "409": { description: "Conflict" } };
const ERR429 = { "429": { description: "Quota exceeded" } };

// ── Common schemas ─────────────────────────────────────────────────────────────

const ContentItemSchema = {
  type: "object",
  properties: {
    id: UUIDSchema, tenantId: UUIDSchema,
    code: { type: "string" }, title: { type: "string" },
    kind: { type: "string" }, slug: { type: "string" },
    summary: { type: "string", nullable: true },
    status: { type: "string", enum: ["DRAFT", "REVIEW", "PUBLISHED", "ARCHIVED"] },
    localeCode: { type: "string" }, createdAt: ISODateSchema, updatedAt: ISODateSchema,
  },
};

const CommentSchema = {
  type: "object",
  properties: {
    id: UUIDSchema, entityType: { type: "string" }, entityId: UUIDSchema,
    commenterId: UUIDSchema, commentText: { type: "string" },
    parentCommentId: { ...UUIDSchema, nullable: true },
    threadDepth: { type: "integer" }, replyCount: { type: "integer" },
    createdAt: ISODateSchema, updatedAt: ISODateSchema,
  },
};

const WorkflowTemplateSchema = {
  type: "object",
  properties: {
    id: UUIDSchema, code: { type: "string" }, name: { type: "string" },
    description: { type: "string", nullable: true },
    isActive: { type: "boolean" }, compiledHash: { type: "string", nullable: true },
    behaviors: { type: "object" }, slaPolicyId: { ...UUIDSchema, nullable: true },
    createdAt: ISODateSchema,
  },
};

const LegalHoldSchema = {
  type: "object",
  properties: {
    id: UUIDSchema, holdCode: { type: "string" }, name: { type: "string" },
    status: { type: "string", enum: ["active", "released", "expired"] },
    logSchemas: { type: "array", items: { type: "string" } },
    custodianId: UUIDSchema, createdAt: ISODateSchema,
  },
};

const WebhookSchema = {
  type: "object",
  properties: {
    id: UUIDSchema, targetUrl: { type: "string", format: "uri" },
    topics: { type: "array", items: { type: "string" } },
    description: { type: "string", nullable: true },
    isActive: { type: "boolean" }, maxRetries: { type: "integer" },
    lastDeliveryAt: ISODateSchema, lastDeliveryStatus: { type: "string" },
    failureCount: { type: "integer" },
  },
};

const ContentQuotaSchema = {
  type: "object",
  properties: {
    kind: { type: "string" }, currentItems: { type: "integer" },
    maxItems: { type: "integer", nullable: true },
    usagePct: { type: "integer", nullable: true },
    isWarning: { type: "boolean" }, isExceeded: { type: "boolean" },
  },
};

// ── Path definitions ───────────────────────────────────────────────────────────

type PathItem = Record<string, unknown>;
type Paths    = Record<string, PathItem>;

const paths: Paths = {

  // ══ Content ════════════════════════════════════════════════════════════════

  "/content/items": {
    get: {
      tags: ["Content"], summary: "List content items",
      parameters: [...TenantHeaders, ...PaginationQS,
        { name: "kind",   in: "query", schema: { type: "string" } },
        { name: "status", in: "query", schema: { type: "string" } },
      ],
      security: [{ BearerAuth: [] }],
      responses: paginated(ContentItemSchema),
    },
    post: {
      tags: ["Content"], summary: "Create content item",
      parameters: TenantHeaders,
      security: [{ BearerAuth: [] }],
      requestBody: {
        required: true,
        content: { "application/json": { schema: {
          type: "object", required: ["code", "title", "slug"],
          properties: {
            code: { type: "string" }, title: { type: "string" }, slug: { type: "string" },
            kind: { type: "string", default: "page" }, summary: { type: "string" },
            localeCode: { type: "string", default: "en" },
            bodyJson: { type: "object" }, bodyFormat: { type: "string", default: "slate" },
          },
        }}},
      },
      responses: { ...created(ContentItemSchema), ...ERR400, ...ERR401, ...ERR429 },
    },
  },

  "/content/items/{id}": {
    get: {
      tags: ["Content"], summary: "Get content item with current version",
      parameters: [...TenantHeaders, pathParam("id")],
      security: [{ BearerAuth: [] }],
      responses: { ...ok(ContentItemSchema), ...ERR404 },
    },
    patch: {
      tags: ["Content"], summary: "Update content item metadata",
      parameters: [...TenantHeaders, pathParam("id")],
      security: [{ BearerAuth: [] }],
      requestBody: { required: true, content: { "application/json": { schema: { type: "object" } } } },
      responses: { ...ok(ContentItemSchema), ...ERR404 },
    },
  },

  "/content/search": {
    get: {
      tags: ["Content"], summary: "Full-text search content items (FTS)",
      parameters: [...TenantHeaders,
        { name: "q",      in: "query", required: true, schema: { type: "string" } },
        { name: "kind",   in: "query", schema: { type: "string" } },
        { name: "status", in: "query", schema: { type: "string" } },
        { name: "locale", in: "query", schema: { type: "string" } },
        { name: "limit",  in: "query", schema: { type: "integer", default: 50, maximum: 200 } },
        { name: "after",  in: "query", schema: { type: "string" }, description: "Rank:id cursor" },
      ],
      security: [{ BearerAuth: [] }],
      responses: {
        "200": {
          description: "Ranked search results",
          content: { "application/json": { schema: {
            type: "object",
            properties: {
              ok: { type: "boolean" },
              data: { type: "array", items: ContentItemSchema },
              hasMore: { type: "boolean" }, nextCursor: { type: "string", nullable: true },
              query: { type: "string" },
            },
          }}},
        },
        ...ERR400, ...ERR401,
      },
    },
  },

  "/content/quota/usage": {
    get: {
      tags: ["Content"], summary: "Content quota usage per kind",
      parameters: TenantHeaders,
      security: [{ BearerAuth: [] }],
      responses: ok({ type: "array", items: ContentQuotaSchema }),
    },
  },

  "/content/quota/config": {
    get: {
      tags: ["Content"], summary: "List quota configurations",
      parameters: TenantHeaders,
      security: [{ BearerAuth: [] }],
      responses: ok({ type: "array", items: { type: "object" } }),
    },
    post: {
      tags: ["Content"], summary: "Upsert content quota for a kind",
      parameters: TenantHeaders,
      security: [{ BearerAuth: [] }],
      requestBody: { required: true, content: { "application/json": { schema: {
        type: "object", required: ["kind"],
        properties: {
          kind: { type: "string" }, maxItems: { type: "integer", nullable: true },
          maxStorageBytes: { type: "integer", nullable: true }, warnAtPct: { type: "integer", default: 80 },
        },
      }}}},
      responses: { ...created({ type: "object" }), ...ERR400 },
    },
  },

  // ══ Collab ═════════════════════════════════════════════════════════════════

  "/collab/comments": {
    get: {
      tags: ["Collab"], summary: "List root comments for an entity",
      parameters: [...TenantHeaders,
        { name: "entityType", in: "query", required: true, schema: { type: "string" } },
        { name: "entityId",   in: "query", required: true, schema: UUIDSchema },
        ...PaginationQS,
      ],
      security: [{ BearerAuth: [] }],
      responses: paginated(CommentSchema),
    },
    post: {
      tags: ["Collab"], summary: "Create a comment",
      parameters: TenantHeaders,
      security: [{ BearerAuth: [] }],
      requestBody: { required: true, content: { "application/json": { schema: {
        type: "object", required: ["entityType", "entityId", "commentText"],
        properties: {
          entityType: { type: "string" }, entityId: UUIDSchema,
          commentText: { type: "string" }, parentCommentId: { ...UUIDSchema, nullable: true },
        },
      }}}},
      responses: { ...created(CommentSchema), ...ERR400, ...ERR401 },
    },
  },

  "/collab/activity/stream": {
    get: {
      tags: ["Collab"], summary: "SSE activity stream for an entity",
      description: "Server-Sent Events stream. Events: `activity:comment`, `activity:reaction`, `activity:count`. Connect via `EventSource`.",
      parameters: [...TenantHeaders,
        { name: "entityType", in: "query", required: true, schema: { type: "string" } },
        { name: "entityId",   in: "query", required: true, schema: UUIDSchema },
      ],
      security: [{ BearerAuth: [] }],
      responses: {
        "200": {
          description: "SSE event stream",
          content: { "text/event-stream": { schema: { type: "string" } } },
        },
      },
    },
  },

  // ══ Workflow ═══════════════════════════════════════════════════════════════

  "/workflow/templates": {
    get: {
      tags: ["Workflow"], summary: "List workflow templates",
      parameters: [...TenantHeaders, ...PaginationQS,
        { name: "is_active", in: "query", schema: { type: "boolean" } },
      ],
      security: [{ BearerAuth: [] }],
      responses: paginated(WorkflowTemplateSchema),
    },
    post: {
      tags: ["Workflow"], summary: "Create workflow template with stages and rules",
      parameters: TenantHeaders,
      security: [{ BearerAuth: [] }],
      requestBody: { required: true, content: { "application/json": { schema: {
        type: "object", required: ["code", "name"],
        properties: {
          code: { type: "string" }, name: { type: "string" },
          description: { type: "string" }, behaviors: { type: "object" },
          slaPolicyId: UUIDSchema,
          stages: { type: "array", items: {
            type: "object",
            properties: {
              stage_no: { type: "integer" }, name: { type: "string" },
              mode: { type: "string", enum: ["serial", "parallel"] },
              quorum: { type: "object" }, sla_policy_id: UUIDSchema,
              rules: { type: "array", items: {
                type: "object",
                properties: {
                  priority: { type: "integer" }, conditions: { type: "object" },
                  assign_to: { type: "object", properties: {
                    type: { type: "string", enum: ["direct_principal", "role_based", "group_based", "hierarchy_based"] },
                    value: { type: "string" },
                  }},
                },
              }},
            },
          }},
        },
      }}}},
      responses: { ...created(WorkflowTemplateSchema), ...ERR400, ...ERR409 },
    },
  },

  "/workflow/templates/{id}/compile": {
    post: {
      tags: ["Workflow"], summary: "Recompile template (updates compiled_json + compiled_hash)",
      parameters: [...TenantHeaders, pathParam("id")],
      security: [{ BearerAuth: [] }],
      responses: { ...ok({ type: "object" }), ...ERR404 },
    },
  },

  "/workflow/sla-policies": {
    get: {
      tags: ["Workflow"], summary: "List SLA policies",
      parameters: [...TenantHeaders, ...PaginationQS],
      security: [{ BearerAuth: [] }],
      responses: paginated({ type: "object" }),
    },
  },

  // ══ Integration / Webhooks ═════════════════════════════════════════════════

  "/integration/webhooks": {
    get: {
      tags: ["Integration"], summary: "List webhook subscriptions",
      parameters: [...TenantHeaders, ...PaginationQS,
        { name: "isActive", in: "query", schema: { type: "boolean" } },
      ],
      security: [{ BearerAuth: [] }],
      responses: paginated(WebhookSchema),
    },
    post: {
      tags: ["Integration"], summary: "Register webhook subscription",
      parameters: TenantHeaders,
      security: [{ BearerAuth: [] }],
      requestBody: { required: true, content: { "application/json": { schema: {
        type: "object", required: ["targetUrl"],
        properties: {
          targetUrl: { type: "string", format: "uri" },
          signingSecret: { type: "string", description: "HMAC-SHA256 signing secret. Never returned in GET responses." },
          topics: { type: "array", items: { type: "string" }, description: "Use ['*'] for all topics." },
          description: { type: "string" },
          maxRetries: { type: "integer", default: 3 }, timeoutMs: { type: "integer", default: 10000 },
        },
      }}}},
      responses: { ...created(WebhookSchema), ...ERR400, ...ERR401 },
    },
  },

  "/integration/webhooks/{id}/disable": {
    post: {
      tags: ["Integration"], summary: "Disable a webhook subscription",
      parameters: [...TenantHeaders, pathParam("id")],
      security: [{ BearerAuth: [] }],
      responses: { ...ok(WebhookSchema), ...ERR404 },
    },
  },

  // ══ Audit / Legal Holds ════════════════════════════════════════════════════

  "/audit/legal-holds": {
    get: {
      tags: ["Audit"], summary: "List legal holds",
      parameters: [...TenantHeaders, ...PaginationQS,
        { name: "status", in: "query", schema: { type: "string", enum: ["active", "released", "expired"] } },
      ],
      security: [{ BearerAuth: [] }],
      responses: paginated(LegalHoldSchema),
    },
    post: {
      tags: ["Audit"], summary: "Create legal hold",
      parameters: TenantHeaders,
      security: [{ BearerAuth: [] }],
      requestBody: { required: true, content: { "application/json": { schema: {
        type: "object", required: ["holdCode", "name", "logSchemas"],
        properties: {
          holdCode: { type: "string", pattern: "^[a-z0-9-]{1,60}$" },
          name: { type: "string" }, logSchemas: { type: "array", items: { type: "string" } },
          custodianId: UUIDSchema,
        },
      }}}},
      responses: { ...created(LegalHoldSchema), ...ERR409 },
    },
  },

  "/audit/legal-holds/{id}/release": {
    patch: {
      tags: ["Audit"], summary: "Release a legal hold",
      parameters: [...TenantHeaders, pathParam("id")],
      security: [{ BearerAuth: [] }],
      requestBody: { required: true, content: { "application/json": { schema: {
        type: "object", required: ["releaseReason"],
        properties: { releaseReason: { type: "string" } },
      }}}},
      responses: { ...ok(LegalHoldSchema), ...ERR404, ...ERR409 },
    },
  },

  // ══ Policy ═════════════════════════════════════════════════════════════════

  "/policy/rules/{ruleId}/versions": {
    get: {
      tags: ["Policy"], summary: "Rule change history (version log)",
      parameters: [...TenantHeaders, { ...pathParam("ruleId"), description: "Policy rule UUID" }],
      security: [{ BearerAuth: [] }],
      responses: ok({ type: "array", items: { type: "object" } }),
    },
  },

  "/policy/test-cases/{tcId}/run": {
    post: {
      tags: ["Policy"], summary: "Run a single policy test case",
      parameters: [...TenantHeaders, pathParam("tcId")],
      security: [{ BearerAuth: [] }],
      responses: ok({ type: "object", properties: {
        passed: { type: "boolean" }, actual: { type: "object" }, expected: { type: "object" }, latencyMs: { type: "integer" },
      }}),
    },
  },
};

// ── Spec assembly ─────────────────────────────────────────────────────────────

export function buildOpenApiSpec(info?: { version?: string }): object {
  return {
    openapi: "3.1.0",
    info: {
      title:       "Athyper Platform API",
      version:     info?.version ?? "1.0.0",
      description: "Runtime API for the Athyper ERP / workflow platform. All endpoints require JWT Bearer authentication and tenant context headers (X-Org, X-Realm).",
      contact:     { name: "Athyper Platform Team" },
    },
    externalDocs: {
      description: "Platform Documentation (guides, runbooks, tenant setup)",
      url:         "/docs/guides",
    },
    servers: [
      { url: "/api", description: "Runtime API (via BFF relay)" },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: "http", scheme: "bearer", bearerFormat: "JWT",
          description: "Keycloak-issued JWT access token",
        },
      },
      schemas: {
        UUID:        UUIDSchema,
        ISODate:     ISODateSchema,
        ContentItem: ContentItemSchema,
        Comment:     CommentSchema,
        WebhookSubscription: WebhookSchema,
        LegalHold:   LegalHoldSchema,
        WorkflowTemplate: WorkflowTemplateSchema,
        ContentQuotaUsage: ContentQuotaSchema,
      },
    },
    tags: [
      { name: "Content",     description: "CMS content items, FTS search, and quota management" },
      { name: "Collab",      description: "Comments, reactions, mentions, and live activity streams" },
      { name: "Workflow",    description: "Workflow templates, stages, rules, and SLA policies",
        externalDocs: { description: "RB-05 Workflow Recovery", url: "/docs/guides/runbooks/rb-05-workflow-recovery.md" } },
      { name: "Integration", description: "Webhooks, outbox, deliveries, and connector management",
        externalDocs: { description: "RB-01 Outbox Drain Runbook", url: "/docs/guides/runbooks/rb-01-outbox-drain.md" } },
      { name: "Audit",       description: "Legal holds, governance cycles, and moderation",
        externalDocs: { description: "RB-03 Legal Hold Runbook", url: "/docs/guides/runbooks/rb-03-legal-hold.md" } },
      { name: "Policy",      description: "Policy definitions, rules, versioning, and test cases" },
    ],
    paths,
  };
}

// ── Express router ─────────────────────────────────────────────────────────────

export interface OpenApiRouterOptions {
  version?: string;
  /**
   * Bearer-verifier for gating /openapi.{json,yaml}. When `requireAuth` is
   * true, callers must present a valid JWT. In local/staging we leave the
   * spec open so openapi-client generators and CI tooling can pull it
   * unauthenticated; in production it's an attack-surface map (endpoint
   * paths, tenant header contract, schema field names) and gets gated.
   */
  authVerify?: (token: string) => Promise<unknown>;
  requireAuth?: boolean;
  serveDocs?: boolean;
}

export function createOpenApiRouter(options?: OpenApiRouterOptions): Router {
  const router = Router();
  const spec   = buildOpenApiSpec(options);
  const specJson = JSON.stringify(spec, null, 2);

  const gate: (req: Request, res: Response, next: NextFunction) => void =
    options?.requireAuth && options.authVerify
      ? (req, res, next) => {
          const header = req.headers.authorization;
          if (!header || !header.startsWith("Bearer ")) {
            res.status(401).json({ error: "UNAUTHORIZED", message: "Bearer token required" });
            return;
          }
          void options.authVerify!(header.slice("Bearer ".length))
            .then(() => next())
            .catch(() => {
              res.status(401).json({ error: "UNAUTHORIZED", message: "Invalid bearer token" });
            });
        }
      : (_req, _res, next) => next();

  // Serve the raw spec (Bearer-gated in production; open elsewhere)
  router.get("/openapi.json", gate, (_req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (!options?.requireAuth) res.setHeader("Access-Control-Allow-Origin", "*");
    res.send(specJson);
  });

  // Serve YAML alias
  router.get("/openapi.yaml", gate, (_req, res) => {
    res.setHeader("Content-Type", "application/yaml");
    if (!options?.requireAuth) res.setHeader("Access-Control-Allow-Origin", "*");
    res.send(specJson); // Clients can parse JSON as YAML superset
  });

  // Non-production: serve docs/ as static files at /docs/guides
  // and expose the Swagger UI with a documentation navigation bar.
  if (options?.serveDocs ?? process.env["NODE_ENV"] !== "production") {
    // Resolve docs directory relative to the server package root (process.cwd() = server/).
    // Works for both tsx dev mode and compiled dist/ mode when started from server/.
    const docsDir = join(process.cwd(), "../docs");
    if (existsSync(docsDir)) {
      router.use(
        "/docs/guides",
        express.static(docsDir, {
          index:    false,   // no auto index.html
          dotfiles: "deny",
          setHeaders(res, filePath) {
            if (filePath.endsWith(".md")) {
              // Serve markdown as plain text so browsers display it without download prompt
              res.setHeader("Content-Type", "text/plain; charset=utf-8");
            }
          },
        }),
      );
    }

    // Documentation index page at /docs/guides
    router.get("/docs/guides", (_req, res) => {
      res.setHeader("Content-Type", "text/html");
      res.send(`<!DOCTYPE html>
<html>
<head>
  <title>Athyper Platform Documentation</title>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; max-width: 860px; margin: 40px auto; padding: 0 20px; color: #1a1a2e; }
    h1 { font-size: 1.8rem; border-bottom: 2px solid #0078d4; padding-bottom: 8px; }
    h2 { font-size: 1.2rem; color: #0078d4; margin-top: 28px; }
    ul { padding-left: 20px; line-height: 2; }
    a { color: #0078d4; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .badge { font-size: 0.75rem; background: #e8f4fd; color: #0078d4; border-radius: 4px; padding: 2px 6px; margin-left: 6px; }
    .back { font-size: 0.9rem; margin-bottom: 20px; }
  </style>
</head>
<body>
  <p class="back"><a href="/docs">← API Reference (Swagger UI)</a></p>
  <h1>Platform Documentation</h1>

  <h2>Guides</h2>
  <ul>
    <li><a href="/docs/guides/onboarding/README.md">Developer Onboarding</a> <span class="badge">Final</span> — prerequisites, monorepo structure, local setup, adding entities + workers, testing, PR workflow, common pitfalls</li>
    <li><a href="/docs/guides/tenant-setup/README.md">Tenant Provisioning</a> <span class="badge">Final</span> — three-phase seed system, migrate.ts CLI, adding a new tenant, industry blueprint packs, idempotency</li>
    <li><a href="/docs/guides/metadata/README.md">Metadata Control Plane</a> <span class="badge">Final</span> — three-zone model (design / compile / runtime), descriptor caching, entity policies, admin API reference</li>
  </ul>

  <h2>Operational Runbooks <span class="badge">Final — ops-validated Sprint 44</span></h2>
  <ul>
    <li><a href="/docs/guides/runbooks/rb-01-outbox-drain.md">RB-01 Outbox Drain Monitoring + Recovery</a> <span class="badge">P1</span></li>
    <li><a href="/docs/guides/runbooks/rb-02-audit-partition-lifecycle.md">RB-02 Audit Partition Lifecycle</a> <span class="badge">P1</span></li>
    <li><a href="/docs/guides/runbooks/rb-03-legal-hold.md">RB-03 Legal Hold Activation + Release</a> <span class="badge">P1</span></li>
    <li><a href="/docs/guides/runbooks/rb-04-idp-kc-sync.md">RB-04 IdP / Keycloak Sync Troubleshooting</a> <span class="badge">P1</span></li>
    <li><a href="/docs/guides/runbooks/rb-05-workflow-recovery.md">RB-05 Workflow Recovery: Stuck Instances</a> <span class="badge">P1</span></li>
    <li><a href="/docs/guides/runbooks/rb-06-descriptor-cache.md">RB-06 Descriptor Cache Invalidation</a> <span class="badge">P2</span></li>
  </ul>
</body>
</html>`);
    });

    // Swagger UI with documentation navigation bar
    router.get("/docs", (_req, res) => {
      res.setHeader("Content-Type", "text/html");
      res.send(`<!DOCTYPE html>
<html>
<head>
  <title>Athyper API Docs</title>
  <meta charset="utf-8">
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
  <style>
    #docs-nav {
      background: #1a1a2e; color: #e8e8e8;
      padding: 8px 20px; display: flex; align-items: center; gap: 20px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 13px; flex-wrap: wrap;
    }
    #docs-nav .nav-label { font-weight: 600; color: #a0c4ff; flex-shrink: 0; }
    #docs-nav a { color: #c8d8f0; text-decoration: none; white-space: nowrap; }
    #docs-nav a:hover { color: #ffffff; text-decoration: underline; }
    #docs-nav .sep { color: #555; }
  </style>
</head>
<body>
  <div id="docs-nav">
    <span class="nav-label">Guides:</span>
    <a href="/docs/guides">All Docs</a>
    <span class="sep">|</span>
    <a href="/docs/guides/onboarding/README.md">Developer Onboarding</a>
    <span class="sep">|</span>
    <a href="/docs/guides/tenant-setup/README.md">Tenant Provisioning</a>
    <span class="sep">|</span>
    <a href="/docs/guides/metadata/README.md">Metadata Control Plane</a>
    <span class="sep">|</span>
    <a href="/docs/guides/runbooks/README.md">Runbooks</a>
  </div>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUIBundle({
      url: "/api/openapi.json",
      dom_id: "#swagger-ui",
      presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset],
      layout: "StandaloneLayout",
    });
  </script>
</body>
</html>`);
    });
  }

  return router;
}
