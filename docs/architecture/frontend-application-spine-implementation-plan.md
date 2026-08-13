# Frontend Application Spine Implementation Plan

Status: proposed

Scope: `apps/{neon,mesh,studio}` and the shared packages required to make those applications secure, deployable, and ready for business modules

Reference policy: the code in `apps-backup/` and `packages-backup/` is retained as read-only behavioral evidence and design inspiration; it is not an implementation source, runtime dependency, compatibility layer, or package authority

## 1. Outcome

Build one production-grade application spine that all three frontend applications compose:

1. theme, brand, icons, and accessible UI primitives;
2. a typed, transport-only API client;
3. server-owned authentication and sessions;
4. a hardened same-origin BFF relay;
5. request-scoped providers and query-cache lifecycle;
6. consistent error, loading, empty, offline, and not-found boundaries;
7. a responsive shell and plane-owned navigation registries;
8. server-derived permissions, entitlements, and effective feature flags.

The spine is complete when Neon, Mesh, and Studio can authenticate, load a sanitized bootstrap projection, render the correct themed shell and permitted navigation, relay an authenticated request to the rebuilt platform host, handle failure safely, switch or revoke context without stale data, and pass contract, accessibility, security, and deployment tests.

Business-module screens are explicitly outside this plan. They start only after the spine exit gate passes.

## 2. Decisions to lock before implementation

### 2.1 Canonical package layout

Use the active layout already represented in the ownership matrix:

```text
apps/{neon,mesh,studio}                 Next.js composition and deployment entries
packages/contracts/platform/*          browser-safe transport contracts
packages/platform/foundation/*         framework-neutral foundation and UI
packages/platform/iam/*                session, BFF auth, and identity gates
packages/platform/gateway/*            same-origin upstream relay
packages/platform/shell/*              shared providers and shell
packages/planes/<plane>/*               plane route registry, shell policy, navigation
server/packages/platform/*              server-side policy and experience read models
server/apps/platform-host               HTTP composition root
```

Do not introduce a second `packages/product/*` hierarchy. First update `docs/architecture/canonical-package-rules.md` and `scripts/policy/verify-canonical-package-rules.mjs` so `packages/planes/*` is classified as product-specific code and plane isolation is enforced. The workspace, ownership matrix, and policy must describe the same graph before substantive code lands.

### 2.2 One-way dependencies

```text
apps/*
  -> packages/planes/<same-plane>/*
  -> packages/platform/shell/* and packages/platform/iam/identity-gate

packages/planes/*
  -> packages/platform/*
  -> packages/contracts/*

packages/platform/*
  -> packages/contracts/*

server/packages/*
  -> neutral packages/contracts/* where a wire schema is shared
  -> server contracts/foundation/adapters
```

Forbidden dependencies:

- any active code importing `apps-backup/*`, `packages-backup/*`, or `server-backup/*`;
- server code importing React, Next.js, UI packages, or plane frontend packages;
- platform packages importing a plane package;
- one plane importing another plane;
- UI primitives importing business rules, entity runtime, finance rules, or API clients;
- browser code importing the session store, OAuth client secret, access token, or direct platform-host URL.

### 2.3 Reference-code protocol

For each spine capability, record a short reference disposition before implementing it:

| Field | Meaning |
|---|---|
| Reference paths | Relevant old pages, packages, tests, and screenshots |
| Behaviors retained | User-visible or security behavior still required |
| Behaviors changed | Deliberate improvement with rationale |
| Behaviors retired | Obsolete behavior that must not return |
| New authority | Active DDL, server route, contract, or new package owning the behavior |
| Acceptance evidence | Contract, unit, integration, E2E, visual, or accessibility test |

Use reference code to answer “what behavior existed?” and “what usability details worked?” Do not preserve its internal package graph. In particular:

- do not reproduce the reference query package's process-global `setClients()` singletons;
- do not expose browser access tokens as the reference API client's `FetchConfig` did;
- do not reproduce the static module-to-workspace mirror from the reference navigation package;
- do not rebuild the old oversized UI package as one undifferentiated export barrel;
- do not reproduce every legacy API route merely because a corresponding page existed.

## 3. Current authority and capability map

### 3.1 Authentication and session authority

| Concern | Current authority | Spine implication |
|---|---|---|
| Login and token issuance | Keycloak | The frontend BFF performs Authorization Code + PKCE; the platform host does not issue login sessions. |
| API token verification | `server/packages/platform/iam` and the Keycloak adapter | The BFF sends a bearer token and `x-plane`; the browser never sends a platform bearer token. |
| Verified request identity | `/api/iam/me` and `VerifiedRequestContext` | This is the current authenticated identity baseline. It already exposes plane, realm, tenant, principal, auth epoch, and effective permission codes. |
| External identity mapping | `master.principal_identity_binding` | Bootstrap/profile services resolve the provider subject to the plane-local principal; the UI must never infer that mapping. |
| Interactive web session | Redis through `packages/platform/iam/session-store` | Session state is server-only, fail-closed, revocable, and namespaced by plane and realm. It is not persisted in browser storage or application DDL. |
| Required account actions | Keycloak claims plus `server/packages/platform/iam/required-actions.ts` | The identity gate renders required-action UX, but API enforcement remains server-side. |

