# Metadata detail functionality parity — implementation in progress

Authority: `docs/architecture/application-experience/system-design.md`, Appendix A,
sections 7 and 14, and the entity comments presentation contract. Existing
functionality parity is part of scope, not only cosmetic alignment. This report
does not certify Country for complete collaboration acceptance.

## Implemented

- Explicit optional `recordPresentation.navigation`: `scroll` or `switch`, with
  optional named tabs assigning each declared section exactly once. The browser-safe
  contract rejects unknown, ambiguous, uncovered and executable configuration.
  Older definitions omit navigation and retain selected-section behavior.
- Trusted product parsing and graph compilation preserve explicit navigation.
  Historical source fixture hashes still reproduce; no historical release changed.
- Metadata detail composition reuses the existing section-navigation component,
  section-scroll hook, record view-settings controls and collaboration surface.
  PageWorkspace owns the navigation band. No Country/BP conditions or app copies.
- Section selection requests scroll/focus and pushes history. Passive observation
  replaces URL state without focus movement. Mode changes do not request section
  scrolling; keyboard arrows move tab focus and Enter activates. Back/Forward and
  deep-link restoration are covered. Responsive layout does not change scroll/switch
  semantics. No fabricated single Details/360 tab or Summary provider.
- Section view controls the rail; Content remains the base. The compact selector
  remains reachable without the rail. Preferences are plane/tenant/principal/entity
  scoped, separate from the record/authentication reset boundary.
- Comments/Files controls moved into record navigation. Existing URL, pin,
  side/full-view and preference handling are reused. One composer and its draft
  survive presentation changes; lazy reads and server authorization remain intact.
- Resolved title replaces the code-only current breadcrumb label. Record information
  is a secondary disclosure. Temporal fields use the shared locale/time-zone formatter
  when available, retain exact datetime attributes/title, and do not reinterpret
  unknown field types as dates. Failed detail loads clear previously loaded data.

## Live read-only baseline

### Navigation implementation follow-up

Country's checked-in definition now explicitly declares scroll mode and one
`Overview` tab containing `overview`, `phone`, `address`, and `audit`, in that order.
The generic renderer displays explicitly declared single tabs, respects their
section order, and does not reset the selected section when the active tab is
clicked again. Hiding Section view hides the rail, not the other content sections.
No entity-name branch or implicit Summary provider was introduced.

Fresh verification for this follow-up: 11 browser tests passed (5 metadata
navigation, 5 collaboration, 1 existing shared record-navigation regression),
4 contract tests passed, and 198 Studio authoring tests passed. Shared form/detail
and Studio source/test typechecks passed; `git diff --check` passed. The earlier
records, publication, host and three-plane list suites below were not rerun for
this follow-up. Browser tests remain fixture-based, not live acceptance.

This follow-up changes source and tests only. Persisting the updated graph and
publishing an independently authorized, source-pinned successor remain outstanding;
the draft-preparation tool clones the predecessor graph and does not itself import
this changed product definition. Existing enrollment cannot be reused for new pins.

### Previously captured activation baseline

Queried current activation heads joined to `runtime_meta.applied_release_payload`,
then inspected the operation artifact, inside read-only transactions. These are
current release-2 values, not inferred from repository configuration.

| Plane | Active head | Preview / extraction / content search |
| --- | --- | --- |
| Neon | `01a0e1c3-17de-774b-8f13-625040b9f71e` | All false |
| Mesh | `01a0e1c3-17ce-7096-80a7-3219cabc376d` | All false |
| Studio | `01a0e1c3-1817-74c1-905a-5c92bd81ca0c` | All false |

All three declare comment edits, but disable replies, reactions, mentions, drafts,
reporting and history. Attachment actions are read/create/finalize/download/archive.
No releases, activation heads, grants, schema or capability source flags were mutated.
The new explicit navigation has not been enabled through a Country successor release.

## Remaining parity work — not completed

| Feature | Existing implementation / gap | Completion gate |
| --- | --- | --- |
| Metadata tabs and continuous sections in Country | Contract/runtime implemented; current release lacks explicit navigation | Persist reviewed definition and publish successor |
| Summary view | Existing record runtime supports declared provider cards; basic detail does not yet consume qualified summary data | Reuse admitted provider resolution, not invented cards or unauthorized field summaries |
| Collection breadcrumb ancestor | Current record label fixed; authorized collection destination still needs integration | Registered, authorized ancestor; no raw URL-derived link |
| Preview and content search | Shared UI and discovery routes exist; signed capabilities disabled | Concrete processing/worker qualification, exact common permissions, live readiness and successor publication |
| Advanced comments | Shared UI exists; flags disabled and qualification rejects features | Verify each action/provider, audience/ancestor admission, persistence and live behavior |
| Folders, rename, versioning and other file tools | Source capability flags disabled; qualification rejects advanced features | Inventory exact backend operation contracts and qualify each before enabling |
| Full visual parity | Shared placement wired; detailed file-toolbar/spacing and matched-plane screenshots still outstanding | Same viewport, theme/density, RTL/long labels and 200% zoom checks |

Two explicit admission gaps precede capability enablement:

1. `server/packages/contracts/publication/src/common-capability-permissions.ts`
   admits only four comment and five attachment actions. Extend with exact reviewed
   action/permission/handler tuples, never a wildcard common namespace.
2. `server/apps/platform-host/src/composition/shared/publication/capability-qualification.ts`
   rejects advanced feature declarations. Replace each rejection only when actual
   providers, required persistence, processing dependencies and worker readiness are
   qualified. Presence of a UI component or scheduler is not evidence of a running worker.

Then prepare and independently authorize the applicable source-hash-bound successor,
use normal signing/dispatch/activation, and verify each target separately. Existing
release 2 remains immutable. There is no fake approval or direct runtime-table update.

## Verification

- Browser: 18 passed — 3 metadata navigation, 5 collaboration, 1 existing record
  navigation regression, 9 existing three-plane list/CSS parity checks.
- Contract/AST: 4 passed; new detail composition has an explicit shared-only import allowlist.
- Studio: 198 passed; source/test typechecks clean. Focused product suite: 14 passed,
  including explicit navigation in each target's compiled descriptor.
- Records: 290 passed, 3 skipped.
- Publication: 332 passed.
- Host: 682 passed, 25 skipped; typecheck still reports only the pre-existing
  `KyselyBusinessPartnerCaseRepository` import in `entity-case-preflight.ts`.
- Browser entity-runtime contract and shared form/detail typechecks clean.

Browser tests use fixture sessions/data and are not live authenticated preview,
search, cross-tenant or upload/scanner acceptance. Local Markdown is diagnostic
documentation, not immutable audit storage. The accessible Windows backup remains
read-only; no historical master-data implementation was restored.
