# V1 manual assistive-technology review

Use this checklist to complete the remaining local V1 accessibility item. The
review must be performed by a named human using a real screen reader. Automated
axe, keyboard, zoom, and viewport results supplement this review and cannot sign
the attestation.

The target is `https://neon.dev.athyper.test`. Use the provisioned V1 requester,
approver, and materializer accounts. Do not copy credentials, authenticator
seeds, protected payloads, or authorization data into the review receipt.

## Before the review

1. Copy
   `governance/evidence/business-partner/local/2026-09-06/cirrusatlantic-v1-manual-accessibility-review.draft.json`
   to the same path without `.draft`.
2. Record the reviewer's name and role, the actual screen reader and version,
   the browser and version, and UTC start time.
3. Set the browser viewport to `1440x900` at 100% zoom. Enable the screen reader
   before signing in.

## Journey

1. As the requester, open **Create**, navigate the New supplier onboarding
   request entirely by keyboard, and inspect headings, landmarks, instructions,
   labels, required state, values, and validation errors with the screen reader.
2. Create the internal/intercompany Supplier draft, validate it, and submit it.
   Confirm the validation result and Pending Approval state are announced or
   readily discoverable.
3. As the approver, open **Workflow** and review the definition, work item,
   owner, status, and version. Open **Approve** with the keyboard. Trigger the
   missing-reason error, close with Escape, confirm focus restoration, reopen,
   and complete the reason.
4. Exercise **Verify with MFA**. Confirm the authenticator prompt, any error,
   successful return, and restored approval context are understandable. Approve
   the request and confirm the Approved state is discoverable.
5. As the materializer, create the Business Partner and confirm the Applied
   state. In **Result**, review coordinates, snapshot summary, lineage, and the
   bounded-evidence explanation before opening the partner.
6. On Business Partner 360, inspect identity and role lens, then navigate
   **Roles & scope** and **Procurement & AP**. Confirm Supplier role and Accounts
   payable configuration content has meaningful structure and reading order.
7. Repeat the relevant screens at 200% zoom. Repeat the final record checks at
   `412x915`. Record any hidden controls, clipped focus, reading-order issues, or
   two-dimensional content scrolling.

For every check, set `result` to `passed` or `failed` and write concrete notes.
After all failures have been fixed and retested, record the UTC completion time,
set `status` to `passed`, and set `reviewAttestation.accepted` to `true`. Keep
the receipt at:

`governance/evidence/business-partner/local/2026-09-06/cirrusatlantic-v1-manual-accessibility-review.json`

Do not mark the review passed when a check is pending or when reviewer, screen
reader, browser, timestamps, notes, or attestation are missing.