The active platform host currently expects `Authorization: Bearer`, `x-plane`, and optional verified context headers. It does not yet expose the old `/api/session/bootstrap` or `/api/session/contexts` behavior. The new design must not route the frontend back to legacy session endpoints.

### 3.2 UI profile and preferences authority

The current plane DDL already separates:

- `master.principal_ui_profile`: typed locale, language, timezone, date format, number format, week start, appearance, and density;
- `master.principal_ui_preference`: small registered per-surface overrides, capped at 8 KiB;
- `master.principal_notification_preference`: notification-specific choices.

Use `principal_ui_profile` for theme/density/locale bootstrap. Use `principal_ui_preference` only for registered small UI settings such as shell collapse or a default landing surface. Do not put saved views, layouts, recents, histories, documents, or other large payloads into this table. The existing saved-view repository's use of `principal_ui_preference` conflicts with the DDL comment and should be remediated separately rather than copied into the new spine.

### 3.3 Navigation, entitlement, permission, and feature authority

| Concern | DDL/server authority | Rule |
|---|---|---|
| Plane admission | `authz.plane_membership` | Admission is a gate and grants no permissions. |
| Permissions | `authz.permission`, roles, groups, grants, scopes; currently projected into the verified permission snapshot | UI visibility may use the snapshot, but every server operation still authorizes. |
| Workspaces/modules | `control.workspace`, `control.module`, `control.workspace_module` | Labels, sort order, workspace grouping, status, and icon keys come from the published plane-local catalog. |
| Plan entitlement | `master.tenant.subscription_plan_id`, `control.subscription_plan_module` | Entitlement exposes a module; it never grants permission. |
| Feature flags | `control.feature_flag_catalog`, `control.feature_flag_override` | Resolve effective tenant/principal state server-side, including window, override, rollout cohort, kill switch, and client-version rules. |
| Frontend route | plane navigation registry in `packages/planes/<plane>` | `href`, route ID, component ownership, and frontend-only presentation live in code, not DDL. |

Effective UI availability is the intersection:

```text
authenticated and active session
AND admitted to the plane
AND module is active and included in the tenant plan
AND required permission is allowed for the current context/scope
AND all required feature decisions are enabled
AND the plane route registry has a valid route
```

This intersection affects presentation only. It is never an authorization substitute.

### 3.4 Server gaps that must be closed for the spine

The rebuilt server currently has `/api/iam/me`, saved-view routes, notification preferences, and Studio control-admin routes. It does not yet have a non-admin, principal-scoped read model for:

- principal display/profile plus typed UI profile;
- effective workspace/module entitlement;
- effective feature decisions in one bounded call;
- a shell/bootstrap revision that can safely key caches;
- general small UI preference reads/writes.

`server/packages/platform/features` and `server/packages/platform/entitlements` currently provide domain functions, while `server/packages/platform/control-admin` provides administrative evaluation and mutation services. The browser must not consume control-admin endpoints merely to render navigation.

Add an experience-facing read service, preferably `server/packages/platform/experience`, with exact-plane repositories and no UI dependency. Reuse or extract the effective flag and entitlement evaluation algorithms; do not duplicate them in the BFF or browser.

### 3.5 Server-package change map

| Existing package | Reuse | Required change |
|---|---|---|
| `server/packages/contracts/auth` | `VerifiedRequestContext`, permission snapshot, authenticator ports | Keep as the internal security contract. Do not expose it wholesale to the browser. |
| `server/packages/platform/iam` | token verification, required actions, `/api/iam/me`, authentication middleware | Ensure plane membership/projection verification is part of the enforced authenticated context used by experience bootstrap. Keep login/session issuance out of this package. |
| `server/packages/platform/features` | feature lifecycle/version validation | Add or extract a reusable effective-decision service; use the control catalog/override repository rather than adding browser-side calculation. |
| `server/packages/platform/entitlements` | plan revision and entitlement evaluation rules | Add a current-tenant resolver backed by `master.tenant.subscription_plan_id` and plane-local control tables. |
| `server/packages/platform/control-admin` | authoring/admin services and exact-plane repository contracts | Leave admin endpoints restricted. Share lower-level evaluation ports/functions, not administrative route access. |
| `server/packages/platform/preferences` | exact-plane transaction patterns and preference repository experience | Add typed UI-profile/preference services or move them into the new experience package. Do not reuse the current saved-view storage decision. |
| database adapters | Kysely connections and exact-plane transaction coordination | Implement read repositories for principal/profile, workspace/module, plan entitlement, and effective flags. No cross-plane fallback. |
| `server/packages/runtime/http` | problem responses, route contracts, OpenAPI registration | Define all experience routes through route contracts and shared wire schemas. |
| `server/apps/platform-host` | composition root and capability registration | Register the experience service only when IAM and the exact target-plane repositories are available; expose readiness for the dependency. |

### 3.6 DDL change policy

The initial bootstrap read path should use the current DDL without a schema redesign. Authentication sessions remain in Redis, not PostgreSQL. Do not add a frontend-specific navigation table because the workspace/module catalog already exists.

Allow only justified additive DDL during spine work:

