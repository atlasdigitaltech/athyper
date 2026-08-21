# Frontend package test conventions

Phase 0 establishes five test layers. Select the smallest layer that owns the behavior; do not duplicate every assertion at every level.

| Layer | Location | Runner | Purpose |
|---|---|---|---|
| Unit | colocated `src/**/*.test.ts` | Vitest for package suites | Pure functions, parsers, state machines, and component-independent rules |
| Contract | `tests/contracts/*.test.ts` when cross-workspace; colocated when one package owns it | `tsx --test` for root contracts | Wire schemas, fixtures, package boundaries, server/consumer compatibility |
| Browser/component | colocated `src/**/*.browser.test.tsx` with a package browser config | Vitest + jsdom and Testing Library | DOM behavior, keyboard/focus, ARIA, provider and component interaction |
| Integration | package `src/__tests__/integration/*` or repository `tests/integration/*` | Vitest/Node with explicit infrastructure opt-in | Redis, PostgreSQL/RLS, BFF/upstream, Next route-handler integration |
| E2E | `tests/e2e/*` | Playwright | Deployed user journeys, hydration, cookies, redirects, responsive behavior, accessibility smoke |

## Naming and scripts

- Use `*.test.ts` for unit and non-browser contract behavior.
- Use `*.browser.test.tsx` only for tests requiring a DOM.
- Use `*.integration.test.ts` for real adapter/infrastructure boundaries.
- Use `*.spec.ts` only for Playwright.
- Package scripts use `test`, `test:browser`, and `test:integration` only when that layer exists.
- Repository-level contract tests remain reachable through `pnpm test:plane-contracts`.

## Contract fixtures

Canonical frontend spine fixtures live in `packages/contracts/platform/fixtures`. They contain safe transport data only. Server-producer and browser-consumer tests must parse the same fixture. Changing a fixture requires a schema-version decision and review from Contract Platform plus the affected server and plane owners.

## Integration safety

Infrastructure tests must be opt-in, identify their exact database/Redis target, and fail before mutation when the target is not an approved test resource. Tests do not read reference roots as runtime fixtures. Reference behavior is translated into active acceptance fixtures first.
