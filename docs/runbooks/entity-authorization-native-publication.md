# Native entity authorization publication

Status: native compiler and receiving-runtime compatibility integration implemented;
BP production handler/resolver journey qualification is **not complete**. No grants,
activation heads, or rollout selections were changed by this implementation.

## Implemented path

`compileGraph` validates and preserves an optional `authorizationRuntime` alongside
the authorization profile. Its strict version 1 contract requires exactly one
binding for every operation, a versioned handler, the exact ownership resolver,
and a versioned preflight reference exactly when the operation requires preflight.
Unknown properties, duplicate operations, and missing references are rejected.
Existing descriptors without this extension retain their current behavior.

`KyselyPublicationAuthorityWork` recognizes this extension during native entity
release compilation. It requires a trusted `authorizationCompilation` dependency
with an exact permission catalog and callable runtime registry. It derives operation
IDs from the authored contract and calls `compileEntityAuthorizationPublication`.
Missing configuration closes compilation; source-file anchors are not consulted.
The host passes the same runtime registry to the receiving artifact loader.

The compiler requires a **complete native runtime descriptor and authored contract**.
The review packet is still not accepted as this input. Studio graph-shaped artifacts
also need a complete runtime descriptor lowering before this path can accept them;
copying graph branches into a runtime descriptor does not satisfy that requirement.
The compiler:

- Verifies entity, plane, tenant/release identifiers, full descriptor hydration,
  authored operation identities, and exact profile/runtime agreement.
- Resolves canonical permission IDs and exact scope compatibility. Missing catalog
  entries and organization-versus-tenant differences fail without widening grants.
- Regenerates deterministic operation/scope IDs and source coordinates for the
  selected release, preserving tenant-owned publication coordinates.
- Signs the contract and standard `entity_runtime` artifact using Ed25519 through
  the existing signing port. The publication worker retains its existing outer
  signing, immutable storage, dispatch, and activation lifecycle.

`VerifiedPublicationArtifactLoader` verifies the artifact, contract, and descriptor
hashes and signatures, then requires the receiving runtime to support every exact
handler/resolver/preflight binding before staging. Metadata hydration retains the
validated runtime binding contract. Explicit rollout qualification remains separate;
loading or publishing metadata does not switch enforcement on.

The legacy global seed projection compiler remains global-only. Rollback compilation
of new authorization artifacts is closed here: use the compatible-artifact rollback
process after its grant/revocation checks, not a new unchecked compilation.

## What a callable registry establishes

`createEntityAuthorizationRuntimeRegistry` accepts function references from trusted
service composition and pins each registration's entity, plane, operation semantics,
handler version, resolver version, and preflight version. It rejects missing functions
and duplicate or mismatched registrations. Registration does not execute commands.

This proves callable availability and semantic compatibility. It does **not** prove
that the registered resolver reads the correct database ownership, that a workflow
is deployed, or that a current authenticated principal can execute a command.
Do not label a registry check as authenticated qualification. Do not register the
advisory BP shadow resolver as an execution/preflight implementation.

## Remaining BP delivery gates

1. Lower the complete selected BP authoring release to its native runtime descriptor,
   including reviewed operation variants. Certification still has no implemented
   request kind; a descriptive variant cannot become an executable handler.
2. Supply the host's `entityAuthorizationPublication` dependency from the actual
   owning service handlers, stored ownership/selection adapters and command workflow
   preflight implementations, with the selected plane's current permission catalog.
3. Execute authenticated database-backed read, provider, reveal, command, transfer
   and AI journeys. Include missing/cross-tenant ownership, incompatible organization
   and company, revoked access, workflow prerequisites, and independent-child access.
4. Retain catalog/scope and semantic review blockers from the DEV publication report.
   Obtain the named-role review before grant changes or enforcement activation.
5. Produce compatible artifacts, qualification evidence, and a revocation-preserving
   rollback record before activation. Retire compatibility only after parity.

## Local evidence

The compiler suite uses a deliberately synthetic reviewed catalog with actual
Ed25519 signatures and the real verified loader. It tests deterministic native
artifacts, new release identities, transport/payload tampering, missing receiving
registrations, missing permissions, scope widening rejection, authored-ID mismatch,
preflight requirements, and exact runtime semantics. It performs no publication or
grant writes. Existing publication, Studio authoring, and metadata hydration suites
are also run. These tests are engineering evidence, not a publishable BP release.