- add an optimistic concurrency column to `master.principal_ui_profile` and registered small preferences if profile mutation cannot be made safe using an existing revision/`updated_at` contract;
- add a lightweight projection/catalog revision source only if computing a stable bootstrap fingerprint from existing row revisions and timestamps is too expensive;
- add indexes only from measured bootstrap query plans;
- add no token, cookie, raw claim, route `href`, React component name, or browser cache state columns;
- handle saved-view storage in a separate correction plan because the DDL explicitly excludes saved views from `principal_ui_preference`.

Every additive DDL change needs the normal domain, constraint, index, trigger, RLS, grant, seed, and integration-test treatment for Studio, Neon, and Mesh. No frontend code may bypass RLS by selecting tables directly.

## 4. Target bootstrap contract

Create browser-safe, versioned schemas in the existing contract packages:

- `@athyper/contract-platform-api`: problem details, request metadata, pagination primitives, idempotency metadata;
- `@athyper/contract-platform-auth-session`: sanitized BFF session and session-state transitions;
- `@athyper/contract-platform-authorization`: permission and feature decision types;
- `@athyper/contract-platform-navigation`: workspace, module, and resolved navigation input types.

The server experience endpoint should return one projection similar to:

```ts
interface ExperienceBootstrapV1 {
  schemaVersion: 1;
  generatedAt: string;
  revision: string;
  context: {
    plane: "neon" | "mesh" | "studio";
    realmKey: string;
    tenantId: string;
    principalId: string;
    authEpoch: number;
  };
  tenant: { id: string; code: string; displayName: string };
  principal: {
    id: string;
    displayName: string;
    requiredActions: readonly string[];
  };
  uiProfile: {
    locale?: string;
    language?: string;
    timezone?: string;
    dateFormat?: string;
    numberFormat?: string;
    weekStart?: number;
    appearance: "light" | "dark" | "system";
    density: "comfortable" | "compact";
  };
  permissions: {
    profileHash: string;
    allowed: readonly string[];
  };
  workspaces: readonly {
    code: string;
    name: string;
    iconKey?: string;
    sortOrder: number;
    modules: readonly string[];
  }[];
  modules: readonly {
    code: string;
    name: string;
    iconKey?: string;
    primaryWorkspaceCode?: string;
  }[];
  features: Readonly<Record<string, {
    enabled: boolean;
    source: "catalog" | "tenant_override" | "kill_switch";
    revision: string;
  }>>;
}
```

Final field names must be schema-tested; the important boundary is that no access token, refresh token, Keycloak raw claim set, group membership internals, role graph, secrets, or unrestricted DDL metadata crosses into this response.

Recommended server routes:

| Route | Purpose |
|---|---|
| `GET /api/platform/experience/bootstrap` | Principal-scoped bootstrap projection for the current verified context |
| `GET /api/platform/experience/ui-profile` | Optional independent profile refresh |
| `PATCH /api/platform/experience/ui-profile` | Typed, optimistic update of locale/theme/density defaults |
| `GET /api/platform/experience/preferences` | Registered small preference reads |
| `PUT /api/platform/experience/preferences/:code` | Registered, size-limited preference update |

The bootstrap route must be a projection, not an aggregate of browser calls. Build it inside one exact-plane read transaction where practical. Cache only computed catalog portions; bind all principal-specific values to `(plane, tenantId, principalId, authEpoch, profileHash, catalogRevision)`.

## 5. Implementation phases

### Phase 0 — Governance, contracts, and executable skeleton

### Work

1. Align package policy with `packages/planes/*` and update the ownership inventory.
2. Add a policy check prohibiting source imports from all backup roots.
3. Add explicit browser/server conditional exports where needed:
   - `auth-bff` and `session-store` are server-only;
   - identity-gate UI is client-safe;
   - contract packages contain no Node, React, Next.js, or database imports.
4. Establish package test conventions: unit, contract, browser/component, integration, and E2E.
5. Create a spine reference-disposition document covering Neon, Mesh, and Studio auth/shell flows.
6. Create the initial transport schemas and fixtures before endpoint or component code.
7. Make all three apps render a minimal page using only active packages and no backup imports.

### Exit gate

- canonical package, source-junction, workspace-resolution, shared-purity, and plane-boundary policies pass;
- every active spine package has an owner, classification, and dependency budget;
- contract fixtures validate in both server and frontend tests;
- backup directories are outside the active workspace and dependency graph.

### Phase 1 — Theme, brand, icons, and UI primitives

### Package responsibilities

`packages/platform/foundation/brand`

- plane brand metadata, asset descriptors, wordmarks, application names, favicons, and safe public URLs;
- no color-mode state and no React requirement for metadata access.

`packages/platform/foundation/theme`

- semantic design tokens, light/dark modes, density scales, motion preferences, focus styles, typography, radii, elevation, and z-index contracts;
- CSS variables and Tailwind v4 integration;
- a tiny `ThemeScript` or equivalent to apply the persisted/inherited mode before paint;
- resolver precedence: validated session profile -> tenant/platform default -> operating-system preference.

`packages/platform/foundation/icons`

- stable semantic icon keys and a typed resolver;
- unknown keys render a safe fallback and emit development diagnostics;
- tree-shakable exports rather than a single eager icon map.

`packages/platform/foundation/ui`

