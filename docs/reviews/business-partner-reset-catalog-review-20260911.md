# BP reset catalog review

Status: proposals prepared; Studio rollback rehearsal passed; installation and approval pending.

The intentional reset removed the catalog dependencies required to author the BP successor. This packet separates catalog restoration from grants, release approval and activation. The six Studio definitions below are a new proposal with explicit conditions, not an assertion that archived seed defaults were approved for restoration.

## Studio definitions

Proposal: `governance/policy/reviews/business-partner-reset-studio-catalog.proposal.dev.json`.

Revision: `4660931d7ff9567c4c729712a30c1b97e40250382b1b8ef92d42228eadc9eb5f`.

Database: shared DEV `athyper_studio`. All six definitions are capabilities in module `meta`, exact tenant scope, require MFA, and prohibit sharing, delegation and override. No role permissions or principal assignments are included.

| Permission               | Risk     | Separation of duties       |
| ------------------------ | -------- | -------------------------- |
| metadata.entity.author   | Medium   | Existing workflow controls |
| metadata.entity.validate | Medium   | Existing workflow controls |
| metadata.entity.test     | Medium   | Existing workflow controls |
| metadata.entity.submit   | Medium   | Existing workflow controls |
| metadata.entity.review   | High     | Required                   |
| metadata.entity.publish  | Critical | Required                   |

The definitions authorize nobody by themselves. Subsequent named assignments need a separate exact proposal with current validity dates. Existing revoked assignments must not be reinstated.

`dry-run-business-partner-reset-studio-catalog.mjs` executed the proposed inserts and scope compatibility in a rollback-only transaction against Studio. It rejected conflicting existing definitions, verified all six MFA/exact-tenant definitions and zero role assignments, then verified the unchanged authority fingerprint. It has no apply option. Evidence: `governance/policy/reports/business-partner-reset-studio-catalog.dry-run.dev.json`.

## Two BP source constraints

The existing proposal remains unchanged: `governance/policy/reviews/business-partner-source-constraints.proposal.dev.json`, file SHA-256 `35fe66a6512c0feab21ce488c4bd9f38e8999088da17a825d4df97a484aebaf8`.

Exact definitions: `collaboration.comment.read` and `document.attachment.read`; `fnd` capabilities, exact resource scope, low risk, no MFA or separation-of-duties requirement, no sharing/delegation/override. They are not aliases. Installation is proposed for the isolated clone and successor authoring only, with a fresh conflict/authority check before execution.

These two definitions can make an existing target-authorized read change from unavailable to allowed when its source constraints become evaluable. Current source denials, target permissions and resource checks still apply. This access effect is why explicit review is necessary despite zero grant mutations.

## Decision boundary

Approval of this packet authorizes only these catalog definitions at the specified destinations. It does not approve assignments, BP publication, signing of a changed release, enforcement activation or acceptance of any of the 66 policy dispositions.

After catalog installation, the remaining sequence is fresh assignment proposal, native successor authoring/review/signing, exact-release ownership/field and recovery journeys, then evidence-bound disposition acceptance. No phase-closure claim is made by this packet.
