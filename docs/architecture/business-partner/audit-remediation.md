# Business Partner audit remediation

This change addresses the confirmed defects and consolidates the existing runtime and provisioning behavior. It does not require a database migration or republishing generated identifiers.

## Correctness

- The development profile builder no longer requires the unused `legalName` property. Fixture tests assert Northwind's legal name and two aliases, plus the generated series' legal suffix and aliases.
- Partner titles fall back from a blank name to the partner code. Request rows fall back from a blank proposed name to the target partner ID, then the empty marker.
- Explainability pagination owns a query-scoped cursor and result state. Query changes hide old results immediately, reset pagination, and abort pending work. Late responses are ignored even if transport cancellation is ineffective. Failed page loads retain current results and support retry.
- The shared record sidebar uses “Primary record details”.

## Shared runtime design

Organization selection is shared across the four BP consumers. It retains the request-specific company override and never auto-substitutes a different organization when an explicit request organization is unavailable.

Command feedback is shared across request, customer, and supplier controls. It retains each screen's error and success behavior and serializes commands until refresh finishes. Error-message extraction preserves transport problem details; applicant errors now use the same path. Structured application-boundary recovery remains the responsibility of the existing error taxonomy.

Label formatting uses the existing business-label table with an explicit title/sentence casing option and consistent abbreviations. Customer lifecycle and supplier decision buttons derive from action lists while retaining their permission and readiness checks.

Directory selection is a generic string/array map with typed shared organization/company coordinates. Existing published `requires` dependencies drive readiness and transitive clearing in chips, dialogs, and quick filters. No additional reset relation is needed for the current filters. Selection comparison includes arbitrary filter keys and treats empty or reordered sets consistently. The application layout forwards URL query text; the Neon adapter owns interpretation of the BP role parameter and validates values before constructing wire coordinates.

The published V1 filter parser and backend wire allowlists remain closed. Supporting additional filter kinds end-to-end requires a coordinated contract extension: declaration validation, plane-owned URL mapping and serialization, Atlas context projection, and backend enforcement. Merely widening the parser would allow unsupported declarations without providing execution semantics. The shared UI is now ready for that extension; the current wire behavior is preserved.

## Performance and identity

- The 360 panel alignment and context value, application context value, and saved-view dirty comparison are memoized with their inputs.
- Bookmark toggles use the existing membership set without rewriting every row's decoration. The transport decoration contract remains intact.
- Public `with…` provisioning transforms clone their input once and call explicitly named `apply…` steps on that working graph. Standalone public transforms still return independent graphs.
- Presentation UUID generation and surface-binding lookup are consolidated. The UUID helper deliberately preserves the existing hash inputs and formatting instead of substituting the different three-plane algorithm.

A local comparison using the full-profile foundation fixture measured **9 graph clones before and 1 after**, both for initial construction and reapplication. Before/after JSON was byte-for-byte identical: 106,979 bytes, SHA-256 `fef24c339cc1c02d9cf444a909ba48db268227853289ae4e0ba37ccd179d9115`. Reapplication was idempotent. This is evidence of reduced copying, not a production latency benchmark.

Compact contact/address lookup continues to follow the existing scoped cursor endpoint. A future direct lookup must accept the same partner, principal, scope, role, and historical-date coordinates and return the same authorized projection. Substituting an unrelated record endpoint would not establish those guarantees.

## Verification

- BP package suite: 220 tests passed; the subsequently added previous-scope revisit regression also passed with the targeted pagination/request suites.
- Targeted foundation suites: 41 tests passed, covering dependency-driven filters, existing directory UI behavior, and bank/address/full-profile provisioning, including immutable public wrappers.
- Fixture tests: 3 passed. List/scope contract tests: 18 passed.
- BP, Neon list, and shared list runtime TypeScript checks passed.
- DB TypeScript diagnostics fell from 26 to 22: all four obsolete `legalName` errors were removed and no new diagnostics appeared. Remaining errors predate this change, including cross-root imports and unrelated test typing errors.
- `git diff --check` passed.