- accessible primitives only: button, input, label, checkbox, select, tabs, tooltip, menu, dialog, toast, card, badge, separator, skeleton, visually hidden, focus guard;
- controlled and uncontrolled behavior explicitly tested;
- no entity, finance, workflow, navigation, session, API, or query imports.

`packages/platform/foundation/surface-kit`

- composed interaction surfaces: page, form drawer, context drawer, confirm dialog, popover, overlay, and surface-stack rules;
- depends on platform UI, not the reverse.

### Reference use

Review the reference theme tokens, primitive ergonomics, responsive behavior, keyboard behavior, surface-stack tests, and visual snapshots. Recreate the smallest coherent primitive set required by auth and shell. Do not initially recreate accounting, runtime, data-table, or business-specific components from the old UI barrel.

### Required tests

- token completeness for light, dark, high-contrast, compact, and comfortable modes;
- no unthemed first paint in a production Next.js render;
- keyboard, focus, ARIA, reduced-motion, and touch-target checks;
- primitive interaction tests and visual snapshots;
- package purity and tree-shaking smoke test;
- CSS/token size budget.

### Exit gate

The login skeleton, error page, toast, dialog, and empty shell frame can be built entirely from active foundation packages, with zero business-package dependencies and no critical accessibility violations.

### Phase 2 — Transport contracts and API client

### API-client design

Build `@athyper/platform-api-client` as a React-free transport package. It must:

- call same-origin BFF paths by default (`/api/relay/...`), never a public API base URL from browser code;
- parse the platform host's `application/problem+json` format and tolerate empty `204` responses;
- preserve request/correlation IDs in errors;
- safely encode dynamic path segments;
- support JSON, form data, binary downloads, upload progress strategy, and streamed responses;
- accept an `AbortSignal` and cancel on navigation, logout, or context change;
- attach CSRF for unsafe same-origin BFF requests;
- attach `Idempotency-Key` only when a typed operation declares it;
- apply timeouts by request class without buffering streams;
- never retry mutations automatically;
- classify authentication, authorization, validation, conflict, rate-limit, dependency, network, abort, timeout, and parse failures;
- redact headers and response bodies from diagnostics by default.

Recommended exports:

```text
createHttpClient
ApiProblem
ApiTransportError
encodePathSegment
requestJson / requestVoid / requestStream / requestBlob
createOperation (typed method/path/schema declaration)
```

Domain clients should be small packages or subpath exports added by later vertical slices. Do not put every future service client into one mutable singleton.

### Contract discipline

- Validate response data at the boundary for bootstrap, session, authorization, and navigation.
- Generate or verify OpenAPI from server route contracts.
- Add compatibility fixtures shared between server route tests and client parser tests.
- Reject hand-maintained server/frontend DTO pairs that are structurally similar but independently authoritative.

### Exit gate

A contract test can call a fake same-origin relay, parse success and current platform problems, propagate cancellation, stream without buffering, and prove that no browser request contains a bearer token.

### Phase 3 — Session and authentication foundation

### Session model

Keep `@athyper/platform-iam-session` browser-safe and minimal. It defines sanitized session state and pure decisions. Keep `@athyper/platform-iam-session-store` server-only and Redis-backed.

The current session types should be expanded carefully to include:

- plane and realm binding;
- tenant, principal, and provider-session identifiers;
- encrypted token bundle or opaque token reference stored only on the server;
- access-token expiry and refresh coordination metadata;
- auth epoch and session version;
- required actions and assurance/elevation state;
- idle and absolute expiry;
- configuration revision used to invalidate stale sessions.

Do not put raw tokens into the serialized `/api/auth/session` result. That response contains only safe context, expiry hints, and allowed next actions.

### Redis requirements

- atomic create, rotate, revoke, principal-wide revoke, provider-session revoke, one-time state consume, and refresh lock;
- separate namespaces by plane and realm;
- hashed opaque session IDs in `HttpOnly`, `Secure`, `SameSite=Lax`, path `/`, host-prefixed cookies in production;
- no permissive in-memory fallback outside tests;
- fail closed when Redis health or atomic scripts are unavailable;
- session fixation protection on login, context switch, elevation, and privilege change;
- bounded idle touch writes;
- concurrent refresh coalescing;
- back-channel logout support;
- key-rotation/version strategy and operational metrics.

### OAuth/OIDC flow

Implement Authorization Code + PKCE with state and nonce. The BFF owns callback verification and token exchange. Validate issuer, audience/client, nonce, state, token times, plane, realm, authorized role, and required context claims. Sanitize `returnTo` to local routes only.

### Authentication routes in each app

Use thin app route files delegating to shared handlers:

```text
/api/auth/login
/api/auth/callback
/api/auth/logout
/api/auth/session
/api/auth/session/context
/api/auth/touch
/api/auth/backchannel-logout
/api/auth/step-up/start
/api/auth/mfa/verify
```

Only implement step-up/MFA routes when the current Keycloak and server contract supports them. Until then, return an explicit unavailable problem rather than a simulated success.

### Exit gate

Login, callback, session read, idle touch, refresh, logout, concurrent refresh, expired token, revoked provider session, Redis outage, bad state/nonce, unsafe `returnTo`, wrong plane, and pending required-action tests pass. Browser storage and browser network traces contain no access or refresh token.

### Phase 4 — Hardened BFF relay

