# DEV publication assessment v1

## Implemented boundary

This slice is a pure **assessment**, not automated release authorization. It has no
database, environment lookup, secret access, signing, role assignment or activation
port. It does not alter the BP authenticated review implementation or its evidence.

Public APIs:

- `parseDevPublicationPolicy` and `parseDevPublicationTarget` in publication contracts.
- `parseDevPublicationAssessment` in publication contracts.
- `classifyDevPublicationChange` in the publication service.

Files are separated by ownership:

| Path under `server/packages/` | Owns |
| --- | --- |
| `contracts/publication/src/policy/dev-publication-policy.ts` | Exact versioned configuration and target parsing |
| `contracts/publication/src/evidence/dev-publication-decision.ts` | Non-authoritative machine assessment shape |
| `services/publication/src/shared/policy/classify-change.ts` | Pure structural comparison and assessment hashes |

The evidence filename follows the planned ownership location, but the exported type
is deliberately `DevPublicationAssessment`. No activation-bearing decision schema
is introduced in this slice. A future authorization contract must remain distinct
and cannot reinterpret `authority: "none"` as release approval.

## Policy input

```json
{
  "schema": "athyper.dev-publication-policy/1",
  "mode": "assessment_only",
  "environment": "dev",
  "policyId": "reference.presentation",
  "revision": 1,
  "targets": [
    {
      "tenantId": "11111111-1111-4111-8111-111111111111",
      "plane": "neon",
      "entityCode": "reference_example"
    }
  ],
  "allowedChanges": ["labels", "page_size", "default_sort", "visible_column_order"],
  "maxLabelLength": 80
}
```

The UUID is an example, not a real target assignment. Policy permits 1–1000 unique
exact target coordinates, unique known change kinds, positive integer revisions,
and label limits from 1 to 256. Unknown keys/versions, wildcard coordinates, non-DEV
environment and authority-bearing modes are rejected. Policy parsing does not
prove that the policy was approved or that the deployment actually belongs to DEV.

## Comparison contract

The classifier accepts complete JSON baseline/candidate MetaEntity graphs, policy,
target, initiating principal UUID, assessor UUID and a caller-supplied canonical UTC
timestamp. It copies inputs; it does not mutate supplied graphs. It is synchronous
and deterministic for the same inputs. No clock or credentials are read.

Both graphs must use `athyper.meta-entity-contract/2.1`, match the requested entity,
and pass the existing common-reference structural validator for the target plane.
The requested tenant/plane/entity tuple must be in the policy. A missing baseline
requires review; first-release onboarding templates are not implemented here.

The algorithm records full JSON-pointer differences, then neutralizes **only**
the explicitly permitted, structurally validated presentation differences in its
private candidate copy. The entire remaining graph must equal the baseline.

| Change class | Allowed shape |
| --- | --- |
| labels | Existing field labels, surface titles and field-binding label overrides; stable row identity/order; bounded nonempty plain text without control characters or angle/curly brackets |
| page_size | Existing list default page size changes within the baseline's unchanged positive integer choices, bounded at 1000 |
| default_sort | Existing nonempty list sort; unique fields explicitly allowed by baseline field-policy sort use; asc/desc only; baseline max-sort limit respected |
| visible_column_order | Permutation of existing unique nonnegative positions for the same explicitly visible list bindings; no binding addition/removal or visibility changes |

No query expressions, storage changes, field exposure, new operations, permissions,
scope expansion, capability edits, dependency changes, deletions or unknown changed
paths are exempted from full comparison. A valid label change cannot hide another
change. Absent optional label properties are not silently added by the label rule.

## Outcomes

- `eligible`: supplied inputs satisfy this structural comparison, including an
  unchanged valid reference graph. It does **not** mean publishable or authorized.
- `review_required`: baseline absent, target unenrolled/mismatched, reference shape
  unsupported, presentation invalid, or some change remains unclassified.
- Malformed policy, non-JSON values, invalid context/evidence syntax or excessive
  JSON nesting throws. Consumers must not catch these errors and permit publication.

The assessment includes exact policy ID/revision, policy/baseline/candidate hashes,
target, initiating principal and machine assessor IDs, timestamp, reason codes and
changed paths. `authority` is always `none`; no signature, approval, validity period
or publish command is accepted by its strict parser.

Hashes use the explicitly named `dev-assessment-json/1` scheme: SHA-256 of compact
JSON with recursively sorted object keys and preserved array order. Nonfinite
numbers, undefined values, executable/non-JSON objects, unsafe object keys and
depth over 64 are rejected. This scheme identifies assessment inputs; it does not
replace compiler or historical release hashes. No release hash was rewritten.

Parsing a receipt checks shape and internal outcome consistency only. It does not
authenticate its issuer, verify the supplied timestamp, recompute hashes against
external records, establish expiry, or validate current reviewer/publisher authority.
The policy hash binds configuration content, not its approval provenance.

## Required future authorization boundary

Before any assessment is used to authorize a release, a separate trusted evaluator
must load the approved policy/template and current persisted baseline, run full graph
compilation and qualification, verify initiating authority and target enrollment,
bind assessment hashes to actual release content, and create independently verified
authorization evidence with current/expiry/revocation checks. Activation must recheck
baseline correspondence to prevent stale assessments racing a newer release.

Separate DEV keys and verifier trust, receipt persistence, schema admission, runtime
qualification, policy approvals, role grants and signing/activation remain future
work. No host registration was added. Do not route this result into a boolean
`approved` field or existing BP review packet.

The subsequent [signing trust implementation](publication-trust-separation.md)
adds a strict resolver/configuration path; live keys and provider ACLs still require
provisioning and verification. It does not connect assessments to activation.

## Verification

New contract tests cover strict schema versions, non-authoritative mode, exact
coordinates, invalid/duplicate classes, immutable output and malformed receipts.
Classifier tests cover presentation cases, full-graph collateral changes, disclosure,
permissions, scopes, storage, scanner/audience policy, invalid sorts/paging, unknown
branches, missing baselines, target mismatch and deterministic input hashing.

AST tests allow only the explicit contract imports and `node:crypto` for the pure
classifier, one relative policy import for evidence, and no imports for policy.
They reject dynamic import/require bypasses, selected side-effect globals, and
Country/Currency/BP string branches. They enforce specified boundaries; they are
not proof against every possible semantic regression.

An offline smoke check against the actual Country source graph returned `eligible`
and `authority: none` for a title edit in Studio, Neon and Mesh, using synthetic
assessment identities. This was not a live tenant authorization check.

No DEV database, deployment, signing key, permission grant or activation head was
changed. Country remains unpublished and is not ready for manual acceptance.

### Fresh checkpoint — 2026-09-26

| Package | Typecheck | Tests |
| --- | --- | --- |
| Publication contracts | Pass (source and tests) | 102 passed / 7 files |
| Publication service | Pass (source and tests) | 301 passed / 35 files |
| Studio authoring | Pass (source and tests) | 143 passed / 36 files |
| Platform host | Existing single preflight repository import error | 532 passed, 25 skipped / 73 files passed, 3 skipped |

The unchanged host diagnostic is `entity-case-preflight.ts` importing the removed
`KyselyBusinessPartnerCaseRepository`; this slice does not resolve or weaken its
governance gate. Integration opt-ins remain skipped, not certified by these results.
