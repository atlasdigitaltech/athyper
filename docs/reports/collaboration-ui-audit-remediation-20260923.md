# Collaboration UI audit remediation

Implemented 2026-09-23 against the current workspace. This record concerns the UI audit remediation, not closure of the broader CA-10 integration plan.

## Changes

1. **Pagination and async correctness:** section refresh preserves the loaded page count, including cached collections. Requests capture their generation, signal and section epoch; superseded pagination cannot overwrite a refreshed section or another record. Reply refresh preserves all loaded pages instead of stopping at five.
2. **Uploads:** comments, Files, versions and request attachments use the shared upload lifecycle. It validates storage URLs, omits credentials/referrers, rejects redirects, bounds PUT/finalize time, and probes uncertain finalization before repeating writes. File policy validation is shared. Paste prepares drafts on demand and uses the same synchronous upload lock as the picker. Edit uploads use a separate per-edit draft context; canceling it preserves root/reply drafts. Files expose cancellation, and failed version uploads have an explicit retry using the retained identity.
3. **Action recovery:** folder workspace conflicts have a distinct response code. Only that definite conflict discards the cached command identity; unknown outcomes retain it. Files track pending work per resource and scope errors to dialogs or background actions. Reactions on different comments can run independently. Processing status has one polling owner, stable attachment keys, increasing delays and terminal-state completion.
4. **UX:** expanded search excerpts render the full supplied snippet, copied links announce success, and the shared download helper preserves the current record using an isolated browser target and server attachment-disposition headers.
5. **Structure:** the compiled renderer delegates to separate Comments and Files workspaces, shared operations/primitives, and rich-text rendering. Boundary read models validate identifiers and nested comment/file data. Mention lookup, file labels, history toggles, download behavior, link normalization and attachment traversal have shared helpers. Repeated composer projections are memoized.

## Verification

- 54 tests passed in the pagination, comment-actions, file-discovery and composer-effects browser suites.
- After the final download-helper extraction, three affected browser tests passed, including the new download-target regression (55 distinct browser scenarios verified overall).
- Seven focused client/read-model tests passed, covering uncertain finalization, unknown retry outcomes, unsafe storage URLs, file validation and malformed rows.
- Forty attachment service tests passed across lifecycle, routes and folder scope.
- Forty collaboration service tests passed, including edit/root/reply draft isolation.
- Typechecks passed for collaboration UI, form-detail, Business Partner, attachment services and collaboration services.
- The affected-file whitespace diff check passed.

The regression cases include 100 loaded comments surviving refresh, eight reply pages surviving refresh, navigation and refresh racing pagination, pasted images blocking concurrent picker submissions, version validation before staging, folder revision-conflict recovery, polling backoff surviving section refresh, and snippets expanding beyond 280 characters.

## Boundaries

Strict fetch transport provides indeterminate upload progress; it does not claim byte-percentage progress. Native XHR does not supply equivalent redirect/referrer controls, so it is no longer a separate upload path.

Verification used local tests and browser fixtures. No deployment, live database reset, notification-delivery acceptance, second-entity activation or Mesh/Studio acceptance was performed. These results do not close those separate CA-10 requirements. Editor-engine replacement and speculative resize optimizations remain outside this correctness remediation.