Build `@athyper/platform-gateway-bff-relay` as the only browser-to-platform-host path.

### Request policy

- start from an allowlisted upstream path/method contract; do not provide an unrestricted open proxy;
- remove client-supplied `Authorization`, `x-plane`, `x-tenant-id`, `x-principal-id`, `x-realm`, `x-organization-id`, and forwarding headers;
- inject bearer token and verified plane/context from the server session;
- verify same-origin/CSRF for unsafe methods;
- enforce body-size and header-size limits before forwarding;
- preserve safe content negotiation, conditional, idempotency, range, and trace headers;
- use the server-side runtime API URL only;
- separate normal JSON, upload, download, and stream timeout policies;
- pass disconnect cancellation upstream;
- avoid logging tokens, cookies, request bodies, or sensitive response bodies.

### Response policy

- stream upstream bodies without accidental buffering;
- strip unsafe hop-by-hop and upstream cookie headers;
- preserve status, content type, ETag, retry-after, content disposition, and request ID where safe;
- normalize relay-generated failures to the shared problem schema;
- on a single eligible 401, coalesce token refresh and retry only an idempotent request or a request carrying a valid idempotency key;
- map `AUTH_CONTEXT_MISMATCH` to session invalidation/context selection, never an infinite refresh loop.

### Security tests

- SSRF and path traversal;
- encoded slash/dot segments;
- spoofed identity headers;
- CSRF and cross-origin requests;
- cookie fixation and prefix behavior;
- oversized body and decompression behavior;
- streaming timeout/disconnect;
- token refresh race;
- cross-plane and cross-tenant attempts;
- header and log redaction.

### Exit gate

One authenticated request reaches `/api/iam/me` through the relay in each plane, with the platform host observing the correct bearer token and plane/context headers and the browser observing none of them.

### Phase 5 — Server experience bootstrap and effective-access projection

### Server package

Create `server/packages/platform/experience` with:

- a service that accepts `VerifiedRequestContext`;
- exact-plane repository ports;
- Kysely read repositories in the appropriate database adapter layer;
- contract routes registered by `server/apps/platform-host`;
- cache invalidation hooks for profile, catalog, plan, flag, membership, and authorization revision changes;
- route contracts/OpenAPI and integration tests against real DDL.

### Resolution algorithm

1. Verify the principal and tenant are active and the identity binding is valid.
2. Verify active plane membership.
3. Read the typed UI profile with platform/tenant defaults.
4. Resolve the tenant's current `subscription_plan_id`.
5. Read active plan modules, active workspace associations, and active catalog metadata.
6. Resolve effective features using effective windows, tenant overrides, deterministic cohorting, kill-switch precedence, and version constraints.
7. Use the already verified permission snapshot; do not create a weaker parallel authorization engine.
8. Produce a stable revision/fingerprint from the relevant profile, auth, catalog, entitlement, and feature revisions.
9. Return only the sanitized contract.

### Fail-closed rules

- inactive or missing tenant/principal/membership: deny bootstrap;
- missing plan during provisioning: return a typed `context-not-ready` state, not all modules;
- unknown module/permission/feature: unavailable by default;
- feature repository failure: kill switches and security-sensitive flags fail closed;
- profile failure: safe platform defaults may be used only if identity and access resolution succeeded;
- never fall back to Studio or another plane's database.

### Exit gate

DDL-backed integration tests prove correct resolution for active/inactive membership, plan inclusion, workspace order, tenant feature overrides, rollout cohort stability, profile inheritance, suspended tenant, wrong-plane context, and RLS isolation.

### Phase 6 — Providers and query-cache lifecycle

Build `@athyper/platform-query` and `@athyper/platform-shell-app-foundation` around dependency injection rather than global client mutation.

### Provider order

```text
Theme/appearance bootstrap
  -> sanitized SessionProvider
  -> ExperienceBootstrapProvider
  -> ApiClientProvider
  -> QueryClientProvider
  -> Feature/Permission providers
  -> Toast and SurfaceStack providers
  -> Error/auth-failure bridge
  -> plane shell
```

Avoid one giant context value. Session, bootstrap, permissions, flags, and shell state should have stable, focused selectors.

### Query rules

- create one QueryClient per server request and one stable QueryClient per browser tab;
- dehydrate only safe, principal-scoped data;
- include `plane`, `tenantId`, and `authEpoch` in principal-sensitive query-key roots;
- centralize query-key factories in contract/feature packages;
- clear or replace all principal data on logout, auth-epoch change, context switch, or session invalidation;
- cancel in-flight requests before clearing clients;
- do not persist the query cache to local storage initially;
- retry safe reads only for classified transient failures, with bounded jitter;
- never retry 401, 403, validation, conflict, or unsafe mutations automatically;
- use optimistic updates only when an endpoint exposes version/ETag semantics and rollback is tested;
- separate server prefetch functions from React hooks.

### Bootstrap strategy

The protected app layout reads the BFF session and experience bootstrap on the server, redirects before rendering when unauthenticated, and hydrates safe bootstrap data. Client navigation revalidates session/bootstrap only when expiry, auth epoch, feature revision, or context changes require it.

### Exit gate

SSR and client navigation show one coherent session/bootstrap state; logout and tenant/plane context change cancel requests and leave no stale queries, navigation, permissions, or feature decisions from the previous context.

