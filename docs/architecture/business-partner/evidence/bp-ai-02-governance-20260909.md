# BP-AI-02 frontend governance closure — 2026-09-09

The failing `policy:frontend-spine` gate was rerun against the implementation tree. Every dependency responsible for a budget overrun was checked against imports in its package's `src` tree; none was unused. The package owner/classification inventory and the contract zero-runtime-dependency rule remain unchanged.

The authentication session contract imported `platform-temporal` only to validate expiry strings. It now validates an offset-bearing ISO timestamp with calendar/leap-year/time/offset bounds locally, without a runtime dependency, clock, or date arithmetic. This also rejects date-only, local-time, invalid-calendar and overflowing-offset values that are unsuitable for a session expiry. Existing producer fixtures and authenticated session transport remain compatible. Runtime expiry calculations remain in the owning session/runtime packages.

Budgets were reconciled with the already-used dependencies, without adding spare allowance:

| Package | Runtime/workspace budget | Existing dependency purpose |
| --- | --- | --- |
| `platform-api-client` | 8 / 8 | Shared API/session/authorization/dashboard/entity-list/navigation contracts, localization, temporal handling |
| `platform-iam-auth-bff` | 4 / 3 | Session and store owners, temporal handling, JOSE |
| `platform-iam-identity-gate` | 5 / 5 | Session consumption and shared brand/icons/surface/UI |
| `platform-iam-session` | 2 / 2 | Pure session contract and runtime temporal handling |
| `platform-shell-app-foundation` | 8 / 8 | Session/API/query/shell/surface/temporal/UI composition |
| `platform-shell` | 7 / 7 | Atlas, collaboration, localization, icons, runtime, temporal and UI |
| `product-neon-business-partner` | 9 / 9 | Shared record presentation and panel, API/session shell, surface/temporal/UI and Neon shell |
| `product-neon-shell` | 8 / 8 | API, localization/icons, shell/activity/app foundation, navigation and UI |
| `product-studio-business-partner` | 2 / 2 | API client and session-scoped app foundation |

Validation:

- `pnpm policy:frontend-spine` — passed.
- `pnpm policy:shared-purity` — passed, 63 active shared packages.
- `node --test tooling/scripts/policy/frontend-spine-governance.test.mjs` — 3 passed.
- `pnpm exec tsx --test tests/contracts/frontend-spine-server-contracts.test.ts tests/contracts/frontend-spine-browser-contracts.test.ts tests/contracts/api-client-transport.test.ts` — 17 passed, including expiry validation and all existing producer/browser/relay fixtures.
- `pnpm --filter @athyper/contract-platform-auth-session typecheck` — passed.
