# Metadata-driven Atlas Entity discovery — 2026-10-01

Implementation adds shared, read-only `entity_discover`, `entity_lookup` and
`entity_follow_reference` tools. No entity-specific question matching, model SQL,
new permission grants or relaxed authentication are introduced.

An explicitly named record can be looked up independently of the current page.
Atlas discovers eligible published entity aliases, labels, searchable fields and
capabilities, then calls the existing authorized Records service. The current
page remains the source for relative questions. Named-record tools bypass the
old current-section shortcut so it cannot silently substitute the open record.

Discovery resolves active tenant/plane publications, not draft graphs. It limits
candidate enumeration to 256 entities, returns at most three matching descriptors within 1,000 serialized bytes,
and explicitly reports partial coverage. Each lookup is pinned to its discovered
descriptor hash, projects at most eight requested fields plus the search field,
and returns at most three authorized matches. Multiple matches require user
clarification; absence is not proof of nonexistence.

Metadata discovery runs as an authorized server step. A model that offers a
general-knowledge answer without an Entity read cannot stream or persist that
claim. Tool exposure is staged to fit the pinned local model context; neither
context bounds nor permission checks are relaxed.

Metadata and data reads use the verified caller. Entity permissions, operation
bindings, tenant isolation, row/field authorization and existing Records masking
remain authoritative. Discovery conservatively excludes unclassified,
confidential, PII, JSON and metadata-masked fields. Model arguments cannot supply
tenant, principal, plane, SQL or arbitrary query operators. Relative source IDs
and descriptor hashes are bound server-side to the current record. Source and
target are read separately under authorization and both are cited. Evidence is
revalidated by the existing durable-message disclosure service.

Published single UUID references are supported. String-key joins, composite
references and collection traversal are not inferred. Business Partner's
registration-country code and address collection require an explicit successor
metadata contract and qualification; its currently published AI metadata declares
no relationships. Consequently the relative Business Partner example is **not
live-qualified** by this change.

Country's source definition adds the `entity_lookup` capability and `manage`
context while retaining its existing record capabilities. Other eligible entities
can opt in through publication without model retraining or another tool handler.

## Verification and publication state

- Atlas: 282 tests passed; package source/test typechecks passed.
- Metadata: 93 tests passed; two optional database tests skipped; typechecks passed.
- Studio authoring: 238 tests passed; source/test typechecks passed.
- Real Entity authorization/Records integration test passed, including revoked
  permission, denied fields, tenant isolation and plane isolation.
- Host typecheck passed in isolated and DEV source checkouts.
- Country successor persisted as draft `3eec2d8e-fc56-4813-94e1-655f7696183b`;
  recompilation in the isolated checkout matches the deployed-source draft.
- Predecessor: Country release 11, `274fd17d-8e1f-4f2e-91cf-c4424c0c3dbc`.
- Activated policy: `country-meta-entity-lookup-20261001`, revision 1.
- Policy `108a5817-43ca-4cd7-a2a1-012980c50d6d` was proposed by platform.admin
  and activated by the independent platform.owner. Ordinary workload execution
  published Country release 12, `68274e76-2dde-4b04-8446-ed4b234461e2`. All three
  active heads (Studio, Neon, Mesh) carry `entity_lookup`.
- Neon named-record lookup passed from the Malaysia Country record: the request
  carried Malaysia's record context, executed `entity_discover` then
  `entity_lookup`, returned `Name: Afghanistan` / `Calling code: 93`, and cited
  Afghanistan's exact record. Workspace-level lookup without an Entity page
  context also returned the same authorized answer.
- Business Partner page qualification is **blocked**. The initial generic list
  URL rendered Access denied, so its successful Atlas answer was workspace-level
  evidence, not a loaded Business Partner page. A stricter qualifier now asserts
  the submitted page context. The existing BP record endpoint returned HTTP 500
  with `ENTITY_BACKEND_AUTHORIZATION_UNAVAILABLE`; its authorization descriptor
  has no supported enforcement adapter in the current DEV composition. This
  guard was retained. No fallback authorization or permission grants were added.
- The existing current-record overview/summary regression also passed with an
  authorized `entity_read_record` citation. No Atlas step-up was requested.
- Live testing caught and fixed context-budget overflow, a model answering from
  general knowledge, broad short-word matching in metadata discovery, and loss of
  current-section metadata during tool selection. Generic discovery is now a
  server step; ungrounded model prose is neither streamed nor persisted. The
  exact existing overview/summary command retains its authorized direct route;
  a named alternative record cannot match that anchored command shape.
- Remote CI at `23b8069fd` reports OpenAPI contract failures. No green release
  claim is made. Code tests and active heads do not prove model/browser behavior.

DEV changes were merged against the previous feature commit to preserve unrelated
workspace changes. API/worker restart was performed only with no inference lease
owner. Draft preparation granted no authority; activation used the independent
control workflow and authenticated publication workloads.

## Remaining qualification

Country publication, workspace lookup and the Neon cross-record journey are
qualified. Loaded Business Partner page qualification requires its backend
authorization deployment to be restored or onboarded correctly. Studio/Mesh
positive browser journeys remain separate checks. Unit/integration tests cover
revocation, ambiguity, denied fields, stale metadata, caller isolation and
ungrounded model responses; they do not replace live negative-policy journeys. Declare and
publish the real Business Partner relationships before enabling relative
country/address traversal; never guess a default address.
