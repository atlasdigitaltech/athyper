# Country onboarding audit follow-up

Release 8 manual acceptance remains passed. This follow-up changes source only;
it does not activate a successor or edit historical signed payloads. DEV uses
source mounts, so frontend source changes may be visible before a service restart.
No Business Partner metadata or QA deployment was changed.

## Implemented

- Replaced undefined focus/heading/surface CSS variables with existing canonical
  theme tokens, rather than creating a second token vocabulary.
- Native query projection treats search, filter and sort permissions independently.
  Search requires both explicit search permission and configured search membership.
- Record section menus are outside the tablist. Settings use native toggle buttons
  in a labelled group rather than an incomplete ARIA menu implementation.
- Collaboration closed from a direct link returns focus to record navigation when
  there is no surviving opener. Conditional attachment disclosures no longer
  advertise absent upload/history targets.
- Country authoring now explicitly retains Private, matching the accepted release.
- Summary headings resolve localized labels; summary status/retry/error copy and
  boolean detail values use English, Malay and Arabic catalogs. Server error details
  are not displayed by the summary fallback.
- Documented the canonical Country URLs on all three planes. The generated catalog
  has no Country entry, so no speculative workspace/module alias was introduced.
- Country browser tests are required by test:root/test:repo. CI installs Chromium
  and dependencies before the root gate. Fixed an existing fixture CSS loader issue.

## Verification

- Required Country browser gate: 37 passed, including three locales, RTL,
  light/dark/high-contrast focus, direct-link focus return, draft preservation,
  side/full navigation, malformed responses and plane adapters.
- Query-access policy tests: 5 passed.
- Full metadata suite: 88 passed, 2 skipped (includes the five policy tests).
- Attachment discovery/search browser regressions: 54 passed.
- Metadata and form-detail typechecks passed; git diff --check passed.

## Scope and remaining audit inventory

The baseline file records HEAD plus SHA-256 hashes of the principal pre-change
working files. It is not a clean reviewed release commit. The heavily modified
working tree was not blanket-staged or committed. A scoped release commit still
requires review of the existing overlapping changes before publication.

The reported 544 strings / 2,166 raw declarations are not treated as independently
reproduced totals. This patch closes the concrete summary/boolean localization
defects, not a repository-wide translation or token-conversion programme.

`search.profileKey` is validated against authored profiles in deterministic.ts and
projected by entity-list-service.ts. A query-execution consumer was not established
in this review. Retain compatibility until execution semantics and references are
fully inventoried; do not delete it as supposedly unreferenced metadata.

The three allegedly active stub packages were not named in the supplied audit.
No package or governance entry was deleted without exact targets and dependency
evidence. The deployment capability registry inspected here distinguishes conditional
and unregistered capabilities, rather than declaring all entries active.

Any future publication must qualify the changed compiler fingerprint and retain
the normal independent approval/signature workflow. This follow-up did not run that
workflow and is not a new signed release.
