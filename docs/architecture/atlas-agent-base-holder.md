# Atlas Agent Phase 1 base holder

**Baseline date:** 2026-07-23

## Scope

The Phase 1 base establishes a provider-neutral, exact-model protocol; a
server-authoritative policy boundary; append-only metering; and the Neon product
panel. It intentionally supports conversational text only.

The shipped Neon surface is the side panel. Fullscreen remains an unmounted
package experiment. History is hidden because conversation state is memory-only
and clears on scope change or reload.

The base does not execute tools, read live tenant records, perform RAG, persist
conversations, or mutate business data. The fail-closed `AtlasDataGateway`
contract exists now so those later capabilities cannot bypass canonical tenant,
principal, plane, permission, scope, source, or field-masking checks.

## Request path

```text
Neon user
  -> AtlasProvider (scope-bound, memory-only conversation)
  -> POST /api/relay/ai/agent/runs
  -> POST /api/ai/agent/runs
  -> canonical VerifiedRequestContext + tenant flag + ai.agent.use
  -> tenant-effective catalog resolver
  -> public Atlas mode -> exact AtlasModelBinding
  -> eligible provider adapter
  -> IModelProvider.invokeStream(exact binding)
  -> Anthropic Messages API
  -> normalized Atlas SSE events
  -> append-only run/call ledger
```

`GET /api/ai/agent/models` and `POST /api/ai/agent/runs` use the same effective
resolver. The catalog contains public `atlas-fast`, `atlas-balanced`, and
`atlas-best` modes plus a policy revision. A run carrying a stale revision is
rejected before provider invocation.

The browser never receives a provider name, upstream model ID, provider price,
or credential. The relay supplies authenticated session headers. The server
composes one immutable `VerifiedRequestContext`, stores it in request context,
and passes the same object reference to the Atlas runtime.

## Exact model bindings

The public modes resolve server-side:

| Public mode | Default exact upstream binding |
|---|---|
| `atlas-fast` | `claude-haiku-4-5-20251001` |
| `atlas-balanced` | `claude-sonnet-4-6` |
| `atlas-best` | `claude-opus-4-8` |

Each binding also pins provider, adapter and adapter version, data-handling
profile, routing policy, region/data-class allowance, price version, and
capabilities. Tools and vision are false in this base. The adapter reports the
actual provider/model/request ID, and the runtime rejects an unexpected model
unless the binding explicitly allows that alias.

Phase 1 routes Anthropic inference as `global`. The neutral
`anthropic-platform-messages-v1` profile does not claim ZDR, HIPAA readiness,
workspace retention, or regional residency; those are organization/workspace
contract properties that must become explicit policy attributes before
sensitive classifications are enabled.

## Enablement checklist

The feature fails closed unless all of these are true:

1. Runtime has `ATLAS_AGENT_ENABLED=true`.
2. Neon has `ATLAS_AGENT_ENABLED=true`; the server layout passes the resolved gate to the client shell.
3. `control.feature_flag.code = 'atlas_agent_enabled'` resolves to true for the tenant.
4. `control.feature_flag.code = 'atlas_agent_neon_enabled'` resolves to true
   for the tenant. The Mesh and Admin plane flags remain default-off and their
   Phase 0 policy ceilings deny chat even if a flag is accidentally enabled.
5. The principal is granted `ai.agent.use`; the canonical plane/plan-effective
   permission snapshot must also allow it.
6. The principal is granted `ai.agent.feedback.submit` when feedback is
   enabled for the supervised internal evaluation.
7. `ATLAS_AGENT_CREDENTIAL_FINGERPRINT_KEY` is a stable injected server secret
   of at least 32 characters.
8. `ANTHROPIC_API_KEY` resolves through `ProviderCredentialResolver`.
9. At least one exact binding is implemented, configured, eligible, and
   allowed by the request-effective policy snapshot.

