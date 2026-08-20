# Cross-plane suspension controls

The machine-readable authority is
`cross-plane-suspension-control.v1.json`. Validate it with:

```powershell
pnpm --filter @athyper/server-db run db:verify:authorization:suspension-controls
```

The contract deliberately separates five controls that must not be treated as
interchangeable:

| Control | Current boundary | Cross-plane guarantee |
|---|---|---|
| Local business deny | `authz.deny_rule` in one exact plane | None; local transaction only |
| Principal suspension | Plane-local principal and membership admission | None; other planes and sessions are unchanged |
| Tenant/organization suspension | Local tenant admission plus Studio organization desired state | Partial; no measured all-plane convergence |
| Identity-provider session invalidation | Provider session APIs and individual BFF relay-session revocation | Partial; no durable combined receipt |
| Emergency platform kill switch | Design boundary only | Not implemented |

`trustiam.application_projection` and plane-local
`authz.application_projection` describe organization-level application
admission. They are not evidence that a particular principal was suspended.

Likewise, `master.principal.auth_epoch` is a monotonic local revision, but its
presence does not prove revocation: the exact-plane resolver does not currently
compare the incoming token epoch with that column. The contract therefore
records this as a gap instead of claiming session convergence.

## Delivery priority

1. W1A contextual mapping publication — release blocker.
2. W1B canonical migration and parity proof — release blocker.
3. W2 projection ownership and role integration tests — release blocker.
4. W5 live double-apply CI proof — release blocker.
5. W4 durable Studio-to-plane reconciliation — operational release criterion.
6. W3 trusted-device expiry reconciliation and resolver test.
7. W6 cross-plane suspension control contract.

No report may state that W1 is the only release blocker. Projection provenance,
role enforcement, and pack idempotency must also satisfy their release gates.
