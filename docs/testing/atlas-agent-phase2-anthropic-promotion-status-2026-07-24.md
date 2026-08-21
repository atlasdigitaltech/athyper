# Anthropic production promotion status

**Status:** technically prepared, promotion not approved  
**Provider:** Anthropic  
**Atlas plane:** Neon internal pilot only  
**Public modes:** `atlas-fast`, `atlas-balanced`, `atlas-best`  
**Routing:** no fallback  
**Data class:** `public_internal_only` synthetic/pilot data only

## Completed in the repository

- Exact public-mode to Anthropic binding lock.
- Actual-model identity normalization.
- Non-generating readiness adapter and safe output normalization.
- Provider conformance, malformed-stream, refusal, timeout, cancellation, and
  telemetry tests.
- Immutable Anthropic baseline fixture and validator.
- Pilot harness with sign-off, stream, usage, ledger, and reconciliation gates.
- Credential resolver rotation tests that do not expose secret values.
- Default-off configuration and no-fallback routing policy.

Local validation currently passes:

```text
pnpm --filter @athyper/svc-ai run eval:anthropic:validate
5 files, 47 tests passed
```

## External evidence still required

The checked-in approval template remains intentionally pending. A restricted,
non-committed approval artifact must contain an accountable approver, timestamp,
and evidence reference for each item:

- Anthropic account/commercial agreement;
- inference region and routing limitation;
- retention/ZDR and abuse-monitoring configuration;
- permitted data classification;
- Security review;
- Privacy/legal review;
- Operations owner, alerts, rollback, and credential rotation;
- Product approval for the internal Neon allowlist.

The local server and stack environments have no Anthropic credential configured.
Do not copy a key into source control or this report.

## Execution sequence after approval

1. Inject `ANTHROPIC_API_KEY` through the approved server-only secret manager.
2. Run the non-generating readiness probe:

   ```text
   pnpm --filter @athyper/svc-ai run eval:anthropic:readiness
   ```

3. Run the complete 200-case immutable pilot against the allowlisted Neon
   synthetic tenant, with a read-only ledger connection and the restricted
   approval artifact.
4. Run the balanced and best-model smoke subsets.
5. Execute the credential rotation test and verify the old credential is not
   used after revocation.
6. Reconcile provider usage/cost against run and provider-call ledgers.
7. Verify the hard gates:
   - exact model identity: 100%;
   - completed streams: at least 99.5%;
   - provider 429/5xx: below 1%;
   - usage/cost reconciliation: at most 1%;
   - no prompt/response/provider body in logs or traces;
   - no retry after visible output;
   - cancellation and truncated streams pass.
8. Allowlist staff/internal tenants and begin the two-week soak.
9. Record the final promotion decision and retain the restricted evidence.

Until every gate is evidenced, Anthropic remains an internal, default-off
binding and no customer tenant data may be sent to it.
