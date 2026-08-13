# Frontend spine reference disposition

Status: Phase 0 baseline

The application and package trees under `apps-backup/` and `packages-backup/` are read-only reference material. They may be inspected for behavior, interaction details, tests, and visual intent. They are not active package authorities and must never be imported, linked, aliased, transpiled, or included by the pnpm workspace.

## Shared decisions

| Capability | Retain as behavior | Rebuild differently | Retire |
|---|---|---|---|
| Authentication | safe return paths, PKCE/state/nonce validation, required-action handling, logout, context selection, branded progress and failure states | server-only token/session ownership, explicit conditional exports, one sanitized session contract, exact-plane bootstrap | browser-visible access tokens, permissive fallback sessions, duplicated app-specific auth algorithms |
| Shell | responsive rail/drawer, account menu, context affordance, breadcrumbs, keyboard and focus behavior | small shared shell packages with plane-owned registries and DDL-backed grouping | business behavior inside shell components, a single oversized UI barrel |
| Navigation | workspace grouping, module identity, clear landing routes | join plane route registries to the published workspace/module catalog, entitlements, permissions, and effective flags | static source mirror of workspace/module database relationships |
| Data access | typed errors, cancellation, query caching, safe empty responses | same-origin BFF transport with request-scoped client injection and context-keyed caches | process-global client setters and direct browser-to-platform bearer calls |
| Boundaries | branded loading, not-found, forbidden, retryable service failure | shared taxonomy based on platform problems and request IDs | raw provider/server errors and stack traces in user surfaces |

## Neon

Reference locations reviewed:

- `apps-backup/neon/app/(public)/*` for login, logout, context, required-action, loading, and error journeys;
- `apps-backup/neon/app/(shell)/*` for shell composition and deep-link behavior;
- `apps-backup/neon/app/api/auth/*` and `app/api/relay/*` for security scenarios and route-test ideas;
- `packages-backup/products/neon/navigation/*` for route labels and prior workspace grouping;
- `packages-backup/products/neon/{app,shell,runtime}/*` for composition responsibilities.

Neon retains the broad enterprise workspace concept, responsive shell behavior, and safe deep-link return journey. It rebuilds navigation from active plane catalogs plus a typed Neon route registry. The static `MODULE_WORKSPACE_MAP` and the previous page/package graph are not authorities.

Phase 0 active target: `apps/neon` renders `@athyper/product-neon-app` only. Authentication, shell, and business routes remain later phases.

## Mesh

Reference locations reviewed:

- `apps-backup/mesh/app/(public)/*` and `app/api/auth/*` for identity journeys;
- `apps-backup/mesh/app/(shell)/*` for partner-facing shell and governance/workbench entry points;
- `apps-backup/mesh/app/api/relay/*` for plane-isolation tests;
- `packages-backup/products/mesh/{app,shell,runtime,navigation}/*` and `packages-backup/mesh/*` for prior composition.

Mesh retains strict plane identity, compact navigation, and partner/network language. It rebuilds from Mesh-owned active packages and never consumes Neon packages or routes. Direct database adapters in frontend dependencies are retired.

Phase 0 active target: `apps/mesh` renders `@athyper/product-mesh-app` only.

## Studio

The previous Studio application used the directory name `admin`; that name is reference terminology only.

Reference locations reviewed:

- `apps-backup/admin/app/(public)/*` and `app/api/auth/*` for internal/support login journeys;
- `apps-backup/admin/app/(shell)/*` for administrative shell, setup, metadata, and control surfaces;
- `packages-backup/products/admin/{app,shell,runtime,navigation}/*` for composition and route ideas;
- `packages-backup/platform/iam/identity-gate/*` for elevated/support-session presentation patterns.

Studio retains explicit internal context, elevated-action visibility, and control-plane visual distinction. It rebuilds under the canonical `studio` plane name and consumes only Studio and shared active packages. Legacy admin package identities and direct control-authority assumptions in UI components are retired.

Phase 0 active target: `apps/studio` renders `@athyper/product-studio-app` only.

## Acceptance evidence

- `scripts/policy/verify-frontend-spine-governance.mjs` rejects reference-tree imports and workspace inclusion.
- `scripts/policy/verify-canonical-package-rules.mjs` enforces same-plane product dependencies.
- `tests/contracts/frontend-spine-{browser,server}-contracts.test.ts` validate the shared fixtures from both sides of the wire boundary.
- clean application builds prove that each app composes only its active same-plane package.

Future reference review must update this document only when it changes a retained behavior or a deliberate retirement decision. It must not result in an active import from a reference root.
