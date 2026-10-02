# Principal saved-view loading — 30 September 2026

Implemented in the shared Entity Framework, used by Neon, Mesh and Studio. No Principal-specific UI, metadata or provider was introduced. DEV currently runs the mounted source checkout; the changes are active there, not an immutable image release.

## Changes

- List bootstrap requests `list-descriptor?includeViews=true`, with the existing parent coordinates and explicit view surface when present. The server resolves/authorizes the descriptor once, then obtains and validates the saved-view catalog against it. It only includes views for a ready, server-view-enabled descriptor.
- Shared route composition supplies the saved-view reader without introducing a records-to-preferences service dependency. The standalone views endpoint remains available for existing consumers and commands.
- Standalone views GET now uses request-scoped immutable metadata/IAM evidence. Combined reads use the existing descriptor read boundary. Every capability still receives its own authorization decision; neither records nor decisions are cached across requests. Commands remain outside that boundary.
- Existing default selection, URL overrides, compatibility validation, filters, sorting and server-locked parent scope remain in place. Rows wait for the catalog. Lookup directory loading also consumes the combined result.
- A microtask before list descriptor dispatch suppresses immediately cancelled effect instances. Real client/entity/scope changes still abort obsolete work. The HAR's status-0 request alone did not establish its cause; both a Strict Mode regression test and a live initial-load observation now show a single descriptor request.
- `Server-Timing` exposes `descriptor`, `views` and `total` when `ENTITY_READ_DIAGNOSTICS=true`. Enabled on the current DEV API; disabled by default in code. Timings start after authentication middleware and do not represent the entire browser round trip.

## Validation

Live authenticated Neon checks used the Principal Notifications scope from the supplied HAR. Five alternating samples compared separate descriptor + views calls with the combined call **on the updated server**, excluding rows:

| Read pattern | Median | Range |
| --- | ---: | ---: |
| Separate descriptor and views | 476 ms | 474–527 ms |
| Combined descriptor and views | 262 ms | 208–273 ms |

This is approximately 45% less preparation time. It is not a controlled before/after comparison with the original HAR. Combined server stages were approximately 147–165 ms for descriptor and 1.1–1.3 ms for views. The tested live catalog contained no saved views; saved-default preservation is covered with test fixtures.

The live browser generated one combined descriptor request followed by one row request, both 200. No separate views call or cancelled descriptor replacement appeared in this observation. Evidence: [sanitized samples and browser request summary](principal-performance-evidence/20260930.json).

Automated checks:

- Preferences: 79 tests passed.
- Entity read routes: 39 tests passed, including combined scope gating and request-boundary isolation.
- Focused list regression selection: 7 passed, covering scope bootstrap, stale authority, saved views and combined Strict Mode loading. The new test checks parsing of the bundled catalog and the first row request's saved filter, descending sort and parent coordinates.
- Preferences, records, list-view and platform-host typechecks passed; diff whitespace check passed.
- Full list Phase 1A suite: **20/20 passed** after resolving the pending test expectation. The fixture throws an unclassified error, so the shared taxonomy and localized catalog correctly render “Something went wrong”. Updated the test to check the current heading and safe description, absence of the raw technical message, no expanded diagnostics, and a working retry. The former diagnostic assertion incorrectly required a collapsed `<details>` element even when no diagnostics were rendered. No production error-handling change was needed.

Only Neon received live authenticated validation in this run. Saved Mesh/Studio admin sessions were anonymous; shared implementation does not establish runtime verification for those planes.

## Manual testing

1. Open Principal in each plane, then Notifications. In Neon the tested page is `https://neon.dev.athyper.test/app/entity/principal/645b6a55-3355-526a-9643-3900425bde47?section=notifications&tab=notifications`.
2. Clear the Network log, reload and capture a HAR with response content. Expect one stable-scope `list-descriptor` request with `includeViews=true`, followed by rows. Inspect `viewCatalog` and `Server-Timing`. A separate `/views` read is unnecessary during normal initialization.
3. Create a temporary personal view with a recognizable filter and descending sort; make it default, then reload. The first row request must already contain that filter/sort, with no flash of the unfiltered list. Verify an explicitly selected view/URL override still takes precedence. Restore the previous default and remove the temporary view afterward.
4. Switch to another Principal, then rapidly switch sections and back. Verify parent coordinates change correctly, rows never leak from the previous parent, and obsolete responses do not overwrite the current section. A real scope change may legitimately cancel a request.
5. With an appropriate restricted test account, confirm unavailable parent records remain denied and shared-view actions match permissions. An incompatible saved view must not silently drop a filter and broaden results.
6. Repeat in Mesh and Studio, and smoke-test Country list search, sorting, filters and pagination to confirm the shared change behaves consistently. Compare warm/cold captures separately; a single HAR cannot establish a latency guarantee.
