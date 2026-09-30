# Business Partner collaboration release candidate

> **Historical.** Written before commit `870f08f52` removed the bespoke Business Partner and workforce applications. Routes, packages and files named here may no longer exist, and de-linked paths were dead when this was cleaned up. New entity work goes through the shared Entity Framework ([onboarding guide](../../runbooks/meta-entity-onboarding.md)); do not treat this as current instruction.

Status: proposed source boundary, pending implementation completion and immutable freeze.

This candidate is the agreed dependency-complete DEV release boundary. It does
not replace the already signed and active native Business Partner intake release.
It defines the separate compiled package that may be signed only after every item
in this document is complete.

## Included scope

| Slice | Included capability | Source owner |
| --- | --- | --- |
| Native intake prerequisite | Retain the active signed `request_intake` release and its registered Business Partner provider. Do not republish it as part of this candidate. | `server/apps/platform-host`, `server/packages/platform/experience`, `server/packages/services/master-data` |
| BP2-01 | Shared-reference Core authoring input, bounded lookup route and historical-display resolution. | `metadata/products/mdg/entities`, `server/packages/services/records`, `server/packages/services/master-data` |
| Comments | CA-01–CA-08 collaboration metadata, services, reader, shared surface, draft retention, mention/history admission and grouped reply presentation. | `server/packages/contracts/collaboration`, `server/packages/platform/collaboration`, `server/packages/platform/experience`, `packages/platform/communications`, `packages/platform/entity/runtime` |
| Attachments | CA-01–CA-08 metadata, lifecycle, storage/scan admission, shared reader and file-management surface. | `server/packages/contracts/attachments`, `server/packages/services/attachments`, `server/packages/platform/experience`, `packages/platform/entity/runtime` |
| Shared publication/schema | Capability authoring, compiler/release closure, relay bindings and direct canonical DDL already applicable to included features. | `server/packages/contracts/publication`, `server/packages/services/publication`, `server/db/ddl`, `apps/neon`, `apps/mesh`, `apps/studio` |

## Explicit deferrals

- CA-09 image/PDF derivatives, preview, extraction and record-scoped search. The
  preview-renderer provider is unqualified; the existing Gotenberg container
  remains restricted to its HTML-to-PDF role.
- BP2-02 through BP2-17, including their consumers, handlers, evaluators and
  flows.
- New outbound notification providers and AI extensions.

The candidate must expose an explicit unsupported/unavailable state for every
deferred capability. It carries forward only the immutable, already-active
Business Partner baseline artifacts needed to preserve current behavior; the
release gate distinguishes those retained provider references from newly
introduced capability handlers.

## Remaining work before freeze

1. [x] Complete CA-04 cancellation/disconnect, stage-expiry, late-processing,
   queue-replay, concurrent-finalization/version and policy-change regressions.
2. [x] Run the CA-07 grouped root/reply presentation through the browser component
   journey. The source implementation and its shared reader admission checks are
   complete. Authenticated published-release acceptance remains after activation.
3. [x] Add a baseline-pinned scoped compilation/validation input. The candidate
   is `metadata/products/mdg/review/release-candidates/business-partner-collaboration-ca08.json`
   and pins local Neon compiled Business Partner release 9. The existing
   `business_partner/release.json` remains the broad unsigned 113-artifact review
   envelope; it is not silently edited into a partial release.
4. [x] Record the exact replacement boundary and derive qualification deltas from
   compiler output. The source closure is 25 artifacts; the release carries 89
   unchanged baseline artifacts, replaces Core, Operation and both collaboration
   sections, and adds the BP2-01 `state_region` and `timezone` Cores. The final
   runtime set has 95 artifacts, 41 permissions and 129 provider references, of
   which only two permissions and fourteen handlers are new qualification work.
5. Run fresh disposable schema/seed tests, then source/runtime tests and the
   final local acceptance journey for included functionality.
6. Create one dedicated integration commit containing only the frozen candidate
   files. `candidate:freeze` refuses a dirty checkout and binds its source
   revision to built images.
7. Generate/sign the resulting envelope, pass scoped release-ready validation,
   publish through the existing DEV authority, and retain matching Studio and
   Neon activation receipts.

## Freeze acceptance

The source freeze may happen only when the candidate artifact list, compiled
hashes, provider/permission evidence, DDL inventory, runtime image revision and
test results all describe the same commit. The live DEV databases are not reset;
any required additive upgrade follows the existing data-preserving release
process and receives preflight/post-apply receipts.

The [CA-10 local acceptance record](entity-comments-and-attachments-ca10-local-acceptance.md)
contains current passing source/disposable checks and the exact remaining
publication blockers.

## Scoped compilation and readiness commands

```sh
pnpm exec tsx tooling/scripts/metadata/compile-release-candidate.mts \
  --candidate metadata/products/mdg/review/release-candidates/business-partner-collaboration-ca08.json
python3 tooling/scripts/metadata/validate.py \
  --release-candidate metadata/products/mdg/review/release-candidates/business-partner-collaboration-ca08.json \
  --release-ready
```

The compiler is deterministic and does not write source, sign or activate. An
optional `--output <directory>` writes the frozen 95-artifact compilation review
set. The publication projection upgrades the immutable output, rather than the
draft authoring input, to `published`. The local qualification record admits the
two new permissions and fourteen new handlers, and records current-runtime
compatibility. `--release-ready` now stops only at the intentional final boundary:
the release has not yet been approved or signed. Existing BP relationship,
workflow and document-render providers are retained from the pinned active
baseline, not misclassified as new candidate work.

The local publisher accepts that frozen output through `--candidate-output`; it
does not recompile the broad authoring tree. A read-only plan against the local
Studio and Neon databases completed on 2026-09-21, retaining source definition
release `cf773137-0b77-48ca-89ca-3d3c24c67933` and planning compiled runtime
release 10 with 95 artifacts and hash
`sha256:e93c48cb1e2d66d1a063d0043bb2cb4ec7f6b1d4d9bb12324414f2d653b58c85`.
It is planning evidence only: it created no publication, deployment, signature,
or activation receipt.
