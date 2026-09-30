# Country Meta Entity–driven Atlas pilot

Country opts into the shared Atlas Entity tools through published metadata. The
reference product parser and graph builder preserve the AI declaration through
compilation. No Country-specific application, provider, SQL tool or write grant
was added. Future reference entities use the same opt-in declaration and generic
runtime; no model retraining is needed.

## Capabilities and controls

- `entity_read_record`: current authorized summary fields, including Country's
  postal, address and phone reference values.
- `entity_explain_fields`: types and required flags for summary fields actually
  returned by the authorized read. It excludes storage mappings, policy operands
  and validation option sets. It is not input validation or permission to write.
- `entity_read_comments`: existing Entity collaboration owner, current parent
  access and comment audiences; saved text only. Drafts, moderation reports,
  rich JSON and attachment payloads are excluded. Pagination and reply scope are
  explicit. A partial page cannot establish that a user has no comments.
- `entity_read_snapshots`: existing Entity activity owner, bounded authorized
  snapshot headers with cursor and date-range coverage limitations.
- `entity_compare_snapshots`: two explicit snapshot IDs, existing owner
  comparison, current field authorization, missing-capture states preserved.
  Snapshot comparison does not claim to compare unsaved edits or the live row.

All reads require active metadata, the selected record, the published read
permission, current Records admission and the Atlas tool authority. The
coordinator binds entity code, descriptor hash and work scope on the server;
model attempts to override these coordinates fail. Historical-page context is
not treated as a current record. Owner errors fail closed. Tool evidence is
re-executed under current authorization before a saved answer can be reused.
Country remains read-only. Metadata enables discovery, never grants access.

## Validation

- Metadata contracts: 63 tests passed.
- Atlas: 261 tests passed, including substitution, stale publication, permission
  denial, parent/tenant mismatch and changed/revoked replay evidence.
- Metadata authoring: 238 tests passed, including Country on three planes,
  historical descriptor compatibility, and AI-only successor preservation.
- Host adapter and compiler boundaries: 7 tests passed.
- AI, authoring and host typechecks passed. The merged DEV host also typechecks.
- Persisted DEV successor source: PostgreSQL/RLS qualification passed with no
  skip, including changed pins and wrong-tenant denial.

## DEV deployment and publication

The implementation was merged into the DEV-mounted checkout using a staged
three-way merge that preserved its concurrent framework edits. Existing contents
are retained in `/tmp/country-atlas-deployment-stage/manifest.json`. This is a
working-tree deployment, not evidence that the isolated release commit alone
is deployed. The source API, worker and control API were restarted and healthy.
The existing publication-workload mounts were retained.

Country release 10 is the retained predecessor; release 11 is now active on all three planes. A draft-only successor
was prepared through `prepare-dev-entity-successor.ts --ai-product=...` and the
new `amendSuccessorAi` guard. Operations, permissions, capabilities and layout
are preserved; only the AI declaration changes. Source and target pins are
checked by the existing independent maker/checker publication workflow.

Evidence directory:
`~/.athyper/instances/dev/artifacts/country-atlas/20260930/`.

The independent `platform.admin` proposal and `platform.owner` activation are
recorded for policy `aea5c6ee-0374-476f-a3ad-78a6a22cc440`. Execution dispatched
release `274fd17d-8e1f-4f2e-91cf-c4424c0c3dbc` (release 11). Activation readback
confirmed that exact release active on Studio, Neon and Mesh, head version 11.

The first execution attempt failed before release creation because the saved
source Compose configuration omitted the existing document-processing overlay.
The API/worker preview network, renderer URL and qualified parser configuration
were restored in both `source.compose.json` and `source.full.compose.json` and
the services recreated. The unchanged approved policy then executed successfully;
no capability or prerequisite was bypassed. Private before-config copies are in
the evidence directory. Source-mode resume retains these saved settings.

Two snapshots were captured through the authorized Country Activity API,
without changing the Country record. The live owner comparison returned 22
currently authorized fields and zero changes, as expected. The snapshot IDs and
comparison response are retained privately in `snapshot-fixture.json` and
`owner-comparison.json`. No comments, role grants or business records were added.

The refreshed Neon MFA capture passes the actual API admission checks. The earlier
saved token was correctly denied for missing MFA despite an elevated BFF session
projection. The capture helper now verifies both Atlas chat and read admission
before saving. Eight capture tests pass; no grants or MFA policies were changed.