The customer default is configured only with
`ATLAS_AGENT_DEFAULT_PUBLIC_MODEL`. Exact upstream IDs use the three
server-only `ATLAS_AGENT_ANTHROPIC_*_MODEL` settings, but only IDs with a
code-reviewed capability, region, and price profile are accepted. The former
`ATLAS_AGENT_MODEL` and `ATLAS_AGENT_DEFAULT_MODEL_ID` settings are removed.

## Security and operating limits

- The models and run routes resolve authenticated tenant, principal, plane,
  permission profile, organization/legal scope, and authentication epoch
  through the canonical IAM context.
- Provider secrets and fingerprint keys exist only in server configuration.
  The runtime resolves a request-scoped credential lease and passes secret
  material only to the selected provider adapter.
  Ledger metadata contains a versioned keyed credential fingerprint, never the
  key, key suffix, or raw secret reference.
- User and tenant rate limits are enforced before a provider call.
- Request body, history, input, output, total provider time, and stream-idle
  time are bounded.
- The local output-byte ceiling and provider SSE-frame ceiling are enforced
  independently of provider token limits.
- Atlas mutations use the plane-aware CSRF transport, and tenant-effective
  catalog responses are forced to `private, no-store` by both API and relay.
- Run, thread, and assistant message IDs are generated by the server.
- Client disconnects cancel the upstream model request.
- There is no silent model, provider, credential, or region fallback.
- There is no automatic retry after a user-visible text delta.
- The UI shows an explicit verification warning for financial information.
- The system prompt forbids claims of live-data access or completed actions.
- Tenant, principal, plane, permission/authentication epoch, logout, expiry, or
  auth failure aborts the stream and clears conversation/catalog state before a
  new request.
- Atlas feedback uses the distinct `atlas_agent` type, requires
  `ai.agent.feedback.submit`, and must target the exact server-generated
  run/message pair owned by the same tenant and principal.
- `log.ai_agent_run` and `log.ai_agent_call` contain terminal operational,
  policy, model, timing, usage, billing, and cost metadata only. Content, raw
  provider errors, tool arguments/results, and evidence text are excluded.
- The run row and its optional provider-call row commit in one tenant-stamped
  transaction; a partial accounting record is rolled back.

This baseline is for default-off, supervised internal smoke only. Provider
cost estimates are operational metadata; product `billable` remains null.
Customer charging requires a separate versioned Atlas price/quota/credit,
reconciliation, tax/invoice, and dispute design. Customer-owned provider access
will be a tenant-admin BYOK integration, never an end-user Claude/ChatGPT login.

Operational response is documented in
`docs/runbooks/atlas-agent-phase1-operations.md`.

## Baseline change inventory

- `packages/shared/runtime-domain/atlas-agent-runtime`: schemas, catalog/public
  modes, SSE transport, scope identity, feedback mapping, and protocol tests.
- `packages/shared/ui-platform/atlas-agent-ui`: provider, Neon panel,
  conversation/composer UI, feedback, and surface-stack integration.
- `packages/apps/neon/shell` and `apps/neon`: profile, feature-gated shell mount,
  Dashboard hero trigger, and relay streaming.
- `server/packages/services/ai`: exact bindings, provider registry/adapters,
  per-request catalog, agent runtime, canonical route, credential resolver,
  fail-closed data gateway, deterministic fake provider, and ledger writers.
- `server/db/ddl/log`, Prisma, lookup and permission seeds, and security grants:
  append-only ledgers, RLS, Atlas feature/permissions, feedback type, and narrow
  runtime insert rights.
- `server/src/config.ts`, server/stack environment examples, and Compose:
  validated global/public/binding/timeout/rate/fingerprint settings.

## Deferred extensions

- Governed tool discovery, authorization, preview/confirmation, and execution
  through the existing `AIRuntime`
- Typed result cards beyond text
- Tenant RAG, evidence, and citations
- Server thread persistence and optional policy-approved browser caching
- Fullscreen/history surfaces and a shell-owned shortcut coordinator
- Mesh and Admin mounts
- OpenAI and Gemini production adapters after Phase 1 evidence
- Optional Ollama developer profile and evidence-triggered Groq evaluation
- Enterprise customer-managed provider credentials after the SecretStore
  prerequisite
