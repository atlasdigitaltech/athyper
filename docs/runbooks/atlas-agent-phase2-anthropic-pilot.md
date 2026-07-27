# Atlas Agent Phase 2: Anthropic production baseline and Neon pilot

## Scope

This phase promotes the existing Anthropic platform binding for an internal,
allowlisted Neon pilot. Atlas remains text-only and memory-only. Server
conversation persistence and tenant-record tools stay disabled. OpenAI and
Gemini remain internal evaluation bindings and default-off outside explicitly
approved evaluation environments.

Promotion is fail-closed. A successful build or synthetic test run does not
replace provider-account, region, retention, data-classification, Security,
Privacy, or Operations approval.

## Immutable production lock

The versioned lock is
`server/packages/services/ai/evals/atlas-anthropic-baseline-v1.json`.

| Atlas public mode | Binding | Anthropic model | Routing |
| --- | --- | --- | --- |
| `atlas-fast` | `atlas-fast-anthropic-v2` | `claude-haiku-4-5-20251001` | `no-fallback-v1` |
| `atlas-balanced` | `atlas-balanced-anthropic-v2` | `claude-sonnet-4-6` | `no-fallback-v1` |
| `atlas-best` | `atlas-best-anthropic-v2` | `claude-opus-4-8` | `no-fallback-v1` |

The lock references the common 200-case synthetic provider-comparison suite by
SHA-256. It contains no provider output, score, tenant data, or customer
identifier. Never edit the locked fixture after a completed evaluation; issue a
new version instead.

Validate the lock, provider contract, safe telemetry, readiness normalization,
and promotion calculations:

```text
pnpm --filter @athyper/svc-ai eval:anthropic:validate
```

## External approval

Copy
`server/packages/services/ai/evals/anthropic-production-approval.example.json`
to the restricted release-evidence location. Do not commit an approval artifact
that contains staff identity or confidential contract references.

Every approval record must contain `status: approved`, an accountable approver,
an offset-aware approval timestamp, and a durable evidence reference.

Explicitly record:

- approved Anthropic account class and commercial agreement;
- effective inference region and routing limitation;
- provider retention/ZDR configuration;
- permitted data classes (`public_internal_only` for this pilot);
- Security and Privacy review;
- Operations ownership, alerting, rollback, and credential rotation.

The checked-in example is deliberately `pending`; pilot execution with
`--require-signoff` rejects it.

## Readiness and smoke testing

Anthropic readiness uses the non-generating Models API. It sends a `GET` for
each pinned model, with no request body or prompt, and requires the returned
model ID to match the configured ID exactly.

```text
pnpm --filter @athyper/svc-ai eval:anthropic:readiness
```

Supply `ANTHROPIC_API_KEY` through the environment secret injector. The command
prints only public mode, configured/actual model IDs, normalized state, reason,
and HTTP status. It never prints the key or provider response body.

If the provider account cannot use the Models API, use a supervised synthetic
smoke request in the isolated pilot tenant. Record that exception in approval
evidence. Do not use customer text as readiness content.

## Pilot evaluation

Required environment:

- `ATLAS_AI_EVAL_BASE_URL`;
- `ATLAS_AI_EVAL_TOKEN`;
- `ATLAS_AI_EVAL_TENANT_ID`;
- `ATLAS_AI_EVAL_PLANE=neon`;
- `ATLAS_AI_LEDGER_DB_URL`, using a read-only credential for the relevant run
  and provider-call ledger rows.

Execute all 200 immutable cases against the base binding:

```text
pnpm --filter @athyper/svc-ai eval:anthropic:pilot -- --signoff <restricted-approval.json>
```

The harness checks stream protocol assertions, exact returned model identity,
cancellation, terminal outcomes, and event usage. It reconciles observed usage
and binding cost with persisted ledger evidence. Store reports in restricted
release evidence; never copy streamed answers to general logs or telemetry.

Run `atlas-balanced` and `atlas-best` smoke subsets by overriding `--model-id`,
`--expected-upstream-model`, and binding price arguments. The immutable lock
always validates all three mappings.

## Promotion gates

All hard gates must pass:

- exact configured and actual model identity: `100%`;
- successful completed streams: `>=99.5%`;
- provider `429` or `5xx`: `<1%`;
- provider-to-call-ledger and provider-to-run-ledger usage/cost difference:
  `<=1%`;
- no prompt, response, record value, or provider body in logs or traces;
- no automatic retry after the first visible text delta;
- cancellation and truncated-stream tests pass;
- credential rotation test passes;
- all external approvals and provider conformance checks pass.

P95 first-token latency below 1.5 seconds is an initial objective, not a hard
gate, until a representative region/model baseline exists.

## Observability contract

The runtime emits:

- `atlas.agent.run`;
- `atlas.catalog.resolve`;
- `atlas.provider.invoke`;
- `atlas.conversation.prepare`;
- `atlas.conversation.finalize`.

Only allowlisted low-cardinality operational attributes are attached: plane,
public model, provider, binding/adapter IDs, persistence/tool booleans, outcome,
normalized error class, and provider round. Tenant/principal IDs, credentials,
prompts, responses, provider bodies, and record values are forbidden.

Use the existing trace/error correlation ID for investigation. Provider request
IDs remain restricted ledger diagnostics and are not span attributes.

## Credential rotation

1. Add the replacement key to the approved secret-store version.
2. Run non-generating readiness for every pinned model with the replacement.
3. Update the secret reference atomically; do not log either secret value.
4. Confirm the same secret-reference fingerprint and a new HMAC credential
   fingerprint in the restricted call ledger.
5. Complete a supervised synthetic stream and usage reconciliation.
6. Revoke the old provider key and invalidate credential caches.
7. Repeat readiness and verify authentication-error alerts remain clear.

Never place secret values in approval artifacts, command arguments, logs,
metrics, traces, screenshots, or support tickets.

## Retry, cancellation, and partial output

The provider is invoked once for a text-only run. After a visible text delta,
Atlas must not automatically retry or switch provider/model. A truncated stream
is terminally `incomplete`, with partial usage where available. Client
cancellation aborts the upstream request.

## Rollout and rollback

Enable only the internal Neon allowlist after every hard gate is green. Keep
server persistence and tool execution disabled.

Rollback by disabling the Neon Atlas tenant flag or Anthropic provider/binding
configuration. Do not delete schema or rewrite ledger evidence. Disabling
Anthropic must not expose or activate OpenAI or Gemini evaluation bindings.