The live checks exposed shared runtime issues that unit-only qualification missed:

- The inference container/image and coordination hash were missing. Restored the
  pinned image and retained model volume using the documented quiescent recovery.
  A concurrent DEV API recreation later abandoned an active lease; with the user
  confirming a stable deployment window, stopped both clients, restarted inference,
  cleared only the abandoned ownership fields and retained the epoch. Private
  recovery receipts record both actions.
- The relay's 15-second streaming startup budget could cancel authorized cold
  document grounding. The registered Atlas run operation now has a bounded
  75-second response-header budget; explicit deployment overrides, cancellation,
  CSRF, tenant admission and replay controls remain intact. All 41 relay tests
  and the relay typecheck pass.
- The registered summary now includes the overview alias. A trailing registered
  section reference is recognized without discarding real filters or name queries.
- Generic context tools use existing section-selection metadata, without a direct
  read shortcut. Only relevant admitted tools are advertised to the local model;
  the conservative 4,096-token budget remains unchanged.
- Successful field-declaration, comment, snapshot-list and comparison results
  have faithful typed presentation, avoiding a second model pass over oversized evidence. Unknown
  capture states remain unknown; declared fields do not imply write permission
  or executable input validation. Multiple successful context-tool results are
  rendered together, so a model round that lists and compares snapshots retains
  both results. Bounded batches of four independent disclosure checks preserve
  order and fresh authorization while reducing repeated serial history latency.

The qualifier requires successful tool-completion events, Country record-scoped
citations, nonempty rendered answers and actual Malaysia details. It retains
failed attempts separately. All five journeys now have passing evidence in
`browser-positive-qualification.json`: record details, 18 authorized field
declarations, the empty authorized root-comment page, two snapshot headers, and
comparison of 22 authorized fields with zero changes. The first four checks
passed in `browser-final`; comparison passed in the targeted
`browser-comparison-final` rerun after the multi-result formatter fix. This is
combined per-journey evidence, not a claim that the final full sequential suite
was rerun without failure. The final comparison screenshot and rendered text
were inspected. Changed and uncaptured comparison cases are unit-tested; the
live Country row was not edited. Populated comment/reply journeys and latency
qualification are not established by this empty-comment pilot. Source hashes
are recorded in `qualified-source-files.json`.

## Reproduction

1. Capture the active Country predecessor with
   `capture-dev-publication-baseline.mjs --release=<active UUID>`.
2. Run `prepare-dev-entity-successor.ts --baseline=<JSON> --request=<UUID>
--ai-product=metadata/products/shared/entities/country --check`, then its
   explicit DEV draft-persistence mode.
3. From the deployed compiler checkout, run
   `prepare-dev-entity-successor-policy.ts --baseline=<JSON> --draft=<JSON>
--policy-id=<unique code>`. Enroll and approve through the normal independent
   control-plane actors. Execute through the publication workload, never raw
   release/activation-head SQL.
4. With the existing Neon saved sign-in, run
   `node tooling/scripts/verification/qualify-country-atlas-dev.mjs
<Country UUID> <private evidence directory>`.

DEV control sign-in and policy requests require
`NODE_EXTRA_CA_CERTS=~/.athyper/platform/secrets/tls.crt` with an expanded absolute
path. Keep TLS verification enabled and never copy credentials into evidence.

## Explicit capability limits

This pilot supports a selected Country record. It does not install unrestricted
entity search, address mutation/validation, automatic snapshot capture, generic
collection diffs, comment author-directory lookup or a live-vs-snapshot
comparison. Those need their own shared owner contracts and authorization tests.
The published Country rules are reference data; Atlas must not invent a postal
validation guarantee from a stored pattern or example.

## Release review

Draft PR: https://github.com/atlasdigitaltech/athyper/pull/9, stacked on platform
remediation PR #8; eventual integration target is `stack-v2-foundation`.
Remote CI passed the Country/Principal framework qualification and the
three-plane permission stack. Existing OpenAPI and broader platform static
policy failures still block release integration; the latest pre-follow-up CI also
reports the internal documentation deployment failing. The first run also found a
stale generated authorization inventory because local ignored Kysely outputs
and a Playwright result were present during generation. Regeneration from a
clean tracked-source export removed that environmental drift; the scanner and
its authorization gates remain unchanged. Positive Country Atlas browser evidence is complete at the per-journey scope described above. Release integration still requires passing required remote checks.
