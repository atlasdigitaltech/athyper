# Authenticated local graph preview — 12 September 2026

The shared DEV Studio → native compile → local activation → NEON presentation loop
passed using the existing Cirrus `catl.admin` identity. Studio MFA remained elevated;
NEON signed in through the normal IAM SSO flow. This is development evidence, not QA
release qualification.

The final browser run measured **1,027 ms** from saving the graph through Studio to
observing the updated NEON descriptor. The changed title also rendered at
`https://neon.dev.athyper.test/mdg/business-partner/manage`.

Verified boundaries:

- A missing storage-column reference failed compilation while retaining the previous
  active revision and its NEON presentation.
- Restoring the valid graph activated the next revision.
- Simultaneous saves with the same expected revision returned one `200` and one `409`.
- The author could not publish (`403`).
- Studio displayed matching saved/active revision **19**, change set
  `be767e01-f36d-434f-91f3-67bff689a367`.
- Separate integration tests rejected wrong-company access, revoked grants, missing
  catalog/storage dependencies and unsupported policy projection. These are automated
  integration tests; they are not authenticated BP ownership journeys.

Final graph contract hash:
`49639867397cb0adf8fcc914e1fd9d7c4fc89028c0bc2a8b617d8bd8d74e1f60`.
Private browser receipt and screenshot:
`~/.athyper/qualification/dev-graph-preview/journey-1789177765185.json`
and the adjacent `.neon.png`. The receipt identifies the source commit, relevant
working-tree source hashes, identities, checks and final preview state.

Implementation corrections found by the live run:

- Registered the graph editor in Studio navigation with `metadata.entity.author`.
- Gave the large JSON editor an explicit scrollable layout.
- Preserved positional contract-test targets when native rows reload in UUID order;
  assertions still fail when their target values change. Candidate import uses the
  same normalization for exact readback comparison.
- Reused the author's existing local working draft rather than colliding with the
  one-open-branch database constraint. Another author's draft is not overwritten.
- Translated native stale-revision errors into HTTP `409`.

Eight targeted integration/import/storage-order tests passed. Authoring and Studio
shell TypeScript checks passed. Run the repeatable proof with
`pnpm test:local-graph-browser` after obtaining valid sessions and scoped grants.

The explicitly approved temporary permissions expire at approximately **11:30 MYT**:
Studio author/validate/test, and NEON `neon.relationship.bp_target.read`, each limited
to Cirrus. Historical expired grants and release approvals were preserved.

## Limits and remaining work

The NEON title/descriptor update is proven. The narrow read grant does not qualify
list data, providers or BP command journeys; the data section still reports
unavailable. No additional permissions were granted to hide that result.

Arbitrary policy/lifecycle/numbering/storage changes, the full authenticated BP
ownership/import/approval matrix, exact successor candidate QA qualification and
staging promotion remain separate outstanding work. Staging is not available.
The local working draft remains active and visible in Studio; no release was published.
