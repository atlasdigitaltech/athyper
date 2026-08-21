# ADR: Atlas plane admission and trust boundaries

**Status:** Accepted for Phase 0  
**Date:** 2026-07-24  
**Applies to:** Neon, Mesh, Admin Atlas chat, persistence, retrieval, tools,
and future governed actions

## Context

Atlas already has a shared browser runtime, UI surfaces, exact model bindings,
provider adapters, durable conversation foundations, and a governed read-only
tool loop. The original binding policy embedded a Neon-only check directly in
the provider/model evaluator. That made plane rollout implicit and coupled
provider capability metadata to feature activation.

Phase 0 introduces an explicit server-owned plane admission boundary while
retaining the existing Neon product behavior for an allowlisted cohort.

## Decision

### 1. Client profiles are presentation-only

`AtlasPlaneProfile`, suggestions, shortcut copy, and client capability hints
cannot authorize a model, provider, thread, retrieval source, tool, or action.
The server ignores client profile values when resolving eligibility.

### 2. Server plane admission is authoritative

The authenticated server resolves a versioned `AtlasPlaneAdmissionDecision`
from verified tenant, principal, plane, environment, feature flags, permission
context, and server policy. Missing or failed inputs deny access.

The Phase 0 matrix is:

| Plane | Chat | Persistence | Read tools | Mutations |
|---|---|---|---|---|
| Neon | Allowlisted | Disabled | Disabled | Disabled |
| Mesh | Disabled | Disabled | Disabled | Disabled |
| Admin | Disabled | Disabled | Disabled | Disabled |

### 3. Relays establish plane from the authenticated session

The browser cannot supply or widen `X-Plane` or `X-Plane-Key`. The shared BFF
builds runtime headers from the server session. The runtime also requires the
request body plane to match the verified header plane.

### 4. Catalog and run share one policy resolver

The model catalog and `AgentRuntime` use the same plane-policy-backed exact
binding resolver. The effective catalog revision includes the plane policy
revision and exact binding inventory. A stale catalog revision fails before
provider invocation.

### 5. Provider fallback cannot cross governance boundaries

There is no silent fallback across tenant, plane, provider account, credential
owner, region, data-handling profile, data classification, or explicit binding
policy. A fallback requires a future explicit, versioned, auditable policy.

### 6. Provider capability is not request authorization

`binding.capabilities.tools` means the model/adapter can represent tool calls.
It does not enable tools for a request. Effective tool execution additionally
requires persistence, environment and tenant gates, an effective manifest,
verified IAM, strict feature/policy revalidation, and bounded execution.

### 7. Tools receive verified server context

All tools execute with the immutable `VerifiedRequestContext`. Tool arguments,
retrieved values, and provider output are untrusted data. A tool cannot expose
arbitrary SQL, URL fetch, shell, or filesystem access.

### 8. Mutations use registered domain commands

Future mutations must execute through an existing lifecycle/business command
with confirmation, authorization recheck, row-version protection, and
idempotency. The model and browser cannot authorize or directly execute a
mutation.

### 9. Content is not operational telemetry

Prompts, responses, record values, tool arguments/results, and evidence text
are excluded from operational logs, metrics, traces, and cost ledgers.
Operational telemetry is limited to bounded identifiers, revisions, timings,
usage, outcomes, and safe error classes.

### 10. Rate and autonomy dimensions change atomically

Phase 0 preserves aggregate tenant and tenant/principal rate limits. A future
plane bucket is secondary; it cannot replace the aggregate ceiling.

Phase 0 also retains the current autonomy/confidence persistence model and uses
manifest `allowedPlanes` plus narrow action codes. A future plane dimension
must update database uniqueness, resolver lookup, cache keys, invalidation,
administration APIs, and tests together.

## Feature gates

Base admission is conjunctive:

```text
ATLAS_AGENT_ENABLED
AND atlas_agent_enabled
AND atlas_agent_<plane>_enabled
AND plane-effective ai.agent.use
AND server plane matrix
AND an eligible exact model binding
```

The Phase 0 plane flags are default-off:

```text
atlas_agent_neon_enabled
atlas_agent_mesh_enabled
atlas_agent_admin_enabled
```

Persistence, read tools, proposals, and mutations retain independent,
additional gates. A plane flag never implies a later capability class.

## Consequences

- Enabling a plane requires server policy and cannot be accomplished by a
  client profile deployment.
- Tool-capable bindings remain usable for text-only runs.
- Mesh and Admin return no effective models in Phase 0.
- Rollback uses flags/configuration and preserves append-only audit data.
- No Phase 0 database table is added.

