# Purchase Order Lifecycle Matrix — Phase 0A

Status: **implemented; deployment verification required**

The executable source of truth is
`server/packages/services/business/p2p/purchase_order/purchase-order-lifecycle.contract.ts`.
SQL seeds, runtime handlers, hooks, and integration tests must remain equivalent
to that contract. This document explains the decisions that are not obvious
from the rows alone.

## State path

```text
draft -> pending_approval -> approved -> active
                                  |          |
                                  |          +-> partially_fulfilled -> fully_fulfilled -> closed
                                  |
                                  +-> suspended -> previous executable state

pending_approval -> rejected -> draft
draft/pending_approval -> cancelled
approved/active/partially_fulfilled -> cancelled or closed (short close)
approved/active -> expired
```

## Command policies

- `return` and `withdraw` are distinct public workflow commands. Both converge
  on the lifecycle edge `pending_approval -> draft` using the lifecycle
  operation `return`. Audit and outbox records retain the originating
  command, actor, workflow request, and execution token.
- `release_hold` restores the state recorded when hold was applied. It is not
  resolved by selecting an arbitrary `suspended` edge.
- Goods receipts and accepted service sheets call `record_fulfillment`; the
  resulting PO state is derived from authoritative fulfillment totals.
- Invoice matching never changes physical fulfillment quantities.
- `short_close` is distinct from normal close and reverses the remaining open
  financial commitment before entering `closed`.
- Cancellation and expiry require policy-specific financial reversal and a
  material snapshot.

## Exit gate

Every row in the executable contract must resolve to exactly one permission,
handler, validation policy, business-effect policy, activity event, snapshot
decision, transactional outbox event, hook registration, and integration test.
No equivalent active transition may remain on the retired standalone
`purchase_order` lifecycle.

Implementation evidence and the deployment gate are recorded in
`docs/specs/po-phase-0a-exit-gate.md`.
