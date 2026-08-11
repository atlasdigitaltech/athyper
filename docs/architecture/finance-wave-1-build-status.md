# Finance Wave 1 build status

**Started:** 2026-08-11  
**Execution plane:** Neon  
**API default:** Disabled until capability exit gates pass

## Current delivery

F1 foundation is implemented at the contract and service layer:

- canonical JSON and SHA-256 request fingerprints;
- canonical decimal-string validation;
- stable same-key/same-input replay and same-key/different-input conflict results;
- durable transaction-scoped replay through canonical `event.command_execution`;
- exact company, book, period, and currency coordinates;
- sparse rounding-context precedence using company (4), currency (2), and slot (1);
- immutable rounding rule/default revision and evidence hashes;
- decimal rounding without binary floating-point arithmetic;
- forward-only book-period transitions, explicit soft-close reopen authorization, and irreversible hard close;
- optimistic period updates using PostgreSQL `xmin`, since the canonical table has no writable version column;
- posting admission that checks permission, active book assignment, open period, immutable source evidence, and rounding before ledger mutation;
- concrete Kysely readers for rounding policy and book-period state that do not write generated columns.

## Qualification

| Gate | Result |
| --- | --- |
| Finance contract typecheck/build/tests | Pass |
| Finance service typecheck/build | Pass |
| Finance service unit tests | Pass: 7 |
| Live PostgreSQL/RLS/concurrency | Pending disposable Neon database |
| Finance SME golden examples | Pending approval |

## Remaining Wave 1 work

F1 still requires live PostgreSQL tests for RLS, concurrent period transitions, and durable command-repository replay under process failure. F2 through F6 remain unimplemented: budget/planning, GL/cross-book/commitments, inventory valuation, tax ledger, and close/revaluation. Public finance APIs remain disabled until each slice satisfies its own exit gate.
