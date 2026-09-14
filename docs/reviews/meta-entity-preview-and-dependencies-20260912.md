# Meta Entity preview and candidate dependencies — implementation status

Updated 12 September 2026, 08:40 MYT.

**Partial delivery.** The native graph preview now has a durable signed store,
runtime projection, host wiring, coordinated metadata/authorization reads and a
Studio working-draft editor. It is loaded in DEV source mode. It has not yet passed
an authenticated Studio-save → NEON browser journey. General policy/lifecycle/
numbering projection, complete dependency capture/import and successor QA
qualification remain incomplete. No staging deployment occurred.

## Implemented in this increment

- `DurableGraphPreviewStore` stores claims, signed artifacts and activation heads in
  local SQLite. One transaction commits the complete plane projection set. Stale
  writers cannot replace a newer claim; failed compilation retains the prior head.
  Artifacts use Ed25519 development signing and environment-restricted trust.
- `createDurableGraphPreview` invokes the native graph validator, tests and compiler,
  resolves dependencies and stages runtime projections before activation. Status
  includes saved and active change-set/revision identities. The host reloads the
  author's current grants and authentication epoch before compilation and again
  before activation. No grants or approval records are manufactured.
- The API host supplies the authoring save hook. It reads back normalized native
  storage and uses optimistic revision checks. A saved draft and failed preview
  remain distinct outcomes.
- The runtime projection accepts registered stored read-only fields and catalog-
  bound operations. Existing registered list/detail presentation is retained where
  the native graph supplies no replacement. Native surface bindings override it.
  The real runtime descriptor parser and existing handler/authorization registry
  qualification run before activation.
- Storage registration comes from the active runtime descriptor, or, for a fresh
  personal runtime, an independently approved published native runtime artifact in
  Studio. Submitted graph storage coordinates cannot create a registration. The
  fallback excludes revoked imported baselines. AI changes require separate
  registry qualification and currently fail explicitly.
- The registered independently owned BP request collection uses the **same
  collection compiler as native publication**. Its storage and active subject case
  contract must exist. An absent case contract is an activation failure.
- IAM selects a signed artifact generation when creating the request permission
  snapshot. Metadata reads use that exact immutable artifact. Authorization refresh
  reloads real grant evidence while retaining the request's metadata generation.
  Preview operation bindings replace the prior entity bindings; removed operations
  cannot fall back to published grants/bindings. Grants themselves are unchanged.
- Studio `/entity/graphs` provides tenant-scoped list/load/fork/save through the
  normal authenticated BFF. A published graph is forked with new branch row IDs;
  published source rows remain intact. The editor reports saved/active identities
  and errors and uses optimistic save revisions. Unsaved edits must be saved or
  discarded before switching drafts. Experience Composer links to the graph page.

The durable file is
`~/.athyper/instances/dev/workspace/preview/meta-entity.sqlite`. It is local
**development evidence**, separate from publication signing and release evidence.
No graph activation head was created by this increment's read-only probes.

## Verification and observed live state

46 targeted tests passed:

- 24 native coordinator, durable store/adapter, authoring hook, route isolation and
  existing graph-identity/learning tests.
- 13 runtime/IAM integration, presentation retention, dependency packaging and
  candidate integrity tests.
- 9 existing native document-collection compiler tests.

The runtime integration uses the real descriptor parser, Ed25519 verification,
SQLite reader, permission snapshot builder and permission authorizer. It verifies
coherent reads during activation, wrong-company rejection, revoked grant denial,
foreign-tenant rejection and removal of old bindings. These are development
fixtures, **not authenticated QA acceptance**.

Production TypeScript checks passed for the host and Studio. The authoring test
configuration inherits an exclusion for `*.test.ts`; its successful invocation is
not counted as a full test-source typecheck.

Read-only live probes found two published Cirrus BP native change sets:

| Change set                             | Revision | Native compile | Runtime projection                         |
| -------------------------------------- | -------: | -------------- | ------------------------------------------ |
| `3d68c639-df7e-4683-8c26-93b87bab21eb` |        4 | Passed         | 10 fields, 42 operations, 6 visible fields |
| `c617270b-cbc3-44ed-867e-31e55e819c3c` |        5 | Passed         | 10 fields, 42 operations, 6 visible fields |

Both retained list/detail presentation and matched the registered AI descriptor.
Standard DEV NEON currently has no active BP runtime descriptor. Studio has a
published runtime registration; the fallback query selected native release
`c2cc6900-26c1-47ca-8dfc-1d488000950c`. Projection parsing is not host registry,
authenticated activation or command-journey qualification.

DEV source services and shared DEV/QA infrastructure were stopped externally during
this work and subsequently restarted externally. DEV's six source services were
healthy after restart, and `/livez` returned 200. `/entity/graphs` returned 200
before the interruption; an unauthenticated route response is not editor acceptance.
No application-mode switch or infrastructure shutdown was performed by this work.

The saved DEV Studio `catl.admin` session remains expired. The authenticated proof
requires a refreshed session with the assurance already required by the published
`metadata.entity.author` permission. Existing QA sessions must also be revalidated
when the successor candidate is ready.

## Dependency and QA work still required

Existing `metadata-set.mjs`, `metadata-pack.mts` and `metadata-graphs.mts` traverse
an explicit source index, recompile native graphs, bind transitive dependencies
and reject missing or substituted nodes. Candidate format v2 binds `metadata.json`
to the source/image candidate. This is **packaging**, not complete source capture
or native import.

1. Finish native projection for policy/field-policy bindings, lifecycle, numbering,
   flows, related entity dependencies, writable/new storage and broader AI changes.
   These currently fail explicitly. General projection must also be integrated
   with normal native release preparation; only the registered collection adapter
   is shared end to end with publication today.
2. Run the authenticated Studio working-draft save → NEON update journey, failed
   compilation recovery, competing saves and live rejection checks. Verify the
   browser refresh behavior and feedback latency. The test fixtures above do not
   replace this journey.
3. Capture the complete actual BP dependency inventory: entity graphs, catalog and
   policy definitions, exact lifecycle/numbering revisions where referenced, case
   contract, onboarding definition and runtime registration/presentation inputs.
   Graph-only capture is insufficient because runtime registration contributes to
   projection. Import through native authoring paths and validate each target
   consumer's actual activation. The current v2 importer still refuses before
   making QA changes; the dependency activation qualification gate still fails.
4. Freeze a successor from a clean committed candidate checkout with exact image,
   migration and metadata bindings. Import into the separate QA databases, perform
   native signing/activation and independent authenticated `catl.admin` /
   `catl.owner` journeys. No successor candidate was frozen or qualified here.
5. Promote the same verified candidate when staging is available. The user has
   confirmed that staging is not ready.

The prior `frozen-v3` QA handoff remains partial: seven image checks and the NEON
onboarding hash passed, but metadata dependency checks failed. Retained receipt:
`~/.athyper/qualification/qa/handoff-1789170359241.json`, with `handoffPassed:false`
and `releaseQualified:false`. Release 20, prior approvals and old QA volumes were
not rewritten.