### Phase 7 — Error, loading, empty, offline, and not-found boundaries

Implement shared components in app foundation and thin Next.js boundary files in every app:

```text
app/global-error.tsx
app/error.tsx
app/not-found.tsx
app/loading.tsx
app/(public)/loading.tsx
app/(shell)/error.tsx
app/(shell)/loading.tsx
```

### Error taxonomy and UX

| Class | Behavior |
|---|---|
| 401/session absent | clear local principal state and redirect to safe login with local return path |
| 403 required action | render identity-gate action; do not show generic forbidden |
| 403 permission denied | stable forbidden surface; no retry |
| context mismatch | invalidate context-bound session and return to context selection |
| 409 conflict | retain user input and offer reload/compare where supported |
| 422 validation | field/form issues without destructive reset |
| 429 | show bounded retry guidance using `Retry-After` |
| 503/dependency unavailable | recoverable service-unavailable page with request ID |
| network/offline | distinguish offline from server failure and preserve safe local draft state |
| unexpected render error | resettable route boundary plus redacted telemetry |

Loading states must prevent layout shift, respect reduced motion, and distinguish initial bootstrap from local component refresh. Every error surface displays a safe request ID when available and never shows stack traces, raw provider errors, tokens, SQL, or internal URLs.

### Exit gate

All listed failure classes have unit and E2E coverage, boundaries work before providers fully mount, and accessibility checks cover focus placement and live-region announcements.

### Phase 8 — Shared shell and plane navigation

### Shared shell

Build `@athyper/platform-shell` from small parts:

- skip link and main landmark;
- responsive navigation rail/drawer;
- top bar;
- workspace/module panel;
- breadcrumbs;
- context/tenant switcher;
- account menu and logout;
- shell-collapse preference;
- reserved slots for search, notifications, inbox, and agent UI without implementing those features yet.

Prefer server-rendered shell structure and small client islands for disclosure, resizing, context switching, and menus.

### Plane-owned route registries

Each plane owns a typed registry, for example:

```ts
interface PlaneRouteDefinition {
  id: string;
  moduleCode: string;
  href: string;
  label: string;
  iconKey: string;
  requiredPermissions: readonly string[];
  requiredFeatures: readonly string[];
  navigation: "primary" | "secondary" | "hidden";
}
```

- Neon registry lives under `packages/planes/neon/navigation`.
- Mesh registry lives under `packages/planes/mesh` as a dedicated navigation package or export.
- Studio registry lives under `packages/planes/studio` similarly.
- DDL determines active catalog/workspace grouping; registries determine actual frontend routes.
- Unknown active server modules are omitted with telemetry in production and warnings in development.
- A registry route referencing an unknown module, permission, feature, or nonexistent app page fails a policy test.

### Navigation derivation

1. Start with the plane route registry.
2. Join it to effective modules from bootstrap.
3. Apply required permission and feature predicates.
4. Group using server-provided workspace associations and ordering.
5. Resolve labels/icons using an explicit precedence: tenant-safe catalog value -> registry fallback -> code fallback.
6. Select the first permitted landing route; never redirect to an inaccessible default.

Do not restore the reference frontend's static module/workspace database mirror. Keep only route information that the database cannot own.

### Exit gate

Desktop and mobile shells render correctly in all planes; keyboard traversal, focus restoration, landmarks, responsive drawer behavior, context switch, deep links, forbidden routes, and empty-entitlement states pass tests.

### Phase 9 — Permission and feature consumption APIs

Build small pure consumers in the active packages:

- `hasPermission(code)` and `hasAnyPermission(codes)` from the verified snapshot;
- `PermissionGate` for presentation only;
- `isFeatureEnabled(code)` and `FeatureGate` from effective server decisions;
- `RouteGuard` combining session, module, permission, and feature state;
- explicit unavailable/locked/hidden presentation decisions;
- development diagnostics for unknown codes.

Rules:

- no wildcard interpretation in the browser unless the server contract explicitly returns it;
- no permission derivation from role names, groups, email domain, tenant metadata, or UI state;
- no feature cohort calculation in the browser;
- no enabling a route solely because it exists in navigation;
- do not use a feature flag as a permission;
- distinguish `not entitled`, `not permitted`, `feature disabled`, and `context unavailable` in diagnostics while avoiding sensitive detail in end-user messages;
- mutation buttons must handle a server denial even if visible state said they were allowed.

### Exit gate

Table-driven tests cover every truth-table combination. Server denial remains authoritative, unknown states fail closed, and no business module needs to parse raw permission arrays or feature catalogs directly.

### Phase 10 — App composition and pilot cutover

### Thin app responsibilities

Each `apps/<plane>` owns only:

- Next.js configuration and runtime environment validation;
- root metadata, fonts, CSS import, and pre-paint theme application;
- shared auth and relay route delegates;
- public and protected route groups;
- provider composition;
- imports of its same-plane app/shell/navigation packages;
- health/liveness routes appropriate to the frontend deployment;
- instrumentation and error reporting bootstrap.

No app should contain reusable auth logic, fetch wrappers, permission algorithms, or shell component implementations.

### Pilot order

