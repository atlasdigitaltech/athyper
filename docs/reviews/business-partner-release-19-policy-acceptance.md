# Release 19 policy acceptance proposal

Revision: `1b85b834ee0c8016a312a7f635388771ffbcf9d2f063e867174fe7123430b0c4`.

[Exact row-level packet](../../governance/policy/reviews/business-partner-release-19-differences.proposal.dev.json)
contains the included row IDs, source hashes, regression hashes, current traces,
persona references and unchanged grant snapshot references.

The user explicitly accepted this revision in the conversation.

[Acceptance receipt](../../governance/policy/reviews/business-partner-release-19-differences.acceptance.dev.json)
and [validated result](../../governance/policy/reports/business-partner-release-19-difference-acceptance.dev.json)
record 66 accepted dispositions and zero unresolved reviewed dispositions. The
receipt identifies the conversation user; it does not impersonate catl.owner or
catl.admin, or claim an MFA-authenticated account approval.

The accepted decisions are:

1. Accept the two synthetic semantics: organization directory access does not
   imply tenant-wide record read; the hypothetical unprovisioned requester may
   receive context_required during discovery and must reauthorize the selected scope.
2. Preserve all 27 historical live aggregates, explicitly acknowledging that their
   original per-event causes cannot be reconstructed. Replace their use as current
   evidence with the linked release-19 captures; do not label the historical causes proven.
3. Accept the 37 individually listed current discovery difference groups: dedicated
   permission denials, parent-read prerequisites, context admission, ownership
   validation and reviewed deferrals, under unchanged effective grants.

Evidence: 69 authenticated checks across catl.admin and catl.owner; 1,686 correlated
observations; zero mapping gaps and zero unexpected unavailable observations.
Deferrals remain explicitly unavailable. No old/new allow results are combined.

This acceptance does not authorize grants,
activation, or assert command execution parity. Command/import/export/AI/revocation
qualification against the signed release remains a separate engineering gate.
