# Root contract tests

`tests/contracts/` contains repository-level contracts that span more than one
workspace package or application plane. These tests deliberately live outside a
single package: moving them into a package they exercise would make that package
depend on its consumers and reverse the intended dependency direction.

## Runner and commands

The suite uses Node's built-in test API (`node:test`) through `tsx --test`; it is
not a Vitest workspace suite.

Run the contracts directly with:

```sh
pnpm test:plane-contracts
```

`pnpm test:root` includes this command, and `pnpm test:repo` includes
`test:root` after the workspace test leg. Do not add these files to a package
Vitest configuration or invoke them from another root test command.

## Naming and admission

Name files `<capability-or-boundary>.test.ts`. The name should state the
cross-workspace invariant, not a package implementation detail.

Place a test here only when all of the following are true:

1. It verifies one contract across two or more active workspace packages,
   application planes, or both.
2. No single package can own the test without importing one of its consumers or
   otherwise reversing the package dependency direction.
3. It is runnable through `tsx --test` without application-only runtime setup.
4. Its logical owner is entered in the matrix below before the test is merged.

Keep package-local behavior in the package's colocated test suite. Keep browser
journeys in the Playwright lifecycle and performance scenarios in their
dedicated runner; neither belongs here.

## Logical ownership

This table is the authoritative review record until valid GitHub team handles
are confirmed. At that point, matching entries may be added to `.github/CODEOWNERS`.
Do not infer or add GitHub team handles from the logical-owner labels below.

| Contract file | Cross-workspace boundary | Logical owner | Inventory basis |
| --- | --- | --- | --- |
| `server-plane-composition.test.ts` | Server plane ownership descriptors against deployment profiles and capability availability assertions | Studio, Mesh, Neon, and Server Platform Host (joint) | The three `@athyper/server-plane-*` packages own their plane descriptors; Server Platform Host owns their deployment composition and capability reporting. |
| `frontend-spine-browser-contracts.test.ts` | Browser consumers against canonical API problem, sanitized session, authorization, feature, and navigation fixtures | Contract Platform and UI Platform (joint) | Contract Platform owns wire schemas; UI Platform owns browser consumption. |
| `frontend-spine-server-contracts.test.ts` | Server producer compatibility against the same canonical frontend spine fixtures | Contract Platform and Server Platform Host (joint) | The shared fixtures prevent an independently maintained frontend/server DTO mirror. |
| `api-client-transport.test.ts` | Same-origin relay transport, cancellation, streaming, CSRF/idempotency, and canonical boundary parsers | Shared Platform and Contract Platform (joint) | Shared Platform owns transport behavior; Contract Platform owns the response schemas and compatibility fixtures. |

When a contract changes, request review from its logical owner and from each
affected application-plane owner. A root contract can have more than one
logical owner when it deliberately asserts a joint plane boundary.