1. Neon: broadest route/module catalog and best validation of general shell needs.
2. Mesh: validates strict plane isolation and a smaller partner-facing navigation model.
3. Studio: validates internal realm, elevated permissions, and administrative shell variants.

For each plane, ship a spine-only protected landing page before any business module. Keep the previous deployed frontend available as the operational rollback target; do not make the backup source tree an application runtime.

### Exit gate

All three deployment profiles list their actual required active packages and BFF environment variables, build from a clean workspace, pass health checks, and run the same authentication/bootstrap/shell smoke suite.

## 6. Package-by-package deliverables

| Active package | Initial deliverable |
|---|---|
| `contract-platform-api` | problem schema, request metadata, operation contract helpers |
| `contract-platform-auth-session` | sanitized session and transition schemas |
| `contract-platform-authorization` | permission, feature, entitlement, and gate decision contracts |
| `contract-platform-navigation` | workspace/module/bootstrap navigation input schemas |
| `platform-core` | invariant helpers, result types, stable IDs; no React/HTTP |
| `platform-brand` | typed plane brand descriptors and public assets |
| `platform-theme` | semantic tokens, modes, density, pre-paint resolver |
| `platform-icons` | semantic icon registry and fallbacks |
| `platform-ui` | minimal accessible primitives |
| `platform-surface-kit` | composed surfaces and stack policy |
| `platform-api-client` | same-origin typed HTTP transport |
| `platform-query` | client factory, query-key roots, retry/invalidation policy |
| `platform-iam-session` | browser-safe session model and pure decisions |
| `platform-iam-session-store` | Redis-backed server session persistence |
| `platform-iam-auth-bff` | PKCE/login/callback/logout/refresh/context handlers |
| `platform-iam-identity-gate` | login, required-action, context, and auth-failure UX |
| `platform-gateway-bff-relay` | allowlisted secure upstream relay |
| `platform-shell-app-foundation` | provider composition and Next boundary components |
| `platform-shell-runtime` | pure shell/nav resolution state machine |
| `platform-shell` | responsive shell components |
| plane navigation packages | typed route registry and server-catalog join |
| plane app packages | plane composition and landing route |
| `server-platform-experience` (new) | exact-plane bootstrap/profile/preference read model and routes |

## 7. Test and evidence matrix

| Layer | Required evidence |
|---|---|
| Contracts | schema fixtures, compatibility tests, OpenAPI verification, invalid-payload rejection |
| Theme/UI | component tests, accessibility scans, visual snapshots, contrast, reduced motion, bundle budget |
| Session | Redis integration, atomicity/races, expiry, revocation, rotation, outage behavior |
| Auth BFF | OIDC state/nonce/PKCE, cookie attributes, callback abuse, refresh race, logout |
| Relay | SSRF/header spoofing/CSRF, streaming, body limits, cancellation, context isolation |
| Server bootstrap | DDL-backed exact-plane integration, RLS, membership, plan, flag, profile inheritance |
| Query/providers | SSR hydration, context switch, logout clear, cancellation, retry classification |
| Boundaries | status/error matrix, focus/live region, request ID, redaction |
| Shell/nav | route-registry integrity, permission/feature truth tables, responsive keyboard E2E |
| Deployment | clean install/build, environment validation, health checks, three-plane smoke tests |

Minimum E2E journeys per plane:

1. unauthenticated deep link -> login -> callback -> original safe destination;
2. authenticated bootstrap -> themed shell -> correct permitted navigation;
3. forbidden route -> stable forbidden boundary;
4. expired access token -> one refresh -> successful idempotent read;
5. revoked session -> login without stale shell flash;
6. context switch -> old requests cancelled and old cache removed;
7. feature disabled -> route unavailable and direct server mutation still denied;
8. Redis/API dependency outage -> fail-closed recoverable UX;
9. logout -> provider-session/session revocation and cleared principal state;
10. mobile keyboard/touch navigation and accessibility smoke.

## 8. Observability and operations

Emit structured, redacted events and metrics for:

- login start/callback/success/failure category;
- session create/read/refresh/rotate/revoke and store latency;
- relay request class, upstream status, timeout, cancellation, and refresh retry;
- bootstrap latency, cache hit, revision, and failure category;
- unknown module/route/permission/feature codes;
- auth/context mismatch and required-action redirects;
- query error class and boundary activation;
- shell/navigation render readiness.

Use request and correlation IDs end to end. Never attach token, cookie, subject claim, raw permission set, profile content, or tenant-sensitive payloads to logs. Define alerts for sustained login failures, session-store unavailability, bootstrap failures, context mismatches, and relay 5xx/timeout rates.

### 8.1 Runtime environment contract

Validate environment variables at process startup. Server-only values must never use a `NEXT_PUBLIC_` prefix or be serialized into a client bundle.

| Class | Example values | Rule |
|---|---|---|
| Public, non-sensitive | deployment/environment label, public application origin, telemetry release identifier | May be exposed only when the browser needs it; cannot control authorization or security policy. |
| BFF upstream | platform-host internal URL, allowed upstream origin | Server-only; exact origin allowlist, no request-selected host. |
| OIDC | issuer URL, client ID, client secret/reference, redirect origin | Server-only except public issuer metadata deliberately returned by discovery; secret always server-only. |
| Session | Redis URL, cookie name/namespace, idle/absolute TTL, encryption/signing key references | Server-only; production startup fails if a required value or secure-cookie condition is absent. |
| Relay | JSON/upload/stream timeout and body limits | Server-only and bounded by reviewed maximums. |
| Observability | service name, release, collector endpoint | Secrets and auth headers remain server-only. |