```sh
pnpm --filter @athyper/server-service-publication test
pnpm --filter @athyper/server-plane-studio-meta-entity-authoring test
pnpm --filter @athyper/server-platform-metadata test
pnpm --filter @athyper/server-service-publication typecheck
pnpm --filter @athyper/server-plane-studio-meta-entity-authoring typecheck
pnpm --filter @athyper/server-platform-metadata typecheck
pnpm --filter @athyper/server-platform-host typecheck
```

## Operation review and native signing gate

The [operation review packet](../reviews/business-partner-operation-reviews.dev.md)
now classifies all 51 operations and identifies the 36 policy reviews, with exact
permissions, catalog scopes, scope bindings, ownership resolvers, handler variants
and workflow requirements. Three deferrals are proposed: certification, direct
create and direct update. No deferral or capability expansion has been approved
or applied; legacy enforcement remains unchanged.

The native compiler now requires a trusted publication-review adapter before
signing authorization artifacts. The worker forwards this adapter from composition.
The adapter must read verified immutable review evidence and revalidate reviewer
authority. `createEntityAuthorizationPublicationReview` checks exact tenant/plane,
release, contract, profile, runtime, catalog and operation selection; both reviewer
domains; expiry; explicit approved/deferred dispositions; and regression hashes.
The signed manifest binds its review receipt hash. Missing or stale evidence fails
closed. Catalog and authored operation IDs are copied before asynchronous review.

This is local compiler engineering, not a deployment or a DEV acceptance receipt.
The real authenticated operation-review evidence reader still needs integration;
the 79 membership approvals cannot be reused as operation/capability approvals.
Actual owning-service registrations, complete native lowering and authenticated
journeys remain open. A deferred operation must be absent from the executable
profile/descriptor and all dependent field/UI references, and target direct APIs
must return unavailable. The compiler gate alone does not implement those endpoint
changes. No signed BP release was generated and no publication head changed.

## Operation reviewer nomination

The user explicitly authorized `catl.owner` and `catl.admin` to review operation
semantics and permission/scope proposals in both business and security domains.
The [nomination](../../governance/policy/reviews/business-partner-operation-reviewers.dev.json)
records their exact principal and home-tenant IDs, the CirrusAtlantic NEON BP
publication coordinate, and normal MFA/revision-bound review requirements. The
operation packet pins the nomination hash. This is review authority only: all
operation decisions remain pending and no capability/grant/activation decision
was inferred. The operation-review evidence reader and UI remain engineering work;
this nomination does not make the existing membership-review UI an operation
approval endpoint. Packet regeneration refuses to overwrite recorded decisions.

The [operation proposal decisions](../../governance/policy/reports/business-partner-operation-decisions.dev.json)
now have both MFA-authenticated reviewer confirmations for all 51 proposals, with
zero unresolved proposal decisions. This supersedes the earlier pending proposal
status. The accepted include/deferral choices are implementation inputs; catalog
creation, callable runtime registration, native release-coordinate review and
qualification remain unexecuted. No signed BP artifact or grant change is implied.

Accepted proposal implementation now has a deterministic, native-parser-validated
[selection generator](business-partner-accepted-operations.md). It prepares 27
ungranted permission definitions, retains 15 bindings and encodes nine explicit
deferrals. The target descriptor disables legacy bulk mutation modes because they
depend on deferred create/update. The included import gateway therefore has no
executable mutation mode until a compatible proposal is reviewed. This dependency,
missing catalog IDs, callable runtime qualification and same-release evidence
remain explicit gates; the generated selection is not a signed publication.

## Existing-case runtime registration correction

Seven owning case-service runtime registrations and a default read-only native
publication catalog adapter are now implemented in host composition. The owning
semantics check found five proposed-resource bindings that actually require an
existing case: update, validate, submit, decide and materialize. The compiler
composition rejects that mismatch, including when a custom registry is supplied.
The [correction review](../reviews/business-partner-case-runtime-correction.md)
preserves original approvals and prepares an explicit five-row revision. Other BP
handlers/preflights, correction/import approval and same-signed-release evidence
remain required. Missing registrations are not filled with placeholder callables.