Update `config/deployment/profiles.json`, its schema, environment examples, stack configuration, and deployment verification together. The three frontend profiles should depend on their active spine and same-plane packages rather than listing only `@athyper/config`.

### 8.2 Initial performance budgets

Record actual baselines during the Neon pilot and tighten them before broad rollout. Initial gates should include:

- one BFF session read and one server bootstrap projection for protected-layout startup, not a waterfall of profile/module/permission/flag calls;
- no client-side theme flash;
- no duplicate bootstrap request after hydration under normal navigation;
- bounded bootstrap JSON with no raw catalogs or role graphs;
- shell JavaScript budget independent of business modules;
- lazy loading for nonessential menus, notifications, search, and agent slots;
- streamed relay paths that do not buffer large responses;
- bootstrap database query count and p95 latency recorded per plane;
- login-to-shell-ready, server response, hydration, and route-transition measurements in CI/performance evidence.

## 9. Rollout and rollback

1. Deploy new server contracts and bootstrap routes disabled or dark-read first.
2. Compare bootstrap decisions against reviewed reference scenarios and DDL fixtures, not against legacy code structure.
3. Enable the spine for internal/test tenants with an operational server-side release gate.
4. Run Neon pilot smoke, accessibility, and telemetry acceptance.
5. Expand by tenant cohort only after stable session, bootstrap, and relay metrics.
6. Repeat for Mesh and Studio.
7. Keep rollback at the deployment/router level. Do not dual-write browser sessions or let both frontends mutate the same client-side state.
8. Retire old runtime endpoints only after route scans and production evidence show no active consumers.

Rollback must preserve database changes that are additive and compatible. A frontend rollback switches traffic to the previously deployed frontend and does not restore DDL from backup.

## 10. Suggested pull-request sequence

Keep changes reviewable and independently green:

1. package-policy alignment and reference-import guard;
2. platform wire contracts and fixtures;
3. theme/brand/icon token foundation;
4. minimal accessible UI primitives;
5. transport-only API client;
6. Redis session-store implementation and tests;
7. shared auth BFF handlers and one-plane test app wiring;
8. hardened relay and `/api/iam/me` smoke;
9. server experience repositories/service/routes and DDL integration tests;
10. provider/query lifecycle;
11. boundary components and app boundary files;
12. shared shell primitives;
13. Neon route registry and navigation resolution;
14. Neon pilot composition;
15. Mesh registry/composition;
16. Studio registry/composition;
17. deployment profiles, performance/security gates, and rollout runbook.

Do not mix business-module reconstruction into these pull requests.

### 10.1 Critical path and safe parallel work

The critical path is:

```text
package policy
-> wire contracts
-> server-only session/auth BFF
-> relay
-> server bootstrap projection
-> providers/cache lifecycle
-> shell/navigation
-> plane composition
```

Theme/UI can proceed alongside contracts and server bootstrap work after package boundaries are locked. Error-boundary visuals can proceed after the minimal primitives exist. Mesh and Studio route registries can be inventoried alongside the Neon pilot, but their application wiring should wait until the shared Neon spine exposes stable extension points.

Use relative sizing for scheduling until the team and infrastructure constraints are known:

| Workstream | Relative size | Main uncertainty |
|---|---:|---|
| Governance and contracts | M | package-policy correction and authoritative schema mechanism |
| Theme/primitives | L | accessible interaction coverage and visual acceptance |
| Session/auth BFF | XL | OIDC realms, Redis atomicity, required actions, refresh and logout |
| Relay | L | upload/stream behavior and security hardening |
| Server bootstrap | XL | exact-plane repositories, effective-access rules, DDL integration |
| Providers/query | M | SSR hydration and context invalidation |
| Boundaries | M | complete error taxonomy and telemetry |
| Shell/navigation | L | responsive accessibility and registry/catalog reconciliation |
| Three-plane rollout | L | deployment/IAM differences and operational evidence |

No wave is considered complete based on source-file count. Use the exit gates and observable user/security behaviors.

## 11. Overall definition of done

The application spine is done only when:

- the active package graph is canonical and policy-enforced;
- backup roots have zero active imports and zero workspace authority;
- browser-safe contracts are authoritative and schema-tested;
- tokens and Redis session data remain server-only;
- every browser API call uses the hardened same-origin relay;
- the server supplies one exact-plane sanitized bootstrap projection;
- theme and locale apply without an unstyled or cross-user flash;
- query state cannot survive logout or context/auth-epoch changes;
- errors and loading states behave consistently before and after hydration;
- navigation is derived from active route registry + DDL catalog + entitlement + permission + effective feature state;
- all server operations continue to enforce authorization independently of UI gates;
- Neon, Mesh, and Studio pass the shared E2E, security, accessibility, and deployment suites;
- a rollback procedure and production observability dashboard exist;
- the first business module can be added without inventing a new fetch wrapper, auth flow, provider root, permission parser, feature evaluator, or shell.
